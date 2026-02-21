# 📦 CRUD Gestión de Productos

Aplicación web de gestión de productos construida con **React + Vite**, que demuestra patrones avanzados de programación asíncrona: paralelismo con Promises, manejo de errores sin interrupciones, actualizaciones optimistas con rollback y persistencia en `localStorage`.

---

## 🚀 ¿Cómo correr el proyecto?

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar servidor de desarrollo
npm run dev

# 3. Abrir en el navegador
# → http://localhost:5173
```

> No requiere backend ni base de datos. Todos los datos se almacenan en `localStorage`.

---

## 🧠 Conceptos demostrados

| Concepto | Dónde se usa | Por qué |
|---|---|---|
| **`async/await`** | Todas las funciones públicas de `storageService.js`; handlers en `App.jsx`; `withLoading` en `useProducts.js` | Convierte operaciones asíncronas en código lineal y legible; unifica el manejo de errores con `try/catch` |
| **`Promise.all`** | — | No se usa porque cualquier fallo cancelaría **todas** las tareas |
| **`Promise.allSettled`** | `refreshProducts()` (carga inicial) y `createProduct()` en `useProducts.js` | Permite que tareas **independientes** fallen individualmente sin afectar a las demás; provee el resultado de cada tarea para decisiones de rollback |
| **Ejecución paralela** | Las 3 tareas de arranque (`getProducts`, `getCategories`, `validateProducts`) | Se lanzan simultáneamente; el tiempo total ≈ el de la tarea más lenta, no la suma |
| **Integración de resultados** | Bloque post-`allSettled` en `refreshProducts` | Un único grupo de `setState` cuando todas las Promises completan (React batching) |
| **Optimistic Update** | `editProduct` y `removeProduct` en `useProducts.js` | El cambio aparece en la UI instantáneamente; si storage falla, se revierte al estado anterior |
| **Rollback** | `editProduct`, `removeProduct`, `createProduct` (categorías) | Garantiza consistencia entre UI y storage ante fallos |
| **Soft Delete** | `removeProduct` → `estado = 'inactivo'` | Los datos se marcan como inactivos sin eliminarse; permite auditoría y recuperación |
| **Hard Delete** | `hardDeleteProduct` → eliminación física | Solo permitido sobre productos ya inactivos; no usa optimistic update (operación irreversible) |
| **Manejo de errores** | `withLoading` en `useProducts.js` relanza; `App.jsx` hace relay a Toast | Centraliza la captura de errores; el llamador puede hacer rollback antes de que el error llegue a la UI |
| **Estados UI** | `loading`, `error`, `taskStatuses` (por tarea), Toast, Banner | El usuario siempre sabe qué está pasando: cargando / éxito / error |

---

## 🗂️ Estructura del proyecto

```
src/
├── App.jsx                   # Componente raíz; maneja vista, handlers y relay de errores
├── index.css                 # Diseño completo (dark/light mode, animaciones)
├── main.jsx                  # Entry point de React
│
├── services/
│   └── storageService.js     # Capa de datos async con localStorage
│                             #   - withSimulation(): latencia + fallos aleatorios
│                             #   - setForceFailure(): modo 100% fallo para demos
│                             #   - getProducts / addProduct / updateProduct / deleteProduct
│                             #   - hardDeleteProduct / getCategories / validateProducts
│
├── hooks/
│   └── useProducts.js        # Hook que implementa:
│                             #   - refreshProducts() → Promise.allSettled (3 tareas en paralelo)
│                             #   - createProduct()   → Promise.allSettled + rollback categorías
│                             #   - editProduct()     → optimistic update + rollback
│                             #   - removeProduct()   → soft delete optimistic + rollback
│                             #   - hardDeleteProduct() → hard delete confirmado
│
└── components/
    ├── ErrorBoundary.jsx     # Captura errores de render de React
    ├── ProductList.jsx       # Lista de productos con filtros
    ├── ProductCard.jsx       # Tarjeta individual + indicador de update en curso
    ├── ProductForm.jsx       # Formulario de creación/edición con validación en tiempo real
    ├── TaskStatusBar.jsx     # Barra de estado por tarea paralela (idle/loading/success/error)
    ├── StatusBadge.jsx       # Badge activo/inactivo
    └── Toast.jsx             # Notificación temporal de éxito/error/advertencia
