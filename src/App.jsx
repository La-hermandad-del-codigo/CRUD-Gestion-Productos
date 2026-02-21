/**
 * App.jsx
 * Root component. Owns the view state (list vs. form) and wires
 * useProducts into ProductList and ProductForm.
 */

import { useState } from 'react';
import { useProducts } from './hooks/useProducts';
import ProductList from './components/ProductList';
import ProductForm from './components/ProductForm';
import Toast from './components/Toast';

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
        // UPDATE with optimistic update (handled inside editProduct)
        await editProduct(editingProduct.id, data);
        showToast(`✅ "${data.nombre}" actualizado correctamente.`);
      } else {
        // CREATE with parallel execution + rollback (handled inside createProduct)
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

  // ── Relay hook errors to toast (only when no toast is currently showing) ───
  if (error && !toast) {
    showToast(error, 'error');
    clearError();
  }

  return (
    <div className="app">
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
            <button
              id="btn-refresh"
              className="btn btn--ghost btn--sm"
              onClick={refreshProducts}
              disabled={loading}
              aria-label="Refrescar productos"
            >
              🔄 Refrescar
            </button>
          </div>
        </div>
      </header>

      {/* Parallel task status bar */}
      <div className="task-status-bar" aria-label="Estado de tareas paralelas">
        {(['products', 'categories', 'validation']).map((task) => {
          const labels = { products: 'Productos', categories: 'Categorías', validation: 'Validación' };
          const icons = { idle: '⏸', loading: '⏳', success: '✅', error: '❌' };
          const status = taskStatuses[task];
          return (
            <span key={task} className={`task-pill task-pill--${status}`}>
              {icons[status]} {labels[task]}
            </span>
          );
        })}
      </div>

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

      {/* Main content */}
      <main className="main">
        {view === 'list' && (
          <ProductList
            products={products}
            categories={categories}
            loading={loading}
            onEdit={openForm}
            onSoftDelete={handleSoftDelete}
            onHardDelete={handleHardDelete}
            onAdd={() => openForm(null)}
          />
        )}
      </main>

      {/* Form modal */}
      {view === 'form' && (
        <ProductForm
          product={editingProduct}
          onSave={handleSave}
          onCancel={closeForm}
          loading={loading}
          categories={categories}
        />
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
