/**
 * useProducts.js
 * Custom hook that bridges the UI and storageService.
 * Manages: product list, loading flag, error messages.
 */

import { useState, useEffect, useCallback } from 'react';
import {
    getProducts,
    addProduct,
    updateProduct,
    deleteProduct,
} from '../services/storageService';

/**
 * @returns {{
 *   products: Product[],
 *   loading: boolean,
 *   error: string|null,
 *   fetchProducts: () => Promise<void>,
 *   createProduct: (data: Omit<Product,'id'>) => Promise<Product>,
 *   editProduct: (id: string, data: Partial<Product>) => Promise<Product>,
 *   removeProduct: (id: string) => Promise<string>,
 *   clearError: () => void,
 * }}
 */
export function useProducts() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // ── Helpers ────────────────────────────────────────────────────────────────

    const withLoading = useCallback(async (asyncFn) => {
        setLoading(true);
        setError(null);
        try {
            const result = await asyncFn();
            return result;
        } catch (err) {
            const message = err?.message ?? 'Ocurrió un error inesperado.';
            setError(message);
            throw err; // re-throw so the caller can handle it too
        } finally {
            setLoading(false);
        }
    }, []);

    const clearError = useCallback(() => setError(null), []);

    // ── CRUD actions ──────────────────────────────────────────────────────────

    const fetchProducts = useCallback(() => {
        return withLoading(async () => {
            const data = await getProducts();
            setProducts(data);
            return data;
        });
    }, [withLoading]);

    const createProduct = useCallback(
        (productData) => {
            return withLoading(async () => {
                const created = await addProduct(productData);
                setProducts((prev) => [...prev, created]);
                return created;
            });
        },
        [withLoading]
    );

    const editProduct = useCallback(
        (id, updates) => {
            return withLoading(async () => {
                const updated = await updateProduct(id, updates);
                setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
                return updated;
            });
        },
        [withLoading]
    );

    const removeProduct = useCallback(
        (id) => {
            return withLoading(async () => {
                await deleteProduct(id);
                setProducts((prev) => prev.filter((p) => p.id !== id));
                return id;
            });
        },
        [withLoading]
    );

    // ── Initial load ──────────────────────────────────────────────────────────

    useEffect(() => {
        fetchProducts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        products,
        loading,
        error,
        fetchProducts,
        createProduct,
        editProduct,
        removeProduct,
        clearError,
    };
}
