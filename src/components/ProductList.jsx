/**
 * ProductList.jsx
 * Grid view of all products with search/filter (client-side) and stats bar.
 *
 * Filtering (no new storage calls):
 *   - By name (text, case-insensitive, also searches description)
 *   - By category (dynamic list from hook state)
 *   - By status ('todos' | 'activo' | 'inactivo')
 *
 * Delete flow:
 *   - onSoftDelete: confirm → desactivar (estado='inactivo')
 *   - onHardDelete: double-confirm → eliminar definitivamente (solo si inactivo)
 */

import { useState, useMemo } from 'react';
import ProductCard from './ProductCard';

export default function ProductList({
    products,
    categories,
    loading,
    onEdit,
    onSoftDelete,
    onHardDelete,
    onAdd,
}) {
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('Todos');
    const [statusFilter, setStatusFilter] = useState('todos');

    // Per-product action loading state (independent)
    const [softDeletingId, setSoftDeletingId] = useState(null);
    const [hardDeletingId, setHardDeletingId] = useState(null);

    // ── Search/filter — pure client-side, no I/O ─────────────────────────────────
    const filtered = useMemo(() => {
        const term = search.toLowerCase().trim();
        return products.filter((p) => {
            const matchSearch =
                !term ||
                p.nombre.toLowerCase().includes(term) ||
                p.categoria.toLowerCase().includes(term);
            const matchCat = categoryFilter === 'Todos' || p.categoria === categoryFilter;
            const matchStatus = statusFilter === 'todos' || p.estado === statusFilter;
            return matchSearch && matchCat && matchStatus;
        });
    }, [products, search, categoryFilter, statusFilter]);

    // ── Dynamic category options (from hook state, never stale) ──────────────────
    const categoryOptions = useMemo(
        () => ['Todos', ...categories],
        [categories]
    );

    // ── Stats ─────────────────────────────────────────────────────────────────────
    const totalActive = products.filter((p) => p.estado === 'activo').length;
    const totalInactive = products.filter((p) => p.estado === 'inactivo').length;
    const totalValue = products.reduce((sum, p) => sum + p.precio * p.stock, 0);

    // ── Soft delete handler ───────────────────────────────────────────────────────
    const handleSoftDelete = async (id) => {
        const product = products.find((p) => p.id === id);
        const name = product?.nombre ?? 'este producto';

        if (!window.confirm(`¿Desactivar "${name}"?\nEl producto quedará inactivo pero no se eliminará.`)) {
            return;
        }

        setSoftDeletingId(id);
        try {
            await onSoftDelete(id);
        } finally {
            setSoftDeletingId(null);
        }
    };

    // ── Hard delete handler ───────────────────────────────────────────────────────
    const handleHardDelete = async (id, nombre) => {
        const name = nombre ?? 'este producto';

        if (!window.confirm(
            `⚠️ ELIMINACIÓN DEFINITIVA\n\n¿Eliminar permanentemente "${name}"?\n\nEsta acción NO se puede deshacer.`
        )) {
            return;
        }

        setHardDeletingId(id);
        try {
            await onHardDelete(id);
        } finally {
            setHardDeletingId(null);
        }
    };

    return (
        <div className="product-list">
            {/* Stats bar */}
            <div className="stats-bar">
                <div className="stat-card">
                    <span className="stat-card__value">{products.length}</span>
                    <span className="stat-card__label">Total productos</span>
                </div>
                <div className="stat-card">
                    <span className="stat-card__value">{totalActive}</span>
                    <span className="stat-card__label">Activos</span>
                </div>
                <div className="stat-card">
                    <span className="stat-card__value">{totalInactive}</span>
                    <span className="stat-card__label">Inactivos</span>
                </div>
                <div className="stat-card">
                    <span className="stat-card__value">
                        {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(totalValue)}
                    </span>
                    <span className="stat-card__label">Valor en stock</span>
                </div>
            </div>

            {/* Toolbar */}
            <div className="toolbar">
                <div className="toolbar__search">
                    <span className="toolbar__search-icon">🔍</span>
                    <input
                        type="search"
                        id="search-products"
                        placeholder="Buscar por nombre o categoría..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="input"
                        aria-label="Buscar productos"
                    />
                </div>

                <div className="toolbar__filters">
                    <select
                        id="filter-category"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="select"
                        aria-label="Filtrar por categoría"
                    >
                        {categoryOptions.map((c) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>

                    <select
                        id="filter-status"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="select"
                        aria-label="Filtrar por estado"
                    >
                        <option value="todos">Todos los estados</option>
                        <option value="activo">Activos</option>
                        <option value="inactivo">Inactivos</option>
                    </select>
                </div>

                <button id="btn-add-product" className="btn btn--primary" onClick={onAdd}>
                    + Nuevo producto
                </button>
            </div>

            {/* Loading skeleton */}
            {loading && products.length === 0 && (
                <div className="skeleton-grid">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="skeleton-card">
                            <div className="skeleton skeleton--line" />
                            <div className="skeleton skeleton--line skeleton--short" />
                            <div className="skeleton skeleton--line skeleton--short" />
                        </div>
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!loading && filtered.length === 0 && (
                <div className="empty-state">
                    <div className="empty-state__icon">📦</div>
                    <h3 className="empty-state__title">
                        {products.length === 0 ? 'Sin productos aún' : 'Sin resultados'}
                    </h3>
                    <p className="empty-state__text">
                        {products.length === 0
                            ? 'Haz clic en "+ Nuevo producto" para agregar el primero.'
                            : 'Prueba con otros filtros o términos de búsqueda.'}
                    </p>
                </div>
            )}

            {/* Product grid */}
            {filtered.length > 0 && (
                <div className="product-grid">
                    {filtered.map((product) => (
                        <ProductCard
                            key={product.id}
                            product={product}
                            onEdit={onEdit}
                            onSoftDelete={handleSoftDelete}
                            onHardDelete={handleHardDelete}
                            isSoftDeleting={softDeletingId === product.id}
                            isHardDeleting={hardDeletingId === product.id}
                        />
                    ))}
                </div>
            )}

            {filtered.length > 0 && (
                <p className="list-count">
                    Mostrando {filtered.length} de {products.length} productos
                </p>
            )}
        </div>
    );
}
