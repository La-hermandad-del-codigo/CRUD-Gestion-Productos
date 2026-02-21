/**
 * App.jsx
 *
 * Componente raíz. Gestiona el estado de vista (lista / formulario) y conecta
 * useProducts con ProductList y ProductForm.
 *
 * CONCEPTOS DEMOSTRADOS:
 * ─────────────────────
 * 1. async/await en handlers — handleSave, handleSoftDelete y handleHardDelete
 *    son funciones async que usan await sobre las acciones del hook.
 *    Esto permite capturar errores con try/catch sin callbacks anidados.
 *
 * 2. Relay de errores del hook → Toast — el hook expone `error` (string | null).
 *    App.jsx detecta el cambio y lo envía al sistema de Toast para que el usuario
 *    siempre vea feedback visual, sin importar qué operación falló.
 *
 * 3. Modo "Forzar Error" — activa forceFailure en storageService durante 5 s.
 *    Permite demostrar en vivo que las tareas paralelas degradan correctamente
 *    (TaskStatusBar muestra errores por tarea) y que el flujo NO se rompe.
 *
 * 4. Estados de UI visibles:
 *    - loading    → spinner en el header + botones desactivados
 *    - error      → Toast tipo 'error' + TaskStatusBar por tarea
 *    - success    → Toast tipo 'success' + checkmarks en TaskStatusBar
 *    - forceError → banner de alerta rojo con countdown
 *
 * FLUJO DE DATOS:
 * ──────────────
 *   useProducts (hook)
 *       │ products, categories, loading, error, taskStatuses
 *       ↓
 *   App.jsx (estado de vista + handlers)
 *       │ products, onEdit, onSoftDelete, onHardDelete
 *       ↓
 *   ProductList → ProductCard (renderizado + acciones)
 *       │ data, onSave, onCancel
 *       ↓
 *   ProductForm (formulario de creación / edición)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useProducts } from './hooks/useProducts';
import ProductList from './components/ProductList';
import ProductForm from './components/ProductForm';
import Toast from './components/Toast';
import TaskStatusBar from './components/TaskStatusBar';
import ErrorBoundary from './components/ErrorBoundary';
import { setForceFailure } from './services/storageService';

/** Duración en segundos del modo de error forzado. */
const FORCE_ERROR_SECONDS = 5;

