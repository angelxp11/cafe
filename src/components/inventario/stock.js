export function getLowStockItems(products) {
	const sharedFlavorsSeen = new Set();
	return products.flatMap((product) => {
		if (product.enReversa === true) return [];
		const configuredThreshold = Number(product.stockMinimo ?? 5);
		const threshold = Number.isFinite(configuredThreshold) ? configuredThreshold : 5;
		const stockEntries = product.modoSabores === 'sabores'
			? (product.sabores || []).map((flavor) => ({
				flavorName: typeof flavor === 'string' ? flavor : flavor.nombre,
				stock: typeof flavor === 'string' ? undefined : flavor.stock,
				flavorId: typeof flavor === 'string' ? '' : flavor.saborId || '',
				flavorThreshold: typeof flavor === 'string' ? undefined : flavor.stockMinimo,
			}))
			: [{ flavorName: '', stock: product.stock, flavorId: '', flavorThreshold: undefined }];

		return stockEntries.flatMap(({ flavorName, stock, flavorId, flavorThreshold }) => {
			if (flavorId && sharedFlavorsSeen.has(flavorId)) return [];
			if (flavorId) sharedFlavorsSeen.add(flavorId);
			if (stock === '' || stock === null || stock === undefined) return [];
			const quantity = Number(stock);
			const configuredFlavorThreshold = Number(flavorThreshold ?? threshold);
			const itemThreshold = Number.isFinite(configuredFlavorThreshold) ? configuredFlavorThreshold : threshold;
			if (!Number.isFinite(quantity) || quantity > itemThreshold) return [];

			return [{
				productId: product.id,
				productName: product.nombre,
				flavorName: flavorName || '',
				stock: quantity,
				threshold: itemThreshold,
			}];
		});
	}).sort((first, second) => first.stock - second.stock);
}
