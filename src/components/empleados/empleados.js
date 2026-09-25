import { useEffect, useState } from 'react';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { FaUserCheck, FaUserSlash } from 'react-icons/fa';
import { db } from '../../server/api';
import toast from '../../resources/toast/toast';
import LoadingScreen from '../../resources/loading/LoadingScreen';
import "./empleados.css";

function Empleados({ profile }) {
	const [users, setUsers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [loadingMessage, setLoadingMessage] = useState('Cargando empleados');

	useEffect(() => {
		if (profile?.rol !== 'admin') {
			setLoading(false);
			return undefined;
		}

		let cancelled = false;
		async function loadUsers() {
			try {
				const snapshot = await getDocs(collection(db, 'usuarios'));
				if (!cancelled) setUsers(snapshot.docs.map((userDoc) => ({ id: userDoc.id, ...userDoc.data() })));
			} catch (error) {
				if (!cancelled) toast.error('No se pudieron cargar los usuarios.');
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		loadUsers();
		return () => { cancelled = true; };
	}, [profile?.rol]);

	async function toggleUserStatus(user) {
		const nextStatus = user.activo === false;
		setLoadingMessage(nextStatus ? 'Activando usuario' : 'Desactivando usuario');
		setLoading(true);
		try {
			await updateDoc(doc(db, 'usuarios', user.id), { activo: nextStatus });
			setUsers((currentUsers) => currentUsers.map((item) => item.id === user.id ? { ...item, activo: nextStatus } : item));
			toast.success(`Usuario ${nextStatus ? 'activado' : 'desactivado'}.`);
		} catch (error) {
			toast.error('No se pudo cambiar el estado del usuario.');
		} finally {
			setLoading(false);
		}
	}

	if (profile?.rol !== 'admin') {
		return (
			<section className="employees-access-denied" aria-labelledby="employees-denied-title">
				<p className="app-eyebrow">Acceso restringido</p>
				<h1 id="employees-denied-title">No tienes acceso a este apartado</h1>
				<p>Solo un administrador puede consultar y gestionar los usuarios registrados.</p>
			</section>
		);
	}

	if (loading) return <LoadingScreen text={loadingMessage} />;

	return (
		<section className="employees-page" aria-labelledby="employees-title">
			<header className="app-content-header">
				<p className="app-eyebrow">Equipo de trabajo</p>
				<h1 id="employees-title">Empleados</h1>
				<p className="app-intro">Administra los miembros del equipo de tu cafetería.</p>
			</header>
			<div className="employees-table-wrapper">
					<table className="employees-table">
						<thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acción</th></tr></thead>
						<tbody>
							{users.map((user) => {
								const isActive = user.activo !== false;
								return <tr key={user.id}>
									<td>{user.nombre} {user.apellido}</td><td>{user.correo}</td><td>{user.rol}</td>
									<td><span className={`employee-status ${isActive ? 'employee-status-active' : 'employee-status-inactive'}`}>{isActive ? 'Activo' : 'Desactivado'}</span></td>
									<td><button className="employee-status-button" type="button" onClick={() => toggleUserStatus(user)}>{isActive ? <FaUserSlash /> : <FaUserCheck />}<span>{isActive ? 'Desactivar' : 'Activar'}</span></button></td>
								</tr>;
							})}
						</tbody>
					</table>
				</div>
		</section>
	);
}

export default Empleados;
