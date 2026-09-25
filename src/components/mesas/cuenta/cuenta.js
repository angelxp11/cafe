import "./cuenta.css";

import { useEffect, useMemo, useState } from 'react';
import { collection, deleteField, doc, getDocs, onSnapshot, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { FaBeer, FaCheck, FaCoffee, FaCookieBite, FaGlassWhiskey, FaMinus, FaPlus, FaShoppingCart, FaTag, FaTimes, FaUtensils, FaUserFriends } from 'react-icons/fa';
import { auth, db } from '../../../server/api';
import LoadingScreen from '../../../resources/loading/LoadingScreen';
import toast from '../../../resources/toast/toast';
import Caja from './caja/caja';

function cleanDescription(value) {
	const description = String(value ?? '').trim();
	return description && description !== '0' ? description : '';
}

function countDenominations(values) {
	return [...new Set(values)].map((value) => ({ valor: value, cantidad: values.filter((item) => item === value).length }));
}

function Cuenta({ table, profile, onClose }) {
	const [liveTable, setLiveTable] = useState(table);
	const [products, setProducts] = useState([]);
	const [selectedCategory, setSelectedCategory] = useState('');
	const [cart, setCart] = useState([]);
	const [loading, setLoading] = useState(true);
	const [animatedProductId, setAnimatedProductId] = useState(null);
	const [editingDescription, setEditingDescription] = useState(false);
	const [description, setDescription] = useState(cleanDescription(table.descripcion));
	const [savingOrder, setSavingOrder] = useState(false);
	const [orderChanged, setOrderChanged] = useState(false);
	const [paymentOpen, setPaymentOpen] = useState(false);
	const [shiftOpen, setShiftOpen] = useState(false);
	const [shiftStatusLoaded, setShiftStatusLoaded] = useState(false);
	const [customers, setCustomers] = useState([]);
	const [customerSelectionOpen, setCustomerSelectionOpen] = useState(false);
	const [savingCustomerAccount, setSavingCustomerAccount] = useState(false);

	useEffect(() => {
		const unsubscribe = onSnapshot(doc(db, 'mesas', table.id), (snapshot) => {
			if (!snapshot.exists()) return;
			const nextTable = { id: snapshot.id, ...snapshot.data() };
			setLiveTable(nextTable);
			setDescription(cleanDescription(nextTable.descripcion));
			if (!orderChanged) setCart(nextTable.pedido || []);
		});
		return unsubscribe;
	}, [table.id, orderChanged]);

	useEffect(() => onSnapshot(doc(db, 'configuracion', 'turnoActual'), (snapshot) => {
		setShiftOpen(snapshot.exists() && snapshot.data().abierto === true);
		setShiftStatusLoaded(true);
	}, () => {
		setShiftOpen(false);
		setShiftStatusLoaded(true);
	}), []);

	useEffect(() => onSnapshot(collection(db, 'clientes'), (snapshot) => {
		setCustomers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((first, second) => first.nombre.localeCompare(second.nombre, 'es')));
	}), []);

	useEffect(() => {
		async function loadProducts() {
			try {
				const snapshot = await getDocs(collection(db, 'inventario'));
				setProducts(snapshot.docs.map((product) => ({ id: product.id, ...product.data() })));
			} catch (error) {
				toast.error('No se pudieron cargar los productos.');
			} finally {
				setLoading(false);
			}
		}

		loadProducts();
	}, []);

	const categories = useMemo(() => [...new Set(products.map((product) => product.categoria).filter(Boolean))], [products]);
	const activeCategory = selectedCategory || categories[0] || '';
	const visibleProducts = products.filter((product) => product.categoria === activeCategory);
	const total = cart.reduce((sum, item) => sum + Number(item.precioUnidad || 0) * item.cantidad, 0);

	function categoryIcon(category) {
		const normalized = category.toLocaleLowerCase('es-ES');
		if (normalized.includes('beb')) return FaBeer;
		if (normalized.includes('cafe') || normalized.includes('caf')) return FaCoffee;
		if (normalized.includes('postre') || normalized.includes('dulce')) return FaCookieBite;
		if (normalized.includes('coctel') || normalized.includes('licor')) return FaGlassWhiskey;
		if (normalized.includes('comida') || normalized.includes('plato')) return FaUtensils;
		return FaTag;
	}

	function addProduct(product) {
		const now = Date.now();
		setCart((currentCart) => {
			const existing = currentCart.find((item) => item.id === product.id && now - item.addedAt < 60000);
			if (existing) return currentCart.map((item) => {
				if (item.lineId !== existing.lineId) return item;
				const orderedTimes = item.horasPedido?.length ? item.horasPedido : Array.from({ length: item.cantidad }, () => Number(item.addedAt) || now);
				return { ...item, cantidad: item.cantidad + 1, horasPedido: [...orderedTimes, now] };
			});
			return [...currentCart, { ...product, lineId: `${product.id}-${now}`, cantidad: 1, addedAt: now, horasPedido: [now] }];
		});
		setOrderChanged(true);
		setAnimatedProductId(product.id);
		window.setTimeout(() => setAnimatedProductId(null), 450);
	}

	function changeQuantity(lineId, amount) {
		const changedAt = Date.now();
		setCart((currentCart) => currentCart
			.map((item) => {
				if (item.lineId !== lineId) return item;
				const nextQuantity = item.cantidad + amount;
				const orderedTimes = item.horasPedido?.length ? item.horasPedido : Array.from({ length: item.cantidad }, () => Number(item.addedAt) || changedAt);
				return { ...item, cantidad: nextQuantity, horasPedido: amount > 0 ? [...orderedTimes, changedAt] : orderedTimes.slice(0, nextQuantity) };
			})
			.filter((item) => item.cantidad > 0));
		setOrderChanged(true);
	}

	function formatOrderDate(timestamp) {
		return new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(timestamp));
	}

	async function saveDescription() {
		try {
			await updateDoc(doc(db, 'mesas', liveTable.id), { descripcion: cleanDescription(description) });
			setEditingDescription(false);
			toast.success('Descripción de mesa guardada.');
		} catch (error) {
			toast.error('No se pudo guardar la descripción de la mesa.');
		}
	}

	function cancelDescription() {
		setDescription(cleanDescription(liveTable.descripcion));
		setEditingDescription(false);
	}

	async function addOrderToCustomerAccount(customer) {
		if (!shiftOpen || !cart.length) return;
		setSavingCustomerAccount(true);
		const accountReference = doc(collection(db, 'cuentasCliente'));
		const creditInvoiceReference = doc(db, 'facturas', accountReference.id);
		const tableIds = table.tableIds?.length ? table.tableIds : [liveTable.id];
		const separatesCombinedTables = tableIds.length > 1;
		const orderData = cart.map(({ id, nombre, precioUnidad, cantidad, lineId, addedAt, horasPedido }) => ({
			id,
			nombre,
			precioUnidad: Number(precioUnidad || 0),
			cantidad,
			lineId,
			addedAt: Number(addedAt) || Date.now(),
			horaPedido: Number(addedAt) || Date.now(),
			horasPedido: horasPedido?.length ? horasPedido : Array.from({ length: cantidad }, () => Number(addedAt) || Date.now()),
		}));
		const orderTotal = orderData.reduce((sum, item) => sum + item.precioUnidad * Number(item.cantidad || 0), 0);
		try {
			await runTransaction(db, async (transaction) => {
				const pointerSnapshot = await transaction.get(doc(db, 'configuracion', 'turnoActual'));
				const customerSnapshot = await transaction.get(doc(db, 'clientes', customer.id));
				const tableSnapshots = new Map();
				for (const tableId of tableIds) tableSnapshots.set(tableId, await transaction.get(doc(db, 'mesas', tableId)));
				if (!pointerSnapshot.exists() || !pointerSnapshot.data().abierto) throw new Error('Para anotar pedidos debes tener un turno abierto.');
				if (!customerSnapshot.exists()) throw new Error('El cliente ya no está disponible.');
				if ([...tableSnapshots.values()].some((snapshot) => !snapshot.exists())) throw new Error('Una de las mesas ya no está disponible.');
				const user = auth.currentUser;
				transaction.set(accountReference, {
					clienteId: customer.id,
					clienteNombre: customerSnapshot.data().nombre,
					clienteTelefono: customerSnapshot.data().telefono,
					turnoId: pointerSnapshot.data().turnoId,
					pedido: orderData,
					total: orderTotal,
					saldoPendiente: orderTotal,
					estado: 'pendiente',
					mesaOrigen: table.label || `Mesa ${table.numero}`,
					creadaPor: profileName(),
					creadaPorCorreo: user?.email || '',
					creadaEn: serverTimestamp(),
				});
				transaction.set(creditInvoiceReference, {
					folio: creditInvoiceReference.id,
					turnoId: pointerSnapshot.data().turnoId,
					mesaId: `cliente-${customer.id}`,
					mesaNombre: `Cuenta de ${customerSnapshot.data().nombre}`,
					clienteId: customer.id,
					clienteNombre: customerSnapshot.data().nombre,
					clienteTelefono: customerSnapshot.data().telefono,
					cuentaClienteId: accountReference.id,
					tipo: 'credito_cliente',
					monto: orderTotal,
					pedido: orderData,
					metodoPagoId: 'credito',
					metodoPago: 'Cuenta pendiente',
					metodosPago: [],
					saldoRestante: orderTotal,
					estado: 'pendiente',
					registradaPor: profileName(),
					registradaPorCorreo: auth.currentUser?.email || '',
					observacion: '',
					pagadoEn: serverTimestamp(),
				});
				for (const tableId of tableIds) {
					if (separatesCombinedTables) {
						transaction.update(doc(db, 'mesas', tableId), { pedido: [], pedidoDesde: 0, ultimoPedidoEn: 0, grupoId: deleteField(), descripcion: deleteField(), estado: 'disponible' });
					} else {
						transaction.update(doc(db, 'mesas', tableId), { pedido: [], pedidoDesde: 0, ultimoPedidoEn: 0 });
					}
				}
			});
			setCustomerSelectionOpen(false);
			toast.success(`Pedido anotado en la cuenta de ${customer.nombre}.`);
			onClose();
		} catch (error) {
			toast.error(error.message || 'No se pudo anotar el pedido al cliente.');
		} finally {
			setSavingCustomerAccount(false);
		}
	}

	function profileName() {
		return [profile?.nombre, profile?.apellido].filter(Boolean).join(' ') || auth.currentUser?.displayName || auth.currentUser?.email || 'Usuario';
	}

	async function closeAccount() {
		if (!orderChanged) {
			onClose();
			return;
		}
		setSavingOrder(true);
		try {
			const orderData = cart.map(({ id, nombre, precioUnidad, cantidad, lineId, addedAt, horasPedido }) => ({ id, nombre, precioUnidad: Number(precioUnidad || 0), cantidad, lineId, addedAt, horasPedido }));
			const mesaData = orderData.length ? {
				pedido: orderData,
				pedidoDesde: liveTable.pedidoDesde || Date.now(),
				ultimoPedidoEn: Date.now(),
			} : {
				pedido: [],
				pedidoDesde: 0,
				ultimoPedidoEn: 0,
			};
			await updateDoc(doc(db, 'mesas', liveTable.id), mesaData);
			onClose();
			toast.success('Pedido guardado correctamente.');
		} catch (error) {
			toast.error('No se pudo guardar el pedido de la mesa.');
		} finally {
			setSavingOrder(false);
		}
	}

	async function handlePayment(method, paymentDetails = {}, paidItems = null, allocations = null) {
		const tableReference = doc(db, 'mesas', liveTable.id);
		const paymentReference = doc(collection(db, 'pagos'));
		const invoiceReference = doc(collection(db, 'facturas'));
		const orderData = cart.map(({ id, nombre, precioUnidad, cantidad, lineId, addedAt, horasPedido }) => ({ id, nombre, precioUnidad: Number(precioUnidad || 0), cantidad, lineId, addedAt, horasPedido }));
		const paidOrder = paidItems || orderData;
		const paidTotal = paidOrder.reduce((sum, item) => sum + Number(item.precioUnidad || 0) * item.cantidad, 0);
		const remainingOrder = paidItems ? orderData.map((item) => ({ ...item, cantidad: item.cantidad - (paidItems.find((paidItem) => paidItem.lineId === item.lineId)?.cantidad || 0) })).filter((item) => item.cantidad > 0) : [];
		const paymentAllocations = allocations?.length ? allocations : [{ methodId: method.id, nombre: method.nombre, monto: paidTotal, amount: paidTotal, method, denominations: paymentDetails.denominations || [], received: paymentDetails.received || 0, change: paymentDetails.change || 0 }];
		const balanceByMethod = paymentAllocations.reduce((balances, allocation) => ({ ...balances, [allocation.methodId]: (balances[allocation.methodId] || 0) + Number(allocation.amount || allocation.monto || 0) }), {});
		const movementReferences = paymentAllocations.map(() => doc(collection(db, 'movimientos')));
		const tableIds = table.tableIds?.length ? table.tableIds : [liveTable.id];
		const separatesCombinedTables = !paidItems && tableIds.length > 1;

		await runTransaction(db, async (transaction) => {
			const methodSnapshots = new Map();
			for (const methodId of Object.keys(balanceByMethod)) {
				const methodSnapshot = await transaction.get(doc(db, 'metodosPago', methodId));
				if (!methodSnapshot.exists()) throw new Error('Uno de los métodos de pago ya no está disponible.');
				methodSnapshots.set(methodId, methodSnapshot);
			}
			const shiftPointerSnapshot = await transaction.get(doc(db, 'configuracion', 'turnoActual'));
			const activeShiftId = shiftPointerSnapshot.exists() && shiftPointerSnapshot.data().abierto ? shiftPointerSnapshot.data().turnoId : '';
			if (!activeShiftId) throw new Error('No hay un turno abierto. Abre caja antes de registrar el pago.');
			const currentUser = auth.currentUser;
			const profileSnapshot = currentUser?.email ? await transaction.get(doc(db, 'usuarios', currentUser.email.trim().toLowerCase())) : null;
			const profileData = profileSnapshot?.exists() ? profileSnapshot.data() : {};
			const paymentActor = [profileData.nombre, profileData.apellido].filter(Boolean).join(' ') || currentUser?.email || 'Usuario';
							if (separatesCombinedTables) {
								tableIds.forEach((tableId) => transaction.update(doc(db, 'mesas', tableId), { pedido: [], pedidoDesde: 0, ultimoPedidoEn: 0, grupoId: deleteField(), descripcion: deleteField(), estado: 'disponible' }));
			} else {
				transaction.update(tableReference, paidItems ? { pedido: remainingOrder, pedidoDesde: remainingOrder.length ? liveTable.pedidoDesde || Date.now() : 0, ultimoPedidoEn: remainingOrder.length ? Date.now() : 0 } : { pedido: [], pedidoDesde: 0, ultimoPedidoEn: 0 });
			}
			Object.entries(balanceByMethod).forEach(([methodId, amount]) => {
				const currentBalance = Number(methodSnapshots.get(methodId).data().saldo || 0);
				transaction.update(doc(db, 'metodosPago', methodId), { saldo: currentBalance + amount });
			});
			if (activeShiftId) paymentAllocations.forEach((allocation, index) => {
				const methodData = allocation.method || methodSnapshots.get(allocation.methodId).data();
				const denominations = allocation.denominations || (methodData.tipo === 'efectivo' ? paymentDetails.denominations || [] : []);
				transaction.set(movementReferences[index], {
					turnoId: activeShiftId,
					tipo: 'venta',
					direccion: 'ingreso',
					metodoId: allocation.methodId,
					metodoNombre: methodData.nombre || allocation.nombre || method.nombre,
					monto: Number(allocation.amount || allocation.monto || 0),
					efectivoRecibido: Number(allocation.received || (methodData.tipo === 'efectivo' ? paymentDetails.received : 0) || 0),
					cambio: Number(allocation.change || (methodData.tipo === 'efectivo' ? paymentDetails.change : 0) || 0),
					denominaciones: methodData.tipo === 'efectivo' ? countDenominations(denominations) : [],
					descripcion: `Pago ${paidItems ? 'parcial' : 'de cuenta'}`,
					creadoPor: paymentActor,
					creadoPorCorreo: currentUser?.email || '',
					creadoEn: serverTimestamp(),
				});
			});
			transaction.set(paymentReference, {
				mesaId: liveTable.id,
				mesaNombre: table.label || `Mesa ${table.numero}`,
				metodoPagoId: paymentAllocations.length === 1 ? paymentAllocations[0].methodId : 'multiple',
				metodoPago: paymentAllocations.length === 1 ? paymentAllocations[0].method?.nombre || paymentAllocations[0].nombre || method.nombre : 'Múltiples métodos',
				monto: paidTotal,
				pedido: paidOrder,
				efectivoRecibido: paymentDetails.received || 0,
				cambio: paymentDetails.change || 0,
				denominaciones: paymentDetails.denominations || [],
				...(activeShiftId ? { turnoId: activeShiftId } : {}),
				pagadoEn: serverTimestamp(),
			});
			const invoiceMethods = paymentAllocations.map((allocation) => {
				const methodData = allocation.method || methodSnapshots.get(allocation.methodId).data();
				return {
					metodoId: allocation.methodId,
					nombre: methodData.nombre || allocation.nombre || method.nombre,
					tipo: methodData.tipo || '',
					monto: Number(allocation.amount || allocation.monto || 0),
					efectivoRecibido: Number(allocation.received || (methodData.tipo === 'efectivo' ? paymentDetails.received : 0) || 0),
					cambio: Number(allocation.change || (methodData.tipo === 'efectivo' ? paymentDetails.change : 0) || 0),
					denominaciones: methodData.tipo === 'efectivo' ? countDenominations(allocation.denominations || paymentDetails.denominations || []) : [],
				};
			});
			transaction.set(invoiceReference, {
				folio: invoiceReference.id,
				turnoId: activeShiftId,
				mesaId: liveTable.id,
				mesaNombre: table.label || `Mesa ${table.numero}`,
				tipo: paidItems ? 'parcial' : 'completa',
				monto: paidTotal,
				pedido: paidOrder,
				metodoPagoId: invoiceMethods.length === 1 ? invoiceMethods[0].metodoId : 'multiple',
				metodoPago: invoiceMethods.length === 1 ? invoiceMethods[0].nombre : 'Múltiples métodos',
				metodosPago: invoiceMethods,
				efectivoRecibido: paymentDetails.received || 0,
				cambio: paymentDetails.change || 0,
				denominaciones: paymentDetails.denominations || [],
				registradaPor: paymentActor,
				registradaPorCorreo: currentUser?.email || '',
				observacion: '',
				pagadoEn: serverTimestamp(),
			});
		});

		if (paidItems) {
			setCart(remainingOrder);
			setOrderChanged(false);
			toast.success(`Factura parcial pagada con ${paymentAllocations.length > 1 ? 'múltiples métodos' : paymentAllocations[0].method?.nombre || paymentAllocations[0].nombre || method.nombre}.`);
			return;
		}
		setPaymentOpen(false);
		onClose();
		toast.success(`Pago registrado con ${paymentAllocations.length > 1 ? 'múltiples métodos' : method.nombre}.`);
	}

	if (savingOrder) return <LoadingScreen text="Guardando pedido" />;

	if (loading) return <LoadingScreen text="Cargando productos" />;

	return (
		<div className="account-modal-backdrop">
			<section className="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
				<header className="account-header">
					<div className="account-table-title">
						<h1 id="account-title">{table.label || `Mesa ${table.numero}`}</h1>
						{editingDescription ? <div className="account-description-editor"><input aria-label="Descripción de mesa" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ej. Cerca de la ventana" /><button type="button" aria-label="Guardar descripción" onClick={saveDescription}><FaCheck /></button><button className="account-description-cancel" type="button" aria-label="Cancelar descripción" onClick={cancelDescription}><FaTimes /></button></div> : <>{description && <p>{description}</p>}<button className="account-description-button" type="button" onClick={() => setEditingDescription(true)}>Descripción mesa</button></>}
					</div>
					<button className="account-close" type="button" aria-label="Cerrar cuenta" onClick={closeAccount} disabled={savingOrder}><FaTimes /></button>
				</header>
				<div className="account-layout">
					<section className="account-order" aria-labelledby="order-title">
						<div className="account-order-heading"><FaShoppingCart aria-hidden="true" /><h2 id="order-title">Pedido</h2></div>
						{cart.length === 0 ? <p className="account-empty">Aún no hay productos pedidos.</p> : <div className="account-cart">
							{cart.map((item) => <div className="account-cart-item" key={item.lineId}>
								<div><strong>{item.nombre}</strong><small>Agregado: {(item.horasPedido || [item.addedAt]).map(formatOrderDate).join(', ')}</small><span>${(Number(item.precioUnidad || 0) * item.cantidad).toLocaleString('es-CO')}</span></div>
								<div className="account-quantity"><button type="button" aria-label={`Quitar ${item.nombre}`} onClick={() => changeQuantity(item.lineId, -1)}><FaMinus /></button><span>{item.cantidad}</span><button type="button" aria-label={`Agregar ${item.nombre}`} onClick={() => changeQuantity(item.lineId, 1)}><FaPlus /></button></div>
							</div>)}
						</div>}
						<div className="account-total"><span>Total</span><strong>${total.toLocaleString('es-CO')}</strong></div>
						{shiftStatusLoaded && !shiftOpen && <p className="account-shift-required" role="status">Para pagar la cuenta debes tener un turno abierto.</p>}
						<button className="account-pay-button" type="button" disabled={!total || savingOrder || !shiftStatusLoaded || !shiftOpen} title={!shiftOpen ? 'Abre un turno para habilitar el pago.' : undefined} onClick={() => setPaymentOpen(true)}>Pagar cuenta</button>
						<button className="account-credit-button" type="button" disabled={!cart.length || savingCustomerAccount || !shiftStatusLoaded || !shiftOpen} onClick={() => setCustomerSelectionOpen(true)}><FaUserFriends aria-hidden="true" /> Anotar a cliente</button>
					</section>
					<section className="account-products" aria-labelledby="products-title">
						<h2 id="products-title">Productos</h2>
						<div className="account-content-grid">
							<nav className="account-categories" aria-label="Categorías de productos">
								{categories.map((category) => { const Icon = categoryIcon(category); return <button className={activeCategory === category ? 'account-category-active' : ''} type="button" key={category} onClick={() => setSelectedCategory(category)}><Icon aria-hidden="true" /><span>{category}</span></button>; })}
							</nav>
			<select className="account-category-select" aria-label="Categoría de productos" value={activeCategory} onChange={(event) => setSelectedCategory(event.target.value)}>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
							<div className="account-product-list">
								{visibleProducts.length === 0 ? <p className="account-empty">No hay productos disponibles.</p> : visibleProducts.map((product) => <button className={`account-product${animatedProductId === product.id ? ' account-product-added' : ''}`} type="button" key={product.id} onClick={() => addProduct(product)}><span>{product.nombre}</span><strong>${Number(product.precioUnidad || 0).toLocaleString('es-CO')}</strong></button>)}
							</div>
						</div>
					</section>
				</div>
			</section>
			{paymentOpen && <Caja total={total} table={table} items={cart} onClose={() => setPaymentOpen(false)} onPaid={handlePayment} />}
			{customerSelectionOpen && <div className="account-modal-backdrop account-credit-backdrop"><section className="account-credit-modal" role="dialog" aria-modal="true" aria-labelledby="credit-customer-title"><header><div><p className="app-eyebrow">Pedido a crédito</p><h2 id="credit-customer-title">Selecciona el cliente</h2></div><button type="button" aria-label="Cerrar" onClick={() => setCustomerSelectionOpen(false)}><FaTimes /></button></header>{customers.length === 0 ? <p className="account-empty">Primero registra un cliente en la sección Clientes.</p> : <div className="account-credit-customer-list">{customers.map((customer) => <button type="button" key={customer.id} disabled={savingCustomerAccount} onClick={() => addOrderToCustomerAccount(customer)}><strong>{customer.nombre}</strong><span>{customer.telefono}</span></button>)}</div>}{savingCustomerAccount && <p role="status">Guardando cuenta del cliente...</p>}</section></div>}
		</div>
	);
}

export default Cuenta;