import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { FaExchangeAlt, FaMoneyBillWave, FaTimes } from 'react-icons/fa';
import { db } from '../../../../server/api';
import { amountCoveredByPayment, amountWithCommission } from '../../../../server/paymentMethods';
import LoadingScreen from '../../../../resources/loading/LoadingScreen';
import toast from '../../../../resources/toast/toast';
import Dividir from './dividir/dividir';
import './caja.css';
import denomination50 from '../../../../resources/denominaciones/50.svg';
import denomination100 from '../../../../resources/denominaciones/100.svg';
import denomination200 from '../../../../resources/denominaciones/200.svg';
import denomination500 from '../../../../resources/denominaciones/500.svg';
import denomination1000 from '../../../../resources/denominaciones/1000.svg';
import denomination2000 from '../../../../resources/denominaciones/2000.svg';
import denomination5000 from '../../../../resources/denominaciones/5000.svg';
import denomination10000 from '../../../../resources/denominaciones/10000.svg';
import denomination20000 from '../../../../resources/denominaciones/20000.svg';
import denomination50000 from '../../../../resources/denominaciones/50000.svg';
import denomination100000 from '../../../../resources/denominaciones/100000.svg';

const denominations = [
	{ value: 100000, image: denomination100000 },
	{ value: 50000, image: denomination50000 },
	{ value: 20000, image: denomination20000 },
	{ value: 10000, image: denomination10000 },
	{ value: 5000, image: denomination5000 },
	{ value: 2000, image: denomination2000 },
	{ value: 1000, image: denomination1000 },
	{ value: 500, image: denomination500 },
	{ value: 200, image: denomination200 },
	{ value: 100, image: denomination100 },
	{ value: 50, image: denomination50 },
];

