import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { FaArrowDown, FaArrowUp, FaClock, FaPlay, FaPrint, FaStop } from 'react-icons/fa';
import { auth, db } from '../../server/api';
import LoadingScreen from '../../resources/loading/LoadingScreen';
import toast from '../../resources/toast/toast';
import './turno.css';
import bill50 from '../../resources/denominaciones/50.svg';
import bill100 from '../../resources/denominaciones/100.svg';
import bill200 from '../../resources/denominaciones/200.svg';
import bill500 from '../../resources/denominaciones/500.svg';
import bill1000 from '../../resources/denominaciones/1000.svg';
import bill2000 from '../../resources/denominaciones/2000.svg';
import bill5000 from '../../resources/denominaciones/5000.svg';
import bill10000 from '../../resources/denominaciones/10000.svg';
import bill20000 from '../../resources/denominaciones/20000.svg';
import bill50000 from '../../resources/denominaciones/50000.svg';
import bill100000 from '../../resources/denominaciones/100000.svg';

const denominations = [
	{ value: 100000, image: bill100000 },
	{ value: 50000, image: bill50000 },
	{ value: 20000, image: bill20000 },
	{ value: 10000, image: bill10000 },
	{ value: 5000, image: bill5000 },
	{ value: 2000, image: bill2000 },
	{ value: 1000, image: bill1000 },
	{ value: 500, image: bill500 },
	{ value: 200, image: bill200 },
	{ value: 100, image: bill100 },
	{ value: 50, image: bill50 },
];

function emptyCount() {
	return Object.fromEntries(denominations.map(({ value }) => [value, '']));
}

function countTotal(counts) {
	return denominations.reduce((sum, { value }) => sum + value * (Number(counts[value]) || 0), 0);
}

function countEntries(counts) {
	return denominations.filter(({ value }) => Number(counts[value]) > 0).map(({ value }) => ({ valor: value, cantidad: Number(counts[value]) }));
}

function formatMoney(value) {
	return `$${Number(value || 0).toLocaleString('es-CO')}`;
}

function formatDate(value) {
	const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
	return date ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(date) : 'Ahora';
}

function formatDuration(milliseconds) {
	const minutes = Math.max(0, Math.floor(milliseconds / 60000));
	const days = Math.floor(minutes / 1440);
	const hours = Math.floor((minutes % 1440) / 60);
	const remainingMinutes = minutes % 60;
	return [days && `${days} d`, hours && `${hours} h`, `${remainingMinutes} min`].filter(Boolean).join(' ');
}

