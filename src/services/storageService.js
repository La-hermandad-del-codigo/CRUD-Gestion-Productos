/**
 * storageService.js
 * Simulates an async data layer using localStorage.
 * - Simulated latency: 200–500ms per operation.
 * - ~10% random failure rate to enable real error-handling scenarios.
 */

const STORAGE_KEY = 'crud_productos';
const CATEGORIES_KEY = 'crud_categorias';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a Promise that resolves after a random delay between 200–500ms. */
function simulateLatency() {
    const delay = Math.floor(Math.random() * 300) + 200;
    return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Wraps an operation in simulated latency + random failure.
 * @param {Function} operation  Sync function that returns the resolved value.
 * @returns {Promise<*>}
 */
async function withSimulation(operation) {
    await simulateLatency();

    // ~10% failure probability
    if (Math.random() < 0.1) {
        throw new Error('Error de red simulado: la operación falló. Inténtalo de nuevo.');
    }

    return operation();
}

/** Read the full product list from localStorage (never throws). */
function readFromStorage() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

/** Persist the full product list to localStorage (never throws). */
function writeToStorage(products) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

/** Generates a UUID v4. */
function generateId() {
    return crypto.randomUUID
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Retrieves all products.
 * @returns {Promise<Product[]>}
 */
export async function getProducts() {
    return withSimulation(() => readFromStorage());
}

/**
 * Replaces the entire product list.
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
 * Adds a new product (assigns a generated UUID).
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
 * Updates an existing product by id.
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
 * Deletes a product by id.
 * @param {string} id
 * @returns {Promise<string>} Resolves with the deleted product id.
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
 * Retrieves available product categories from localStorage.
 * Seeds defaults if none are stored yet.
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
            // Seed defaults on first run
            localStorage.setItem(CATEGORIES_KEY, JSON.stringify(DEFAULT_CATEGORIES));
            return DEFAULT_CATEGORIES;
        } catch {
            return DEFAULT_CATEGORIES;
        }
    });
}

/**
 * Persists an updated category list to localStorage.
 * Used when adding a product with a new category (and for rollback).
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
 * Reads the current category list synchronously from localStorage (never throws).
 * Useful for rollback without an extra async round-trip.
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
 * Removes a product physically from storage (hard delete).
 * Should only be called on products that are already 'inactivo'.
 * @param {string} id
 * @returns {Promise<string>} Resolves with the deleted product id.
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
 * Validates product data integrity:
 * checks that no product has precio < 0 or stock < 0.
 * @returns {Promise<Array<{ id: string, nombre: string, field: string, value: number }>>}
 *   Resolves with an array of validation-error descriptors (empty = all clean).
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
 * @property {string} id
 * @property {string} nombre
 * @property {number} precio
 * @property {number} stock
 * @property {string} categoria
 * @property {'activo'|'inactivo'} estado
 */