function Caja({ total, table, items, onClose, onPaid, allowSplit = true }) {
	const [methods, setMethods] = useState([]);
	const [selectedMethodId, setSelectedMethodId] = useState('');
	const [activeType, setActiveType] = useState('efectivo');
	const [cashDenominations, setCashDenominations] = useState([]);
	const [additionalCashDenominations, setAdditionalCashDenominations] = useState([]);
	const [useAdditionalMethod, setUseAdditionalMethod] = useState(false);
	const [additionalMethodId, setAdditionalMethodId] = useState('');
	const [additionalAmount, setAdditionalAmount] = useState('');
	const [loading, setLoading] = useState(true);
	const [paying, setPaying] = useState(false);
	const [splitOpen, setSplitOpen] = useState(false);
	const [splitPaying, setSplitPaying] = useState(false);

	useEffect(() => {
		const unsubscribe = onSnapshot(collection(db, 'metodosPago'), (snapshot) => {
			const availableMethods = snapshot.docs
				.map((item) => ({ id: item.id, ...item.data() }))
				.filter((method) => method.activo !== false);
			setMethods(availableMethods);
			setSelectedMethodId((current) => current || availableMethods[0]?.id || '');
			setActiveType((current) => availableMethods.some((method) => method.tipo === current) ? current : availableMethods[0]?.tipo || 'efectivo');
			setLoading(false);
		}, () => {
			toast.error('No se pudieron cargar los métodos de pago.');
			setLoading(false);
		});
		return unsubscribe;
	}, []);

	useEffect(() => {
		const activeMethod = methods.find((method) => method.tipo === activeType);
		const selectedMethod = methods.find((method) => method.id === selectedMethodId);
		if (activeMethod && selectedMethod?.tipo !== activeType) setSelectedMethodId(activeMethod.id);
	}, [activeType, methods, selectedMethodId]);

	const cashReceived = cashDenominations.reduce((sum, value) => sum + value, 0);
	const isCashPayment = activeType === 'efectivo';
	const selectedMethod = methods.find((item) => item.id === selectedMethodId);
	const additionalMethod = methods.find((item) => item.id === additionalMethodId);
	const additionalCashReceived = additionalCashDenominations.reduce((sum, value) => sum + value, 0);
	const additionalBaseAmount = useAdditionalMethod
		? additionalMethod?.tipo === 'efectivo'
			? amountCoveredByPayment(additionalCashReceived, total, additionalMethod.comision)
			: Number(String(additionalAmount).replace(/\D/g, '')) || 0
		: 0;
	const primaryBaseAmount = useAdditionalMethod ? Math.max(0, total - additionalBaseAmount) : total;
	const primaryDue = amountWithCommission(primaryBaseAmount, selectedMethod?.comision);
	const additionalDue = amountWithCommission(additionalBaseAmount, additionalMethod?.comision);
	const requiredTotal = primaryDue + additionalDue;
	const primaryCashChange = isCashPayment ? Math.max(0, cashReceived - primaryDue) : 0;
	const additionalCashChange = additionalMethod?.tipo === 'efectivo' ? Math.max(0, additionalCashReceived - additionalDue) : 0;
	const cashChange = primaryCashChange + additionalCashChange;
	const cashMissing = isCashPayment ? Math.max(0, primaryDue - cashReceived) : 0;

	function addDenomination(value) {
		setCashDenominations((current) => [...current, value]);
	}

	function clearDenominations() {
		setCashDenominations([]);
	}

	async function handlePay() {
		const method = methods.find((item) => item.id === selectedMethodId && item.tipo === activeType) || methods.find((item) => item.tipo === activeType);
		if (!method) {
			toast.warning('Selecciona un método de pago.');
			return;
		}
		if (useAdditionalMethod) {
			const primaryReceived = isCashPayment ? cashReceived : 0;
			const secondReceived = additionalMethod?.tipo === 'efectivo' ? additionalCashReceived : 0;
			if (!additionalMethod || additionalMethod.id === method.id || primaryBaseAmount <= 0 || additionalBaseAmount <= 0 || primaryBaseAmount + additionalBaseAmount !== total
				|| (isCashPayment && primaryReceived < primaryDue)
				|| (additionalMethod.tipo === 'efectivo' && secondReceived < additionalDue)) {
				toast.warning('Indica un segundo método y un monto menor al total.');
				return;
			}
		} else if (isCashPayment && cashReceived < primaryDue) {
			toast.warning(`Faltan $${cashMissing.toLocaleString('es-CO')} para completar el pago.`);
			return;
		}
		setPaying(true);
		try {
			const allocations = useAdditionalMethod ? [
				{ methodId: method.id, baseAmount: primaryBaseAmount, method, denominations: isCashPayment ? cashDenominations : [], received: isCashPayment ? cashReceived : 0, change: primaryCashChange },
				{ methodId: additionalMethod.id, baseAmount: additionalBaseAmount, method: additionalMethod, denominations: additionalMethod.tipo === 'efectivo' ? additionalCashDenominations : [], received: additionalMethod.tipo === 'efectivo' ? additionalCashReceived : 0, change: additionalCashChange },
			] : null;
			const paymentDenominations = isCashPayment
				? [...cashDenominations, ...(additionalMethod?.tipo === 'efectivo' ? additionalCashDenominations : [])]
				: additionalCashDenominations;
			const received = paymentDenominations.reduce((sum, value) => sum + value, 0);
			await onPaid(method, { denominations: paymentDenominations, received, change: cashChange }, null, allocations);
		} catch (error) {
			console.error('No se pudo registrar el pago de la mesa.', error);
			toast.error(error.message || 'No se pudo registrar el pago.');
			setPaying(false);
		}
	}

	async function handleSplitConfirm(selectedItems, allocations, paymentDetails) {
		const method = allocations[0]?.method;
		if (!method) {
			toast.warning('Selecciona un método de pago.');
			return;
		}
		setSplitPaying(true);
		try {
			await onPaid(method, paymentDetails, selectedItems, allocations);
			setSplitOpen(false);
		} catch (error) {
			console.error('No se pudo registrar la factura parcial.', error);
			toast.error(error.message || 'No se pudo registrar la factura parcial.');
		} finally {
			setSplitPaying(false);
		}
	}

	if (loading) return <LoadingScreen text="Cargando caja" />;
	if (paying) return <LoadingScreen text="Registrando pago" />;

	const visibleMethods = methods.filter((method) => method.tipo === activeType);
	const panelLabel = isCashPayment ? 'Denominaciones' : 'Métodos de transferencia';

	function selectType(type) {
		setActiveType(type);
		const firstMethod = methods.find((method) => method.tipo === type);
		setSelectedMethodId(firstMethod?.id || '');
		if (firstMethod?.id === additionalMethodId) {
			setAdditionalMethodId('');
			setAdditionalCashDenominations([]);
		}
	}

	function selectPrimaryMethod(methodId) {
		setSelectedMethodId(methodId);
		if (methodId === additionalMethodId) {
			setAdditionalMethodId('');
			setAdditionalCashDenominations([]);
		}
	}

	function selectAdditionalMethod(methodId) {
		setAdditionalMethodId(methodId);
		setAdditionalAmount('');
		setAdditionalCashDenominations([]);
	}

	function enableAdditionalMethod(enabled) {
		setUseAdditionalMethod(enabled);
		if (enabled) {
			const secondMethod = methods.find((method) => method.id !== selectedMethodId);
			setAdditionalMethodId(secondMethod?.id || '');
			setAdditionalCashDenominations([]);
			setAdditionalAmount('');
		} else {
			setAdditionalMethodId('');
			setAdditionalAmount('');
			setAdditionalCashDenominations([]);
		}
	}

	function addAdditionalCashDenomination(value) {
		setAdditionalCashDenominations((current) => [...current, value]);
	}

	function clearAdditionalCashDenominations() {
		setAdditionalCashDenominations([]);
	}

	function formatAmount(value) {
		const digits = String(value ?? '').replace(/\D/g, '');
		return digits ? Number(digits).toLocaleString('es-CO') : '';
	}

	return (
		<div className="cashier-backdrop" role="presentation">
			<section className="cashier-modal" role="dialog" aria-modal="true" aria-labelledby="cashier-title">
				<header className="cashier-header">
					<div><p className="app-eyebrow">Cierre de cuenta</p><h2 id="cashier-title">Caja</h2></div>
					<button className="cashier-close" type="button" aria-label="Cerrar caja" onClick={onClose}><FaTimes /></button>
				</header>
				<div className="cashier-content">
					<p className="cashier-table">{table.label || `Mesa ${table.numero}`}</p>
					<div className="cashier-total"><span>Total a pagar<small>Subtotal: ${total.toLocaleString('es-CO')}{requiredTotal !== total && ` · Comisión: $${(requiredTotal - total).toLocaleString('es-CO')}`}</small></span><strong>${requiredTotal.toLocaleString('es-CO')}</strong></div>
					<div className="cashier-payment-heading"><h3>Método de pago</h3>{allowSplit && <button className="cashier-split-button" type="button" onClick={() => setSplitOpen(true)} disabled={!selectedMethodId || !items.length || splitPaying}>Dividir</button>}</div>
					<div className="cashier-tabs" role="tablist" aria-label="Tipo de método de pago">
						<button className={activeType === 'efectivo' ? 'cashier-tab cashier-tab-active' : 'cashier-tab'} type="button" role="tab" aria-selected={activeType === 'efectivo'} onClick={() => selectType('efectivo')}><FaMoneyBillWave aria-hidden="true" /><span>Efectivo</span></button>
						<button className={activeType === 'transferencia' ? 'cashier-tab cashier-tab-active' : 'cashier-tab'} type="button" role="tab" aria-selected={activeType === 'transferencia'} onClick={() => selectType('transferencia')}><FaExchangeAlt aria-hidden="true" /><span>Transferencia</span></button>
					</div>
					<div className="cashier-tab-panel" role="tabpanel">
						<p className="cashier-panel-label">{panelLabel}</p>
						{isCashPayment && visibleMethods.length > 0 && <>
							<div className="cash-denomination-grid" aria-label="Denominaciones disponibles">
								{denominations.map((denomination) => <button className="cash-denomination" type="button" key={denomination.value} onClick={() => addDenomination(denomination.value)}>
									<img src={denomination.image} alt={`Billete de ${denomination.value.toLocaleString('es-CO')} pesos`} />
									<strong>${denomination.value.toLocaleString('es-CO')}</strong>
								</button>)}
							</div>
							<div className="cash-selection-summary">
								<div className="cash-selection-heading"><strong>Efectivo recibido</strong><button className="cash-clear-button" type="button" onClick={clearDenominations} disabled={cashDenominations.length === 0}>Borrar</button></div>
								<div className="cash-amounts"><span>Recibido <strong>${cashReceived.toLocaleString('es-CO')}</strong></span>{cashMissing > 0 ? <span className="cash-amount-missing">Faltan <strong>${cashMissing.toLocaleString('es-CO')}</strong></span> : <span className="cash-amount-change">Cambio <strong>${primaryCashChange.toLocaleString('es-CO')}</strong></span>}</div>
							</div>
						</>}
						{!isCashPayment && <div className="cashier-method-list" role="list" aria-label={`Métodos de ${activeType}`}>
							{visibleMethods.map((method) => <button className={selectedMethodId === method.id ? 'cashier-method cashier-method-active' : 'cashier-method'} type="button" role="listitem" key={method.id} onClick={() => selectPrimaryMethod(method.id)}>
								<span>{method.nombre}{Number(method.comision || 0) > 0 && <small> · Comisión {Number(method.comision)}%</small>}</span>
							</button>)}
							{visibleMethods.length === 0 && <p className="cashier-empty">No hay métodos de {activeType} configurados.</p>}
						</div>}
					</div>
					{methods.length > 1 && <label className="cashier-additional-toggle"><input type="checkbox" checked={useAdditionalMethod} onChange={(event) => enableAdditionalMethod(event.target.checked)} /><span>Agregar otro método de pago para esta cuenta</span></label>}
					{useAdditionalMethod && <div className="cashier-additional-payment">
						<label htmlFor="additional-payment-method">Segundo método<select id="additional-payment-method" value={additionalMethodId} onChange={(event) => selectAdditionalMethod(event.target.value)}><option value="">Selecciona un método</option>{methods.filter((method) => method.id !== selectedMethodId).map((method) => <option key={method.id} value={method.id}>{method.nombre}</option>)}</select></label>
						{additionalMethod?.tipo === 'efectivo' ? <>
							<div className="cash-denomination-grid" aria-label="Denominaciones del segundo método">
								{denominations.map((denomination) => <button className="cash-denomination" type="button" key={denomination.value} onClick={() => addAdditionalCashDenomination(denomination.value)}>
									<img src={denomination.image} alt={`Billete de ${denomination.value.toLocaleString('es-CO')} pesos`} />
									<strong>${denomination.value.toLocaleString('es-CO')}</strong>
								</button>)}
							</div>
							<div className="cash-selection-summary">
								<div className="cash-selection-heading"><strong>Efectivo del segundo método</strong><button className="cash-clear-button" type="button" onClick={clearAdditionalCashDenominations} disabled={additionalCashDenominations.length === 0}>Borrar</button></div>
								<div className="cash-amounts"><span>Recibido <strong>${additionalCashReceived.toLocaleString('es-CO')}</strong></span><span className="cash-amount-change">Cambio <strong>${additionalCashChange.toLocaleString('es-CO')}</strong></span></div>
							</div>
						</> : <label htmlFor="additional-payment-amount">Monto antes de comisión<input id="additional-payment-amount" type="text" inputMode="numeric" value={formatAmount(additionalAmount)} onChange={(event) => setAdditionalAmount(event.target.value)} placeholder="Ej. 20.000" /></label>}
						<p>El método principal cubrirá <strong>${primaryBaseAmount.toLocaleString('es-CO')}</strong> antes de comisión (${primaryDue.toLocaleString('es-CO')} con comisión).</p>
					</div>}
					{methods.length === 0 && <p className="cashier-empty">No hay métodos activos. Un administrador debe crear efectivo o transferencia.</p>}
					<button className="cashier-pay-button" type="button" onClick={handlePay} disabled={!selectedMethodId}>Confirmar pago</button>
				</div>
				{splitOpen && <Dividir items={items} methods={methods} defaultMethodId={selectedMethodId} onClose={() => setSplitOpen(false)} onConfirm={handleSplitConfirm} />}
			</section>
		</div>
	);
}

export default Caja;
