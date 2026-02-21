/**
 * ErrorBoundary.jsx
 * Class component that catches render-phase errors and shows a friendly fallback.
 * Use this to wrap any subtree that could potentially throw during render.
 *
 * Props:
 *   - children: ReactNode
 *   - fallbackTitle?: string  (default: 'Algo salió mal')
 *   - onReset?: () => void    (called when user clicks "Reintentar")
 */

import { Component } from 'react';

export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo });
        // In a real app you'd send error + errorInfo to a monitoring service here
        console.error('[ErrorBoundary] Render error caught:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
        this.props.onReset?.();
    };

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        const { fallbackTitle = 'Algo salió mal' } = this.props;
        const isDev = import.meta.env.DEV;

        return (
            <div className="error-boundary" role="alert" aria-live="assertive">
                <div className="error-boundary__card">
                    <div className="error-boundary__icon" aria-hidden="true">💥</div>

                    <h2 className="error-boundary__title">{fallbackTitle}</h2>

                    <p className="error-boundary__message">
                        Se produjo un error inesperado durante el renderizado.
                        <br />
                        Puedes intentar recargar la vista o refrescar la página.
                    </p>

                    {isDev && this.state.error && (
                        <details className="error-boundary__details">
                            <summary className="error-boundary__summary">
                                🔍 Detalles del error (modo desarrollo)
                            </summary>
                            <pre className="error-boundary__stack">
                                {this.state.error.toString()}
                                {'\n\n'}
                                {this.state.errorInfo?.componentStack ?? ''}
                            </pre>
                        </details>
                    )}

                    <div className="error-boundary__actions">
                        <button
                            className="btn btn--primary"
                            onClick={this.handleReset}
                            id="btn-error-boundary-reset"
                        >
                            🔄 Reintentar
                        </button>
                        <button
                            className="btn btn--ghost"
                            onClick={() => window.location.reload()}
                            id="btn-error-boundary-reload"
                        >
                            🔃 Recargar página
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
