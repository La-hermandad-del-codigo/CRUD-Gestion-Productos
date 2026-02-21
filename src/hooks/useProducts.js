/**
 * useProducts.js
 * Custom hook that bridges the UI and storageService.
 *
 * Bootstrap parallel (Promise.allSettled):
 *   1. Load product list         → products state
 *   2. Load available categories → categories state
 *   3. Validate data integrity   → validationErrors state
 *
 * CRUD operations:
 *   createProduct  — validate → run in parallel (save product + update categories if new)
 *                    → rollback categories if product save fails but categories updated
 *   editProduct    — optimistic update (local state immediately), then confirm in storage
 *                    → revert to previous value if storage fails
 *   removeProduct  — soft delete: sets estado = 'inactivo' (optimistic, no revert needed)
 *   hardDeleteProduct — physical removal ONLY if product is already 'inactivo'
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

// ── Initial state helpers ──────────────────────────────────────────────────────

const INITIAL_TASK_STATUSES = {
    products: 'idle',
    categories: 'idle',
    validation: 'idle',
};

// ── Validation helper (mirrors form validate, used pre-save) ──────────────────

/**
 * Validates product payload before sending to storage.
 * Returns null if valid, or an error message string if invalid.
 * @param {{ nombre: string, precio: number, stock: number }} data
 * @returns {string | null}
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

    // Prevent state updates after unmount
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // ── Helpers ──────────────────────────────────────────────────────────────────

    const clearError = useCallback(() => setError(null), []);

    /** Re-runs validation in the background and quietly updates state. */
    const revalidate = useCallback(() => {
        validateProducts()
            .then((errs) => { if (mountedRef.current) setValidationErrors(errs); })
            .catch(() => { /* validation errors are non-critical */ });
    }, []);

    /**
     * Wraps a single-operation CRUD call with loading flag + error capture.
     * Rethrows errors so callers can react (e.g. rollback).
     */
    const withLoading = useCallback(async (asyncFn) => {
        setLoading(true);
        setError(null);
        try {
            return await asyncFn();
        } catch (err) {
            const message = err?.message ?? 'Ocurrió un error inesperado.';
            if (mountedRef.current) setError(message);
            throw err; // re-throw so callers can rollback
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, []);

    // ── Parallel bootstrap ────────────────────────────────────────────────────────

    /**
     * Executes the three independent tasks in parallel using Promise.allSettled.
     * A failure in one task never blocks the others.
     */
    const refreshProducts = useCallback(async () => {
        if (!mountedRef.current) return;

        setLoading(true);
        setError(null);
        setTaskStatuses({ products: 'loading', categories: 'loading', validation: 'loading' });

        const [productsResult, categoriesResult, validationResult] =
            await Promise.allSettled([
                getProducts(),
                getCategories(),
                validateProducts(),
            ]);

        if (!mountedRef.current) return;

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

        setTaskStatuses(newStatuses);

        if (failedTasks.length > 0) {
            setError(
                `${failedTasks.length} tarea(s) fallaron:\n• ${failedTasks.join('\n• ')}`
            );
        }

        setLoading(false);
    }, []);

    // ── CREATE ────────────────────────────────────────────────────────────────────

    /**
     * Creates a new product.
     * Steps:
     *   0. Validate payload — throws and surfaces error if invalid.
     *   1. Determine if the category is new (not yet in state).
     *   2. Run in PARALLEL: (a) addProduct to storage, (b) saveCategories if new category.
     *   3. ROLLBACK: if (a) fails but (b) succeeded, revert categories to previous list.
     *   4. On success, update local products + categories state.
     */
    const createProduct = useCallback(
        (productData) =>
            withLoading(async () => {
                // Step 0: validate before any I/O
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

                // Step 2: run in parallel
                const [productResult, categoriesResult] = await Promise.allSettled([
                    addProduct(productData),                                          // (a)
                    isNewCategory ? saveCategories(nextCategories) : Promise.resolve(prevCategories), // (b)
                ]);

                productSaved = productResult.status === 'fulfilled';
                categoriesSaved = isNewCategory && categoriesResult.status === 'fulfilled';

                // Step 3: rollback if product failed but categories updated
                if (!productSaved && categoriesSaved) {
                    try {
                        // Revert to previous category list (best-effort, don't surface this error)
                        localStorage.setItem('crud_categorias', JSON.stringify(prevCategories));
                    } catch {
                        // Storage rollback failed — log silently, UI stays consistent
                    }
                    // Surface the original product error
                    throw productResult.reason;
                }

                // If product succeeded, commit state
                if (productSaved) {
                    const created = productResult.value;
                    if (mountedRef.current) {
                        setProducts((prev) => [...prev, created]);
                        if (categoriesSaved) {
                            // Update categories in sync with what was persisted
                            setCategories(
                                categoriesResult.status === 'fulfilled'
                                    ? categoriesResult.value
                                    : nextCategories
                            );
                        }
                        revalidate();
                    }
                    return created;
                }

                // Both failed (unlikely but handle gracefully)
                throw productResult.reason ?? new Error('Error al crear el producto.');
            }),
        [withLoading, categories, revalidate]
    );

    // ── UPDATE (optimistic) ───────────────────────────────────────────────────────

    /**
     * Updates a product with optimistic UI update.
     * Steps:
     *   1. Capture the previous product state (for rollback).
     *   2. Apply update to local state IMMEDIATELY.
     *   3. Confirm in storage.
     *   4. If storage fails → revert local state and surface error.
     */
    const editProduct = useCallback(
        (id, updates) =>
            withLoading(async () => {
                // Step 1: snapshot before update
                let previousProduct = null;
                setProducts((prev) => {
                    const found = prev.find((p) => p.id === id);
                    if (found) previousProduct = found;
                    return prev;
                });

                if (!previousProduct) {
                    throw new Error(`Producto con id "${id}" no encontrado localmente.`);
                }

                const optimisticProduct = { ...previousProduct, ...updates };

                // Step 2: apply optimistic update immediately
                if (mountedRef.current) {
                    setProducts((prev) =>
                        prev.map((p) => (p.id === id ? optimisticProduct : p))
                    );
                }

                try {
                    // Step 3: confirm in storage
                    const confirmed = await updateProduct(id, updates);
                    if (mountedRef.current) {
                        // Replace optimistic with confirmed server value
                        setProducts((prev) =>
                            prev.map((p) => (p.id === id ? confirmed : p))
                        );
                        revalidate();
                    }
                    return confirmed;
                } catch (err) {
                    // Step 4: revert on failure
                    if (mountedRef.current) {
                        setProducts((prev) =>
                            prev.map((p) => (p.id === id ? previousProduct : p))
                        );
                    }
                    throw err; // withLoading will set error state
                }
            }),
        [withLoading, revalidate]
    );

    // ── SOFT DELETE ───────────────────────────────────────────────────────────────

    /**
     * Soft deletes a product by setting its estado to 'inactivo'.
     * Uses optimistic update: mark locally first, then confirm in storage.
     * If storage fails, revert the product to 'activo'.
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

                // Optimistic: mark as inactivo immediately
                if (mountedRef.current) {
                    setProducts((prev) =>
                        prev.map((p) =>
                            p.id === id ? { ...p, estado: 'inactivo' } : p
                        )
                    );
                }

                try {
                    const confirmed = await updateProduct(id, { estado: 'inactivo' });
                    if (mountedRef.current) {
                        setProducts((prev) =>
                            prev.map((p) => (p.id === id ? confirmed : p))
                        );
                        revalidate();
                    }
                    return id;
                } catch (err) {
                    // Revert soft delete
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
     * Permanently removes a product from storage.
     * Only allowed if the product's estado is already 'inactivo'.
     * Does NOT use optimistic update — removal is destructive and irreversible.
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

                await storageHardDelete(id);

                if (mountedRef.current) {
                    setProducts((prev) => prev.filter((p) => p.id !== id));
                    revalidate();
                }
                return id;
            }),
        [withLoading, products, revalidate]
    );

    // ── Initial parallel load on mount ───────────────────────────────────────────

    useEffect(() => {
        refreshProducts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        // State
        products,
        categories,
        validationErrors,
        loading,
        error,
        taskStatuses,
        // Actions
        refreshProducts,
        createProduct,
        editProduct,
        removeProduct,
        hardDeleteProduct,
        clearError,
    };
}
