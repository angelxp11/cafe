import { useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { FaFilePdf, FaSearch } from 'react-icons/fa';
import { db } from '../../server/api';
import toast from '../../resources/toast/toast';
import { reportHtml } from '../turno/turno';
import './reportes.css';

const reportTypes = [
	{ id: 'egresos', label: 'Egresos mensuales de caja' },
	{ id: 'ventas', label: 'Ventas mensuales' },
	{ id: 'inventario', label: 'Productos vendidos por mes' },
	{ id: 'cierres', label: 'Cierres de caja' },
];

function localDateValue(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function toDate(value) {
	const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
	return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatMoney(value) {
	return `$${Number(value || 0).toLocaleString('es-CO')}`;
}

function formatDate(value) {
	const date = toDate(value);
	return date ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Fecha pendiente';
}

function formatMonth(month) {
	const [year, monthNumber] = month.split('-').map(Number);
	return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' })
		.format(new Date(year, monthNumber - 1, 1));
}

function escapeHtml(value) {
	return String(value ?? '').replace(/[&<>"']/g, (character) => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
	})[character]);
}

function monthRange(dateFrom, dateTo) {
	const start = new Date(`${dateFrom}T00:00:00`);
	const end = new Date(`${dateTo}T00:00:00`);
	const months = [];
	for (const date = new Date(start.getFullYear(), start.getMonth(), 1); date <= end; date.setMonth(date.getMonth() + 1)) {
		months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
	}
	return months;
}

function invoiceIsSale(invoice) {
	return invoice.cancelada !== true && invoice.cancelada !== 'true'
		&& !['credito_cliente', 'abono_cliente'].includes(invoice.tipo);
}

export function buildReport(type, documents, dateFrom, dateTo) {
	const start = new Date(`${dateFrom}T00:00:00`);
	const end = new Date(`${dateTo}T23:59:59.999`);
	const months = monthRange(dateFrom, dateTo);

	if (type === 'egresos') {
		const totals = new Map();
		documents.forEach((movement) => {
			if (movement.tipo !== 'egreso' && movement.direccion !== 'egreso') return;
			const date = toDate(movement.creadoEn);
			if (!date || date < start || date > end) return;
			const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
			const category = String(movement.categoria || 'SIN CATEGORÍA').trim().toLocaleUpperCase('es-CO');
			const key = `${month}:${category}`;
			const row = totals.get(key) || { month, category, count: 0, amount: 0 };
			row.count += 1;
			row.amount += Number(movement.monto || 0);
			totals.set(key, row);
		});
		const rows = [...totals.values()].sort((first, second) => first.month.localeCompare(second.month) || first.category.localeCompare(second.category, 'es'));
		return { rows, totalAmount: rows.reduce((sum, row) => sum + row.amount, 0), totalCount: rows.reduce((sum, row) => sum + row.count, 0) };
	}

	const totals = new Map(months.map((month) => [month, { month, count: 0, amount: 0 }]));
	const products = new Map();
	documents.forEach((invoice) => {
		if (!invoiceIsSale(invoice)) return;
		const date = toDate(invoice.pagadoEn);
		if (!date || date < start || date > end) return;
		const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
		const monthTotal = totals.get(month);
		if (!monthTotal) return;
		monthTotal.count += 1;
		monthTotal.amount += Number(invoice.monto || 0);
		if (type !== 'inventario') return;
		(invoice.pedido || []).forEach((item) => {
			const key = `${month}:${item.id || item.nombre || 'producto'}`;
			const product = products.get(key) || { month, name: item.nombre || 'Producto sin nombre', quantity: 0, amount: 0 };
			const quantity = Number(item.cantidad || 0);
			product.quantity += quantity;
			product.amount += Number(item.precioUnidad || 0) * quantity;
			products.set(key, product);
		});
	});

	if (type === 'ventas') {
		const rows = [...totals.values()];
		return { rows, totalAmount: rows.reduce((sum, row) => sum + row.amount, 0), totalCount: rows.reduce((sum, row) => sum + row.count, 0) };
	}

	const rows = [...products.values()].sort((first, second) => first.month.localeCompare(second.month) || first.name.localeCompare(second.name, 'es'));
	return { rows, totalAmount: rows.reduce((sum, row) => sum + row.amount, 0), totalCount: rows.reduce((sum, row) => sum + row.quantity, 0) };
}

function reportRowsHtml(type, rows) {
	if (!rows.length) return `<tr><td colspan="${type === 'inventario' || type === 'egresos' ? 4 : 3}">Sin registros para el periodo seleccionado</td></tr>`;
	if (type === 'egresos') return rows.map((row) => `<tr><td>${escapeHtml(formatMonth(row.month))}</td><td>${escapeHtml(row.category)}</td><td>${row.count}</td><td>${formatMoney(row.amount)}</td></tr>`).join('');
	if (type === 'ventas') return rows.map((row) => `<tr><td>${escapeHtml(formatMonth(row.month))}</td><td>${row.count}</td><td>${formatMoney(row.amount)}</td></tr>`).join('');
	return rows.map((row) => `<tr><td>${escapeHtml(formatMonth(row.month))}</td><td>${escapeHtml(row.name)}</td><td>${row.quantity}</td><td>${formatMoney(row.amount)}</td></tr>`).join('');
}

function openPrintableReport(type, report, dateFrom, dateTo) {
	const reportWindow = window.open('', '_blank');
	if (!reportWindow) {
		toast.warning('Permite las ventanas emergentes para abrir el reporte.');
		return;
	}
	const title = reportTypes.find((item) => item.id === type)?.label || 'Reporte';
	const tableHead = type === 'egresos'
		? '<tr><th>Mes</th><th>Categoría</th><th>Egresos</th><th>Total</th></tr>'
		: type === 'inventario'
		? '<tr><th>Mes</th><th>Producto</th><th>Unidades vendidas</th><th>Valor vendido</th></tr>'
		: `<tr><th>Mes</th><th>${type === 'egresos' ? 'Movimientos' : 'Facturas'}</th><th>Total</th></tr>`;
	const tableFoot = type === 'egresos'
		? `<tr><th colspan="2">Totales del periodo</th><th>${report.totalCount}</th><th>${formatMoney(report.totalAmount)}</th></tr>`
		: type === 'inventario'
		? `<tr><th colspan="2">Totales del periodo</th><th>${report.totalCount}</th><th>${formatMoney(report.totalAmount)}</th></tr>`
		: `<tr><th>Total del periodo</th><th>${report.totalCount}</th><th>${formatMoney(report.totalAmount)}</th></tr>`;
	reportWindow.document.open();
	reportWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
		*{box-sizing:border-box}body{margin:0;padding:32px;background:#edf1ed;color:#24312d;font-family:Arial,sans-serif}.actions{max-width:980px;margin:0 auto 14px;text-align:right}.actions button{padding:11px 16px;border:0;border-radius:4px;background:#29443b;color:white;cursor:pointer;font-weight:700}.report{max-width:980px;margin:auto;background:#fff;border:1px solid #d9e0dc}.masthead{padding:30px 36px;background:#29443b;color:#fff}.masthead small{color:#c8d7cd;letter-spacing:1px;text-transform:uppercase}.masthead h1{margin:8px 0;font-size:26px}.masthead p{margin:0;color:#dbe7de}.content{padding:28px 36px}.summary{display:flex;gap:14px;margin-bottom:24px}.summary div{flex:1;padding:15px;border:1px solid #dfe6e1;background:#f8faf8}.summary span{display:block;color:#63736b;font-size:12px}.summary strong{display:block;margin-top:6px;font-size:20px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:10px;border-bottom:1px solid #e6ebe8;text-align:left}th{background:#f3f6f3;color:#58685f}.footer{margin-top:24px;color:#63736b;font-size:11px}@media print{body{padding:0;background:#fff}.report{max-width:none;border:0}.actions{display:none}.masthead,.summary div,th{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:14mm}}@media(max-width:600px){body{padding:12px}.content,.masthead{padding:20px}.summary{flex-direction:column}}
	</style></head><body><div class="actions"><button type="button" onclick="window.print()">Descargar PDF</button></div><main class="report"><header class="masthead"><small>Café · Reportes</small><h1>${escapeHtml(title)}</h1><p>Periodo: ${escapeHtml(dateFrom)} al ${escapeHtml(dateTo)}</p></header><section class="content"><div class="summary"><div><span>${type === 'egresos' ? 'Egresos registrados' : type === 'ventas' ? 'Facturas incluidas' : 'Unidades vendidas'}</span><strong>${report.totalCount}</strong></div><div><span>${type === 'egresos' ? 'Total de egresos' : type === 'ventas' ? 'Total vendido' : 'Valor de productos vendidos'}</span><strong>${formatMoney(report.totalAmount)}</strong></div></div><table><thead>${tableHead}</thead><tbody>${reportRowsHtml(type, report.rows)}</tbody><tfoot>${tableFoot}</tfoot></table><p class="footer">Reporte generado el ${escapeHtml(new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()))}</p></section></main></body></html>`);
	reportWindow.document.close();
}

async function openClosingReport(shift) {
	const reportWindow = window.open('', '_blank');
	if (!reportWindow) {
		toast.warning('Permite las ventanas emergentes para abrir el cierre de caja.');
		return;
	}
	reportWindow.document.write('<!doctype html><title>Cargando cierre</title><p style="font:16px Arial;padding:32px">Cargando reporte de cierre...</p>');
	try {
		const [invoiceSnapshot, movementSnapshot, inventorySnapshot, customerAccountSnapshot] = await Promise.all([
			getDocs(query(collection(db, 'facturas'), where('turnoId', '==', shift.id))),
			getDocs(query(collection(db, 'movimientos'), where('turnoId', '==', shift.id))),
			getDocs(collection(db, 'inventario')),
			getDocs(query(collection(db, 'cuentasCliente'), where('turnoId', '==', shift.id))),
		]);
		const invoices = invoiceSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((invoice) => invoice.turnoId === shift.id);
		const movements = movementSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((movement) => movement.turnoId === shift.id);
		const inventory = inventorySnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
		const pendingAccounts = shift.cierre?.cuentasClientePendientes
			|| customerAccountSnapshot.docs.map((item) => item.data()).filter((account) => Number(account.saldoPendiente) > 0);
		const pendingRows = pendingAccounts.map((account) => `<tr><td>${escapeHtml(account.clienteNombre || 'Cliente')}</td><td>${escapeHtml(account.clienteTelefono || '—')}</td><td>${escapeHtml(account.mesaOrigen || '—')}</td><td>${formatMoney(account.saldoPendiente)}</td></tr>`).join('');
		const pendingSection = `<section class="section"><h2>Cuentas pendientes de clientes</h2><table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Origen</th><th class="right">Saldo pendiente</th></tr></thead><tbody>${pendingRows || '<tr><td colspan="4">Sin cuentas pendientes asignadas a este turno</td></tr>'}</tbody></table></section>`;
		const report = reportHtml(shift, invoices, movements, inventory);
		reportWindow.document.open();
		reportWindow.document.write(report.replace('</main>', `<div class="content">${pendingSection}</div></main>`));
		reportWindow.document.close();
		reportWindow.focus();
	} catch (error) {
		console.error('No se pudo cargar el reporte del cierre.', error);
		reportWindow.close();
		toast.error('No se pudo cargar la información del cierre.');
	}
}

function Reportes() {
	const today = localDateValue(new Date());
	const [reportType, setReportType] = useState('egresos');
	const [dateFrom, setDateFrom] = useState(`${today.slice(0, 7)}-01`);
	const [dateTo, setDateTo] = useState(today);
	const [closureDate, setClosureDate] = useState(today);
	const [report, setReport] = useState(null);
	const [closures, setClosures] = useState(null);
	const [reportPeriod, setReportPeriod] = useState(null);
	const [loading, setLoading] = useState(false);
	const title = reportTypes.find((item) => item.id === reportType)?.label || 'Reporte';

	async function generateReport(event) {
		event.preventDefault();
		if ((reportType === 'cierres' && !closureDate) || (reportType !== 'cierres' && (!dateFrom || !dateTo || dateFrom > dateTo))) {
			toast.warning('Selecciona un rango de fechas válido.');
			return;
		}
		setLoading(true);
		setReport(null);
		setClosures(null);
		try {
			if (reportType === 'cierres') {
				const snapshot = await getDocs(collection(db, 'turnos'));
				const matchingClosures = snapshot.docs
					.map((item) => ({ id: item.id, ...item.data() }))
					.filter((shift) => {
						const closedAt = toDate(shift.cierre?.cerradoEn);
						return closedAt && localDateValue(closedAt) === closureDate;
					})
					.sort((first, second) => toDate(second.cierre.cerradoEn) - toDate(first.cierre.cerradoEn));
				setClosures(matchingClosures);
				return;
			}
			const collectionName = reportType === 'egresos' ? 'movimientos' : 'facturas';
			const snapshot = await getDocs(collection(db, collectionName));
			const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
			setReport(buildReport(reportType, data, dateFrom, dateTo));
			setReportPeriod({ dateFrom, dateTo, reportType });
		} catch (error) {
			console.error('No se pudo generar el reporte.', error);
			toast.error('No se pudo generar el reporte. Intenta de nuevo.');
		} finally {
			setLoading(false);
		}
	}

	return (
		<section className="reports-page" aria-labelledby="reports-title">
			<header className="app-content-header reports-header">
				<div><p className="app-eyebrow">Análisis del negocio</p><h1 id="reports-title">Generar reportes</h1><p className="app-intro">Consulta egresos, ventas y productos vendidos por periodo.</p></div>
			</header>
			<form className="reports-filters" onSubmit={generateReport}>
				<label htmlFor="report-type">Tipo de reporte
					<select id="report-type" value={reportType} onChange={(event) => { setReportType(event.target.value); setReport(null); setClosures(null); }}>
						{reportTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
					</select>
				</label>
				{reportType === 'cierres'
					? <label htmlFor="report-closure-date">Fecha de cierre<input id="report-closure-date" type="date" value={closureDate} onChange={(event) => { setClosureDate(event.target.value); setClosures(null); }} required /></label>
					: <><label htmlFor="report-date-from">Fecha inicial<input id="report-date-from" type="date" value={dateFrom} max={dateTo} onChange={(event) => setDateFrom(event.target.value)} required /></label>
						<label htmlFor="report-date-to">Fecha final<input id="report-date-to" type="date" value={dateTo} min={dateFrom} onChange={(event) => setDateTo(event.target.value)} required /></label></>}
				<button className="reports-search-button" type="submit" disabled={loading}><FaSearch aria-hidden="true" />{loading ? 'Consultando...' : 'Consultar reporte'}</button>
			</form>
			{reportType === 'cierres' && closures !== null && !loading && (
				<section className="reports-results" aria-live="polite">
					<div className="reports-results-heading"><div><h2>Cierres de caja</h2><p>Fecha: {closureDate}</p></div></div>
					{closures.length ? <div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>Hora de cierre</th><th>Abrió</th><th>Cerró</th><th>Efectivo contado</th><th></th></tr></thead><tbody>{closures.map((shift) => <tr key={shift.id}><td>{formatDate(shift.cierre?.cerradoEn)}</td><td>{shift.apertura?.empleadoNombre || '—'}</td><td>{shift.cierre?.empleadoNombre || '—'}</td><td>{formatMoney(shift.cierre?.efectivoContado)}</td><td><button className="reports-pdf-button" type="button" onClick={() => openClosingReport(shift)}><FaFilePdf aria-hidden="true" />Ver / imprimir</button></td></tr>)}</tbody></table></div> : <p className="reports-empty">No se encontraron cierres de caja para esta fecha.</p>}
				</section>
			)}
			{report && reportPeriod?.reportType === reportType && reportPeriod.dateFrom === dateFrom && reportPeriod.dateTo === dateTo && (
				<section className="reports-results" aria-live="polite">
					<div className="reports-results-heading"><div><h2>{title}</h2><p>Periodo: {reportPeriod.dateFrom} al {reportPeriod.dateTo}</p></div><button className="reports-pdf-button" type="button" onClick={() => openPrintableReport(reportType, report, reportPeriod.dateFrom, reportPeriod.dateTo)}><FaFilePdf aria-hidden="true" />Generar PDF</button></div>
					<div className="reports-summary">
						<div><span>{reportType === 'egresos' ? 'Movimientos de egreso' : reportType === 'ventas' ? 'Facturas incluidas' : 'Unidades vendidas'}</span><strong>{report.totalCount}</strong></div>
						<div><span>{reportType === 'egresos' ? 'Total de egresos' : reportType === 'ventas' ? 'Total vendido' : 'Valor de productos vendidos'}</span><strong>{formatMoney(report.totalAmount)}</strong></div>
					</div>
					<div className="reports-table-wrap"><table className="reports-table"><thead><tr>{reportType === 'egresos' ? <><th>Mes</th><th>Categoría</th><th>Egresos</th><th>Total</th></> : reportType === 'inventario' ? <><th>Mes</th><th>Producto</th><th>Unidades vendidas</th><th>Valor vendido</th></> : <><th>Mes</th><th>Facturas</th><th>Total</th></>}</tr></thead>
						<tbody>{report.rows.length ? report.rows.map((row, index) => <tr key={`${row.month}-${row.category || row.name || index}`}>
							<td>{formatMonth(row.month)}</td>
							{reportType === 'egresos' ? <><td>{row.category}</td><td>{row.count.toLocaleString('es-CO')}</td><td>{formatMoney(row.amount)}</td></> : reportType === 'inventario' ? <><td>{row.name}</td><td>{row.quantity.toLocaleString('es-CO')}</td><td>{formatMoney(row.amount)}</td></> : <><td>{row.count.toLocaleString('es-CO')}</td><td>{formatMoney(row.amount)}</td></>}
						</tr>) : <tr><td colSpan={reportType === 'egresos' || reportType === 'inventario' ? 4 : 3} className="reports-empty">Sin registros para el periodo seleccionado.</td></tr>}</tbody>
						<tfoot><tr>{reportType === 'egresos' || reportType === 'inventario' ? <><th colSpan="2">Totales del periodo</th><th>{report.totalCount.toLocaleString('es-CO')}</th><th>{formatMoney(report.totalAmount)}</th></> : <><th>Total del periodo</th><th>{report.totalCount.toLocaleString('es-CO')}</th><th>{formatMoney(report.totalAmount)}</th></>}</tr></tfoot>
					</table></div>
					<p className="reports-pdf-help">El PDF se abrirá en una nueva pestaña. Selecciona «Descargar PDF» y luego «Guardar como PDF» en el diálogo de impresión del navegador.</p>
				</section>
			)}
		</section>
	);
}

export default Reportes;
