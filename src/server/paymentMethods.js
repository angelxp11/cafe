export function globalBalance(method) {
	return Number(method?.saldoGlobal ?? method?.saldo ?? 0);
}

export function shiftBalance(method) {
	return Number(method?.saldoTurno ?? 0);
}

export function formatThousandsInput(value) {
	const digits = String(value ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
	return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function methodBalanceUpdate(method, saldoGlobal, saldoTurno) {
	return {
		saldoGlobal: Number(saldoGlobal || 0),
		saldoTurno: Number(saldoTurno || 0),
	};
}

export function paymentCommission(amount, percentage) {
	const baseAmount = Math.max(0, Number(amount) || 0);
	const rate = Math.min(100, Math.max(0, Number(percentage) || 0));
	const roundedTotal = Math.round((baseAmount + baseAmount * rate / 100) / 10) * 10;
	return roundedTotal - baseAmount;
}

export function amountWithCommission(amount, percentage) {
	const baseAmount = Math.max(0, Number(amount) || 0);
	return baseAmount + paymentCommission(baseAmount, percentage);
}

export function amountBeforeCommission(total, percentage) {
	const grossAmount = Math.max(0, Math.floor(Number(total) || 0));
	let low = 0;
	let high = grossAmount;
	while (low < high) {
		const middle = Math.ceil((low + high) / 2);
		if (amountWithCommission(middle, percentage) <= grossAmount) low = middle;
		else high = middle - 1;
	}
	return low;
}

export function amountCoveredByPayment(received, maximumBaseAmount, percentage) {
	const maximumBase = Math.max(0, Math.floor(Number(maximumBaseAmount) || 0));
	if (amountWithCommission(maximumBase, percentage) <= Number(received || 0)) return maximumBase;
	return Math.min(maximumBase, amountBeforeCommission(received, percentage));
}
