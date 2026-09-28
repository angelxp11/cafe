import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { FaClipboardList, FaPlus, FaPrint, FaTrash, FaTruck } from 'react-icons/fa';
import { auth, db } from '../../../server/api';
import { shiftBalance } from '../../../server/paymentMethods';
import LoadingScreen from '../../../resources/loading/LoadingScreen';
import toast from '../../../resources/toast/toast';
import './abastecer.css';

function supplyUnits(product, mode = product.abastecimiento) {
	if (mode === 'paquete') return Number(product.unidadesPorPaqueteAbastecimiento || product.unidadesPorPaquete) || 0;
	if (mode === 'mayoreo') return Number(product.unidadesMayoreo) || 0;
	return 1;
}

function supplyModes(product) {
	const modes = [{ value: 'unidad', label: 'Unidad', units: 1 }];
	const packageUnits = supplyUnits(product, 'paquete');
	const wholesaleUnits = supplyUnits(product, 'mayoreo');
	if (packageUnits > 0) modes.push({ value: 'paquete', label: 'Paquete', units: packageUnits });
	if (wholesaleUnits > 0) modes.push({ value: 'mayoreo', label: 'Mayoreo', units: wholesaleUnits });
	return modes;
}

function supplyLabel(mode, quantity = 1) {
	const singularLabels = { unidad: 'unidad', paquete: 'paquete', mayoreo: 'mayoreo' };
	const pluralLabels = { unidad: 'unidades', paquete: 'paquetes', mayoreo: 'pedidos de mayoreo' };
	return quantity === 1 ? singularLabels[mode] || 'unidad' : pluralLabels[mode] || 'unidades';
}

function timestampLabel(value) {
	const date = value?.toDate?.();
	return date ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(date) : 'Guardando fecha';
}

function money(value) {
	return `$${Number(value || 0).toLocaleString('es-CO')}`;
}

