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
    loading,
    error,
    createProduct,
    editProduct,
    removeProduct,
    clearError,
    fetchProducts,
  } = useProducts();

  // ── View state ─────────────────────────────────────────────────────────────
  const [view, setView] = useState('list'); // 'list' | 'form'
  const [editingProduct, setEditingProduct] = useState(null);
  const [toast, setToast] = useState(null); // { message, type:'success'|'error' }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

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
  const handleSave = async (data) => {
    try {
      if (editingProduct) {
        await editProduct(editingProduct.id, data);
        showToast(`"${data.nombre}" actualizado correctamente.`);
      } else {
        await createProduct(data);
        showToast(`"${data.nombre}" agregado correctamente.`);
      }
      closeForm();
    } catch {
      // error already stored in hook's `error` state, shown via Toast below
    }
  };

  const handleDelete = async (id) => {
    try {
      const product = products.find((p) => p.id === id);
      await removeProduct(id);
      showToast(`"${product?.nombre ?? 'Producto'}" eliminado.`);
    } catch {
      // error shown via error → Toast
    }
  };

  // ── Rendered error → show as toast ─────────────────────────────────────────
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
              onClick={fetchProducts}
              disabled={loading}
              aria-label="Refrescar productos"
            >
              🔄 Refrescar
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="main">
        {view === 'list' && (
          <ProductList
            products={products}
            loading={loading}
            onEdit={openForm}
            onDelete={handleDelete}
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
