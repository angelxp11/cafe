import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { FaDownload, FaEdit, FaPlus, FaTrash } from 'react-icons/fa';
import { db } from '../../server/api';
import LoadingScreen from '../../resources/loading/LoadingScreen';
import toast from '../../resources/toast/toast';
import './inventario.css';

const emptyProduct = {
	identificador: '', categoria: '', nombre: '', venta: 'unidad', unidadesPorPaquete: '',
	precioUnidad: '', precioPaquete: '', abastecimiento: 'unidad', mayoreo: '', stock: '10', tipo: 'final', ingredientes: [],
	modoSabores: 'general', sabores: [],
};

function getNextIdentifier(products) {
	const highest = products.reduce((currentHighest, product) => {
		const value = Number.parseInt(product.identificador, 10);
		return Number.isNaN(value) ? currentHighest : Math.max(currentHighest, value);
	}, 0);
	return String(highest + 1).padStart(12, '0');
}

function formatPrice(value) {
	const digits = String(value ?? '').replace(/\D/g, '');
	return digits ? Number(digits).toLocaleString('es-CO') : '';
}

function getPriceDigits(value) {
	return String(value ?? '').replace(/\D/g, '');
}

function normalizeFlavors(flavors = []) {
	return flavors.map((flavor) =>
		typeof flavor === 'string'
			? { nombre: flavor, stock: '' }
			: { nombre: flavor.nombre || '', stock: flavor.stock ?? '' }
	);
}