function escapeHtml(value) {
	return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function receiptDate(value) {
	const date = value?.toDate?.() || (value instanceof Date ? value : null);
	return date ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Fecha no disponible';
}

function receiptHtml(order) {
	const lines = order.lineas || [];
	const receivedLines = order.lineasRecibidas || [];
	const receivedUnits = receivedLines.reduce((total, line) => total + Number(line.unidadesRecibidas || 0), 0);
	const requestedUnits = lines.reduce((total, line) => total + Number(line.unidadesSolicitadas || 0), 0);
	const shortageLines = order.faltantes || [];
	const rows = lines.map((line, index) => {
		const received = receivedLines[index] || line;
		const requestedQuantity = Number(line.cantidadSolicitada || 0);
		const receivedQuantity = Number(received.cantidadRecibida || 0);
		const missingQuantity = Math.max(0, requestedQuantity - receivedQuantity);
		const itemName = `${line.productoNombre || 'Producto'}${line.sabor ? ` · ${line.sabor}` : ''}`;
		return `<tr><td><strong>${escapeHtml(itemName)}</strong><small>${escapeHtml(line.modoAbastecimiento || 'unidad')} · ${Number(line.unidadesPorAbastecimiento || 1).toLocaleString('es-CO')} unidades por compra</small></td><td>${requestedQuantity.toLocaleString('es-CO')} ${escapeHtml(supplyLabel(line.modoAbastecimiento, requestedQuantity))}<small>${Number(line.unidadesSolicitadas || 0).toLocaleString('es-CO')} unidades</small></td><td>${receivedQuantity.toLocaleString('es-CO')} ${escapeHtml(supplyLabel(line.modoAbastecimiento, receivedQuantity))}<small>${Number(received.unidadesRecibidas || 0).toLocaleString('es-CO')} unidades</small></td><td>${missingQuantity.toLocaleString('es-CO')}</td></tr>`;
	}).join('');
	const status = order.llegoCompleto ? 'Recepción completa' : 'Recepción con faltantes';
	return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recibo de abastecimiento</title><style>
		:root{font-family:Arial,sans-serif;color:#26352f;background:#eef2ee}*{box-sizing:border-box}body{margin:0;padding:30px}.actions{display:flex;justify-content:flex-end;gap:10px;max-width:920px;margin:0 auto 14px}.actions button{padding:11px 16px;border:0;border-radius:4px;background:#29443b;color:#fff;cursor:pointer;font-weight:700}.receipt{max-width:920px;margin:auto;background:#fff;border:1px solid #d8e1db}.masthead{position:relative;overflow:hidden;padding:30px 36px;background:#29443b;color:#fff}.masthead:after{position:absolute;right:0;bottom:0;width:34%;height:5px;background:#d8874d;content:""}.brand{margin:0 0 9px;color:#d0ded4;font-size:11px;font-weight:700;text-transform:uppercase}.masthead h1{margin:0;font-size:27px}.masthead p:last-child{margin:8px 0 0;color:#dce7df;font-size:13px}.receipt-number{float:right;margin-left:20px;text-align:right}.receipt-number span,.receipt-number strong{display:block}.receipt-number span{color:#d0ded4;font-size:10px;text-transform:uppercase}.receipt-number strong{margin-top:5px;font-size:18px}.content{padding:26px 36px}.status{display:inline-block;margin-bottom:20px;padding:6px 10px;border-radius:3px;background:#e5f1e7;color:#376c47;font-size:11px;font-weight:700;text-transform:uppercase}.status.incomplete{background:#fff0dc;color:#8b571c}.details{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding-bottom:20px;border-bottom:1px solid #e1e7e3}.detail span,.summary span{display:block;color:#66766e;font-size:11px;text-transform:uppercase}.detail strong{display:block;margin-top:5px;font-size:13px;overflow-wrap:anywhere}.section{margin-top:24px}.section h2{margin:0 0 10px;font-size:15px}.section-note{margin:-4px 0 12px;color:#66766e;font-size:12px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:11px 9px;border-bottom:1px solid #e5ebe6;text-align:left;vertical-align:top}th{background:#f3f6f3;color:#5a6b61;font-size:10px;text-transform:uppercase}td small{display:block;margin-top:4px;color:#68776f;font-size:10px;line-height:1.45}.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:22px}.summary>div{padding:13px;border:1px solid #dfe7e1;background:#f7f9f7}.summary strong{display:block;margin-top:6px;font-size:18px}.payment{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center;margin-top:20px;padding:15px;background:#f7f9f7}.payment span{color:#66766e;font-size:11px;text-transform:uppercase}.payment strong{display:block;margin-top:4px;font-size:14px}.payment .amount{font-size:21px;color:#29443b}.shortages{margin-top:18px;padding:12px 14px;border-left:3px solid #d8874d;background:#fff8f0;color:#744b25;font-size:12px;line-height:1.5}.footer{display:flex;justify-content:space-between;gap:16px;margin-top:26px;padding-top:13px;border-top:1px solid #dfe6e1;color:#63736b;font-size:10px}@media(max-width:620px){body{padding:12px}.masthead,.content{padding:22px 18px}.masthead h1{font-size:22px}.receipt-number{float:none;margin:0 0 18px;text-align:left}.details{grid-template-columns:repeat(2,minmax(0,1fr))}.summary{grid-template-columns:1fr}.payment{grid-template-columns:1fr}.footer{flex-direction:column}table{font-size:10px}th,td{padding:8px 5px}}@media print{body{padding:0;background:#fff}.receipt{max-width:none;border:0}.actions{display:none}.masthead,.status,.summary>div,th{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:12mm}}
		</style></head><body><div class="actions"><button onclick="window.print()">Imprimir / Guardar PDF</button></div><main class="receipt"><header class="masthead"><div class="receipt-number"><span>Recibo de pedido</span><strong>${escapeHtml(order.id.slice(0, 8).toUpperCase())}</strong></div><p class="brand">Café · Control de abastecimiento</p><h1>Recibo de recepción</h1><p>Comprobante de productos recibidos y pago registrado</p></header><div class="content"><span class="status${order.llegoCompleto ? '' : ' incomplete'}">${escapeHtml(status)}</span><section class="details"><div class="detail"><span>Pedido</span><strong>${escapeHtml(order.id)}</strong></div><div class="detail"><span>Solicitado por</span><strong>${escapeHtml(order.solicitadoPor || 'Usuario')}${order.solicitadoPorCorreo ? `<br>${escapeHtml(order.solicitadoPorCorreo)}` : ''}</strong></div><div class="detail"><span>Fecha del pedido</span><strong>${escapeHtml(receiptDate(order.solicitadoEn))}</strong></div><div class="detail"><span>Recibido por</span><strong>${escapeHtml(order.recibidoPor || 'Usuario')}${order.recibidoPorCorreo ? `<br>${escapeHtml(order.recibidoPorCorreo)}` : ''}</strong></div><div class="detail"><span>Fecha de recepción</span><strong>${escapeHtml(receiptDate(order.recibidoEn))}</strong></div><div class="detail"><span>Turno de recepción</span><strong>${escapeHtml(order.turnoRecepcionId || 'No disponible')}</strong></div></section><section class="section"><h2>Detalle del pedido</h2><p class="section-note">Cantidades solicitadas, recibidas y faltantes por producto.</p><table><thead><tr><th>Producto</th><th>Solicitado</th><th>Recibido</th><th>Faltante</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Sin productos registrados</td></tr>'}</tbody></table></section><div class="summary"><div><span>Productos / sabores</span><strong>${lines.length.toLocaleString('es-CO')}</strong></div><div><span>Unidades solicitadas</span><strong>${requestedUnits.toLocaleString('es-CO')}</strong></div><div><span>Unidades recibidas</span><strong>${receivedUnits.toLocaleString('es-CO')}</strong></div></div><section class="payment"><div><span>Método de pago</span><strong>${escapeHtml(order.metodoNombre || 'No disponible')}</strong></div><div><span>Total pagado</span><strong class="amount">${escapeHtml(money(order.montoPagado))}</strong></div></section>${shortageLines.length ? `<p class="shortages"><strong>Faltantes:</strong> ${shortageLines.map((line) => `${escapeHtml(line.productoNombre || 'Producto')}${line.sabor ? ` (${escapeHtml(line.sabor)})` : ''}: ${Math.max(0, Number(line.cantidadSolicitada || 0) - Number(line.cantidadRecibida || 0)).toLocaleString('es-CO')} ${escapeHtml(supplyLabel(line.modoAbastecimiento, Math.max(0, Number(line.cantidadSolicitada || 0) - Number(line.cantidadRecibida || 0))))}`).join('; ')}.</p>` : ''}<section class="details section"><div class="detail"><span>Turno del pedido</span><strong>${escapeHtml(order.turnoPedidoId || 'No disponible')}</strong></div><div class="detail"><span>Movimiento de egreso</span><strong>${escapeHtml(order.movimientoId || 'No disponible')}</strong></div><div class="detail"><span>Estado</span><strong>${escapeHtml(status)}</strong></div></section><footer class="footer"><span>Recibo generado el ${escapeHtml(receiptDate(new Date()))}</span><span>Abastecimiento · ${escapeHtml(order.id.slice(0, 8).toUpperCase())}</span></footer></div></main></body></html>`;
}

function writeReceipt(receiptWindow, order) {
	receiptWindow.document.open();
	receiptWindow.document.write(receiptHtml(order));
	receiptWindow.document.close();
	receiptWindow.focus();
}

function Abastecer({ profile }) {
	const [products, setProducts] = useState([]);
	const [orders, setOrders] = useState([]);
	const [methods, setMethods] = useState([]);
	const [shiftOpen, setShiftOpen] = useState(false);
	const [ordersLoaded, setOrdersLoaded] = useState(false);
	const [productsLoaded, setProductsLoaded] = useState(false);
	const [mode, setMode] = useState('');
	const [busy, setBusy] = useState(false);
	const [orderLines, setOrderLines] = useState([]);
	const [productSearch, setProductSearch] = useState('');
	const [categoryFilter, setCategoryFilter] = useState('Todas');
	const [selectedOrder, setSelectedOrder] = useState(null);
	const [receivedAll, setReceivedAll] = useState(true);
	const [receivedQuantities, setReceivedQuantities] = useState({});
	const [paidAmount, setPaidAmount] = useState('');
	const [paymentMethodId, setPaymentMethodId] = useState('');
	const employeeName = [profile?.nombre, profile?.apellido].filter(Boolean).join(' ') || profile?.correo || auth.currentUser?.email || 'Usuario';
	const employeeEmail = profile?.correo || auth.currentUser?.email || '';
	const isAdmin = profile?.rol === 'admin';
	const isEmployee = profile?.rol === 'empleado';
	const canAccessReplenishment = isAdmin || isEmployee;
	const canReceiveReplenishment = isAdmin || isEmployee;
	const loading = !ordersLoaded || !productsLoaded;
	const categories = [...new Set(products.map((product) => product.categoria).filter(Boolean))].sort((first, second) => first.localeCompare(second, 'es'));
	const filteredProducts = products.filter((product) => {
		const matchesCategory = categoryFilter === 'Todas' || product.categoria === categoryFilter;
		const matchesSearch = product.nombre?.toLocaleLowerCase('es-ES').includes(productSearch.trim().toLocaleLowerCase('es-ES'));
		return matchesCategory && matchesSearch;
	});
	const cartLines = orderLines.map((line) => ({
		...line,
		sabores: Array.isArray(line.sabores) ? line.sabores : line.sabor ? [{ sabor: line.sabor, cantidad: line.cantidad || '1' }] : [],
		nuevoSabor: line.nuevoSabor || '',
	}));
	const cartUnitsTotal = cartLines.reduce((total, line) => {
		const product = products.find((item) => item.id === line.productoId);
		if (!product) return total;
		const units = line.modoAbastecimiento === 'mayoreo' ? Number(line.unidadesMayoreo) || 0 : supplyUnits(product, line.modoAbastecimiento);
		const quantity = product.modoSabores === 'sabores'
			? line.sabores.reduce((sum, flavor) => sum + (Number(flavor.cantidad) || 0), 0)
			: Number(line.cantidad) || 0;
		return total + units * quantity;
	}, 0);

	useEffect(() => {
		const stopProducts = onSnapshot(collection(db, 'inventario'), (snapshot) => {
			setProducts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
			setProductsLoaded(true);
		}, () => {
			toast.error('No se pudo cargar el inventario para abastecer.');
			setProductsLoaded(true);
		});
		const orderCollection = collection(db, 'pedidosAbastecimiento');
		const ordersQuery = canAccessReplenishment ? orderCollection : query(orderCollection, where('solicitadoPorCorreo', '==', employeeEmail));
		const stopOrders = onSnapshot(ordersQuery, (snapshot) => {
			setOrders(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((first, second) => (second.solicitadoEn?.toMillis?.() || 0) - (first.solicitadoEn?.toMillis?.() || 0)));
			setOrdersLoaded(true);
		}, () => {
			toast.error('No se pudieron cargar los pedidos de abastecimiento.');
			setOrdersLoaded(true);
		});
		const stopMethods = onSnapshot(collection(db, 'metodosPago'), (snapshot) => {
			const activeMethods = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((method) => method.activo !== false);
			setMethods(activeMethods);
			setPaymentMethodId((current) => current || activeMethods[0]?.id || '');
		}, () => toast.error('No se pudieron cargar los métodos de pago.'));
		const stopShift = onSnapshot(doc(db, 'configuracion', 'turnoActual'), (snapshot) => {
			setShiftOpen(snapshot.exists() && snapshot.data().abierto === true);
		}, () => toast.error('No se pudo consultar el turno actual.'));
		return () => {
			stopProducts();
			stopOrders();
			stopMethods();
			stopShift();
		};
	}, [canAccessReplenishment, employeeEmail, isAdmin]);

	function addProductToCart(product) {
		if (orderLines.some((line) => line.productoId === product.id)) return;
		const modes = supplyModes(product);
		const defaultMode = modes.some((item) => item.value === product.abastecimiento) ? product.abastecimiento : 'unidad';
		setOrderLines((current) => [...current, {
			productoId: product.id,
			sabores: [],
			nuevoSabor: '',
			modoAbastecimiento: defaultMode,
			cantidad: '1',
			unidadesMayoreo: String(supplyUnits(product, 'mayoreo') || ''),
		}]);
	}

	function updateOrderLine(index, field, value) {
		setOrderLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line));
	}

	function addFlavorToLine(index) {
		setOrderLines((current) => current.map((line, lineIndex) => {
			const flavors = Array.isArray(line.sabores) ? line.sabores : line.sabor ? [{ sabor: line.sabor, cantidad: line.cantidad || '1' }] : [];
			if (lineIndex !== index || !line.nuevoSabor || flavors.some((flavor) => flavor.sabor === line.nuevoSabor)) return line;
			return { ...line, sabores: [...flavors, { sabor: line.nuevoSabor, cantidad: '1' }], nuevoSabor: '' };
		}));
	}

	function closeModal() {
		if (busy) return;
		setMode('');
		setSelectedOrder(null);
	}

	async function createOrder(event) {
		event.preventDefault();
		if (!canAccessReplenishment) return;
		const lines = cartLines.flatMap((line) => line.sabores.length
			? line.sabores.map((flavor) => ({ ...line, sabor: flavor.sabor, cantidad: flavor.cantidad }))
			: [{ ...line, sabor: '', cantidad: line.cantidad }]);
		if (!lines.length || lines.some((line) => !/^\d+$/.test(String(line.cantidad)) || Number(line.cantidad) < 1)) {
			toast.warning('Agrega productos y cantidades válidas al carrito.');
			return;
		}
		if (cartLines.some((line) => {
			const product = products.find((item) => item.id === line.productoId);
			return !product || (product.modoSabores === 'sabores' && !line.sabores.length)
				|| (line.modoAbastecimiento === 'mayoreo' && (!/^\d+$/.test(line.unidadesMayoreo) || Number(line.unidadesMayoreo) < 1));
		})) {
			toast.warning('Agrega al menos un sabor y configura las unidades por mayoreo cuando corresponda.');
			return;
		}
		setBusy(true);
		const orderReference = doc(collection(db, 'pedidosAbastecimiento'));
		try {
			await runTransaction(db, async (transaction) => {
				const pointerReference = doc(db, 'configuracion', 'turnoActual');
				const pointerSnapshot = await transaction.get(pointerReference);
				if (!pointerSnapshot.exists() || pointerSnapshot.data().abierto !== true) throw new Error('Abre un turno antes de crear un pedido.');
				const shiftId = pointerSnapshot.data().turnoId;
				const shiftSnapshot = await transaction.get(doc(db, 'turnos', shiftId));
				if (!shiftSnapshot.exists() || shiftSnapshot.data().abierto !== true) throw new Error('El turno ya no está abierto.');
				const productIds = [...new Set(lines.map((line) => line.productoId))];
				const productSnapshots = await Promise.all(productIds.map((id) => transaction.get(doc(db, 'inventario', id))));
				const productsById = new Map(productSnapshots.filter((snapshot) => snapshot.exists()).map((snapshot) => [snapshot.id, snapshot.data()]));
				const savedLines = lines.map((line) => {
					const product = productsById.get(line.productoId);
					if (!product) throw new Error('Uno de los productos ya no existe.');
					const purchaseMode = line.modoAbastecimiento || product.abastecimiento || 'unidad';
					const factor = purchaseMode === 'mayoreo' ? Number(line.unidadesMayoreo) : supplyUnits(product, purchaseMode);
					if (!factor) throw new Error(`Configura las unidades de abastecimiento de ${product.nombre}.`);
					const flavor = product.modoSabores === 'sabores' ? (product.sabores || []).find((item) => (typeof item === 'string' ? item : item.nombre) === line.sabor) : null;
					if (product.modoSabores === 'sabores' && !flavor) throw new Error(`Selecciona un sabor válido para ${product.nombre}.`);
					return {
						productoId: line.productoId,
						productoNombre: product.nombre,
						sabor: line.sabor || '',
						modoAbastecimiento: purchaseMode,
						unidadesPorAbastecimiento: factor,
						cantidadSolicitada: Number(line.cantidad),
						unidadesSolicitadas: Number(line.cantidad) * factor,
					};
				});
				transaction.set(orderReference, {
					estado: 'pedido',
					lineas: savedLines,
					solicitadoPor: employeeName,
					solicitadoPorCorreo: employeeEmail,
					solicitadoEn: serverTimestamp(),
					turnoPedidoId: shiftId,
				});
			});
			setOrderLines([]);
			setMode('');
			toast.success('Pedido creado. El inventario no se modificó.');
		} catch (error) {
			toast.error(error.message || 'No se pudo crear el pedido.');
		} finally {
			setBusy(false);
		}
	}

	function openReceipt(order) {
		setSelectedOrder(order);
		setReceivedAll(true);
		setReceivedQuantities(Object.fromEntries(order.lineas.map((line, index) => [index, String(line.cantidadSolicitada)])));
		setPaidAmount('');
		setMode('receiving');
	}

	async function receiveOrder(event) {
		event.preventDefault();
		if (!canReceiveReplenishment || !selectedOrder) return;
		const amount = Number(String(paidAmount).replace(/\D/g, '')) || 0;
		const receivedLines = selectedOrder.lineas.map((line, index) => {
			const quantity = receivedAll ? Number(line.cantidadSolicitada) : Number(receivedQuantities[index]);
			return { ...line, cantidadRecibida: quantity, unidadesRecibidas: quantity * Number(line.unidadesPorAbastecimiento) };
		});
		if (receivedLines.some((line) => !Number.isInteger(line.cantidadRecibida) || line.cantidadRecibida < 0 || line.cantidadRecibida > line.cantidadSolicitada)) {
			toast.warning('Las cantidades recibidas deben estar entre cero y lo solicitado.');
			return;
		}
		if (amount <= 0) {
			toast.warning('Indica el monto pagado para registrar el egreso del turno.');
			return;
		}
		if (!methods.some((method) => method.id === paymentMethodId)) {
			toast.warning('Selecciona el método con el que se pagó el pedido.');
			return;
		}
		const receiptWindow = window.open('', '_blank');
		if (receiptWindow) receiptWindow.document.write('<!doctype html><title>Preparando recibo</title><p style="font:16px Arial;padding:32px">Preparando recibo de abastecimiento...</p>');
		setBusy(true);
		const orderReference = doc(db, 'pedidosAbastecimiento', selectedOrder.id);
		const movementReference = doc(collection(db, 'movimientos'));
		const shortages = receivedLines.filter((line) => line.cantidadRecibida < line.cantidadSolicitada);
		let receivingShiftId = '';
		try {
			await runTransaction(db, async (transaction) => {
				const pointerReference = doc(db, 'configuracion', 'turnoActual');
				const pointerSnapshot = await transaction.get(pointerReference);
				if (!pointerSnapshot.exists() || pointerSnapshot.data().abierto !== true) throw new Error('Abre un turno antes de recibir el pedido.');
				const shiftId = pointerSnapshot.data().turnoId;
				receivingShiftId = shiftId;
				const shiftReference = doc(db, 'turnos', shiftId);
				const [shiftSnapshot, orderSnapshot] = await Promise.all([transaction.get(shiftReference), transaction.get(orderReference)]);
				if (!shiftSnapshot.exists() || shiftSnapshot.data().abierto !== true) throw new Error('El turno ya no está abierto.');
				if (!orderSnapshot.exists() || orderSnapshot.data().estado !== 'pedido') throw new Error('Este pedido ya fue recibido o no existe.');
				const method = methods.find((item) => item.id === paymentMethodId);
				const methodReference = doc(db, 'metodosPago', paymentMethodId);
				const methodSnapshot = await transaction.get(methodReference);
				if (!methodSnapshot.exists() || methodSnapshot.data().activo === false) throw new Error('El método de pago ya no está disponible.');
				if (shiftBalance(methodSnapshot.data()) < amount) throw new Error('El egreso supera el saldo disponible del método de pago.');
				const productIds = [...new Set(receivedLines.filter((line) => line.unidadesRecibidas > 0).map((line) => line.productoId))];
				const productSnapshots = await Promise.all(productIds.map((id) => transaction.get(doc(db, 'inventario', id))));
				const updatedProducts = new Map(productSnapshots.filter((snapshot) => snapshot.exists()).map((snapshot) => [snapshot.id, { reference: doc(db, 'inventario', snapshot.id), data: snapshot.data() }]));
				if (updatedProducts.size !== productIds.length) throw new Error('Uno de los productos del pedido ya no existe.');
				for (const line of receivedLines) {
					if (!line.unidadesRecibidas) continue;
					const productEntry = updatedProducts.get(line.productoId);
					if (line.sabor) {
						const flavors = (productEntry.data.sabores || []).map((flavor) => {
							const name = typeof flavor === 'string' ? flavor : flavor.nombre;
							if (name !== line.sabor) return flavor;
							return { ...(typeof flavor === 'string' ? { nombre: flavor } : flavor), stock: Number(typeof flavor === 'string' ? 0 : flavor.stock || 0) + line.unidadesRecibidas };
						});
						if (!flavors.some((flavor) => (typeof flavor === 'string' ? flavor : flavor.nombre) === line.sabor && typeof flavor !== 'string')) throw new Error(`No se encontró el sabor ${line.sabor} de ${line.productoNombre}.`);
						productEntry.data = { ...productEntry.data, sabores: flavors };
					} else {
						productEntry.data = { ...productEntry.data, stock: Number(productEntry.data.stock || 0) + line.unidadesRecibidas };
					}
				}
				for (const productEntry of updatedProducts.values()) transaction.update(productEntry.reference, productEntry.data.modoSabores === 'sabores' ? { sabores: productEntry.data.sabores } : { stock: productEntry.data.stock });
				transaction.update(methodReference, { saldoTurno: shiftBalance(methodSnapshot.data()) - amount });
				transaction.set(movementReference, {
					turnoId: shiftId,
					tipo: 'egreso',
					direccion: 'egreso',
					metodoId: paymentMethodId,
					metodoNombre: method.nombre,
					monto: amount,
					denominaciones: [],
					descripcion: `Reabastecimiento: pedido ${selectedOrder.id.slice(0, 8).toUpperCase()}`,
					pedidoAbastecimientoId: selectedOrder.id,
					creadoPor: employeeName,
					creadoPorCorreo: employeeEmail,
					creadoEn: serverTimestamp(),
				});
				transaction.update(orderReference, {
					estado: 'recibido',
					recibidoEn: serverTimestamp(),
					recibidoPor: employeeName,
					recibidoPorCorreo: employeeEmail,
					turnoRecepcionId: shiftId,
					llegoCompleto: shortages.length === 0,
					lineasRecibidas: receivedLines,
					faltantes: shortages,
					montoPagado: amount,
					metodoId: method.id,
					metodoNombre: method.nombre,
					movimientoId: movementReference.id,
				});
			});
			const receivedOrder = {
				...selectedOrder,
				estado: 'recibido',
				recibidoEn: new Date(),
				recibidoPor: employeeName,
				recibidoPorCorreo: employeeEmail,
				turnoRecepcionId: receivingShiftId,
				llegoCompleto: shortages.length === 0,
				lineasRecibidas: receivedLines,
				faltantes: shortages,
				montoPagado: amount,
				metodoId: paymentMethodId,
				metodoNombre: methods.find((method) => method.id === paymentMethodId)?.nombre || '',
				movimientoId: movementReference.id,
			};
			if (receiptWindow) writeReceipt(receiptWindow, receivedOrder);
			setMode('');
			setSelectedOrder(null);
			toast.success(receiptWindow ? 'Recepción registrada y recibo abierto.' : 'Recepción registrada. Abre el recibo desde el pedido en el historial.');
		} catch (error) {
			if (receiptWindow) receiptWindow.close();
			toast.error(error.message || 'No se pudo registrar la recepción.');
		} finally {
			setBusy(false);
		}
	}

	if (!canAccessReplenishment) return null;
	if (loading) return <LoadingScreen text="Cargando pedidos de abastecimiento" />;

	return <section className="replenishment-page" aria-labelledby="replenishment-title">
		<header className="app-content-header">
			<p className="app-eyebrow">Compras e inventario</p>
			<h1 id="replenishment-title">Abastecimiento</h1>
			<p className="app-intro">Crea pedidos, registra lo recibido y controla el gasto del turno.</p>
		</header>
		<section className="replenishment-section" aria-labelledby="replenishment-orders-title">
		<header className="replenishment-header">
			<h2 id="replenishment-orders-title">Pedidos de abastecimiento</h2>
			<button className="inventory-create-button replenishment-new-order" type="button" onClick={() => { setMode('creating'); setOrderLines([]); setProductSearch(''); setCategoryFilter('Todas'); }} disabled={!shiftOpen || products.length === 0}><FaPlus aria-hidden="true" /><span>Nuevo pedido</span></button>
		</header>
		{!shiftOpen && <p className="replenishment-notice" role="status">{isAdmin ? 'Abre un turno para crear pedidos o registrar recepciones.' : 'Abre un turno para crear pedidos de abastecimiento.'}</p>}
		{products.length === 0 && <p className="replenishment-notice">Agrega productos al inventario antes de crear un pedido.</p>}
		{orders.length === 0 ? <p className="replenishment-empty">Todavía no hay pedidos de abastecimiento.</p> : <div className="replenishment-orders">
			{orders.map((order) => <article className="replenishment-order" key={order.id}>
				<div className="replenishment-order-heading"><div><FaClipboardList aria-hidden="true" /><strong>Pedido {order.id.slice(0, 8).toUpperCase()}</strong></div><span className={`replenishment-status ${order.estado === 'recibido' ? 'replenishment-status-received' : ''}`}>{order.estado === 'recibido' ? (order.llegoCompleto ? 'Recibido completo' : 'Recibido con faltantes') : 'Pendiente de recepción'}</span></div>
				<p className="replenishment-meta">Solicitó {order.solicitadoPor} · {timestampLabel(order.solicitadoEn)}</p>
				<ul>{(order.lineas || []).map((line, index) => {
					const receivedLine = order.lineasRecibidas?.[index];
					return <li key={`${line.productoId}-${line.sabor}-${index}`}>{line.productoNombre}{line.sabor ? ` · ${line.sabor}` : ''}: {order.estado === 'recibido' ? `recibió ${receivedLine?.cantidadRecibida || 0} de ${line.cantidadSolicitada} ${supplyLabel(line.modoAbastecimiento, line.cantidadSolicitada)} (${receivedLine?.unidadesRecibidas || 0} unidades)` : `${line.cantidadSolicitada} ${supplyLabel(line.modoAbastecimiento, line.cantidadSolicitada)} (${line.unidadesSolicitadas} unidades)`}</li>;
				})}</ul>
				{order.estado === 'recibido' ? <><p className="replenishment-meta">Recibió {order.recibidoPor} · {timestampLabel(order.recibidoEn)} · Pagado {money(order.montoPagado)}</p>{order.faltantes?.length > 0 && <p className="replenishment-shortage">Faltó: {order.faltantes.map((line) => `${line.productoNombre}${line.sabor ? ` (${line.sabor})` : ''}, ${line.cantidadSolicitada - line.cantidadRecibida} ${supplyLabel(line.modoAbastecimiento, line.cantidadSolicitada - line.cantidadRecibida)}`).join('; ')}.</p>}<button className="replenishment-receive-button" type="button" onClick={() => { const receiptWindow = window.open('', '_blank'); if (receiptWindow) writeReceipt(receiptWindow, order); else toast.warning('Permite las ventanas emergentes para abrir el recibo.'); }}><FaPrint aria-hidden="true" /> Imprimir recibo</button></> : canReceiveReplenishment ? <button className="replenishment-receive-button" type="button" onClick={() => openReceipt(order)} disabled={!shiftOpen}><FaTruck aria-hidden="true" /> Registrar recepción</button> : <p className="replenishment-meta">Pendiente de recepción.</p>}
			</article>)}
		</div>}
		{mode && <div className="inventory-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}><section className="inventory-modal replenishment-modal" role="dialog" aria-modal="true" aria-labelledby="replenishment-modal-title">
			<header className="inventory-modal-header"><div><p className="app-eyebrow">Turno abierto</p><h2 id="replenishment-modal-title">{mode === 'creating' ? 'Crear pedido' : 'Registrar recepción'}</h2></div><button type="button" aria-label="Cerrar modal" onClick={closeModal}>×</button></header>
			{mode === 'creating' ? <form className="inventory-form replenishment-order-form" onSubmit={createOrder}>
				<div className="replenishment-catalog">
					<div className="replenishment-catalog-filters">
						<label>Buscar producto<input type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Escribe el nombre del producto" /></label>
						<label>Categoría<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="Todas">Todas las categorías</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
					</div>
					<div className="replenishment-product-list" aria-label="Productos disponibles">
						{filteredProducts.length ? filteredProducts.map((product) => <article className="replenishment-product-row" key={product.id}>
							<div><strong>{product.nombre}</strong><span>{product.categoria || 'Sin categoría'} · {product.modoSabores === 'sabores' ? `${product.sabores?.length || 0} sabores` : `Stock ${Number(product.stock || 0).toLocaleString('es-CO')}`}</span></div>
							<button className="replenishment-add-button" type="button" onClick={() => addProductToCart(product)} disabled={orderLines.some((line) => line.productoId === product.id)}>{orderLines.some((line) => line.productoId === product.id) ? 'En carrito' : <><FaPlus aria-hidden="true" /><span>Agregar</span></>}</button>
						</article>) : <p className="replenishment-empty">No hay productos que coincidan con la búsqueda.</p>}
					</div>
				</div>
				<section className="replenishment-cart" aria-labelledby="replenishment-cart-title">
					<header className="replenishment-cart-heading"><h3 id="replenishment-cart-title">Carrito</h3><span>{orderLines.length} {orderLines.length === 1 ? 'producto' : 'productos'} · {cartUnitsTotal.toLocaleString('es-CO')} unidades</span></header>
					{orderLines.length === 0 ? <p className="replenishment-empty">Agrega productos desde la lista para armar el pedido.</p> : <div className="replenishment-cart-list">
						{cartLines.map((line, index) => {
							const product = products.find((item) => item.id === line.productoId);
							const flavors = product?.modoSabores === 'sabores' ? product.sabores || [] : [];
							const modes = product ? supplyModes(product) : [];
							const selectedMode = modes.find((item) => item.value === line.modoAbastecimiento) || modes[0];
							const quantity = Number(line.cantidad) || 0;
							const unitsPerPurchase = line.modoAbastecimiento === 'mayoreo' ? Number(line.unidadesMayoreo) || 0 : selectedMode?.units || 1;
							const unitsToAdd = quantity * unitsPerPurchase;
							const modeNoun = line.modoAbastecimiento === 'mayoreo' ? (quantity === 1 ? 'mayoreo' : 'mayoreos') : supplyLabel(line.modoAbastecimiento, quantity);
							return <article className="replenishment-cart-item" key={`${line.productoId}-${index}`}>
								<div className="replenishment-cart-item-heading"><strong>{product?.nombre || 'Producto eliminado'}</strong><button className="replenishment-remove-line" type="button" aria-label={`Quitar ${product?.nombre || 'producto'} del carrito`} onClick={() => setOrderLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><FaTrash aria-hidden="true" /></button></div>
								<div className="replenishment-cart-controls">
									<fieldset className="replenishment-mode-control"><legend>Forma de compra</legend><div>{modes.map((option) => { const optionUnits = option.value === 'mayoreo' ? Number(line.unidadesMayoreo) || 0 : option.units; return <button type="button" key={option.value} className={line.modoAbastecimiento === option.value ? 'replenishment-mode-option replenishment-mode-option-active' : 'replenishment-mode-option'} aria-pressed={line.modoAbastecimiento === option.value} onClick={() => updateOrderLine(index, 'modoAbastecimiento', option.value)}>{option.label}<small>{optionUnits} {optionUnits === 1 ? 'unidad' : 'unidades'}</small></button>; })}</div></fieldset>
										{!flavors.length && <label>Cantidad<input className="replenishment-quantity-input" type="text" inputMode="numeric" pattern="[0-9]*" value={line.cantidad} onChange={(event) => updateOrderLine(index, 'cantidad', event.target.value.replace(/\D/g, ''))} /></label>}
								</div>
								{line.modoAbastecimiento === 'mayoreo' && <label className="replenishment-wholesale-units">Unidades por mayoreo<input className="replenishment-quantity-input" type="text" inputMode="numeric" pattern="[0-9]*" value={line.unidadesMayoreo} onChange={(event) => updateOrderLine(index, 'unidadesMayoreo', event.target.value.replace(/\D/g, ''))} /></label>}
								{flavors.length > 0 ? <div className="replenishment-flavor-picker">
									<div><label>Agregar sabor<select value={line.nuevoSabor} onChange={(event) => updateOrderLine(index, 'nuevoSabor', event.target.value)}><option value="">Selecciona un sabor</option>{flavors.filter((flavor) => !line.sabores.some((selected) => selected.sabor === (typeof flavor === 'string' ? flavor : flavor.nombre))).map((flavor) => { const name = typeof flavor === 'string' ? flavor : flavor.nombre; return <option key={name} value={name}>{name}</option>; })}</select></label><button className="replenishment-add-button" type="button" onClick={() => addFlavorToLine(index)} disabled={!line.nuevoSabor}><FaPlus aria-hidden="true" /><span>Añadir sabor</span></button></div>
									{line.sabores.map((flavorLine) => {
										const flavor = flavors.find((item) => (typeof item === 'string' ? item : item.nombre) === flavorLine.sabor);
										const currentStock = Number(typeof flavor === 'string' ? 0 : flavor?.stock || 0);
										const flavorQuantity = Number(flavorLine.cantidad) || 0;
										const flavorUnits = flavorQuantity * unitsPerPurchase;
										const flavorModeNoun = line.modoAbastecimiento === 'mayoreo' ? (flavorQuantity === 1 ? 'mayoreo' : 'mayoreos') : supplyLabel(line.modoAbastecimiento, flavorQuantity);
										return <div className="replenishment-flavor-line" key={flavorLine.sabor}><div className="replenishment-flavor-line-heading"><strong>{flavorLine.sabor}</strong><button className="replenishment-remove-line" type="button" aria-label={`Quitar sabor ${flavorLine.sabor}`} onClick={() => updateOrderLine(index, 'sabores', line.sabores.filter((item) => item.sabor !== flavorLine.sabor))}><FaTrash aria-hidden="true" /></button></div><label>Cantidad<input className="replenishment-quantity-input" type="text" inputMode="numeric" pattern="[0-9]*" value={flavorLine.cantidad} onChange={(event) => updateOrderLine(index, 'sabores', line.sabores.map((item) => item.sabor === flavorLine.sabor ? { ...item, cantidad: event.target.value.replace(/\D/g, '') } : item))} /></label><p className="replenishment-stock-preview">{flavorQuantity} {flavorModeNoun} equivalen a {flavorUnits.toLocaleString('es-CO')} unidades. Actualmente hay {currentStock.toLocaleString('es-CO')} de {flavorLine.sabor} y quedarían {(currentStock + flavorUnits).toLocaleString('es-CO')}.</p></div>;
									})}
								</div> : <p className="replenishment-stock-preview">{quantity} {modeNoun} equivalen a {unitsToAdd.toLocaleString('es-CO')} unidades. Actualmente tienes {Number(product?.stock || 0).toLocaleString('es-CO')} y quedarían {(Number(product?.stock || 0) + unitsToAdd).toLocaleString('es-CO')}.</p>}
							</article>;
						})}
					</div>}
				</section>
				<p className="replenishment-line-note">Crear el pedido no aumenta las existencias ni registra un egreso.</p>
				<button className="auth-submit" type="submit" disabled={busy || !shiftOpen || !orderLines.length}>{busy ? 'Guardando pedido...' : 'Confirmar pedido'}</button>
			</form> : <form className="inventory-form" onSubmit={receiveOrder}>
				<p className="replenishment-line-note">Pedido {selectedOrder?.id.slice(0, 8).toUpperCase()} · Solicitó {selectedOrder?.solicitadoPor}</p>
				<label className="replenishment-checkbox"><input type="checkbox" checked={receivedAll} onChange={(event) => setReceivedAll(event.target.checked)} /> Llegó todo lo solicitado</label>
				{!receivedAll && selectedOrder?.lineas.map((line, index) => <label key={`${line.productoId}-${line.sabor}-${index}`}>{line.productoNombre}{line.sabor ? ` · ${line.sabor}` : ''} recibido (de {line.cantidadSolicitada} {supplyLabel(line.modoAbastecimiento, line.cantidadSolicitada)})<input type="text" inputMode="numeric" pattern="[0-9]*" value={receivedQuantities[index] ?? '0'} onChange={(event) => setReceivedQuantities((current) => ({ ...current, [index]: event.target.value.replace(/\D/g, '') }))} /></label>)}
				<label>¿Cuánto se pagó?<input type="text" inputMode="numeric" value={paidAmount ? Number(paidAmount).toLocaleString('es-CO') : ''} onChange={(event) => setPaidAmount(event.target.value.replace(/\D/g, ''))} placeholder="$ 0" required /></label>
				<label>Método de pago<select value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)} required><option value="">Selecciona un método</option>{methods.map((method) => <option value={method.id} key={method.id}>{method.nombre} · Saldo {money(shiftBalance(method))}</option>)}</select></label>
				<p className="replenishment-line-note">Al confirmar, se sumarán únicamente las unidades recibidas y el pago se registrará como egreso del turno.</p>
				<button className="auth-submit" type="submit" disabled={busy || !shiftOpen}>{busy ? 'Registrando recepción...' : 'Confirmar recepción'}</button>
			</form>}
		</section></div>}
		</section>
	</section>;
}

export default Abastecer;
