import { useState, useRef, useCallback, useEffect } from 'react';
import {
	Stage,
	Layer,
	Line,
	Rect,
	Circle,
	Group,
	Text,
	Image as KonvaImage,
} from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import {
	type Point,
	type Wall,
	type Cabinet,
	type Opening,
	type OpeningType,
	type DrawingState,
	type SnapResult,
	type CabinetType,
	type DragHandle,
	type Guideline,
	findNearestSnapTarget,
	findHitTarget,
	findOverlappingCabinets,
	computeSplitPoints,
	computeClearanceZone,
	connectWalls,
	distanceBetween,
	angleBetween,
	cmToPixels,
	pixelsToCm,
	formatLength,
	generateId,
	calculateDepthDirection,
	midpoint as getMidpoint,
	nearestPointOnSegment,
	pointNearLine,
	getWallCornerJoints,
	getWallCornerPolygon,
	findCornerCabinetPairs,
	type CornerCabinetPair,
	findNearestWall,
	constrainToWall,
	pointAlongWall,
	getWallDirectionFromRef,
	computeInteriorNormal,
	computeOutwardNormal,
	getWallPolygon,
	getWallInnerFace,
	findAnchorWallByInnerFace,
	orientNewWallFromAnchor,
	getWallAnchorPoints,
	checkClearanceViolation,
	calculateRemainingWallSpace,
	type AnchorPoint,
	CABINET_DEPTHS,
	CABINET_RENDER_DEPTH_BONUS,
	WALL_THICKNESS,
	CABINET_STYLES,
	OPENING_STYLES,
	CLEARANCE_DEPTHS,
	PIXELS_PER_CM,
	SNAP_RADIUS,
	type Island,
	wallAngleRad,
	projectPointOnLine,
	signedPerpendicularDistance,
	computeRail,
	findIslandHit,
	getConstrainedEnd,
	findAllClosedCycles,
	getClosedPolygonPath,
} from '@/lib/kitchen-engine';
import { FloatingDimensionInput } from './FloatingDimensionInput';
import { IslandInputOverlay } from './IslandInputOverlay';
import { WallPointPopup } from './WallPointPopup';
import { useCanvasStore, type WallPointItem } from '@/stores/useCanvasStore';
import type { CustomTool } from './Toolbar';
import { haptic } from '@/lib/haptics';
import { useIsTouch } from '@/hooks/use-touch';

// Wall-point placement state
// Phase 0 (no state): hovering — nearest corner is highlighted via hoveredCorner
// Phase 1 cornerLocked: corner selected, ruler shows live distance as mouse moves
// Form is shown when showWallPointForm=true (position stays in wallPointPlacement)
interface WallPointPlacementState {
	type: 'electrical' | 'plumbing';
	phase: 'cornerLocked';
	cornerPoint: Point;
	cornerWall: Wall;
	wallAngle: number; // direction from cornerPoint along the wall
	wallLength: number; // px length of the wall (clamp distance)
	distancePx: number; // live distance in pixels from cornerPoint
	position: Point; // live position on wall
	confirmedDistanceCm?: number; // set when user confirms (form is about to open)
}

