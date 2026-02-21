/**
 * useProducts.js
 *
 * Hook personalizado que conecta la UI con storageService.
 *
 * CONCEPTOS DEMOSTRADOS:
 * ─────────────────────
 * 1. Promise.allSettled  — Permite ejecutar tareas INDEPENDIENTES en paralelo
 *                          sin que el fallo de una cancele las demás.
 *                          Usado en: refreshProducts (carga inicial) y createProduct.
 *
 * 2. async/await         — Toda la lógica asíncrona usa async/await en lugar de
 *                          .then()/.catch() anidados, para mayor legibilidad y
 *                          trazabilidad de errores.
 *
 * 3. Optimistic update   — editProduct y removeProduct actualizan el estado local
 *                          ANTES de confirmar en storage para respuesta instantánea.
 *                          Si storage falla → rollback al valor anterior.
 *
 * 4. Manejo centralizado — withLoading encapsula setLoading + setError para que
 *    de errores             cada operación CRUD no repita la misma lógica de UI.
 *                          Los errores se RE-LANZAN para que el llamador pueda hacer
 *                          rollback antes de que el error llegue a la UI.
 *
 * ─── Flujo de carga inicial ───────────────────────────────────────────────────
 *
 *   useEffect → refreshProducts()
 *                    │
 *                    ▼
 *        Promise.allSettled (paralelo)
 *        ┌──────────────────────────┐
 *        │  getProducts()           │  → products state
 *        │  getCategories()         │  → categories state
 *        │  validateProducts()      │  → validationErrors state
 *        └──────────────────────────┘
 *                    │
 *                    ▼
 *        Un solo setState cuando TODAS completan
 *        (setProducts, setCategories, setValidationErrors, setTaskStatuses, setLoading)
 *
 * ─── Por qué Promise.allSettled y no Promise.all ─────────────────────────────
 *
 *   Promise.all → rechaza completo si UNA SOLA promesa falla.
 *                 Inaceptable aquí: si la validación falla no queremos
 *                 perder los productos o categorías ya cargados.
 *
 *   Promise.allSettled → espera a TODAS y devuelve { status, value | reason }
 *                        por cada tarea. Podemos integrar resultados parciales
 *                        y mostrar errores por tarea en el TaskStatusBar.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    getProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    hardDeleteProduct as storageHardDelete,
    getCategories,
    saveCategories,
    readCategoriesSync,
    validateProducts,
} from '../services/storageService';

// ── Estado inicial de las tareas paralelas ────────────────────────────────────
// Cada clave corresponde a una de las tres tareas de refreshProducts.
// Valores posibles: 'idle' | 'loading' | 'success' | 'error'

const INITIAL_TASK_STATUSES = {
    products: 'idle',
    categories: 'idle',
    validation: 'idle',
};

// ── Helper de validación de payload ──────────────────────────────────────────
// Se valida ANTES de cualquier I/O para evitar round-trips innecesarios.

/**
 * Valida el payload de producto antes de enviarlo a storage.
 * @param {{ nombre: string, precio: number, stock: number }} data
 * @returns {string | null} Mensaje de error, o null si es válido.
 */
function validatePayload(data) {
    if (!data.nombre || !data.nombre.trim()) return 'El nombre es obligatorio.';
    if (data.nombre.trim().length < 2) return 'El nombre debe tener al menos 2 caracteres.';

    const precio = Number(data.precio);
    if (isNaN(precio) || precio <= 0) return 'El precio debe ser mayor que 0.';

    const stock = Number(data.stock);
    if (isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
        return 'El stock debe ser un número entero mayor o igual a 0.';
    }

    return null;
}

