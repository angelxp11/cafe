import { useEffect, useState } from 'react';
import { collection, getDocs, onSnapshot, writeBatch, doc, deleteField, runTransaction, query, where } from 'firebase/firestore';
import { FaEdit, FaPlus, FaTrash, FaTimes } from 'react-icons/fa';
import { db } from '../../server/api';
import LoadingScreen from '../../resources/loading/LoadingScreen';
import toast from '../../resources/toast/toast';
import ModalMesa from './modalmesa/modalmesa';
import Cuenta from './cuenta/cuenta';
import './mesas.css';

function Mesas({ profile }) {
	const [floors, setFloors] = useState([]);
	const [tables, setTables] = useState([]);
	const [loading, setLoading] = useState(true);
	const [modalOpen, setModalOpen] = useState(false);
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [selectedForDeletion, setSelectedForDeletion] = useState(new Set());
	const [deletingItems, setDeletingItems] = useState(false);
	const [editingItem, setEditingItem] = useState(null);
	const [selectedTable, setSelectedTable] = useState(null);
	const [draggingTableId, setDraggingTableId] = useState(null);
	const [combining, setCombining] = useState(false);
	const canManageTables = ['admin', 'empleado'].includes(profile?.rol);
	const [currentTime, setCurrentTime] = useState(Date.now());

	useEffect(() => {
		const timer = window.setInterval(() => setCurrentTime(Date.now()), 30000);
		return () => window.clearInterval(timer);
	}, []);

	async function loadFloorData() {
		setLoading(true);
		const unsubscribeFloors = onSnapshot(collection(db, 'pisos'), (snapshot) => {
			setFloors(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
			setLoading(false);
		}, () => {
			toast.error('No se pudieron cargar los pisos.');
			setLoading(false);
		});
		const unsubscribeTables = onSnapshot(collection(db, 'mesas'), (snapshot) => {
			setTables(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
		}, () => toast.error('No se pudieron cargar las mesas.'));
		return () => {
			unsubscribeFloors();
			unsubscribeTables();
		};
	}

	useEffect(() => {
		let unsubscribe;
		loadFloorData().then((cleanup) => { unsubscribe = cleanup; });
		return () => unsubscribe?.();
	}, []);

	function handleCreated() {
		setModalOpen(false);
		setEditingItem(null);
	}

	function openCreateModal() {
		setEditingItem(null);
		setModalOpen(true);
	}

	function openEditModal(item, type) {
		setEditingItem({ ...item, type });
		setModalOpen(true);
	}

	function toggleFloorForDeletion(floorId, checked) {
		setSelectedForDeletion((current) => {
			const next = new Set(current);
			const floorKey = `floor:${floorId}`;
			if (checked) next.add(floorKey);
			else next.delete(floorKey);
			return next;
		});
	}

	function toggleTableForDeletion(table, checked) {
		setSelectedForDeletion((current) => {
			const next = new Set(current);
			const tableKey = `table:${table.id}`;
			if (checked) next.add(tableKey);
			else next.delete(tableKey);
			return next;
		});
	}

	async function deleteSelectedItems() {
		if (deletingItems) return;
		const selectedFloorIds = [...selectedForDeletion]
			.filter((key) => key.startsWith('floor:'))
			.map((key) => key.slice('floor:'.length));
		const selectedTableIds = new Set([...selectedForDeletion]
			.filter((key) => key.startsWith('table:'))
			.map((key) => key.slice('table:'.length)));
		if (!selectedFloorIds.length && !selectedTableIds.size) {
			toast.warning('Selecciona al menos un piso o una mesa para eliminar.');
			return;
		}

		setDeletingItems(true);
		try {
			const floorTableSnapshots = await Promise.all(selectedFloorIds.map((floorId) => (
				getDocs(query(collection(db, 'mesas'), where('pisoId', '==', floorId)))
			)));
			const floorTableIds = floorTableSnapshots.flatMap((snapshot) => snapshot.docs.map((tableSnapshot) => tableSnapshot.id));
			const tableIdsToRead = [...new Set([...selectedTableIds, ...floorTableIds])];
			const floorTableIdsByFloor = new Map(selectedFloorIds.map((floorId, index) => [
				floorId,
				floorTableSnapshots[index].docs.map((tableSnapshot) => tableSnapshot.id),
			]));

			await runTransaction(db, async (transaction) => {
				const floorReferences = selectedFloorIds.map((floorId) => doc(db, 'pisos', floorId));
				const tableReferences = tableIdsToRead.map((tableId) => doc(db, 'mesas', tableId));
				const [floorSnapshots, tableSnapshots] = await Promise.all([
					Promise.all(floorReferences.map((reference) => transaction.get(reference))),
					Promise.all(tableReferences.map((reference) => transaction.get(reference))),
				]);
				if (floorSnapshots.some((snapshot) => !snapshot.exists())) {
					throw new Error('Uno de los pisos seleccionados ya no existe. Actualiza la pantalla e inténtalo de nuevo.');
				}

				const tablesById = new Map(tableSnapshots.map((snapshot) => [snapshot.id, snapshot]));

				for (const floorId of selectedFloorIds) {
					const currentFloorTableIds = floorTableIdsByFloor.get(floorId) || [];
					if (currentFloorTableIds.some((tableId) => !selectedTableIds.has(tableId))) {
						throw new Error('Para eliminar este piso, selecciona también cada una de sus mesas en la sección Mesas.');
					}
					if (currentFloorTableIds.some((tableId) => {
						const snapshot = tablesById.get(tableId);
						return !snapshot?.exists() || snapshot.data().pisoId !== floorId;
					})) {
						throw new Error('Las mesas del piso cambiaron mientras se preparaba la eliminación. Actualiza la pantalla e inténtalo de nuevo.');
					}
				}

				const tablesToDelete = [...selectedTableIds].map((tableId) => tablesById.get(tableId));
				if (tablesToDelete.some((snapshot) => !snapshot?.exists())) {
					throw new Error('Una de las mesas seleccionadas ya no existe. Actualiza la pantalla e inténtalo de nuevo.');
				}
				for (const tableSnapshot of tablesToDelete) {
					const table = tableSnapshot.data();
					if (table.pedido !== undefined && (!Array.isArray(table.pedido) || table.pedido.length > 0)) {
						throw new Error(`No se puede eliminar la mesa ${table.numero} porque tiene productos en el pedido.`);
					}
					if (table.grupoId || table.estado === 'combinada') {
						throw new Error(`Separa primero la mesa ${table.numero} de su grupo antes de eliminarla.`);
					}
					if (table.estado && table.estado !== 'disponible') {
						throw new Error(`No se puede eliminar la mesa ${table.numero} porque su estado no es disponible.`);
					}
				}

				tablesToDelete.forEach((snapshot) => transaction.delete(snapshot.ref));
				floorReferences.forEach((reference) => transaction.delete(reference));
			});
			setSelectedForDeletion(new Set());
			setDeleteModalOpen(false);
			toast.success('Los pisos y mesas seleccionados se eliminaron correctamente.');
		} catch (error) {
			toast.error(error.message || 'No se pudieron eliminar los pisos o mesas.');
		} finally {
			setDeletingItems(false);
		}
	}

	function getTableGroups(floorId) {
		const floorTables = tables.filter((table) => table.pisoId === floorId);
		const groups = new Map();

		floorTables.forEach((table) => {
			const key = table.grupoId || table.id;
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key).push(table);
		});

		return Array.from(groups.entries()).map(([key, groupTables]) => ({
			key,
			tables: [...groupTables].sort((first, second) => Number(first.numero) - Number(second.numero)),
		}));
	}

	function getTableLabel(groupTables) {
		const numbers = groupTables.map((table) => Number(table.numero)).filter((number) => number > 0).sort((first, second) => first - second);
		if (numbers.length === 0) return 'Mesa';
		if (numbers.length === 1) return `Mesa ${numbers[0]}`;
		if (numbers.length === 2) return `Mesas ${numbers[0]} y ${numbers[1]}`;
		return `Mesas ${numbers.slice(0, -1).join(', ')} y ${numbers[numbers.length - 1]}`;
	}

	function getTableDescription(table) {
		const description = String(table.descripcion ?? '').trim();
		return description && description !== '0' ? description : '';
	}

	function formatElapsed(timestamp) {
		if (!timestamp) return null;
		const elapsedMinutes = Math.max(0, Math.floor((currentTime - timestamp) / 60000));
		return elapsedMinutes === 0 ? 'Ahora' : `${elapsedMinutes} min`;
	}

	function getTimeClass(timestamp, type) {
		if (!timestamp) return '';
		const minutes = Math.max(0, Math.floor((currentTime - timestamp) / 60000));
		if (type === 'idle') return minutes >= 15 ? 'table-time-warning' : 'table-time-idle';
		return minutes >= 60 ? 'table-time-warning' : 'table-time-active';
	}

	function handleDragStart(event, tableId) {
		setDraggingTableId(tableId);
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', tableId);
	}

	function handlePointerDown(tableId) {
		setDraggingTableId(tableId);
	}

	async function combineTables(targetTableId) {
		const sourceTableId = draggingTableId;
		setDraggingTableId(null);
		if (!sourceTableId || sourceTableId === targetTableId || combining) return;

		const sourceTable = tables.find((table) => table.id === sourceTableId);
		const targetTable = tables.find((table) => table.id === targetTableId);
		if (!sourceTable || !targetTable) return;

		const sourceGroupId = sourceTable.grupoId;
		const targetGroupId = targetTable.grupoId;
		const groupId = sourceGroupId || targetGroupId || `grupo-${Date.now()}`;
		const idsToCombine = tables
			.filter((table) => table.id === sourceTableId || table.id === targetTableId || (sourceGroupId && table.grupoId === sourceGroupId) || (targetGroupId && table.grupoId === targetGroupId))
			.map((table) => table.id);
		const tablesToCombine = tables.filter((table) => idsToCombine.includes(table.id));
		const primaryTable = [...tablesToCombine].sort((first, second) => Number(first.numero) - Number(second.numero))[0];
		const mergedOrders = tablesToCombine.flatMap((table) => table.pedido || []);
		const orderTimestamps = mergedOrders.map((item) => Number(item.addedAt)).filter((timestamp) => timestamp > 0);
		const mergedTableData = {
			grupoId: groupId,
			estado: 'combinada',
			pedido: mergedOrders,
			pedidoDesde: orderTimestamps.length ? Math.min(...orderTimestamps) : 0,
			ultimoPedidoEn: orderTimestamps.length ? Math.max(...orderTimestamps) : 0,
		};

		setCombining(true);
		try {
			const batch = writeBatch(db);
			idsToCombine.forEach((tableId) => batch.update(doc(db, 'mesas', tableId), tableId === primaryTable.id ? mergedTableData : { grupoId: groupId, estado: 'combinada', pedido: [], pedidoDesde: 0, ultimoPedidoEn: 0 }));
			await batch.commit();
			toast.success('Mesas combinadas correctamente.');
		} catch (error) {
			toast.error('No se pudieron combinar las mesas.');
		} finally {
			setCombining(false);
		}
	}

	async function separateTables(groupTables) {
		if (combining || groupTables.length < 2 || groupTables.some((table) => (table.pedido || []).length > 0)) return;
		const groupId = groupTables[0].grupoId;
		if (!groupId) return;

		setCombining(true);
		try {
			const tableReferences = groupTables.map((table) => doc(db, 'mesas', table.id));
			await runTransaction(db, async (transaction) => {
				const snapshots = [];
				for (const reference of tableReferences) snapshots.push(await transaction.get(reference));
				const currentTables = snapshots.map((snapshot) => snapshot.data());
				if (snapshots.some((snapshot) => !snapshot.exists()) || currentTables.some((table) => table.grupoId !== groupId || (table.pedido || []).length > 0)) {
					throw new Error('El grupo cambió o tiene productos en el pedido.');
				}
				tableReferences.forEach((reference) => transaction.update(reference, {
					grupoId: deleteField(),
					estado: 'disponible',
					pedido: [],
					pedidoDesde: 0,
					ultimoPedidoEn: 0,
				}));
			});
			toast.success('Mesas separadas correctamente.');
		} catch (error) {
			toast.error('No se pudieron separar las mesas. Verifica que el grupo siga vacío.');
		} finally {
			setCombining(false);
		}
	}

	if (loading) return <LoadingScreen text="Cargando mesas" />;
	const selectedFloorCount = [...selectedForDeletion].filter((key) => key.startsWith('floor:')).length;
	const selectedTableCount = [...selectedForDeletion].filter((key) => key.startsWith('table:')).length;

	return (
		<section className="tables-page" aria-labelledby="tables-title">
			<header className="app-content-header tables-header">
				<div>
					<p className="app-eyebrow">Distribución del salón</p>
					<h1 id="tables-title">Mesas</h1>
					<p className="app-intro">Organiza las mesas por piso y consulta su disponibilidad.</p>
				</div>
				{canManageTables && <div className="tables-header-actions">
					<button className="tables-create-button" type="button" onClick={openCreateModal}>
						<FaPlus aria-hidden="true" /><span>Crear</span>
					</button>
					<button className="tables-delete-button" type="button" onClick={() => { setSelectedForDeletion(new Set()); setDeleteModalOpen(true); }}>
						<FaTrash aria-hidden="true" /><span>Eliminar</span>
					</button>
				</div>}
			</header>

			{floors.length === 0 ? (
				<div className="tables-empty"><h2>Aún no hay pisos</h2><p>Crea un piso para comenzar a organizar tus mesas.</p></div>
			) : (
				<div className="floor-grid">
					{floors.map((floor) => (
						<section className="floor-card" key={floor.id} aria-labelledby={`floor-${floor.id}`}>
							<div className="floor-card-header">
								<h2 id={`floor-${floor.id}`}>{floor.nombre}</h2>
								{canManageTables && <button className="table-edit-button" type="button" aria-label={`Editar ${floor.nombre}`} onClick={() => openEditModal(floor, 'piso')}><FaEdit /></button>}
							</div>
							<div className="table-grid">
								{getTableGroups(floor.id).map((group) => {
									const primaryTable = group.tables[0];
									const isCombined = group.tables.length > 1;
									const hasProducts = group.tables.some((table) => (table.pedido || []).length > 0);
									return (
									<div
										className={`table-item${isCombined ? ' table-item-combined' : ''}${draggingTableId === primaryTable.id ? ' table-item-dragging' : ''}`}
										key={group.key}
										draggable={!combining}
										onDragStart={(event) => handleDragStart(event, primaryTable.id)}
										onDragEnd={() => setDraggingTableId(null)}
										onDragOver={(event) => event.preventDefault()}
										onDrop={(event) => { event.preventDefault(); combineTables(primaryTable.id); }}
										onPointerDown={() => handlePointerDown(primaryTable.id)}
										onPointerUp={() => combineTables(primaryTable.id)}
										aria-label={`${getTableLabel(group.tables)}${isCombined ? ', combinada' : ''}`}
										onClick={() => setSelectedTable({ ...primaryTable, tableIds: group.tables.map((table) => table.id), label: getTableLabel(group.tables) })}
									>
										<span>{getTableLabel(group.tables)}</span>
										{getTableDescription(primaryTable) && <small className="table-description">{getTableDescription(primaryTable)}</small>}
										{isCombined && <small>Combinada</small>}
										{isCombined && !hasProducts && <button className="table-separate-button" type="button" disabled={combining} onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); separateTables(group.tables); }}>Separar mesas</button>}
										{(Number(primaryTable.pedidoDesde) > 0 || Number(primaryTable.ultimoPedidoEn) > 0) && <div className="table-time-row">{Number(primaryTable.pedidoDesde) > 0 && <span className={getTimeClass(primaryTable.pedidoDesde, 'active')}>Pedido {formatElapsed(primaryTable.pedidoDesde)}</span>}{Number(primaryTable.ultimoPedidoEn) > 0 && <span className={getTimeClass(primaryTable.ultimoPedidoEn, 'idle')}>Sin pedir {formatElapsed(primaryTable.ultimoPedidoEn)}</span>}</div>}
										{canManageTables && <button className="table-edit-button" type="button" aria-label={`Editar ${getTableLabel(group.tables)}`} onClick={(event) => { event.stopPropagation(); openEditModal(primaryTable, 'mesa'); }}><FaEdit /></button>}
									</div>
									);
								})}
								{getTableGroups(floor.id).length === 0 && <p className="floor-empty">Sin mesas asignadas.</p>}
							</div>
						</section>
					))}
				</div>
			)}

			{modalOpen && canManageTables && <ModalMesa key={editingItem?.id || 'new'} floors={floors} editingItem={editingItem} onClose={() => { setModalOpen(false); setEditingItem(null); }} onCreated={handleCreated} />}
			{deleteModalOpen && canManageTables && <div className="table-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !deletingItems && setDeleteModalOpen(false)}>
				<section className="table-modal table-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-tables-title">
					<header className="table-modal-header">
						<div><p className="app-eyebrow">Organización del salón</p><h2 id="delete-tables-title">Eliminar pisos y mesas</h2></div>
						<button className="table-modal-close" type="button" aria-label="Cerrar" disabled={deletingItems} onClick={() => setDeleteModalOpen(false)}><FaTimes /></button>
					</header>
					<p className="table-delete-description">Los pisos y las mesas tienen switches independientes. Para eliminar un piso con sus mesas, selecciona el piso y cada mesa por separado.</p>
					<div className="table-delete-list">
						<section className="table-delete-group" aria-labelledby="delete-floors-heading">
							<h3 className="table-delete-group-title" id="delete-floors-heading">Pisos</h3>
							{floors.map((floor) => {
								const floorTables = tables.filter((table) => table.pisoId === floor.id);
								return <label className="table-delete-switch-row table-delete-floor-row" key={floor.id}>
									<span><strong>{floor.nombre}</strong><small>Piso · {floorTables.length} {floorTables.length === 1 ? 'mesa' : 'mesas'}; selecciona sus mesas por separado</small></span>
									<input type="checkbox" role="switch" aria-label={`Eliminar piso ${floor.nombre}`} checked={selectedForDeletion.has(`floor:${floor.id}`)} disabled={deletingItems} onChange={(event) => toggleFloorForDeletion(floor.id, event.target.checked)} />
								</label>;
							})}
							{floors.length === 0 && <p className="floor-empty">No hay pisos.</p>}
						</section>
						<section className="table-delete-group" aria-labelledby="delete-tables-heading">
							<h3 className="table-delete-group-title" id="delete-tables-heading">Mesas</h3>
							{tables.map((table) => {
								const floor = floors.find((item) => item.id === table.pisoId);
								const status = table.pedido?.length
									? 'Tiene productos en el pedido'
									: table.grupoId || table.estado === 'combinada'
										? 'Separar del grupo antes de eliminar'
										: table.estado && table.estado !== 'disponible'
											? `Estado: ${table.estado}`
											: 'Disponible para eliminar';
								return <label className="table-delete-switch-row table-delete-table-row" key={table.id}>
									<span><strong>Mesa {table.numero}</strong><small>{floor?.nombre || 'Sin piso'} · {status}</small></span>
									<input type="checkbox" role="switch" aria-label={`Eliminar mesa ${table.numero}${floor ? ` del piso ${floor.nombre}` : ''}`} checked={selectedForDeletion.has(`table:${table.id}`)} disabled={deletingItems} onChange={(event) => toggleTableForDeletion(table, event.target.checked)} />
								</label>;
							})}
							{tables.length === 0 && <p className="floor-empty">No hay mesas.</p>}
						</section>
					</div>
					<p className="table-delete-selection" aria-live="polite">{selectedFloorCount} {selectedFloorCount === 1 ? 'piso' : 'pisos'} y {selectedTableCount} {selectedTableCount === 1 ? 'mesa seleccionada' : 'mesas seleccionadas'}</p>
					<p className="table-delete-warning">No se pueden eliminar mesas con pedidos activos ni mesas que sigan combinadas. Primero guarda o separa esas mesas.</p>
					<div className="table-delete-actions">
						<button className="table-delete-cancel" type="button" disabled={deletingItems} onClick={() => setDeleteModalOpen(false)}>Cancelar</button>
						<button className="table-delete-confirm" type="button" disabled={deletingItems || (!selectedFloorCount && !selectedTableCount)} onClick={deleteSelectedItems}>
							<FaTrash aria-hidden="true" /><span>{deletingItems ? 'Eliminando...' : 'Eliminar seleccionados'}</span>
						</button>
					</div>
				</section>
			</div>}
			{selectedTable && <Cuenta table={selectedTable} profile={profile} onClose={() => setSelectedTable(null)} />}
		</section>
	);
}

export default Mesas;