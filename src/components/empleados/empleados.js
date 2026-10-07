import { useEffect, useState } from 'react';
import { collection, onSnapshot, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { FaTrash, FaUserCheck, FaUserSlash } from 'react-icons/fa';
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
		const unsubscribe = onSnapshot(collection(db, 'usuarios'), (snapshot) => {
			if (cancelled) return;
			setUsers(snapshot.docs.map((userDoc) => ({ id: userDoc.id, ...userDoc.data() })));
			setLoading(false);
		}, () => {
			if (cancelled) return;
			toast.error('No se pudieron cargar los usuarios.');
			setLoading(false);
		});
		return () => {
			cancelled = true;
			unsubscribe();
		};
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

	async function changeUserRole(user, role) {
		setLoadingMessage('Actualizando rol');
		setLoading(true);
		try {
			await updateDoc(doc(db, 'usuarios', user.id), { rol: role });
			toast.success('Rol actualizado.');
		} catch (error) {
			toast.error('No se pudo cambiar el rol del usuario.');
		} finally {
			setLoading(false);
		}
	}

	async function deleteEmployee(user) {
		if (user.rol !== 'empleado' || user.id === profile.correo) return;
		if (!window.confirm(`¿Eliminar permanentemente a ${user.nombre} ${user.apellido} de la base de datos?`)) return;
		setLoadingMessage('Eliminando empleado');
		setLoading(true);
		try {
			await deleteDoc(doc(db, 'usuarios', user.id));
			toast.success('Empleado eliminado de la base de datos.');
		} catch (error) {
			toast.error('No se pudo eliminar el empleado. Comprueba que tienes permisos de administrador e inténtalo de nuevo.');
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
						<thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
						<tbody>
							{users.map((user) => {
								const isActive = user.activo !== false;
								return <tr key={user.id}>
									<td>{user.nombre} {user.apellido}</td><td>{user.correo}</td>
									<td>
										<select
											className="employee-role-select"
											aria-label={`Rol de ${user.nombre} ${user.apellido}`}
											value={user.rol}
											disabled={user.id === profile.correo}
											onChange={(event) => changeUserRole(user, event.target.value)}
										>
											<option value="empleado">Empleado</option>
											<option value="admin">Administrador</option>
										</select>
									</td>
									<td><span className={`employee-status ${isActive ? 'employee-status-active' : 'employee-status-inactive'}`}>{isActive ? 'Activo' : 'Desactivado'}</span></td>
									<td className="employee-actions">
										<button className="employee-status-button" type="button" onClick={() => toggleUserStatus(user)}>{isActive ? <FaUserSlash /> : <FaUserCheck />}<span>{isActive ? 'Desactivar' : 'Activar'}</span></button>
										{user.rol === 'empleado' && user.id !== profile.correo && <button className="employee-delete-button" type="button" aria-label={`Eliminar ${user.nombre} ${user.apellido}`} onClick={() => deleteEmployee(user)}><FaTrash /><span>Eliminar</span></button>}
									</td>
								</tr>;
							})}
						</tbody>
					</table>
				</div>
		</section>
	);
}

export default Empleados;
