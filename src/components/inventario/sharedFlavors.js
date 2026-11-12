export function getFlavorId(flavor) {
	return typeof flavor === 'string' ? '' : flavor?.saborId || '';
}

export function getFlavorName(flavor) {
	return typeof flavor === 'string' ? flavor : flavor?.nombre || '';
}

export function deductSharedFlavorStock(stock, quantity, flavorName) {
	const available = Number(stock);
	if (!Number.isFinite(available) || !Number.isInteger(quantity) || quantity < 0 || available < quantity) {
		throw new Error(`No hay suficientes existencias de ${flavorName || 'ese sabor'}.`);
	}
	return available - quantity;
}

export function withSharedFlavorStock(product, flavorsById) {
	if (product.modoSabores !== 'sabores') return product;

	return {
		...product,
		sabores: (product.sabores || []).map((flavor) => {
			const saborId = getFlavorId(flavor);
			const sharedFlavor = saborId ? flavorsById.get(saborId) : null;
			if (!saborId) return flavor;
			return {
				...(typeof flavor === 'string' ? {} : flavor),
				saborId,
				nombre: sharedFlavor?.nombre || getFlavorName(flavor),
				stock: Number(sharedFlavor?.stock || 0),
				stockMinimo: sharedFlavor?.stockMinimo,
			};
		}),
	};
}
