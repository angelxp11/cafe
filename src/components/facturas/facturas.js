import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { FaBan, FaEdit, FaFileInvoiceDollar, FaPrint, FaTimes } from 'react-icons/fa';
import { auth, db } from '../../server/api';
import { shiftBalance } from '../../server/paymentMethods';
import LoadingScreen from '../../resources/loading/LoadingScreen';
import toast from '../../resources/toast/toast';
import './facturas.css';

function localDateValue(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function toDate(value) {
	return value?.toDate ? value.toDate() : value ? new Date(value) : null;
}

function formatMoney(value) {
	return `$${Number(value || 0).toLocaleString('es-CO')}`;
}

function formatDate(value) {
	const date = toDate(value);
	return date ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Fecha pendiente';
}

function invoiceMethods(invoice) {
	return invoice.metodosPago?.length ? invoice.metodosPago : [{ metodoId: invoice.metodoPagoId, nombre: invoice.metodoPago || 'Sin método', monto: invoice.monto }];
}

function normalizeCustomerField(field, value) {
	if (['name', 'address', 'city'].includes(field)) return value.toLocaleUpperCase('es-CO');
	if (field === 'document') return value.replace(/[^0-9-]/g, '');
	if (field === 'phone') return value.replace(/\D/g, '');
	return value;
}

function capitalizeProductName(value) {
	return String(value || 'Producto').toLocaleLowerCase('es-CO').replace(/(^|[\s-])([a-záéíóúüñ])/g, (match, separator, letter) => `${separator}${letter.toLocaleUpperCase('es-CO')}`);
}

function Facturas({ profile }) {
	const today = localDateValue(new Date());
	const [invoices, setInvoices] = useState([]);
	const [methods, setMethods] = useState([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState('');
	const [dateFrom, setDateFrom] = useState(today);
	const [dateTo, setDateTo] = useState(today);
	const [methodFilter, setMethodFilter] = useState('');
	const [typeFilter, setTypeFilter] = useState('');
	const [selectedInvoice, setSelectedInvoice] = useState(null);
	const [editing, setEditing] = useState(false);
	const [editMesa, setEditMesa] = useState('');
	const [editNote, setEditNote] = useState('');
	const [cancelReason, setCancelReason] = useState('');
	const [invoiceToPrint, setInvoiceToPrint] = useState(null);
	const [customerData, setCustomerData] = useState({ name: '', document: '', address: '', city: '', phone: '' });
	const [saving, setSaving] = useState(false);
	const isAdmin = profile?.rol === 'admin';
	const canCancelInvoices = ['admin', 'empleado'].includes(profile?.rol);

	useEffect(() => {
		const stopInvoices = onSnapshot(collection(db, 'facturas'), (snapshot) => {
			setInvoices(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((first, second) => (toDate(second.pagadoEn)?.getTime() || 0) - (toDate(first.pagadoEn)?.getTime() || 0)));
			setLoading(false);
		}, () => {
			toast.error('No se pudieron cargar las facturas.');
			setLoading(false);
		});
		const stopMethods = onSnapshot(collection(db, 'metodosPago'), (snapshot) => setMethods(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))));
		return () => {
			stopInvoices();
			stopMethods();
		};
	}, []);

	const filteredInvoices = useMemo(() => {
		const normalizedSearch = search.trim().toLocaleLowerCase('es-CO');
		const start = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
		const end = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
		return invoices.filter((invoice) => {
			const date = toDate(invoice.pagadoEn);
			if (start && (!date || date < start)) return false;
			if (end && (!date || date > end)) return false;
			if (typeFilter && invoice.tipo !== typeFilter) return false;
			const payments = invoiceMethods(invoice);
			if (methodFilter && !payments.some((payment) => payment.metodoId === methodFilter || payment.nombre === methodFilter)) return false;
			if (!normalizedSearch) return true;
			const products = (invoice.pedido || []).map((item) => item.nombre).join(' ');
			const paymentNames = payments.map((payment) => payment.nombre).join(' ');
			return [invoice.folio, invoice.mesaNombre, invoice.registradaPor, invoice.observacion, products, paymentNames].some((value) => String(value || '').toLocaleLowerCase('es-CO').includes(normalizedSearch));
		});
	}, [invoices, search, dateFrom, dateTo, methodFilter, typeFilter]);
	const filteredTotal = filteredInvoices.reduce((sum, invoice) => sum + ((typeFilter === 'abono_cliente') === (invoice.tipo === 'abono_cliente') ? Number(invoice.monto || 0) : 0), 0);

	function openInvoice(invoice) {
		setSelectedInvoice(invoice);
		setEditMesa(invoice.mesaNombre || '');
		setEditNote(invoice.observacion || '');
		setCancelReason('');
		setEditing(false);
	}

	async function saveInvoice(event) {
		event.preventDefault();
		if (!isAdmin || !selectedInvoice || !editMesa.trim()) return;
		setSaving(true);
		const updated = { mesaNombre: editMesa.trim(), observacion: editNote.trim(), editadaPor: profile.correo || '', editadaEn: serverTimestamp() };
		try {
			await updateDoc(doc(db, 'facturas', selectedInvoice.id), updated);
			setSelectedInvoice((current) => ({ ...current, ...updated, editadaEn: new Date() }));
			setEditing(false);
			toast.success('Factura actualizada.');
		} catch (error) {
			toast.error('No se pudo actualizar la factura.');
		} finally {
			setSaving(false);
		}
	}

	async function cancelInvoice(invoice, reason) {
		if (!canCancelInvoices || !['completa', 'parcial'].includes(invoice.tipo) || invoice.cancelada) return;
		if (reason.trim().length < 5) {
			toast.warning('El motivo de cancelación debe tener al menos 5 caracteres.');
			return;
		}
		const userEmail = (auth.currentUser?.email || profile.correo || '').trim().toLowerCase();
		const cancelerName = [profile.nombre, profile.apellido].filter(Boolean).join(' ') || auth.currentUser?.displayName || userEmail || 'Usuario';
		setSaving(true);
		try {
			await runTransaction(db, async (transaction) => {
				const invoiceReference = doc(db, 'facturas', invoice.id);
				const invoiceSnapshot = await transaction.get(invoiceReference);
				if (!invoiceSnapshot.exists() || invoiceSnapshot.data().cancelada) throw new Error('La factura ya fue cancelada o no existe.');
				const currentInvoice = invoiceSnapshot.data();
				if (!['completa', 'parcial'].includes(currentInvoice.tipo)) throw new Error('Este tipo de factura no se puede cancelar desde aquí.');
				const shiftSnapshot = await transaction.get(doc(db, 'configuracion', 'turnoActual'));
				if (!shiftSnapshot.exists() || shiftSnapshot.data().abierto !== true) throw new Error('Abre un turno para registrar la devolución de esta factura.');
				const shiftId = shiftSnapshot.data().turnoId;
				const paymentAmounts = new Map();
				for (const payment of invoiceMethods(currentInvoice)) {
					if (!payment.metodoId || Number(payment.monto || 0) <= 0) throw new Error('No se pudo identificar el método de pago para devolver el saldo.');
					paymentAmounts.set(payment.metodoId, (paymentAmounts.get(payment.metodoId) || 0) + Number(payment.monto));
				}
				const methodEntries = [];
				for (const [methodId, amount] of paymentAmounts) {
					const reference = doc(db, 'metodosPago', methodId);
					const snapshot = await transaction.get(reference);
					if (!snapshot.exists()) throw new Error('No se encontró un método de pago de esta factura.');
					if (shiftBalance(snapshot.data()) < amount) throw new Error(`El saldo actual de ${snapshot.data().nombre || 'un método'} no alcanza para registrar la devolución.`);
					methodEntries.push({ methodId, amount, reference, snapshot });
				}
				const adjustments = currentInvoice.inventarioAjustes || {};
				const productIds = Object.keys(adjustments);
				const productSnapshots = await Promise.all(productIds.map((productId) => transaction.get(doc(db, 'inventario', productId))));
				const productsById = new Map(productSnapshots.filter((snapshot) => snapshot.exists()).map((snapshot) => [snapshot.id, { reference: doc(db, 'inventario', snapshot.id), data: snapshot.data() }]));
				if (productsById.size !== productIds.length) throw new Error('No se pudo restaurar el inventario porque falta un producto.');
				const cancellationAmounts = {};
				for (const { methodId, amount, reference, snapshot } of methodEntries) {
					const movementId = `cancel-${invoice.id}-${methodId}`;
					cancellationAmounts[methodId] = amount;
					transaction.update(reference, { saldoTurno: shiftBalance(snapshot.data()) - amount, ultimaFacturaCanceladaId: invoice.id, ultimoMovimientoCancelacionId: movementId });
					transaction.set(doc(db, 'movimientos', movementId), {
						turnoId: shiftId,
						tipo: 'egreso',
						direccion: 'egreso',
						metodoId: methodId,
						metodoNombre: snapshot.data().nombre || '',
						monto: amount,
						denominaciones: [],
						descripcion: `Devolución por cancelación de factura ${String(currentInvoice.folio || invoice.id).slice(0, 8).toUpperCase()}`,
						facturaId: invoice.id,
						origen: 'cancelacion_factura',
						creadoPor: cancelerName,
						creadoPorCorreo: userEmail,
						creadoEn: serverTimestamp(),
					});
				}
				for (const productId of productIds) {
					const product = productsById.get(productId);
					const adjustment = adjustments[productId];
					if (product.data.modoSabores === 'sabores') {
						const flavors = (product.data.sabores || []).map((flavor) => {
							const name = typeof flavor === 'string' ? flavor : flavor.nombre;
							const quantity = Number(adjustment.sabores?.[name]) || 0;
							return quantity && typeof flavor !== 'string' ? { ...flavor, stock: Number(flavor.stock || 0) + quantity } : flavor;
						});
						const missingFlavor = Object.keys(adjustment.sabores || {}).some((name) => !flavors.some((flavor) => (typeof flavor === 'string' ? flavor : flavor.nombre) === name && typeof flavor !== 'string'));
						if (missingFlavor) throw new Error(`No se pudo restaurar un sabor de ${product.data.nombre}.`);
						transaction.update(product.reference, { sabores: flavors, ultimoMovimientoInventarioId: invoice.id });
					} else {
						transaction.update(product.reference, { stock: Number(product.data.stock || 0) + Number(adjustment.cantidad || 0), ultimoMovimientoInventarioId: invoice.id });
					}
				}
				transaction.update(invoiceReference, {
					cancelada: true,
					motivoCancelacion: reason.trim(),
					canceladaPor: userEmail,
					canceladaPorNombre: cancelerName,
					canceladaEn: serverTimestamp(),
					montoDevuelto: Number(currentInvoice.monto || 0),
					cancelacionMontos: cancellationAmounts,
				});
			});
			setSelectedInvoice((current) => current?.id === invoice.id ? { ...current, cancelada: true, motivoCancelacion: reason.trim(), canceladaPorNombre: cancelerName, canceladaEn: new Date(), montoDevuelto: Number(invoice.monto || 0) } : current);
			setCancelReason('');
			toast.success('Factura cancelada y existencias restauradas.');
		} catch (error) {
			toast.error(error.message || 'No se pudo cancelar la factura.');
		} finally {
			setSaving(false);
		}
	}

	function requestInvoicePrint(invoice) {
		setCustomerData({
			name: normalizeCustomerField('name', invoice.clienteNombre || ''),
			document: normalizeCustomerField('document', invoice.clienteDocumento || ''),
			address: normalizeCustomerField('address', invoice.clienteDireccion || ''),
			city: normalizeCustomerField('city', invoice.clienteCiudad || ''),
			phone: normalizeCustomerField('phone', invoice.clienteTelefono || ''),
		});
		setInvoiceToPrint(invoice);
	}

	function openInvoiceFormat(event) {
		event.preventDefault();
		if (!invoiceToPrint) return;
		const issueDate = toDate(invoiceToPrint.pagadoEn) || new Date();
		const customerInvoice = {
			number: String(invoiceToPrint.folio || invoiceToPrint.id).slice(0, 8).toUpperCase(),
			date: new Intl.DateTimeFormat('es-CO').format(issueDate),
			time: new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(issueDate),
			paymentType: invoiceToPrint.tipo === 'credito_cliente' ? 'Crédito' : invoiceToPrint.tipo === 'abono_cliente' ? 'Abono' : 'Contado',
			paymentMethods: invoiceMethods(invoiceToPrint).map((payment) => payment.nombre || 'Sin método').join(' + '),
			customer: customerData,
			products: (invoiceToPrint.pedido || []).map((item) => ({
				code: item.id || item.lineId || '',
				name: capitalizeProductName(item.nombre),
				quantity: Number(item.cantidad || 0),
				unitPrice: Number(item.precioUnidad || 0),
			})),
			total: Number(invoiceToPrint.monto || 0),
		};
		const publicPath = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
		const invoiceKey = `invoice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		try {
			sessionStorage.setItem(invoiceKey, JSON.stringify(customerInvoice));
		} catch (error) {
			toast.error('No se pudieron preparar los datos para abrir la factura.');
			return;
		}
		const templateUrl = `${publicPath}/facturas/formato.html?data=${encodeURIComponent(invoiceKey)}`;
		const reportWindow = window.open(templateUrl, '_blank');
		if (!reportWindow) {
			sessionStorage.removeItem(invoiceKey);
			toast.warning('Permite las ventanas emergentes para abrir la factura.');
			return;
		}
		sessionStorage.removeItem(invoiceKey);
		setInvoiceToPrint(null);
	}

	if (loading) return <LoadingScreen text="Cargando facturas" />;

	return (
		<section className="invoices-page" aria-labelledby="invoices-title">
			<header className="invoices-header">
				<div><p className="app-eyebrow">Registro de ventas</p><h1 id="invoices-title">Facturas</h1><p>Consulta los pagos confirmados y el detalle de sus métodos.</p></div>
				<div className="invoices-today"><FaFileInvoiceDollar aria-hidden="true" /><span>Hoy</span><strong>{invoices.filter((invoice) => localDateValue(toDate(invoice.pagadoEn) || new Date(0)) === today).length}</strong></div>
			</header>
			<div className="invoices-filters">
				<label className="invoices-search">Buscar<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Folio, mesa, empleado o producto" /></label>
				<label>Desde<input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} /></label>
				<label>Hasta<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></label>
				<label>Método<select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}><option value="">Todos</option>{methods.map((method) => <option key={method.id} value={method.id}>{method.nombre}</option>)}</select></label>
				<label>Tipo<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">Todas</option><option value="completa">Cuenta completa</option><option value="parcial">Pago parcial</option><option value="credito_cliente">Crédito de cliente</option><option value="abono_cliente">Abono de cliente</option></select></label>
			</div>
			<div className="invoices-summary"><span>{filteredInvoices.length} facturas · {typeFilter === 'abono_cliente' ? 'Total abonado' : 'Total facturado'}</span><strong>{formatMoney(filteredTotal)}</strong></div>
			{filteredInvoices.length === 0 ? <p className="invoices-empty">No hay facturas con estos filtros.</p> : <div className="invoices-table-wrap"><table className="invoices-table">
				<thead><tr><th>Factura</th><th>Fecha</th><th>Mesa</th><th>Pago</th><th>Empleado</th><th>Total</th><th></th></tr></thead>
				<tbody>{filteredInvoices.map((invoice) => <tr className={invoice.cancelada ? 'invoice-row-cancelled' : undefined} key={invoice.id}>
					<td><strong>{String(invoice.folio || invoice.id).slice(0, 8).toUpperCase()}</strong><small>{invoice.tipo === 'parcial' ? 'Parcial' : invoice.tipo === 'abono_cliente' ? 'Abono de cliente' : invoice.tipo === 'credito_cliente' ? 'Crédito de cliente' : 'Completa'}</small>{invoice.cancelada && <span className="invoice-cancelled-badge">Cancelada</span>}</td>
					<td>{formatDate(invoice.pagadoEn)}</td>
					<td>{invoice.mesaNombre || 'Mesa'}</td>
					<td>{invoiceMethods(invoice).map((payment) => payment.nombre).join(' + ')}</td>
					<td>{invoice.registradaPor || '—'}</td>
					<td><strong>{formatMoney(invoice.monto)}</strong></td>
					<td><button type="button" className="invoice-open-button" onClick={() => openInvoice(invoice)}>Ver</button></td>
				</tr>)}</tbody>
			</table></div>}
			{selectedInvoice && <div className="invoice-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedInvoice(null); }}>
				<section className="invoice-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-detail-title">
					<header><div><p className="app-eyebrow">{selectedInvoice.tipo === 'parcial' ? 'Pago parcial' : selectedInvoice.tipo === 'abono_cliente' ? 'Abono a cuenta de cliente' : selectedInvoice.tipo === 'credito_cliente' ? 'Cuenta pendiente de cliente' : 'Pago de cuenta'}</p><h2 id="invoice-detail-title">Factura {String(selectedInvoice.folio || selectedInvoice.id).slice(0, 8).toUpperCase()}</h2></div><button type="button" aria-label="Cerrar factura" onClick={() => setSelectedInvoice(null)}><FaTimes /></button></header>
					<div className="invoice-detail-meta"><div><span>Fecha</span><strong>{formatDate(selectedInvoice.pagadoEn)}</strong></div><div><span>Mesa</span><strong>{selectedInvoice.mesaNombre}</strong></div><div><span>Registró</span><strong>{selectedInvoice.registradaPor || '—'}</strong></div></div>
					{selectedInvoice.cancelada && <div className="invoice-cancelled-notice" role="status"><strong>Factura cancelada</strong><span>Motivo: {selectedInvoice.motivoCancelacion || 'Sin motivo registrado'}</span><span>Existencias restauradas.</span></div>}
					<h3>Productos</h3>
					<div className="invoice-lines">{(selectedInvoice.pedido || []).map((item, index) => <div key={`${item.lineId || item.id}-${index}`}><span>{item.cantidad} × {item.nombre}</span><strong>{formatMoney(Number(item.precioUnidad || 0) * Number(item.cantidad || 0))}</strong></div>)}</div>
					{selectedInvoice.tipo === 'credito_cliente' && <p className="invoice-cash-details">Saldo pendiente: {formatMoney(selectedInvoice.saldoRestante)} · Estado: {selectedInvoice.estado || 'pendiente'}</p>}
					<h3>{selectedInvoice.tipo === 'credito_cliente' ? 'Estado de cuenta' : 'Métodos de pago'}</h3>
					<div className="invoice-payment-lines">{invoiceMethods(selectedInvoice).map((payment, index) => <div key={`${payment.metodoId || payment.nombre}-${index}`}><div><strong>{payment.nombre}</strong><span>{payment.tipo || ''}</span></div><strong>{formatMoney(payment.monto)}</strong>{payment.tipo === 'efectivo' && payment.denominaciones?.length > 0 && <small>{payment.denominaciones.map(({ valor, cantidad }) => `${cantidad} × ${formatMoney(valor)}`).join(' · ')}</small>}</div>)}</div>
					<div className="invoice-grand-total"><span>Total pagado</span><strong>{formatMoney(selectedInvoice.monto)}</strong></div>
					{selectedInvoice.efectivoRecibido > 0 && <p className="invoice-cash-details">Efectivo recibido {formatMoney(selectedInvoice.efectivoRecibido)} · Cambio {formatMoney(selectedInvoice.cambio)}</p>}
					<button type="button" className="invoice-print-button" onClick={() => requestInvoicePrint(selectedInvoice)}><FaPrint aria-hidden="true" /> Imprimir factura</button>
					{isAdmin ? editing ? <form className="invoice-edit-form" onSubmit={saveInvoice}>
						<label>Mesa o referencia<input value={editMesa} onChange={(event) => setEditMesa(event.target.value)} required /></label>
						<label>Observación<input value={editNote} onChange={(event) => setEditNote(event.target.value)} /></label>
						<div><button type="button" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button></div>
					</form> : <div className="invoice-admin-actions"><p>{selectedInvoice.observacion || 'Sin observaciones'}{selectedInvoice.editadaPor ? ` · Editada por ${selectedInvoice.editadaPor}` : ''}</p><button type="button" onClick={() => setEditing(true)}><FaEdit aria-hidden="true" /> Editar datos</button></div> : selectedInvoice.observacion && <p className="invoice-cash-details">{selectedInvoice.observacion}</p>}
					{canCancelInvoices && ['completa', 'parcial'].includes(selectedInvoice.tipo) && !selectedInvoice.cancelada && <form className="invoice-cancel-form" onSubmit={(event) => { event.preventDefault(); cancelInvoice(selectedInvoice, cancelReason); }}>
						<label>Motivo de cancelación<textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} minLength={5} maxLength={300} rows={3} placeholder="Describe por qué se cancela esta factura" required /></label>
						<button type="submit" disabled={saving || cancelReason.trim().length < 5}><FaBan aria-hidden="true" /> {saving ? 'Cancelando...' : 'Cancelar factura'}</button>
					</form>}
				</section>
			</div>}
			{invoiceToPrint && <div className="invoice-modal-backdrop invoice-customer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setInvoiceToPrint(null); }}>
				<section className="invoice-modal invoice-customer-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-customer-title">
					<header><div><p className="app-eyebrow">Factura {String(invoiceToPrint.folio || invoiceToPrint.id).slice(0, 8).toUpperCase()}</p><h2 id="invoice-customer-title">Datos del cliente</h2></div><button type="button" aria-label="Cerrar datos del cliente" onClick={() => setInvoiceToPrint(null)}><FaTimes /></button></header>
					<form className="invoice-customer-form" onSubmit={openInvoiceFormat}>
						<label>Nombre o razón social<input type="text" autoFocus required value={customerData.name} onChange={(event) => setCustomerData((current) => ({ ...current, name: normalizeCustomerField('name', event.target.value) }))} /></label>
						<label>Cédula o NIT<input type="text" value={customerData.document} onChange={(event) => setCustomerData((current) => ({ ...current, document: normalizeCustomerField('document', event.target.value) }))} /></label>
						<label>Dirección<input type="text" value={customerData.address} onChange={(event) => setCustomerData((current) => ({ ...current, address: normalizeCustomerField('address', event.target.value) }))} /></label>
						<div className="invoice-customer-fields"><label>Ciudad<input type="text" value={customerData.city} onChange={(event) => setCustomerData((current) => ({ ...current, city: normalizeCustomerField('city', event.target.value) }))} /></label><label>Teléfono<input type="text" inputMode="numeric" value={customerData.phone} onChange={(event) => setCustomerData((current) => ({ ...current, phone: normalizeCustomerField('phone', event.target.value) }))} /></label></div>
						<div className="invoice-customer-actions"><button type="button" onClick={() => setInvoiceToPrint(null)}>Cancelar</button><button type="submit"><FaFileInvoiceDollar aria-hidden="true" /> Abrir factura</button></div>
					</form>
				</section>
			</div>}
		</section>
	);
}

export default Facturas;