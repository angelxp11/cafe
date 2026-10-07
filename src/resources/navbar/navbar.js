import { useEffect, useState } from 'react';
import { FaAddressBook, FaBoxOpen, FaCashRegister, FaChair, FaCoffee, FaCreditCard, FaFileInvoiceDollar, FaHome, FaShoppingCart, FaSignOutAlt, FaUserTie } from 'react-icons/fa';
import { signOut } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../server/api';
import { getLowStockItems } from '../../components/inventario/stock';
import toast from '../toast/toast';

function CoffeeIcon() {
	return <FaCoffee className="sidebar-coffee-icon" aria-hidden="true" />;
}

const navigationItems = [
	{ id: 'Inicio', label: 'Inicio', icon: 'home' },
	{ id: 'Inventario', label: 'Inventario', icon: 'inventory' },
	{ id: 'Abastecimiento', label: 'Abastecimiento', icon: 'supply' },
	{ id: 'Empleados', label: 'Empleados', icon: 'employees' },
	{ id: 'Turno', label: 'Turno', icon: 'shift' },
	{ id: 'Clientes', label: 'Clientes', icon: 'customers' },
	{ id: 'Mesas', label: 'Mesas', icon: 'tables' },
	{ id: 'Facturas', label: 'Facturas', icon: 'invoices' },
	{ id: 'Métodos de pago', label: 'Métodos de pago', icon: 'payments' },
];

const iconByType = {
	home: FaHome,
	inventory: FaBoxOpen,
	supply: FaShoppingCart,
	employees: FaUserTie,
	shift: FaCashRegister,
	tables: FaChair,
	invoices: FaFileInvoiceDollar,
	customers: FaAddressBook,
	payments: FaCreditCard,
};

function NavigationIcon({ type }) {
	const Icon = iconByType[type] || FaHome;
	return <Icon className="sidebar-link-icon" aria-hidden="true" />;
}

function toDate(value) {
	return value?.toDate ? value.toDate() : value ? new Date(value) : null;
}

function Navbar({ profile, activeSection, onSelect }) {
	const [isOpen, setIsOpen] = useState(false);
	const [invoices, setInvoices] = useState([]);
	const [lowStockCount, setLowStockCount] = useState(0);
	const adminOnlySections = ['Inventario', 'Empleados', 'Métodos de pago'];
	const visibleNavigationItems = navigationItems.filter((item) => !adminOnlySections.includes(item.id) || profile?.rol === 'admin');
	const readAt = toDate(profile?.facturasLeidasEn);
	const today = new Date();
	const todayInvoiceCount = invoices.filter((invoice) => {
		const date = toDate(invoice.pagadoEn);
		const isToday = date && date.getFullYear() === today.getFullYear()
			&& date.getMonth() === today.getMonth()
			&& date.getDate() === today.getDate();
		return isToday && (!readAt || date > readAt);
	}).length;

	useEffect(() => {
		const unsubscribeInvoices = onSnapshot(collection(db, 'facturas'), (snapshot) => {
			setInvoices(snapshot.docs.map((item) => item.data()));
		}, () => toast.error('No se pudieron cargar las notificaciones de facturas.'));
		const unsubscribeInventory = onSnapshot(collection(db, 'inventario'), (snapshot) => {
			setLowStockCount(getLowStockItems(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))).length);
		}, () => toast.error('No se pudieron cargar las notificaciones de inventario.'));
		return () => {
			unsubscribeInvoices();
			unsubscribeInventory();
		};
	}, []);

	function closeNavbar() {
		setIsOpen(false);
	}

	function toggleNavbar() {
		setIsOpen((open) => !open);
	}

	function selectSection(section) {
		onSelect(section);
		closeNavbar();
	}

	async function handleSignOut() {
		try {
			await signOut(auth);
			closeNavbar();
			toast.success('Sesión cerrada correctamente.');
		} catch (error) {
			toast.error('No se pudo cerrar la sesión.');
		}
	}

	return (
		<>
			{isOpen && (
				<button
					className="sidebar-overlay"
					type="button"
					aria-label="Cerrar navegación"
					onClick={closeNavbar}
				/>
			)}

			{/* Un único elemento: hace de rail cuando está colapsado
			    y de sidebar completo cuando está abierto. Ya no hay
			    un segundo nav superpuesto. */}
			<aside
				className={`sidebar${isOpen ? ' sidebar-open' : ''}`}
				aria-label="Navegación principal"
			>
				<button
					className="sidebar-brand"
					type="button"
					aria-label={isOpen ? 'Colapsar navegación' : 'Expandir navegación'}
					aria-expanded={isOpen}
					onClick={toggleNavbar}
				>
					<CoffeeIcon />
					<span className="sidebar-brand-name">Café</span>
				</button>

				<nav className="sidebar-navigation" aria-label="Secciones">
					{visibleNavigationItems.map((item) => (
						<button
							key={item.id}
							className={`sidebar-link${activeSection === item.id ? ' sidebar-link-active' : ''}`}
							type="button"
							title={item.label}
							aria-label={item.label}
							aria-current={activeSection === item.id ? 'page' : undefined}
							onClick={() => selectSection(item.id)}
						>
							<NavigationIcon type={item.icon} />
							<span>{item.label}</span>
							{item.id === 'Facturas' && activeSection !== 'Facturas' && todayInvoiceCount > 0 && <small className="sidebar-link-badge" title={`${todayInvoiceCount} facturas sin leer`}>{todayInvoiceCount}</small>}
							{item.id === 'Inventario' && lowStockCount > 0 && <small className="sidebar-link-badge" title={`${lowStockCount} productos o sabores con stock bajo`}>{lowStockCount}</small>}
						</button>
					))}
				</nav>
				<button className="sidebar-link sidebar-logout" type="button" onClick={handleSignOut}>
					<FaSignOutAlt className="sidebar-link-icon" aria-hidden="true" />
					<span>Cerrar sesión</span>
				</button>
			</aside>
		</>
	);
}

export default Navbar;