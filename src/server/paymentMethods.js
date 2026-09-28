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
