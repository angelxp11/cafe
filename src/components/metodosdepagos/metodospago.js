import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { FaPlus, FaTrash } from 'react-icons/fa';
import { db } from '../../server/api';
import LoadingScreen from '../../resources/loading/LoadingScreen';
import toast from '../../resources/toast/toast';
import './metodospago.css';

const defaultMethods = [
	{ id: 'efectivo', nombre: 'Efectivo', tipo: 'efectivo' },
	{ id: 'transferencia', nombre: 'Transferencia', tipo: 'transferencia' },
];

function MetodosPago({ profile }) {
	const [methods, setMethods] = useState([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [name, setName] = useState('');
	const [type, setType] = useState('transferencia');

	useEffect(() => {
		if (profile?.rol !== 'admin') return undefined;
		const unsubscribe = onSnapshot(collection(db, 'metodosPago'), async (snapshot) => {
			if (snapshot.empty) {
				try {
					await Promise.all(defaultMethods.map((method) => setDoc(doc(db, 'metodosPago', method.id), { ...method, saldo: 0, activo: true, creadoEn: new Date() }, { merge: true })));
				} catch (error) {
					toast.error('No se pudieron crear los métodos iniciales.');
				}
				return;
			}
			setMethods(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
			setLoading(false);
		}, () => {
			toast.error('No se pudieron cargar los métodos de pago.');
			setLoading(false);
		});
		return unsubscribe;
	}, [profile?.rol]);

	async function createMethod(event) {
		event.preventDefault();
		if (!name.trim()) {
			toast.warning('Escribe el nombre del método de pago.');
			return;
		}
		setSaving(true);
		try {
			await addDoc(collection(db, 'metodosPago'), { nombre: name.trim(), tipo: type, saldo: 0, activo: true, creadoEn: new Date() });
			setName('');
			toast.success('Método de pago creado.');
		} catch (error) {
			toast.error('No se pudo crear el método de pago.');
		} finally {
			setSaving(false);
		}
	}

	async function removeMethod(method) {
		if (defaultMethods.some((item) => item.id === method.id)) {
			toast.warning('Los métodos base no se pueden eliminar.');
			return;
		}
		if (!window.confirm(`¿Eliminar ${method.nombre}?`)) return;
		try {
			await deleteDoc(doc(db, 'metodosPago', method.id));
			toast.success('Método de pago eliminado.');
		} catch (error) {
			toast.error('No se pudo eliminar el método de pago.');
		}
	}

	if (profile?.rol !== 'admin') return null;
	if (loading) return <LoadingScreen text="Cargando métodos de pago" />;

	return (
		<section className="payment-methods-page" aria-labelledby="payment-methods-title">
			<header className="payment-methods-header">
				<div><p className="app-eyebrow">Control de caja</p><h1 id="payment-methods-title">Métodos de pago</h1><p className="payment-methods-intro">Consulta y organiza el balance recibido por cada método.</p></div>
			</header>
			<form className="payment-methods-form" onSubmit={createMethod}>
				<label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Nequi" /></label>
				<label>Tipo<select value={type} onChange={(event) => setType(event.target.value)}><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option></select></label>
				<button className="payment-methods-add" type="submit" disabled={saving}><FaPlus aria-hidden="true" /> {saving ? 'Guardando...' : 'Agregar método'}</button>
			</form>
			{methods.length === 0 ? <div className="payment-methods-empty">No hay métodos de pago configurados.</div> : <div className="payment-methods-grid">
				{methods.map((method) => <article className="payment-method-card" key={method.id}>
					<header><strong>{method.nombre}</strong><span className="payment-method-type">{method.tipo}</span></header>
					<div className="payment-method-balance"><span>Balance actual</span><strong>${Number(method.saldo || 0).toLocaleString('es-CO')}</strong></div>
					{!defaultMethods.some((item) => item.id === method.id) && <button className="payment-method-delete" type="button" onClick={() => removeMethod(method)}><FaTrash aria-hidden="true" /> Eliminar</button>}
				</article>)}
			</div>}
		</section>
	);
}

export default MetodosPago;