```

---

## ✅ Verificación de criterios de la actividad

### 1. Tareas independientes ejecutadas en paralelo

**Archivo:** `src/hooks/useProducts.js` → función `refreshProducts`

```js
// Las tres promesas SE INICIAN simultáneamente (no hay await entre ellas)
const [productsResult, categoriesResult, validationResult] =
    await Promise.allSettled([
        getProducts(),       // tarea 1
        getCategories(),     // tarea 2
        validateProducts(),  // tarea 3
    ]);
```

**Cómo verificar:** Abre DevTools → pestaña Network (o Console). Al cargar la app o pulsar "Refrescar", las 3 llamadas aparecen solapadas en el tiempo.

---

### 2. Integración de resultados con un solo setState

Después del `await Promise.allSettled(...)`, todos los `setX` se ejecutan en un único ciclo de render de React (batching de React 18). No hay renders intermedios entre la llegada de cada tarea.

```js
setProducts(productsResult.value);
setCategories(categoriesResult.value);
setValidationErrors(validationResult.value);
setTaskStatuses(newStatuses);   // ← un solo grupo de setState
setLoading(false);
```

---

### 3. Manejo de fallos sin romper el flujo

**Cómo probar:**
1. Pulsa **"🔴 Forzar Error"** en el header.
2. Pulsa **"🔄 Refrescar"**.
3. Observa en el `TaskStatusBar` que cada tarea puede fallar independientemente.
4. Los datos que **sí** se cargaron antes siguen visibles; solo se muestra un error por tarea.

---

### 4. Optimistic Update con Rollback

**Cómo probar:**
1. Activa **"🔴 Forzar Error"** (100 % fallos).
2. Edita un producto y guarda.
3. El cambio aparece **instantáneamente** en la UI…
4. …y luego **revierte** al valor original cuando storage confirma el fallo.

---

### 5. Estados claros en UI

| Estado | Cómo se muestra |
|---|---|
| `loading` | Spinner en el header + texto "Cargando…" |
| `error` | Toast rojo + barra de error por tarea en TaskStatusBar |
| `success` | Toast verde + checkmarks verdes en TaskStatusBar |
| `force-error` | Banner rojo con countdown + borde rojo en toda la app |
| `validation error` | Banner amarillo con lista de productos con datos inválidos |
| `optimistic` | Indicador "Actualizando…" en la ProductCard afectada |

---

### 6. Soft Delete y Hard Delete

| Operación | Resultado | Reversible |
|---|---|---|
| **Soft Delete** | `estado = 'inactivo'` en localStorage | ✅ (editando el producto) |
| **Hard Delete** | Eliminado físicamente de localStorage | ❌ |

> El Hard Delete solo está disponible sobre productos **ya marcados como inactivos** (requiere soft delete previo).

---

## 🛠️ Stack técnico

- **React 19** con Hooks (`useState`, `useEffect`, `useCallback`, `useRef`)
- **Vite 6** como bundler / dev server
- **CSS puro** (sin frameworks) — diseño dark/light mode, animaciones, glassmorphism
- **localStorage** como capa de persistencia
- Sin dependencias de terceros para estado (sin Redux, Zustand, etc.)

---

## 📝 Decisiones de diseño

### ¿Por qué `Promise.allSettled` y no `Promise.all`?

`Promise.all` rechaza completamente si **una sola** promesa falla. En el contexto de carga inicial:
- Si `validateProducts` falla (error aleatoriamente), no queremos perder los productos y categorías ya cargados.
- `Promise.allSettled` devuelve el resultado de **cada tarea** independientemente, permitiendo integrar los resultados parciales y mostrar errores específicos por tarea.

### ¿Por qué re-lanzar errores en `withLoading`?

`withLoading` captura el error y llama a `setError` para mostrarlo en la UI. Pero también **relanza** el error para que el llamador (`editProduct`, `removeProduct`) pueda ejecutar su lógica de **rollback** antes de que el error llegue al sistema de Toast. Sin el re-throw, el rollback nunca se ejecutaría.

### ¿Por qué no hay optimistic update en Hard Delete?

La eliminación física es **irreversible**. Si se eliminara de la UI antes de que storage confirmara y storage fallara, sería necesario reconstruir el elemento — frágil y propenso a bugs de posición. El Hard Delete espera siempre la confirmación de storage antes de actualizar la UI.