// Popup form for wall point details (height, photo, note)
function WallPointFormModal({
	type,
	onSave,
	onCancel,
	defaultValues,
}: {
	type: 'electrical' | 'plumbing';
	onSave: (data: { heightCm: number; photo: string; note: string }) => void;
	onCancel: () => void;
	defaultValues?: { heightCm: number; photo: string; note: string };
}) {
	const [height, setHeight] = useState(defaultValues?.heightCm ? String(defaultValues.heightCm) : '');
	const [note, setNote] = useState(defaultValues?.note ?? '');
	const [photo, setPhoto] = useState(defaultValues?.photo ?? '');
	const fileInputRef = useRef<HTMLInputElement>(null);
	const cameraInputRef = useRef<HTMLInputElement>(null);

	const label = type === 'electrical' ? 'Electrical Point' : 'Plumbing Point';
	const color = type === 'electrical' ? 'amber' : 'blue';
	const borderCls =
		color === 'amber' ? 'border-amber-400' : 'border-blue-400';
	const btnCls =
		color === 'amber'
			? 'bg-amber-500 hover:bg-amber-600 text-white'
			: 'bg-blue-500 hover:bg-blue-600 text-white';

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) {
			return;
		}
		const reader = new FileReader();
		reader.onload = (ev) => setPhoto((ev.target?.result as string) ?? '');
		reader.readAsDataURL(file);
	};

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
			<div
				className={`bg-white rounded-xl shadow-2xl border-2 ${borderCls} w-full max-w-sm mx-4 p-5`}
			>
				<h3 className="text-base font-bold mb-4 text-gray-800">
					{label} — Details
				</h3>
				<div className="space-y-3">
					<div>
						<label className="text-xs font-semibold text-gray-600 block mb-1">
							Height from floor (cm) <span className="text-gray-400 font-normal">optional</span>
						</label>
						<input
							type="number"
							value={height}
							onChange={(e) => setHeight(e.target.value)}
							placeholder="e.g. 120"
							className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
							autoFocus
						/>
					</div>
					<div>
						<label className="text-xs font-semibold text-gray-600 block mb-1">
							Photo
						</label>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => fileInputRef.current?.click()}
								className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-xs font-medium hover:bg-gray-50 transition-colors"
							>
								Upload Photo
							</button>
							<button
								type="button"
								onClick={() => cameraInputRef.current?.click()}
								className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-xs font-medium hover:bg-gray-50 transition-colors"
							>
								Open Camera
							</button>
						</div>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							className="hidden"
							onChange={handleFileChange}
						/>
						<input
							ref={cameraInputRef}
							type="file"
							accept="image/*"
							capture="environment"
							className="hidden"
							onChange={handleFileChange}
						/>
						{photo && (
							<img
								src={photo}
								alt="preview"
								className="mt-2 w-full h-24 object-cover rounded-lg border border-gray-200"
							/>
						)}
					</div>
					<div>
						<label className="text-xs font-semibold text-gray-600 block mb-1">
							Note
						</label>
						<textarea
							value={note}
							onChange={(e) => setNote(e.target.value)}
							placeholder="Any notes..."
							rows={2}
							className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
						/>
					</div>
				</div>
				<div className="flex gap-2 mt-4">
					<button
						type="button"
						onClick={onCancel}
						className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={() =>
							onSave({
								heightCm: parseInt(height) || 0,
								photo,
								note,
							})
						}
						className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${btnCls}`}
					>
						Save
					</button>
				</div>
			</div>
		</div>
	);
}

interface DesignerCanvasProps {
	drawingState: DrawingState;
	onDrawingStateChange: React.Dispatch<React.SetStateAction<DrawingState>>;
	onAddWall: (wall: Wall) => void;
	onAddCabinet: (cabinet: Cabinet) => void;
	onAddOpening: (opening: Opening) => void;
	onUpdateWall: (id: string, updates: Partial<Wall>) => void;
	onUpdateCabinet: (id: string, updates: Partial<Cabinet>) => void;
	onMoveComplete: () => void;
	onDeleteItem: (id: string) => void;
	onSelectItem: (id: string | null) => void;
	onStageRef?: (stage: Konva.Stage | null) => void;
	referenceImage?: string | null;
	stage?: string;
	activeCustomTool?: CustomTool;
	// Guidelines (measure tape nodes)
	guidelines?: Guideline[];
	onAddGuideline?: (g: Guideline) => void;
	onClearGuidelines?: () => void;
	// Wall points (electrical / plumbing)
	wallPoints?: WallPointItem[];
	onAddWallPoint?: (point: Omit<WallPointItem, 'id'>) => void;
	onUpdateWallPoint?: (id: number, updates: Partial<Omit<WallPointItem, 'id'>>) => void;
	onDeleteWallPoint?: (id: number) => void;
	// Legacy element system
	canvasElements?: CanvasElementItem[];
	activeElementDefId?: number | null;
	onAddElement?: (el: CanvasElementItem) => void;
	onUpdateElement?: (id: string, updates: { x: number; y: number }) => void;
	onDeleteElement?: (id: string) => void;
}

export interface CanvasElementItem {
	id: string;
	definitionId: number;
	x: number;
	y: number;
	rotation: number;
	name: string;
	category: string;
	icon: string;
}
// CanvasElementItem matches CanvasElement from useCanvasStore — kept separate to avoid circular imports

const ELEMENT_COLORS: Record<string, { fill: string; stroke: string }> = {
	electrical: { fill: '#FEF3C7', stroke: '#F59E0B' },
	plumbing: { fill: '#DBEAFE', stroke: '#3B82F6' },
	appliance: { fill: '#EDE9FE', stroke: '#8B5CF6' },
};
const ELEMENT_W = 56;
const ELEMENT_H = 44;

const GRID_SIZE = 20;
const SNAP_VISUAL_RADIUS = 8;
const MIN_DRAW_DISTANCE = 10;
const HANDLE_RADIUS = 6;
const HATCH_SPACING = 10;

/**
 * Reorders two user-drag endpoints so that `aStart → aEnd` points in the same
 * direction as `wall.start → wall.end`. If no parent wall is given, returns
 * the inputs unchanged.
 *
 * This is critical for cabinet/opening placement: downstream rendering
 * (renderCabinetBody) uses angleBetween(start, end) to build a local frame,
 * and depth direction is decided relative to that frame. If the cabinet's
 * frame is opposite to the wall's frame, depth inverts → cabinet appears
 * outside the room. Aligning here eliminates the cursor-direction bug.
 */
function alignToWall(
	startPoint: Point,
	endPoint: Point,
	wall: Wall | undefined,
): { aStart: Point; aEnd: Point } {
	if (!wall) return { aStart: startPoint, aEnd: endPoint };
	const wallDx = wall.end.x - wall.start.x;
	const wallDy = wall.end.y - wall.start.y;
	const cabDx = endPoint.x - startPoint.x;
	const cabDy = endPoint.y - startPoint.y;
	const sameDir = wallDx * cabDx + wallDy * cabDy >= 0;
	return sameDir
		? { aStart: startPoint, aEnd: endPoint }
		: { aStart: endPoint, aEnd: startPoint };
}

// Feature flag — legacy wall-anchored island tool
// Kept in the repo for reversibility but dead at runtime.
// The new free-floating island flow (reference wall + offset rail) is wired up in later tasks.
const USE_LEGACY_ISLAND_TOOL = false;

interface DragState {
	itemId: string;
	itemType: 'wall' | 'cabinet';
	handle: DragHandle;
	startMousePos: Point;
	originalStart: Point;
	originalEnd: Point;
}

type WallPlacementPhase =
	| 'idle'
	| 'settingOffset'
	| 'settingLength';
type WallPlacementTool =
	| 'tall'
	| 'door'
	| 'window'
	| 'base'
	| 'wall_cabinet'
	| 'electrical'
	| 'plumbing';

const WALL_PLACEMENT_TOOLS: ReadonlySet<string> = new Set([
	'tall',
	'door',
	'window',
	'base',
	'wall_cabinet',
	'electrical',
	'plumbing',
]);

function isWallPlacementTool(
	tool: string | null | undefined
): tool is WallPlacementTool {
	if (!tool) {
		return false;
	}
	return WALL_PLACEMENT_TOOLS.has(tool);
}

interface WallPlacementState {
	phase: WallPlacementPhase;
	tool: WallPlacementTool;
	wall: Wall;
	referenceEndpoint: Point;
	wallAngle: number;
	currentOffsetPx: number;
	currentPosition: Point;
	offsetPosition?: Point;
	lengthPreviewEnd?: Point;
	startPointOnWall?: Point;
}

// ── Island Cabinet 4-Phase CAD-Walk State ────────────────────────────────────
type IslandPhase =
	| 'pickingAnchor'
	| 'settingWL'
	| 'settingDL'
	| 'settingCL'
	| 'settingCD';

interface IslandPlacementState {
	phase: IslandPhase;

	// Phase 0 — anchor on wall
	anchorPoint: Point | null;
	anchorWallId: string | null;
	wallAngle: number; // radians

	// Phase 1 — Wall Length (along wall axis)
	WL_cm: number;
	WL_direction: 1 | -1; // +1 = along wallAngle, -1 = reversed

	// Phase 2 — Deep Length (from turn1, any direction)
	DL_cm: number;
	DL_angle: number; // radians, absolute world angle

	// Phase 3 — Cabinet Length (from turn2 = island corner, any direction)
	CL_cm: number;
	CL_angle: number; // radians, absolute world angle

	// Phase 4 — Cabinet Depth (perpendicular to CL axis)
	CD_cm: number;
	CD_flipped: boolean; // which perpendicular side of CL
}

// ── Island Cabinet 4-Phase Dimension Panel ───────────────────────────────────
type IslandPanelField = 'WL' | 'DL' | 'CL' | 'CD';

function IslandDimensionPanel({
	phase,
	liveWL_cm,
	liveDL_cm,
	liveCL_cm,
	liveCD_cm,
	WL_cm,
	DL_cm,
	CL_cm,
	CD_cm,
	unit,
	onCommitField,
	onJumpToField,
	onCancel,
}: {
	phase: IslandPhase;
	liveWL_cm: number;
	liveDL_cm: number;
	liveCL_cm: number;
	liveCD_cm: number;
	WL_cm: number;
	DL_cm: number;
	CL_cm: number;
	CD_cm: number;
	unit: 'cm' | 'm';
	onCommitField: (field: IslandPanelField, cm: number) => void;
	onJumpToField: (field: IslandPanelField) => boolean; // returns false if blocked
	onCancel: () => void;
}) {
	const [inputValue, setInputValue] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	const phaseToField: Record<IslandPhase, IslandPanelField | null> = {
		pickingAnchor: null,
		settingWL: 'WL',
		settingDL: 'DL',
		settingCL: 'CL',
		settingCD: 'CD',
	};
	const activeField = phaseToField[phase];

	// Reset input on phase change + refocus
	useEffect(() => {
		setInputValue('');
		const t = setTimeout(() => inputRef.current?.focus(), 50);
		return () => clearTimeout(t);
	}, [phase]);

	const liveByField: Record<IslandPanelField, number> = {
		WL: liveWL_cm,
		DL: liveDL_cm,
		CL: liveCL_cm,
		CD: liveCD_cm,
	};
	const storedByField: Record<IslandPanelField, number> = {
		WL: WL_cm,
		DL: DL_cm,
		CL: CL_cm,
		CD: CD_cm,
	};

	const formatCm = (cm: number) =>
		unit === 'm' ? (cm / 100).toFixed(2) : `${Math.round(cm)}`;

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (!activeField) return;
		if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
			e.preventDefault();
			const num = parseFloat(inputValue);
			const typed =
				!isNaN(num) && num > 0 ? (unit === 'm' ? num * 100 : num) : NaN;
			const cm = !isNaN(typed) ? typed : liveByField[activeField];
			onCommitField(activeField, cm);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onCancel();
		}
	};

	const fields: { key: IslandPanelField; label: string }[] = [
		{ key: 'WL', label: 'Wall len' },
		{ key: 'DL', label: 'Deep len' },
		{ key: 'CL', label: 'Cab len' },
		{ key: 'CD', label: 'Cab depth' },
	];

	return (
		<div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
			<div className="bg-card border border-border rounded-lg shadow-lg px-4 py-3 backdrop-blur-sm min-w-[420px]">
				<div className="flex items-center justify-between mb-2">
					<div className="text-xs font-semibold text-amber-500">
						Island Cabinet
					</div>
					<button
						onClick={onCancel}
						className="text-[10px] text-muted-foreground hover:text-foreground"
					>
						Cancel ✕
					</button>
				</div>
				<div className="grid grid-cols-2 gap-2">
					{fields.map((f) => {
						const isActive = f.key === activeField;
						const stored = storedByField[f.key];
						const isFilled = stored > 0;
						const live = liveByField[f.key];
						const placeholder = formatCm(isActive ? live : stored);
						return (
							<div
								key={f.key}
								className={`flex items-center gap-2 px-2 py-1 rounded-md border transition-colors ${
									isActive
										? 'border-amber-400 bg-amber-50'
										: isFilled
											? 'border-border bg-muted/30 cursor-pointer hover:bg-muted/50'
											: 'border-border bg-muted/10'
								}`}
								onClick={() => {
									if (!isActive && isFilled) onJumpToField(f.key);
								}}
							>
								<label className="text-[11px] font-medium text-muted-foreground whitespace-nowrap w-[56px]">
									{f.label}
								</label>
								{isActive ? (
									<input
										ref={inputRef}
										type="number"
										value={inputValue}
										onChange={(e) => setInputValue(e.target.value)}
										onKeyDown={handleKeyDown}
										placeholder={placeholder}
										className="w-16 h-6 px-1 text-sm font-mono bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
										step="any"
										min="0"
									/>
								) : (
									<div className="w-16 h-6 px-1 text-sm font-mono flex items-center text-foreground">
										{isFilled ? formatCm(stored) : '—'}
									</div>
								)}
								<span className="text-[10px] text-muted-foreground font-medium select-none">
									{unit}
								</span>
							</div>
						);
					})}
				</div>
				<div className="text-[10px] text-muted-foreground mt-2">
					{phase === 'pickingAnchor'
						? 'Click any anchor on a wall (corner, door edge, window edge, cabinet edge)'
						: phase === 'settingCD'
							? 'Shift ortho · F to flip · Enter · Esc to step back'
							: 'Shift ortho · Tab/Enter · Esc to step back'}
				</div>
			</div>
		</div>
	);
}

function FixedDimensionPanel({
	wallPlacement,
	unit,
	onOffsetConfirm,
	onLengthConfirm,
	onCancel,
}: {
	wallPlacement: WallPlacementState;
	unit: 'cm' | 'm';
	onOffsetConfirm: (valueCm: number) => void;
	onLengthConfirm: (valueCm: number) => void;
	onCancel: () => void;
}) {
	const [offsetValue, setOffsetValue] = useState('');
	const [lengthValue, setLengthValue] = useState('');
	const offsetRef = useRef<HTMLInputElement>(null);
	const lengthRef = useRef<HTMLInputElement>(null);

	const currentOffsetCm = Math.round(
		pixelsToCm(wallPlacement.currentOffsetPx)
	);
	const currentLengthCm =
		wallPlacement.phase === 'settingLength' &&
		wallPlacement.lengthPreviewEnd
			? Math.round(
					pixelsToCm(
						distanceBetween(
							wallPlacement.offsetPosition!,
							wallPlacement.lengthPreviewEnd
						)
					)
				)
			: 0;

	useEffect(() => {
		if (wallPlacement.phase === 'settingOffset') {
			setOffsetValue('');
			const timer = setTimeout(() => offsetRef.current?.focus(), 50);
			return () => clearTimeout(timer);
		} else if (wallPlacement.phase === 'settingLength') {
			setLengthValue('');
			const timer = setTimeout(() => lengthRef.current?.focus(), 50);
			return () => clearTimeout(timer);
		}
	}, [wallPlacement.phase]);

	const toolLabel =
		wallPlacement.tool === 'tall'
			? 'Tall Cabinet'
			: wallPlacement.tool === 'base'
				? 'Base Cabinet'
				: wallPlacement.tool === 'wall_cabinet'
					? 'Wall Cabinet'
					: wallPlacement.tool === 'door'
						? 'Door'
						: 'Window';

	const displayedOffsetCm =
		unit === 'm'
			? (currentOffsetCm / 100).toFixed(2)
			: `${currentOffsetCm}`;
	const displayedLengthCm =
		unit === 'm'
			? (currentLengthCm / 100).toFixed(2)
			: `${currentLengthCm}`;

	const handleOffsetKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			const num = parseFloat(offsetValue);
			if (!isNaN(num) && num >= 0) {
				const cm = unit === 'm' ? num * 100 : num;
				onOffsetConfirm(cm);
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onCancel();
		} else if (e.key === 'Tab') {
			e.preventDefault();
		}
	};

	const handleLengthKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			const num = parseFloat(lengthValue);
			if (!isNaN(num) && num > 0) {
				const cm = unit === 'm' ? num * 100 : num;
				onLengthConfirm(cm);
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onCancel();
		} else if (e.key === 'Tab') {
			e.preventDefault();
		}
	};

	return (
		<div
			className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
			data-testid="fixed-dimension-panel"
		>
			<div className="bg-card border border-border rounded-lg shadow-lg px-4 py-3 flex items-center gap-4 backdrop-blur-sm">
				<div
					className="text-xs font-semibold text-primary whitespace-nowrap"
					data-testid="text-panel-tool-label"
				>
					{toolLabel}
				</div>
				<div className="w-px h-8 bg-border" />
				<div className="flex items-center gap-1.5">
					<label className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
						Start
					</label>
					<div className="flex items-center bg-muted/50 border border-border rounded-md overflow-hidden">
						<input
							ref={offsetRef}
							type="number"
							value={
								wallPlacement.phase === 'settingOffset'
									? offsetValue
									: displayedOffsetCm
							}
							onChange={(e) => setOffsetValue(e.target.value)}
							onKeyDown={handleOffsetKeyDown}
							placeholder={displayedOffsetCm}
							disabled={wallPlacement.phase !== 'settingOffset'}
							className="w-16 h-7 px-2 text-sm font-mono bg-transparent text-foreground outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50"
							data-testid="input-start-offset"
							step="any"
							min="0"
						/>
						<span className="text-[10px] text-muted-foreground font-medium pr-2 select-none">
							{unit}
						</span>
					</div>
				</div>
				<div className="flex items-center gap-1.5">
					<label className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
						Length
					</label>
					<div className="flex items-center bg-muted/50 border border-border rounded-md overflow-hidden">
						<input
							ref={lengthRef}
							type="number"
							value={
								wallPlacement.phase === 'settingLength'
									? lengthValue
									: displayedLengthCm
							}
							onChange={(e) => setLengthValue(e.target.value)}
							onKeyDown={handleLengthKeyDown}
							placeholder={displayedLengthCm}
							disabled={wallPlacement.phase !== 'settingLength'}
							className="w-16 h-7 px-2 text-sm font-mono bg-transparent text-foreground outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50"
							data-testid="input-unit-length"
							step="any"
							min="0"
						/>
						<span className="text-[10px] text-muted-foreground font-medium pr-2 select-none">
							{unit}
						</span>
					</div>
				</div>
				<div className="w-px h-8 bg-border" />
				<div className="text-[10px] text-muted-foreground whitespace-nowrap">
					Enter to confirm · Esc to cancel
				</div>
			</div>
		</div>
	);
}

// Find the nearest wall endpoint (corner) to a given point within a radius
function findNearestCorner(
	pos: Point,
	walls: Wall[],
	radius: number
): { point: Point; wall: Wall; angle: number; wallLength: number } | null {
	let best: { point: Point; wall: Wall; angle: number; wallLength: number } | null = null;
	let bestDist = radius;
	for (const wall of walls) {
		const wallAngle = angleBetween(wall.start, wall.end);
		const wallLength = distanceBetween(wall.start, wall.end);
		const distS = distanceBetween(pos, wall.start);
		if (distS < bestDist) {
			bestDist = distS;
			best = { point: wall.start, wall, angle: wallAngle, wallLength };
		}
		const distE = distanceBetween(pos, wall.end);
		if (distE < bestDist) {
			bestDist = distE;
			// From end, direction goes back toward start
			best = { point: wall.end, wall, angle: wallAngle + Math.PI, wallLength };
		}
	}
	return best;
}

// ── Island walk-path geometry ────────────────────────────────────────────────
// Computes turn points from the 4-phase walk state.
// turn1 = anchor + WL along wall (signed by WL_direction)
// turn2 = turn1 + DL at DL_angle (= island's entry corner; stored as cabinet.start)
// turn3 = turn2 + CL at CL_angle (= opposite corner; stored as cabinet.end)
interface IslandWalkPoints {
	turn1: Point; // end of WL segment
	turn2: Point; // end of DL segment = cabinet corner
	turn3: Point; // end of CL segment = opposite corner along CL
}

function computeIslandWalk(ip: IslandPlacementState): IslandWalkPoints | null {
	if (!ip.anchorPoint) return null;
	const WL_px = cmToPixels(ip.WL_cm) * ip.WL_direction;
	const turn1: Point = {
		x: ip.anchorPoint.x + Math.cos(ip.wallAngle) * WL_px,
		y: ip.anchorPoint.y + Math.sin(ip.wallAngle) * WL_px,
	};
	const DL_px = cmToPixels(ip.DL_cm);
	const turn2: Point = {
		x: turn1.x + Math.cos(ip.DL_angle) * DL_px,
		y: turn1.y + Math.sin(ip.DL_angle) * DL_px,
	};
	const CL_px = cmToPixels(ip.CL_cm);
	const turn3: Point = {
		x: turn2.x + Math.cos(ip.CL_angle) * CL_px,
		y: turn2.y + Math.sin(ip.CL_angle) * CL_px,
	};
	return { turn1, turn2, turn3 };
}

// Distance input panel for electrical/plumbing placement (shown when corner is locked)
function WallPointDistancePanel({
	type,
	liveCm,
	unit,
	value,
	onChange,
	onConfirm,
	onCancel,
}: {
	type: 'electrical' | 'plumbing';
	liveCm: number;
	unit: 'cm' | 'm';
	value: string;
	onChange: (v: string) => void;
	onConfirm: (cm: number) => void;
	onCancel: () => void;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		const t = setTimeout(() => inputRef.current?.focus(), 50);
		return () => clearTimeout(t);
	}, []);

	const color = type === 'electrical' ? 'text-amber-500' : 'text-blue-500';
	const label = type === 'electrical' ? '⚡ Electrical' : '💧 Plumbing';
	const displayedLive = unit === 'm' ? (liveCm / 100).toFixed(2) : `${liveCm}`;

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			const num = parseFloat(value);
			const cm = !isNaN(num) && num >= 0
				? (unit === 'm' ? num * 100 : num)
				: liveCm;
			onConfirm(cm);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onCancel();
		}
	};

	return (
		<div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
			<div className="bg-card border border-border rounded-lg shadow-lg px-4 py-3 flex items-center gap-4 backdrop-blur-sm">
				<div className={`text-xs font-semibold ${color} whitespace-nowrap`}>{label}</div>
				<div className="w-px h-8 bg-border" />
				<div className="flex items-center gap-1.5">
					<label className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
						Distance from corner
					</label>
					<div className="flex items-center bg-muted/50 border border-border rounded-md overflow-hidden">
						<input
							ref={inputRef}
							type="number"
							value={value}
							onChange={(e) => onChange(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={displayedLive}
							className="w-20 h-7 px-2 text-sm font-mono bg-transparent text-foreground outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
							step="any"
							min="0"
						/>
						<span className="text-[10px] text-muted-foreground font-medium pr-2 select-none">{unit}</span>
					</div>
				</div>
				<div className="w-px h-8 bg-border" />
				<div className="text-[10px] text-muted-foreground whitespace-nowrap">
					Enter to confirm · Esc to cancel
				</div>
			</div>
		</div>
	);
}

export function DesignerCanvas({
	drawingState,
	onDrawingStateChange,
	onAddWall,
	onAddCabinet,
	onAddOpening,
	onUpdateWall,
	onUpdateCabinet,
	onMoveComplete,
	onDeleteItem,
	onSelectItem,
	onStageRef,
	referenceImage,
	stage,
	activeCustomTool,
	guidelines = [],
	onAddGuideline,
	onClearGuidelines,
	wallPoints = [],
	onAddWallPoint,
	onUpdateWallPoint,
	onDeleteWallPoint,
	canvasElements = [],
	activeElementDefId,
	onAddElement,
	onUpdateElement,
	onDeleteElement,
}: DesignerCanvasProps) {
	const stageRef = useRef<Konva.Stage>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	// ── New island drawing flow (2026-04-15 redesign) ──────────────────
	const islands = useCanvasStore((s) => s.islands);
	const islandDrawingState = useCanvasStore((s) => s.islandDrawingState);
	const setIslandPhase = useCanvasStore((s) => s.setIslandPhase);
	const addIslandAction = useCanvasStore((s) => s.addIsland);
	const updateIslandAction = useCanvasStore((s) => s.updateIsland);
	const cancelIslandDraw = useCanvasStore((s) => s.cancelIslandDraw);
	const activeLayerIdFromStore = useCanvasStore((s) => s.activeLayerId);
	const setActiveLayerFromStore = useCanvasStore((s) => s.setActiveLayer);
	const layersFromStore = useCanvasStore((s) => s.layers);
	const showReferenceOverlay = useCanvasStore((s) => s.showReferenceOverlay);
	const wallDrawMode = useCanvasStore((s) => s.wallDrawMode);
	const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number } | null>(null);
	// Typed input for length/depth during island draw (null = not typing, mouse drag is live)
	const [islandTypedInput, setIslandTypedInput] = useState<string | null>(null);
	// Drag state for moving an already-placed island via the Select tool
	const [islandDragState, setIslandDragState] = useState<{
		islandId: string;
		startMousePos: Point;
		originalAnchor: Point;
	} | null>(null);
	// Reset typed input when phase changes (e.g. click advances the phase)
	useEffect(() => {
		setIslandTypedInput(null);
	}, [islandDrawingState.phase]);
	const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
	const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
	const [scale, setScale] = useState(1);
	const [mousePos, setMousePos] = useState<Point | null>(null);
	const [snapResult, setSnapResult] = useState<SnapResult | null>(null);
	// True when primary pointer is coarse (finger/stylus). Used to upscale
	// snap halos and other precision-critical affordances.
	const isTouch = useIsTouch();

	// ── Long-press context menu ─────────────────────────────────────────────
	// When the user holds on a cabinet/wall/opening for ~500ms, show a
	// floating action menu (delete, flip depth, duplicate stub, properties).
	// Timer + "start pos" live in refs so we can cancel on move/up without
	// React re-renders.
	const [contextMenu, setContextMenu] = useState<{
		screenX: number;
		screenY: number;
		itemType: 'cabinet' | 'wall' | 'opening' | 'guideline';
		itemId: string;
	} | null>(null);
	const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
	const cancelLongPress = useCallback(() => {
		if (longPressTimerRef.current) {
			clearTimeout(longPressTimerRef.current);
			longPressTimerRef.current = null;
		}
		longPressStartRef.current = null;
	}, []);
	const [showDimensionInput, setShowDimensionInput] = useState(false);
	const [isPanning, setIsPanning] = useState(false);
	const [dragState, setDragState] = useState<DragState | null>(null);
	const [wallPlacement, setWallPlacement] =
		useState<WallPlacementState | null>(null);
	// Measure tape state
	const [measureTape, setMeasureTape] = useState<{ startPoint: Point } | null>(null);
	const shiftHeldRef = useRef(false);
	const [islandPlacement, setIslandPlacement] = useState<IslandPlacementState | null>(null);
	const [hoveredWallId, setHoveredWallId] = useState<string | null>(null);
	const [wallAnchorPoints, setWallAnchorPoints] = useState<AnchorPoint[]>([]);
	const [refImg, setRefImg] = useState<HTMLImageElement | null>(null);
	const [wallPointPlacement, setWallPointPlacement] =
		useState<WallPointPlacementState | null>(null);
	const [hoveredCorner, setHoveredCorner] = useState<{
		point: Point;
		wall: Wall;
		angle: number;
		wallLength: number;
	} | null>(null);
	const [wpDistanceInput, setWpDistanceInput] = useState('');
	const [showWallPointForm, setShowWallPointForm] = useState(false);
	const [selectedWallPoint, setSelectedWallPoint] =
		useState<WallPointItem | null>(null);
	const [editingWallPoint, setEditingWallPoint] =
		useState<WallPointItem | null>(null);

	// ─── Wall chain state (2026-04-21 redesign) ─────────────────────────────
	type WallChainState =
		| { phase: 'idle' }
		| { phase: 'pickingStart' }
		| {
				phase: 'drawingSegment';
				anchor: Point;
				segments: Array<{ start: Point; end: Point }>;
		  };

	const [wallChainState, setWallChainState] = useState<WallChainState>({
		phase: 'idle',
	});
	const wallChainStateRef = useRef<WallChainState>(wallChainState);
	useEffect(() => {
		wallChainStateRef.current = wallChainState;
	}, [wallChainState]);

	// Typed-length input for wall chain drawing (mirrors the island pattern).
	// When non-null, indicates the user is typing an exact length in cm for the
	// current segment; on Enter we commit the segment at that length along the
	// snapped direction from the chain anchor.
	const [wallTypedInput, setWallTypedInput] = useState<string | null>(null);

	// Tablet "directional cross" wall input. When the user is in cross mode
	// (Toolbar toggle, store.wallDrawMode === "cross") and has tapped one of
	// the 4 cardinal arrows after dropping the chain anchor, this records the
	// chosen axis. On Enter (or "=" on the on-screen keypad) the commit logic
	// builds a virtual cursor offset from the anchor in this direction so the
	// existing getConstrainedEnd path produces the same axis-aligned segment
	// as if the user had dragged in that direction. Reset to null after each
	// segment commits so the user picks a fresh direction for the next leg.
	const [lockedDirection, setLockedDirection] = useState<
		"left" | "right" | "up" | "down" | null
	>(null);

	const [closedChainIds, setClosedChainIds] = useState<Set<string>>(new Set());
	const lastWallClickRef = useRef<{ time: number; pos: Point } | null>(null);

	useEffect(() => {
		if (!referenceImage) {
			setRefImg(null);
			return;
		}
		const img = new window.Image();
		img.onload = () => setRefImg(img);
		img.src = referenceImage;
	}, [referenceImage]);

	useEffect(() => {
		if (drawingState.tool !== 'pan') {
			setIsPanning(false);
		}
	}, [drawingState.tool]);

	useEffect(() => {
		if (onStageRef) {
			onStageRef(stageRef.current);
		}
	});

	useEffect(() => {
		const updateDimensions = () => {
			if (containerRef.current) {
				setDimensions({
					width: containerRef.current.offsetWidth,
					height: containerRef.current.offsetHeight,
				});
			}
		};
		updateDimensions();
		window.addEventListener('resize', updateDimensions);
		return () => window.removeEventListener('resize', updateDimensions);
	}, []);

	useEffect(() => {
		if (wallPlacement && drawingState.tool !== wallPlacement.tool) {
			setWallPlacement(null);
			setShowDimensionInput(false);
			setHoveredWallId(null);
			onDrawingStateChange((prev) => ({
				...prev,
				startPoint: null,
				previewPoint: null,
				isDrawing: false,
			}));
		}
		if (!isWallPlacementTool(drawingState.tool)) {
			setHoveredWallId(null);
		}
	}, [drawingState.tool, wallPlacement, onDrawingStateChange]);

	useEffect(() => {
		// Reset all wall-point placement state when tool changes
		setWallPointPlacement(null);
		setHoveredCorner(null);
		setWpDistanceInput('');
		if (!activeCustomTool || (activeCustomTool !== 'electrical' && activeCustomTool !== 'plumbing')) {
			setShowWallPointForm(false);
			setEditingWallPoint(null);
		}
		if (activeCustomTool !== 'measure_tape') {
			setMeasureTape(null);
		}
		if (USE_LEGACY_ISLAND_TOOL && activeCustomTool !== 'island') {
			setIslandPlacement(null);
		}
	}, [activeCustomTool]);

	// Track Shift key for ortho-lock in measure tape
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => { shiftHeldRef.current = e.shiftKey; };
		const onKeyUp = (e: KeyboardEvent) => { shiftHeldRef.current = e.shiftKey; };
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	}, []);

	const getPointerPos = useCallback(
		(e: KonvaEventObject<MouseEvent | TouchEvent>) => {
			const konvaStage = stageRef.current;
			if (!konvaStage) {
				return null;
			}
			const pos = konvaStage.getPointerPosition();
			if (!pos) {
				return null;
			}
			return {
				x: (pos.x - stagePos.x) / scale,
				y: (pos.y - stagePos.y) / scale,
			};
		},
		[stagePos, scale]
	);

	const constrainToAxis = useCallback((start: Point, end: Point): Point => {
		const dx = end.x - start.x;
		const dy = end.y - start.y;
		if (Math.abs(dx) > Math.abs(dy)) {
			return { x: end.x, y: start.y };
		}
		return { x: start.x, y: end.y };
	}, []);

	// Snap a point to one of 4 wall-relative cardinal directions (0°, 90°, 180°, 270° from wallAngle).
	// Returns the snapped endpoint where the direction from origin is the closest cardinal.
	const snapToWallOrtho = useCallback(
		(origin: Point, mouse: Point, wallAngle: number): Point => {
			const dx = mouse.x - origin.x;
			const dy = mouse.y - origin.y;
			const rawAngle = Math.atan2(dy, dx);
			const candidates = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map(
				(d) => wallAngle + d
			);
			const angleDiff = (a: number, b: number) => {
				let d = ((a - b) % (2 * Math.PI)) + 2 * Math.PI;
				d = d % (2 * Math.PI);
				return Math.min(d, 2 * Math.PI - d);
			};
			let best = candidates[0];
			let bestDiff = angleDiff(candidates[0], rawAngle);
			for (let i = 1; i < candidates.length; i++) {
				const diff = angleDiff(candidates[i], rawAngle);
				if (diff < bestDiff) {
					best = candidates[i];
					bestDiff = diff;
				}
			}
			// Project raw vector onto snapped axis; magnitude = |projection|
			const cosA = Math.cos(best);
			const sinA = Math.sin(best);
			const proj = dx * cosA + dy * sinA;
			const mag = Math.max(0, proj); // clamp negative (180° flip was already picked by snap)
			return { x: origin.x + cosA * mag, y: origin.y + sinA * mag };
		},
		[]
	);

	// ─── Commit the in-progress wall chain into real Wall records ──────────
	const commitChain = useCallback(() => {
		const state = wallChainStateRef.current;
		if (state.phase !== 'drawingSegment' || state.segments.length === 0) {
			setWallChainState({ phase: 'idle' });
			return;
		}

		// Detect closed polygon
		const firstStart = state.segments[0].start;
		const lastEnd = state.segments[state.segments.length - 1].end;
		const isClosed =
			state.segments.length >= 3 &&
			distanceBetween(firstStart, lastEnd) < SNAP_RADIUS;

		const segments = [...state.segments];
		if (isClosed) {
			segments[segments.length - 1] = {
				...segments[segments.length - 1],
				end: { ...firstStart },
			};
		}

		// Create Wall records and add them via existing store action
		const newWallIds: string[] = [];
		for (const seg of segments) {
			const wall: Wall = {
				id: generateId(),
				start: { ...seg.start },
				end: { ...seg.end },
				thickness: WALL_THICKNESS,
			};
			onAddWall(wall);
			newWallIds.push(wall.id);
		}

		if (isClosed) {
			setClosedChainIds((prev) => {
				const next = new Set(prev);
				for (const id of newWallIds) next.add(id);
				return next;
			});
		}

		setWallChainState({ phase: 'idle' });
	}, [onAddWall]);

	// Activate chain mode when Wall tool is selected; commit on tool switch
	useEffect(() => {
		if (drawingState.tool === 'wall') {
			if (wallChainStateRef.current.phase === 'idle') {
				setWallChainState({ phase: 'pickingStart' });
			}
		} else {
			if (wallChainStateRef.current.phase === 'drawingSegment') {
				commitChain();
			}
			if (wallChainStateRef.current.phase !== 'idle') {
				setWallChainState({ phase: 'idle' });
			}
		}
	}, [drawingState.tool, commitChain]);

	// Detect closed cycles whenever walls change
	useEffect(() => {
		const cycles = findAllClosedCycles(drawingState.walls);
		const ids = new Set<string>();
		for (const cycle of cycles) {
			for (const w of cycle) ids.add(w.id);
		}
		setClosedChainIds(ids);
	}, [drawingState.walls]);

	const createElementAtPoints = useCallback(
		(
			startPoint: Point,
			endPoint: Point,
			tool: DrawingState['tool'],
			walls: Wall[],
			parentWallId?: string
		) => {
			const connection = connectWalls(endPoint, walls);
			const finalEnd = connection.point;

			if (tool === 'wall') {
				// If the start point lies on an existing wall's inner face,
				// orient the new wall so its outward normal matches that wall's
				// (same room interior on both walls). Without this, drawing wall 2
				// in certain directions would put its thickness INTO the room.
				const anchor = findAnchorWallByInnerFace(startPoint, walls);
				const oriented = anchor
					? orientNewWallFromAnchor(startPoint, finalEnd, anchor, walls)
					: { start: startPoint, end: finalEnd };
				const wall: Wall = {
					id: generateId(),
					start: { ...oriented.start },
					end: { ...oriented.end },
					thickness: WALL_THICKNESS,
				};
				onAddWall(wall);
				haptic('medium');
			} else if (tool === 'door' || tool === 'window') {
				// Align opening endpoints with wall direction so downstream
				// rendering is consistent regardless of user drag direction.
				const parentWall = parentWallId
					? walls.find((w) => w.id === parentWallId)
					: undefined;
				const { aStart, aEnd } = alignToWall(
					startPoint,
					finalEnd,
					parentWall
				);
				const opening: Opening = {
					id: generateId(),
					type: tool as OpeningType,
					start: { ...aStart },
					end: { ...aEnd },
					length: distanceBetween(aStart, aEnd),
					wallId: parentWallId,
				};
				onAddOpening(opening);
				haptic('medium');
			} else if (
				tool === 'base' ||
				tool === 'wall_cabinet' ||
				tool === 'tall'
			) {
				// Align cabinet endpoints with wall direction so the cabinet's
				// local frame (rotated by angleBetween(start,end)) matches the
				// wall's frame. Depth direction is then decided by the wall's
				// interior normal — fully independent of cursor drag direction.
				const parentWall = parentWallId
					? walls.find((w) => w.id === parentWallId)
					: undefined;
				const { aStart, aEnd } = alignToWall(
					startPoint,
					finalEnd,
					parentWall
				);
				const flipped = parentWall
					? calculateDepthDirection(parentWall, walls)
					: false;
				// Prefer the active layer's depth (set by the user in the side
				// panel) over the hard-coded default. Fallback to the default
				// only when the layer has no explicit depth yet.
				const activeLayer = useCanvasStore
					.getState()
					.layers.find((l) => l.id === activeLayerIdFromStore);
				const initialDepth =
					activeLayer && typeof activeLayer.depth === 'number'
						? activeLayer.depth
						: CABINET_DEPTHS[tool as CabinetType];
				const cabinet: Cabinet = {
					id: generateId(),
					type: tool as CabinetType,
					start: { ...aStart },
					end: { ...aEnd },
					depth: initialDepth,
					length: distanceBetween(aStart, aEnd),
					depthFlipped: flipped,
					wallId: parentWallId,
				};
				onAddCabinet(cabinet);
				haptic('medium');
			}
		},
		[onAddWall, onAddCabinet, onAddOpening, activeLayerIdFromStore]
	);

	const handleWheel = useCallback(
		(e: KonvaEventObject<WheelEvent>) => {
			e.evt.preventDefault();
			const konvaStage = stageRef.current;
			if (!konvaStage) {
				return;
			}

			const oldScale = scale;
			const pointer = konvaStage.getPointerPosition();
			if (!pointer) {
				return;
			}

			const scaleBy = 1.08;
			const newScale =
				e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
			const clampedScale = Math.max(0.1, Math.min(5, newScale));

			const mousePointTo = {
				x: (pointer.x - stagePos.x) / oldScale,
				y: (pointer.y - stagePos.y) / oldScale,
			};

			setScale(clampedScale);
			setStagePos({
				x: pointer.x - mousePointTo.x * clampedScale,
				y: pointer.y - mousePointTo.y * clampedScale,
			});
		},
		[scale, stagePos]
	);

	// ── Touch gesture: pinch-to-zoom + two-finger pan ──────────────────────
	// pinchState persists across mousedown/move/up handlers; we use a ref so
	// updates don't cause React re-renders mid-gesture (would drop frames).
	const pinchStateRef = useRef<{
		// True while two fingers are down — the mouse-equivalent handlers
		// check this and early-return so drawing doesn't start mid-pinch.
		active: boolean;
		// Initial distance between the two fingers in stage coords.
		startDist: number;
		// Scale at the moment the gesture started, so we scale relative to it.
		startScale: number;
		// Stage position at the moment the gesture started.
		startStagePos: { x: number; y: number };
		// Midpoint between the two fingers when the gesture started, in
		// client (screen) coords — used as the zoom focal point.
		startMidClient: { x: number; y: number };
	}>({
		active: false,
		startDist: 0,
		startScale: 1,
		startStagePos: { x: 0, y: 0 },
		startMidClient: { x: 0, y: 0 },
	});

	const getTouchMidAndDist = (t1: Touch, t2: Touch) => {
		const dx = t2.clientX - t1.clientX;
		const dy = t2.clientY - t1.clientY;
		return {
			dist: Math.hypot(dx, dy),
			midClient: {
				x: (t1.clientX + t2.clientX) / 2,
				y: (t1.clientY + t2.clientY) / 2,
			},
		};
	};

	const handleTouchStart = useCallback(
		(e: KonvaEventObject<TouchEvent>) => {
			const touches = e.evt.touches;
			if (touches.length === 2) {
				e.evt.preventDefault();
				const { dist, midClient } = getTouchMidAndDist(
					touches[0],
					touches[1],
				);
				pinchStateRef.current = {
					active: true,
					startDist: dist,
					startScale: scale,
					startStagePos: { ...stagePos },
					startMidClient: midClient,
				};
			}
		},
		[scale, stagePos],
	);

	const handleTouchMove = useCallback((e: KonvaEventObject<TouchEvent>) => {
		const touches = e.evt.touches;
		const state = pinchStateRef.current;
		if (!state.active || touches.length < 2) return;
		e.evt.preventDefault();

		const { dist, midClient } = getTouchMidAndDist(touches[0], touches[1]);
		if (state.startDist < 1) return;

		// Scale factor is current/initial distance, clamped to the same
		// range the wheel-zoom uses so users can't over-zoom into oblivion.
		const rawScale = state.startScale * (dist / state.startDist);
		const newScale = Math.max(0.1, Math.min(5, rawScale));

		// Convert the gesture's starting midpoint from client coords into
		// the canvas container's local space so it stays anchored while
		// both scale and pan evolve. (Matches the handleWheel pattern.)
		const container = stageRef.current?.container();
		if (!container) return;
		const rect = container.getBoundingClientRect();
		const anchorLocal = {
			x: state.startMidClient.x - rect.left,
			y: state.startMidClient.y - rect.top,
		};
		const worldPointAtAnchor = {
			x: (anchorLocal.x - state.startStagePos.x) / state.startScale,
			y: (anchorLocal.y - state.startStagePos.y) / state.startScale,
		};

		// Pan = (current midpoint - initial midpoint) in screen coords
		const panDelta = {
			x: midClient.x - state.startMidClient.x,
			y: midClient.y - state.startMidClient.y,
		};

		setScale(newScale);
		setStagePos({
			x: anchorLocal.x - worldPointAtAnchor.x * newScale + panDelta.x,
			y: anchorLocal.y - worldPointAtAnchor.y * newScale + panDelta.y,
		});
	}, []);

	const handleTouchEnd = useCallback((e: KonvaEventObject<TouchEvent>) => {
		// Fewer than 2 fingers remaining → exit pinch mode. If the user lifts
		// one finger but keeps the other down, we still exit — avoids the
		// single-remaining finger being interpreted as a fresh draw gesture
		// mid-motion.
		if (e.evt.touches.length < 2) {
			pinchStateRef.current.active = false;
		}
	}, []);

	// ── New island flow click handler (free H/V 3-click drawing, no walls) ──
	const handleIslandClick = useCallback(
		(worldPoint: Point) => {
			const state = useCanvasStore.getState();
			const phase = state.islandDrawingState;

			switch (phase.phase) {
				case 'pickingCorner1': {
					setIslandPhase({
						phase: 'draggingLength',
						anchor: worldPoint,
					});
					return;
				}
				case 'draggingLength': {
					const dx = worldPoint.x - phase.anchor.x;
					const dy = worldPoint.y - phase.anchor.y;
					if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
					const axis: 'h' | 'v' = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
					const lengthPx = axis === 'h' ? Math.abs(dx) : Math.abs(dy);
					const lengthCm = Math.round(lengthPx / PIXELS_PER_CM);
					if (lengthCm < 1) return;
					const lengthSign = axis === 'h' ? dx : dy;
					setIslandPhase({
						phase: 'draggingDepth',
						anchor: phase.anchor,
						lengthCm,
						axis,
						lengthSign,
					});
					return;
				}
				case 'draggingDepth': {
					if (!activeLayerIdFromStore) return;
					const depthPx =
						phase.axis === 'h'
							? Math.abs(worldPoint.y - phase.anchor.y)
							: Math.abs(worldPoint.x - phase.anchor.x);
					const depthCm = Math.round(depthPx / PIXELS_PER_CM);
					if (depthCm < 1) return;
					const depthSign =
						phase.axis === 'h'
							? worldPoint.y - phase.anchor.y
							: worldPoint.x - phase.anchor.x;
					// Top-left corner = min of anchor and drawn endpoint on each axis
					const lengthPx = phase.lengthCm * PIXELS_PER_CM;
					const rectX =
						phase.axis === 'h'
							? Math.min(phase.anchor.x, phase.anchor.x + (phase.lengthSign >= 0 ? 0 : -lengthPx))
							: Math.min(phase.anchor.x, phase.anchor.x + (depthSign >= 0 ? 0 : -depthPx));
					const rectY =
						phase.axis === 'v'
							? Math.min(phase.anchor.y, phase.anchor.y + (phase.lengthSign >= 0 ? 0 : -lengthPx))
							: Math.min(phase.anchor.y, phase.anchor.y + (depthSign >= 0 ? 0 : -depthPx));
					const island: Island = {
						id: `island_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
						layerId: activeLayerIdFromStore,
						referenceWallId: '',
						offsetFromWallCm: 0,
						depthSide: 'far',
						anchorPoint: { x: rectX, y: rectY },
						lengthCm: phase.lengthCm,
						depthCm,
						rotationRad: 0,
						heightCm: 77,
						axis: phase.axis,
					};
					addIslandAction(island);
					setIslandPhase({ phase: 'idle' });
					return;
				}
				default:
					return;
			}
		},
		[setIslandPhase, addIslandAction, activeLayerIdFromStore]
	);

	const handleMouseDown = useCallback(
		(e: KonvaEventObject<MouseEvent>) => {
			// Pinch/pan in progress? Swallow mouse-like events so we don't
			// start a draw/select gesture while the user is just zooming.
			if (pinchStateRef.current.active) return;

			if (e.evt.button === 1) {
				setIsPanning(true);
				return;
			}

			if (e.evt.button !== 0) {
				return;
			}

			if (drawingState.tool === 'pan') {
				setIsPanning(true);
				return;
			}

			// Site measurement now has its own separate canvas —
			// all tools are allowed (walls, doors, windows, cabinets, electrical, plumbing).

			const pos = getPointerPos(e);
			if (!pos) {
				return;
			}

			// ── New island drawing flow: intercept clicks while drawing ──
			{
				const islandPhase = useCanvasStore.getState().islandDrawingState;
				if (islandPhase.phase !== 'idle') {
					handleIslandClick(pos);
					return;
				}
			}

			const {
				tool,
				walls,
				cabinets,
				isDrawing,
				startPoint,
				snapEnabled,
			} = drawingState;

			// ── Measure Tape placement ──────────────────────────────────────
			if (activeCustomTool === 'measure_tape') {
				const snappedPos = snapResult?.point ?? pos;
				const finalPos = measureTape
					? constrainToAxis(measureTape.startPoint, snappedPos)
					: snappedPos;
				if (!measureTape) {
					// First click: just remember the anchor locally. We no
					// longer persist a single-point "dot" guideline here,
					// because it would survive past chain commit and couldn't
					// be removed together with its measurement line. The live
					// preview draws an anchor dot visually while the chain is
					// active.
					setMeasureTape({ startPoint: finalPos });
				} else {
					// Subsequent click: save the full segment guideline.
					onAddGuideline?.({ id: generateId(), start: measureTape.startPoint, end: finalPos });
					setMeasureTape({ startPoint: finalPos });
				}
				return;
			}

			// ── Island Cabinet: 4-Phase CAD-Walk ──────────────────────────────
			if (USE_LEGACY_ISLAND_TOOL && activeCustomTool === 'island') {
				if (!islandPlacement || islandPlacement.phase === 'pickingAnchor') {
					// Phase 0: click must land on a visible wall anchor (within 15px)
					const ANCHOR_HIT_RADIUS = 15;
					let hit: { point: Point } | null = null;
					for (const a of wallAnchorPoints) {
						if (distanceBetween(pos, a.point) <= ANCHOR_HIT_RADIUS) {
							hit = { point: a.point };
							break;
						}
					}
					// Fallback: wall corners via findNearestCorner
					if (!hit) {
						const corner = findNearestCorner(pos, walls, ANCHOR_HIT_RADIUS);
						if (corner) hit = { point: corner.point };
					}
					if (!hit || !hoveredWallId) return;
					const anchorWall = walls.find((w) => w.id === hoveredWallId);
					if (!anchorWall) return;
					const wallAngle = angleBetween(anchorWall.start, anchorWall.end);
					setIslandPlacement({
						phase: 'settingWL',
						anchorPoint: hit.point,
						anchorWallId: anchorWall.id,
						wallAngle,
						WL_cm: 0,
						WL_direction: 1,
						DL_cm: 0,
						DL_angle: wallAngle + Math.PI / 2, // default: perpendicular-into-room (ghost will correct via mouse)
						CL_cm: 0,
						CL_angle: wallAngle,
						CD_cm: 60,
						CD_flipped: false,
					});
					return;
				}
				// Phases 1-4: clicks confirm current mouse-derived value and advance
				const ip = islandPlacement;
				if (ip.phase === 'settingWL') {
					// Project mouse onto wall axis; clamp to wall length
					const dx = pos.x - ip.anchorPoint!.x;
					const dy = pos.y - ip.anchorPoint!.y;
					const proj = dx * Math.cos(ip.wallAngle) + dy * Math.sin(ip.wallAngle);
					const anchorWall = walls.find((w) => w.id === ip.anchorWallId);
					if (!anchorWall) return;
					const wallLen = distanceBetween(anchorWall.start, anchorWall.end);
					// Clamp WL: from anchor, can go forward (+proj) up to (wall.end - anchor dist) OR backward to (wall.start - anchor dist)
					const anchorProj =
						(ip.anchorPoint!.x - anchorWall.start.x) * Math.cos(ip.wallAngle) +
						(ip.anchorPoint!.y - anchorWall.start.y) * Math.sin(ip.wallAngle);
					const maxFwd = wallLen - anchorProj;
					const maxBwd = -anchorProj;
					const clamped = Math.max(maxBwd, Math.min(maxFwd, proj));
					const WL_px = Math.abs(clamped);
					const dir: 1 | -1 = clamped >= 0 ? 1 : -1;
					setIslandPlacement({
						...ip,
						phase: 'settingDL',
						WL_cm: pixelsToCm(WL_px),
						WL_direction: dir,
					});
					return;
				}
				if (ip.phase === 'settingDL') {
					const walk0 = computeIslandWalk({ ...ip, DL_cm: 0 });
					if (!walk0) return;
					const origin = walk0.turn1;
					let target = pos;
					if (!shiftHeldRef.current) {
						target = snapToWallOrtho(origin, pos, ip.wallAngle);
					}
					const DL_px = distanceBetween(origin, target);
					if (DL_px < 5) return;
					const DL_angle = angleBetween(origin, target);
					setIslandPlacement({
						...ip,
						phase: 'settingCL',
						DL_cm: pixelsToCm(DL_px),
						DL_angle,
					});
					return;
				}
				if (ip.phase === 'settingCL') {
					const walk0 = computeIslandWalk({ ...ip, CL_cm: 0 });
					if (!walk0) return;
					const origin = walk0.turn2;
					let target = pos;
					if (!shiftHeldRef.current) {
						target = snapToWallOrtho(origin, pos, ip.wallAngle);
					}
					const CL_px = distanceBetween(origin, target);
					if (CL_px < 5) return;
					const CL_angle = angleBetween(origin, target);
					setIslandPlacement({
						...ip,
						phase: 'settingCD',
						CL_cm: pixelsToCm(CL_px),
						CL_angle,
					});
					return;
				}
				if (ip.phase === 'settingCD') {
					// Perpendicular to CL axis; mouse side picks flipped
					const walk = computeIslandWalk(ip);
					if (!walk) return;
					const origin = walk.turn2;
					const CL_dx = Math.cos(ip.CL_angle);
					const CL_dy = Math.sin(ip.CL_angle);
					const mx = pos.x - origin.x;
					const my = pos.y - origin.y;
					// Perpendicular projection: flip sign indicates which side
					const perpSigned = -CL_dy * mx + CL_dx * my; // CCW perp
					const CD_px = Math.abs(perpSigned);
					if (CD_px < 5) return;
					const CD_flipped = perpSigned < 0;
					const committed: IslandPlacementState = {
						...ip,
						CD_cm: pixelsToCm(CD_px),
						CD_flipped,
					};
					const finalWalk = computeIslandWalk(committed);
					if (!finalWalk || committed.CL_cm <= 0 || committed.CD_cm <= 0) return;
					onAddCabinet({
						id: generateId(),
						type: 'island',
						start: finalWalk.turn2,
						end: finalWalk.turn3,
						depth: committed.CD_cm,
						length: committed.CL_cm,
						depthFlipped: committed.CD_flipped,
					});
					setIslandPlacement(null);
					return;
				}
				return;
			}

			// Wall-point placement (electrical / plumbing)
			if (
				(activeCustomTool === 'electrical' ||
					activeCustomTool === 'plumbing') &&
				!showWallPointForm
			) {
				// Check existing wall points FIRST — clicking one selects it (via Circle onClick)
				const hitWP = wallPoints.find(
					(wp) =>
						distanceBetween(pos, { x: wp.posX, y: wp.posY }) <= 16
				);
				if (hitWP) {
					return;
				}

				if (!wallPointPlacement) {
					// Phase 0 → Phase 1: lock the nearest corner
					const corner = hoveredCorner ?? findNearestCorner(pos, walls, 60);
					if (corner) {
						setHoveredCorner(null);
						setWpDistanceInput('');
						setWallPointPlacement({
							type: activeCustomTool,
							phase: 'cornerLocked',
							cornerPoint: corner.point,
							cornerWall: corner.wall,
							wallAngle: corner.angle,
							wallLength: corner.wallLength,
							distancePx: 0,
							position: corner.point,
						});
					}
				} else if (wallPointPlacement.phase === 'cornerLocked') {
					// Phase 1 → form: confirm current distance and open form
					const inputNum = parseFloat(wpDistanceInput);
					const confirmedDistanceCm = !isNaN(inputNum) && inputNum >= 0
						? Math.round(drawingState.unit === 'm' ? inputNum * 100 : inputNum)
						: Math.round(pixelsToCm(wallPointPlacement.distancePx));
					const distPx = cmToPixels(confirmedDistanceCm);
					const cos = Math.cos(wallPointPlacement.wallAngle);
					const sin = Math.sin(wallPointPlacement.wallAngle);
					const finalPos = {
						x: wallPointPlacement.cornerPoint.x + cos * distPx,
						y: wallPointPlacement.cornerPoint.y + sin * distPx,
					};
					setWallPointPlacement({
						...wallPointPlacement,
						distancePx: distPx,
						position: finalPos,
						confirmedDistanceCm,
					});
					setShowWallPointForm(true);
					setWpDistanceInput('');
				}
				return;
			}

			// Element placement — intercepts all tools when an element is selected
			if (activeElementDefId != null && onAddElement) {
				const snapPos = snapResult?.point ?? pos;
				// name/category/icon are enriched in project-detail from the def list
				onAddElement({
					id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
					definitionId: activeElementDefId,
					x: snapPos.x,
					y: snapPos.y,
					rotation: 0,
					// name/category/icon resolved in project-detail from the def list
					name: '',
					category: '',
					icon: '',
				});
				return;
			}

			// Cabinets sorted so the one belonging to the top-most layer in
			// the Layers panel is checked first by findHitTarget (Photoshop
			// semantics: top-of-list wins when overlapping). Unlayered
			// cabinets fall to the bottom of the pick order.
			const layerIndexById = new Map<string, number>();
			layersFromStore.forEach((l, i) => layerIndexById.set(l.id, i));
			const pickOrderCabinets = [...cabinets].sort((a, b) => {
				const lA = a.layerId ? layerIndexById.get(a.layerId) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
				const lB = b.layerId ? layerIndexById.get(b.layerId) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
				if (lA !== lB) return lA - lB;
				return cabinets.indexOf(a) - cabinets.indexOf(b);
			});

			if (tool === 'delete') {
				// Priority 1: measurements (guidelines). Thin annotations
				// that are almost impossible to hit if cabinets/walls claim
				// the click first — so give them top priority here.
				const guidelineHitRadius = 10;
				let gHit: Guideline | null = null;
				let gBestDist = guidelineHitRadius;
				for (const g of guidelines) {
					const isPoint = distanceBetween(g.start, g.end) < 0.5;
					if (isPoint) {
						const d = distanceBetween(pos, g.start);
						if (d <= gBestDist) {
							gBestDist = d;
							gHit = g;
						}
					} else if (pointNearLine(pos, g.start, g.end, guidelineHitRadius)) {
						// Approximate distance: perpendicular to the segment.
						const dx = g.end.x - g.start.x;
						const dy = g.end.y - g.start.y;
						const len = Math.hypot(dx, dy) || 1;
						const d = Math.abs(((pos.x - g.start.x) * dy - (pos.y - g.start.y) * dx) / len);
						if (d <= gBestDist) {
							gBestDist = d;
							gHit = g;
						}
					}
				}
				if (gHit) {
					haptic('heavy');
					onDeleteItem(gHit.id);
					return;
				}

				// Priority 2: wall points (electrical / plumbing markers).
				// They live in a separate state and have numeric ids, so
				// they aren't part of findHitTarget.
				const wpHitRadius = 14;
				let wpHit: WallPointItem | null = null;
				let wpBestDist = wpHitRadius;
				for (const wp of wallPoints) {
					const d = distanceBetween(pos, { x: wp.posX, y: wp.posY });
					if (d <= wpBestDist) {
						wpBestDist = d;
						wpHit = wp;
					}
				}
				if (wpHit) {
					haptic('heavy');
					onDeleteWallPoint?.(wpHit.id);
					return;
				}

				// Priority 3: walls / cabinets / openings via the shared
				// hit-test. Guidelines are omitted from this call now —
				// they were handled above.
				const hit = findHitTarget(
					pos,
					walls,
					pickOrderCabinets,
					12,
					drawingState.openings,
				);
				if (hit) {
					haptic('heavy');
					onDeleteItem(hit.id);
				}
				return;
			}

			if (tool === 'select') {
				// Photoshop pick order: whichever item belongs to the highest
				// layer (smallest layer index) wins when overlapping.
				// Check candidates from islands + cabinets, keep the one with
				// the smallest layer index. Ties fall back to z-order within
				// their own domain (islands check last-first, cabinets follow
				// pickOrderCabinets).
				const islandsNow = useCanvasStore.getState().islands;
				const islandHitCandidate = findIslandHit(pos, islandsNow);
				const cabinetHitCandidate = findHitTarget(
					pos,
					walls,
					pickOrderCabinets,
					12,
					drawingState.openings
				);
				const layerIndexOfId = (id: string | undefined): number => {
					if (!id) return Number.POSITIVE_INFINITY;
					return layerIndexById.get(id) ?? Number.POSITIVE_INFINITY;
				};
				const islandLayerIdx = islandHitCandidate
					? layerIndexOfId(islandHitCandidate.layerId)
					: Number.POSITIVE_INFINITY;
				const cabinetLayerIdx = cabinetHitCandidate?.type === 'cabinet'
					? layerIndexOfId(
						cabinets.find((c) => c.id === cabinetHitCandidate.id)?.layerId,
					)
					: Number.POSITIVE_INFINITY;
				const islandWins =
					islandHitCandidate !== null &&
					(cabinetHitCandidate === null || islandLayerIdx <= cabinetLayerIdx);
				if (islandWins && islandHitCandidate) {
					setActiveLayerFromStore(islandHitCandidate.layerId);
					onSelectItem(islandHitCandidate.id);
					setIslandDragState({
						islandId: islandHitCandidate.id,
						startMousePos: { ...pos },
						originalAnchor: { ...islandHitCandidate.anchorPoint },
					});
					return;
				}

				const hit = cabinetHitCandidate;
				if (hit) {
					onSelectItem(hit.id);

					if (hit.type === 'wall' || hit.type === 'cabinet') {
						const item =
							hit.type === 'wall'
								? walls.find((w) => w.id === hit.id)
								: cabinets.find((c) => c.id === hit.id);

						if (item) {
							setDragState({
								itemId: hit.id,
								itemType: hit.type,
								handle: hit.handle,
								startMousePos: { ...pos },
								originalStart: { ...item.start },
								originalEnd: { ...item.end },
							});
						}
					}

					// Arm long-press for the context menu. If the pointer moves
					// more than ~8px OR lifts before 500ms, we cancel in the
					// move / up handlers.
					longPressStartRef.current = { x: pos.x, y: pos.y };
					const clientX = (e.evt as MouseEvent).clientX ?? 0;
					const clientY = (e.evt as MouseEvent).clientY ?? 0;
					longPressTimerRef.current = setTimeout(() => {
						setContextMenu({
							screenX: clientX,
							screenY: clientY,
							itemType: hit.type,
							itemId: hit.id,
						});
						haptic('medium');
					}, 500);
				} else {
					onSelectItem(null);
				}
				return;
			}

			// ── Wall chain flow: intercept wall-tool clicks ──
			if (tool === 'wall') {
				const chainState = wallChainStateRef.current;
				const now = Date.now();

				// Double-click detection: two clicks within 300ms, within 10px
				const last = lastWallClickRef.current;
				const isDblClick =
					!!last && now - last.time < 300 && distanceBetween(pos, last.pos) < 10;
				lastWallClickRef.current = { time: now, pos };

				// Magnetic snap for click placement: consider existing geometry
				// (committed walls/cabinets/openings) AND the in-progress chain
				// vertices so the user can close the loop by clicking near the
				// first segment's start.
				let clickPoint = pos;
				if (snapEnabled) {
					const snap = findNearestSnapTarget(
						pos,
						walls,
						cabinets,
						SNAP_RADIUS,
						drawingState.openings,
					);
					let bestDist = snap
						? distanceBetween(pos, snap.point)
						: SNAP_RADIUS;
					if (snap) clickPoint = snap.point;
					if (chainState.phase === 'drawingSegment') {
						const chainPts: Point[] = [];
						if (chainState.segments.length > 0) {
							chainPts.push(chainState.segments[0].start);
						}
						for (const seg of chainState.segments) chainPts.push(seg.end);
						for (const cp of chainPts) {
							const d = distanceBetween(pos, cp);
							if (d < bestDist) {
								bestDist = d;
								clickPoint = cp;
							}
						}
					}
				}

				if (isDblClick && chainState.phase === 'drawingSegment') {
					commitChain();
					return;
				}

				if (chainState.phase === 'idle' || chainState.phase === 'pickingStart') {
					setWallChainState({
						phase: 'drawingSegment',
						anchor: clickPoint,
						segments: [],
					});
					return;
				}

				if (chainState.phase === 'drawingSegment') {
					const constrained = getConstrainedEnd(
						chainState.anchor,
						clickPoint,
						chainState.segments,
					);

					const firstStart = chainState.segments[0]?.start;
					const willAutoClose =
						chainState.segments.length >= 2 &&
						!!firstStart &&
						distanceBetween(constrained, firstStart) < SNAP_RADIUS;

					const newEnd = willAutoClose && firstStart ? firstStart : constrained;

					if (distanceBetween(chainState.anchor, newEnd) < MIN_DRAW_DISTANCE)
						return;

					const newSeg = { start: chainState.anchor, end: newEnd };
					const newSegments = [...chainState.segments, newSeg];

					if (willAutoClose) {
						setWallChainState({
							phase: 'drawingSegment',
							anchor: newEnd,
							segments: newSegments,
						});
						setTimeout(() => commitChain(), 0);
						return;
					}

					setWallChainState({
						phase: 'drawingSegment',
						anchor: newEnd,
						segments: newSegments,
					});
					return;
				}
				return;
			}

			if (isWallPlacementTool(tool)) {
				if (!wallPlacement || wallPlacement.phase === 'idle') {
					const wallResult = findNearestWall(pos, walls, 30);
					if (!wallResult) {
						return;
					}

					setHoveredWallId(null);

					const { wall, wallAngle } = wallResult;
					let { referenceEndpoint } = wallResult;

					// Auto-detect nearest anchor point as reference
					const anchors = getWallAnchorPoints(wall, cabinets, drawingState.openings);
					let bestAnchorDist = SNAP_RADIUS * 2;
					for (const a of anchors) {
						const d = distanceBetween(pos, a.point);
						if (d < bestAnchorDist) {
							bestAnchorDist = d;
							referenceEndpoint = a.point;
						}
					}

					const constrained = constrainToWall(
						pos,
						wall,
						referenceEndpoint
					);

					const isCabTool =
						tool === 'base' ||
						tool === 'wall_cabinet' ||
						tool === 'tall';
					let initPos = constrained.position;
					let initOffset = constrained.offset;

					if (isCabTool) {
						let bestDist = Infinity;
						for (const a of anchors) {
							const d = distanceBetween(constrained.position, a.point);
							if (d < bestDist) {
								bestDist = d;
								initPos = a.point;
								initOffset = distanceBetween(
									referenceEndpoint,
									a.point
								);
							}
						}
					}

					const newWallPlacement: WallPlacementState = {
						phase: 'settingOffset',
						tool: (activeCustomTool || tool) as WallPlacementTool,
						wall,
						referenceEndpoint,
						wallAngle,
						currentOffsetPx: initOffset,
						currentPosition: initPos,
					};
					setWallPlacement(newWallPlacement);
					setShowDimensionInput(true);
					const offsetPos = newWallPlacement.currentPosition;

					if (
						newWallPlacement.tool === 'electrical' ||
						newWallPlacement.tool === 'plumbing'
					) {
						setWallPointPlacement({
							type: newWallPlacement.tool as 'electrical' | 'plumbing',
							phase: 'cornerLocked',
							cornerPoint: newWallPlacement.referenceEndpoint,
							cornerWall: newWallPlacement.wall,
							wallAngle: angleBetween(newWallPlacement.wall.start, newWallPlacement.wall.end),
							wallLength: distanceBetween(newWallPlacement.wall.start, newWallPlacement.wall.end),
							distancePx: distanceBetween(newWallPlacement.referenceEndpoint, offsetPos),
							position: offsetPos,
							confirmedDistanceCm: Math.round(pixelsToCm(distanceBetween(newWallPlacement.referenceEndpoint, offsetPos))),
						});
						setShowWallPointForm(true);
						setWallPlacement(null);
						setShowDimensionInput(false);
						return;
					}

				} else if (wallPlacement.phase === 'settingOffset') {
					// Click confirms current offset — same as pressing Enter
					handleDimensionConfirm(pixelsToCm(wallPlacement.currentOffsetPx));
					return;
				} else if (wallPlacement.phase === 'settingLength') {
					const startPt = wallPlacement.offsetPosition!;
					const endPt =
						wallPlacement.lengthPreviewEnd ||
						wallPlacement.currentPosition;
					const dist = distanceBetween(startPt, endPt);
					if (dist >= MIN_DRAW_DISTANCE) {
						createElementAtPoints(
							startPt,
							endPt,
							wallPlacement.tool as DrawingState['tool'],
							walls,
							wallPlacement.wall.id
						);
						setWallPlacement(null);
						setShowDimensionInput(false);
						onDrawingStateChange((prev) => ({
							...prev,
							startPoint: null,
							previewPoint: null,
							isDrawing: false,
						}));
					}
				}
				return;
			}

			if (isDrawing && startPoint) {
				if (tool === 'wall') return;
				let clickPoint = pos;
				if (snapEnabled) {
					const snap = findNearestSnapTarget(
						pos,
						walls,
						cabinets,
						SNAP_RADIUS,
						drawingState.openings
					);
					if (snap) {
						clickPoint = snap.point;
					}
				}

				const constrained = constrainToAxis(startPoint, clickPoint);
				const dist = distanceBetween(startPoint, constrained);

				if (dist >= MIN_DRAW_DISTANCE) {
					createElementAtPoints(startPoint, constrained, tool, walls);
					setShowDimensionInput(false);
				}
				return;
			}

			if (!isDrawing) {
				if (tool === 'wall') return;
				let startPos = pos;
				if (snapEnabled) {
					const snap = findNearestSnapTarget(
						pos,
						walls,
						cabinets,
						SNAP_RADIUS,
						drawingState.openings
					);
					if (snap) {
						startPos = snap.point;
					}
				}

				onDrawingStateChange((prev) => ({
					...prev,
					startPoint: startPos,
					isDrawing: true,
					previewPoint: startPos,
				}));
				setShowDimensionInput(true);
			}
		},
		[
			drawingState,
			getPointerPos,
			onDrawingStateChange,
			onDeleteItem,
			onSelectItem,
			constrainToAxis,
			createElementAtPoints,
			wallPlacement,
			activeCustomTool,
			showWallPointForm,
			snapResult,
			activeElementDefId,
			onAddElement,
			wallPointPlacement,
			wallPoints,
			measureTape,
			onAddGuideline,
			guidelines,
			islandPlacement,
			wallAnchorPoints,
			hoveredWallId,
			snapToWallOrtho,
			onAddCabinet,
			handleIslandClick,
			commitChain,
		]
	);

	const handleMouseMove = useCallback(
		(e: KonvaEventObject<MouseEvent>) => {
			// Ignore while a two-finger pinch/pan is in flight so the canvas
			// isn't simultaneously moved by the pinch AND by a phantom "mouse
			// move" generated by Konva's touch→mouse translation.
			if (pinchStateRef.current.active) return;

			// Cancel long-press if the pointer has drifted > 8px from where
			// it started. Prevents accidental menu open while dragging.
			if (longPressStartRef.current) {
				const konvaStage = stageRef.current;
				const cur = konvaStage?.getPointerPosition();
				if (cur) {
					const dx = cur.x - longPressStartRef.current.x;
					const dy = cur.y - longPressStartRef.current.y;
					if (Math.hypot(dx, dy) > 8) cancelLongPress();
				}
			}

			if (isPanning) {
				setStagePos((prev) => ({
					x: prev.x + e.evt.movementX,
					y: prev.y + e.evt.movementY,
				}));
				return;
			}

			const pos = getPointerPos(e);
			if (!pos) {
				return;
			}
			setMousePos(pos);
			setCursorWorld(pos);

			// Island drag (Select tool move)
			if (islandDragState) {
				const dx = pos.x - islandDragState.startMousePos.x;
				const dy = pos.y - islandDragState.startMousePos.y;
				updateIslandAction(islandDragState.islandId, {
					anchorPoint: {
						x: islandDragState.originalAnchor.x + dx,
						y: islandDragState.originalAnchor.y + dy,
					},
				});
				return;
			}

			if (dragState) {
				const dx = pos.x - dragState.startMousePos.x;
				const dy = pos.y - dragState.startMousePos.y;

				if (dragState.handle === 'body') {
					const newStart = {
						x: dragState.originalStart.x + dx,
						y: dragState.originalStart.y + dy,
					};
					const newEnd = {
						x: dragState.originalEnd.x + dx,
						y: dragState.originalEnd.y + dy,
					};
					if (dragState.itemType === 'wall') {
						onUpdateWall(dragState.itemId, {
							start: newStart,
							end: newEnd,
						});
					} else {
						onUpdateCabinet(dragState.itemId, {
							start: newStart,
							end: newEnd,
						});
					}
				} else if (dragState.handle === 'start') {
					const newStart = {
						x: dragState.originalStart.x + dx,
						y: dragState.originalStart.y + dy,
					};
					if (dragState.itemType === 'wall') {
						onUpdateWall(dragState.itemId, { start: newStart });
					} else {
						onUpdateCabinet(dragState.itemId, { start: newStart });
					}
				} else if (dragState.handle === 'end') {
					const newEnd = {
						x: dragState.originalEnd.x + dx,
						y: dragState.originalEnd.y + dy,
					};
					if (dragState.itemType === 'wall') {
						onUpdateWall(dragState.itemId, { end: newEnd });
					} else {
						onUpdateCabinet(dragState.itemId, { end: newEnd });
					}
				}
				return;
			}

			const {
				walls,
				cabinets,
				isDrawing,
				startPoint,
				snapEnabled,
				tool,
			} = drawingState;

			const showAnchorHover =
				(isWallPlacementTool(activeCustomTool || tool) && !wallPlacement) ||
				(USE_LEGACY_ISLAND_TOOL && activeCustomTool === 'island' &&
					(!islandPlacement || islandPlacement.phase === 'pickingAnchor'));

			if (showAnchorHover) {
				const wallResult = findNearestWall(pos, walls, 30);
				setHoveredWallId(wallResult ? wallResult.wall.id : null);
				if (wallResult) {
					setWallAnchorPoints(getWallAnchorPoints(wallResult.wall, cabinets, drawingState.openings));
				} else {
					setWallAnchorPoints([]);
				}
			} else {
				if (hoveredWallId) {
					setHoveredWallId(null);
					setWallAnchorPoints([]);
				}
			}

			if (
				isWallPlacementTool(activeCustomTool || tool) &&
				wallPlacement
			) {
				if (wallPlacement.phase === 'settingOffset') {
					const constrained = constrainToWall(
						pos,
						wallPlacement.wall,
						wallPlacement.referenceEndpoint
					);
					let snappedPos = constrained.position;
					let snappedOffset = constrained.offset;

					const isCabinetTool =
						wallPlacement.tool === 'base' ||
						wallPlacement.tool === 'wall_cabinet' ||
						wallPlacement.tool === 'tall';

					const wallEndpoints = [
						wallPlacement.wall.start,
						wallPlacement.wall.end,
					];
					const edgeEndpoints: Point[] = [];
					for (const c of cabinets) {
						const projS = nearestPointOnSegment(
							c.start,
							wallPlacement.wall.start,
							wallPlacement.wall.end
						);
						if (distanceBetween(c.start, projS) < 15) {
							edgeEndpoints.push(projS);
						}
						const projE = nearestPointOnSegment(
							c.end,
							wallPlacement.wall.start,
							wallPlacement.wall.end
						);
						if (distanceBetween(c.end, projE) < 15) {
							edgeEndpoints.push(projE);
						}
					}
					for (const o of drawingState.openings) {
						const projS = nearestPointOnSegment(
							o.start,
							wallPlacement.wall.start,
							wallPlacement.wall.end
						);
						if (distanceBetween(o.start, projS) < 15) {
							edgeEndpoints.push(projS);
						}
						const projE = nearestPointOnSegment(
							o.end,
							wallPlacement.wall.start,
							wallPlacement.wall.end
						);
						if (distanceBetween(o.end, projE) < 15) {
							edgeEndpoints.push(projE);
						}
					}
					const allAnchors = [...wallEndpoints, ...edgeEndpoints];

					if (isCabinetTool || snapEnabled) {
						let bestDist = SNAP_RADIUS;
						for (const sp of allAnchors) {
							const d = distanceBetween(constrained.position, sp);
							if (d < bestDist) {
								bestDist = d;
								snappedPos = sp;
								snappedOffset = distanceBetween(
									wallPlacement.referenceEndpoint,
									sp
								);
							}
						}
						if (bestDist < SNAP_RADIUS) {
							setSnapResult({ point: snappedPos, type: 'endpoint' });
						} else {
							setSnapResult(null);
							snappedPos = constrained.position;
							snappedOffset = constrained.offset;
						}
					}

					setWallPlacement((prev) =>
						prev
							? {
									...prev,
									currentOffsetPx: snappedOffset,
									currentPosition: snappedPos,
								}
							: null
					);
				} else if (wallPlacement.phase === 'settingLength') {
					const offsetPt = wallPlacement.offsetPosition!;
					const startPt = offsetPt;

					const wallDx =
						wallPlacement.wall.end.x - wallPlacement.wall.start.x;
					const wallDy =
						wallPlacement.wall.end.y - wallPlacement.wall.start.y;
					const wallLen = Math.sqrt(
						wallDx * wallDx + wallDy * wallDy
					);
					const wallUnitX = wallLen > 0 ? wallDx / wallLen : 0;
					const wallUnitY = wallLen > 0 ? wallDy / wallLen : 0;

					const unclampedDist =
						(pos.x - startPt.x) * wallUnitX +
						(pos.y - startPt.y) * wallUnitY;
					const projected = nearestPointOnSegment(
						pos,
						wallPlacement.wall.start,
						wallPlacement.wall.end
					);
					const projectedDist =
						(projected.x - startPt.x) * wallUnitX +
						(projected.y - startPt.y) * wallUnitY;

					let snappedPos = projected;

					if (snapEnabled) {
						const wallEndpoints = [
							wallPlacement.wall.start,
							wallPlacement.wall.end,
						];
						const cabEndpoints: Point[] = [];
						for (const c of cabinets) {
							const projS = nearestPointOnSegment(
								c.start,
								wallPlacement.wall.start,
								wallPlacement.wall.end
							);
							if (distanceBetween(c.start, projS) < 15) {
								cabEndpoints.push(projS);
							}
							const projE = nearestPointOnSegment(
								c.end,
								wallPlacement.wall.start,
								wallPlacement.wall.end
							);
							if (distanceBetween(c.end, projE) < 15) {
								cabEndpoints.push(projE);
							}
						}
						for (const o of drawingState.openings) {
							const projS = nearestPointOnSegment(
								o.start,
								wallPlacement.wall.start,
								wallPlacement.wall.end
							);
							if (distanceBetween(o.start, projS) < 15) {
								cabEndpoints.push(projS);
							}
							const projE = nearestPointOnSegment(
								o.end,
								wallPlacement.wall.start,
								wallPlacement.wall.end
							);
							if (distanceBetween(o.end, projE) < 15) {
								cabEndpoints.push(projE);
							}
						}
						const allSnaps = [...wallEndpoints, ...cabEndpoints];
						let bestDist = SNAP_RADIUS;
						for (const sp of allSnaps) {
							const d = distanceBetween(snappedPos, sp);
							if (d < bestDist) {
								bestDist = d;
								snappedPos = sp;
							}
						}
						if (bestDist < SNAP_RADIUS) {
							setSnapResult({
								point: snappedPos,
								type: 'endpoint',
							});
						} else {
							setSnapResult(null);
						}
					}

					setWallPlacement((prev) =>
						prev
							? {
									...prev,
									lengthPreviewEnd: snappedPos,
									currentPosition: snappedPos,
								}
							: null
					);

					if (
						wallPlacement.tool === 'tall' ||
						wallPlacement.tool === 'base' ||
						wallPlacement.tool === 'wall_cabinet'
					) {
						onDrawingStateChange((prev) => ({
							...prev,
							startPoint: offsetPt,
							previewPoint: snappedPos,
							isDrawing: true,
						}));
					}
				}
				return;
			}

			// Electrical/plumbing hover: update hovered corner and live distance
			if (
				(activeCustomTool === 'electrical' || activeCustomTool === 'plumbing') &&
				!showWallPointForm
			) {
				if (!wallPointPlacement) {
					// Phase 0: highlight nearest corner as mouse moves.
					// Restrict to the currently-hovered wall so a shared corner vertex
					// is always attributed to the wall the user is hovering, not an
					// adjacent wall that happens to iterate first.
					const candidateWalls = hoveredWallId
						? walls.filter((w) => w.id === hoveredWallId)
						: walls;
					const corner = findNearestCorner(pos, candidateWalls, 60);
					setHoveredCorner(corner);
				} else if (wallPointPlacement.phase === 'cornerLocked') {
					// Phase 1: update live position along the wall
					const { cornerPoint, wallAngle, wallLength } = wallPointPlacement;
					const cos = Math.cos(wallAngle);
					const sin = Math.sin(wallAngle);
					const along = (pos.x - cornerPoint.x) * cos + (pos.y - cornerPoint.y) * sin;
					const clampedAlong = Math.max(0, Math.min(wallLength, along));
					const livePos = {
						x: cornerPoint.x + cos * clampedAlong,
						y: cornerPoint.y + sin * clampedAlong,
					};
					setWallPointPlacement((prev) =>
						prev && prev.phase === 'cornerLocked'
							? { ...prev, distancePx: clampedAlong, position: livePos }
							: prev
					);
				}
			}

			let currentSnap: SnapResult | null = null;
			if (snapEnabled) {
				currentSnap = findNearestSnapTarget(
					pos,
					walls,
					cabinets,
					SNAP_RADIUS,
					drawingState.openings
				);
			}
			let bestSnapDist = currentSnap
				? distanceBetween(pos, currentSnap.point)
				: SNAP_RADIUS;
			// Snap to guideline endpoints
			for (const g of guidelines) {
				for (const gpt of [g.start, g.end]) {
					const d = distanceBetween(pos, gpt);
					if (d < bestSnapDist) {
						bestSnapDist = d;
						currentSnap = { point: gpt, type: 'endpoint' };
					}
				}
			}
			// Snap to the in-progress wall chain. The first segment's start is
			// the "closing" point for an open loop (e.g. the 4th wall in a
			// square snaps back to where the 1st wall began). All segment
			// endpoints are also considered so the user can branch off any
			// already-drawn vertex.
			const chain = wallChainStateRef.current;
			if (snapEnabled && chain.phase === 'drawingSegment') {
				const chainPoints: Array<{ pt: Point; type: SnapResult['type'] }> = [];
				if (chain.segments.length > 0) {
					chainPoints.push({
						pt: chain.segments[0].start,
						type: 'corner',
					});
				}
				for (const seg of chain.segments) {
					chainPoints.push({ pt: seg.end, type: 'endpoint' });
				}
				for (const cp of chainPoints) {
					const d = distanceBetween(pos, cp.pt);
					if (d < bestSnapDist) {
						bestSnapDist = d;
						currentSnap = { point: cp.pt, type: cp.type };
					}
				}
			}
			// Light haptic on snap "attach" — only when transitioning from
			// no-snap (or a different target) to snapping onto something.
			// Prevents per-frame buzzing while the cursor sits on a target.
			setSnapResult((prev) => {
				const prevTargetKey = prev
					? `${prev.point.x.toFixed(1)},${prev.point.y.toFixed(1)}`
					: null;
				const nextTargetKey = currentSnap
					? `${currentSnap.point.x.toFixed(1)},${currentSnap.point.y.toFixed(1)}`
					: null;
				if (nextTargetKey && nextTargetKey !== prevTargetKey) {
					haptic('light');
				}
				return currentSnap;
			});

			if (isDrawing && startPoint) {
				let previewPoint = pos;
				if (snapEnabled && currentSnap) {
					previewPoint = currentSnap.point;
				}
				previewPoint = constrainToAxis(startPoint, previewPoint);
				onDrawingStateChange((prev) => ({ ...prev, previewPoint }));
			}
		},
		[
			drawingState,
			getPointerPos,
			isPanning,
			constrainToAxis,
			onDrawingStateChange,
			dragState,
			islandDragState,
			updateIslandAction,
			onUpdateWall,
			onUpdateCabinet,
			wallPlacement,
			hoveredWallId,
			activeCustomTool,
			wallPointPlacement,
			showWallPointForm,
			setHoveredCorner,
			setWallPointPlacement,
			guidelines,
			islandPlacement,
		]
	);

	const handleMouseUp = useCallback(
		(e: KonvaEventObject<MouseEvent>) => {
			// If the last pinch just ended, Konva may still fire a mouseup for
			// the final finger-lift — don't let it trigger commit/select.
			if (pinchStateRef.current.active) return;

			// Cancel any pending long-press (if the user lifted before 500ms
			// it was a tap, not a hold).
			cancelLongPress();

			if (
				e.evt.button === 1 ||
				(isPanning && drawingState.tool === 'pan')
			) {
				setIsPanning(false);
				return;
			}
			if (islandDragState) {
				setIslandDragState(null);
				return;
			}
			if (dragState) {
				const pos = getPointerPos(e);
				if (pos) {
					const dx = pos.x - dragState.startMousePos.x;
					const dy = pos.y - dragState.startMousePos.y;
					if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
						onMoveComplete();
					}
				}
				setDragState(null);
			}
		},
		[dragState, islandDragState, getPointerPos, onMoveComplete, isPanning, drawingState.tool]
	);

	const handleDimensionConfirm = useCallback(
		(valueCm: number) => {
			const { tool, walls } = drawingState;

			if (
				isWallPlacementTool(activeCustomTool || tool) &&
				wallPlacement
			) {
				const lengthPx = cmToPixels(valueCm);
				const dir = getWallDirectionFromRef(
					wallPlacement.wall,
					wallPlacement.referenceEndpoint
				);

				if (wallPlacement.phase === 'settingOffset') {
					const refPt = wallPlacement.referenceEndpoint;
					const curPt = wallPlacement.currentPosition;

					const wallDx =
						wallPlacement.wall.end.x - wallPlacement.wall.start.x;
					const wallDy =
						wallPlacement.wall.end.y - wallPlacement.wall.start.y;
					const wallLen = Math.sqrt(
						wallDx * wallDx + wallDy * wallDy
					);
					const wallUnitX = wallLen > 0 ? wallDx / wallLen : 0;
					const wallUnitY = wallLen > 0 ? wallDy / wallLen : 0;

					const refDistFromStart = distanceBetween(
						wallPlacement.wall.start,
						refPt
					);

					const mouseDx = curPt.x - refPt.x;
					const mouseDy = curPt.y - refPt.y;
					const dot = mouseDx * wallUnitX + mouseDy * wallUnitY;

					let sign = 1;
					if (Math.abs(dot) > 1) {
						sign = dot < 0 ? -1 : 1;
					} else {
						sign = refDistFromStart > wallLen / 2 ? -1 : 1;
					}

					const newAbsoluteDist = refDistFromStart + lengthPx * sign;
					const clampedDist = Math.max(
						0,
						Math.min(newAbsoluteDist, wallLen)
					);

					const offsetPos = {
						x: wallPlacement.wall.start.x + wallUnitX * clampedDist,
						y: wallPlacement.wall.start.y + wallUnitY * clampedDist,
					};

					if (
						wallPlacement.tool === 'electrical' ||
						wallPlacement.tool === 'plumbing'
					) {
						setWallPointPlacement({
							type: wallPlacement.tool as 'electrical' | 'plumbing',
							phase: 'cornerLocked',
							cornerPoint: wallPlacement.referenceEndpoint,
							cornerWall: wallPlacement.wall,
							wallAngle: angleBetween(wallPlacement.wall.start, wallPlacement.wall.end),
							wallLength: distanceBetween(wallPlacement.wall.start, wallPlacement.wall.end),
							distancePx: distanceBetween(wallPlacement.referenceEndpoint, offsetPos),
							position: offsetPos,
							confirmedDistanceCm: Math.round(pixelsToCm(distanceBetween(wallPlacement.referenceEndpoint, offsetPos))),
						});
						setShowWallPointForm(true);
						setWallPlacement(null);
						setShowDimensionInput(false);
						return;
					}


					setWallPlacement((prev) =>
						prev
							? {
									...prev,
									phase: 'settingLength',
									offsetPosition: offsetPos,
									currentPosition: offsetPos,
									lengthPreviewEnd: offsetPos,
									currentOffsetPx: 0,
									startPointOnWall: offsetPos,
								}
							: null
					);
					setShowDimensionInput(true);
				} else if (wallPlacement.phase === 'settingLength') {
					const startPt = wallPlacement.offsetPosition!;
					const wallDx =
						wallPlacement.wall.end.x - wallPlacement.wall.start.x;
					const wallDy =
						wallPlacement.wall.end.y - wallPlacement.wall.start.y;
					const wallLength = Math.sqrt(wallDx * wallDx + wallDy * wallDy);
					let drawDir = { dx: wallDx / wallLength, dy: wallDy / wallLength };
					if (wallPlacement.lengthPreviewEnd && wallLength > 0) {
						const prevDist = (wallPlacement.lengthPreviewEnd.x - startPt.x) * (wallDx / wallLength)
							+ (wallPlacement.lengthPreviewEnd.y - startPt.y) * (wallDy / wallLength);
						if (prevDist < 0) {
							drawDir = { dx: -wallDx / wallLength, dy: -wallDy / wallLength };
						}
					}
					const endPt: Point = {
						x: startPt.x + drawDir.dx * lengthPx,
						y: startPt.y + drawDir.dy * lengthPx,
					};
					createElementAtPoints(
						startPt,
						endPt,
						wallPlacement.tool as DrawingState['tool'],
						walls,
						wallPlacement.wall.id
					);
					setWallPlacement(null);
					setShowDimensionInput(false);
					onDrawingStateChange((prev) => ({
						...prev,
						startPoint: null,
						previewPoint: null,
						isDrawing: false,
					}));
				}
				return;
			}

			const { startPoint, previewPoint } = drawingState;
			if (!startPoint) {
				return;
			}

			const lengthPx = cmToPixels(valueCm);

			let angle: number;
			if (previewPoint && distanceBetween(startPoint, previewPoint) > 5) {
				angle = angleBetween(startPoint, previewPoint);
			} else {
				angle = 0;
			}

			const endPoint: Point = {
				x: startPoint.x + Math.cos(angle) * lengthPx,
				y: startPoint.y + Math.sin(angle) * lengthPx,
			};

			createElementAtPoints(startPoint, endPoint, tool, walls);
			setShowDimensionInput(false);
		},
		[
			drawingState,
			createElementAtPoints,
			wallPlacement,
			onDrawingStateChange,
		]
	);

	const handleDimensionCancel = useCallback(() => {
		setShowDimensionInput(false);
		if (wallPlacement) {
			setWallPlacement(null);
			onDrawingStateChange((prev) => ({
				...prev,
				startPoint: null,
				previewPoint: null,
				isDrawing: false,
			}));
			return;
		}
		onDrawingStateChange((prev) => ({
			...prev,
			startPoint: null,
			previewPoint: null,
			isDrawing: false,
		}));
	}, [onDrawingStateChange, wallPlacement]);

	const handleFlipDepth = useCallback(() => {
		const { selectedId, cabinets } = drawingState;
		if (!selectedId) {
			return;
		}
		const cab = cabinets.find((c) => c.id === selectedId);
		if (!cab) {
			return;
		}
		onUpdateCabinet(selectedId, { depthFlipped: !cab.depthFlipped });
		onMoveComplete();
	}, [drawingState, onUpdateCabinet, onMoveComplete]);

	const placeIsland = useCallback((ip: IslandPlacementState) => {
		if (!USE_LEGACY_ISLAND_TOOL) return;
		const walk = computeIslandWalk(ip);
		if (!walk) return;
		if (ip.CL_cm <= 0 || ip.CD_cm <= 0) return;
		// turn2 = entry corner (stored as cabinet.start)
		// turn3 = opposite corner along CL (stored as cabinet.end)
		const cabinet: Cabinet = {
			id: generateId(),
			type: 'island',
			start: walk.turn2,
			end: walk.turn3,
			depth: ip.CD_cm,
			length: ip.CL_cm,
			depthFlipped: ip.CD_flipped,
		};
		onAddCabinet(cabinet);
		setIslandPlacement(null);
	}, [onAddCabinet]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			) {
				return;
			}
			// ── Wall chain: typed-length input (digits/backspace/enter/esc) ──
			// Mirrors the island-drawing pattern. Active whenever the user is
			// drawing a wall segment — regardless of whether they've clicked a
			// second anchor yet. On Enter, commits a segment of the typed length
			// in the currently snapped direction (from getConstrainedEnd).
			if (wallChainStateRef.current.phase === 'drawingSegment') {
				// Start/append typed input on digit
				if (/^[0-9]$/.test(e.key)) {
					setWallTypedInput((prev) => (prev ?? '') + e.key);
					e.preventDefault();
					return;
				}
				// Decimal point (only once)
				if (
					e.key === '.' &&
					wallTypedInput !== null &&
					!wallTypedInput.includes('.')
				) {
					setWallTypedInput(wallTypedInput + '.');
					e.preventDefault();
					return;
				}
				// Backspace edits the typed value
				if (e.key === 'Backspace' && wallTypedInput !== null) {
					setWallTypedInput(
						wallTypedInput.length > 1
							? wallTypedInput.slice(0, -1)
							: null
					);
					e.preventDefault();
					return;
				}
				// Enter commits the typed value as the next segment
				if (e.key === 'Enter' && wallTypedInput !== null) {
					const n = parseFloat(wallTypedInput);
					if (!Number.isFinite(n) || n <= 0) {
						setWallTypedInput(null);
						return;
					}
					const state = wallChainStateRef.current;
					if (state.phase !== 'drawingSegment') {
						setWallTypedInput(null);
						return;
					}
					const lengthPx = cmToPixels(n);
					// Direction = snapped end from cursor relative to anchor.
					// This respects ortho snapping (H/V) and the rule that
					// alternating segments must flip axis.
					// In cross mode (lockedDirection set), synthesize a virtual
					// cursor far from the anchor along the chosen axis so
					// getConstrainedEnd resolves to the locked direction.
					const cursor = lockedDirection
						? {
								x:
									state.anchor.x +
									(lockedDirection === 'right'
										? 1000
										: lockedDirection === 'left'
										? -1000
										: 0),
								y:
									state.anchor.y +
									(lockedDirection === 'down'
										? 1000
										: lockedDirection === 'up'
										? -1000
										: 0),
						  }
						: cursorWorld ?? state.anchor;
					const snapped = getConstrainedEnd(
						state.anchor,
						cursor,
						state.segments
					);
					const dx = snapped.x - state.anchor.x;
					const dy = snapped.y - state.anchor.y;
					const mag = Math.hypot(dx, dy);
					if (mag < 1e-6) {
						setWallTypedInput(null);
						return;
					}
					const ux = dx / mag;
					const uy = dy / mag;
					const newEnd: Point = {
						x: state.anchor.x + ux * lengthPx,
						y: state.anchor.y + uy * lengthPx,
					};
					const firstStart = state.segments[0]?.start;
					const willAutoClose =
						state.segments.length >= 2 &&
						!!firstStart &&
						distanceBetween(newEnd, firstStart) < SNAP_RADIUS;
					const finalEnd = willAutoClose && firstStart ? firstStart : newEnd;
					const newSegments = [
						...state.segments,
						{ start: state.anchor, end: finalEnd },
					];
					setWallChainState({
						phase: 'drawingSegment',
						anchor: finalEnd,
						segments: newSegments,
					});
					setWallTypedInput(null);
					setLockedDirection(null);
					if (willAutoClose) {
						setTimeout(() => commitChain(), 0);
					}
					e.preventDefault();
					return;
				}
				// Escape: 3-tier — first clear lockedDirection (cross mode), then
				// typed input, then fall through to chain-commit below.
				if (e.key === 'Escape' && lockedDirection !== null) {
					setLockedDirection(null);
					e.preventDefault();
					return;
				}
				if (e.key === 'Escape' && wallTypedInput !== null) {
					setWallTypedInput(null);
					e.preventDefault();
					return;
				}
			}
			// ── Wall chain: Escape commits chain ──
			if (
				e.key === 'Escape' &&
				wallChainStateRef.current.phase === 'drawingSegment'
			) {
				commitChain();
				return;
			}
			// ── New island drawing flow — Escape walks back / typed input ──
			{
				const iPhase = useCanvasStore.getState().islandDrawingState;
				const inTypeablePhase =
					iPhase.phase === 'draggingLength' || iPhase.phase === 'draggingDepth';

				// Escape walks back one phase (or cancels typed input if active)
				if (e.key === 'Escape' && iPhase.phase !== 'idle') {
					if (islandTypedInput !== null) {
						setIslandTypedInput(null);
						return;
					}
					switch (iPhase.phase) {
						case 'pickingCorner1':
							cancelIslandDraw();
							break;
						case 'draggingLength':
							setIslandPhase({ phase: 'pickingCorner1' });
							break;
						case 'draggingDepth':
							setIslandPhase({
								phase: 'draggingLength',
								anchor: iPhase.anchor,
							});
							break;
					}
					return;
				}

				if (inTypeablePhase) {
					// Start or append to typed input on digit key
					if (/^[0-9]$/.test(e.key)) {
						setIslandTypedInput((prev) => (prev ?? '') + e.key);
						e.preventDefault();
						return;
					}
					// Decimal point
					if (e.key === '.' && islandTypedInput !== null && !islandTypedInput.includes('.')) {
						setIslandTypedInput(islandTypedInput + '.');
						e.preventDefault();
						return;
					}
					// Backspace edits the typed value
					if (e.key === 'Backspace' && islandTypedInput !== null) {
						setIslandTypedInput(
							islandTypedInput.length > 1 ? islandTypedInput.slice(0, -1) : null
						);
						e.preventDefault();
						return;
					}
					// Enter commits the typed value
					if (e.key === 'Enter' && islandTypedInput !== null) {
						const n = parseFloat(islandTypedInput);
						if (!Number.isFinite(n) || n <= 0) {
							setIslandTypedInput(null);
							return;
						}
						if (iPhase.phase === 'draggingLength') {
							let axis: 'h' | 'v' = 'h';
							let lengthSign = 1;
							if (cursorWorld) {
								const dx = cursorWorld.x - iPhase.anchor.x;
								const dy = cursorWorld.y - iPhase.anchor.y;
								axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
								lengthSign = axis === 'h' ? dx : dy;
							}
							setIslandPhase({
								phase: 'draggingDepth',
								anchor: iPhase.anchor,
								lengthCm: n,
								axis,
								lengthSign,
							});
							setIslandTypedInput(null);
						} else if (iPhase.phase === 'draggingDepth') {
							if (!activeLayerIdFromStore) return;
							const lengthPx = iPhase.lengthCm * PIXELS_PER_CM;
							const depthPx = n * PIXELS_PER_CM;
							// Determine depth direction from cursor
							const depthSign = cursorWorld
								? (iPhase.axis === 'h' ? cursorWorld.y - iPhase.anchor.y : cursorWorld.x - iPhase.anchor.x)
								: 1;
							const rectX =
								iPhase.axis === 'h'
									? Math.min(iPhase.anchor.x, iPhase.anchor.x + (iPhase.lengthSign >= 0 ? 0 : -lengthPx))
									: Math.min(iPhase.anchor.x, iPhase.anchor.x + (depthSign >= 0 ? 0 : -depthPx));
							const rectY =
								iPhase.axis === 'v'
									? Math.min(iPhase.anchor.y, iPhase.anchor.y + (iPhase.lengthSign >= 0 ? 0 : -lengthPx))
									: Math.min(iPhase.anchor.y, iPhase.anchor.y + (depthSign >= 0 ? 0 : -depthPx));
							const island: Island = {
								id: `island_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
								layerId: activeLayerIdFromStore,
								referenceWallId: '',
								offsetFromWallCm: 0,
								depthSide: 'far',
								anchorPoint: { x: rectX, y: rectY },
								lengthCm: iPhase.lengthCm,
								depthCm: n,
								rotationRad: 0,
								heightCm: 77,
								axis: iPhase.axis,
							};
							addIslandAction(island);
							setIslandPhase({ phase: 'idle' });
							setIslandTypedInput(null);
						}
						e.preventDefault();
						return;
					}
				}
			}
			if (e.key === 'Escape') {
				if (USE_LEGACY_ISLAND_TOOL && islandPlacement) {
					// Step back one phase, clearing that phase's value
					setIslandPlacement((prev) => {
						if (!prev) return null;
						switch (prev.phase) {
							case 'settingCD':
								return { ...prev, phase: 'settingCL', CL_cm: 0, CD_cm: 60, CD_flipped: false };
							case 'settingCL':
								return { ...prev, phase: 'settingDL', DL_cm: 0, CL_cm: 0 };
							case 'settingDL':
								return { ...prev, phase: 'settingWL', WL_cm: 0, DL_cm: 0 };
							case 'settingWL':
								return null; // back to anchor pick = cancel tool (user can click again)
							case 'pickingAnchor':
								return null;
							default:
								return null;
						}
					});
					return;
				}
				if (measureTape) {
					setMeasureTape(null);
					return;
				}
				if (wallPlacement) {
					handleDimensionCancel();
					return;
				}
				if (drawingState.isDrawing) {
					handleDimensionCancel();
				}
			}
			if (e.key === 'f' || e.key === 'F') {
				if (USE_LEGACY_ISLAND_TOOL && islandPlacement?.phase === 'settingCD') {
					setIslandPlacement((prev) =>
						prev ? { ...prev, CD_flipped: !prev.CD_flipped } : null
					);
					return;
				}
				if (drawingState.tool === 'select' && drawingState.selectedId) {
					const cab = drawingState.cabinets.find(
						(c) => c.id === drawingState.selectedId
					);
					if (cab) {
						handleFlipDepth();
					}
				}
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [
		drawingState.isDrawing,
		drawingState.tool,
		drawingState.selectedId,
		drawingState.cabinets,
		handleDimensionCancel,
		handleFlipDepth,
		wallPlacement,
		measureTape,
		islandPlacement,
		placeIsland,
		cancelIslandDraw,
		setIslandPhase,
		islandTypedInput,
		cursorWorld,
		activeLayerIdFromStore,
		addIslandAction,
		commitChain,
		wallTypedInput,
	]);

	const renderGrid = () => {
		if (!drawingState.gridEnabled) {
			return null;
		}
		const lines = [];
		const gridSize = GRID_SIZE;
		const startX =
			Math.floor(-stagePos.x / scale / gridSize) * gridSize - gridSize;
		const endX = startX + dimensions.width / scale + gridSize * 2;
		const startY =
			Math.floor(-stagePos.y / scale / gridSize) * gridSize - gridSize;
		const endY = startY + dimensions.height / scale + gridSize * 2;

		for (let x = startX; x <= endX; x += gridSize) {
			lines.push(
				<Line
					key={`gv-${x}`}
					points={[x, startY, x, endY]}
					stroke="hsl(0 0% 88%)"
					strokeWidth={0.5 / scale}
					listening={false}
				/>
			);
		}
		for (let y = startY; y <= endY; y += gridSize) {
			lines.push(
				<Line
					key={`gh-${y}`}
					points={[startX, y, endX, y]}
					stroke="hsl(0 0% 88%)"
					strokeWidth={0.5 / scale}
					listening={false}
				/>
			);
		}
		return <>{lines}</>;
	};

	const renderWallPlacementRuler = () => {
		if (!wallPlacement) {
			return null;
		}
		const {
			phase,
			tool: wpTool,
			wall,
			referenceEndpoint,
			currentPosition,
			currentOffsetPx,
			offsetPosition,
			lengthPreviewEnd,
		} = wallPlacement;
		const wallLen = distanceBetween(wall.start, wall.end);
		const wallAngle = angleBetween(wall.start, wall.end);
		const deg = (wallAngle * 180) / Math.PI;
		const perpDist = 25 / scale;
		const perpAngle = wallAngle + Math.PI / 2;
		const rulerOffsetX = Math.cos(perpAngle) * perpDist;
		const rulerOffsetY = Math.sin(perpAngle) * perpDist;
		const elements: JSX.Element[] = [];

		elements.push(
			<Line
				key="wall-highlight"
				points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
				stroke="#A855F7"
				strokeWidth={(WALL_THICKNESS + 6) / scale}
				opacity={0.2}
				lineCap="round"
				listening={false}
			/>
		);

		const rulerStart = {
			x: wall.start.x + rulerOffsetX,
			y: wall.start.y + rulerOffsetY,
		};
		const rulerEnd = {
			x: wall.end.x + rulerOffsetX,
			y: wall.end.y + rulerOffsetY,
		};

		// Remaining wall space indicator
		const remainingCm = Math.round(calculateRemainingWallSpace(wall, drawingState.cabinets, drawingState.openings));
		const wallMidX = (wall.start.x + wall.end.x) / 2;
		const wallMidY = (wall.start.y + wall.end.y) / 2;
		elements.push(
			<Group key="remaining-space" listening={false}>
				<Rect
					x={wallMidX - rulerOffsetX * 2 - 36 / scale}
					y={wallMidY - rulerOffsetY * 2 - 8 / scale}
					width={72 / scale} height={16 / scale}
					fill="#6B7280" cornerRadius={3 / scale} opacity={0.8}
				/>
				<Text
					x={wallMidX - rulerOffsetX * 2}
					y={wallMidY - rulerOffsetY * 2}
					text={`Free: ${remainingCm}cm`}
					fontSize={9 / scale} fill="white"
					align="center" offsetX={36 / scale} offsetY={8 / scale}
				/>
			</Group>
		);

		elements.push(
			<Line
				key="ruler-line"
				points={[rulerStart.x, rulerStart.y, rulerEnd.x, rulerEnd.y]}
				stroke="#A855F7"
				strokeWidth={1.5 / scale}
				opacity={0.6}
				listening={false}
			/>
		);

		const tickSpacingSmall = cmToPixels(10);
		const tickSpacingLarge = cmToPixels(50);
		const tickSpacingLabel = cmToPixels(100);
		const numTicks = Math.floor(wallLen / tickSpacingSmall);

		const isStartRef =
			distanceBetween(referenceEndpoint, wall.start) <
			distanceBetween(referenceEndpoint, wall.end);
		const refFrom = isStartRef ? wall.start : wall.end;

		for (let i = 0; i <= numTicks; i++) {
			const d = i * tickSpacingSmall;
			if (d > wallLen) {
				break;
			}
			const ratio = d / wallLen;
			const tx =
				(isStartRef ? wall.start.x : wall.end.x) +
				(isStartRef
					? wall.end.x - wall.start.x
					: wall.start.x - wall.end.x) *
					ratio +
				rulerOffsetX;
			const ty =
				(isStartRef ? wall.start.y : wall.end.y) +
				(isStartRef
					? wall.end.y - wall.start.y
					: wall.start.y - wall.end.y) *
					ratio +
				rulerOffsetY;

			const isLarge =
				Math.abs(d % tickSpacingLarge) < 0.5 ||
				Math.abs((d % tickSpacingLarge) - tickSpacingLarge) < 0.5;
			const isLabel =
				Math.abs(d % tickSpacingLabel) < 0.5 ||
				Math.abs((d % tickSpacingLabel) - tickSpacingLabel) < 0.5;
			const tickLen = (isLarge ? 8 : 4) / scale;

			elements.push(
				<Line
					key={`tick-${i}`}
					points={[
						tx,
						ty,
						tx + Math.cos(perpAngle) * tickLen,
						ty + Math.sin(perpAngle) * tickLen,
					]}
					stroke="#A855F7"
					strokeWidth={(isLarge ? 1.5 : 0.8) / scale}
					opacity={0.5}
					listening={false}
				/>
			);

			if (isLabel && d > 0) {
				const labelCm = Math.round(pixelsToCm(d));
				elements.push(
					<Text
						key={`label-${i}`}
						x={tx + Math.cos(perpAngle) * (tickLen + 4 / scale)}
						y={ty + Math.sin(perpAngle) * (tickLen + 4 / scale)}
						text={`${labelCm}`}
						fontSize={9 / scale}
						fill="#A855F7"
						opacity={0.6}
						rotation={deg}
						listening={false}
					/>
				);
			}
		}

		elements.push(
			<Circle
				key="ref-marker"
				x={refFrom.x}
				y={refFrom.y}
				radius={6 / scale}
				fill="#A855F7"
				opacity={0.8}
				listening={false}
			/>
		);

		if (phase === 'settingOffset') {
			elements.push(
				<Line
					key="offset-line"
					points={[
						referenceEndpoint.x,
						referenceEndpoint.y,
						currentPosition.x,
						currentPosition.y,
					]}
					stroke="#A855F7"
					strokeWidth={2.5 / scale}
					dash={[8, 4]}
					opacity={0.7}
					listening={false}
				/>
			);

			const offsetMid = getMidpoint(referenceEndpoint, currentPosition);
			const offsetCm = Math.round(pixelsToCm(currentOffsetPx));
			elements.push(
				<Group key="offset-label" listening={false}>
					<Rect
						x={
							offsetMid.x +
							Math.cos(perpAngle) * (15 / scale) -
							20 / scale
						}
						y={
							offsetMid.y +
							Math.sin(perpAngle) * (15 / scale) -
							8 / scale
						}
						width={40 / scale}
						height={16 / scale}
						fill="#A855F7"
						cornerRadius={3 / scale}
						opacity={0.9}
					/>
					<Text
						x={offsetMid.x + Math.cos(perpAngle) * (15 / scale)}
						y={offsetMid.y + Math.sin(perpAngle) * (15 / scale)}
						text={`${offsetCm} cm`}
						fontSize={10 / scale}
						fill="white"
						align="center"
						offsetX={20 / scale}
						offsetY={8 / scale}
					/>
				</Group>
			);

			elements.push(
				<Circle
					key="offset-cursor"
					x={currentPosition.x}
					y={currentPosition.y}
					radius={5 / scale}
					fill="#A855F7"
					stroke="white"
					strokeWidth={2 / scale}
					listening={false}
				/>
			);
		}



		if (phase === 'settingLength' && offsetPosition && lengthPreviewEnd) {
			elements.push(
				<Circle
					key="offset-anchor"
					x={offsetPosition.x}
					y={offsetPosition.y}
					radius={5 / scale}
					fill="#A855F7"
					stroke="white"
					strokeWidth={2 / scale}
					listening={false}
				/>
			);

			// Use wall angle (not angleBetween) to keep ghost aligned to wall even when
			// lengthPreviewEnd is slightly off-wall due to mouse movement.
			const wallAngle = wallPlacement.wallAngle;
			const cabDeg = (wallAngle * 180) / Math.PI;
			const wallUnitX = Math.cos(wallAngle);
			const wallUnitY = Math.sin(wallAngle);
			// Signed distance along wall: negative = user dragging left/up
			const rawDist =
				(lengthPreviewEnd!.x - offsetPosition.x) * wallUnitX +
				(lengthPreviewEnd!.y - offsetPosition.y) * wallUnitY;
			const cabLenPx = Math.abs(rawDist);
			// Dynamic anchor: shift rect left when dragging in negative direction
			const xOff = rawDist < 0 ? rawDist : 0;
			// Wall-projected endpoint for accurate label midpoint
			const lengthEndPt = {
				x: offsetPosition.x + wallUnitX * rawDist,
				y: offsetPosition.y + wallUnitY * rawDist,
			};

			// Live length label — always visible from first mouse movement
			{
				const lengthMid = getMidpoint(offsetPosition, lengthEndPt);
				const lengthCm = Math.round(pixelsToCm(cabLenPx));
				elements.push(
					<Group key="length-label" listening={false}>
						<Rect
							x={
								lengthMid.x +
								Math.cos(perpAngle) * (15 / scale) -
								20 / scale
							}
							y={
								lengthMid.y +
								Math.sin(perpAngle) * (15 / scale) -
								8 / scale
							}
							width={40 / scale}
							height={16 / scale}
							fill="#7C3AED"
							cornerRadius={3 / scale}
							opacity={0.9}
						/>
						<Text
							x={lengthMid.x + Math.cos(perpAngle) * (15 / scale)}
							y={lengthMid.y + Math.sin(perpAngle) * (15 / scale)}
							text={`${lengthCm} cm`}
							fontSize={10 / scale}
							fill="white"
							align="center"
							offsetX={20 / scale}
							offsetY={8 / scale}
						/>
					</Group>
				);
			}

			if (cabLenPx > 2) {
				if (
					wpTool === 'tall' ||
					wpTool === 'base' ||
					wpTool === 'wall_cabinet'
				) {
					const cabType = wpTool as CabinetType;
					const style = CABINET_STYLES[cabType];
					// Ghost uses the default depth + render overhang so the
					// preview matches what the cabinet will look like on commit.
					const depthPx = cmToPixels(
						CABINET_DEPTHS[cabType] + CABINET_RENDER_DEPTH_BONUS
					);

					// Validate ghost placement for valid/invalid color
					const ghostClearance = checkClearanceViolation(
						offsetPosition, lengthEndPt, cabType, drawingState.openings, drawingState.walls
					);
					let ghostOverlap = false;
					if (cabType === 'base' || cabType === 'wall_cabinet') {
						ghostOverlap = findOverlappingCabinets(
							offsetPosition, lengthEndPt, drawingState.cabinets, [cabType]
						).length > 0;
					}
					const ghostValid = !ghostClearance && !ghostOverlap;
					const ghostFill = ghostValid ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)';
					const ghostStroke = ghostValid ? '#16A34A' : '#DC2626';

					const label =
						wpTool === 'tall'
							? 'TC'
							: wpTool === 'base'
								? 'BC'
								: 'WC';
					// Wall is the single source of truth for interior side.
					// calculateDepthDirection now takes the wall object directly.
					const interiorFlipped = calculateDepthDirection(
						wall,
						drawingState.walls
					);
					// No halfWall offset — back edge sits on inner face (y=0 in cabinet local frame)
					const ghostYTop = interiorFlipped ? -depthPx : 0;
					const ghostYMid = interiorFlipped ? -(depthPx / 2) : depthPx / 2;
					elements.push(
						<Group
							key="cabinet-ghost"
							x={offsetPosition.x}
							y={offsetPosition.y}
							rotation={cabDeg}
							listening={false}
						>
							<Rect
								x={xOff}
								y={ghostYTop}
								width={cabLenPx}
								height={depthPx}
								fill={ghostFill}
								stroke={ghostStroke}
								strokeWidth={1.5 / scale}
								dash={[6, 3]}
								cornerRadius={3}
							/>
							<Text
								x={xOff + cabLenPx / 2}
								y={ghostYMid}
								text={label}
								fontSize={12 / scale}
								fill={style.textColor}
								align="center"
								offsetX={8 / scale}
								offsetY={6 / scale}
								opacity={0.6}
							/>
						</Group>
					);
				} else {
					const oStyle = OPENING_STYLES[wpTool as OpeningType];
					const wallThickPx = WALL_THICKNESS;
					elements.push(
						<Group
							key="opening-ghost"
							x={offsetPosition.x}
							y={offsetPosition.y}
							rotation={cabDeg}
							listening={false}
						>
							<Rect
								x={xOff}
								y={-wallThickPx / 2}
								width={cabLenPx}
								height={wallThickPx}
								fill={oStyle.fill}
								opacity={stage === 'site_measurement' ? 0.8 : 0.35}
								stroke={oStyle.stroke}
								strokeWidth={1.5 / scale}
								dash={[6, 3]}
							/>
							<Text
								x={xOff + cabLenPx / 2}
								y={0}
								text={oStyle.label}
								fontSize={10 / scale}
								fill={oStyle.textColor}
								align="center"
								offsetX={6 / scale}
								offsetY={5 / scale}
								opacity={0.6}
							/>
						</Group>
					);
				}
			}
		}

		return <Group listening={false}>{elements}</Group>;
	};

	const renderHatchPattern = (
		minX: number,
		maxX: number,
		minY: number,
		maxY: number,
		color: string
	) => {
		const patchWidth = maxX - minX;
		const patchHeight = maxY - minY;
		const hatchLines: JSX.Element[] = [];
		const size = Math.max(patchWidth, patchHeight) + HATCH_SPACING;
		for (let d = -size; d <= size * 2; d += HATCH_SPACING) {
			hatchLines.push(
				<Line
					key={`hatch-${d}`}
					points={[minX + d, minY, minX + d - size, minY + size]}
					stroke={color}
					strokeWidth={0.5}
					opacity={0.12}
					listening={false}
				/>
			);
		}
		return hatchLines;
	};

	const renderWallPoints = () => {
		return wallPoints.map((wp) => {
			const fill = wp.type === 'electrical' ? '#F59E0B' : '#3B82F6';
			const stroke = wp.type === 'electrical' ? '#D97706' : '#2563EB';
			const isSelectedWP = selectedWallPoint?.id === wp.id;
			const handleWPClick = () => {
				if (drawingState.tool === 'delete') {
					onDeleteWallPoint?.(wp.id);
				} else {
					setSelectedWallPoint(isSelectedWP ? null : wp);
				}
			};
			return (
				<Group key={wp.id}>
					<Circle
						x={wp.posX}
						y={wp.posY}
						radius={isSelectedWP ? 13 / scale : 10 / scale}
						fill={fill}
						stroke={isSelectedWP ? '#f97316' : stroke}
						strokeWidth={isSelectedWP ? 3 / scale : 2 / scale}
						opacity={0.9}
						onClick={handleWPClick}
						onTap={handleWPClick}
					/>
					<Text
						x={wp.posX}
						y={wp.posY}
						text={wp.type === 'electrical' ? '⚡' : '💧'}
						fontSize={10 / scale}
						align="center"
						offsetX={5 / scale}
						offsetY={5 / scale}
						listening={false}
					/>
					<Text
						x={wp.posX + 14 / scale}
						y={wp.posY - 8 / scale}
						text={`H:${wp.heightCm}cm`}
						fontSize={8 / scale}
						fill={stroke}
						listening={false}
					/>
				</Group>
			);
		});
	};


	// ── Measure Tape rendering ───────────────────────────────────────────────
	const renderMeasureTape = () => {
		const elements: JSX.Element[] = [];

		// Draw all saved guideline segments
		for (const g of guidelines) {
			if (g.start.x === g.end.x && g.start.y === g.end.y) {
				// Single node (first click)
				elements.push(
					<Circle key={`gnode-${g.id}`}
						x={g.start.x} y={g.start.y}
						radius={5 / scale} fill="#A855F7" opacity={0.8} listening={false}
					/>
				);
			} else {
				const mid = { x: (g.start.x + g.end.x) / 2, y: (g.start.y + g.end.y) / 2 };
				const lenCm = Math.round(pixelsToCm(distanceBetween(g.start, g.end)));
				elements.push(
					<Line key={`gseg-${g.id}`}
						points={[g.start.x, g.start.y, g.end.x, g.end.y]}
						stroke="#A855F7" strokeWidth={1.5 / scale}
						dash={[6 / scale, 3 / scale]} opacity={0.7} listening={false}
					/>
				);
				elements.push(
					<Circle key={`gstart-${g.id}`} x={g.start.x} y={g.start.y}
						radius={4 / scale} fill="#A855F7" opacity={0.8} listening={false} />
				);
				elements.push(
					<Circle key={`gend-${g.id}`} x={g.end.x} y={g.end.y}
						radius={4 / scale} fill="#A855F7" opacity={0.8} listening={false} />
				);
				elements.push(
					<Group key={`glabel-${g.id}`} listening={false}>
						<Rect x={mid.x - 18 / scale} y={mid.y - 8 / scale}
							width={36 / scale} height={16 / scale}
							fill="#7C3AED" cornerRadius={3 / scale} opacity={0.85} />
						<Text x={mid.x} y={mid.y}
							text={`${lenCm}cm`} fontSize={9 / scale} fill="white"
							align="center" offsetX={18 / scale} offsetY={8 / scale} listening={false} />
					</Group>
				);
			}
		}

		// Live chain line (from last confirmed point to current mouse position)
		if (activeCustomTool === 'measure_tape' && measureTape && mousePos) {
			const liveEnd = !shiftHeldRef.current
				? constrainToAxis(measureTape.startPoint, mousePos)
				: mousePos;
			const liveLenCm = Math.round(pixelsToCm(distanceBetween(measureTape.startPoint, liveEnd)));
			const liveMid = { x: (measureTape.startPoint.x + liveEnd.x) / 2, y: (measureTape.startPoint.y + liveEnd.y) / 2 };
			// Anchor dot at the first click so the user can see where the
			// measurement starts while the chain is active. Purely visual —
			// disappears as soon as the tool is exited, no persisted record.
			elements.push(
				<Circle
					key="tape-live-anchor"
					x={measureTape.startPoint.x}
					y={measureTape.startPoint.y}
					radius={5 / scale}
					fill="#A855F7"
					listening={false}
				/>,
			);
			elements.push(
				<Line key="tape-live"
					points={[measureTape.startPoint.x, measureTape.startPoint.y, liveEnd.x, liveEnd.y]}
					stroke="#A855F7" strokeWidth={1.5 / scale}
					dash={[6 / scale, 3 / scale]} opacity={0.9} listening={false}
				/>
			);
			if (liveLenCm > 0) {
				elements.push(
					<Group key="tape-live-label" listening={false}>
						<Rect x={liveMid.x - 18 / scale} y={liveMid.y - 8 / scale}
							width={36 / scale} height={16 / scale}
							fill="#7C3AED" cornerRadius={3 / scale} opacity={0.9} />
						<Text x={liveMid.x} y={liveMid.y}
							text={`${liveLenCm}cm`} fontSize={9 / scale} fill="white"
							align="center" offsetX={18 / scale} offsetY={8 / scale} listening={false} />
					</Group>
				);
			}
		}


		if (elements.length === 0) return null;
		return <Group listening={false}>{elements}</Group>;
	};


	// ── Island Cabinet 4-Phase ghost rendering ──────────────────────────────
	const renderIslandPlacement = () => {
		if (!USE_LEGACY_ISLAND_TOOL) return null;
		if (!islandPlacement) return null;
		const ip = islandPlacement;
		if (ip.phase === 'pickingAnchor' || !ip.anchorPoint) return null;

		const elements: JSX.Element[] = [];

		// Compute working state: for the active phase, use mouse-derived value
		const live: IslandPlacementState = { ...ip };
		const origin =
			ip.phase === 'settingWL'
				? ip.anchorPoint
				: ip.phase === 'settingDL'
					? computeIslandWalk({ ...ip, DL_cm: 0 })?.turn1 ?? null
					: ip.phase === 'settingCL'
						? computeIslandWalk({ ...ip, CL_cm: 0 })?.turn2 ?? null
						: ip.phase === 'settingCD'
							? computeIslandWalk(ip)?.turn2 ?? null
							: null;

		if (mousePos && origin) {
			if (ip.phase === 'settingWL') {
				// Project mouse onto wall axis; clamp to wall length
				const anchorWall = drawingState.walls.find((w) => w.id === ip.anchorWallId);
				if (anchorWall) {
					const dx = mousePos.x - origin.x;
					const dy = mousePos.y - origin.y;
					const proj = dx * Math.cos(ip.wallAngle) + dy * Math.sin(ip.wallAngle);
					const wallLen = distanceBetween(anchorWall.start, anchorWall.end);
					const anchorProj =
						(ip.anchorPoint.x - anchorWall.start.x) * Math.cos(ip.wallAngle) +
						(ip.anchorPoint.y - anchorWall.start.y) * Math.sin(ip.wallAngle);
					const clamped = Math.max(-anchorProj, Math.min(wallLen - anchorProj, proj));
					live.WL_cm = pixelsToCm(Math.abs(clamped));
					live.WL_direction = clamped >= 0 ? 1 : -1;
				}
			} else if (ip.phase === 'settingDL') {
				const target = !shiftHeldRef.current
					? snapToWallOrtho(origin, mousePos, ip.wallAngle)
					: mousePos;
				live.DL_cm = pixelsToCm(distanceBetween(origin, target));
				live.DL_angle = angleBetween(origin, target);
			} else if (ip.phase === 'settingCL') {
				const target = !shiftHeldRef.current
					? snapToWallOrtho(origin, mousePos, ip.wallAngle)
					: mousePos;
				live.CL_cm = pixelsToCm(distanceBetween(origin, target));
				live.CL_angle = angleBetween(origin, target);
			} else if (ip.phase === 'settingCD') {
				const CL_dx = Math.cos(ip.CL_angle);
				const CL_dy = Math.sin(ip.CL_angle);
				const mx = mousePos.x - origin.x;
				const my = mousePos.y - origin.y;
				const perpSigned = -CL_dy * mx + CL_dx * my;
				live.CD_cm = Math.max(1, pixelsToCm(Math.abs(perpSigned)));
				live.CD_flipped = perpSigned < 0;
			}
		}

		const walk = computeIslandWalk(live);
		if (!walk) return null;

		// Anchor dot (purple)
		elements.push(
			<Circle
				key="island-anchor"
				x={ip.anchorPoint.x}
				y={ip.anchorPoint.y}
				radius={5 / scale}
				fill="#A855F7"
				stroke="white"
				strokeWidth={1.5 / scale}
				listening={false}
			/>
		);

		// Helper to draw a dashed segment + midpoint label pill
		const dashedSegment = (
			key: string,
			a: Point,
			b: Point,
			color: string,
			labelText: string
		) => {
			const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			const len = distanceBetween(a, b);
			return (
				<Group key={key} listening={false}>
					<Line
						points={[a.x, a.y, b.x, b.y]}
						stroke={color}
						strokeWidth={2 / scale}
						dash={[6, 4]}
						listening={false}
					/>
					<Circle
						x={b.x}
						y={b.y}
						radius={4 / scale}
						stroke={color}
						strokeWidth={1.5 / scale}
						fill="white"
						listening={false}
					/>
					{len > 10 && (
						<>
							<Rect
								x={mid.x - 22 / scale}
								y={mid.y - 9 / scale}
								width={44 / scale}
								height={16 / scale}
								fill={color}
								cornerRadius={3 / scale}
								opacity={0.9}
							/>
							<Text
								x={mid.x}
								y={mid.y}
								text={labelText}
								fontSize={9 / scale}
								fill="white"
								align="center"
								offsetX={22 / scale}
								offsetY={8 / scale}
								listening={false}
							/>
						</>
					)}
				</Group>
			);
		};

		// WL segment (gray)
		if (live.WL_cm > 0 || ip.phase === 'settingWL') {
			elements.push(
				dashedSegment(
					'island-wl',
					ip.anchorPoint,
					walk.turn1,
					'#6B7280',
					`WL ${Math.round(live.WL_cm)}cm`
				)
			);
		}

		// DL segment (gray) — shown once WL is done
		if (live.DL_cm > 0 || ip.phase === 'settingDL') {
			elements.push(
				dashedSegment(
					'island-dl',
					walk.turn1,
					walk.turn2,
					'#6B7280',
					`DL ${Math.round(live.DL_cm)}cm`
				)
			);
		}

		// CL segment (amber)
		if (live.CL_cm > 0 || ip.phase === 'settingCL') {
			elements.push(
				dashedSegment(
					'island-cl',
					walk.turn2,
					walk.turn3,
					'#F59E0B',
					`CL ${Math.round(live.CL_cm)}cm`
				)
			);
		}

		// CD rectangle (amber fill + purple stroke)
		if (live.CD_cm > 0 || ip.phase === 'settingCD') {
			const depthPx = cmToPixels(live.CD_cm);
			const angleDeg = (live.CL_angle * 180) / Math.PI;
			const CL_px = cmToPixels(live.CL_cm);
			const perpSign = live.CD_flipped ? 1 : -1;
			const perpAngle = live.CL_angle + (perpSign * Math.PI) / 2;
			const depthMidX =
				(walk.turn2.x + walk.turn3.x) / 2 +
				(Math.cos(perpAngle) * depthPx) / 2;
			const depthMidY =
				(walk.turn2.y + walk.turn3.y) / 2 +
				(Math.sin(perpAngle) * depthPx) / 2;
			elements.push(
				<Group key="island-cd" listening={false}>
					<Group x={walk.turn2.x} y={walk.turn2.y} rotation={angleDeg} listening={false}>
						<Rect
							x={0}
							y={live.CD_flipped ? 0 : -depthPx}
							width={CL_px}
							height={depthPx}
							fill="rgba(245,158,11,0.2)"
							stroke="#A855F7"
							strokeWidth={1.5 / scale}
							dash={[6, 3]}
						/>
						<Text
							x={CL_px / 2}
							y={live.CD_flipped ? depthPx / 2 : -depthPx / 2}
							text="IC"
							fontSize={12 / scale}
							fill="#7C3AED"
							align="center"
							offsetX={8 / scale}
							offsetY={6 / scale}
							listening={false}
						/>
					</Group>
					{/* Depth label pill */}
					<Rect
						x={depthMidX - 22 / scale}
						y={depthMidY - 9 / scale}
						width={44 / scale}
						height={16 / scale}
						fill="#A855F7"
						cornerRadius={3 / scale}
						opacity={0.9}
					/>
					<Text
						x={depthMidX}
						y={depthMidY}
						text={`CD ${Math.round(live.CD_cm)}cm`}
						fontSize={9 / scale}
						fill="white"
						align="center"
						offsetX={22 / scale}
						offsetY={8 / scale}
						listening={false}
					/>
				</Group>
			);
		}

		return <Group listening={false}>{elements}</Group>;
	};

	// ── Anchor point markers on hovered wall ─────────────────────────────────
	const renderAnchorMarkers = () => {
		if (wallPlacement || wallAnchorPoints.length === 0) return null;
		const elements: JSX.Element[] = [];
		const size = 6 / scale;
		for (let i = 0; i < wallAnchorPoints.length; i++) {
			const a = wallAnchorPoints[i];
			const key = `anchor-${i}`;
			switch (a.type) {
				case 'wall_corner':
					elements.push(
						<Rect key={key} x={a.point.x - size} y={a.point.y - size}
							width={size * 2} height={size * 2}
							fill="#9CA3AF" stroke="#6B7280" strokeWidth={1.5 / scale}
							listening={false} />
					);
					break;
				case 'door_edge':
					elements.push(
						<Rect key={key} x={a.point.x} y={a.point.y}
							width={size * 2} height={size * 2}
							offsetX={size} offsetY={size} rotation={45}
							fill="#F97316" stroke="#EA580C" strokeWidth={1.5 / scale}
							listening={false} />
					);
					break;
				case 'window_edge':
					elements.push(
						<Rect key={key} x={a.point.x} y={a.point.y}
							width={size * 2} height={size * 2}
							offsetX={size} offsetY={size} rotation={45}
							fill="#06B6D4" stroke="#0891B2" strokeWidth={1.5 / scale}
							listening={false} />
					);
					break;
				case 'cabinet_edge':
					elements.push(
						<Circle key={key} x={a.point.x} y={a.point.y}
							radius={size} fill="#3B82F6" stroke="#2563EB"
							strokeWidth={1.5 / scale} listening={false} />
					);
					break;
			}
		}
		return <Group listening={false}>{elements}</Group>;
	};

	const renderWallPointRuler = () => {
		if (!wallPointPlacement && !hoveredCorner) return null;
		const elements: JSX.Element[] = [];

		// Phase 0: highlight hovered corner with a pulsing circle
		if (hoveredCorner && !wallPointPlacement) {
			const { point } = hoveredCorner;
			elements.push(
				<Circle
					key="hovered-corner"
					x={point.x}
					y={point.y}
					radius={12 / scale}
					fill="transparent"
					stroke="#F59E0B"
					strokeWidth={2 / scale}
					listening={false}
				/>
			);
		}

		// Phase 1: cornerLocked — draw ruler from corner to live position
		if (wallPointPlacement?.phase === 'cornerLocked') {
			const { cornerPoint, position, distancePx } = wallPointPlacement;
			const distCm = Math.round(pixelsToCm(distancePx));

			// Corner marker
			elements.push(
				<Circle
					key="corner-locked"
					x={cornerPoint.x}
					y={cornerPoint.y}
					radius={8 / scale}
					fill="#F59E0B"
					opacity={0.8}
					listening={false}
				/>
			);

			// Ruler line from corner to current position
			if (distancePx > 4) {
				elements.push(
					<Line
						key="wp-ruler"
						points={[cornerPoint.x, cornerPoint.y, position.x, position.y]}
						stroke="#F59E0B"
						strokeWidth={2 / scale}
						dash={[4 / scale, 4 / scale]}
						opacity={0.8}
						listening={false}
					/>
				);

				// Distance label
				const mid = {
					x: (cornerPoint.x + position.x) / 2,
					y: (cornerPoint.y + position.y) / 2,
				};
				elements.push(
					<Text
						key="wp-dist-label"
						x={mid.x}
						y={mid.y - 14 / scale}
						text={drawingState.unit === 'm' ? `${(distCm / 100).toFixed(2)} m` : `${distCm} cm`}
						fontSize={11 / scale}
						fill="#D97706"
						align="center"
						offsetX={20 / scale}
						listening={false}
					/>
				);
			}

			// Live position marker
			elements.push(
				<Circle
					key="wp-live-pos"
					x={position.x}
					y={position.y}
					radius={6 / scale}
					fill={wallPointPlacement.type === 'electrical' ? '#F59E0B' : '#3B82F6'}
					opacity={0.7}
					listening={false}
				/>
			);
		}

		return elements;
	};

	const renderCabinetBody = (
		cabinet: Cabinet,
		isSelected: boolean,
		_pairs: CornerCabinetPair[]
	) => {
		const style = CABINET_STYLES[cabinet.type];
		const angle = angleBetween(cabinet.start, cabinet.end);
		const length = distanceBetween(cabinet.start, cabinet.end);
		// Rendered depth includes the visual overhang bonus. Stored
		// cabinet.depth stays authoritative for pricing / clearance / overlap.
		const depthPx = cmToPixels(cabinet.depth + CABINET_RENDER_DEPTH_BONUS);
		const deg = (angle * 180) / Math.PI;

		// Cabinet back edge sits ON the inner-face line — no halfWall offset.
		// depthFlipped=false → depth extends INTO room (toward +y in cabinet local frame)
		// depthFlipped=true  → depth extends OUT (toward -y) — kept for legacy data only
		const yOffset = cabinet.depthFlipped ? -depthPx : 0;

		// Inner-face corners are clean polygon corners; perpendicular cabinets meet
		// exactly without overlap. No inset needed.
		const xInsetStart = 0;
		const xInsetEnd = 0;

		const points = [
			xInsetStart,
			yOffset,
			length - xInsetEnd,
			yOffset,
			length - xInsetEnd,
			yOffset + depthPx,
			xInsetStart,
			yOffset + depthPx,
		];
		const minX = xInsetStart;
		const maxX = length - xInsetEnd;
		const minY = yOffset;
		const maxY = yOffset + depthPx;

		return (
			<Group key={cabinet.id}>
				<Group x={cabinet.start.x} y={cabinet.start.y} rotation={deg}>
					<Line
						points={points}
						fill={style.fill}
						opacity={isSelected ? 0.85 : style.fillOpacity}
						stroke={isSelected ? '#f97316' : style.stroke}
						strokeWidth={isSelected ? 2.5 / scale : 1.5 / scale}
						closed={true}
						lineJoin="miter"
					/>
					<Group
						clipFunc={(ctx: any) => {
							ctx.beginPath();
							ctx.rect(minX, minY, maxX - minX, maxY - minY);
							ctx.closePath();
						}}
					>
						{renderHatchPattern(
							minX,
							maxX,
							minY,
							maxY,
							style.stroke
						)}
					</Group>
					{/* Counter-rotate label so text always reads left-to-right */}
					{(() => {
						const normDeg = ((deg % 360) + 360) % 360;
						const flip = normDeg > 90 && normDeg < 270;
						const visLen = maxX - minX;
						return (
							<Text
								x={flip ? maxX : minX}
								y={flip ? yOffset + depthPx : yOffset}
								width={visLen}
								height={depthPx}
								text={style.label}
								fontSize={Math.min(11, depthPx * 0.35)}
								fill={style.textColor}
								fontStyle="bold"
								fontFamily="sans-serif"
								align="center"
								verticalAlign="middle"
								rotation={flip ? 180 : 0}
								listening={false}
							/>
						);
					})()}
				</Group>
				{isSelected && drawingState.tool === 'select' && (
					<>
						<Circle
							x={cabinet.start.x}
							y={cabinet.start.y}
							radius={HANDLE_RADIUS / scale}
							fill="white"
							stroke="#f97316"
							strokeWidth={2 / scale}
						/>
						<Circle
							x={cabinet.end.x}
							y={cabinet.end.y}
							radius={HANDLE_RADIUS / scale}
							fill="white"
							stroke="#f97316"
							strokeWidth={2 / scale}
						/>
					</>
				)}

			</Group>
		);
	};

	const renderWalls = () => {
		return drawingState.walls.map((wall) => {
			const isSelected = drawingState.selectedId === wall.id;
			const isHovered = hoveredWallId === wall.id;
			const polygon = getWallPolygon(wall, drawingState.walls);
			const innerStart = polygon[0];
			const innerEnd = polygon[1];

			const fillColor = isSelected
				? '#FED7AA'
				: isHovered
					? '#E5E7EB'
					: '#374151';
			const strokeColor = isSelected ? '#f97316' : '#1F2937';

			return (
				<Group key={wall.id}>
					{/* Wall body — filled 2D polygon */}
					<Line
						points={polygon.flatMap((p) => [p.x, p.y])}
						closed
						fill={fillColor}
						stroke={strokeColor}
						strokeWidth={Math.max(1, 1.5 / scale)}
					/>

					{/* Inner-face accent line — always visible, low opacity */}
					<Line
						points={[innerStart.x, innerStart.y, innerEnd.x, innerEnd.y]}
						stroke="#9CA3AF"
						strokeWidth={Math.max(1, 1 / scale)}
						opacity={0.6}
						listening={false}
					/>

					<Circle
						x={wall.start.x}
						y={wall.start.y}
						radius={4 / scale}
						fill={isHovered ? '#A855F7' : '#374151'}
					/>
					<Circle
						x={wall.end.x}
						y={wall.end.y}
						radius={4 / scale}
						fill={isHovered ? '#A855F7' : '#374151'}
					/>
					{isSelected && drawingState.tool === 'select' && (
						<>
							<Circle
								x={wall.start.x}
								y={wall.start.y}
								radius={HANDLE_RADIUS / scale}
								fill="white"
								stroke="#f97316"
								strokeWidth={2 / scale}
							/>
							<Circle
								x={wall.end.x}
								y={wall.end.y}
								radius={HANDLE_RADIUS / scale}
								fill="white"
								stroke="#f97316"
								strokeWidth={2 / scale}
							/>
						</>
					)}
					{renderDimensionLabel(
						wall.start,
						wall.end,
						drawingState.unit
					)}
				</Group>
			);
		});
	};

	const renderCabinets = () => {
		// Hide all base/wall/tall cabinets in site_measurement stage
		if (stage === 'site_measurement') {
			return null;
		}
		const pairs = findCornerCabinetPairs(
			drawingState.cabinets,
			drawingState.walls
		);
		const typeOrder: Record<CabinetType, number> = {
			base: 0,
			tall: 1,
			wall_cabinet: 2,
			island: 3,
		};

		// Z-order (Photoshop semantics): the TOP of the Layers panel is the
		// FRONT of the canvas. Konva draws later elements on top, so layers
		// with a smaller index (top of list) must render LAST.
		// Unlayered cabinets get layer index = Infinity so they sit below
		// every real layer.
		const layerIndexById = new Map<string, number>();
		layersFromStore.forEach((l, i) => layerIndexById.set(l.id, i));
		const layerIndexOf = (cab: Cabinet): number => {
			if (cab.layerId && layerIndexById.has(cab.layerId)) {
				return layerIndexById.get(cab.layerId) as number;
			}
			return Number.POSITIVE_INFINITY;
		};

		const sortedCabinets = [...drawingState.cabinets].sort((a, b) => {
			const lA = layerIndexOf(a);
			const lB = layerIndexOf(b);
			// Higher layer index renders first (goes to the back), so the
			// top-of-list layer ends up drawn last / on top.
			if (lA !== lB) return lB - lA;
			const tA = typeOrder[a.type] ?? 0;
			const tB = typeOrder[b.type] ?? 0;
			if (tA !== tB) return tA - tB;
			return drawingState.cabinets.indexOf(a) - drawingState.cabinets.indexOf(b);
		});

		return sortedCabinets.map((cabinet) => {
			const isSelected = drawingState.selectedId === cabinet.id;
			return renderCabinetBody(cabinet, isSelected, pairs);
		});
	};

	// Inner-face glow: shows when a wall-snapping tool is active so the user
	// sees exactly where cabinets/openings will land.
	const renderInnerFaceGlow = () => {
		const tool = drawingState.tool;
		const isWallSnapTool =
			tool === 'door' ||
			tool === 'window' ||
			tool === 'base' ||
			tool === 'wall_cabinet' ||
			tool === 'tall' ||
			activeCustomTool === 'electrical' ||
			activeCustomTool === 'plumbing' ||
			!!wallPlacement;
		if (!isWallSnapTool) return null;
		return (
			<Group listening={false}>
				{drawingState.walls.map((wall) => {
					const inner = getWallInnerFace(wall, drawingState.walls);
					const isHovered = hoveredWallId === wall.id;
					return (
						<Line
							key={`glow-${wall.id}`}
							points={[inner.start.x, inner.start.y, inner.end.x, inner.end.y]}
							stroke={isHovered ? '#22D3EE' : '#06B6D4'}
							strokeWidth={isHovered ? 4 / scale : 3 / scale}
							opacity={isHovered ? 1 : 0.7}
							shadowColor="#22D3EE"
							shadowBlur={isHovered ? 8 / scale : 4 / scale}
							shadowOpacity={0.6}
						/>
					);
				})}
			</Group>
		);
	};

	const renderInnerFaceCornerMarkers = () => {
		const tool = drawingState.tool;
		const isWallSnapTool =
			tool === 'door' ||
			tool === 'window' ||
			tool === 'base' ||
			tool === 'wall_cabinet' ||
			tool === 'tall' ||
			tool === 'wall' ||
			activeCustomTool === 'electrical' ||
			activeCustomTool === 'plumbing' ||
			!!wallPlacement;
		if (!isWallSnapTool) return null;

		// Show ONLY inner-face corners as snap targets. Outer corners are
		// rendered but not snappable — the user said the start point of the
		// next wall must be an interior point/corner of the room.
		const corners: Point[] = [];
		for (const w of drawingState.walls) {
			for (const p of [w.start, w.end]) {
				if (!corners.some((c) => distanceBetween(c, p) < SNAP_RADIUS)) corners.push(p);
			}
		}

		return (
			<Group listening={false}>
				{corners.map((p, i) => (
					<Circle
						key={`corner-${i}`}
						x={p.x}
						y={p.y}
						radius={6 / scale}
						fill="#FACC15"
						stroke="#A16207"
						strokeWidth={1.5 / scale}
						opacity={0.9}
					/>
				))}
			</Group>
		);
	};

	const renderWallCornerJoints = () => {
		// Inner-face model: two walls share corner point C (inner-face corner).
		// Each wall extrudes outward by its thickness. At a 90° corner the two
		// outward-extruded rectangles leave a square gap at the outer corner.
		// We fill that gap with a quadrilateral: C → C+outA*t → C+outA*t+outB*t → C+outB*t.
		const walls = drawingState.walls;
		const joints = getWallCornerJoints(walls);
		const tol = 0.5;
		return joints.map((joint, idx) => {
			const { cornerPoint, wall1, wall2 } = joint;
			const out1 = computeOutwardNormal(wall1.start, wall1.end, walls);
			const out2 = computeOutwardNormal(wall2.start, wall2.end, walls);
			const t = wall1.thickness; // assume both walls share thickness
			const p0 = cornerPoint;
			const p1 = { x: cornerPoint.x + out1.nx * t, y: cornerPoint.y + out1.ny * t };
			const p2 = {
				x: cornerPoint.x + out1.nx * t + out2.nx * t,
				y: cornerPoint.y + out1.ny * t + out2.ny * t,
			};
			const p3 = { x: cornerPoint.x + out2.nx * t, y: cornerPoint.y + out2.ny * t };
			// Skip near-degenerate joints (walls pointing outward in nearly same direction)
			const cross = out1.nx * out2.ny - out1.ny * out2.nx;
			if (Math.abs(cross) < tol) return null;
			return (
				<Line
					key={`wall-corner-${idx}`}
					points={[p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y]}
					fill="#374151"
					closed
					listening={false}
				/>
			);
		});
	};

	const renderOpenings = () => {
		return drawingState.openings.map((opening) => {
			const isSelected = drawingState.selectedId === opening.id;
			const style = OPENING_STYLES[opening.type];
			const angle = angleBetween(opening.start, opening.end);
			const length = distanceBetween(opening.start, opening.end);
			const deg = (angle * 180) / Math.PI;

			const wall = drawingState.walls.find((w) => w.id === opening.wallId);
			const thickness = wall ? wall.thickness : WALL_THICKNESS;
			const out = wall
				? computeOutwardNormal(wall.start, wall.end, drawingState.walls)
				: { nx: 0, ny: 1 };
			const ox = out.nx * thickness;
			const oy = out.ny * thickness;

			const polygonPoints = [
				opening.start.x,        opening.start.y,
				opening.end.x,           opening.end.y,
				opening.end.x   + ox,    opening.end.y   + oy,
				opening.start.x + ox,    opening.start.y + oy,
			];

			const fill = opening.type === 'door' ? '#FEF3C7' : '#DBEAFE';
			const strokeColor = isSelected
				? '#f97316'
				: opening.type === 'door' ? '#D97706' : '#2563EB';

			return (
				<Group key={opening.id}>
					<Line
						points={polygonPoints}
						closed
						fill={fill}
						stroke={strokeColor}
						strokeWidth={Math.max(1, 1.5 / scale)}
						opacity={isSelected ? 0.9 : style.fillOpacity}
					/>
					<Group
						x={opening.start.x}
						y={opening.start.y}
						rotation={deg}
					>
						{opening.type === 'window' && (
							<>
								<Line
									points={[
										0,
										0,
										length,
										thickness,
									]}
									stroke={style.textColor}
									strokeWidth={0.8 / scale}
									opacity={0.4}
									listening={false}
								/>
								<Line
									points={[
										0,
										thickness,
										length,
										0,
									]}
									stroke={style.textColor}
									strokeWidth={0.8 / scale}
									opacity={0.4}
									listening={false}
								/>
							</>
						)}
						{opening.type === 'door' && length > 10 && (
							<Line
								points={[
									0,
									thickness,
									0,
									thickness + length * 0.4,
									length * 0.3,
									thickness,
								]}
								stroke={strokeColor}
								strokeWidth={1 / scale}
								opacity={0.4}
								tension={0.5}
								listening={false}
							/>
						)}
						<Text
							x={0}
							y={0}
							width={length}
							height={thickness}
							text={style.label}
							fontSize={Math.min(9, thickness * 0.6)}
							fill={style.textColor}
							fontStyle="bold"
							fontFamily="sans-serif"
							align="center"
							verticalAlign="middle"
							listening={false}
						/>
					</Group>
					<Circle
						x={opening.start.x}
						y={opening.start.y}
						radius={4 / scale}
						fill={strokeColor}
					/>
					<Circle
						x={opening.end.x}
						y={opening.end.y}
						radius={4 / scale}
						fill={strokeColor}
					/>
					{isSelected && drawingState.tool === 'select' && (
						<>
							<Circle
								x={opening.start.x}
								y={opening.start.y}
								radius={HANDLE_RADIUS / scale}
								fill="white"
								stroke="#f97316"
								strokeWidth={2 / scale}
							/>
							<Circle
								x={opening.end.x}
								y={opening.end.y}
								radius={HANDLE_RADIUS / scale}
								fill="white"
								stroke="#f97316"
								strokeWidth={2 / scale}
							/>
						</>
					)}
					{renderDimensionLabel(
						opening.start,
						opening.end,
						drawingState.unit
					)}
				</Group>
			);
		});
	};

	const renderClearanceZones = () => {
		return drawingState.openings.map((opening) => {
			const zone = computeClearanceZone(opening, drawingState.walls);
			if (!zone) {
				return null;
			}
			const points = zone.corners.flatMap((p) => [p.x, p.y]);
			const issDoor = opening.type === 'door';
			return (
				<Group key={`cz-${opening.id}`} listening={false}>
					<Line
						points={points}
						fill={
							issDoor
								? 'rgba(239,68,68,0.08)'
								: 'rgba(234,179,8,0.08)'
						}
						stroke={issDoor ? '#EF4444' : '#EAB308'}
						strokeWidth={1 / scale}
						dash={[4, 4]}
						closed={true}
						opacity={0.6}
					/>
				</Group>
			);
		});
	};

	const renderDimensionLabel = (
		start: Point,
		end: Point,
		unit: 'cm' | 'm'
	) => {
		const mid = getMidpoint(start, end);
		const dist = distanceBetween(start, end);
		if (dist < 10) {
			return null;
		}

		const text = formatLength(dist, unit);
		const angle = angleBetween(start, end);
		const perpOffset = 14 / scale;

		// Always place label OUTSIDE the room (away from centroid)
		const interior = computeInteriorNormal(start, end, drawingState.walls);
		// Exterior = opposite of interior
		const exteriorAngle = Math.atan2(-interior.ny, -interior.nx);
		const labelX = mid.x + Math.cos(exteriorAngle) * perpOffset;
		const labelY = mid.y + Math.sin(exteriorAngle) * perpOffset;

		// Rotate label to follow wall direction, but keep readable (not upside-down)
		let angleDeg = (angle * 180) / Math.PI;
		if (angleDeg > 90 || angleDeg < -90) angleDeg += 180;

		return (
			<Text
				x={labelX}
				y={labelY}
				text={text}
				fontSize={10 / scale}
				fill="#6B7280"
				fontFamily="monospace"
				align="center"
				offsetX={(text.length * 3) / scale}
				offsetY={5 / scale}
				rotation={angleDeg}
				listening={false}
			/>
		);
	};

	const renderSplitPreview = () => {
		const { isDrawing, startPoint, previewPoint, tool, cabinets, walls } =
			drawingState;
		if (!isDrawing || !startPoint || !previewPoint || tool !== 'tall') {
			return null;
		}

		// Build a synthetic preview cabinet so findOverlappingCabinets can
		// detect perpendicular corner overlap (in addition to same-wall).
		// Find the wall under the cursor — depth direction follows the wall,
		// not the user's drag direction.
		const nearest = findNearestWall(startPoint, walls);
		const parentWall = nearest?.wall;
		const { aStart, aEnd } = alignToWall(startPoint, previewPoint, parentWall);
		const previewFlipped = parentWall
			? calculateDepthDirection(parentWall, walls)
			: false;
		const cutterPreview: Cabinet = {
			id: '__preview_tall__',
			type: 'tall',
			start: aStart,
			end: aEnd,
			depth: CABINET_DEPTHS.tall,
			length: distanceBetween(aStart, aEnd),
			depthFlipped: previewFlipped,
		};

		const overlapping = findOverlappingCabinets(
			startPoint,
			previewPoint,
			cabinets,
			['base', 'wall_cabinet'],
			cutterPreview,
		);
		if (overlapping.length === 0) {
			return null;
		}

		return (
			<Group listening={false}>
				{overlapping.map((cab) => {
					const { splitStart, splitEnd, consumed } =
						computeSplitPoints(cab, startPoint, previewPoint, cutterPreview);

					// Visual overhang applied to match renderCabinetBody.
					const depthPx = cmToPixels(
						cab.depth + CABINET_RENDER_DEPTH_BONUS
					);
					const angle = angleBetween(cab.start, cab.end);
					const flip = cab.depthFlipped ? -1 : 1;
					const perpX =
						Math.cos(angle + Math.PI / 2) * depthPx * flip;
					const perpY =
						Math.sin(angle + Math.PI / 2) * depthPx * flip;

					if (consumed) {
						const cabLen = distanceBetween(cab.start, cab.end);
						const mid = getMidpoint(cab.start, cab.end);
						const deg = (angle * 180) / Math.PI;
						return (
							<Group key={`split-${cab.id}`}>
								<Group
									x={cab.start.x}
									y={cab.start.y}
									rotation={deg}
								>
									<Rect
										x={0}
										y={cab.depthFlipped ? -depthPx : 0}
										width={cabLen}
										height={depthPx}
										fill="#EF4444"
										opacity={0.15}
										stroke="#EF4444"
										strokeWidth={2 / scale}
										dash={[6, 3]}
									/>
								</Group>
								<Text
									x={mid.x}
									y={mid.y}
									text="REMOVE"
									fontSize={10 / scale}
									fill="#EF4444"
									align="center"
									offsetX={20 / scale}
									offsetY={5 / scale}
									listening={false}
								/>
							</Group>
						);
					}

					return (
						<Group key={`split-${cab.id}`}>
							{splitStart && (
								<>
									<Line
										points={[
											splitStart.x,
											splitStart.y,
											splitStart.x + perpX,
											splitStart.y + perpY,
										]}
										stroke="#EF4444"
										strokeWidth={2 / scale}
										dash={[6, 3]}
										opacity={0.7}
									/>
									<Circle
										x={splitStart.x}
										y={splitStart.y}
										radius={4 / scale}
										fill="#EF4444"
										opacity={0.6}
									/>
								</>
							)}
							{splitEnd && (
								<>
									<Line
										points={[
											splitEnd.x,
											splitEnd.y,
											splitEnd.x + perpX,
											splitEnd.y + perpY,
										]}
										stroke="#EF4444"
										strokeWidth={2 / scale}
										dash={[6, 3]}
										opacity={0.7}
									/>
									<Circle
										x={splitEnd.x}
										y={splitEnd.y}
										radius={4 / scale}
										fill="#EF4444"
										opacity={0.6}
									/>
								</>
							)}
						</Group>
					);
				})}
			</Group>
		);
	};

	const renderPreview = () => {
		const { isDrawing, startPoint, previewPoint, tool } = drawingState;
		if (!isDrawing || !startPoint || !previewPoint) {
			return null;
		}

		const dist = distanceBetween(startPoint, previewPoint);
		if (dist < 2) {
			return null;
		}

		if (tool === 'wall') {
			const start = startPoint;
			const end = previewPoint;
			const dx = end.x - start.x;
			const dy = end.y - start.y;
			const len = Math.hypot(dx, dy);
			let wallGhost: React.ReactNode = null;
			if (len >= 1) {
				// Outward direction during drawing = right of (start → preview) = +90° CW
				const nx = dy / len;
				const ny = -dx / len;
				const ox = nx * WALL_THICKNESS;
				const oy = ny * WALL_THICKNESS;
				const polygon = [
					start.x,           start.y,
					end.x,             end.y,
					end.x   + ox,      end.y   + oy,
					start.x + ox,      start.y + oy,
				];
				wallGhost = (
					<Group listening={false}>
						<Line
							points={polygon}
							closed
							fill="rgba(55, 65, 81, 0.35)"
							stroke="#1F2937"
							strokeWidth={Math.max(1, 1.5 / scale)}
							dash={[8, 4]}
						/>
						<Line
							points={[start.x, start.y, end.x, end.y]}
							stroke="#06B6D4"
							strokeWidth={2 / scale}
						/>
						<Line
							points={[start.x + ox, start.y + oy, end.x + ox, end.y + oy]}
							stroke="#6B7280"
							strokeWidth={1.5 / scale}
							opacity={0.7}
						/>
					</Group>
				);
			}
			return (
				<Group listening={false}>
					{wallGhost}
					{renderDimensionLabel(
						startPoint,
						previewPoint,
						drawingState.unit
					)}
				</Group>
			);
		}

		if (isWallPlacementTool(tool) && wallPlacement) {
			return null;
		}

		if (tool === 'base' || tool === 'wall_cabinet' || tool === 'tall') {
			const style = CABINET_STYLES[tool as CabinetType];
			const angle = angleBetween(startPoint, previewPoint);
			const length = distanceBetween(startPoint, previewPoint);
			// Preview rectangle matches the final drawn size (incl. overhang).
			const depthPx = cmToPixels(
				CABINET_DEPTHS[tool as CabinetType] + CABINET_RENDER_DEPTH_BONUS
			);
			const deg = (angle * 180) / Math.PI;

			return (
				<Group listening={false}>
					<Group x={startPoint.x} y={startPoint.y} rotation={deg}>
						<Rect
							x={0}
							y={0}
							width={length}
							height={depthPx}
							fill={style.fill}
							opacity={0.25}
							stroke={style.stroke}
							strokeWidth={1.5 / scale}
							dash={[6, 3]}
							cornerRadius={3}
						/>
					</Group>
					{renderDimensionLabel(
						startPoint,
						previewPoint,
						drawingState.unit
					)}
				</Group>
			);
		}

		return null;
	};

	const renderSnapIndicators = () => {
		if (
			!snapResult ||
			drawingState.tool === 'select' ||
			drawingState.tool === 'delete'
		) {
			return null;
		}
		// On touch, inflate the snap halo so the magnetic target is obvious
		// even when a finger is partially obscuring it.
		const baseR = isTouch ? SNAP_VISUAL_RADIUS * 1.5 : SNAP_VISUAL_RADIUS;
		const outerR = isTouch ? baseR + 8 : baseR + 4;
		return (
			<Group listening={false}>
				<Circle
					x={snapResult.point.x}
					y={snapResult.point.y}
					radius={baseR / scale}
					fill={snapResult.type === 'corner' ? '#f97316' : '#3B82F6'}
					opacity={0.6}
				/>
				<Circle
					x={snapResult.point.x}
					y={snapResult.point.y}
					radius={outerR / scale}
					stroke={
						snapResult.type === 'corner' ? '#f97316' : '#3B82F6'
					}
					strokeWidth={(isTouch ? 2 : 1.5) / scale}
					opacity={0.4}
				/>
			</Group>
		);
	};

	const renderCrosshair = () => {
		if (!mousePos || drawingState.tool === 'select') {
			return null;
		}
		const size = 12 / scale;
		return (
			<Group listening={false}>
				<Line
					points={[
						mousePos.x - size,
						mousePos.y,
						mousePos.x + size,
						mousePos.y,
					]}
					stroke="#9CA3AF"
					strokeWidth={0.5 / scale}
					dash={[3, 3]}
				/>
				<Line
					points={[
						mousePos.x,
						mousePos.y - size,
						mousePos.x,
						mousePos.y + size,
					]}
					stroke="#9CA3AF"
					strokeWidth={0.5 / scale}
					dash={[3, 3]}
				/>
			</Group>
		);
	};

	const renderStartPointMarker = () => {
		const { isDrawing, startPoint } = drawingState;
		if (!isDrawing || !startPoint) {
			return null;
		}
		return (
			<Group listening={false}>
				<Circle
					x={startPoint.x}
					y={startPoint.y}
					radius={5 / scale}
					fill="#f97316"
					opacity={0.8}
				/>
				<Circle
					x={startPoint.x}
					y={startPoint.y}
					radius={9 / scale}
					stroke="#f97316"
					strokeWidth={1.5 / scale}
					opacity={0.4}
				/>
			</Group>
		);
	};

	const renderFlipButton = () => {
		const { selectedId, cabinets, tool } = drawingState;
		if (tool !== 'select' || !selectedId) {
			return null;
		}
		const cab = cabinets.find((c) => c.id === selectedId);
		if (!cab) {
			return null;
		}

		const mid = getMidpoint(cab.start, cab.end);
		const angle = angleBetween(cab.start, cab.end);
		// Flip button sits on the rendered edge (incl. overhang), not on the
		// logical depth, so it stays flush with the drawn rectangle.
		const depthPx = cmToPixels(cab.depth + CABINET_RENDER_DEPTH_BONUS);
		const flipDir = cab.depthFlipped ? -1 : 1;
		const btnX =
			mid.x +
			Math.cos(angle + Math.PI / 2) * (depthPx * flipDir + 16 / scale);
		const btnY =
			mid.y +
			Math.sin(angle + Math.PI / 2) * (depthPx * flipDir + 16 / scale);

		return (
			<Group
				x={btnX}
				y={btnY}
				onClick={(e) => {
					e.cancelBubble = true;
					handleFlipDepth();
				}}
				onTap={(e) => {
					e.cancelBubble = true;
					handleFlipDepth();
				}}
			>
				<Circle
					radius={12 / scale}
					fill="white"
					stroke="#6B7280"
					strokeWidth={1.5 / scale}
					shadowColor="rgba(0,0,0,0.15)"
					shadowBlur={4}
					shadowOffsetY={1}
				/>
				<Text
					text="↕"
					fontSize={14 / scale}
					fill="#374151"
					fontStyle="bold"
					align="center"
					verticalAlign="middle"
					offsetX={5 / scale}
					offsetY={7 / scale}
					listening={false}
				/>
			</Group>
		);
	};

	const getCursorStyle = () => {
		const { tool } = drawingState;
		if (isPanning) {
			return 'grabbing';
		}
		if (tool === 'pan') {
			return 'grab';
		}
		if (dragState) {
			if (dragState.handle === 'body') {
				return 'move';
			}
			return 'pointer';
		}
		if (tool === 'select') {
			return activeElementDefId ? 'crosshair' : 'default';
		}
		return 'crosshair';
	};

	const renderElements = () =>
		canvasElements.map((el) => {
			const colors = ELEMENT_COLORS[el.category] ?? {
				fill: '#F3F4F6',
				stroke: '#9CA3AF',
			};
			const isSelected = drawingState.selectedId === el.id;
			return (
				<Group
					key={el.id}
					x={el.x}
					y={el.y}
					rotation={el.rotation}
					draggable={drawingState.tool === 'select'}
					onDragEnd={(e) => {
						onUpdateElement?.(el.id, {
							x: e.target.x(),
							y: e.target.y(),
						});
					}}
					onClick={(e) => {
						if (drawingState.tool === 'delete') {
							e.cancelBubble = true;
							onDeleteElement?.(el.id);
						} else if (drawingState.tool === 'select') {
							e.cancelBubble = true;
							onSelectItem(el.id);
						}
					}}
				>
					<Rect
						x={-ELEMENT_W / 2}
						y={-ELEMENT_H / 2}
						width={ELEMENT_W}
						height={ELEMENT_H}
						fill={colors.fill}
						stroke={isSelected ? '#1D4ED8' : colors.stroke}
						strokeWidth={isSelected ? 2 : 1}
						cornerRadius={4}
						shadowEnabled={isSelected}
						shadowColor="#1D4ED8"
						shadowBlur={6}
						shadowOpacity={0.3}
					/>
					<Text
						x={-ELEMENT_W / 2}
						y={-ELEMENT_H / 2 + 4}
						width={ELEMENT_W}
						text={el.icon}
						fontSize={18}
						align="center"
					/>
					<Text
						x={-ELEMENT_W / 2}
						y={-ELEMENT_H / 2 + 26}
						width={ELEMENT_W}
						text={el.name}
						fontSize={8}
						fill="#374151"
						align="center"
					/>
				</Group>
			);
		});

	return (
		<div
			ref={containerRef}
			className="flex-1 relative bg-background"
			style={{
				cursor: getCursorStyle(),
				// Block browser-native pan/zoom/double-tap on the canvas so
				// our Konva touch handlers own the gesture space. Anything
				// outside this element still respects `touch-action:
				// manipulation` from index.css.
				touchAction: 'none',
			}}
			data-testid="designer-canvas"
		>
			<Stage
				ref={stageRef}
				width={dimensions.width}
				height={dimensions.height}
				x={stagePos.x}
				y={stagePos.y}
				scaleX={scale}
				scaleY={scale}
				onWheel={handleWheel}
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onTouchStart={handleTouchStart}
				onTouchMove={handleTouchMove}
				onTouchEnd={handleTouchEnd}
			>
				<Layer name="grid">{renderGrid()}</Layer>
				{refImg && showReferenceOverlay && (
					<Layer listening={false}>
						<KonvaImage
							image={refImg}
							x={0}
							y={0}
							width={refImg.naturalWidth}
							height={refImg.naturalHeight}
							opacity={0.35}
						/>
					</Layer>
				)}
				<Layer>
					{renderClearanceZones()}
					{/* Floor tile pattern for closed wall cycles */}
					{(() => {
						const cycles = findAllClosedCycles(drawingState.walls);
						return cycles.map((cycle, idx) => {
							const polygon = getClosedPolygonPath(cycle);
							if (!polygon || polygon.length < 3) return null;

							const minX = Math.min(...polygon.map((p) => p.x));
							const maxX = Math.max(...polygon.map((p) => p.x));
							const minY = Math.min(...polygon.map((p) => p.y));
							const maxY = Math.max(...polygon.map((p) => p.y));
							const tilePx = 30 * PIXELS_PER_CM;

							const hLines: Array<[number, number, number, number]> = [];
							for (
								let y = Math.floor(minY / tilePx) * tilePx;
								y <= maxY;
								y += tilePx
							) {
								hLines.push([minX, y, maxX, y]);
							}
							const vLines: Array<[number, number, number, number]> = [];
							for (
								let x = Math.floor(minX / tilePx) * tilePx;
								x <= maxX;
								x += tilePx
							) {
								vLines.push([x, minY, x, maxY]);
							}

							return (
								<Group
									key={`floor-${idx}`}
									listening={false}
									clipFunc={(ctx) => {
										ctx.beginPath();
										ctx.moveTo(polygon[0].x, polygon[0].y);
										for (let i = 1; i < polygon.length; i++) {
											ctx.lineTo(polygon[i].x, polygon[i].y);
										}
										ctx.closePath();
									}}
								>
									<Line
										points={polygon.flatMap((p) => [p.x, p.y])}
										closed
										fill="#D1D5DB"
										opacity={0.3}
									/>
									{hLines.map(([x1, y1, x2, y2], i) => (
										<Line
											key={`hl-${i}`}
											points={[x1, y1, x2, y2]}
											stroke="#9CA3AF"
											strokeWidth={0.5 / scale}
											opacity={0.3}
										/>
									))}
									{vLines.map(([x1, y1, x2, y2], i) => (
										<Line
											key={`vl-${i}`}
											points={[x1, y1, x2, y2]}
											stroke="#9CA3AF"
											strokeWidth={0.5 / scale}
											opacity={0.3}
										/>
									))}
								</Group>
							);
						});
					})()}
					{/* Wall-chain HUD: in-progress segments, rubber-band preview, close hint */}
					{wallChainState.phase === 'drawingSegment' &&
						(() => {
							const { anchor, segments } = wallChainState;
							const firstStart = segments[0]?.start;
							// Magnetic snap: if the cursor is near an existing
							// corner / endpoint / midpoint, pull the live cursor
							// onto it before applying the ortho constraint. This
							// gives the same "magnetic" feel as cabinet placement.
							const rawLive = cursorWorld;
							const livePos =
								rawLive && drawingState.snapEnabled && snapResult
									? snapResult.point
									: rawLive;
							const previewEnd = livePos
								? getConstrainedEnd(anchor, livePos, segments)
								: anchor;
							const nearClose =
								segments.length >= 2 &&
								!!firstStart &&
								distanceBetween(previewEnd, firstStart) < SNAP_RADIUS;
							const finalPreviewEnd =
								nearClose && firstStart ? firstStart : previewEnd;
							const previewColor = nearClose ? '#10B981' : '#F59E0B';

							return (
								<Group listening={false}>
									{segments.map((seg, idx) => {
										const len = Math.round(
											pixelsToCm(distanceBetween(seg.start, seg.end)),
										);
										const mx = (seg.start.x + seg.end.x) / 2;
										const my = (seg.start.y + seg.end.y) / 2;
										return (
											<Group key={`chain-seg-${idx}`}>
												<Line
													points={[
														seg.start.x,
														seg.start.y,
														seg.end.x,
														seg.end.y,
													]}
													stroke="#374151"
													strokeWidth={2 / scale}
												/>
												<Text
													x={mx}
													y={my - 14 / scale}
													text={`${len} cm`}
													fontSize={11 / scale}
													fill="#374151"
												/>
												<Circle
													x={seg.start.x}
													y={seg.start.y}
													radius={4 / scale}
													fill="#374151"
												/>
												<Circle
													x={seg.end.x}
													y={seg.end.y}
													radius={4 / scale}
													fill="#374151"
												/>
											</Group>
										);
									})}
									{livePos && (
										<>
											<Line
												points={[
													anchor.x,
													anchor.y,
													finalPreviewEnd.x,
													finalPreviewEnd.y,
												]}
												stroke={previewColor}
												strokeWidth={2 / scale}
												dash={[8 / scale, 4 / scale]}
											/>
											<Text
												x={(anchor.x + finalPreviewEnd.x) / 2}
												y={(anchor.y + finalPreviewEnd.y) / 2 - 14 / scale}
												text={`${Math.round(pixelsToCm(distanceBetween(anchor, finalPreviewEnd)))} cm`}
												fontSize={12 / scale}
												fill={previewColor}
												fontStyle="bold"
											/>
											<Circle
												x={finalPreviewEnd.x}
												y={finalPreviewEnd.y}
												radius={5 / scale}
												fill={previewColor}
											/>
										</>
									)}
									{nearClose && firstStart && (
										<Circle
											x={firstStart.x}
											y={firstStart.y}
											radius={8 / scale}
											stroke="#10B981"
											strokeWidth={2 / scale}
											opacity={0.7}
										/>
									)}
								</Group>
							);
						})()}
					{/* Directional cross: tablet input mode for wall drawing.
						4 cardinal arrows around the chain anchor. Tap one to
						lock a direction; the preview line + typed length
						commit (via "=" or Enter) produce that exact segment. */}
					{wallDrawMode === 'cross' &&
						wallChainState.phase === 'drawingSegment' &&
						(() => {
							const { anchor } = wallChainState;
							const offset = 60 / scale;
							const hit = 26 / scale;
							const arrowR = 22 / scale;
							const previewLen = Math.max(2000, 4000 / scale);
							const dirs: Array<{
								key: 'left' | 'right' | 'up' | 'down';
								dx: number;
								dy: number;
								tri: number[];
							}> = [
								{ key: 'right', dx: 1, dy: 0, tri: [arrowR * 0.5, 0, -arrowR * 0.3, -arrowR * 0.4, -arrowR * 0.3, arrowR * 0.4] },
								{ key: 'left', dx: -1, dy: 0, tri: [-arrowR * 0.5, 0, arrowR * 0.3, -arrowR * 0.4, arrowR * 0.3, arrowR * 0.4] },
								{ key: 'down', dx: 0, dy: 1, tri: [0, arrowR * 0.5, -arrowR * 0.4, -arrowR * 0.3, arrowR * 0.4, -arrowR * 0.3] },
								{ key: 'up', dx: 0, dy: -1, tri: [0, -arrowR * 0.5, -arrowR * 0.4, arrowR * 0.3, arrowR * 0.4, arrowR * 0.3] },
							];
							return (
								<Group>
									{lockedDirection &&
										(() => {
											const d = dirs.find((x) => x.key === lockedDirection)!;
											return (
												<Line
													points={[
														anchor.x,
														anchor.y,
														anchor.x + d.dx * previewLen,
														anchor.y + d.dy * previewLen,
													]}
													stroke="#3B82F6"
													strokeWidth={2 / scale}
													dash={[10 / scale, 6 / scale]}
													listening={false}
												/>
											);
										})()}
									{dirs.map((d) => {
										const cx = anchor.x + d.dx * offset;
										const cy = anchor.y + d.dy * offset;
										const active = lockedDirection === d.key;
										return (
											<Group
												key={d.key}
												x={cx}
												y={cy}
												onMouseDown={(e) => {
													e.cancelBubble = true;
												}}
												onTouchStart={(e) => {
													e.cancelBubble = true;
												}}
												onClick={(e) => {
													e.cancelBubble = true;
													setLockedDirection(d.key);
												}}
												onTap={(e) => {
													e.cancelBubble = true;
													setLockedDirection(d.key);
												}}
											>
												<Circle radius={hit} fill="rgba(0,0,0,0.001)" />
												<Circle
													radius={arrowR}
													fill={active ? '#3B82F6' : '#FFFFFF'}
													stroke={active ? '#1D4ED8' : '#3B82F6'}
													strokeWidth={2 / scale}
													shadowColor="rgba(0,0,0,0.2)"
													shadowBlur={4 / scale}
													shadowOffsetY={1 / scale}
												/>
												<Line
													points={d.tri}
													closed
													fill={active ? '#FFFFFF' : '#3B82F6'}
													listening={false}
												/>
											</Group>
										);
									})}
									<Circle
										x={anchor.x}
										y={anchor.y}
										radius={4 / scale}
										fill="#3B82F6"
										listening={false}
									/>
								</Group>
							);
						})()}
					{renderWalls()}
					{renderInnerFaceGlow()}
					{renderInnerFaceCornerMarkers()}
					{renderWallCornerJoints()}
					{renderOpenings()}
					{stage !== 'site_measurement' && renderCabinets()}
					{renderWallPoints()}
					{renderWallPointRuler()}
					{renderMeasureTape()}
					{renderIslandPlacement()}
					{/* New free-floating islands */}
					{islands.map((island) => {
						const lengthPx = island.lengthCm * PIXELS_PER_CM;
						const depthPx = island.depthCm * PIXELS_PER_CM;
						const rotationDeg = (island.rotationRad * 180) / Math.PI;
						// Map the logical (length, depth) to canvas (width, height)
						// based on which world axis the length runs along.
						// Default "h" is the legacy behaviour; "v" swaps them so
						// vertical islands render as tall narrow rectangles.
						const isVertical = island.axis === 'v';
						const rectWidth = isVertical ? depthPx : lengthPx;
						const rectHeight = isVertical ? lengthPx : depthPx;
						const isSelected =
							drawingState.selectedId === island.id ||
							activeLayerIdFromStore === island.layerId;
						return (
							<Group key={island.id} listening={false}>
								<Rect
									x={island.anchorPoint.x}
									y={island.anchorPoint.y}
									width={rectWidth}
									height={rectHeight}
									rotation={rotationDeg}
									fill="#F59E0B"
									opacity={isSelected ? 0.55 : 0.4}
									stroke={isSelected ? '#B45309' : '#F59E0B'}
									strokeWidth={isSelected ? 3 : 2}
								/>
								<Text
									x={island.anchorPoint.x + 4}
									y={island.anchorPoint.y + 4}
									text={`Island\n${island.lengthCm.toFixed(0)} × ${island.depthCm.toFixed(0)} cm`}
									fontSize={10}
									fill="#78350F"
								/>
							</Group>
						);
					})}
					{/* In-progress island drawing overlay (H/V rubber-band, no walls) */}
					{islandDrawingState.phase !== 'idle' && cursorWorld && (() => {
						const phase = islandDrawingState;
						if (phase.phase === 'pickingCorner1') {
							// Crosshair at cursor so the rep knows where the first click will land
							return (
								<Group listening={false}>
									<Line
										points={[
											cursorWorld.x - 8,
											cursorWorld.y,
											cursorWorld.x + 8,
											cursorWorld.y,
										]}
										stroke="#F59E0B"
										strokeWidth={1.5}
									/>
									<Line
										points={[
											cursorWorld.x,
											cursorWorld.y - 8,
											cursorWorld.x,
											cursorWorld.y + 8,
										]}
										stroke="#F59E0B"
										strokeWidth={1.5}
									/>
								</Group>
							);
						}
						if (phase.phase === 'draggingLength') {
							const dx = cursorWorld.x - phase.anchor.x;
							const dy = cursorWorld.y - phase.anchor.y;
							const axis: 'h' | 'v' =
								Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
							// Typed value overrides mouse-derived length
							const typedCm =
								islandTypedInput !== null ? parseFloat(islandTypedInput) : NaN;
							const usingTyped = Number.isFinite(typedCm) && typedCm > 0;
							const lengthPx = usingTyped
								? typedCm * PIXELS_PER_CM
								: axis === 'h'
									? Math.abs(dx)
									: Math.abs(dy);
							const signedLen = axis === 'h' ? dx : dy;
							const dir = signedLen >= 0 ? 1 : -1;
							const rectX =
								axis === 'h'
									? dir === 1
										? phase.anchor.x
										: phase.anchor.x - lengthPx
									: phase.anchor.x - 1;
							const rectY =
								axis === 'v'
									? dir === 1
										? phase.anchor.y
										: phase.anchor.y - lengthPx
									: phase.anchor.y - 1;
							const labelCm = usingTyped
								? typedCm
								: lengthPx / PIXELS_PER_CM;
							return (
								<Group listening={false}>
									<Rect
										x={rectX}
										y={rectY}
										width={axis === 'h' ? lengthPx : 2}
										height={axis === 'v' ? lengthPx : 2}
										fill="#F59E0B"
										opacity={0.4}
										stroke="#F59E0B"
										strokeWidth={1.5}
										dash={[4, 4]}
									/>
									<Text
										x={phase.anchor.x + 6}
										y={phase.anchor.y - 14}
										text={`${labelCm.toFixed(0)} cm${islandTypedInput !== null ? ' ⌨' : ''}`}
										fontSize={11}
										fill={islandTypedInput !== null ? '#B45309' : '#78350F'}
										fontStyle={islandTypedInput !== null ? 'bold' : 'normal'}
									/>
								</Group>
							);
						}
						if (phase.phase === 'draggingDepth') {
							const { anchor, lengthCm, axis, lengthSign } = phase;
							const lengthPx = lengthCm * PIXELS_PER_CM;
							const typedCm =
								islandTypedInput !== null ? parseFloat(islandTypedInput) : NaN;
							const usingTyped = Number.isFinite(typedCm) && typedCm > 0;
							const depthPx = usingTyped
								? typedCm * PIXELS_PER_CM
								: axis === 'h'
									? Math.abs(cursorWorld.y - anchor.y)
									: Math.abs(cursorWorld.x - anchor.x);
							const depthSign =
								axis === 'h' ? cursorWorld.y - anchor.y : cursorWorld.x - anchor.x;
							// Rectangle origin = top-left corner
							const rectX =
								axis === 'h'
									? (lengthSign >= 0 ? anchor.x : anchor.x - lengthPx)
									: (depthSign >= 0 ? anchor.x : anchor.x - depthPx);
							const rectY =
								axis === 'v'
									? (lengthSign >= 0 ? anchor.y : anchor.y - lengthPx)
									: (depthSign >= 0 ? anchor.y : anchor.y - depthPx);
							const labelDepth = usingTyped
								? typedCm
								: depthPx / PIXELS_PER_CM;
							return (
								<Group listening={false}>
									<Rect
										x={rectX}
										y={rectY}
										width={axis === 'h' ? lengthPx : depthPx}
										height={axis === 'h' ? depthPx : lengthPx}
										fill="#F59E0B"
										opacity={0.4}
										stroke="#F59E0B"
										strokeWidth={1.5}
										dash={[4, 4]}
									/>
									<Text
										x={anchor.x + 6}
										y={anchor.y - 14}
										text={`${lengthCm.toFixed(0)} × ${labelDepth.toFixed(0)} cm${islandTypedInput !== null ? ' ⌨' : ''}`}
										fontSize={11}
										fill={islandTypedInput !== null ? '#B45309' : '#78350F'}
										fontStyle={islandTypedInput !== null ? 'bold' : 'normal'}
									/>
								</Group>
							);
						}
						return null;
					})()}
					{renderAnchorMarkers()}
					{renderWallPlacementRuler()}
					{renderPreview()}
					{renderSplitPreview()}
					{renderStartPointMarker()}
					{renderSnapIndicators()}
					{renderCrosshair()}
					{renderFlipButton()}
					{renderElements()}
				</Layer>
			</Stage>

			{/* Island drawing overlays are rendered inside the Konva stage now */}

			{/* Wall-point corner-locked distance panel */}
			{wallPointPlacement?.phase === 'cornerLocked' && !showWallPointForm && (
				<WallPointDistancePanel
					type={wallPointPlacement.type}
					liveCm={Math.round(pixelsToCm(wallPointPlacement.distancePx))}
					unit={drawingState.unit}
					value={wpDistanceInput}
					onChange={setWpDistanceInput}
					onConfirm={(cm) => {
						const distPx = cmToPixels(cm);
						const confirmedDistanceCm = Math.round(cm);
						const cos = Math.cos(wallPointPlacement.wallAngle);
						const sin = Math.sin(wallPointPlacement.wallAngle);
						const finalPos = {
							x: wallPointPlacement.cornerPoint.x + cos * distPx,
							y: wallPointPlacement.cornerPoint.y + sin * distPx,
						};
						setWallPointPlacement({
							...wallPointPlacement,
							distancePx: distPx,
							position: finalPos,
							confirmedDistanceCm,
						});
						setShowWallPointForm(true);
						setWpDistanceInput('');
					}}
					onCancel={() => {
						setWallPointPlacement(null);
						setWpDistanceInput('');
					}}
				/>
			)}

			{USE_LEGACY_ISLAND_TOOL && islandPlacement && islandPlacement.phase !== 'pickingAnchor' && (() => {
				const ip = islandPlacement;
				// Compute live cm values for the currently-active phase
				let liveWL = 0, liveDL = 0, liveCL = 0, liveCD = 0;
				if (mousePos && ip.anchorPoint) {
					if (ip.phase === 'settingWL') {
						const anchorWall = drawingState.walls.find((w) => w.id === ip.anchorWallId);
						if (anchorWall) {
							const dx = mousePos.x - ip.anchorPoint.x;
							const dy = mousePos.y - ip.anchorPoint.y;
							const proj = dx * Math.cos(ip.wallAngle) + dy * Math.sin(ip.wallAngle);
							const wallLen = distanceBetween(anchorWall.start, anchorWall.end);
							const anchorProj =
								(ip.anchorPoint.x - anchorWall.start.x) * Math.cos(ip.wallAngle) +
								(ip.anchorPoint.y - anchorWall.start.y) * Math.sin(ip.wallAngle);
							const clamped = Math.max(-anchorProj, Math.min(wallLen - anchorProj, proj));
							liveWL = pixelsToCm(Math.abs(clamped));
						}
					} else if (ip.phase === 'settingDL') {
						const t1 = computeIslandWalk({ ...ip, DL_cm: 0 })?.turn1;
						if (t1) {
							const target = !shiftHeldRef.current ? snapToWallOrtho(t1, mousePos, ip.wallAngle) : mousePos;
							liveDL = pixelsToCm(distanceBetween(t1, target));
						}
					} else if (ip.phase === 'settingCL') {
						const t2 = computeIslandWalk({ ...ip, CL_cm: 0 })?.turn2;
						if (t2) {
							const target = !shiftHeldRef.current ? snapToWallOrtho(t2, mousePos, ip.wallAngle) : mousePos;
							liveCL = pixelsToCm(distanceBetween(t2, target));
						}
					} else if (ip.phase === 'settingCD') {
						const t2 = computeIslandWalk(ip)?.turn2;
						if (t2) {
							const CL_dx = Math.cos(ip.CL_angle);
							const CL_dy = Math.sin(ip.CL_angle);
							const mx = mousePos.x - t2.x;
							const my = mousePos.y - t2.y;
							liveCD = Math.max(1, pixelsToCm(Math.abs(-CL_dy * mx + CL_dx * my)));
						}
					}
				}
				return (
					<IslandDimensionPanel
						phase={ip.phase}
						liveWL_cm={liveWL}
						liveDL_cm={liveDL}
						liveCL_cm={liveCL}
						liveCD_cm={liveCD}
						WL_cm={ip.WL_cm}
						DL_cm={ip.DL_cm}
						CL_cm={ip.CL_cm}
						CD_cm={ip.CD_cm}
						unit={drawingState.unit}
						onCommitField={(field, cm) => {
							if (field === 'WL') {
								// For WL, preserve WL_direction from live mouse projection (clamped)
								let dir: 1 | -1 = ip.WL_direction;
								if (mousePos && ip.anchorPoint) {
									const anchorWall = drawingState.walls.find((w) => w.id === ip.anchorWallId);
									if (anchorWall) {
										const dx = mousePos.x - ip.anchorPoint.x;
										const dy = mousePos.y - ip.anchorPoint.y;
										const proj = dx * Math.cos(ip.wallAngle) + dy * Math.sin(ip.wallAngle);
										const wallLen = distanceBetween(anchorWall.start, anchorWall.end);
										const anchorProj =
											(ip.anchorPoint.x - anchorWall.start.x) * Math.cos(ip.wallAngle) +
											(ip.anchorPoint.y - anchorWall.start.y) * Math.sin(ip.wallAngle);
										const clamped = Math.max(-anchorProj, Math.min(wallLen - anchorProj, proj));
										if (Math.abs(clamped) > 0.5) dir = clamped >= 0 ? 1 : -1;
									}
								}
								setIslandPlacement({ ...ip, WL_cm: cm, WL_direction: dir, phase: 'settingDL' });
							} else if (field === 'DL') {
								// For DL, use mouse-derived angle (or existing if no mouse)
								let angle = ip.DL_angle;
								if (mousePos) {
									const t1 = computeIslandWalk({ ...ip, DL_cm: 0 })?.turn1;
									if (t1) {
										const target = !shiftHeldRef.current ? snapToWallOrtho(t1, mousePos, ip.wallAngle) : mousePos;
										if (distanceBetween(t1, target) > 1) angle = angleBetween(t1, target);
									}
								}
								setIslandPlacement({ ...ip, DL_cm: cm, DL_angle: angle, phase: 'settingCL' });
							} else if (field === 'CL') {
								let angle = ip.CL_angle;
								if (mousePos) {
									const t2 = computeIslandWalk({ ...ip, CL_cm: 0 })?.turn2;
									if (t2) {
										const target = !shiftHeldRef.current ? snapToWallOrtho(t2, mousePos, ip.wallAngle) : mousePos;
										if (distanceBetween(t2, target) > 1) angle = angleBetween(t2, target);
									}
								}
								setIslandPlacement({ ...ip, CL_cm: cm, CL_angle: angle, phase: 'settingCD' });
							} else if (field === 'CD') {
								let flipped = ip.CD_flipped;
								if (mousePos) {
									const t2 = computeIslandWalk(ip)?.turn2;
									if (t2) {
										const CL_dx = Math.cos(ip.CL_angle);
										const CL_dy = Math.sin(ip.CL_angle);
										const mx = mousePos.x - t2.x;
										const my = mousePos.y - t2.y;
										const perp = -CL_dy * mx + CL_dx * my;
										if (Math.abs(perp) > 1) flipped = perp < 0;
									}
								}
								placeIsland({ ...ip, CD_cm: cm, CD_flipped: flipped });
							}
						}}
						onJumpToField={(field) => {
							const canJump: Record<IslandPanelField, boolean> = {
								WL: true,
								DL: ip.WL_cm > 0,
								CL: ip.WL_cm > 0 && ip.DL_cm > 0,
								CD: ip.WL_cm > 0 && ip.DL_cm > 0 && ip.CL_cm > 0,
							};
							if (!canJump[field]) return false;
							const targetPhase: Record<IslandPanelField, IslandPhase> = {
								WL: 'settingWL',
								DL: 'settingDL',
								CL: 'settingCL',
								CD: 'settingCD',
							};
							setIslandPlacement({ ...ip, phase: targetPhase[field] });
							return true;
						}}
						onCancel={() => setIslandPlacement(null)}
					/>
				);
			})()}

						{showDimensionInput && wallPlacement && (
				<FixedDimensionPanel
					wallPlacement={wallPlacement}
					unit={drawingState.unit}
					onOffsetConfirm={(valueCm) =>
						handleDimensionConfirm(valueCm)
					}
					onLengthConfirm={(valueCm) =>
						handleDimensionConfirm(valueCm)
					}
					onCancel={handleDimensionCancel}
				/>
			)}

			{/* Island drawing bottom bar */}
			{(islandDrawingState.phase === 'draggingLength' || islandDrawingState.phase === 'draggingDepth') && (() => {
				const phase = islandDrawingState;
				const liveLengthCm = (() => {
					if (phase.phase === 'draggingLength' && cursorWorld) {
						const dx = cursorWorld.x - phase.anchor.x;
						const dy = cursorWorld.y - phase.anchor.y;
						const axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
						return Math.round((axis === 'h' ? Math.abs(dx) : Math.abs(dy)) / PIXELS_PER_CM);
					}
					if (phase.phase === 'draggingDepth') return Math.round(phase.lengthCm);
					return 0;
				})();
				const liveDepthCm = (() => {
					if (phase.phase === 'draggingDepth' && cursorWorld) {
						return Math.round(
							(phase.axis === 'h'
								? Math.abs(cursorWorld.y - phase.anchor.y)
								: Math.abs(cursorWorld.x - phase.anchor.x)) / PIXELS_PER_CM
						);
					}
					return 0;
				})();
				return (
					<div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
						<div className="bg-card border border-border rounded-lg shadow-lg px-4 py-3 flex items-center gap-4 backdrop-blur-sm">
							<div className="text-xs font-semibold text-primary whitespace-nowrap">
								Island
							</div>
							<div className="w-px h-8 bg-border" />
							<div className="flex items-center gap-1.5">
								<label className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
									Length
								</label>
								<div className="flex items-center bg-muted/50 border border-border rounded-md overflow-hidden">
									<input
										type="number"
										value={islandTypedInput !== null && phase.phase === 'draggingLength' ? islandTypedInput : liveLengthCm || ''}
										onChange={(e) => setIslandTypedInput(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === 'Enter') {
												e.preventDefault();
												const n = parseFloat(e.currentTarget.value);
												if (Number.isFinite(n) && n > 0) {
													if (phase.phase === 'draggingLength') {
														let axis: 'h' | 'v' = 'h';
														let lengthSign = 1;
														if (cursorWorld) {
															const dx = cursorWorld.x - phase.anchor.x;
															const dy = cursorWorld.y - phase.anchor.y;
															axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
															lengthSign = axis === 'h' ? dx : dy;
														}
														setIslandPhase({
															phase: 'draggingDepth',
															anchor: phase.anchor,
															lengthCm: n,
															axis,
															lengthSign,
														});
														setIslandTypedInput(null);
													}
												}
											} else if (e.key === 'Escape') {
												e.preventDefault();
												setIslandTypedInput(null);
											}
										}}
										disabled={phase.phase !== 'draggingLength'}
										className="w-16 h-7 px-2 text-sm font-mono bg-transparent text-foreground outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50"
										step="any"
										min="0"
									/>
									<span className="text-[10px] text-muted-foreground font-medium pr-2 select-none">cm</span>
								</div>
							</div>
							<div className="flex items-center gap-1.5">
								<label className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
									Depth
								</label>
								<div className="flex items-center bg-muted/50 border border-border rounded-md overflow-hidden">
									<input
										type="number"
										value={islandTypedInput !== null && phase.phase === 'draggingDepth' ? islandTypedInput : liveDepthCm || ''}
										onChange={(e) => setIslandTypedInput(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === 'Enter') {
												e.preventDefault();
												const n = parseFloat(e.currentTarget.value);
												if (Number.isFinite(n) && n > 0 && phase.phase === 'draggingDepth' && activeLayerIdFromStore) {
													const lengthPx = phase.lengthCm * PIXELS_PER_CM;
													const depthPx = n * PIXELS_PER_CM;
													const depthSign = cursorWorld
														? (phase.axis === 'h' ? cursorWorld.y - phase.anchor.y : cursorWorld.x - phase.anchor.x)
														: 1;
													const rectX =
														phase.axis === 'h'
															? Math.min(phase.anchor.x, phase.anchor.x + (phase.lengthSign >= 0 ? 0 : -lengthPx))
															: Math.min(phase.anchor.x, phase.anchor.x + (depthSign >= 0 ? 0 : -depthPx));
													const rectY =
														phase.axis === 'v'
															? Math.min(phase.anchor.y, phase.anchor.y + (phase.lengthSign >= 0 ? 0 : -lengthPx))
															: Math.min(phase.anchor.y, phase.anchor.y + (depthSign >= 0 ? 0 : -depthPx));
													addIslandAction({
														id: `island_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
														layerId: activeLayerIdFromStore,
														referenceWallId: '',
														offsetFromWallCm: 0,
														depthSide: 'far',
														anchorPoint: { x: rectX, y: rectY },
														lengthCm: phase.lengthCm,
														depthCm: n,
														rotationRad: 0,
														heightCm: 77,
													});
													setIslandPhase({ phase: 'idle' });
													setIslandTypedInput(null);
												}
											} else if (e.key === 'Escape') {
												e.preventDefault();
												setIslandTypedInput(null);
											}
										}}
										disabled={phase.phase !== 'draggingDepth'}
										className="w-16 h-7 px-2 text-sm font-mono bg-transparent text-foreground outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50"
										step="any"
										min="0"
									/>
									<span className="text-[10px] text-muted-foreground font-medium pr-2 select-none">cm</span>
								</div>
							</div>
							<div className="w-px h-8 bg-border" />
							<div className="text-[10px] text-muted-foreground whitespace-nowrap">
								Enter to confirm · Esc to cancel
							</div>
						</div>
					</div>
				);
			})()}

			{/* Wall-point form modal */}
			{showWallPointForm && wallPointPlacement?.position && (
				<WallPointFormModal
					type={wallPointPlacement.type}
					onSave={(data) => {
						const pos = wallPointPlacement.position!;
						onAddWallPoint?.({
							type: wallPointPlacement.type,
							posX: Math.round(pos.x),
							posY: Math.round(pos.y),
							distanceCm: wallPointPlacement.confirmedDistanceCm ?? Math.round(pixelsToCm(wallPointPlacement.distancePx)),
							heightCm: data.heightCm,
							photo: data.photo,
							note: data.note,
							wallId: wallPointPlacement.cornerWall?.id ?? '',
						});
						setShowWallPointForm(false);
						setWallPointPlacement(null);
					}}
					onCancel={() => {
						setShowWallPointForm(false);
						setWallPointPlacement(null);
					}}
				/>
			)}

			{/* Edit existing wall point */}
			{editingWallPoint && (
				<WallPointFormModal
					type={editingWallPoint.type}
					defaultValues={{
						heightCm: editingWallPoint.heightCm,
						photo: editingWallPoint.photo ?? '',
						note: editingWallPoint.note,
					}}
					onSave={(data) => {
						onUpdateWallPoint?.(editingWallPoint.id, {
							heightCm: data.heightCm,
							photo: data.photo,
							note: data.note,
						});
						setEditingWallPoint(null);
					}}
					onCancel={() => setEditingWallPoint(null)}
				/>
			)}

			{showDimensionInput &&
				!wallPlacement &&
				islandDrawingState.phase === 'idle' &&
				drawingState.startPoint && (
					<FloatingDimensionInput
						x={drawingState.startPoint.x}
						y={drawingState.startPoint.y}
						unit={drawingState.unit}
						onConfirm={handleDimensionConfirm}
						onCancel={handleDimensionCancel}
						stageOffset={stagePos}
						scale={scale}
					/>
				)}

			{/* Wall chain length indicator: shows the typed value (cm) floating
			    near the current chain anchor while the user is drawing a wall
			    segment. Purely informational — the actual Enter/digits are
			    captured by the global keydown handler above. */}
			{wallChainState.phase === 'drawingSegment' && (
				<div
					className="absolute z-50 pointer-events-none"
					style={{
						left: `${wallChainState.anchor.x * scale + stagePos.x + 16}px`,
						top: `${wallChainState.anchor.y * scale + stagePos.y - 20}px`,
					}}
					data-testid="wall-typed-length-indicator"
				>
					<div className="flex items-center bg-card border border-border rounded-md shadow-lg px-2.5 py-1">
						<span className="text-sm font-mono text-foreground min-w-[2ch]">
							{wallTypedInput ?? '—'}
						</span>
						<span className="text-[11px] text-muted-foreground font-medium pl-1.5 select-none">
							{drawingState.unit}
						</span>
					</div>
					<div className="text-[10px] text-muted-foreground mt-1 whitespace-nowrap select-none">
						Type length · Enter to commit · Esc to cancel
					</div>
				</div>
			)}

			{/* Touch-friendly action pill for the wall-chain flow. Sits at
			    bottom-center of the canvas so fingers can reach it without
			    hunting for Escape or Enter on a physical keyboard. Desktop
			    users keep their keyboard shortcuts (kbd hints below). */}
			{wallChainState.phase === 'drawingSegment' && (
				<div
					className="absolute left-1/2 -translate-x-1/2 bottom-6 z-50 flex items-center gap-2 pointer-events-auto"
					data-testid="wall-chain-action-pill"
				>
					<button
						type="button"
						onClick={() => {
							// Discard the in-progress chain without committing.
							setWallChainState({ phase: 'idle' });
							setWallTypedInput(null);
						}}
						className="h-11 px-4 rounded-full bg-card border border-border shadow-lg text-sm font-medium text-foreground hover:bg-accent active:bg-accent"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={() => {
							commitChain();
							setWallTypedInput(null);
						}}
						className="h-11 px-4 rounded-full bg-primary text-primary-foreground shadow-lg text-sm font-medium hover:opacity-90 active:opacity-80 disabled:opacity-40"
						disabled={wallChainState.segments.length === 0}
					>
						Finish
					</button>
				</div>
			)}

			{/* Same pill for the island drawing flow. */}
			{islandDrawingState.phase !== 'idle' && (
				<div
					className="absolute left-1/2 -translate-x-1/2 bottom-6 z-50 flex items-center gap-2 pointer-events-auto"
					data-testid="island-action-pill"
				>
					<button
						type="button"
						onClick={() => {
							cancelIslandDraw();
							setIslandTypedInput(null);
						}}
						className="h-11 px-4 rounded-full bg-card border border-border shadow-lg text-sm font-medium text-foreground hover:bg-accent active:bg-accent"
					>
						Cancel island
					</button>
				</div>
			)}

			{/* Long-press context menu — positioned at the press location in
			    viewport coords. A backdrop captures outside clicks to dismiss. */}
			{contextMenu && (
				<>
					<div
						className="fixed inset-0 z-[60]"
						onClick={() => setContextMenu(null)}
						onTouchStart={() => setContextMenu(null)}
						data-testid="context-menu-backdrop"
					/>
					<div
						className="fixed z-[61] min-w-[180px] bg-card border border-border rounded-lg shadow-xl overflow-hidden"
						style={{
							left: Math.min(contextMenu.screenX, window.innerWidth - 200),
							top: Math.min(contextMenu.screenY, window.innerHeight - 200),
						}}
						data-testid="context-menu"
						onClick={(e) => e.stopPropagation()}
					>
						{contextMenu.itemType === 'cabinet' && (
							<button
								type="button"
								className="w-full h-11 px-4 text-left text-sm text-foreground hover:bg-accent active:bg-accent"
								onClick={() => {
									const cab = drawingState.cabinets.find(
										(c) => c.id === contextMenu.itemId,
									);
									if (cab) {
										onUpdateCabinet(cab.id, { depthFlipped: !cab.depthFlipped });
										onMoveComplete();
										haptic('light');
									}
									setContextMenu(null);
								}}
							>
								↔ Flip interior side
							</button>
						)}
						<button
							type="button"
							className="w-full h-11 px-4 text-left text-sm text-destructive hover:bg-destructive/10 active:bg-destructive/20"
							onClick={() => {
								onDeleteItem(contextMenu.itemId);
								haptic('heavy');
								setContextMenu(null);
							}}
						>
							🗑 Delete
						</button>
						<button
							type="button"
							className="w-full h-11 px-4 text-left text-sm text-muted-foreground hover:bg-accent active:bg-accent border-t border-border"
							onClick={() => setContextMenu(null)}
						>
							Cancel
						</button>
					</div>
				</>
			)}

			<div className="absolute bottom-3 left-3 flex items-center gap-2 select-none pointer-events-none touch:text-sm">
				<div className="bg-card/90 border border-border rounded-md px-2.5 py-1.5 text-[10px] font-mono text-muted-foreground backdrop-blur-sm touch:text-xs touch:px-3 touch:py-2">
					Zoom: {(scale * 100).toFixed(0)}%
				</div>
				{mousePos && !isTouch && (
					<div className="bg-card/90 border border-border rounded-md px-2.5 py-1.5 text-[10px] font-mono text-muted-foreground backdrop-blur-sm">
						X: {Math.round(mousePos.x / PIXELS_PER_CM)} Y:{' '}
						{Math.round(mousePos.y / PIXELS_PER_CM)} cm
					</div>
				)}
				{snapResult && (
					<div className="bg-primary/10 border border-primary/20 rounded-md px-2.5 py-1.5 text-[10px] font-mono text-primary backdrop-blur-sm touch:text-xs touch:px-3 touch:py-2">
						Snap: {snapResult.type}
					</div>
				)}
				{isWallPlacementTool(activeCustomTool || drawingState.tool) &&
					!wallPlacement && (
						<div
							className="bg-purple-500/10 border border-purple-500/20 rounded-md px-2.5 py-1.5 text-[10px] font-mono text-purple-600 backdrop-blur-sm"
							data-testid="status-wallplace-idle"
						>
							Click on a wall to place{' '}
							{drawingState.tool === 'tall'
								? 'Tall Cabinet'
								: drawingState.tool === 'base'
									? 'Base Cabinet'
									: drawingState.tool === 'wall_cabinet'
										? 'Wall Cabinet'
										: drawingState.tool === 'door'
											? 'Door'
											: 'Window'}
						</div>
					)}
				{wallPlacement?.phase === 'settingOffset' && (
					<div
						className="bg-purple-500/10 border border-purple-500/20 rounded-md px-2.5 py-1.5 text-[10px] font-mono text-purple-600 backdrop-blur-sm"
						data-testid="status-wallplace-offset"
					>
						Move along wall or type offset + Enter
					</div>
				)}
				{wallPlacement?.phase === 'settingLength' && (
					<div
						className="bg-purple-500/10 border border-purple-500/20 rounded-md px-2.5 py-1.5 text-[10px] font-mono text-purple-600 backdrop-blur-sm"
						data-testid="status-wallplace-length"
					>
						Type{' '}
						{wallPlacement.tool === 'tall' ||
						wallPlacement.tool === 'base' ||
						wallPlacement.tool === 'wall_cabinet'
							? 'cabinet'
							: wallPlacement.tool}{' '}
						width + Enter to place
					</div>
				)}
				{drawingState.isDrawing && !wallPlacement && (
					<div className="bg-orange-500/10 border border-orange-500/20 rounded-md px-2.5 py-1.5 text-[10px] font-mono text-orange-600 backdrop-blur-sm">
						Drawing... Click to place or type dimension + Enter
					</div>
				)}
				{dragState && (
					<div className="bg-blue-500/10 border border-blue-500/20 rounded-md px-2.5 py-1.5 text-[10px] font-mono text-blue-600 backdrop-blur-sm">
						{dragState.handle === 'body'
							? 'Moving...'
							: 'Adjusting endpoint...'}
					</div>
				)}
				{drawingState.tool === 'select' &&
					drawingState.selectedId &&
					drawingState.cabinets.find(
						(c) => c.id === drawingState.selectedId
					) && (
						<div className="bg-purple-500/10 border border-purple-500/20 rounded-md px-2.5 py-1.5 text-[10px] font-mono text-purple-600 backdrop-blur-sm">
							Press F to flip depth
						</div>
					)}
			</div>

			{/* Wall point floating popup — positioned near the selected point */}
			{selectedWallPoint && (() => {
				const screenX = selectedWallPoint.posX * scale + stagePos.x;
				const screenY = selectedWallPoint.posY * scale + stagePos.y;
				return (
					<WallPointPopup
						point={selectedWallPoint}
						screenX={screenX}
						screenY={screenY}
						containerWidth={dimensions.width}
						containerHeight={dimensions.height}
						onEdit={() => {
							setEditingWallPoint(selectedWallPoint);
							setSelectedWallPoint(null);
						}}
						onDelete={() => {
							onDeleteWallPoint?.(selectedWallPoint.id);
							setSelectedWallPoint(null);
						}}
						onClose={() => setSelectedWallPoint(null)}
					/>
				);
			})()}

		</div>
	);
}
