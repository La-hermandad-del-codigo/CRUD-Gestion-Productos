/**
 * Toast.jsx
 * Auto-dismissible notification banner (success / error).
 */

export default function Toast({ message, type = 'success', onClose }) {
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };

    return (
        <div className={`toast toast--${type}`} role="alert" aria-live="assertive">
            <span className="toast__icon">{icons[type] ?? icons.info}</span>
            <span className="toast__message">{message}</span>
            <button
                type="button"
                className="toast__close btn-icon"
                onClick={onClose}
                aria-label="Cerrar notificación"
            >
                ✕
            </button>
        </div>
    );
}
