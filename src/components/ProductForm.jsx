/**
 * ProductForm.jsx
 * Add / Edit product form with full validation.
 */

import { useState, useEffect } from 'react';

const CATEGORIES = ['Electrónica', 'Ropa', 'Alimentos', 'Hogar', 'Deportes', 'Otros'];

const EMPTY_FORM = {
    nombre: '',
    precio: '',
    stock: '',
    categoria: 'Electrónica',
    estado: 'activo',
};

function validate(values) {
    const errors = {};
    if (!values.nombre.trim()) errors.nombre = 'El nombre es obligatorio.';
    else if (values.nombre.trim().length < 2) errors.nombre = 'Mínimo 2 caracteres.';

    const precio = parseFloat(values.precio);
    if (values.precio === '') errors.precio = 'El precio es obligatorio.';
    else if (isNaN(precio) || precio < 0) errors.precio = 'Debe ser un número positivo.';

    const stock = parseInt(values.stock, 10);
    if (values.stock === '') errors.stock = 'El stock es obligatorio.';
    else if (isNaN(stock) || stock < 0) errors.stock = 'Debe ser un entero ≥ 0.';

    return errors;
}

export default function ProductForm({ product, onSave, onCancel, loading }) {
    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});

    const isEditing = Boolean(product);

    useEffect(() => {
        if (product) {
            setForm({
                nombre: product.nombre,
                precio: String(product.precio),
                stock: String(product.stock),
                categoria: product.categoria,
                estado: product.estado,
            });
        } else {
            setForm(EMPTY_FORM);
        }
        setErrors({});
        setTouched({});
    }, [product]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
        // Validate on change once a field has been touched
        if (touched[name]) {
            const currentErrors = validate({ ...form, [name]: value });
            setErrors((prev) => ({ ...prev, [name]: currentErrors[name] }));
        }
    };

    const handleBlur = (e) => {
        const { name } = e.target;
        setTouched((prev) => ({ ...prev, [name]: true }));
        const currentErrors = validate(form);
        setErrors((prev) => ({ ...prev, [name]: currentErrors[name] }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const allTouched = Object.fromEntries(
            Object.keys(form).map((k) => [k, true])
        );
        setTouched(allTouched);

        const validationErrors = validate(form);
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            return;
        }

        const payload = {
            nombre: form.nombre.trim(),
            precio: parseFloat(form.precio),
            stock: parseInt(form.stock, 10),
            categoria: form.categoria,
            estado: form.estado,
        };

        await onSave(payload);
    };

    const fieldError = (name) =>
        touched[name] && errors[name] ? (
            <span className="field-error" role="alert">{errors[name]}</span>
        ) : null;

    return (
        <div className="form-overlay" role="dialog" aria-modal="true" aria-labelledby="form-title">
            <div className="form-panel">
                <div className="form-panel__header">
                    <h2 id="form-title" className="form-panel__title">
                        {isEditing ? '✏️ Editar producto' : '➕ Nuevo producto'}
                    </h2>
                    <button
                        type="button"
                        className="btn-icon"
                        onClick={onCancel}
                        aria-label="Cerrar formulario"
                        disabled={loading}
                    >
                        ✕
                    </button>
                </div>

                <form id="product-form" onSubmit={handleSubmit} noValidate className="form">
                    {/* Nombre */}
                    <div className="form-group">
                        <label htmlFor="field-nombre" className="form-label">
                            Nombre <span className="required">*</span>
                        </label>
                        <input
                            type="text"
                            id="field-nombre"
                            name="nombre"
                            value={form.nombre}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            className={`input ${touched.nombre && errors.nombre ? 'input--error' : ''}`}
                            placeholder="Ej. Auriculares Bluetooth"
                            maxLength={100}
                            disabled={loading}
                        />
                        {fieldError('nombre')}
                    </div>

                    {/* Precio & Stock */}
                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="field-precio" className="form-label">
                                Precio (USD) <span className="required">*</span>
                            </label>
                            <input
                                type="number"
                                id="field-precio"
                                name="precio"
                                value={form.precio}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                className={`input ${touched.precio && errors.precio ? 'input--error' : ''}`}
                                placeholder="0.00"
                                min="0"
                                step="0.01"
                                disabled={loading}
                            />
                            {fieldError('precio')}
                        </div>

                        <div className="form-group">
                            <label htmlFor="field-stock" className="form-label">
                                Stock <span className="required">*</span>
                            </label>
                            <input
                                type="number"
                                id="field-stock"
                                name="stock"
                                value={form.stock}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                className={`input ${touched.stock && errors.stock ? 'input--error' : ''}`}
                                placeholder="0"
                                min="0"
                                step="1"
                                disabled={loading}
                            />
                            {fieldError('stock')}
                        </div>
                    </div>

                    {/* Categoría & Estado */}
                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="field-categoria" className="form-label">Categoría</label>
                            <select
                                id="field-categoria"
                                name="categoria"
                                value={form.categoria}
                                onChange={handleChange}
                                className="select"
                                disabled={loading}
                            >
                                {CATEGORIES.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label htmlFor="field-estado" className="form-label">Estado</label>
                            <select
                                id="field-estado"
                                name="estado"
                                value={form.estado}
                                onChange={handleChange}
                                className="select"
                                disabled={loading}
                            >
                                <option value="activo">Activo</option>
                                <option value="inactivo">Inactivo</option>
                            </select>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="form-actions">
                        <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={onCancel}
                            disabled={loading}
                        >
                            Cancelar
                        </button>
                        <button
                            id="btn-submit-product"
                            type="submit"
                            className="btn btn--primary"
                            disabled={loading}
                        >
                            {loading ? (
                                <><span className="spinner" aria-hidden="true" /> Guardando...</>
                            ) : (
                                isEditing ? 'Actualizar' : 'Agregar producto'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
