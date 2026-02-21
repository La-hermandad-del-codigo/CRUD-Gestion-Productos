/**
 * StatusBadge.jsx
 * Simple pill badge for product estado: activo / inactivo.
 */

export default function StatusBadge({ estado }) {
    return (
        <span className={`badge badge--${estado}`}>
            {estado === 'activo' ? 'Activo' : 'Inactivo'}
        </span>
    );
}
