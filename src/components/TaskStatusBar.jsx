/**
 * TaskStatusBar.jsx
 * Visualizes the real-time status of each parallel task driven by useProducts.
 * Receives `taskStatuses` from the hook and renders animated pills.
 *
 * Statuses: 'idle' | 'loading' | 'success' | 'error'
 */

const TASK_LABELS = {
    products: 'Productos',
    categories: 'Categorías',
    validation: 'Validación',
};

const STATUS_ICONS = {
    idle: '⏸',
    loading: '⏳',
    success: '✅',
    error: '❌',
};

const STATUS_DESCRIPTIONS = {
    idle: 'en espera',
    loading: 'cargando…',
    success: 'completado',
    error: 'falló',
};

export default function TaskStatusBar({ taskStatuses = {} }) {
    const tasks = Object.keys(TASK_LABELS);

    return (
        <div className="task-status-bar" role="status" aria-label="Estado de tareas paralelas">
            <span className="task-status-bar__label">Tareas paralelas:</span>

            {tasks.map((task) => {
                const status = taskStatuses[task] ?? 'idle';
                return (
                    <span
                        key={task}
                        className={`task-pill task-pill--${status}`}
                        title={`${TASK_LABELS[task]}: ${STATUS_DESCRIPTIONS[status]}`}
                        aria-label={`${TASK_LABELS[task]} ${STATUS_DESCRIPTIONS[status]}`}
                    >
                        <span className="task-pill__icon" aria-hidden="true">
                            {status === 'loading' ? (
                                <span className="spinner spinner--xs" aria-hidden="true" />
                            ) : (
                                STATUS_ICONS[status]
                            )}
                        </span>
                        <span className="task-pill__text">{TASK_LABELS[task]}</span>
                    </span>
                );
            })}
        </div>
    );
}
