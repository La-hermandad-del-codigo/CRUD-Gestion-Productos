/**
 * useProducts.js
 * Custom hook that bridges the UI and storageService.
 *
 * On mount (and on refreshProducts), three independent tasks run IN PARALLEL:
 *   1. Load product list         → products state
 *   2. Load available categories → categories state
 *   3. Validate data integrity   → validationErrors state
 *
 * Promise.allSettled is used so that a failure in one task never blocks
 * the others. taskStatuses exposes each task's lifecycle ('idle' | 'loading'
 * | 'success' | 'error') so the UI can react granularly.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    getProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    getCategories,
    validateProducts,
} from '../services/storageService';

// ── Initial state helpers ──────────────────────────────────────────────────────

const INITIAL_TASK_STATUSES = {
    products: 'idle',
    categories: 'idle',
    validation: 'idle',
};

/**
 * @returns {{
 *   products:        Product[],
 *   categories:      string[],
 *   validationErrors: Array<{ id: string, nombre: string, field: string, value: number, message: string }>,
 *   loading:         boolean,
 *   error:           string | null,
 *   taskStatuses:    { products: string, categories: string, validation: string },
 *   refreshProducts: () => Promise<void>,
 *   createProduct:   (data: Omit<Product,'id'>) => Promise<Product>,
 *   editProduct:     (id: string, data: Partial<Product>) => Promise<Product>,
 *   removeProduct:   (id: string) => Promise<string>,
 *   clearError:      () => void,
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

    /**
     * Helper for single-operation CRUD calls (add / update / delete).
     * These still use a simple loading flag — only the parallel bootstrap
     * uses allSettled.
     */
    const withLoading = useCallback(async (asyncFn) => {
        setLoading(true);
        setError(null);
        try {
            return await asyncFn();
        } catch (err) {
            const message = err?.message ?? 'Ocurrió un error inesperado.';
            if (mountedRef.current) setError(message);
            throw err;
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, []);

    // ── Parallel bootstrap ────────────────────────────────────────────────────────

    /**
     * Executes the three independent tasks in parallel using Promise.allSettled.
     * - Each task updates its own taskStatus independently.
     * - Results are integrated into state only after ALL tasks have settled.
     * - A global `loading` flag is true while any task is running.
     * - Individual task failures are surfaced via taskStatuses and a summary error.
     */
    const refreshProducts = useCallback(async () => {
        if (!mountedRef.current) return;

        // Mark all tasks as loading
        setLoading(true);
        setError(null);
        setTaskStatuses({
            products: 'loading',
            categories: 'loading',
            validation: 'loading',
        });

        // Fire all three tasks at once — none blocks the others
        const [productsResult, categoriesResult, validationResult] =
            await Promise.allSettled([
                getProducts(),
                getCategories(),
                validateProducts(),
            ]);

        if (!mountedRef.current) return;

        // ── Integrate results ──────────────────────────────────────────────────

        const newStatuses = { ...INITIAL_TASK_STATUSES };
        const failedTasks = [];

        // 1. Products
        if (productsResult.status === 'fulfilled') {
            setProducts(productsResult.value);
            newStatuses.products = 'success';
        } else {
            newStatuses.products = 'error';
            failedTasks.push(`Productos: ${productsResult.reason?.message ?? 'error desconocido'}`);
        }

        // 2. Categories
        if (categoriesResult.status === 'fulfilled') {
            setCategories(categoriesResult.value);
            newStatuses.categories = 'success';
        } else {
            newStatuses.categories = 'error';
            failedTasks.push(`Categorías: ${categoriesResult.reason?.message ?? 'error desconocido'}`);
        }

        // 3. Validation
        if (validationResult.status === 'fulfilled') {
            setValidationErrors(validationResult.value);
            newStatuses.validation = 'success';
        } else {
            newStatuses.validation = 'error';
            failedTasks.push(`Validación: ${validationResult.reason?.message ?? 'error desconocido'}`);
        }

        setTaskStatuses(newStatuses);

        // Surface a combined error message if any task failed
        if (failedTasks.length > 0) {
            setError(
                `${failedTasks.length} tarea(s) fallaron:\n• ${failedTasks.join('\n• ')}`
            );
        }

        setLoading(false);
    }, []);

    // ── CRUD actions ──────────────────────────────────────────────────────────────

    const createProduct = useCallback(
        (productData) =>
            withLoading(async () => {
                const created = await addProduct(productData);
                if (mountedRef.current) {
                    setProducts((prev) => [...prev, created]);
                    // Re-run validation after data change
                    validateProducts()
                        .then((errs) => { if (mountedRef.current) setValidationErrors(errs); })
                        .catch(() => { });
                }
                return created;
            }),
        [withLoading]
    );

    const editProduct = useCallback(
        (id, updates) =>
            withLoading(async () => {
                const updated = await updateProduct(id, updates);
                if (mountedRef.current) {
                    setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
                    validateProducts()
                        .then((errs) => { if (mountedRef.current) setValidationErrors(errs); })
                        .catch(() => { });
                }
                return updated;
            }),
        [withLoading]
    );

    const removeProduct = useCallback(
        (id) =>
            withLoading(async () => {
                await deleteProduct(id);
                if (mountedRef.current) {
                    setProducts((prev) => prev.filter((p) => p.id !== id));
                    validateProducts()
                        .then((errs) => { if (mountedRef.current) setValidationErrors(errs); })
                        .catch(() => { });
                }
                return id;
            }),
        [withLoading]
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
        clearError,
    };
}
