import { useMemo, useState } from 'react';
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { FaArrowLeft, FaCreditCard, FaFileInvoiceDollar } from 'react-icons/fa';
import { auth, db } from '../../../../server/api';
import { shiftBalance } from '../../../../server/paymentMethods';
import toast from '../../../../resources/toast/toast';
import Caja from '../../cuenta/caja/caja';
import '../clientes.css';

function formatMoney(value) {
	return `$${Number(value || 0).toLocaleString('es-CO')}`;
}

function formatDate(value) {
	const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
	return date ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(date) : 'Fecha pendiente';
}

function countDenominations(values) {
	return [...new Set(values)].map((value) => ({ valor: value, cantidad: values.filter((item) => item === value).length }));
}

function CuentaDelCliente({ customer, accounts, profile, onBack, onEdit }) {
	const [selectedAccountId, setSelectedAccountId] = useState('');
	const [paymentAmount, setPaymentAmount] = useState('');
	const [paymentOpen, setPaymentOpen] = useState(false);
	const currentAccount = accounts.find((account) => account.id === selectedAccountId);
	const pendingAccounts = useMemo(() => accounts.filter((account) => Number(account.saldoPendiente) > 0).sort((first, second) => {
		const firstDate = first.creadaEn?.toMillis?.() || 0;
		const secondDate = second.creadaEn?.toMillis?.() || 0;
		return secondDate - firstDate;
	}), [accounts]);
	const totalPending = pendingAccounts.reduce((sum, account) => sum + Number(account.saldoPendiente || 0), 0);

	function startPayment(amount) {
		const parsedAmount = Number(String(amount).replace(/\D/g, '')) || 0;
		if (!currentAccount || parsedAmount <= 0 || parsedAmount > Number(currentAccount.saldoPendiente || 0)) {
			toast.warning('El abono debe ser mayor a cero y no superar el saldo pendiente.');
			return;
		}
		setPaymentAmount(String(parsedAmount));
		setPaymentOpen(true);
	}

	async function recordPayment(method, paymentDetails = {}, paidItems = null, allocations = null) {
		if (!currentAccount) throw new Error('Selecciona una cuenta pendiente.');
		const amount = Number(paymentAmount) || 0;
		const accountReference = doc(db, 'cuentasCliente', currentAccount.id);
		const creditInvoiceReference = doc(db, 'facturas', currentAccount.id);
		const pointerReference = doc(db, 'configuracion', 'turnoActual');
		const invoiceReference = doc(collection(db, 'facturas'));
		const paymentAllocations = allocations?.length ? allocations : [{
			methodId: method.id,
			amount,
			method,
			denominations: paymentDetails.denominations || [],
			received: paymentDetails.received || 0,
			change: paymentDetails.change || 0,
		}];
		const balanceByMethod = paymentAllocations.reduce((balances, allocation) => ({
			...balances,
			[allocation.methodId]: (balances[allocation.methodId] || 0) + Number(allocation.amount || allocation.monto || 0),
		}), {});
		const movementReferences = paymentAllocations.map(() => doc(collection(db, 'movimientos')));

		await runTransaction(db, async (transaction) => {
			const accountSnapshot = await transaction.get(accountReference);
			const pointerSnapshot = await transaction.get(pointerReference);
			const creditInvoiceSnapshot = await transaction.get(creditInvoiceReference);
			if (!accountSnapshot.exists() || !creditInvoiceSnapshot.exists() || Number(accountSnapshot.data().saldoPendiente) < amount || amount <= 0) throw new Error('La cuenta cambió o el abono supera el saldo pendiente.');
			const activeShiftId = pointerSnapshot.exists() && pointerSnapshot.data().abierto ? pointerSnapshot.data().turnoId : '';
			if (!activeShiftId) throw new Error('Para registrar un pago o abono debes tener un turno abierto.');
			const methodSnapshots = new Map();
			for (const methodId of Object.keys(balanceByMethod)) {
				const methodSnapshot = await transaction.get(doc(db, 'metodosPago', methodId));
				if (!methodSnapshot.exists()) throw new Error('Uno de los métodos de pago ya no está disponible.');
				methodSnapshots.set(methodId, methodSnapshot);
			}
			const user = auth.currentUser;
			const profileSnapshot = user?.email ? await transaction.get(doc(db, 'usuarios', user.email.trim().toLowerCase())) : null;
			const profileData = profileSnapshot?.exists() ? profileSnapshot.data() : profile || {};
			const employeeName = [profileData.nombre, profileData.apellido].filter(Boolean).join(' ') || user?.email || 'Usuario';
			const accountData = accountSnapshot.data();
			const remainingBalance = Math.max(0, Number(accountData.saldoPendiente) - amount);

			for (const [methodId, allocatedAmount] of Object.entries(balanceByMethod)) {
				const currentBalance = shiftBalance(methodSnapshots.get(methodId).data());
				transaction.update(doc(db, 'metodosPago', methodId), { saldoTurno: currentBalance + allocatedAmount });
			}
			transaction.update(accountReference, {
				saldoPendiente: remainingBalance,
				estado: remainingBalance === 0 ? 'pagada' : 'pendiente',
				ultimaFacturaId: invoiceReference.id,
				actualizadaEn: serverTimestamp(),
			});
			transaction.update(creditInvoiceReference, {
				saldoRestante: remainingBalance,
				estado: remainingBalance === 0 ? 'pagada' : 'pendiente',
				ultimaFacturaAbonoId: invoiceReference.id,
				actualizadaEn: serverTimestamp(),
			});
			const invoiceMethods = paymentAllocations.map((allocation) => {
				const methodData = allocation.method || methodSnapshots.get(allocation.methodId).data();
				return {
					metodoId: allocation.methodId,
					nombre: methodData.nombre || 'Método de pago',
					tipo: methodData.tipo || '',
					monto: Number(allocation.amount || allocation.monto || 0),
					efectivoRecibido: Number(allocation.received || 0),
					cambio: Number(allocation.change || 0),
					denominaciones: methodData.tipo === 'efectivo' ? countDenominations(allocation.denominations || paymentDetails.denominations || []) : [],
				};
			});

			paymentAllocations.forEach((allocation, index) => {
				const methodData = allocation.method || methodSnapshots.get(allocation.methodId).data();
				transaction.set(movementReferences[index], {
					turnoId: activeShiftId,
					tipo: 'venta',
					direccion: 'ingreso',
					metodoId: allocation.methodId,
					metodoNombre: methodData.nombre || 'Método de pago',
					monto: Number(allocation.amount || allocation.monto || 0),
					efectivoRecibido: Number(allocation.received || 0),
					cambio: Number(allocation.change || 0),
					denominaciones: methodData.tipo === 'efectivo' ? countDenominations(allocation.denominations || paymentDetails.denominations || []) : [],
					descripcion: `Abono a cuenta de ${customer.nombre}`,
					clienteId: customer.id,
					clienteNombre: customer.nombre,
					cuentaClienteId: currentAccount.id,
					creadoPor: employeeName,
					creadoPorCorreo: user?.email || '',
					creadoEn: serverTimestamp(),
				});
			});
			transaction.set(invoiceReference, {
				folio: invoiceReference.id,
				turnoId: activeShiftId,
				mesaId: `cliente-${customer.id}`,
				mesaNombre: `Cuenta de ${customer.nombre}`,
				clienteId: customer.id,
				clienteNombre: customer.nombre,
				clienteTelefono: customer.telefono,
				cuentaClienteId: currentAccount.id,
				tipo: 'abono_cliente',
				monto: amount,
				pedido: [],
				metodoPagoId: invoiceMethods.length === 1 ? invoiceMethods[0].metodoId : 'multiple',
				metodoPago: invoiceMethods.length === 1 ? invoiceMethods[0].nombre : 'Múltiples métodos',
				metodosPago: invoiceMethods,
				saldoAnterior: Number(accountData.saldoPendiente),
				saldoRestante: remainingBalance,
				efectivoRecibido: paymentDetails.received || 0,
				cambio: paymentDetails.change || 0,
				denominaciones: paymentDetails.denominations || [],
				registradaPor: employeeName,
				registradaPorCorreo: user?.email || '',
				observacion: '',
				pagadoEn: serverTimestamp(),
			});
		});

		setPaymentOpen(false);
		setSelectedAccountId('');
		setPaymentAmount('');
		toast.success('Abono registrado en el turno.');
	}

	if (!currentAccount) {
		return <section className="customer-accounts-page" aria-labelledby="customer-account-title">
			<header className="customer-detail-header"><button className="customer-back-button" type="button" onClick={onBack}><FaArrowLeft /> Clientes</button><div><p className="app-eyebrow">Cuenta corriente</p><h1 id="customer-account-title">{customer.nombre}</h1><p>{customer.telefono}</p></div><button className="customer-edit-inline" type="button" onClick={onEdit}>Editar datos</button></header>
			<div className="customer-balance-banner"><span>Saldo pendiente total</span><strong>{formatMoney(totalPending)}</strong></div>
			<div className="customer-accounts-heading"><h2>Cuentas</h2><span>{pendingAccounts.length} pendientes</span></div>
			{pendingAccounts.length === 0 ? <p className="customer-no-accounts">Este cliente no tiene cuentas pendientes.</p> : <div className="customer-account-list">{pendingAccounts.map((account) => <button className="customer-account-card" type="button" key={account.id} onClick={() => setSelectedAccountId(account.id)}>
				<span><strong>{formatDate(account.creadaEn)}</strong><small>{account.pedido?.length || 0} productos · {account.estado === 'pendiente' ? 'Pendiente' : account.estado}</small></span><strong>{formatMoney(account.saldoPendiente)}</strong>
			</button>)}</div>}
		</section>;
	}

	const bill = Number(currentAccount.saldoPendiente || 0);
	const accountItems = currentAccount.pedido || [];
	return <section className="customer-accounts-page" aria-labelledby="customer-account-title">
		<header className="customer-detail-header"><button className="customer-back-button" type="button" onClick={() => setSelectedAccountId('')}><FaArrowLeft /> Cuentas</button><div><p className="app-eyebrow">{formatDate(currentAccount.creadaEn)}</p><h1 id="customer-account-title">{customer.nombre}</h1><p>{customer.telefono}</p></div></header>
		<div className="customer-account-balance"><div><span>Cuenta original</span><strong>{formatMoney(currentAccount.total)}</strong></div><div><span>Saldo pendiente</span><strong>{formatMoney(bill)}</strong></div></div>
		<section className="customer-order-lines"><h2>Pedido anotado</h2>{accountItems.map((item, index) => <article key={`${item.lineId || item.id}-${index}`}>
			<div><strong>{item.nombre}</strong><small>{item.cantidad} × {formatMoney(item.precioUnidad)} · Pedido {(item.horasPedido || Array.from({ length: item.cantidad }, () => item.addedAt)).map(formatDate).join(', ')}</small></div><strong>{formatMoney(Number(item.precioUnidad || 0) * Number(item.cantidad || 0))}</strong>
		</article>)}</section>
		{bill > 0 && <section className="customer-payment-panel"><h2>Registrar pago o abono</h2><label>Importe del abono<input type="text" inputMode="numeric" pattern="[0-9]*" value={paymentAmount ? Number(paymentAmount).toLocaleString('es-CO') : ''} onChange={(event) => setPaymentAmount(event.target.value.replace(/\D/g, ''))} placeholder="0" /></label><div className="customer-payment-actions"><button className="customer-pay-full" type="button" onClick={() => startPayment(String(bill))}><FaCreditCard /> Pagar saldo completo</button><button className="customer-pay-partial" type="button" disabled={!paymentAmount} onClick={() => startPayment(paymentAmount)}><FaFileInvoiceDollar /> Continuar con abono</button></div></section>}
		{paymentOpen && <Caja total={Number(paymentAmount)} table={{ label: `Cuenta · ${customer.nombre}`, numero: '' }} items={[]} allowSplit={false} onClose={() => setPaymentOpen(false)} onPaid={recordPayment} />}
	</section>;
}

export default CuentaDelCliente;
