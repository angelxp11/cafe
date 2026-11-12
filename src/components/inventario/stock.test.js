import { getLowStockItems } from './stock';
import { deductSharedFlavorStock, withSharedFlavorStock } from './sharedFlavors';

test('includes general products and flavors at or below their configured threshold', () => {
	const lowStockItems = getLowStockItems([
		{ id: 'coffee', nombre: 'CAFÉ', stock: 3, stockMinimo: 5 },
		{
			id: 'syrup',
			nombre: 'SABORES',
			modoSabores: 'sabores',
			stockMinimo: 4,
			sabores: [{ nombre: 'VAINILLA', stock: 4 }, { nombre: 'CARAMELO', stock: 8 }],
		},
	]);

	expect(lowStockItems).toEqual([
		{ productId: 'coffee', productName: 'CAFÉ', flavorName: '', stock: 3, threshold: 5 },
		{ productId: 'syrup', productName: 'SABORES', flavorName: 'VAINILLA', stock: 4, threshold: 4 },
	]);
});

test('uses the default threshold for older products and ignores unknown stock values', () => {
	expect(getLowStockItems([
		{ id: 'old', nombre: 'ANTIGUO', stock: 5 },
		{ id: 'unknown', nombre: 'DESCONOCIDO', stock: '' },
		{ id: 'string-flavor', nombre: 'SABOR', modoSabores: 'sabores', sabores: ['VAINILLA'] },
	])).toEqual([
		{ productId: 'old', productName: 'ANTIGUO', flavorName: '', stock: 5, threshold: 5 },
	]);
});

test('does not report reverse-inventory products as low stock', () => {
	expect(getLowStockItems([
		{ id: 'prepared', nombre: 'PREPARADO', stock: 0, stockMinimo: 5, enReversa: true },
		{ id: 'regular', nombre: 'NORMAL', stock: 0, stockMinimo: 5 },
	])).toEqual([
		{ productId: 'regular', productName: 'NORMAL', flavorName: '', stock: 0, threshold: 5 },
	]);
});

test('uses the single shared flavor stock for every related product', () => {
	const sharedFlavors = new Map([['vanilla-id', { nombre: 'VAINILLA', stock: 11, stockMinimo: 3 }]]);
	const products = [
		{ id: 'coffee', nombre: 'CAFÉ', modoSabores: 'sabores', sabores: [{ saborId: 'vanilla-id', nombre: 'VAINILLA' }] },
		{ id: 'milkshake', nombre: 'MALTEADA', modoSabores: 'sabores', sabores: [{ saborId: 'vanilla-id', nombre: 'VAINILLA' }] },
	].map((product) => withSharedFlavorStock(product, sharedFlavors));

	expect(products.map((product) => product.sabores[0].stock)).toEqual([11, 11]);
	expect(getLowStockItems(products)).toEqual([]);
});

test('reports shared stock only once when it is below the shared threshold', () => {
	const sharedFlavors = new Map([['vanilla-id', { nombre: 'VAINILLA', stock: 2, stockMinimo: 3 }]]);
	const products = [
		{ id: 'coffee', nombre: 'CAFÉ', modoSabores: 'sabores', sabores: [{ saborId: 'vanilla-id', nombre: 'VAINILLA' }] },
		{ id: 'milkshake', nombre: 'MALTEADA', modoSabores: 'sabores', sabores: [{ saborId: 'vanilla-id', nombre: 'VAINILLA' }] },
	].map((product) => withSharedFlavorStock(product, sharedFlavors));

	expect(getLowStockItems(products)).toEqual([
		{ productId: 'coffee', productName: 'CAFÉ', flavorName: 'VAINILLA', stock: 2, threshold: 3 },
	]);
});

test('prevents linked products from consuming more than the shared flavor stock', () => {
	const stockAfterFirstProduct = deductSharedFlavorStock(11, 11, 'VAINILLA');

	expect(stockAfterFirstProduct).toBe(0);
	expect(() => deductSharedFlavorStock(stockAfterFirstProduct, 1, 'VAINILLA')).toThrow('No hay suficientes existencias de VAINILLA.');
});