function Inventario({ profile }) {
	const [products, setProducts] = useState([]);
	const [categories, setCategories] = useState([]);
	const [loading, setLoading] = useState(true);
	const [modalOpen, setModalOpen] = useState(false);
	const [editingProduct, setEditingProduct] = useState(null);
	const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
	const [searchTerm, setSearchTerm] = useState('');
	const [selectedCategory, setSelectedCategory] = useState('Todas');
	const isAdmin = profile?.rol === 'admin';
	const filteredProducts = products.filter((product) => {
		const matchesName = product.nombre?.toLocaleLowerCase('es-ES').includes(searchTerm.trim().toLocaleLowerCase('es-ES'));
		const matchesCategory = selectedCategory === 'Todas' || product.categoria === selectedCategory;
		return matchesName && matchesCategory;
	});

	useEffect(() => {
		const unsubscribe = onSnapshot(collection(db, 'inventario'), (snapshot) => {
			setProducts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
			setLoading(false);
		}, () => {
			toast.error('No se pudieron cargar los productos.');
			setLoading(false);
		});
		const unsubscribeCategories = onSnapshot(collection(db, 'categorias'), (snapshot) => {
			setCategories(snapshot.docs.map((item) => item.data().nombre).filter(Boolean));
		});
		return () => { unsubscribe(); unsubscribeCategories(); };
	}, []);

	function openCreate() {
		setEditingProduct({ ...emptyProduct, identificador: getNextIdentifier(products), isNew: true });
		setModalOpen(true);
	}

	function openEdit(product) {
		setEditingProduct(product);
		setModalOpen(true);
	}

	async function removeProduct(product) {
		if (!window.confirm(`¿Eliminar ${product.nombre}?`)) return;
		try {
			await deleteDoc(doc(db, 'inventario', product.id));
			toast.success('Producto eliminado.');
		} catch (error) {
			toast.error('No se pudo eliminar el producto.');
		}
	}

	function downloadFile(content, fileName, type) {
		const blob = new Blob([content], { type });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = fileName;
		link.click();
		URL.revokeObjectURL(url);
		setDownloadMenuOpen(false);
		toast.success('Inventario descargado correctamente.');
	}

	function downloadInventoryCsv() {
		if (products.length === 0) {
			toast.warning('No hay productos para descargar.');
			return;
		}

		const headers = ['Identificador', 'Nombre', 'Categoría', 'Sabores', 'Venta', 'Precio por unidad', 'Precio paquete', 'Unidades por paquete', 'Abastecimiento', 'Unidades por mayoreo', 'Stock', 'Tipo', 'Ingredientes'];
		const rows = products.map((product) => [
			product.identificador,
			product.nombre,
			product.categoria,
			product.modoSabores === 'sabores' ? (product.sabores || []).map((flavor) => typeof flavor === 'string' ? flavor : `${flavor.nombre} (${flavor.stock})`).join(' | ') : 'GENERAL',
			product.venta,
			product.precioUnidad || 0,
			product.precioPaquete || 0,
			product.unidadesPorPaquete || 0,
			product.abastecimiento,
			product.unidadesMayoreo || 0,
			product.stock || 0,
			product.tipo === 'preparable' ? 'PREPARAR' : 'FINAL',
			(product.ingredientes || []).map((ingredient) => `${ingredient.nombre} (${ingredient.medida})`).join(' | '),
		]);
		const csv = [headers, ...rows].map((row) => row.map(csvValue).join(';')).join('\r\n');
		downloadFile(`\uFEFF${csv}`, `inventario-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;');
	}

	function downloadInventoryJson() {
		if (products.length === 0) {
			toast.warning('No hay productos para descargar.');
			return;
		}
		downloadFile(JSON.stringify(products, null, 2), `inventario-${new Date().toISOString().slice(0, 10)}.json`, 'application/json;charset=utf-8;');
	}

	function csvValue(value) {
		return `"${String(value ?? '').replace(/"/g, '""')}"`;
	}

	if (loading) return <LoadingScreen text="Cargando inventario" />;

	return (
		<section className="inventory-page" aria-labelledby="inventory-title">
			<header className="app-content-header inventory-header">
				<div><p className="app-eyebrow">Control de productos</p><h1 id="inventory-title">Inventario</h1><p className="app-intro">Administra existencias, venta y preparación.</p></div>
				<div className="inventory-header-actions">
					<div className="inventory-download-menu">
						<button className="inventory-download-button" type="button" aria-expanded={downloadMenuOpen} onClick={() => setDownloadMenuOpen((open) => !open)}><FaDownload aria-hidden="true" /><span>Descargar inventario</span></button>
						{downloadMenuOpen && <div className="inventory-format-menu" role="menu"><button type="button" role="menuitem" onClick={downloadInventoryJson}>JSON</button><button type="button" role="menuitem" onClick={downloadInventoryCsv}>CSV</button></div>}
					</div>
					{isAdmin && <button className="inventory-create-button" type="button" onClick={openCreate}><FaPlus aria-hidden="true" /><span>Nuevo producto</span></button>}
				</div>
			</header>
			<div className="inventory-filters">
				<label className="inventory-search-field" htmlFor="inventory-search">Buscar por nombre<input id="inventory-search" type="search" placeholder="Ej. Café latte" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} /></label>
				<label className="inventory-category-field" htmlFor="inventory-category-filter">Filtrar por categoría<select id="inventory-category-filter" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}><option value="Todas">Todas</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
				{(searchTerm || selectedCategory !== 'Todas') && <button className="inventory-clear-filters" type="button" onClick={() => { setSearchTerm(''); setSelectedCategory('Todas'); }}>Limpiar filtros</button>}
			</div>
			{products.length === 0 ? <div className="inventory-empty"><h2>No hay productos</h2><p>Agrega el primer producto al inventario.</p></div> : filteredProducts.length === 0 ? <div className="inventory-empty"><h2>Sin resultados</h2><p>No hay productos que coincidan con los filtros.</p></div> : (
				<div className="inventory-table-wrapper"><table className="inventory-table">
					<thead><tr><th>Identificador</th><th>Producto</th><th>Categoría</th><th>Sabores</th><th>Venta</th><th>Precio unidad</th><th>Abastecimiento</th><th>Stock</th><th>Tipo</th>{isAdmin && <th>Acciones</th>}</tr></thead>
					<tbody>{filteredProducts.map((product) => <tr key={product.id}>
						<td>{product.identificador}</td><td><strong>{product.nombre}</strong>{product.tipo === 'preparable' && <small> {product.ingredientes?.length || 0} ingredientes</small>}</td><td>{product.categoria}</td><td>{product.modoSabores === 'sabores' ? product.sabores?.map((flavor) => typeof flavor === 'string' ? flavor : `${flavor.nombre} (${flavor.stock})`).join(', ') : 'GENERAL'}</td><td>{product.venta}</td><td>${formatPrice(product.precioUnidad)}</td><td>{product.abastecimiento}{product.unidadesMayoreo ? ` (${product.unidadesMayoreo})` : ''}</td><td>{product.modoSabores === 'sabores' ? product.sabores?.map((flavor) => typeof flavor === 'string' ? `${flavor}: -` : `${flavor.nombre}: ${flavor.stock}`).join(', ') : product.stock}</td><td>{product.tipo === 'preparable' ? 'Preparar' : 'Final'}</td>
						{isAdmin && <td className="inventory-actions"><button type="button" aria-label={`Editar ${product.nombre}`} onClick={() => openEdit(product)}><FaEdit /></button><button type="button" aria-label={`Eliminar ${product.nombre}`} onClick={() => removeProduct(product)}><FaTrash /></button></td>}
					</tr>)}</tbody>
				</table></div>
			)}
			{modalOpen && isAdmin && <ProductModal product={editingProduct} categories={categories} onClose={() => setModalOpen(false)} />}
		</section>
	);
}

