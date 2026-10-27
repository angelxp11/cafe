import "./cuenta.css";

import { useEffect, useMemo, useState } from 'react';
import { collection, deleteField, doc, onSnapshot, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { FaBeer, FaCheck, FaCoffee, FaCookieBite, FaGlassWhiskey, FaMinus, FaPlus, FaShoppingCart, FaTag, FaTimes, FaUtensils, FaUserFriends } from 'react-icons/fa';
import { auth, db } from '../../../server/api';
import { amountWithCommission, paymentCommission, shiftBalance } from '../../../server/paymentMethods';
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

function getProductStock(product) {
	const stockItems = product.modoSabores === 'sabores'
		? (product.sabores || []).map((flavor) => ({
			name: typeof flavor === 'string' ? flavor : flavor.nombre,
			stock: typeof flavor === 'string' ? 0 : flavor.stock,
		}))
		: [{ name: '', stock: product.stock }];
	const details = stockItems.map(({ name, stock }) => {
		const quantity = Number(stock);
		const available = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
		return { name, available };
	});

	return {
		total: details.reduce((sum, item) => sum + item.available, 0),
		label: details.map(({ name, available }) => `${name ? `${name}: ` : 'Stock: '}${available.toLocaleString('es-CO')}`).join(' · ') || 'Stock: 0',
	};
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
		return onSnapshot(collection(db, 'inventario'), (snapshot) => {
			setProducts(snapshot.docs.map((product) => ({ id: product.id, ...product.data() })));
			setLoading(false);
		}, () => {
			toast.error('No se pudieron cargar los productos.');
			setLoading(false);
		});
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

	function getOrderTimeGroups(item) {
		const timestamps = item.horasPedido?.length ? item.horasPedido : [item.addedAt];
		const groups = new Map();
		timestamps.forEach((timestamp) => {
			const date = new Date(timestamp);
			const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
			const group = groups.get(key) || { timestamp, quantity: 0 };
			group.quantity += 1;
			groups.set(key, group);
		});
		return [...groups.values()];
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
		const subtotal = paidOrder.reduce((sum, item) => sum + Number(item.precioUnidad || 0) * item.cantidad, 0);
		let paidTotal = subtotal;
		const remainingOrder = paidItems ? orderData.map((item) => ({ ...item, cantidad: item.cantidad - (paidItems.find((paidItem) => paidItem.lineId === item.lineId)?.cantidad || 0) })).filter((item) => item.cantidad > 0) : [];
		const requestedAllocations = allocations?.length ? allocations : [{ methodId: method.id, nombre: method.nombre, baseAmount: subtotal, method, denominations: paymentDetails.denominations || [], received: paymentDetails.received || 0, change: paymentDetails.change || 0 }];
		let paymentAllocations = [];
		const movementReferences = requestedAllocations.map(() => doc(collection(db, 'movimientos')));
		const tableIds = table.tableIds?.length ? table.tableIds : [liveTable.id];
		const separatesCombinedTables = !paidItems && tableIds.length > 1;

		await runTransaction(db, async (transaction) => {
			const methodSnapshots = new Map();
			const methodIds = [...new Set(requestedAllocations.map((allocation) => allocation.methodId))];
			for (const methodId of methodIds) {
				const methodSnapshot = await transaction.get(doc(db, 'metodosPago', methodId));
				if (!methodSnapshot.exists()) throw new Error('Uno de los métodos de pago ya no está disponible.');
				methodSnapshots.set(methodId, methodSnapshot);
			}
			paymentAllocations = requestedAllocations.map((allocation) => {
				const methodData = methodSnapshots.get(allocation.methodId).data();
				const baseAmount = Number(allocation.baseAmount ?? allocation.amount ?? allocation.monto ?? 0);
				const commissionPercentage = Number(methodData.comision ?? 0);
				if (!Number.isFinite(commissionPercentage) || commissionPercentage < 0 || commissionPercentage > 100) {
					throw new Error(`La comisión configurada para ${methodData.nombre || 'un método de pago'} no es válida.`);
				}
				const commissionAmount = paymentCommission(baseAmount, commissionPercentage);
				const amount = amountWithCommission(baseAmount, commissionPercentage);
				const received = Number(allocation.received || 0);
				if (methodData.tipo === 'efectivo' && received < amount) {
					throw new Error(`El efectivo recibido para ${methodData.nombre || 'el pago'} no cubre el total con comisión.`);
				}
				return {
					...allocation,
					method: methodData,
					baseAmount,
					commissionPercentage,
					commissionAmount,
					amount,
					change: methodData.tipo === 'efectivo' ? received - amount : 0,
				};
			});
			if (paymentAllocations.some((allocation) => allocation.baseAmount <= 0)
				|| paymentAllocations.reduce((sum, allocation) => sum + allocation.baseAmount, 0) !== subtotal) {
				throw new Error('La distribución del pago no coincide con el subtotal de la cuenta.');
			}
			paidTotal = paymentAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
			const balanceByMethod = paymentAllocations.reduce((balances, allocation) => ({ ...balances, [allocation.methodId]: (balances[allocation.methodId] || 0) + allocation.amount }), {});
			const shiftPointerSnapshot = await transaction.get(doc(db, 'configuracion', 'turnoActual'));
			const activeShiftId = shiftPointerSnapshot.exists() && shiftPointerSnapshot.data().abierto ? shiftPointerSnapshot.data().turnoId : '';
			if (!activeShiftId) throw new Error('No hay un turno abierto. Abre caja antes de registrar el pago.');
			const currentUser = auth.currentUser;
			const profileSnapshot = currentUser?.email ? await transaction.get(doc(db, 'usuarios', currentUser.email.trim().toLowerCase())) : null;
			const profileData = profileSnapshot?.exists() ? profileSnapshot.data() : {};
			const paymentActor = [profileData.nombre, profileData.apellido].filter(Boolean).join(' ') || currentUser?.displayName || currentUser?.email || 'Usuario';
			const inventoryIds = [...new Set(paidOrder.map((item) => item.id).filter(Boolean))];
			const inventorySnapshots = await Promise.all(inventoryIds.map((productId) => transaction.get(doc(db, 'inventario', productId))));
			const inventoryProducts = new Map(inventorySnapshots.filter((snapshot) => snapshot.exists()).map((snapshot) => [snapshot.id, { reference: doc(db, 'inventario', snapshot.id), data: snapshot.data() }]));
			if (inventoryProducts.size !== inventoryIds.length) throw new Error('Uno de los productos ya no existe en el inventario.');
			const inventoryAdjustments = {};
			for (const item of paidOrder) {
				const product = inventoryProducts.get(item.id);
				const quantity = Number(item.cantidad) || 0;
				if (!product || quantity <= 0) throw new Error('No se pudo validar el producto de la factura.');
				if (product.data.modoSabores === 'sabores' && product.data.enReversa !== true) {
					let remaining = quantity;
					const flavors = (product.data.sabores || []).map((flavor) => {
						const stock = Number(typeof flavor === 'string' ? 0 : flavor.stock || 0);
						const deducted = Math.min(stock, remaining);
						remaining -= deducted;
						if (deducted) {
							const name = typeof flavor === 'string' ? flavor : flavor.nombre;
						inventoryAdjustments[item.id] = inventoryAdjustments[item.id] || { cantidad: 0, sabores: {}, enReversa: false };
							inventoryAdjustments[item.id].sabores[name] = (inventoryAdjustments[item.id].sabores[name] || 0) + deducted;
							inventoryAdjustments[item.id].cantidad += deducted;
						}
						return deducted && typeof flavor !== 'string' ? { ...flavor, stock: stock - deducted } : flavor;
					});
					if (remaining > 0) throw new Error(`No hay suficientes existencias de ${item.nombre}.`);
					product.data = { ...product.data, sabores: flavors };
				} else if (product.data.modoSabores === 'sabores') {
					const flavorIndex = (product.data.sabores || []).length ? 0 : -1;
					if (flavorIndex < 0) throw new Error(`No se puede registrar el inventario en reversa para ${item.nombre} sin sabores configurados.`);
					const flavor = product.data.sabores[flavorIndex];
					const flavorName = typeof flavor === 'string' ? flavor : flavor.nombre;
					const flavors = product.data.sabores.map((entry, index) => {
						if (index !== flavorIndex) return entry;
						return typeof entry === 'string'
							? { nombre: entry, stock: quantity }
							: { ...entry, stock: Number(entry.stock || 0) + quantity };
					});
					product.data = { ...product.data, sabores: flavors };
					inventoryAdjustments[item.id] = inventoryAdjustments[item.id] || { cantidad: 0, sabores: {}, enReversa: true };
					inventoryAdjustments[item.id].sabores[flavorName] = (inventoryAdjustments[item.id].sabores[flavorName] || 0) + quantity;
					inventoryAdjustments[item.id].cantidad += quantity;
				} else if (product.data.enReversa === true) {
					product.data = { ...product.data, stock: Number(product.data.stock || 0) + quantity };
					inventoryAdjustments[item.id] = { cantidad: (inventoryAdjustments[item.id]?.cantidad || 0) + quantity, enReversa: true };
				} else {
					const stock = Number(product.data.stock || 0);
					if (stock < quantity) throw new Error(`No hay suficientes existencias de ${item.nombre}.`);
					product.data = { ...product.data, stock: stock - quantity };
					inventoryAdjustments[item.id] = { cantidad: (inventoryAdjustments[item.id]?.cantidad || 0) + quantity, enReversa: false };
				}
			}
			for (const [productId, product] of inventoryProducts) {
				if (inventoryAdjustments[productId]) transaction.update(product.reference, {
					...(product.data.modoSabores === 'sabores' ? { sabores: product.data.sabores } : { stock: product.data.stock }),
					ultimoMovimientoInventarioId: invoiceReference.id,
				});
			}
							if (separatesCombinedTables) {
								tableIds.forEach((tableId) => transaction.update(doc(db, 'mesas', tableId), { pedido: [], pedidoDesde: 0, ultimoPedidoEn: 0, grupoId: deleteField(), descripcion: deleteField(), estado: 'disponible' }));
			} else {
				transaction.update(tableReference, paidItems ? { pedido: remainingOrder, pedidoDesde: remainingOrder.length ? liveTable.pedidoDesde || Date.now() : 0, ultimoPedidoEn: remainingOrder.length ? Date.now() : 0 } : { pedido: [], pedidoDesde: 0, ultimoPedidoEn: 0 });
			}
			Object.entries(balanceByMethod).forEach(([methodId, amount]) => {
				const currentBalance = shiftBalance(methodSnapshots.get(methodId).data());
				transaction.update(doc(db, 'metodosPago', methodId), { saldoTurno: currentBalance + amount });
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
					subtotal: Number(allocation.baseAmount || 0),
					comision: Number(allocation.commissionAmount || 0),
					comisionPorcentaje: Number(allocation.commissionPercentage || 0),
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
				subtotal,
				comision: paidTotal - subtotal,
				pedido: paidOrder,
				efectivoRecibido: paymentDetails.received || 0,
				cambio: paymentDetails.change || 0,
				denominaciones: paymentDetails.denominations || [],
				...(activeShiftId ? { turnoId: activeShiftId } : {}),
				registradaPor: paymentActor,
				registradaPorCorreo: currentUser?.email || '',
				pagadoEn: serverTimestamp(),
			});
			const invoiceMethods = paymentAllocations.map((allocation) => {
				const methodData = allocation.method || methodSnapshots.get(allocation.methodId).data();
				return {
					metodoId: allocation.methodId,
					nombre: methodData.nombre || allocation.nombre || method.nombre,
					tipo: methodData.tipo || '',
					monto: Number(allocation.amount || allocation.monto || 0),
					subtotal: Number(allocation.baseAmount || 0),
					comision: Number(allocation.commissionAmount || 0),
					comisionPorcentaje: Number(allocation.commissionPercentage || 0),
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
				subtotal,
				comision: paidTotal - subtotal,
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
				inventarioAjustes: inventoryAdjustments,
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
								<div className="account-cart-details">
									<strong>{item.nombre}</strong>
									<div className="account-cart-times" aria-label="Horarios en que se agregó">
										<span className="account-cart-times-label">Agregado</span>
										{getOrderTimeGroups(item).map(({ timestamp, quantity }) => <span className="account-cart-time" key={`${timestamp}-${quantity}`}>{formatOrderDate(timestamp)}{quantity > 1 && <strong> ×{quantity}</strong>}</span>)}
									</div>
									<span className="account-cart-price">${(Number(item.precioUnidad || 0) * item.cantidad).toLocaleString('es-CO')}</span>
								</div>
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
								{visibleProducts.length === 0 ? <p className="account-empty">No hay productos disponibles.</p> : visibleProducts.map((product) => {
									const stock = getProductStock(product);
									const isOutOfStock = stock.total === 0 && product.enReversa !== true;
									return <button className={`account-product${isOutOfStock ? ' account-product-out-of-stock' : ''}${animatedProductId === product.id ? ' account-product-added' : ''}`} type="button" key={product.id} onClick={() => addProduct(product)} disabled={isOutOfStock} title={stock.label} aria-label={`${product.nombre}, $${Number(product.precioUnidad || 0).toLocaleString('es-CO')}, ${stock.label}`}><span>{product.nombre}</span><strong>${Number(product.precioUnidad || 0).toLocaleString('es-CO')}</strong><span className="account-product-stock" aria-hidden="true">{stock.label}</span></button>;
								})}
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