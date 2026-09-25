import { useEffect, useState } from 'react';
import { collection, onSnapshot, writeBatch, doc } from 'firebase/firestore';
import { FaEdit, FaPlus } from 'react-icons/fa';
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
	const [editingItem, setEditingItem] = useState(null);
	const [selectedTable, setSelectedTable] = useState(null);
	const [draggingTableId, setDraggingTableId] = useState(null);
	const [combining, setCombining] = useState(false);
	const isAdmin = profile?.rol === 'admin';
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

	if (loading) return <LoadingScreen text="Cargando mesas" />;

	return (
		<section className="tables-page" aria-labelledby="tables-title">
			<header className="app-content-header tables-header">
				<div>
					<p className="app-eyebrow">Distribución del salón</p>
					<h1 id="tables-title">Mesas</h1>
					<p className="app-intro">Organiza las mesas por piso y consulta su disponibilidad.</p>
				</div>
				{isAdmin && <button className="tables-create-button" type="button" onClick={openCreateModal}>
					<FaPlus aria-hidden="true" /><span>Crear</span>
				</button>}
			</header>

			{floors.length === 0 ? (
				<div className="tables-empty"><h2>Aún no hay pisos</h2><p>Crea un piso para comenzar a organizar tus mesas.</p></div>
			) : (
				<div className="floor-grid">
					{floors.map((floor) => (
						<section className="floor-card" key={floor.id} aria-labelledby={`floor-${floor.id}`}>
							<div className="floor-card-header">
								<h2 id={`floor-${floor.id}`}>{floor.nombre}</h2>
								{isAdmin && <button className="table-edit-button" type="button" aria-label={`Editar ${floor.nombre}`} onClick={() => openEditModal(floor, 'piso')}><FaEdit /></button>}
							</div>
							<div className="table-grid">
								{getTableGroups(floor.id).map((group) => {
									const primaryTable = group.tables[0];
									const isCombined = group.tables.length > 1;
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
										{(Number(primaryTable.pedidoDesde) > 0 || Number(primaryTable.ultimoPedidoEn) > 0) && <div className="table-time-row">{Number(primaryTable.pedidoDesde) > 0 && <span className={getTimeClass(primaryTable.pedidoDesde, 'active')}>Pedido {formatElapsed(primaryTable.pedidoDesde)}</span>}{Number(primaryTable.ultimoPedidoEn) > 0 && <span className={getTimeClass(primaryTable.ultimoPedidoEn, 'idle')}>Sin pedir {formatElapsed(primaryTable.ultimoPedidoEn)}</span>}</div>}
										{isAdmin && <button className="table-edit-button" type="button" aria-label={`Editar ${getTableLabel(group.tables)}`} onClick={(event) => { event.stopPropagation(); openEditModal(primaryTable, 'mesa'); }}><FaEdit /></button>}
									</div>
									);
								})}
								{getTableGroups(floor.id).length === 0 && <p className="floor-empty">Sin mesas asignadas.</p>}
							</div>
						</section>
					))}
				</div>
			)}

			{modalOpen && isAdmin && <ModalMesa key={editingItem?.id || 'new'} floors={floors} editingItem={editingItem} onClose={() => { setModalOpen(false); setEditingItem(null); }} onCreated={handleCreated} />}
			{selectedTable && <Cuenta table={selectedTable} profile={profile} onClose={() => setSelectedTable(null)} />}
		</section>
	);
}

export default Mesas;