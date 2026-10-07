import { getLowStockItems } from './stock';

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
