import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { FaExchangeAlt, FaMoneyBillWave, FaTimes } from 'react-icons/fa';
import { db } from '../../../../server/api';
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
	const cashChange = Math.max(0, cashReceived - total);
	const cashMissing = Math.max(0, total - cashReceived);
	const isCashPayment = activeType === 'efectivo';

	function addDenomination(value) {
		const nextDenominations = [...cashDenominations, value];
		setCashDenominations(nextDenominations);
		if (useAdditionalMethod) {
			const received = nextDenominations.reduce((sum, denomination) => sum + denomination, 0);
			setAdditionalAmount(String(Math.max(0, total - received)));
		}
	}

	function clearDenominations() {
		setCashDenominations([]);
		if (useAdditionalMethod) setAdditionalAmount(String(total));
	}

	async function handlePay() {
		const method = methods.find((item) => item.id === selectedMethodId && item.tipo === activeType) || methods.find((item) => item.tipo === activeType);
		if (!method) {
			toast.warning('Selecciona un método de pago.');
			return;
		}
		const additionalMethod = methods.find((item) => item.id === additionalMethodId);
		const additionalValue = additionalMethod?.tipo === 'efectivo'
			? additionalCashDenominations.reduce((sum, value) => sum + value, 0)
			: Number(String(additionalAmount).replace(/\D/g, '')) || 0;
		const primaryValue = isCashPayment ? cashReceived : total - additionalValue;
		if (useAdditionalMethod) {
			if (!additionalMethod || additionalMethod.id === method.id || primaryValue <= 0 || additionalValue <= 0 || primaryValue + additionalValue !== total) {
				toast.warning('Indica un segundo método y un monto menor al total.');
				return;
			}
		} else if (isCashPayment && cashReceived < total) {
			toast.warning(`Faltan $${cashMissing.toLocaleString('es-CO')} para completar el pago.`);
			return;
		}
		setPaying(true);
		try {
			const allocations = useAdditionalMethod ? [
				{ methodId: method.id, amount: primaryValue, method, denominations: isCashPayment ? cashDenominations : [], received: isCashPayment ? cashReceived : 0, change: isCashPayment ? cashChange : 0 },
				{ methodId: additionalMethod.id, amount: additionalValue, method: additionalMethod, denominations: additionalMethod.tipo === 'efectivo' ? additionalCashDenominations : [], received: additionalMethod.tipo === 'efectivo' ? additionalCashDenominations.reduce((sum, value) => sum + value, 0) : 0, change: 0 },
			] : null;
			const paymentDenominations = isCashPayment
				? [...cashDenominations, ...(additionalMethod?.tipo === 'efectivo' ? additionalCashDenominations : [])]
				: additionalCashDenominations;
			const received = paymentDenominations.reduce((sum, value) => sum + value, 0);
			await onPaid(method, { denominations: paymentDenominations, received, change: useAdditionalMethod ? 0 : cashChange }, null, allocations);
		} catch (error) {
			toast.error('No se pudo registrar el pago.');
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
			toast.error('No se pudo registrar la factura parcial.');
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
			setAdditionalAmount(String(Math.max(0, total - (isCashPayment ? cashReceived : 0))));
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
					<div className="cashier-total"><span>Total a pagar</span><strong>${total.toLocaleString('es-CO')}</strong></div>
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
								<div className="cash-amounts"><span>Recibido <strong>${cashReceived.toLocaleString('es-CO')}</strong></span>{cashMissing > 0 ? <span className="cash-amount-missing">Faltan <strong>${cashMissing.toLocaleString('es-CO')}</strong></span> : <span className="cash-amount-change">Cambio <strong>${cashChange.toLocaleString('es-CO')}</strong></span>}</div>
							</div>
						</>}
						{!isCashPayment && <div className="cashier-method-list" role="list" aria-label={`Métodos de ${activeType}`}>
							{visibleMethods.map((method) => <button className={selectedMethodId === method.id ? 'cashier-method cashier-method-active' : 'cashier-method'} type="button" role="listitem" key={method.id} onClick={() => selectPrimaryMethod(method.id)}>
								<span>{method.nombre}</span>
							</button>)}
							{visibleMethods.length === 0 && <p className="cashier-empty">No hay métodos de {activeType} configurados.</p>}
						</div>}
					</div>
					{methods.length > 1 && <label className="cashier-additional-toggle"><input type="checkbox" checked={useAdditionalMethod} onChange={(event) => enableAdditionalMethod(event.target.checked)} /><span>Agregar otro método de pago para esta cuenta</span></label>}
					{useAdditionalMethod && <div className="cashier-additional-payment">
						<label htmlFor="additional-payment-method">Segundo método<select id="additional-payment-method" value={additionalMethodId} onChange={(event) => selectAdditionalMethod(event.target.value)}><option value="">Selecciona un método</option>{methods.filter((method) => method.id !== selectedMethodId).map((method) => <option key={method.id} value={method.id}>{method.nombre}</option>)}</select></label>
						{methods.find((method) => method.id === additionalMethodId)?.tipo === 'efectivo' ? <>
							<div className="cash-denomination-grid" aria-label="Denominaciones del segundo método">
								{denominations.map((denomination) => <button className="cash-denomination" type="button" key={denomination.value} onClick={() => addAdditionalCashDenomination(denomination.value)}>
									<img src={denomination.image} alt={`Billete de ${denomination.value.toLocaleString('es-CO')} pesos`} />
									<strong>${denomination.value.toLocaleString('es-CO')}</strong>
								</button>)}
							</div>
							<div className="cash-selection-summary">
								<div className="cash-selection-heading"><strong>Efectivo del segundo método</strong><button className="cash-clear-button" type="button" onClick={clearAdditionalCashDenominations} disabled={additionalCashDenominations.length === 0}>Borrar</button></div>
								<div className="cash-amounts"><span>Recibido <strong>${additionalCashDenominations.reduce((sum, value) => sum + value, 0).toLocaleString('es-CO')}</strong></span></div>
							</div>
						</> : <label htmlFor="additional-payment-amount">Monto<input id="additional-payment-amount" type="text" inputMode="numeric" value={formatAmount(additionalAmount)} onChange={(event) => setAdditionalAmount(event.target.value)} placeholder="Ej. 20.000" /></label>}
						<p>El método principal cubrirá lo que falta: <strong>${Math.max(0, isCashPayment ? cashReceived : total - (methods.find((method) => method.id === additionalMethodId)?.tipo === 'efectivo' ? additionalCashDenominations.reduce((sum, value) => sum + value, 0) : Number(String(additionalAmount).replace(/\D/g, '')) || 0)).toLocaleString('es-CO')}</strong>.</p>
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
