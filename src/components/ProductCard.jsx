/**
 * ProductCard.jsx
 * Displays a single product with edit, soft-delete, and hard-delete actions.
 *
 * Soft delete (Desactivar): only available when estado === 'activo'.
 *   → Sets estado to 'inactivo' (reversible via edit).
 *
 * Hard delete (Eliminar definitivamente): only available when estado === 'inactivo'.
 *   → Physically removes the product after a second confirmation.
 *
 * isOptimistic: cuando true, muestra indicador visual de "optimistic update" en progreso.
 */

import StatusBadge from './StatusBadge';

export default function ProductCard({
    product,
    onEdit,
    onSoftDelete,
    onHardDelete,
    isSoftDeleting,
    isHardDeleting,
    isOptimistic = false,
}) {
    const isDeleting = isSoftDeleting || isHardDeleting;

    const formatPrice = (price) =>
        new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(price);

    return (
        <article
            className={[
                'product-card',
                product.estado === 'inactivo' ? 'product-card--inactive' : '',
                isOptimistic ? 'product-card--optimistic' : '',
            ].filter(Boolean).join(' ')}
        >
            {/* Optimistic update badge */}
            {isOptimistic && (
                <div className="optimistic-badge" aria-live="polite">
                    <span className="spinner spinner--xs" aria-hidden="true" />
                    Actualizando…
                </div>
            )}

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
                    <span
                        className={`product-card__detail-value ${product.stock === 0 ? 'product-card__stock--empty' : ''}`}
                    >
                        {product.stock} uds.
                    </span>
                </div>
            </div>

            <div className="product-card__actions">
                {/* Edit — always available */}
                <button
                    className="btn btn--outline"
                    onClick={() => onEdit(product)}
                    disabled={isDeleting || isOptimistic}
                    aria-label={`Editar ${product.nombre}`}
                >
                    ✏️ Editar
                </button>

                {/* Soft delete — only when activo */}
                {product.estado === 'activo' && (
                    <button
                        className="btn btn--warning"
                        onClick={() => onSoftDelete(product.id)}
                        disabled={isDeleting || isOptimistic}
                        aria-label={`Desactivar ${product.nombre}`}
                    >
                        {isSoftDeleting ? (
                            <><span className="spinner spinner--sm" aria-hidden="true" /> Desactivando…</>
                        ) : (
                            '🔕 Desactivar'
                        )}
                    </button>
                )}

                {/* Hard delete — only when inactivo */}
                {product.estado === 'inactivo' && (
                    <button
                        className="btn btn--danger"
                        onClick={() => onHardDelete(product.id, product.nombre)}
                        disabled={isDeleting || isOptimistic}
                        aria-label={`Eliminar definitivamente ${product.nombre}`}
                    >
                        {isHardDeleting ? (
                            <><span className="spinner spinner--sm" aria-hidden="true" /> Eliminando…</>
                        ) : (
                            '🗑️ Eliminar definitiv.'
                        )}
                    </button>
                )}
            </div>
        </article>
    );
}
