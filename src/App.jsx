/**
 * App.jsx
 * Root component. Owns the view state (list vs. form) and wires
 * useProducts into ProductList and ProductForm.
 *
 * New features:
 *  - <TaskStatusBar /> component for parallel task visualization
 *  - <ErrorBoundary /> wrapping the main content
 *  - "Forzar Error" button: forces 100% failure in storageService for 5 seconds
 *  - Dark/Light mode toggle (dark is the default)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useProducts } from './hooks/useProducts';
import ProductList from './components/ProductList';
import ProductForm from './components/ProductForm';
import Toast from './components/Toast';
import TaskStatusBar from './components/TaskStatusBar';
import ErrorBoundary from './components/ErrorBoundary';
import { setForceFailure } from './services/storageService';

const FORCE_ERROR_SECONDS = 5;

export default function App() {
  const {
    products,
    categories,
    validationErrors,
    loading,
    error,
    taskStatuses,
    refreshProducts,
    createProduct,
    editProduct,
    removeProduct,
    hardDeleteProduct,
    clearError,
  } = useProducts();

  // ── View state ─────────────────────────────────────────────────────────────
  const [view, setView] = useState('list'); // 'list' | 'form'
  const [editingProduct, setEditingProduct] = useState(null);
  const [toast, setToast] = useState(null); // { message, type:'success'|'error'|'warning' }

  // ── Dark / Light mode ──────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    if (darkMode) {
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.add('light-mode');
    }
  }, [darkMode]);

  // ── Force Error state ──────────────────────────────────────────────────────
  const [forceErrorActive, setForceErrorActive] = useState(false);
  const [forceErrorCountdown, setForceErrorCountdown] = useState(0);
  const forceErrorTimerRef = useRef(null);
  const forceErrorIntervalRef = useRef(null);

  const activateForceError = useCallback(() => {
    if (forceErrorActive) return;

    setForceFailure(true);
    setForceErrorActive(true);
    setForceErrorCountdown(FORCE_ERROR_SECONDS);

    // Countdown interval
    forceErrorIntervalRef.current = setInterval(() => {
      setForceErrorCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(forceErrorIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Auto-deactivate after N seconds
    forceErrorTimerRef.current = setTimeout(() => {
      setForceFailure(false);
      setForceErrorActive(false);
      setForceErrorCountdown(0);
      clearInterval(forceErrorIntervalRef.current);
      // Trigger a refresh so the user sees recovery
      refreshProducts();
      showToast('✅ Modo error desactivado. Operaciones restauradas.', 'success');
    }, FORCE_ERROR_SECONDS * 1000);
  }, [forceErrorActive, refreshProducts]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(forceErrorTimerRef.current);
      clearInterval(forceErrorIntervalRef.current);
      setForceFailure(false);
    };
  }, []);

  // ── Toast helper ───────────────────────────────────────────────────────────
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Form transitions ───────────────────────────────────────────────────────
  const openForm = (product = null) => {
    setEditingProduct(product);
    setView('form');
    clearError();
  };

  const closeForm = () => {
    setView('list');
    setEditingProduct(null);
    clearError();
  };

  // ── CRUD handlers ──────────────────────────────────────────────────────────

  /** CREATE / UPDATE — called from ProductForm on submit */
  const handleSave = async (data) => {
    try {
      if (editingProduct) {
        await editProduct(editingProduct.id, data);
        showToast(`✅ "${data.nombre}" actualizado correctamente.`);
      } else {
        await createProduct(data);
        showToast(`✅ "${data.nombre}" agregado correctamente.`);
      }
      closeForm();
    } catch {
      // Error already stored in hook's `error` state → rendered as toast below
    }
  };

  /** SOFT DELETE — sets estado = 'inactivo', with optimistic update + revert */
  const handleSoftDelete = async (id) => {
    const product = products.find((p) => p.id === id);
    try {
      await removeProduct(id);
      showToast(`🔕 "${product?.nombre ?? 'Producto'}" desactivado.`, 'warning');
    } catch {
      // Error shown via error → Toast
    }
  };

  /** HARD DELETE — physically removes an already-inactive product */
  const handleHardDelete = async (id) => {
    const product = products.find((p) => p.id === id);
    try {
      await hardDeleteProduct(id);
      showToast(`🗑️ "${product?.nombre ?? 'Producto'}" eliminado definitivamente.`, 'error');
    } catch {
      // Error shown via error → Toast
    }
  };

  // ── Relay hook errors to toast ─────────────────────────────────────────────
  if (error && !toast) {
    showToast(error, 'error');
    clearError();
  }

  // ── Optimistic ID: which product is being edited right now ─────────────────
  // When the form is open with an existing product AND a loading op is in progress,
  // that product gets the optimistic indicator in the list behind the modal.
  const optimisticId = (view === 'form' && loading && editingProduct) ? editingProduct.id : null;

  return (
    <div className={`app ${forceErrorActive ? 'app--force-error' : ''}`}>
      {/* Header */}
      <header className="header">
        <div className="header__inner">
          <div className="header__brand">
            <span className="header__logo">📦</span>
            <div>
              <h1 className="header__title">Gestión de Productos</h1>
              <p className="header__subtitle">CRUD con localStorage</p>
            </div>
          </div>

          <div className="header__actions">
            {loading && (
              <span className="loading-indicator" aria-live="polite">
                <span className="spinner spinner--sm" aria-hidden="true" />
                Cargando…
              </span>
            )}

            {/* Dark / Light Mode toggle */}
            <button
              id="btn-toggle-theme"
              className="btn btn--ghost btn--sm"
              onClick={() => setDarkMode((d) => !d)}
              aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              title={darkMode ? 'Modo claro' : 'Modo oscuro'}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>

            <button
              id="btn-refresh"
              className="btn btn--ghost btn--sm"
              onClick={refreshProducts}
              disabled={loading}
              aria-label="Refrescar productos"
            >
              🔄 Refrescar
            </button>

            {/* Force Error button */}
            <button
              id="btn-force-error"
              className={`btn btn--sm ${forceErrorActive ? 'btn--force-error-active' : 'btn--danger'}`}
              onClick={activateForceError}
              disabled={forceErrorActive}
              aria-live="polite"
              title="Fuerza que storageService falle al 100% durante 5 segundos"
            >
              {forceErrorActive
                ? `🔴 Error activo (${forceErrorCountdown}s)`
                : '🔴 Forzar Error'}
            </button>
          </div>
        </div>
      </header>

      {/* Parallel task status bar */}
      <TaskStatusBar taskStatuses={taskStatuses} />

      {/* Force-error banner */}
      {forceErrorActive && (
        <div className="force-error-banner" role="alert" aria-live="assertive">
          <span className="force-error-banner__icon">🚨</span>
          <strong>Modo Error Forzado activo</strong> — todas las operaciones fallarán durante{' '}
          <strong>{forceErrorCountdown}</strong> segundo{forceErrorCountdown !== 1 ? 's' : ''}.
          <span className="force-error-banner__hint">
            Intenta Refrescar, Agregar o Editar un producto para verlo en vivo.
          </span>
        </div>
      )}

      {/* Validation warnings */}
      {validationErrors.length > 0 && (
        <div className="validation-banner" role="alert">
          <strong>⚠️ {validationErrors.length} problema(s) de integridad detectado(s):</strong>
          <ul className="validation-banner__list">
            {validationErrors.map((e) => (
              <li key={`${e.id}-${e.field}`}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Main content wrapped in ErrorBoundary */}
      <main className="main">
        <ErrorBoundary
          fallbackTitle="Error al renderizar la lista de productos"
          onReset={refreshProducts}
        >
          {view === 'list' && (
            <ProductList
              products={products}
              categories={categories}
              loading={loading}
              onEdit={openForm}
              onSoftDelete={handleSoftDelete}
              onHardDelete={handleHardDelete}
              onAdd={() => openForm(null)}
              optimisticId={optimisticId}
            />
          )}
        </ErrorBoundary>
      </main>

      {/* Form modal (also wrapped in its own ErrorBoundary) */}
      {view === 'form' && (
        <ErrorBoundary
          fallbackTitle="Error al renderizar el formulario"
          onReset={closeForm}
        >
          <ProductForm
            product={editingProduct}
            onSave={handleSave}
            onCancel={closeForm}
            loading={loading}
            categories={categories}
          />
        </ErrorBoundary>
      )}

      {/* Toast notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
