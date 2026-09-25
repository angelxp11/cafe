import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { FaEdit, FaFileInvoiceDollar, FaTimes } from 'react-icons/fa';
import { db } from '../../server/api';
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
	return invoice.metodosPago?.length ? invoice.metodosPago : [{ nombre: invoice.metodoPago || 'Sin método', monto: invoice.monto }];
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
	const [saving, setSaving] = useState(false);
	const isAdmin = profile?.rol === 'admin';

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
				<tbody>{filteredInvoices.map((invoice) => <tr key={invoice.id}>
					<td><strong>{String(invoice.folio || invoice.id).slice(0, 8).toUpperCase()}</strong><small>{invoice.tipo === 'parcial' ? 'Parcial' : invoice.tipo === 'abono_cliente' ? 'Abono de cliente' : invoice.tipo === 'credito_cliente' ? 'Crédito de cliente' : 'Completa'}</small></td>
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
					<h3>Productos</h3>
					<div className="invoice-lines">{(selectedInvoice.pedido || []).map((item, index) => <div key={`${item.lineId || item.id}-${index}`}><span>{item.cantidad} × {item.nombre}</span><strong>{formatMoney(Number(item.precioUnidad || 0) * Number(item.cantidad || 0))}</strong></div>)}</div>
					{selectedInvoice.tipo === 'credito_cliente' && <p className="invoice-cash-details">Saldo pendiente: {formatMoney(selectedInvoice.saldoRestante)} · Estado: {selectedInvoice.estado || 'pendiente'}</p>}
					<h3>{selectedInvoice.tipo === 'credito_cliente' ? 'Estado de cuenta' : 'Métodos de pago'}</h3>
					<div className="invoice-payment-lines">{invoiceMethods(selectedInvoice).map((payment, index) => <div key={`${payment.metodoId || payment.nombre}-${index}`}><div><strong>{payment.nombre}</strong><span>{payment.tipo || ''}</span></div><strong>{formatMoney(payment.monto)}</strong>{payment.tipo === 'efectivo' && payment.denominaciones?.length > 0 && <small>{payment.denominaciones.map(({ valor, cantidad }) => `${cantidad} × ${formatMoney(valor)}`).join(' · ')}</small>}</div>)}</div>
					<div className="invoice-grand-total"><span>Total pagado</span><strong>{formatMoney(selectedInvoice.monto)}</strong></div>
					{selectedInvoice.efectivoRecibido > 0 && <p className="invoice-cash-details">Efectivo recibido {formatMoney(selectedInvoice.efectivoRecibido)} · Cambio {formatMoney(selectedInvoice.cambio)}</p>}
					{isAdmin ? editing ? <form className="invoice-edit-form" onSubmit={saveInvoice}>
						<label>Mesa o referencia<input value={editMesa} onChange={(event) => setEditMesa(event.target.value)} required /></label>
						<label>Observación<input value={editNote} onChange={(event) => setEditNote(event.target.value)} /></label>
						<div><button type="button" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button></div>
					</form> : <div className="invoice-admin-actions"><p>{selectedInvoice.observacion || 'Sin observaciones'}{selectedInvoice.editadaPor ? ` · Editada por ${selectedInvoice.editadaPor}` : ''}</p><button type="button" onClick={() => setEditing(true)}><FaEdit aria-hidden="true" /> Editar datos</button></div> : selectedInvoice.observacion && <p className="invoice-cash-details">{selectedInvoice.observacion}</p>}
				</section>
			</div>}
		</section>
	);
}

export default Facturas;