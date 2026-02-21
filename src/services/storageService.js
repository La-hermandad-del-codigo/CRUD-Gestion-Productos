/**
 * storageService.js
 *
 * Capa de datos asíncrona que simula una API real usando localStorage.
 *
 * CONCEPTOS DEMOSTRADOS:
 * ─────────────────────
 * 1. async/await      — Todas las funciones públicas son async para que el
 *                       llamador pueda encadenarlas con await o manejarlas con
 *                       .then()/.catch() sin diferenciar la fuente real de los
 *                       datos (localStorage, fetch, IndexedDB, etc.).
 *
 * 2. Simulación de latencia — simulateLatency() introduce un retraso de 200–500 ms
 *                       con setTimeout envuelto en una Promise. Esto reproduce el
 *                       comportamiento de una red real y permite testear estados de
 *                       carga en la UI.
 *
 * 3. Fallos aleatorios — ~10 % de probabilidad de fallo aleatorio permite
 *                       ejercitar rutas de error sin necesitar un servidor real.
 *
 * 4. forceFailure     — Flag mutable que sube la tasa de fallos al 100 % para
 *                       demostraciones en vivo. Se activa / desactiva con
 *                       setForceFailure() desde App.jsx.
 */

const STORAGE_KEY = 'crud_productos';
const CATEGORIES_KEY = 'crud_categorias';

// ─── Modo de error forzado ─────────────────────────────────────────────────────
//
// Por qué un módulo-level flag y no un parámetro por función:
//   • Centraliza el switch en un solo lugar.
//   • Cualquier llamada en vuelo (paralela o secuencial) queda afectada
//     de inmediato sin necesidad de modificar el call site.

/** Cuando es true, TODAS las operaciones async lanzan error inmediatamente (100 %). */
let forceFailure = false;

/**
 * Activa o desactiva el modo de fallo forzado.
 * Llamado desde App.jsx al pulsar "Forzar Error".
 * @param {boolean} value
 */
