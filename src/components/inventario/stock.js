export function getLowStockItems(products) {
	return products.flatMap((product) => {
		const configuredThreshold = Number(product.stockMinimo ?? 5);
		const threshold = Number.isFinite(configuredThreshold) ? configuredThreshold : 5;
		const stockEntries = product.modoSabores === 'sabores'
			? (product.sabores || []).map((flavor) => ({
				flavorName: typeof flavor === 'string' ? flavor : flavor.nombre,
				stock: typeof flavor === 'string' ? undefined : flavor.stock,
			}))
			: [{ flavorName: '', stock: product.stock }];

		return stockEntries.flatMap(({ flavorName, stock }) => {
			if (stock === '' || stock === null || stock === undefined) return [];
			const quantity = Number(stock);
			if (!Number.isFinite(quantity) || quantity > threshold) return [];

			return [{
				productId: product.id,
				productName: product.nombre,
				flavorName: flavorName || '',
				stock: quantity,
				threshold,
			}];
		});
	}).sort((first, second) => first.stock - second.stock);
}
