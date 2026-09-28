import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, runTransaction, setDoc, serverTimestamp } from 'firebase/firestore';
import { FaEdit, FaPlus, FaTrash } from 'react-icons/fa';
import { auth, db } from '../../server/api';
import LoadingScreen from '../../resources/loading/LoadingScreen';
import toast from '../../resources/toast/toast';
import { formatThousandsInput, globalBalance, shiftBalance } from '../../server/paymentMethods';
import './metodospago.css';

const defaultMethods = [
	{ id: 'efectivo', nombre: 'Efectivo', tipo: 'efectivo' },
	{ id: 'transferencia', nombre: 'Transferencia', tipo: 'transferencia' },
];

function formatDate(value) {
	const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
	return date ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(date) : 'Fecha pendiente';
}

function MetodosPago({ profile }) {
	const [methods, setMethods] = useState([]);
	const [movements, setMovements] = useState([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [name, setName] = useState('');
	const [type, setType] = useState('transferencia');
	const [editing, setEditing] = useState(null);
	const [editGlobal, setEditGlobal] = useState('');
	const [editShift, setEditShift] = useState('');
	const [editReason, setEditReason] = useState('');

	useEffect(() => {
		if (profile?.rol !== 'admin') return undefined;
		const unsubscribe = onSnapshot(collection(db, 'metodosPago'), async (snapshot) => {
			if (snapshot.empty) {
				try {
					await Promise.all(defaultMethods.map((method) => setDoc(doc(db, 'metodosPago', method.id), { ...method, saldo: 0, saldoGlobal: 0, saldoTurno: 0, activo: true, creadoEn: new Date() }, { merge: true })));
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

	useEffect(() => {
		if (profile?.rol !== 'admin') return undefined;
		const unsubscribeMovements = onSnapshot(collection(db, 'movimientos'), (snapshot) => {
			setMovements(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
				.filter((movement) => movement.metodoId)
				.sort((first, second) => (second.creadoEn?.toMillis?.() || 0) - (first.creadoEn?.toMillis?.() || 0)));
		});
		return () => unsubscribeMovements();
	}, [profile?.rol]);

	function openEdit(method) {
		setEditing(method);
		setEditGlobal(formatThousandsInput(globalBalance(method)));
		setEditShift(formatThousandsInput(shiftBalance(method)));
		setEditReason('');
	}

	async function saveBalance(event) {
		event.preventDefault();
		if (!editing) return;
		const nextGlobal = Number(String(editGlobal).replace(/\D/g, '')) || 0;
		const nextShift = Number(String(editShift).replace(/\D/g, '')) || 0;
		const reason = editReason.trim().toUpperCase();
		if (!reason) {
			toast.warning('Escribe el motivo del ajuste.');
			return;
		}
		setSaving(true);
		const user = auth.currentUser;
		const methodReference = doc(db, 'metodosPago', editing.id);
		const movementReference = doc(collection(db, 'movimientos'));
		try {
			await runTransaction(db, async (transaction) => {
				const methodSnapshot = await transaction.get(methodReference);
				if (!methodSnapshot.exists()) throw new Error('El método ya no está disponible.');
				const current = methodSnapshot.data();
				const previousGlobal = globalBalance(current);
				const previousShift = shiftBalance(current);
				if (previousGlobal === nextGlobal && previousShift === nextShift) throw new Error('No hay cambios para registrar.');
				transaction.update(methodReference, { saldoGlobal: nextGlobal, saldoTurno: nextShift });
				transaction.set(movementReference, {
					turnoId: '',
					tipo: 'ajuste_balance',
					direccion: nextGlobal + nextShift >= previousGlobal + previousShift ? 'ingreso' : 'egreso',
					metodoId: editing.id,
					metodoNombre: current.nombre,
					monto: Math.abs((nextGlobal + nextShift) - (previousGlobal + previousShift)),
					saldoGlobalAnterior: previousGlobal,
					saldoGlobalNuevo: nextGlobal,
					saldoTurnoAnterior: previousShift,
					saldoTurnoNuevo: nextShift,
					descripcion: reason,
					creadoPor: [profile?.nombre, profile?.apellido].filter(Boolean).join(' ') || user?.email || 'Administrador',
					creadoPorCorreo: user?.email || '',
					creadoEn: serverTimestamp(),
				});
			});
			setEditing(null);
			toast.success('Balance actualizado y registrado.');
		} catch (error) {
			toast.error(error.message || 'No se pudo actualizar el balance.');
		} finally {
			setSaving(false);
		}
	}

	async function createMethod(event) {
		event.preventDefault();
		if (!name.trim()) {
			toast.warning('Escribe el nombre del método de pago.');
			return;
		}
		setSaving(true);
		try {
			await addDoc(collection(db, 'metodosPago'), { nombre: name.trim(), tipo: type, saldo: 0, saldoGlobal: 0, saldoTurno: 0, activo: true, creadoEn: new Date() });
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
					<div className="payment-method-balances"><div><span>Global</span><strong>${globalBalance(method).toLocaleString('es-CO')}</strong></div><div><span>Turno</span><strong>${shiftBalance(method).toLocaleString('es-CO')}</strong></div></div>
					<div className="payment-method-actions"><button className="payment-method-edit" type="button" onClick={() => openEdit(method)}><FaEdit aria-hidden="true" /> Editar balance</button>{!defaultMethods.some((item) => item.id === method.id) && <button className="payment-method-delete" type="button" onClick={() => removeMethod(method)}><FaTrash aria-hidden="true" /> Eliminar</button>}</div>
				</article>)}
			</div>}
			{editing && <form className="payment-method-edit-form" onSubmit={saveBalance}><h2>Editar balance: {editing.nombre}</h2><label>Saldo global<input type="text" inputMode="numeric" pattern="[0-9.]*" value={editGlobal} onChange={(event) => setEditGlobal(formatThousandsInput(event.target.value))} /></label><label>Saldo del turno<input type="text" inputMode="numeric" pattern="[0-9.]*" value={editShift} onChange={(event) => setEditShift(formatThousandsInput(event.target.value))} /></label><label>Motivo del ajuste<input value={editReason} onChange={(event) => setEditReason(event.target.value.toUpperCase())} placeholder="Ej. Corrección de arqueo" /></label><div><button type="button" onClick={() => setEditing(null)}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar ajuste'}</button></div></form>}
			<section className="payment-method-history" aria-labelledby="payment-method-history-title"><header><h2 id="payment-method-history-title">Historial de movimientos</h2><span>{movements.length} registros</span></header>{movements.length === 0 ? <p>No hay movimientos de balances registrados.</p> : <div>{movements.map((movement) => <article key={movement.id}><div><strong>{movement.descripcion || movement.tipo}</strong><span>{movement.metodoNombre} · {movement.creadoPor || 'Usuario'} · {movement.creadoPorCorreo || ''} · {formatDate(movement.creadoEn)}</span></div><small>{movement.tipo === 'ajuste_balance' ? `Global ${Number(movement.saldoGlobalAnterior || 0).toLocaleString('es-CO')} → ${Number(movement.saldoGlobalNuevo || 0).toLocaleString('es-CO')} · Turno ${Number(movement.saldoTurnoAnterior || 0).toLocaleString('es-CO')} → ${Number(movement.saldoTurnoNuevo || 0).toLocaleString('es-CO')}` : `${movement.tipo} · $${Number(movement.monto || 0).toLocaleString('es-CO')}`}</small></article>)}</div>}</section>
		</section>
	);
}

export default MetodosPago;
