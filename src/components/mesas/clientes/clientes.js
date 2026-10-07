import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { FaEdit, FaPlus, FaTrash, FaUserFriends } from 'react-icons/fa';
import { auth, db } from '../../../server/api';
import LoadingScreen from '../../../resources/loading/LoadingScreen';
import toast from '../../../resources/toast/toast';
import CuentaDelCliente from './credito/cuentadelcliente';
import './clientes.css';

function formatMoney(value) {
	return `$${Number(value || 0).toLocaleString('es-CO')}`;
}

function Clientes({ profile }) {
	const [clients, setClients] = useState([]);
	const [customerAccounts, setCustomerAccounts] = useState([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [search, setSearch] = useState('');
	const [formOpen, setFormOpen] = useState(false);
	const [editingClient, setEditingClient] = useState(null);
	const [name, setName] = useState('');
	const [phone, setPhone] = useState('');
	const [selectedClient, setSelectedClient] = useState(null);
	const isAdmin = profile?.rol === 'admin';

	useEffect(() => {
		const stopClients = onSnapshot(collection(db, 'clientes'), (snapshot) => {
			setClients(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((first, second) => first.nombre.localeCompare(second.nombre, 'es')));
			setLoading(false);
		}, () => {
			toast.error('No se pudieron cargar los clientes.');
			setLoading(false);
		});
		const stopAccounts = onSnapshot(collection(db, 'cuentasCliente'), (snapshot) => setCustomerAccounts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))));
		return () => {
			stopClients();
			stopAccounts();
		};
	}, []);

	const filteredClients = useMemo(() => clients.filter((client) => `${client.nombre} ${client.telefono}`.toLocaleLowerCase('es-CO').includes(search.trim().toLocaleLowerCase('es-CO'))), [clients, search]);

	function resetForm() {
		setName('');
		setPhone('');
		setEditingClient(null);
		setFormOpen(false);
	}

	function openEdit(client) {
		setEditingClient(client);
		setName(client.nombre || '');
		setPhone(client.telefono || '');
		setFormOpen(true);
	}

	async function saveClient(event) {
		event.preventDefault();
		const normalizedName = name.trim().replace(/\s+/g, ' ');
		const normalizedPhone = phone.trim();
		if (!normalizedName || !normalizedPhone) {
			toast.warning('Escribe el nombre completo y el teléfono.');
			return;
		}
		setSaving(true);
		try {
			const data = { nombre: normalizedName, telefono: normalizedPhone, actualizadoEn: serverTimestamp() };
			if (editingClient) {
				await updateDoc(doc(db, 'clientes', editingClient.id), data);
				setSelectedClient((current) => current?.id === editingClient.id ? { ...current, ...data } : current);
				toast.success('Cliente actualizado.');
			} else {
				await addDoc(collection(db, 'clientes'), { ...data, creadoEn: serverTimestamp(), creadoPor: auth.currentUser?.email || '' });
				toast.success('Cliente creado.');
			}
			resetForm();
		} catch (error) {
			toast.error('No se pudo guardar el cliente.');
		} finally {
			setSaving(false);
		}
	}

	async function deleteClient(client) {
		if (!isAdmin) return;
		try {
			const accounts = await getDocs(query(collection(db, 'cuentasCliente'), where('clienteId', '==', client.id)));
			if (accounts.docs.some((account) => {
				const balance = Number(account.data().saldoPendiente);
				return !Number.isFinite(balance) || balance > 0;
			})) {
				toast.warning('No se puede eliminar este cliente porque tiene cuentas pendientes.');
				return;
			}
			if (!window.confirm(`¿Eliminar a ${client.nombre}? Sus facturas e historial de cuentas pagadas se conservarán.`)) return;
			await deleteDoc(doc(db, 'clientes', client.id));
			toast.success('Cliente eliminado. El historial de cuentas y facturas se conservó.');
		} catch (error) {
			toast.error('No se pudo eliminar el cliente.');
		}
	}

	if (loading) return <LoadingScreen text="Cargando clientes" />;

	if (selectedClient) {
		const currentClient = clients.find((client) => client.id === selectedClient.id) || selectedClient;
		return <CuentaDelCliente customer={currentClient} accounts={customerAccounts.filter((account) => account.clienteId === currentClient.id)} profile={profile} onBack={() => setSelectedClient(null)} onEdit={() => openEdit(currentClient)} />;
	}

	return (
		<section className="customers-page" aria-labelledby="customers-title">
			<header className="customers-header">
				<div><p className="app-eyebrow">Cuentas por cobrar</p><h1 id="customers-title">Clientes</h1><p>Administra clientes y consulta sus cuentas pendientes.</p></div>
				<button className="customers-primary-button" type="button" onClick={() => { resetForm(); setFormOpen(true); }}><FaPlus aria-hidden="true" /> Nuevo cliente</button>
			</header>
			<label className="customers-search">Buscar cliente<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o teléfono" /></label>
			{filteredClients.length === 0 ? <div className="customers-empty"><FaUserFriends aria-hidden="true" /><h2>{clients.length ? 'No hay coincidencias' : 'Aún no hay clientes'}</h2><p>{clients.length ? 'Prueba con otro nombre o teléfono.' : 'Crea un cliente para empezar a anotar pedidos.'}</p></div> : <div className="customers-list">
				{filteredClients.map((client) => {
					const accounts = customerAccounts.filter((account) => account.clienteId === client.id && Number(account.saldoPendiente) > 0);
					const balance = accounts.reduce((sum, account) => sum + Number(account.saldoPendiente || 0), 0);
					return <article className="customer-row" key={client.id}>
						<button className="customer-open" type="button" onClick={() => setSelectedClient(client)}><span className="customer-name">{client.nombre}</span><span className="customer-phone">{client.telefono}</span><span className="customer-account-count">{accounts.length} {accounts.length === 1 ? 'cuenta pendiente' : 'cuentas pendientes'}</span><strong>{formatMoney(balance)}</strong></button>
						<div className="customer-actions">
							<button className="customer-edit-button" type="button" aria-label={`Editar ${client.nombre}`} onClick={() => openEdit(client)}><FaEdit /></button>
							{isAdmin && <button className="customer-delete-button" type="button" aria-label={`Eliminar ${client.nombre}`} onClick={() => deleteClient(client)}><FaTrash /></button>}
						</div>
					</article>;
				})}
			</div>}
			{formOpen && <div className="customer-modal-backdrop" role="presentation"><form className="customer-modal" onSubmit={saveClient}>
				<header><div><p className="app-eyebrow">Directorio</p><h2>{editingClient ? 'Editar cliente' : 'Nuevo cliente'}</h2></div><button type="button" aria-label="Cerrar" onClick={resetForm}>×</button></header>
				<label>Nombre completo<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre y apellido" required /></label>
				<label>Teléfono<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Número de teléfono" required /></label>
				<div className="customer-modal-actions"><button type="button" onClick={resetForm} disabled={saving}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Guardando...' : editingClient ? 'Guardar cambios' : 'Crear cliente'}</button></div>
			</form></div>}
		</section>
	);
}

export default Clientes;
