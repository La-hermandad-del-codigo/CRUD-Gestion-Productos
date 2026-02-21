/**
 * ProductCard.jsx
 * Displays a single product with edit/delete actions.
 */

import StatusBadge from './StatusBadge';

export default function ProductCard({ product, onEdit, onDelete, isDeleting }) {
    const formatPrice = (price) =>
        new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(price);

    return (
        <article className={`product-card ${product.estado === 'inactivo' ? 'product-card--inactive' : ''}`}>
            <div className="product-card__header">
                <span className="product-card__category">{product.categoria}</span>
                <StatusBadge estado={product.estado} />
            </div>

            <h3 className="product-card__name">{product.nombre}</h3>

            <div className="product-card__details">
                <div className="product-card__detail">
                    <span className="product-card__detail-label">Precio</span>
                    <span className="product-card__detail-value product-card__price">
                        {formatPrice(product.precio)}
                    </span>
                </div>
                <div className="product-card__detail">
                    <span className="product-card__detail-label">Stock</span>
                    <span className={`product-card__detail-value ${product.stock === 0 ? 'product-card__stock--empty' : ''}`}>
                        {product.stock} uds.
                    </span>
                </div>
            </div>

            <div className="product-card__actions">
                <button
                    className="btn btn--outline"
                    onClick={() => onEdit(product)}
                    disabled={isDeleting}
                    aria-label={`Editar ${product.nombre}`}
                >
                    ✏️ Editar
                </button>
                <button
                    className="btn btn--danger"
                    onClick={() => onDelete(product.id)}
                    disabled={isDeleting}
                    aria-label={`Eliminar ${product.nombre}`}
                >
                    {isDeleting ? '⏳' : '🗑️'} Eliminar
                </button>
            </div>
        </article>
    );
}