function escapeHtml(value) {
	return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function reportHtml(shift, invoices, movements, inventory) {
	const methodTotals = new Map();
	const soldItems = new Map();
	const methodNameById = new Map();
	const expenses = movements.filter((movement) => movement.tipo === 'egreso' || movement.direccion === 'egreso');
	const expenseTotals = new Map();
	for (const invoice of invoices) {
		if (invoice.tipo !== 'credito_cliente') {
			for (const payment of invoice.metodosPago?.length ? invoice.metodosPago : [{ metodoId: invoice.metodoPagoId, nombre: invoice.metodoPago, monto: invoice.monto }]) {
				const key = payment.metodoId || payment.nombre || 'otro';
				methodNameById.set(key, payment.nombre || 'Otro método');
				methodTotals.set(key, (methodTotals.get(key) || 0) + Number(payment.monto || 0));
			}
		}
		if (invoice.tipo !== 'abono_cliente') for (const item of invoice.pedido || []) {
			const key = item.id || item.nombre;
			const sold = soldItems.get(key) || { id: item.id || '', nombre: item.nombre || 'Producto', cantidad: 0 };
			sold.cantidad += Number(item.cantidad || 0);
			soldItems.set(key, sold);
		}
	}
	for (const expense of expenses) {
		const key = expense.metodoId || expense.metodoNombre || 'otro';
		const row = expenseTotals.get(key) || { nombre: expense.metodoNombre || 'Otro método', monto: 0, registros: 0 };
		row.monto += Number(expense.monto || 0);
		row.registros += 1;
		expenseTotals.set(key, row);
	}
	const inventoryById = new Map(inventory.map((item) => [item.id, item]));
	const methodsRows = [...methodTotals].map(([key, amount]) => `<tr><td>${escapeHtml(methodNameById.get(key))}</td><td>${escapeHtml(methodsNameType(invoices, key))}</td><td>${formatMoney(amount)}</td></tr>`).join('');
	const salesRows = [...soldItems.values()].map((item) => {
		const stockItem = inventoryById.get(item.id);
		return `<tr><td>${escapeHtml(item.id || '—')}</td><td>${escapeHtml(stockItem?.nombre || item.nombre)}</td><td>${item.cantidad}</td><td>${escapeHtml(stockItem?.tipo === 'preparable' ? 'Preparación' : 'Producto')}</td></tr>`;
	}).join('');
	const expenseRows = [...expenseTotals.values()].map((expense) => `<tr><td>${escapeHtml(expense.nombre)}</td><td>${expense.registros}</td><td>${formatMoney(expense.monto)}</td></tr>`).join('');
	const invoiceRows = invoices.map((invoice) => `<tr><td>${escapeHtml(String(invoice.folio || invoice.id).slice(0, 8).toUpperCase())}</td><td>${escapeHtml(invoice.mesaNombre || 'Mesa')}</td><td>${escapeHtml(invoice.metodoPago || 'Múltiples métodos')}</td><td>${formatMoney(invoice.monto)}</td></tr>`).join('');
	const openingDenominations = (shift.apertura?.denominaciones || []).map((bill) => `<span>${bill.cantidad} × ${formatMoney(bill.valor)}</span>`).join(' · ') || 'Sin detalle';
	const closingDenominations = (shift.cierre?.denominaciones || []).map((bill) => `<span>${bill.cantidad} × ${formatMoney(bill.valor)}</span>`).join(' · ') || 'Sin detalle';
	const startedAt = formatDate(shift.inicioEn);
	const closedAt = formatDate(shift.cierre?.cerradoEn);
	return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cierre de turno</title><style>
		:root{font-family:Arial,sans-serif;color:#24312d;background:#edf1ed}*{box-sizing:border-box}body{margin:0;padding:32px}.report{max-width:980px;margin:auto;background:#fff;border:1px solid #d9e0dc}.masthead{padding:30px 36px;background:#29443b;color:#fff}.eyebrow{margin:0 0 8px;color:#c8d7cd;font-size:11px;letter-spacing:1px;text-transform:uppercase}.masthead h1{margin:0;font-size:28px}.masthead p{margin:8px 0 0;color:#dbe7de}.content{padding:28px 36px}.meta,.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.meta{padding-bottom:22px;border-bottom:1px solid #e1e7e3}.meta span,.metric span{display:block;color:#63736b;font-size:12px}.meta strong{display:block;margin-top:5px;font-size:14px}.metrics{margin:22px 0}.metric{padding:14px;border:1px solid #dfe6e1;background:#f8faf8}.metric strong{display:block;margin-top:6px;font-size:19px}.section{margin-top:26px}.section h2{margin:0 0 10px;font-size:16px}.section-note{margin:-3px 0 11px;color:#66766e;font-size:12px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:9px 10px;border-bottom:1px solid #e6ebe8;text-align:left}th{background:#f3f6f3;color:#58685f;font-size:11px;text-transform:uppercase}.right{text-align:right}.denominations{padding:12px;background:#f7f9f7;color:#506159;font-size:12px}.footer{display:flex;justify-content:space-between;gap:16px;margin-top:28px;padding-top:14px;border-top:1px solid #dfe6e1;color:#63736b;font-size:11px}.actions{display:flex;justify-content:flex-end;gap:10px;margin:0 auto 14px;max-width:980px}.actions button{padding:10px 15px;border:0;background:#29443b;color:white;cursor:pointer;font-weight:700}@media print{body{padding:0;background:#fff}.report{max-width:none;border:0}.actions{display:none}.masthead,.metric,th{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:14mm}}
		</style></head><body><div class="actions"><button onclick="window.print()">Imprimir / Guardar PDF</button></div><main class="report"><header class="masthead"><p class="eyebrow">Café · Control de caja</p><h1>Resumen de cierre de turno</h1><p>${escapeHtml(startedAt)} — ${escapeHtml(closedAt)}</p></header><div class="content"><div class="meta"><div><span>Abrió</span><strong>${escapeHtml(shift.apertura?.empleadoNombre || '—')}</strong></div><div><span>Cerró</span><strong>${escapeHtml(shift.cierre?.empleadoNombre || '—')}</strong></div><div><span>Duración</span><strong>${escapeHtml(formatDuration(shift.cierre?.duracionMs || 0))}</strong></div></div><div class="metrics"><div class="metric"><span>Facturas</span><strong>${invoices.length}</strong></div><div class="metric"><span>Total vendido</span><strong>${formatMoney(invoices.reduce((sum, invoice) => sum + Number(invoice.monto || 0), 0))}</strong></div><div class="metric"><span>Egresos</span><strong>${formatMoney(expenses.reduce((sum, movement) => sum + Number(movement.monto || 0), 0))}</strong></div><div class="metric"><span>Efectivo de apertura</span><strong>${formatMoney(shift.apertura?.efectivo)}</strong></div><div class="metric"><span>Efectivo contado al cierre</span><strong>${formatMoney(shift.cierre?.efectivoContado)}</strong></div><div class="metric"><span>Diferencia de caja</span><strong>${formatMoney(shift.cierre?.diferencia)}</strong></div></div><p class="denominations"><strong>Conteo inicial:</strong> ${openingDenominations}<br><strong>Conteo final:</strong> ${closingDenominations}</p><section class="section"><h2>Ingresos por método de pago</h2><table><thead><tr><th>Método</th><th>Tipo</th><th class="right">Total</th></tr></thead><tbody>${methodsRows || '<tr><td colspan="3">Sin facturas registradas</td></tr>'}</tbody></table></section><section class="section"><h2>Inventario vendido</h2><p class="section-note">Unidades de producto registradas en facturas del turno.</p><table><thead><tr><th>Identificador</th><th>Producto</th><th>Cantidad</th><th>Clase</th></tr></thead><tbody>${salesRows || '<tr><td colspan="4">Sin productos vendidos</td></tr>'}</tbody></table></section><section class="section"><h2>Egresos del turno</h2><table><thead><tr><th>Método</th><th>Movimientos</th><th class="right">Total</th></tr></thead><tbody>${expenseRows || '<tr><td colspan="3">Sin egresos</td></tr>'}</tbody></table></section><section class="section"><h2>Facturas incluidas</h2><table><thead><tr><th>Folio</th><th>Mesa</th><th>Método</th><th class="right">Total</th></tr></thead><tbody>${invoiceRows || '<tr><td colspan="4">Sin facturas registradas</td></tr>'}</tbody></table></section><footer class="footer"><span>Reporte generado el ${escapeHtml(new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()))}</span><span>Turno ${escapeHtml(shift.id)}</span></footer></div></main></body></html>`;
}

function methodsNameType(invoices, methodId) {
	for (const invoice of invoices) {
		const method = invoice.metodosPago?.find((payment) => payment.metodoId === methodId);
		if (method?.tipo) return method.tipo;
	}
	return '—';
}

function Turno({ profile }) {
	const [methods, setMethods] = useState([]);
	const [activeShiftId, setActiveShiftId] = useState('');
	const [activeShift, setActiveShift] = useState(null);
	const [movements, setMovements] = useState([]);
	const [loading, setLoading] = useState(true);
	const [loadingCloseReport, setLoadingCloseReport] = useState(false);
	const [busy, setBusy] = useState(false);
	const [openingCounts, setOpeningCounts] = useState(emptyCount);
	const [closingCounts, setClosingCounts] = useState(emptyCount);
	const [movementCounts, setMovementCounts] = useState(emptyCount);
	const [movementType, setMovementType] = useState('ingreso');
	const [movementMethodId, setMovementMethodId] = useState('');
	const [movementAmount, setMovementAmount] = useState('');
	const [movementNote, setMovementNote] = useState('');
	const [now, setNow] = useState(Date.now());
	const employeeName = [profile?.nombre, profile?.apellido].filter(Boolean).join(' ') || profile?.correo || auth.currentUser?.email || 'Usuario';
	const employeeEmail = profile?.correo || auth.currentUser?.email || '';
	const cashMethod = methods.find((method) => method.tipo === 'efectivo');
	const selectedMovementMethod = methods.find((method) => method.id === movementMethodId);
	const openingTotal = countTotal(openingCounts);
	const closingTotal = countTotal(closingCounts);
	const movementCashTotal = countTotal(movementCounts);

	useEffect(() => {
		const stopMethods = onSnapshot(collection(db, 'metodosPago'), (snapshot) => {
			const nextMethods = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((method) => method.activo !== false);
			setMethods(nextMethods);
			setMovementMethodId((current) => current || nextMethods.find((method) => method.tipo === 'efectivo')?.id || nextMethods[0]?.id || '');
			setLoading(false);
		}, () => {
			toast.error('No se pudieron cargar los métodos de pago.');
			setLoading(false);
		});
		const stopCurrent = onSnapshot(doc(db, 'configuracion', 'turnoActual'), (snapshot) => {
			const current = snapshot.exists() ? snapshot.data() : null;
			setActiveShiftId(current?.turnoId || '');
			setLoading(false);
		}, () => {
			toast.error('No se pudo consultar el turno actual.');
			setLoading(false);
		});
		const stopMovements = onSnapshot(collection(db, 'movimientos'), (snapshot) => {
			setMovements(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((first, second) => (second.creadoEn?.toMillis?.() || 0) - (first.creadoEn?.toMillis?.() || 0)));
		});
		return () => {
			stopMethods();
			stopCurrent();
			stopMovements();
		};
	}, []);

	useEffect(() => {
		if (!activeShiftId) {
			setActiveShift(null);
			setMovements([]);
			return undefined;
		}
		const stopShift = onSnapshot(doc(db, 'turnos', activeShiftId), (snapshot) => setActiveShift(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null));
		return stopShift;
	}, [activeShiftId]);

	useEffect(() => {
		if (!activeShift?.abierto) return undefined;
		const interval = window.setInterval(() => setNow(Date.now()), 30000);
		return () => window.clearInterval(interval);
	}, [activeShift]);

	const expectedBalances = useMemo(() => movements.filter((movement) => movement.turnoId === activeShiftId).reduce((balances, movement) => {
		if (movement.tipo === 'cierre' || !movement.metodoId) return balances;
		const direction = movement.direccion === 'egreso' ? -1 : 1;
		balances[movement.metodoId] = (balances[movement.metodoId] || 0) + direction * Number(movement.monto || 0);
		return balances;
	}, {}), [activeShiftId, movements]);
	const shiftStartedAt = activeShift?.inicioEn?.toDate?.().getTime() || now;
	const shiftDuration = formatDuration(now - shiftStartedAt);
	const expectedCash = expectedBalances[cashMethod?.id] || 0;
	const cashDifference = closingTotal - expectedCash;

	function updateCounts(setter, denomination, value) {
		const parsed = value.replace(/\D/g, '');
		setter((current) => ({ ...current, [denomination]: parsed }));
	}

	async function openShift(event) {
		event.preventDefault();
		if (!cashMethod) {
			toast.warning('Configura un método de pago de efectivo antes de abrir caja.');
			return;
		}
		setBusy(true);
		const shiftReference = doc(collection(db, 'turnos'));
		const pointerReference = doc(db, 'configuracion', 'turnoActual');
		const openingMovementReference = doc(collection(db, 'movimientos'));
		try {
			await runTransaction(db, async (transaction) => {
				const pointerSnapshot = await transaction.get(pointerReference);
				if (pointerSnapshot.exists() && pointerSnapshot.data().abierto) throw new Error('Ya existe un turno abierto.');
				const methodSnapshots = new Map();
				for (const method of methods) methodSnapshots.set(method.id, await transaction.get(doc(db, 'metodosPago', method.id)));
				for (const method of methods) {
					const methodSnapshot = methodSnapshots.get(method.id);
					if (methodSnapshot.exists()) transaction.update(doc(db, 'metodosPago', method.id), { saldo: method.id === cashMethod.id ? openingTotal : 0 });
				}
				transaction.set(shiftReference, {
					estado: 'abierto',
					abierto: true,
					inicioEn: serverTimestamp(),
					apertura: { empleadoNombre: employeeName, empleadoCorreo: employeeEmail, efectivo: openingTotal, denominaciones: countEntries(openingCounts) },
				});
				transaction.set(pointerReference, { turnoId: shiftReference.id, abierto: true, inicioEn: serverTimestamp() });
				transaction.set(openingMovementReference, {
					turnoId: shiftReference.id,
					tipo: 'apertura',
					direccion: 'ingreso',
					metodoId: cashMethod.id,
					metodoNombre: cashMethod.nombre,
					monto: openingTotal,
					denominaciones: countEntries(openingCounts),
					descripcion: 'Apertura de caja',
					creadoPor: employeeName,
					creadoPorCorreo: employeeEmail,
					creadoEn: serverTimestamp(),
				});
			});
			setOpeningCounts(emptyCount());
			toast.success('Turno abierto.');
		} catch (error) {
			toast.error(error.message || 'No se pudo abrir el turno.');
		} finally {
			setBusy(false);
		}
	}

	async function saveMovement(event) {
		event.preventDefault();
		if (!activeShift || !selectedMovementMethod) return;
		const amount = selectedMovementMethod.tipo === 'efectivo' ? movementCashTotal : Number(String(movementAmount).replace(/\D/g, '')) || 0;
		if (amount <= 0) {
			toast.warning(selectedMovementMethod.tipo === 'efectivo' ? 'Cuenta los billetes del movimiento.' : 'Indica un monto válido.');
			return;
		}
		setBusy(true);
		const pointerReference = doc(db, 'configuracion', 'turnoActual');
		const methodReference = doc(db, 'metodosPago', selectedMovementMethod.id);
		const movementReference = doc(collection(db, 'movimientos'));
		try {
			await runTransaction(db, async (transaction) => {
				const pointerSnapshot = await transaction.get(pointerReference);
				const methodSnapshot = await transaction.get(methodReference);
				if (!pointerSnapshot.exists() || !pointerSnapshot.data().abierto || pointerSnapshot.data().turnoId !== activeShiftId) throw new Error('El turno ya no está abierto.');
				if (!methodSnapshot.exists()) throw new Error('El método de pago ya no está disponible.');
				const currentBalance = Number(methodSnapshot.data().saldo || 0);
				if (movementType === 'egreso' && currentBalance < amount) throw new Error('El egreso supera el saldo actual de este método.');
				transaction.update(methodReference, { saldo: currentBalance + (movementType === 'ingreso' ? amount : -amount) });
				transaction.set(movementReference, {
					turnoId: activeShiftId,
					tipo: movementType,
					direccion: movementType,
					metodoId: selectedMovementMethod.id,
					metodoNombre: selectedMovementMethod.nombre,
					monto: amount,
					denominaciones: selectedMovementMethod.tipo === 'efectivo' ? countEntries(movementCounts) : [],
					descripcion: movementNote.trim() || (movementType === 'ingreso' ? 'Ingreso de dinero' : 'Egreso de dinero'),
					creadoPor: employeeName,
					creadoPorCorreo: employeeEmail,
					creadoEn: serverTimestamp(),
				});
			});
			setMovementCounts(emptyCount());
			setMovementAmount('');
			setMovementNote('');
			toast.success('Movimiento registrado.');
		} catch (error) {
			toast.error(error.message || 'No se pudo registrar el movimiento.');
		} finally {
			setBusy(false);
		}
	}

	async function closeShift(event) {
		event.preventDefault();
		if (!activeShift || !cashMethod) return;
		setBusy(true);
		const pointerReference = doc(db, 'configuracion', 'turnoActual');
		const shiftReference = doc(db, 'turnos', activeShiftId);
		const closingMovementReference = doc(collection(db, 'movimientos'));
		try {
			const customerAccountsSnapshot = await getDocs(query(collection(db, 'cuentasCliente'), where('turnoId', '==', activeShiftId)));
			const pendingCustomerAccounts = customerAccountsSnapshot.docs
				.map((account) => ({ id: account.id, ...account.data() }))
				.filter((account) => Number(account.saldoPendiente) > 0)
				.map(({ clienteNombre, clienteTelefono, mesaOrigen, total, saldoPendiente, creadaEn }) => ({ clienteNombre, clienteTelefono, mesaOrigen, total, saldoPendiente, creadaEn }));
			await runTransaction(db, async (transaction) => {
				const pointerSnapshot = await transaction.get(pointerReference);
				const shiftSnapshot = await transaction.get(shiftReference);
				if (!pointerSnapshot.exists() || !pointerSnapshot.data().abierto || pointerSnapshot.data().turnoId !== activeShiftId || !shiftSnapshot.exists()) throw new Error('El turno ya no está abierto.');
				transaction.update(shiftReference, {
					estado: 'cerrado',
					abierto: false,
					cierre: { empleadoNombre: employeeName, empleadoCorreo: employeeEmail, efectivoContado: closingTotal, denominaciones: countEntries(closingCounts), saldoEsperado: expectedCash, diferencia: cashDifference, duracionMs: Math.max(0, Date.now() - shiftStartedAt), cuentasClientePendientes: pendingCustomerAccounts, cerradoEn: serverTimestamp() },
				});
				transaction.update(pointerReference, { abierto: false, cerradoEn: serverTimestamp() });
				transaction.set(closingMovementReference, {
					turnoId: activeShiftId,
					tipo: 'cierre',
					direccion: 'informativo',
					metodoId: cashMethod.id,
					metodoNombre: cashMethod.nombre,
					monto: closingTotal,
					saldoEsperado: expectedCash,
					diferencia: cashDifference,
					duracionMs: Math.max(0, Date.now() - shiftStartedAt),
					cuentasClientePendientes: pendingCustomerAccounts,
					denominaciones: countEntries(closingCounts),
					descripcion: 'Cierre de caja',
					creadoPor: employeeName,
					creadoPorCorreo: employeeEmail,
					creadoEn: serverTimestamp(),
				});
			});
			setClosingCounts(emptyCount());
			toast.success('Turno cerrado.');
		} catch (error) {
			toast.error(error.message || 'No se pudo cerrar el turno.');
		} finally {
			setBusy(false);
		}
	}

	async function printClosingReport(shift) {
		const reportWindow = window.open('', '_blank');
		if (!reportWindow) {
			toast.warning('Permite las ventanas emergentes para abrir el reporte de cierre.');
			return;
		}
		reportWindow.document.write('<!doctype html><title>Cargando reporte</title><p style="font:16px Arial;padding:32px">Cargando reporte de cierre...</p>');
		setLoadingCloseReport(true);
		try {
			const [invoiceSnapshot, movementSnapshot, inventorySnapshot, customerAccountSnapshot] = await Promise.all([
				getDocs(query(collection(db, 'facturas'), where('turnoId', '==', shift.id))),
				getDocs(query(collection(db, 'movimientos'), where('turnoId', '==', shift.id))),
				getDocs(collection(db, 'inventario')),
				getDocs(query(collection(db, 'cuentasCliente'), where('turnoId', '==', shift.id))),
			]);
			const invoices = invoiceSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
			const shiftMovements = movementSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
			const inventory = inventorySnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
			const pendingAccounts = shift.cierre?.cuentasClientePendientes || customerAccountSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((account) => Number(account.saldoPendiente) > 0);
			const pendingAccountRows = pendingAccounts.map((account) => `<tr><td>${escapeHtml(account.clienteNombre || 'Cliente')}</td><td>${escapeHtml(account.clienteTelefono || '—')}</td><td>${escapeHtml(account.mesaOrigen || '—')}</td><td>${formatMoney(account.saldoPendiente)}</td></tr>`).join('');
			const customerAccountsSection = `<section class="section"><h2>Cuentas pendientes de clientes</h2><table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Origen</th><th class="right">Saldo pendiente</th></tr></thead><tbody>${pendingAccountRows || '<tr><td colspan="4">Sin cuentas pendientes asignadas a este turno</td></tr>'}</tbody></table></section>`;
			const report = reportHtml(shift, invoices, shiftMovements, inventory);
			const unadjustedTotal = formatMoney(invoices.reduce((sum, invoice) => sum + Number(invoice.monto || 0), 0));
			const billedTotal = formatMoney(invoices.filter((invoice) => invoice.tipo !== 'abono_cliente').reduce((sum, invoice) => sum + Number(invoice.monto || 0), 0));
			const withoutDuplicateAbonos = report.replace(`<span>Total vendido</span><strong>${unadjustedTotal}</strong>`, `<span>Total facturado</span><strong>${billedTotal}</strong>`);
			reportWindow.document.open();
			reportWindow.document.write(withoutDuplicateAbonos.replace('</main>', `<div class="content">${customerAccountsSection}</div></main>`));
			reportWindow.document.close();
			reportWindow.focus();
		} catch (error) {
			reportWindow.close();
			toast.error('No se pudo cargar la información del cierre.');
		} finally {
			setLoadingCloseReport(false);
		}
	}

	if (loading || loadingCloseReport) return <LoadingScreen text={loadingCloseReport ? 'Cargando datos del cierre' : 'Cargando turno'} />;

	return (
		<section className="shift-page" aria-labelledby="shift-title">
			<header className="shift-header">
				<div><p className="app-eyebrow">Control de caja</p><h1 id="shift-title">Turno</h1><p>Abre caja, registra movimientos y realiza el arqueo de cierre.</p></div>
				{activeShift?.abierto && <div className="shift-live"><span /><strong>Turno abierto</strong><small><FaClock aria-hidden="true" /> {shiftDuration}</small></div>}
			</header>
			{!activeShift?.abierto ? <>
			<form className="shift-panel" onSubmit={openShift}>
				<div className="shift-panel-heading"><div><h2>Abrir caja</h2><p>Responsable: {employeeName}</p></div><FaPlay aria-hidden="true" /></div>
				<p className="shift-section-label">Conteo inicial de efectivo</p>
				<DenominationCounter counts={openingCounts} onChange={(denomination, value) => updateCounts(setOpeningCounts, denomination, value)} />
				<div className="shift-opening-summary"><span>Efectivo de apertura</span><strong>{formatMoney(openingTotal)}</strong></div>
				<p className="shift-note">Los demás métodos de pago comienzan el turno en $0.</p>
				<button className="shift-primary-button" type="submit" disabled={busy || !cashMethod}><FaPlay aria-hidden="true" /> Abrir turno</button>
			</form>
			{activeShift && <section className="shift-movements shift-closed-history" aria-labelledby="closed-shift-title">
				<header><div><p className="app-eyebrow">Turno cerrado</p><h2 id="closed-shift-title">Cierre de caja</h2></div></header>
				<MovementLog movements={movements.filter((movement) => movement.turnoId === activeShift.id && movement.tipo === 'cierre')} onPrintClosure={() => printClosingReport(activeShift)} />
			</section>}
			</> : <>
				<div className="shift-summary-strip">
					<div><span>Abierto por</span><strong>{activeShift.apertura?.empleadoNombre || 'Usuario'}</strong></div>
					<div><span>Inicio</span><strong>{formatDate(activeShift.inicioEn)}</strong></div>
					<div><span>Duración</span><strong>{shiftDuration}</strong></div>
				</div>
				<section className="shift-balances" aria-label="Saldo esperado por método">
					{methods.map((method) => <div key={method.id}><span>{method.nombre}</span><strong>{formatMoney(expectedBalances[method.id] || 0)}</strong></div>)}
				</section>
				<div className="shift-work-grid">
					<form className="shift-panel" onSubmit={saveMovement}>
						<div className="shift-panel-heading"><div><h2>Movimiento de caja</h2><p>Registra dinero recibido o entregado.</p></div><FaArrowUp aria-hidden="true" /></div>
						<div className="shift-form-grid">
							<label>Tipo<select value={movementType} onChange={(event) => setMovementType(event.target.value)}><option value="ingreso">Ingreso</option><option value="egreso">Egreso</option></select></label>
							<label>Método de pago<select value={movementMethodId} onChange={(event) => { setMovementMethodId(event.target.value); setMovementCounts(emptyCount()); setMovementAmount(''); }}>{methods.map((method) => <option key={method.id} value={method.id}>{method.nombre}</option>)}</select></label>
						</div>
						{selectedMovementMethod?.tipo === 'efectivo' ? <DenominationCounter counts={movementCounts} onChange={(denomination, value) => updateCounts(setMovementCounts, denomination, value)} /> : <label className="shift-field">Monto<input inputMode="numeric" value={movementAmount} onChange={(event) => setMovementAmount(event.target.value.replace(/\D/g, ''))} placeholder="0" /></label>}
						<label className="shift-field">Descripción<input value={movementNote} onChange={(event) => setMovementNote(event.target.value)} placeholder={movementType === 'ingreso' ? 'Motivo del ingreso' : 'Motivo del egreso'} /></label>
						<div className="shift-opening-summary"><span>Monto del movimiento</span><strong>{formatMoney(selectedMovementMethod?.tipo === 'efectivo' ? movementCashTotal : movementAmount)}</strong></div>
						<button className="shift-primary-button" type="submit" disabled={busy || !methods.length}>{movementType === 'ingreso' ? <FaArrowDown aria-hidden="true" /> : <FaArrowUp aria-hidden="true" />} Registrar {movementType}</button>
					</form>
					<form className="shift-panel shift-close-panel" onSubmit={closeShift}>
						<div className="shift-panel-heading"><div><h2>Cerrar turno</h2><p>Responsable del cierre: {employeeName}</p></div><FaStop aria-hidden="true" /></div>
						<p className="shift-section-label">Conteo final de efectivo</p>
						<DenominationCounter counts={closingCounts} onChange={(denomination, value) => updateCounts(setClosingCounts, denomination, value)} />
						<div className="shift-close-totals"><div><span>Saldo esperado</span><strong>{formatMoney(expectedCash)}</strong></div><div><span>Efectivo contado</span><strong>{formatMoney(closingTotal)}</strong></div><div className={cashDifference === 0 ? 'shift-difference' : 'shift-difference shift-difference-alert'}><span>Diferencia</span><strong>{formatMoney(cashDifference)}</strong></div></div>
						<p className="shift-note">Al cerrar quedarán guardados el tiempo trabajado, el conteo y el responsable.</p>
						<button className="shift-danger-button" type="submit" disabled={busy}><FaStop aria-hidden="true" /> Cerrar turno</button>
					</form>
				</div>
				<section className="shift-movements" aria-labelledby="shift-movements-title">
					<header><div><p className="app-eyebrow">Bitácora del turno</p><h2 id="shift-movements-title">Movimientos</h2></div><span>{movements.filter((movement) => movement.turnoId === activeShiftId).length} registros</span></header>
					<MovementLog movements={movements.filter((movement) => movement.turnoId === activeShiftId)} />
				</section>
			</>}
		</section>
	);
}

function DenominationCounter({ counts, onChange }) {
	return <div className="shift-denominations">{denominations.map(({ value, image }) => <label key={value}>
		<img src={image} alt="" aria-hidden="true" />
		<input type="text" inputMode="numeric" pattern="[0-9]*" aria-label={`Cantidad de billetes de ${value}`} value={counts[value]} onChange={(event) => onChange(value, event.target.value)} placeholder="0" />
	</label>)}</div>;
}

function MovementLog({ movements, onPrintClosure }) {
	if (movements.length === 0) return <p className="shift-empty">Todavía no hay movimientos en este turno.</p>;
	return <div className="shift-movement-list">{movements.map((movement) => <article className="shift-movement" key={movement.id}>
		<div className={`shift-movement-icon shift-movement-${movement.direccion}`} aria-hidden="true">{movement.direccion === 'egreso' ? <FaArrowUp /> : movement.direccion === 'ingreso' ? <FaArrowDown /> : <FaClock />}</div>
		<div className="shift-movement-description"><strong>{movement.descripcion || movement.tipo}</strong><span>{movement.metodoNombre || 'Sin método'} · {movement.creadoPor || 'Usuario'} · {formatDate(movement.creadoEn)}</span>{movement.denominaciones?.length > 0 && <small>{movement.denominaciones.map(({ valor, cantidad }) => `${cantidad} × ${formatMoney(valor)}`).join(' · ')}</small>}</div>
		<strong className="shift-movement-amount">{formatMoney(movement.monto)}</strong>
		{movement.tipo === 'cierre' && onPrintClosure && <button className="shift-print-button" type="button" onClick={onPrintClosure}><FaPrint aria-hidden="true" /> Imprimir cierre</button>}
	</article>)}</div>;
}

export default Turno;