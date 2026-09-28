import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../server/api';
import './homepage.css';

function formatShiftDuration(startValue, now) {
	const startedAt = startValue?.toDate ? startValue.toDate().getTime() : startValue ? new Date(startValue).getTime() : null;
	if (!startedAt || Number.isNaN(startedAt)) return 'Duración pendiente';

	const totalMinutes = Math.max(0, Math.floor((now - startedAt) / 60000));
	const days = Math.floor(totalMinutes / 1440);
	const hours = Math.floor((totalMinutes % 1440) / 60);
	const minutes = totalMinutes % 60;
	return [days && `${days} d`, hours && `${hours} h`, `${minutes} min`].filter(Boolean).join(' ');
}

function Homepage({ profile }) {
	const fullName = [profile?.nombre, profile?.apellido].filter(Boolean).join(' ');
	const userName = fullName || profile?.correo || 'Usuario no identificado';
	const roleLabel = profile?.rol === 'admin' ? 'Administrador' : profile?.rol === 'empleado' ? 'Empleado' : profile?.rol || 'Rol no asignado';
	const [activeShift, setActiveShift] = useState(null);
	const [shiftLoading, setShiftLoading] = useState(true);
	const [occupiedTableCount, setOccupiedTableCount] = useState(0);
	const [tablesStatus, setTablesStatus] = useState('loading');
	const [now, setNow] = useState(Date.now());

	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 30000);
		return () => window.clearInterval(timer);
	}, []);

	useEffect(() => {
		let stopShift = () => {};
		const stopCurrentShift = onSnapshot(doc(db, 'configuracion', 'turnoActual'), (snapshot) => {
			stopShift();
			const pointer = snapshot.exists() ? snapshot.data() : null;
			if (!pointer?.abierto || !pointer.turnoId) {
				setActiveShift(null);
				setShiftLoading(false);
				return;
			}

			setShiftLoading(true);
			stopShift = onSnapshot(doc(db, 'turnos', pointer.turnoId), (shiftSnapshot) => {
				setActiveShift(shiftSnapshot.exists() ? { id: shiftSnapshot.id, ...shiftSnapshot.data() } : null);
				setShiftLoading(false);
			}, () => {
				setActiveShift(null);
				setShiftLoading(false);
			});
		}, () => setShiftLoading(false));
		const stopTables = onSnapshot(collection(db, 'mesas'), (snapshot) => {
			const occupiedGroups = new Set();
			snapshot.docs.forEach((item) => {
				const table = item.data();
				if ((table.pedido || []).some((product) => Number(product.cantidad ?? 1) > 0)) occupiedGroups.add(table.grupoId || item.id);
			});
			setOccupiedTableCount(occupiedGroups.size);
			setTablesStatus('ready');
		}, () => setTablesStatus('error'));

		return () => {
			stopCurrentShift();
			stopShift();
			stopTables();
		};
	}, []);

	const shiftIsOpen = activeShift?.abierto === true;
	const shiftLeader = shiftIsOpen ? activeShift.apertura?.empleadoNombre || 'Responsable no registrado' : 'Sin turno abierto';
	const shiftTime = shiftLoading ? 'Consultando turno...' : shiftIsOpen ? formatShiftDuration(activeShift.inicioEn, now) : 'Sin turno abierto';
	const occupiedTables = tablesStatus === 'loading' ? 'Consultando...' : tablesStatus === 'error' ? 'No disponible' : occupiedTableCount;

	return (
		<>
			<header className="app-content-header">
				<p className="app-eyebrow">Panel principal</p>
				<h1>Inicio</h1>
				<p className="app-intro">Gestiona tu cafetería desde un solo lugar.</p>
			</header>
			<section className="app-welcome" aria-labelledby="welcome-title">
				<span className="app-welcome-mark" aria-hidden="true" />
				<div>
					<p className="app-eyebrow">Bienvenido</p>
					<h2 id="welcome-title">Bienvenido, {fullName || 'a tu café'}</h2>
				</div>
			</section>
			<section className="homepage-overview" aria-label="Resumen actual">
				<div className="homepage-overview-item"><span>Encargado</span><strong>{userName}</strong><small>Rol: {roleLabel}</small></div>
				<div className="homepage-overview-item"><span>Responsable del turno</span><strong>{shiftLeader}</strong><small>Tiempo en turno: {shiftTime}</small></div>
				<div className="homepage-overview-item"><span>Mesas con clientes</span><strong>{occupiedTables}</strong><small>Mesas con productos en el pedido</small></div>
			</section>
		</>
	);
}

export default Homepage;
