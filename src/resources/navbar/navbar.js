import { useEffect, useState } from 'react';
import { FaBoxes, FaClock, FaCoffee, FaFileInvoiceDollar, FaHome, FaMoneyBillWave, FaSignOutAlt, FaTable, FaUserFriends, FaUsers } from 'react-icons/fa';
import { signOut } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../server/api';
import toast from '../toast/toast';

function CoffeeIcon() {
	return <FaCoffee className="sidebar-coffee-icon" aria-hidden="true" />;
}

const navigationItems = [
	{ id: 'Inicio', label: 'Inicio', icon: 'home' },
	{ id: 'Inventario', label: 'Inventario', icon: 'inventory' },
	{ id: 'Empleados', label: 'Empleados', icon: 'employees' },
	{ id: 'Turno', label: 'Turno', icon: 'shift' },
	{ id: 'Clientes', label: 'Clientes', icon: 'customers' },
	{ id: 'Mesas', label: 'Mesas', icon: 'tables' },
	{ id: 'Facturas', label: 'Facturas', icon: 'invoices' },
	{ id: 'Métodos de pago', label: 'Métodos de pago', icon: 'payments' },
];

const iconByType = {
	home: FaHome,
	inventory: FaBoxes,
	employees: FaUsers,
	shift: FaClock,
	tables: FaTable,
	invoices: FaFileInvoiceDollar,
	customers: FaUserFriends,
	payments: FaMoneyBillWave,
};

function NavigationIcon({ type }) {
	const Icon = iconByType[type] || FaHome;
	return <Icon className="sidebar-link-icon" aria-hidden="true" />;
}

function Navbar({ profile, activeSection, onSelect }) {
	const [isOpen, setIsOpen] = useState(false);
	const [todayInvoiceCount, setTodayInvoiceCount] = useState(0);
	const visibleNavigationItems = navigationItems.filter((item) => item.id !== 'Métodos de pago' || profile?.rol === 'admin');

	useEffect(() => onSnapshot(collection(db, 'facturas'), (snapshot) => {
		const now = new Date();
		const today = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
		setTodayInvoiceCount(snapshot.docs.filter((item) => {
			const timestamp = item.data().pagadoEn;
			const date = timestamp?.toDate ? timestamp.toDate() : null;
			return date && `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` === today;
		}).length);
	}), []);

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
							aria-current={activeSection === item.id ? 'page' : undefined}
							onClick={() => selectSection(item.id)}
						>
							<NavigationIcon type={item.icon} />
							<span>{item.label}</span>
							{item.id === 'Facturas' && todayInvoiceCount > 0 && <small className="sidebar-link-badge" title={`${todayInvoiceCount} facturas hoy`}>{todayInvoiceCount}</small>}
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