import { useState } from 'react';
import { FaMinus, FaPlus, FaTimes } from 'react-icons/fa';
import toast from '../../../../../resources/toast/toast';
import './dividir.css';

import denomination50 from '../../../../../resources/denominaciones/50.svg';
import denomination100 from '../../../../../resources/denominaciones/100.svg';
import denomination200 from '../../../../../resources/denominaciones/200.svg';
import denomination500 from '../../../../../resources/denominaciones/500.svg';
import denomination1000 from '../../../../../resources/denominaciones/1000.svg';
import denomination2000 from '../../../../../resources/denominaciones/2000.svg';
import denomination5000 from '../../../../../resources/denominaciones/5000.svg';
import denomination10000 from '../../../../../resources/denominaciones/10000.svg';
import denomination20000 from '../../../../../resources/denominaciones/20000.svg';
import denomination50000 from '../../../../../resources/denominaciones/50000.svg';
import denomination100000 from '../../../../../resources/denominaciones/100000.svg';

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

function formatAmount(value) {
	const digits = String(value ?? '').replace(/\D/g, '');
	return digits ? Number(digits).toLocaleString('es-CO') : '';
}

function numericAmount(value) {
	return Number(String(value ?? '').replace(/\D/g, '')) || 0;
}

function Dividir({ items, methods, defaultMethodId, onClose, onConfirm }) {
	const [quantities, setQuantities] = useState({});
	const [allocations, setAllocations] = useState([{ methodId: defaultMethodId || methods[0]?.id || '', amount: '', denominations: [] }]);
	const [confirming, setConfirming] = useState(false);
	const selectedItems = items
		.map((item) => ({ ...item, cantidad: quantities[item.lineId] || 0 }))
		.filter((item) => item.cantidad > 0);
	const subtotal = selectedItems.reduce((sum, item) => sum + Number(item.precioUnidad || 0) * item.cantidad, 0);
	const paymentRows = allocations.map((allocation, index) => {
		const method = methods.find((item) => item.id === allocation.methodId);
		const isCash = method?.tipo === 'efectivo';
		const received = (allocation.denominations || []).reduce((sum, value) => sum + value, 0);
		const inputValue = !allocation.amount && allocations.length === 1 ? String(subtotal) : allocation.amount;
		return { allocation, index, method, isCash, received, inputValue, amount: isCash ? received : numericAmount(inputValue) };
	});
	const nonCashTotal = paymentRows.reduce((sum, row) => sum + (row.isCash ? 0 : row.amount), 0);
	let remainingCashAmount = Math.max(0, subtotal - nonCashTotal);
	const paymentRowsWithAmounts = paymentRows.map((row) => {
		if (!row.isCash) return { ...row, change: 0 };
		const amount = Math.min(row.received, remainingCashAmount);
		remainingCashAmount -= amount;
		return { ...row, amount, change: row.received - amount };
	});
	const allocatedTotal = paymentRowsWithAmounts.reduce((sum, row) => sum + row.amount, 0);
	const cashReceived = paymentRowsWithAmounts.reduce((sum, row) => sum + (row.isCash ? row.received : 0), 0);
	const cashChange = paymentRowsWithAmounts.reduce((sum, row) => sum + row.change, 0);
	const pendingAmount = subtotal - allocatedTotal;

	function changeQuantity(item, amount) {
		setQuantities((current) => {
			const nextQuantity = Math.max(0, Math.min(item.cantidad, (current[item.lineId] || 0) + amount));
			return { ...current, [item.lineId]: nextQuantity };
		});
	}

	function updateAllocation(index, field, value) {
		setAllocations((current) => current.map((allocation, allocationIndex) => allocationIndex === index ? { ...allocation, [field]: value } : allocation));
	}

	function changeAllocationMethod(index, methodId) {
		setAllocations((current) => current.map((allocation, allocationIndex) => allocationIndex === index ? { ...allocation, methodId, amount: '', denominations: [] } : allocation));
	}

	function addAllocationDenomination(index, value) {
		setAllocations((current) => current.map((allocation, allocationIndex) => allocationIndex === index ? { ...allocation, denominations: [...(allocation.denominations || []), value] } : allocation));
	}

	function clearAllocationDenominations(index) {
		setAllocations((current) => current.map((allocation, allocationIndex) => allocationIndex === index ? { ...allocation, denominations: [] } : allocation));
	}

	function addAllocation() {
		const nextMethod = methods.find((method) => !allocations.some((allocation) => allocation.methodId === method.id));
		if (nextMethod) setAllocations((current) => [
			...current.map((allocation) => {
				const method = methods.find((item) => item.id === allocation.methodId);
				return method?.tipo !== 'efectivo' && !allocation.amount ? { ...allocation, amount: String(subtotal) } : allocation;
			}),
			{ methodId: nextMethod.id, amount: '', denominations: [] },
		]);
	}

	function removeAllocation(indexToRemove) {
		setAllocations((current) => current.filter((_, index) => index !== indexToRemove));
	}

	async function confirmSplit() {
		if (!selectedItems.length || confirming) return;
		const methodIds = allocations.map((allocation) => allocation.methodId);
		if (allocations.some((allocation, index) => !allocation.methodId || methodIds.indexOf(allocation.methodId) !== index || paymentRowsWithAmounts[index].amount <= 0 || (paymentRowsWithAmounts[index].isCash && paymentRowsWithAmounts[index].received <= 0)) || allocatedTotal !== subtotal) {
			toast.warning('Distribuye el total exacto entre los métodos de pago.');
			return;
		}
		setConfirming(true);
		try {
			const paidAllocations = paymentRowsWithAmounts.map((row) => ({
				...row.allocation,
				amount: row.amount,
				received: row.received,
				change: row.change,
				method: row.method,
			}));
			const cashAllocations = paymentRowsWithAmounts.filter((row) => row.isCash);
			await onConfirm(selectedItems, paidAllocations, {
				received: cashReceived,
				change: cashChange,
				denominations: cashAllocations.flatMap((row) => row.allocation.denominations || []),
			});
		} catch (error) {
			setConfirming(false);
		}
	}

	return (
		<div className="split-backdrop" role="presentation">
			<section className="split-modal" role="dialog" aria-modal="true" aria-labelledby="split-title">
				<header className="split-header">
					<div><p className="app-eyebrow">Factura parcial</p><h2 id="split-title">Dividir cuenta</h2></div>
					<button className="split-close" type="button" aria-label="Cerrar división de cuenta" onClick={onClose} disabled={confirming}><FaTimes /></button>
				</header>
				<div className="split-content">
					<p className="split-method">Distribuye el pago entre efectivo, transferencia u otros métodos configurados.</p>
					<div className="split-items">
						{items.map((item) => <article className="split-item" key={item.lineId}>
							<div><strong>{item.nombre}</strong><small>${Number(item.precioUnidad || 0).toLocaleString('es-CO')} cada uno, disponibles: {item.cantidad}</small></div>
							<div className="split-quantity"><button type="button" aria-label={`Quitar ${item.nombre}`} onClick={() => changeQuantity(item, -1)} disabled={!quantities[item.lineId]}><FaMinus /></button><span>{quantities[item.lineId] || 0}</span><button type="button" aria-label={`Agregar ${item.nombre}`} onClick={() => changeQuantity(item, 1)} disabled={(quantities[item.lineId] || 0) >= item.cantidad}><FaPlus /></button></div>
						</article>)}
					</div>
					<div className="split-total"><span>Total de esta factura</span><strong>${subtotal.toLocaleString('es-CO')}</strong></div>
					<div className="split-payments-heading"><strong>¿Cómo pagará esta factura?</strong><button type="button" onClick={addAllocation} disabled={allocations.length >= methods.length}>+ Otro método</button></div>
					<div className="split-payments">
						{paymentRowsWithAmounts.map((row) => { const { allocation, index, isCash } = row; return <div className="split-payment-row" key={index}>
							<div className="split-payment-fields"><select aria-label={`Método de pago ${index + 1}`} value={allocation.methodId} onChange={(event) => changeAllocationMethod(index, event.target.value)}>{methods.map((methodOption) => <option key={methodOption.id} value={methodOption.id} disabled={allocations.some((other, otherIndex) => otherIndex !== index && other.methodId === methodOption.id)}>{methodOption.nombre}</option>)}</select>{isCash ? <><div className="split-denomination-grid">{denominations.map((denomination) => <button className="split-denomination" type="button" key={denomination.value} onClick={() => addAllocationDenomination(index, denomination.value)}><img src={denomination.image} alt={`Billete de ${denomination.value.toLocaleString('es-CO')} pesos`} /><strong>${denomination.value.toLocaleString('es-CO')}</strong></button>)}</div><div className="split-cash-total"><span>Recibido <strong>${row.received.toLocaleString('es-CO')}</strong> · Cambio <strong>${row.change.toLocaleString('es-CO')}</strong></span><button type="button" onClick={() => clearAllocationDenominations(index)} disabled={!allocation.denominations?.length}>Borrar</button></div></> : <input aria-label={`Monto del método ${index + 1}`} type="text" inputMode="numeric" value={formatAmount(row.inputValue)} onChange={(event) => updateAllocation(index, 'amount', event.target.value)} placeholder="Monto" />}</div>
							{allocations.length > 1 && <button type="button" aria-label="Quitar método de pago" onClick={() => removeAllocation(index)}><FaTimes /></button>}
						</div>; })}
					</div>
					<div className={pendingAmount === 0 ? 'split-payment-status split-payment-complete' : 'split-payment-status'}>{pendingAmount > 0 ? `Faltan $${pendingAmount.toLocaleString('es-CO')}` : pendingAmount < 0 ? `Excede por $${Math.abs(pendingAmount).toLocaleString('es-CO')}` : 'Pago distribuido correctamente'}</div>
					<button className="split-confirm" type="button" onClick={confirmSplit} disabled={!selectedItems.length || confirming}>{confirming ? 'Registrando pago...' : 'Confirmar pago parcial'}</button>
				</div>
			</section>
		</div>
	);
}

export default Dividir;
