import { useState } from 'react';
import { addDoc, collection, updateDoc, doc } from 'firebase/firestore';
import { FaTimes } from 'react-icons/fa';
import { db } from '../../../server/api';
import toast from '../../../resources/toast/toast';

function ModalMesa({ floors, editingItem, onClose, onCreated }) {
	const isEditing = Boolean(editingItem);
	const [mode, setMode] = useState(editingItem?.type === 'piso' ? 'piso' : 'mesa');
	const [floorName, setFloorName] = useState(editingItem?.type === 'piso' ? editingItem.nombre : '');
	const [tableNumber, setTableNumber] = useState(editingItem?.type === 'mesa' ? String(editingItem.numero) : '');
	const [floorId, setFloorId] = useState(editingItem?.type === 'mesa' ? editingItem.pisoId : floors[0]?.id || '');
	const [saving, setSaving] = useState(false);

	async function handleSubmit(event) {
		event.preventDefault();
		if (mode === 'piso' && !floorName.trim()) {
			toast.warning('Escribe el nombre del piso.');
			return;
		}
		if (mode === 'mesa' && (!tableNumber || !floorId)) {
			toast.warning('Indica el número de mesa y el piso.');
			return;
		}

		setSaving(true);
		try {
			if (mode === 'piso') {
				const floorData = { nombre: floorName.trim().toLocaleUpperCase('es-ES') };
				if (isEditing) await updateDoc(doc(db, 'pisos', editingItem.id), floorData);
				else await addDoc(collection(db, 'pisos'), { ...floorData, creadoEn: new Date() });
				toast.success(`Piso ${isEditing ? 'actualizado' : 'creado'} correctamente.`);
			} else {
				const selectedFloor = floors.find((floor) => floor.id === floorId);
				const tableData = {
							numero: tableNumber.trim(),
					pisoId: floorId,
					pisoNombre: selectedFloor.nombre,
					estado: 'disponible',
				};
				if (isEditing) await updateDoc(doc(db, 'mesas', editingItem.id), tableData);
				else await addDoc(collection(db, 'mesas'), tableData);
				toast.success(`Mesa ${isEditing ? 'actualizada' : 'creada'} correctamente.`);
			}
			onCreated();
		} catch (error) {
			toast.error('No se pudo guardar la información.');
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="table-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
			<section className="table-modal" role="dialog" aria-modal="true" aria-labelledby="table-modal-title">
				<header className="table-modal-header">
					<div><p className="app-eyebrow">Organización</p><h2 id="table-modal-title">{isEditing ? 'Editar' : 'Crear'} {mode === 'mesa' ? 'mesa' : 'piso'}</h2></div>
					<button className="table-modal-close" type="button" aria-label="Cerrar modal" onClick={onClose}><FaTimes /></button>
				</header>
				{!isEditing && <div className="table-modal-tabs" role="tablist" aria-label="Tipo de elemento">
					<button className={mode === 'mesa' ? 'active' : ''} type="button" role="tab" aria-selected={mode === 'mesa'} onClick={() => setMode('mesa')}>Crear mesa</button>
					<button className={mode === 'piso' ? 'active' : ''} type="button" role="tab" aria-selected={mode === 'piso'} onClick={() => setMode('piso')}>Crear piso</button>
				</div>}
				<form className="table-modal-form" onSubmit={handleSubmit}>
					{mode === 'mesa' ? <>
						<label htmlFor="table-number">Número de mesa</label>
						<input id="table-number" type="text" inputMode="numeric" pattern="[0-9]*" value={tableNumber} onChange={(event) => setTableNumber(event.target.value.replace(/\D/g, ''))} />
						<label htmlFor="table-floor">Piso</label>
						<select id="table-floor" value={floorId} onChange={(event) => setFloorId(event.target.value)} disabled={floors.length === 0}>
							<option value="">Selecciona un piso</option>
							{floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.nombre}</option>)}
						</select>
						{floors.length === 0 && <p className="table-modal-hint">Primero crea un piso.</p>}
					</> : <>
						<label htmlFor="floor-name">Nombre del piso</label>
						<input id="floor-name" type="text" placeholder="Ej. PLANTA BAJA" value={floorName} onChange={(event) => setFloorName(event.target.value.toLocaleUpperCase('es-ES'))} />
					</>}
					<button className="auth-submit" type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
				</form>
			</section>
		</div>
	);
}

export default ModalMesa;