/**
 * @returns {{
 *   products:           Product[],
 *   categories:         string[],
 *   validationErrors:   Array<{ id: string, nombre: string, field: string, value: number, message: string }>,
 *   loading:            boolean,
 *   error:              string | null,
 *   taskStatuses:       { products: string, categories: string, validation: string },
 *   refreshProducts:    () => Promise<void>,
 *   createProduct:      (data: Omit<Product,'id'>) => Promise<Product>,
 *   editProduct:        (id: string, updates: Partial<Product>) => Promise<Product>,
 *   removeProduct:      (id: string) => Promise<string>,
 *   hardDeleteProduct:  (id: string) => Promise<string>,
 *   clearError:         () => void,
 * }}
 */
export function useProducts() {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [validationErrors, setValidationErrors] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [taskStatuses, setTaskStatuses] = useState(INITIAL_TASK_STATUSES);

    // mountedRef previene actualizaciones de estado post-desmontaje (memory leak)
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // ── Helpers ──────────────────────────────────────────────────────────────────

    const clearError = useCallback(() => setError(null), []);

    /**
     * Re-ejecuta validateProducts en segundo plano y actualiza el estado.
     * Se llama después de cada operación CRUD exitosa para mantener el banner
     * de errores de integridad actualizado sin bloquear la UI.
     */
    const revalidate = useCallback(() => {
        validateProducts()
            .then((errs) => { if (mountedRef.current) setValidationErrors(errs); })
            .catch(() => { /* Los errores de validación son no-críticos: se ignoran silenciosamente */ });
    }, []);

    /**
     * Wrapper para operaciones CRUD individuales.
     *
     * Por qué async/await aquí:
     *   Permite escribir `return await asyncFn()` y capturar excepciones con
     *   try/catch en lugar de manejar un callback de error separado.
     *
     * Por qué re-lanzar el error:
     *   El error se captura aquí para setError (UI), pero se RELANZA para que
     *   el llamador (e.g. editProduct) pueda ejecutar su lógica de rollback
     *   ANTES de que el error llegue a la UI. Si no relanzáramos, el rollback
     *   nunca ejecutaría porque el catch del llamador no recibiría el error.
     */
    const withLoading = useCallback(async (asyncFn) => {
        setLoading(true);
        setError(null);
        try {
            // async/await: suspende hasta que asyncFn() resuelva o rechace
            return await asyncFn();
        } catch (err) {
            const message = err?.message ?? 'Ocurrió un error inesperado.';
            if (mountedRef.current) setError(message);
            throw err; // ← re-throw para permitir rollback en el llamador
        } finally {
            // finally garantiza que setLoading(false) se ejecute SIEMPRE,
            // incluso si asyncFn() lanzó una excepción no capturada.
            if (mountedRef.current) setLoading(false);
        }
    }, []);

    // ── Carga paralela inicial ────────────────────────────────────────────────────

    /**
     * ★ NÚCLEO DEL PARALELISMO ★
     *
     * Ejecuta THREE tareas INDEPENDIENTES en paralelo con Promise.allSettled:
     *   1. getProducts()     – lista de productos
     *   2. getCategories()   – categorías disponibles
     *   3. validateProducts() – errores de integridad
     *
     * Por qué Promise.allSettled y NO Promise.all:
     *   • Promise.all rechaza completo si UNA promesa falla.
     *   • Promise.allSettled espera a TODAS y devuelve el resultado
     *     individual de cada una (fulfilled | rejected).
     *   • Esto permite mostrar los datos que SÍ llegaron aunque otra
     *     tarea haya fallado (e.g., si validación falla, los productos
     *     y categorías siguen siendo visibles en la UI).
     *
     * Un solo bloque de setState:
     *   Toda la integración de resultados ocurre DESPUÉS de que
     *   Promise.allSettled resuelve, por lo que React agrupa los
     *   múltiples setX en un solo re-render (batching en React 18).
     */
    const refreshProducts = useCallback(async () => {
        if (!mountedRef.current) return;

        setLoading(true);
        setError(null);
        // Marca las tres tareas como 'loading' simultáneamente
        setTaskStatuses({ products: 'loading', categories: 'loading', validation: 'loading' });

        // ↓ Las tres promesas se INICIAN en paralelo (no hay await entre ellas)
        const [productsResult, categoriesResult, validationResult] =
            await Promise.allSettled([
                getProducts(),      // tarea 1: independiente
                getCategories(),    // tarea 2: independiente
                validateProducts(), // tarea 3: independiente
            ]);
        // ↑ await aquí: esperamos a que TODAS completen antes de continuar

        if (!mountedRef.current) return;

        // ── Integración de resultados ────────────────────────────────────────────
        // Se procesan los tres resultados UNA VEZ que Promise.allSettled resolvió.
        // Cada resultado tiene .status === 'fulfilled' | 'rejected'.

        const newStatuses = { ...INITIAL_TASK_STATUSES };
        const failedTasks = [];

        if (productsResult.status === 'fulfilled') {
            setProducts(productsResult.value);
            newStatuses.products = 'success';
        } else {
            newStatuses.products = 'error';
            failedTasks.push(`Productos: ${productsResult.reason?.message ?? 'error desconocido'}`);
        }

        if (categoriesResult.status === 'fulfilled') {
            setCategories(categoriesResult.value);
            newStatuses.categories = 'success';
        } else {
            newStatuses.categories = 'error';
            failedTasks.push(`Categorías: ${categoriesResult.reason?.message ?? 'error desconocido'}`);
        }

        if (validationResult.status === 'fulfilled') {
            setValidationErrors(validationResult.value);
            newStatuses.validation = 'success';
        } else {
            newStatuses.validation = 'error';
            failedTasks.push(`Validación: ${validationResult.reason?.message ?? 'error desconocido'}`);
        }

        // Un único setState agrupa todos los cambios de estado (React 18 batching)
        setTaskStatuses(newStatuses);

        if (failedTasks.length > 0) {
            // Muestra el error consolidado solo si hay fallos; el flujo NO se rompe
            setError(
                `${failedTasks.length} tarea(s) fallaron:\n• ${failedTasks.join('\n• ')}`
            );
        }

        setLoading(false);
    }, []);

    // ── CREAR producto ────────────────────────────────────────────────────────────

    /**
     * Crea un producto nuevo.
     *
     * Usa async/await internamente dentro de withLoading para:
     *   1. Validar el payload ANTES de cualquier I/O.
     *   2. Ejecutar addProduct + saveCategories en PARALELO con Promise.allSettled.
     *   3. Hacer ROLLBACK de categorías si el producto falló pero las categorías
     *      ya se habían guardado (para mantener consistencia entre los dos almacenes).
     *
     * ★ Por qué Promise.allSettled aquí y no Promise.all:
     *   Necesitamos el resultado INDIVIDUAL de cada promesa para saber si ejecutar
     *   rollback. Con Promise.all perderíamos la información de cuál tuvo éxito y
     *   cuál no cuando hay rechazo parcial.
     *
     * Estrategia de rollback:
     *   Si (a) addProduct falló Y (b) saveCategories tuvo éxito →
     *   la nueva categoría quedó guardada pero el producto no existe.
     *   → Revertimos localStorage.crud_categorias a la lista previa.
     *   → Lanzamos el error original del producto hacia la UI.
     */
    const createProduct = useCallback(
        (productData) =>
            withLoading(async () => {
                // Paso 0: validación pre-I/O (falla barato sin tocar storage)
                const validationError = validatePayload(productData);
                if (validationError) throw new Error(validationError);

                const prevCategories = [...categories];
                const trimmedCategory = productData.categoria?.trim();
                const isNewCategory = trimmedCategory && !prevCategories.includes(trimmedCategory);
                const nextCategories = isNewCategory
                    ? [...prevCategories, trimmedCategory]
                    : prevCategories;

                let productSaved = false;
                let categoriesSaved = false;

                // Paso 2: lanzar ambas operaciones EN PARALELO
                // ↓ Las dos promesas arrancan simultáneamente
                const [productResult, categoriesResult] = await Promise.allSettled([
                    addProduct(productData),                                           // (a) guardar producto
                    isNewCategory ? saveCategories(nextCategories) : Promise.resolve(prevCategories), // (b) guardar categoría nueva
                ]);
                // ↑ await: esperamos las dos antes de decidir qué hacer

                productSaved = productResult.status === 'fulfilled';
                categoriesSaved = isNewCategory && categoriesResult.status === 'fulfilled';

                // Paso 3: ROLLBACK si el producto falló pero categorías sí se guardaron
                if (!productSaved && categoriesSaved) {
                    try {
                        // Revertir lista de categorías en localStorage (best-effort)
                        localStorage.setItem('crud_categorias', JSON.stringify(prevCategories));
                    } catch {
                        // Si el rollback falla también, no hay mucho más que hacer.
                        // El error no se propaga para no ocultar el error original.
                    }
                    // Propagar el error del producto hacia withLoading → setError → Toast
                    throw productResult.reason;
                }

                // Paso 4: si el producto se guardó, actualizar estado local
                if (productSaved) {
                    const created = productResult.value;
                    if (mountedRef.current) {
                        setProducts((prev) => [...prev, created]);
                        if (categoriesSaved) {
                            setCategories(
                                categoriesResult.status === 'fulfilled'
                                    ? categoriesResult.value
                                    : nextCategories
                            );
                        }
                        revalidate(); // re-chequeo de integridad en background
                    }
                    return created;
                }

                // Ambas fallaron (caso raro pero posible)
                throw productResult.reason ?? new Error('Error al crear el producto.');
            }),
        [withLoading, categories, revalidate]
    );

    // ── EDITAR producto (optimistic update + rollback) ─────────────────────────

    /**
     * ★ OPTIMISTIC UPDATE ★
     *
     * Patrón:
     *   1. Capturar snapshot del producto ANTES del update (para poder revertir).
     *   2. Aplicar el update en el estado local INMEDIATAMENTE (la UI responde al
     *      instante sin esperar a storage).
     *   3. Confirmar el update en storage con await.
     *   4. Si storage falla → ROLLBACK: restaurar el snapshot capturado en (1).
     *
     * Por qué optimistic y no esperar storage:
     *   La latencia simulada (200–500 ms) crearía una delicadeza perceptible
     *   en la UI. El optimistic update hace que el cambio sea instantáneo;
     *   el rollback solo ocurre si hay un error real.
     *
     * Por qué el rollback funciona:
     *   El closure de setProducts captura `previousProduct` al momento del update.
     *   Si el await storageOp lanza, el catch restaura ese valor guardado.
     */
    const editProduct = useCallback(
        (id, updates) =>
            withLoading(async () => {
                // Paso 1: capturar snapshot previo usando el updater de setState
                // (acceso al estado actual sin necesitar la variable del closure)
                let previousProduct = null;
                setProducts((prev) => {
                    const found = prev.find((p) => p.id === id);
                    if (found) previousProduct = found;
                    return prev; // no modificamos el estado aún
                });

                if (!previousProduct) {
                    throw new Error(`Producto con id "${id}" no encontrado localmente.`);
                }

                // Paso 2: construir el valor optimista y aplicarlo en la UI YA
                const optimisticProduct = { ...previousProduct, ...updates };
                if (mountedRef.current) {
                    setProducts((prev) =>
                        prev.map((p) => (p.id === id ? optimisticProduct : p))
                    );
                }

                try {
                    // Paso 3: async/await — pausa hasta que storage confirme
                    const confirmed = await updateProduct(id, updates);
                    if (mountedRef.current) {
                        // Reemplazar el valor optimista con el confirmado por storage
                        setProducts((prev) =>
                            prev.map((p) => (p.id === id ? confirmed : p))
                        );
                        revalidate();
                    }
                    return confirmed;
                } catch (err) {
                    // Paso 4: ROLLBACK — restaurar el snapshot previo
                    if (mountedRef.current) {
                        setProducts((prev) =>
                            prev.map((p) => (p.id === id ? previousProduct : p))
                        );
                    }
                    throw err; // withLoading captura esto y lo muestra como error
                }
            }),
        [withLoading, revalidate]
    );

    // ── SOFT DELETE ───────────────────────────────────────────────────────────────

    /**
     * Soft delete: marca estado = 'inactivo' (NO elimina físicamente).
     *
     * También usa optimistic update + rollback:
     *   - Marca inactivo en UI inmediatamente.
     *   - Si storage rechaza, revierte a 'activo' automáticamente.
     *
     * Por qué soft delete y no hard delete directo:
     *   Permite una "papelera de reciclaje" — el dato sigue en localStorage
     *   y puede auditarse o restaurarse. El hard delete es un segundo paso
     *   explícito que el usuario debe elegir.
     */
    const removeProduct = useCallback(
        (id) =>
            withLoading(async () => {
                let previousProduct = null;
                setProducts((prev) => {
                    const found = prev.find((p) => p.id === id);
                    if (found) previousProduct = found;
                    return prev;
                });

                if (!previousProduct) {
                    throw new Error(`Producto con id "${id}" no encontrado.`);
                }

                if (previousProduct.estado === 'inactivo') {
                    throw new Error('El producto ya está inactivo.');
                }

                // Optimistic: marcar inactivo en UI antes de confirmar
                if (mountedRef.current) {
                    setProducts((prev) =>
                        prev.map((p) =>
                            p.id === id ? { ...p, estado: 'inactivo' } : p
                        )
                    );
                }

                try {
                    // async/await: confirmar en storage
                    const confirmed = await updateProduct(id, { estado: 'inactivo' });
                    if (mountedRef.current) {
                        setProducts((prev) =>
                            prev.map((p) => (p.id === id ? confirmed : p))
                        );
                        revalidate();
                    }
                    return id;
                } catch (err) {
                    // Rollback: revertir a 'activo' si storage falla
                    if (mountedRef.current) {
                        setProducts((prev) =>
                            prev.map((p) =>
                                p.id === id ? previousProduct : p
                            )
                        );
                    }
                    throw err;
                }
            }),
        [withLoading, revalidate]
    );

    // ── HARD DELETE ───────────────────────────────────────────────────────────────

    /**
     * Elimina un producto FÍSICAMENTE de localStorage.
     *
     * Por qué NO usa optimistic update:
     *   La eliminación es IRREVERSIBLE. Si elimináramos el producto de la UI
     *   antes de que storage confirmara y storage fallara, deberíamos reinsertarlo
     *   manteniendo su posición en la lista — frágil y propenso a bugs.
     *   Es más seguro confirmar con await y luego quitar de la UI.
     *
     * Por qué solo para productos 'inactivo':
     *   El soft delete previo garantiza que el usuario revisó y desactivó el
     *   producto conscientemente. El hard delete es un segundo paso deliberado.
     */
    const hardDeleteProduct = useCallback(
        (id) =>
            withLoading(async () => {
                const target = products.find((p) => p.id === id);
                if (!target) throw new Error(`Producto con id "${id}" no encontrado.`);

                if (target.estado !== 'inactivo') {
                    throw new Error(
                        'Solo puedes eliminar definitivamente un producto inactivo. Desactívalo primero.'
                    );
                }

                // async/await: esperar confirmación de storage ANTES de actualizar UI
                await storageHardDelete(id);

                if (mountedRef.current) {
                    setProducts((prev) => prev.filter((p) => p.id !== id));
                    revalidate();
                }
                return id;
            }),
        [withLoading, products, revalidate]
    );

    // ── Carga inicial al montar el componente ─────────────────────────────────────

    useEffect(() => {
        // Se ejecuta una sola vez al montar (array de dependencias vacío).
        // refreshProducts lanza las tres tareas en paralelo con Promise.allSettled.
        refreshProducts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        // Estado de datos
        products,
        categories,
        validationErrors,
        // Estado de UI
        loading,
        error,
        taskStatuses,
        // Acciones
        refreshProducts,
        createProduct,
        editProduct,
        removeProduct,
        hardDeleteProduct,
        clearError,
    };
}
