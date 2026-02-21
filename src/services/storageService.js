/**
 * storageService.js
 * Simulates an async data layer using localStorage.
 * - Simulated latency: 200–500ms per operation.
 * - ~10% random failure rate to enable real error-handling scenarios.
 */

const STORAGE_KEY = 'crud_productos';

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

/**
 * @typedef {Object} Product
 * @property {string} id
 * @property {string} nombre
 * @property {number} precio
 * @property {number} stock
 * @property {string} categoria
 * @property {'activo'|'inactivo'} estado
 */