function ProductModal({ product, categories, onClose }) {
	const [form, setForm] = useState(product ? { ...emptyProduct, ...product, sabores: normalizeFlavors(product.sabores) } : emptyProduct);
	const [saving, setSaving] = useState(false);
	const isEditing = Boolean(product && !product.isNew);
	const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

	function addIngredient() { update('ingredientes', [...form.ingredientes, { nombre: '', medida: '' }]); }
	function updateIngredient(index, field, value) { update('ingredientes', form.ingredientes.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item)); }
	function removeIngredient(index) { update('ingredientes', form.ingredientes.filter((_, itemIndex) => itemIndex !== index)); }
	function addFlavor() { update('sabores', [...(form.sabores || []), { nombre: '', stock: '' }]); }
	function updateFlavor(index, field, value) { update('sabores', (form.sabores || []).map((flavor, flavorIndex) => flavorIndex === index ? { ...flavor, [field]: field === 'nombre' ? value.toLocaleUpperCase('es-ES') : value } : flavor)); }
	function removeFlavor(index) { update('sabores', (form.sabores || []).filter((_, flavorIndex) => flavorIndex !== index)); }

	async function save(event) {
		event.preventDefault();
		if (!form.identificador.trim() || !form.nombre.trim() || !form.categoria.trim()) { toast.warning('Completa identificador, nombre y categoría.'); return; }
		if (form.modoSabores === 'sabores' && !(form.sabores || []).some((flavor) => flavor.nombre.trim())) { toast.warning('Agrega al menos un sabor.'); return; }
		if (form.tipo === 'preparable' && form.ingredientes.some((item) => !item.nombre.trim() || !item.medida.trim())) { toast.warning('Completa los ingredientes y sus medidas.'); return; }
		setSaving(true);
		try {
			const identifier = form.identificador.trim().padStart(12, '0');
			const category = form.categoria.trim().toLocaleUpperCase('es-ES');
			const unitsPerPackage = form.venta === 'paquete' ? Number(form.unidadesPorPaquete) || 0 : 0;
			const packagePrice = form.venta === 'paquete' ? Number(form.precioPaquete) || 0 : 0;
			const data = { identificador: identifier, nombre: form.nombre.trim().toLocaleUpperCase('es-ES'), categoria: category, modoSabores: form.modoSabores, sabores: form.modoSabores === 'sabores' ? form.sabores.filter((flavor) => flavor.nombre.trim()).map((flavor) => ({ nombre: flavor.nombre.trim().toLocaleUpperCase('es-ES'), stock: Number(flavor.stock) || 0 })) : [], venta: form.venta, precioUnidad: form.venta === 'paquete' && unitsPerPackage ? packagePrice / unitsPerPackage : Number(form.precioUnidad) || 0, precioPaquete: packagePrice, unidadesPorPaquete: unitsPerPackage, abastecimiento: form.abastecimiento, unidadesMayoreo: form.abastecimiento === 'mayoreo' ? Number(form.mayoreo) || 0 : 0, stock: form.modoSabores === 'sabores' ? 0 : Number(form.stock) || 0, tipo: form.tipo, ingredientes: form.tipo === 'preparable' ? form.ingredientes.map((item) => ({ nombre: item.nombre.trim().toLocaleUpperCase('es-ES'), medida: item.medida.trim() })) : [] };
			await setDoc(doc(db, 'inventario', identifier), data);
			await setDoc(doc(db, 'categorias', category), { nombre: category }, { merge: true });
			toast.success(`Producto ${isEditing ? 'actualizado' : 'creado'}.`);
			onClose();
		} catch (error) { toast.error('No se pudo guardar el producto.'); } finally { setSaving(false); }
	}

	return <div className="inventory-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="inventory-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
		<header className="inventory-modal-header"><div><p className="app-eyebrow">Catálogo</p><h2 id="product-modal-title">{isEditing ? 'Editar producto' : 'Nuevo producto'}</h2></div><button type="button" aria-label="Cerrar modal" onClick={onClose}>×</button></header>
		<form className="inventory-form" onSubmit={save}>
			<label>Identificador<input value={form.identificador} disabled /></label>
			<label>Nombre<input value={form.nombre} onChange={(event) => update('nombre', event.target.value.toLocaleUpperCase('es-ES'))} /></label>
			<label>Categoría<input list="inventory-categories" value={form.categoria} onChange={(event) => update('categoria', event.target.value.toLocaleUpperCase('es-ES'))} /><datalist id="inventory-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist></label>
			<div className="inventory-form-grid"><label>Precio por unidad<input type="text" inputMode="numeric" pattern="[0-9.]*" value={formatPrice(form.precioUnidad)} onChange={(event) => update('precioUnidad', getPriceDigits(event.target.value))} /></label>{form.venta === 'paquete' && <label>Precio del paquete<input type="text" inputMode="numeric" pattern="[0-9.]*" value={formatPrice(form.precioPaquete)} onChange={(event) => update('precioPaquete', getPriceDigits(event.target.value))} /></label>}</div>
			<fieldset><legend>Sabores</legend><label className="inventory-radio"><input type="radio" checked={form.modoSabores === 'general'} onChange={() => update('modoSabores', 'general')} /> Producto general</label><label className="inventory-radio"><input type="radio" checked={form.modoSabores === 'sabores'} onChange={() => { update('modoSabores', 'sabores'); if (!(form.sabores || []).length) addFlavor(); }} /> Producto de sabores</label>{form.modoSabores === 'sabores' && <div className="flavor-list">{(form.sabores || []).map((flavor, index) => <div className="flavor-row" key={index}><input aria-label="Sabor" placeholder="Ej. VAINILLA" value={flavor.nombre} onChange={(event) => updateFlavor(index, 'nombre', event.target.value)} /><input aria-label="Stock del sabor" type="number" min="0" placeholder="Stock" value={flavor.stock} onChange={(event) => updateFlavor(index, 'stock', event.target.value)} /><button type="button" aria-label="Eliminar sabor" onClick={() => removeFlavor(index)}>×</button></div>)}<button className="add-ingredient" type="button" onClick={addFlavor}>+ Añadir sabor</button></div>}</fieldset>
			<div className="inventory-form-grid"><label>Forma de venta<select value={form.venta} onChange={(event) => update('venta', event.target.value)}><option value="unidad">Por unidad</option><option value="paquete">Por paquete</option></select></label>{form.venta === 'paquete' && <label>Unidades por paquete<input type="number" min="1" value={form.unidadesPorPaquete} onChange={(event) => update('unidadesPorPaquete', event.target.value)} /></label>}</div>
			<div className="inventory-form-grid"><label>Abastecimiento<select value={form.abastecimiento} onChange={(event) => update('abastecimiento', event.target.value)}><option value="unidad">Por unidad</option><option value="paquete">Por paquete</option><option value="mayoreo">Por mayoreo</option></select></label>{form.abastecimiento === 'mayoreo' && <label>Unidades por mayoreo<input type="number" min="1" value={form.mayoreo} onChange={(event) => update('mayoreo', event.target.value)} /></label>}</div>
			{form.modoSabores === 'general' && <label>Stock<input type="number" min="0" value={form.stock} onChange={(event) => update('stock', event.target.value)} /></label>}
			<fieldset><legend>Tipo de producto</legend><label className="inventory-radio"><input type="radio" checked={form.tipo === 'final'} onChange={() => update('tipo', 'final')} /> Producto final</label><label className="inventory-radio"><input type="radio" checked={form.tipo === 'preparable'} onChange={() => update('tipo', 'preparable')} /> Se debe preparar</label></fieldset>
			{form.tipo === 'preparable' && <fieldset><legend>Ingredientes y medidas</legend>{form.ingredientes.map((item, index) => <div className="ingredient-row" key={index}><input aria-label="Ingrediente" placeholder="Ingrediente" value={item.nombre} onChange={(event) => updateIngredient(index, 'nombre', event.target.value.toLocaleUpperCase('es-ES'))} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><input aria-label="Medida" placeholder="Ej. 20 ml" value={item.medida} onChange={(event) => updateIngredient(index, 'medida', event.target.value)} /><button type="button" aria-label="Eliminar ingrediente" onClick={() => removeIngredient(index)}>×</button></div>)}<button className="add-ingredient" type="button" onClick={addIngredient}>+ Añadir ingrediente</button></fieldset>}
			<button className="auth-submit" type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar producto'}</button>
		</form>
	</section></div>;
}

export default Inventario;
