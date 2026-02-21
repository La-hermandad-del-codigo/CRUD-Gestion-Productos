/**
 * ProductList.jsx
 * Grid view of all products with search, filter, and stats bar.
 */

import { useState } from 'react';
import ProductCard from './ProductCard';

const CATEGORIES = ['Todos', 'Electrónica', 'Ropa', 'Alimentos', 'Hogar', 'Deportes', 'Otros'];

export default function ProductList({ products, loading, onEdit, onDelete, onAdd }) {
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('Todos');
    const [statusFilter, setStatusFilter] = useState('todos');
    const [deletingId, setDeletingId] = useState(null);

    const handleDelete = async (id) => {
        if (!window.confirm('¿Estás seguro de que deseas eliminar este producto?')) return;
        setDeletingId(id);
        try {
            await onDelete(id);
        } finally {
            setDeletingId(null);
        }
    };

    // Filtering
    const filtered = products.filter((p) => {
        const matchSearch = p.nombre.toLowerCase().includes(search.toLowerCase()) ||
            p.categoria.toLowerCase().includes(search.toLowerCase());
        const matchCat = categoryFilter === 'Todos' || p.categoria === categoryFilter;
        const matchStatus = statusFilter === 'todos' || p.estado === statusFilter;
        return matchSearch && matchCat && matchStatus;
    });

    const totalActive = products.filter((p) => p.estado === 'activo').length;
    const totalValue = products.reduce((sum, p) => sum + p.precio * p.stock, 0);

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
                        {CATEGORIES.map((c) => (
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
                            onDelete={handleDelete}
                            isDeleting={deletingId === product.id}
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