export function setForceFailure(value) {
    forceFailure = Boolean(value);
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Devuelve una Promise que resuelve tras un retraso aleatorio de 200–500 ms.
 *
 * Por qué async/await aquí:
 *   Se envuelve setTimeout (callback-based) en una Promise para que cualquier
 *   función que use simulateLatency() pueda hacer simplemente `await simulateLatency()`.
 *   Esto convierte la API asíncrona de callbacks en una compatible con async/await.
 */
function simulateLatency() {
    const delay = Math.floor(Math.random() * 300) + 200;
    return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Patrón "wrapper" que aplica latencia + posible fallo a cualquier operación síncrona.
 *
 * Uso de async/await:
 *   `await simulateLatency()` pausa la ejecución sin bloquear el hilo principal.
 *   La función operation() es síncrona (acceso directo a localStorage), por lo que
 *   no necesita await — se envuelve automáticamente en la Promise resuelta.
 *
 * Manejo de errores:
 *   En lugar de try/catch aquí, el error se PROPAGA hacia arriba con throw.
 *   Esto respeta el patrón "fail fast": quien llama a withSimulation decide
 *   si capturar el error o dejarlo subir (e.g., withLoading en useProducts.js).
 *
 * @param {Function} operation  Función síncrona que devuelve el valor resuelto.
 * @returns {Promise<*>}
 */
async function withSimulation(operation) {
    // Fallo forzado: sin latencia, simplemente lanza. Útil para demos en vivo.
    if (forceFailure) {
        throw new Error('🔴 Error forzado activo: todas las operaciones fallan durante el modo de prueba.');
    }

    // async/await: pausa aquí hasta que expira el timer simulado
    await simulateLatency();

    // ~10 % de fallo aleatorio — simula errores de red intermitentes
    if (Math.random() < 0.1) {
        throw new Error('Error de red simulado: la operación falló. Inténtalo de nuevo.');
    }

    // Si no hubo fallo, ejecutamos la lógica real (siempre síncrona sobre localStorage)
    return operation();
}

/**
 * Lee la lista completa de productos desde localStorage.
 * NUNCA lanza — si el parse falla devuelve [] para que la app siga funcionando.
 */
function readFromStorage() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

/** Persiste la lista completa de productos en localStorage. NUNCA lanza. */
function writeToStorage(products) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

/** Genera un UUID v4 compatible con entornos modernos y fallback manual. */
function generateId() {
    return crypto.randomUUID
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
}

// ─── API pública ───────────────────────────────────────────────────────────────
//
// Todas las funciones son `async` por contrato.
// Aunque la operación interna es síncrona (localStorage), exponer una API
// async permite:
//   a) Cambiar la implementación a fetch/IndexedDB sin tocar los llamadores.
//   b) Usar await en useProducts.js de forma uniforme.
//   c) Encadenar con Promise.all / Promise.allSettled sin casos especiales.

/**
 * Obtiene todos los productos.
 * @returns {Promise<Product[]>}
 */
export async function getProducts() {
    // withSimulation → await simulateLatency + posible throw → luego readFromStorage()
    return withSimulation(() => readFromStorage());
}

/**
 * Sobreescribe la lista completa de productos.
 * @param {Product[]} products
 * @returns {Promise<Product[]>}
 */
export async function saveProducts(products) {
    return withSimulation(() => {
        writeToStorage(products);
        return products;
    });
}

/**
 * Añade un nuevo producto (asigna UUID generado aquí).
 * @param {Omit<Product, 'id'>} productData
 * @returns {Promise<Product>}
 */
export async function addProduct(productData) {
    return withSimulation(() => {
        const products = readFromStorage();
        const newProduct = { ...productData, id: generateId() };
        writeToStorage([...products, newProduct]);
        return newProduct;
    });
}

/**
 * Actualiza un producto existente por id.
 *
 * Por qué lanza si no se encuentra:
 *   El llamador (editProduct en useProducts.js) necesita saber si el update
 *   tuvo éxito para aplicar o revertir el optimistic update. Un rechazo
 *   explícito es más seguro que devolver null silenciosamente.
 *
 * @param {string} id
 * @param {Partial<Product>} updates
 * @returns {Promise<Product>}
 */
export async function updateProduct(id, updates) {
    return withSimulation(() => {
        const products = readFromStorage();
        const index = products.findIndex((p) => p.id === id);

        if (index === -1) {
            throw new Error(`Producto con id "${id}" no encontrado.`);
        }

        const updated = { ...products[index], ...updates };
        products[index] = updated;
        writeToStorage(products);
        return updated;
    });
}

/**
 * Elimina un producto por id (usado internamente para soft delete vía updateProduct).
 * @param {string} id
 * @returns {Promise<string>} Resuelve con el id eliminado.
 */
export async function deleteProduct(id) {
    return withSimulation(() => {
        const products = readFromStorage();
        const filtered = products.filter((p) => p.id !== id);

        if (filtered.length === products.length) {
            throw new Error(`Producto con id "${id}" no encontrado.`);
        }

        writeToStorage(filtered);
        return id;
    });
}

const DEFAULT_CATEGORIES = [
    'Electrónica',
    'Ropa',
    'Alimentos',
    'Hogar',
    'Deportes',
    'Juguetes',
    'Libros',
    'Otros',
];

/**
 * Obtiene las categorías disponibles desde localStorage.
 * Siembra los valores por defecto si aún no existen.
 * @returns {Promise<string[]>}
 */
export async function getCategories() {
    return withSimulation(() => {
        try {
            const raw = localStorage.getItem(CATEGORIES_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
            // Primera ejecución: persiste los defaults
            localStorage.setItem(CATEGORIES_KEY, JSON.stringify(DEFAULT_CATEGORIES));
            return DEFAULT_CATEGORIES;
        } catch {
            return DEFAULT_CATEGORIES;
        }
    });
}

/**
 * Persiste una lista de categorías actualizada.
 * Se usa al crear un producto con una categoría nueva (y también en rollback).
 *
 * Por qué async:
 *   Se ejecuta en paralelo con addProduct() dentro de Promise.allSettled en
 *   createProduct (useProducts.js). Si fuera síncrona no podría competir en
 *   parallelismo real y rompería el patrón de rollback.
 *
 * @param {string[]} categories
 * @returns {Promise<string[]>}
 */
export async function saveCategories(categories) {
    return withSimulation(() => {
        localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
        return categories;
    });
}

/**
 * Lee las categorías de forma SÍNCRONA desde localStorage (NUNCA lanza).
 *
 * Por qué síncrona aquí (excepción al patrón):
 *   Se usa durante el ROLLBACK de categorías en createProduct. En ese punto
 *   ya tenemos certeza de que las categorías existen en localStorage; añadir
 *   otra Promise innecesaria complicaría el flujo de rollback sin beneficio.
 *
 * @returns {string[]}
 */
export function readCategoriesSync() {
    try {
        const raw = localStorage.getItem(CATEGORIES_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
        return [...DEFAULT_CATEGORIES];
    } catch {
        return [...DEFAULT_CATEGORIES];
    }
}

/**
 * Elimina un producto FÍSICAMENTE de localStorage (hard delete).
 *
 * Por qué solo para 'inactivo':
 *   El soft delete marca estado='inactivo'. El hard delete es irreversible,
 *   por lo que solo se permite sobre productos ya desactivados. Esto evita
 *   eliminaciones accidentales de datos activos.
 *
 * Por qué NO usa optimistic update (ver useProducts.js):
 *   La eliminación física es destructiva. Si se aplicara optimísticamente y
 *   luego fallara, no habría forma de reconstruir el elemento en la UI sin
 *   una recarga completa. Es más seguro esperar la confirmación de storage.
 *
 * @param {string} id
 * @returns {Promise<string>} Resuelve con el id del producto eliminado.
 */
export async function hardDeleteProduct(id) {
    return withSimulation(() => {
        const products = readFromStorage();
        const index = products.findIndex((p) => p.id === id);

        if (index === -1) {
            throw new Error(`Producto con id "${id}" no encontrado.`);
        }
        if (products[index].estado !== 'inactivo') {
            throw new Error(`Solo se pueden eliminar definitivamente productos inactivos.`);
        }

        const filtered = products.filter((p) => p.id !== id);
        writeToStorage(filtered);
        return id;
    });
}

/**
 * Valida la integridad de los datos: detecta productos con precio o stock negativos.
 *
 * Por qué es async si solo lee localStorage:
 *   Se ejecuta en paralelo con getProducts() y getCategories() dentro de
 *   Promise.allSettled (refreshProducts en useProducts.js). Ser async permite
 *   que las tres tareas se lancen simultáneamente y que una falla en validación
 *   no impida que los productos o categorías se carguen correctamente.
 *
 * @returns {Promise<Array<{ id: string, nombre: string, field: string, value: number, message: string }>>}
 */
export async function validateProducts() {
    return withSimulation(() => {
        const products = readFromStorage();
        const errors = [];

        for (const p of products) {
            if (typeof p.precio === 'number' && p.precio < 0) {
                errors.push({
                    id: p.id,
                    nombre: p.nombre,
                    field: 'precio',
                    value: p.precio,
                    message: `Producto "${p.nombre}" tiene precio negativo (${p.precio}).`,
                });
            }
            if (typeof p.stock === 'number' && p.stock < 0) {
                errors.push({
                    id: p.id,
                    nombre: p.nombre,
                    field: 'stock',
                    value: p.stock,
                    message: `Producto "${p.nombre}" tiene stock negativo (${p.stock}).`,
                });
            }
        }

        return errors;
    });
}

/**
 * @typedef {Object} Product
 * @property {string}            id       - UUID v4 generado por generateId()
 * @property {string}            nombre   - Nombre del producto (mínimo 2 caracteres)
 * @property {number}            precio   - Precio unitario (> 0)
 * @property {number}            stock    - Unidades disponibles (entero >= 0)
 * @property {string}            categoria - Categoría del producto
 * @property {'activo'|'inactivo'} estado - 'inactivo' = soft-deleted, 'activo' = visible
 */