export default function App() {
  // ── Datos y acciones del hook ───────────────────────────────────────────────
  // useProducts encapsula toda la lógica async (Promise.allSettled, optimistic
  // update, rollback). App.jsx solo consume estado y llama actions.
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

  // ── Estado de vista ─────────────────────────────────────────────────────────
  const [view, setView] = useState('list');           // 'list' | 'form'
  const [editingProduct, setEditingProduct] = useState(null);
  const [toast, setToast] = useState(null);           // { message, type }

  // ── Tema oscuro / claro ─────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    // Aplicar / quitar la clase CSS al body cuando cambia el modo
    if (darkMode) {
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.add('light-mode');
    }
  }, [darkMode]);

  // ── Estado del modo "Forzar Error" ─────────────────────────────────────────
  //
  // Al activarse:
  //   1. setForceFailure(true) → storageService falla al 100 %
  //   2. Un intervalo decrementa el countdown visible (1 s → 0 s)
  //   3. Un timeout desactiva el modo tras FORCE_ERROR_SECONDS segundos
  //   4. Al expirar, se llama refreshProducts() para demostrar la recuperación
  //
  // Por qué useRef para los timers:
  //   useRef no provoca re-renders al mutar .current. Es el lugar correcto
  //   para guardar IDs de timers que solo necesitan usarse en cleanup.

  const [forceErrorActive, setForceErrorActive] = useState(false);
  const [forceErrorCountdown, setForceErrorCountdown] = useState(0);
  const forceErrorTimerRef = useRef(null);
  const forceErrorIntervalRef = useRef(null);

  const activateForceError = useCallback(() => {
    if (forceErrorActive) return;

    // Activar el flag global en storageService
    setForceFailure(true);
    setForceErrorActive(true);
    setForceErrorCountdown(FORCE_ERROR_SECONDS);

    // Countdown visual: actualiza el contador cada segundo
    forceErrorIntervalRef.current = setInterval(() => {
      setForceErrorCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(forceErrorIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Desactivar automáticamente tras N segundos
    forceErrorTimerRef.current = setTimeout(() => {
      setForceFailure(false);        // restaurar comportamiento normal
      setForceErrorActive(false);
      setForceErrorCountdown(0);
      clearInterval(forceErrorIntervalRef.current);
      // Lanzar refreshProducts() para que el usuario vea la recuperación en vivo
      // async/await implícito: refreshProducts devuelve una Promise; no awaiteamos
      // porque el resultado no afecta el flujo de App.jsx directamente.
      refreshProducts();
      showToast('✅ Modo error desactivado. Operaciones restauradas.', 'success');
    }, FORCE_ERROR_SECONDS * 1000);
  }, [forceErrorActive, refreshProducts]);

  // Limpieza al desmontar: evitar actualizaciones de estado en timers huérfanos
  useEffect(() => {
    return () => {
      clearTimeout(forceErrorTimerRef.current);
      clearInterval(forceErrorIntervalRef.current);
      setForceFailure(false); // siempre restaurar al salir del componente
    };
  }, []);

  // ── Sistema de Toast (notificaciones) ─────────────────────────────────────
  //
  // Un simple setTimeout de 4 s limpia el toast. No usamos una librería
  // externa; el estado local es suficiente para este caso de uso.
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Transiciones de vista ─────────────────────────────────────────────────
  const openForm = (product = null) => {
    setEditingProduct(product);
    setView('form');
    clearError(); // limpiar errores anteriores al abrir el form
  };

  const closeForm = () => {
    setView('list');
    setEditingProduct(null);
    clearError();
  };

  // ── Handlers CRUD (async/await) ────────────────────────────────────────────
  //
  // Por qué async/await y no .then():
  //   La sintaxis async/await hace el flujo lineal y legible. El try/catch
  //   captura tanto errores síncronos (validación) como async (storage).
  //   Los errores no manejados aquí son capturados por withLoading en el hook
  //   y expuestos vía `error` → relay a Toast más abajo.

  /** CREATE / UPDATE — invocado por ProductForm al hacer submit */
  const handleSave = async (data) => {
    try {
      if (editingProduct) {
        // EDITAR: optimistic update en el hook → confirmación en storage
        await editProduct(editingProduct.id, data);
        showToast(`✅ "${data.nombre}" actualizado correctamente.`);
      } else {
        // CREAR: addProduct + saveCategories en paralelo dentro del hook
        await createProduct(data);
        showToast(`✅ "${data.nombre}" agregado correctamente.`);
      }
      closeForm();
    } catch {
      // Error ya almacenado en hook.error → será retransmitido a Toast
      // más abajo por el bloque "Relay de errores del hook → Toast"
    }
  };

  /**
   * SOFT DELETE — marca estado = 'inactivo'
   * El hook aplica un optimistic update: si storage falla, revierte a 'activo'.
   */
  const handleSoftDelete = async (id) => {
    const product = products.find((p) => p.id === id);
    try {
      await removeProduct(id);
      showToast(`🔕 "${product?.nombre ?? 'Producto'}" desactivado.`, 'warning');
    } catch {
      // Error expuesto vía hook.error → Toast
    }
  };

  /**
   * HARD DELETE — eliminación física, solo para products.estado === 'inactivo'.
   * El hook NO usa optimistic update aquí (la eliminación es irreversible).
   */
  const handleHardDelete = async (id) => {
    const product = products.find((p) => p.id === id);
    try {
      await hardDeleteProduct(id);
      showToast(`🗑️ "${product?.nombre ?? 'Producto'}" eliminado definitivamente.`, 'error');
    } catch {
      // Error expuesto vía hook.error → Toast
    }
  };

  // ── Relay de errores del hook → Toast ─────────────────────────────────────
  //
  // El hook expone `error` (string | null). Si aparece un error nuevo Y no hay
  // ya un Toast activo, lo mostramos. Esto centraliza el manejo de errores:
  // nunca hay que manejar el error en múltiples lugares; el hook lo captura
  // y App.jsx lo muestra en un único punto.
  if (error && !toast) {
    showToast(error, 'error');
    clearError(); // resetear para que no se dispare de nuevo en el siguiente render
  }

  // ── Indicador de operación optimista en curso ─────────────────────────────
  //
  // Cuando el form está abierto para editar Y hay una operación de loading,
  // pasamos el id del producto en edición a ProductList para que muestre
  // el indicador de "actualizando..." en esa card específica.
  const optimisticId = (view === 'form' && loading && editingProduct) ? editingProduct.id : null;

  return (
    <div className={`app ${forceErrorActive ? 'app--force-error' : ''}`}>
      {/* ── Header ── */}
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
            {/* Estado de carga global — visible cuando cualquier op async está en curso */}
            {loading && (
              <span className="loading-indicator" aria-live="polite">
                <span className="spinner spinner--sm" aria-hidden="true" />
                Cargando…
              </span>
            )}

            {/* Toggle de tema: cambia la clase del body entre dark (default) y light */}
            <button
              id="btn-toggle-theme"
              className="btn btn--ghost btn--sm"
              onClick={() => setDarkMode((d) => !d)}
              aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              title={darkMode ? 'Modo claro' : 'Modo oscuro'}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>

            {/* Refrescar: dispara refreshProducts() que usa Promise.allSettled */}
            <button
              id="btn-refresh"
              className="btn btn--ghost btn--sm"
              onClick={refreshProducts}
              disabled={loading}
              aria-label="Refrescar productos"
            >
              🔄 Refrescar
            </button>

            {/* Forzar Error: activa forceFailure=true en storageService durante 5 s.
                Demuestra que las tareas paralelas pueden fallar individualmente
                y que la UI muestra cada error sin romper el flujo completo. */}
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

      {/* ── TaskStatusBar: muestra el estado individual de cada tarea paralela ── */}
      {/* products: success/error, categories: success/error, validation: success/error */}
      <TaskStatusBar taskStatuses={taskStatuses} />

      {/* ── Banner de modo error forzado (estado UI visible) ── */}
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

      {/* ── Banner de errores de integridad (de validateProducts) ── */}
      {/* Se actualiza cada vez que revalidate() completa en background */}
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

      {/* ── Contenido principal envuelto en ErrorBoundary ── */}
      {/* ErrorBoundary captura errores de render de React (distintos a errores async) */}
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
              optimisticId={optimisticId}  // ← id del producto con update en curso
            />
          )}
        </ErrorBoundary>
      </main>

      {/* ── Modal de formulario (también con ErrorBoundary) ── */}
      {view === 'form' && (
        <ErrorBoundary
          fallbackTitle="Error al renderizar el formulario"
          onReset={closeForm}
        >
          <ProductForm
            product={editingProduct}
            onSave={handleSave}           // async handler con await
            onCancel={closeForm}
            loading={loading}
            categories={categories}
          />
        </ErrorBoundary>
      )}

      {/* ── Toast: notificaciones de éxito / error / advertencia ── */}
      {/* Estado de éxito: tipo 'success' (verde) */}
      {/* Estado de error: tipo 'error' (rojo) — fed from hook.error relay */}
      {/* Estado de advertencia: tipo 'warning' (amarillo) — soft delete */}
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
