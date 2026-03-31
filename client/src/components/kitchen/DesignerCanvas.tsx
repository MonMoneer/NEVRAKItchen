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
	getWallCornerJoints,
	getWallCornerPolygon,
	findCornerCabinetPairs,
	type CornerCabinetPair,
	findNearestWall,
	constrainToWall,
	pointAlongWall,
	getWallDirectionFromRef,
	computeInteriorNormal,
	getWallAnchorPoints,
	checkClearanceViolation,
	calculateRemainingWallSpace,
	type AnchorPoint,
	CABINET_DEPTHS,
	WALL_THICKNESS,
	CABINET_STYLES,
	OPENING_STYLES,
	CLEARANCE_DEPTHS,
	PIXELS_PER_CM,
	SNAP_RADIUS,
} from '@/lib/kitchen-engine';
import { FloatingDimensionInput } from './FloatingDimensionInput';
import type { WallPointItem } from '@/stores/useCanvasStore';
import type { CustomTool } from './Toolbar';

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
	stage?: 'estimated_budget' | 'site_measurement' | 'final';
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

// ── Island Cabinet 2-Phase State ─────────────────────────────────────────────
interface IslandPlacementState {
	phase: 'settingLength' | 'settingDepth';
	start: Point;
	depth: number;
	isFlipped: boolean;
	end?: Point;
	angle?: number;
	length?: number; // pixels
}

// ── Island Cabinet 2-Phase Dimension Panel ───────────────────────────────────
function IslandDimensionPanel({
	phase,
	liveLengthCm,
	liveDepthCm,
	unit,
	onLengthConfirm,
	onDepthConfirm,
	onCancel,
}: {
	phase: 'settingLength' | 'settingDepth';
	liveLengthCm: number;
	liveDepthCm: number;
	unit: 'cm' | 'm';
	onLengthConfirm: (cm: number) => void;
	onDepthConfirm: (cm: number) => void;
	onCancel: () => void;
}) {
	const [value, setValue] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setValue('');
		const t = setTimeout(() => inputRef.current?.focus(), 50);
		return () => clearTimeout(t);
	}, [phase]);

	const liveCm = phase === 'settingLength' ? liveLengthCm : liveDepthCm;
	const placeholder =
		unit === 'm' ? (liveCm / 100).toFixed(2) : `${Math.round(liveCm)}`;

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			const num = parseFloat(value);
			const cm =
				!isNaN(num) && num > 0
					? unit === 'm'
						? num * 100
						: num
					: liveCm;
			if (phase === 'settingLength') onLengthConfirm(cm);
			else onDepthConfirm(cm);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onCancel();
		}
	};

	return (
		<div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
			<div className="bg-card border border-border rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 backdrop-blur-sm">
				<div className="text-xs font-semibold text-amber-500 whitespace-nowrap">
					Island Cabinet
				</div>
				<div className="w-px h-8 bg-border" />
				<label className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
					{phase === 'settingLength' ? 'Length' : 'Depth'}
				</label>
				<div className="flex items-center bg-amber-50 border border-amber-300 rounded-md overflow-hidden">
					<input
						ref={inputRef}
						type="number"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={placeholder}
						className="w-16 h-7 px-2 text-sm font-mono bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
						step="any"
						min="0"
					/>
					<span className="text-[10px] text-muted-foreground font-medium pr-2 select-none">
						{unit}
					</span>
				</div>
				<div className="text-[10px] text-muted-foreground whitespace-nowrap">
					{phase === 'settingDepth' ? 'F to flip · Enter · Esc' : 'Enter · Esc'}
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
	const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
	const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
	const [scale, setScale] = useState(1);
	const [mousePos, setMousePos] = useState<Point | null>(null);
	const [snapResult, setSnapResult] = useState<SnapResult | null>(null);
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
		if (activeCustomTool !== 'island') {
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

	const createElementAtPoints = useCallback(
		(
			startPoint: Point,
			endPoint: Point,
			tool: DrawingState['tool'],
			walls: Wall[],
			parentWallId?: string
		) => {
			const connection = connectWalls(endPoint, walls);
			let finalEnd = connection.point;

			// Offset non-wall elements to inner wall face
			let adjustedStart = { ...startPoint };
			if (tool !== 'wall' && parentWallId) {
				const parentWall = walls.find(w => w.id === parentWallId);
				if (parentWall) {
					const normal = computeInteriorNormal(parentWall.start, parentWall.end, walls);
					const offset = WALL_THICKNESS / 2;
					adjustedStart = { x: startPoint.x + normal.nx * offset, y: startPoint.y + normal.ny * offset };
					finalEnd = { x: finalEnd.x + normal.nx * offset, y: finalEnd.y + normal.ny * offset };
				}
			}

			if (tool === 'wall') {
				const wall: Wall = {
					id: generateId(),
					start: { ...startPoint },
					end: finalEnd,
					thickness: WALL_THICKNESS,
				};
				onAddWall(wall);
			} else if (tool === 'door' || tool === 'window') {
				const opening: Opening = {
					id: generateId(),
					type: tool as OpeningType,
					start: adjustedStart,
					end: finalEnd,
					length: distanceBetween(adjustedStart, finalEnd),
					wallId: parentWallId,
				};
				onAddOpening(opening);
			} else if (
				tool === 'base' ||
				tool === 'wall_cabinet' ||
				tool === 'tall'
			) {
				const flipped = calculateDepthDirection(
					adjustedStart,
					finalEnd,
					walls
				);
				const cabinet: Cabinet = {
					id: generateId(),
					type: tool as CabinetType,
					start: adjustedStart,
					end: finalEnd,
					depth: CABINET_DEPTHS[tool as CabinetType],
					length: distanceBetween(adjustedStart, finalEnd),
					depthFlipped: flipped,
				};
				onAddCabinet(cabinet);
			}
		},
		[onAddWall, onAddCabinet, onAddOpening]
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

	const handleMouseDown = useCallback(
		(e: KonvaEventObject<MouseEvent>) => {
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

			// Site measurement: only allow electrical/plumbing wall-point tools
			if (stage === 'site_measurement') {
				if (activeCustomTool !== 'electrical' && activeCustomTool !== 'plumbing') {
					return;
				}
			}

			const pos = getPointerPos(e);
			if (!pos) {
				return;
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
					// First click: save Point A as a guideline node and start chain
					onAddGuideline?.({ id: generateId(), start: finalPos, end: finalPos });
					setMeasureTape({ startPoint: finalPos });
				} else {
					// Subsequent click: confirm end, save guideline segment, chain continues
					onAddGuideline?.({ id: generateId(), start: measureTape.startPoint, end: finalPos });
					setMeasureTape({ startPoint: finalPos });
				}
				return;
			}

			// ── Island Cabinet: Edge-Based Extrusion ─────────────────────────
			if (activeCustomTool === 'island') {
				const snapPos = snapResult?.point ?? pos;
				if (!islandPlacement) {
					// Phase 0 → Phase 1: first click locks Point A
					setIslandPlacement({ phase: 'settingLength', start: snapPos, depth: 90, isFlipped: false });
				} else if (islandPlacement.phase === 'settingLength') {
					// Phase 1 → Phase 2: second click confirms axis end
					const liveEnd = shiftHeldRef.current ? constrainToAxis(islandPlacement.start, snapPos) : snapPos;
					const length = distanceBetween(islandPlacement.start, liveEnd);
					if (length < 5) { setIslandPlacement(null); return; }
					const angle = angleBetween(islandPlacement.start, liveEnd);
					setIslandPlacement({ ...islandPlacement, phase: 'settingDepth', end: liveEnd, angle, length });
				} else if (islandPlacement.phase === 'settingDepth') {
					placeIsland(islandPlacement);
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

			if (tool === 'delete') {
				const hit = findHitTarget(
					pos,
					walls,
					cabinets,
					12,
					drawingState.openings
				);
				if (hit) {
					onDeleteItem(hit.id);
				}
				return;
			}

			if (tool === 'select') {
				const hit = findHitTarget(
					pos,
					walls,
					cabinets,
					12,
					drawingState.openings
				);
				if (hit) {
					onSelectItem(hit.id);

					if (hit.type !== 'opening') {
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
				} else {
					onSelectItem(null);
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
			constrainToAxis,
		]
	);

	const handleMouseMove = useCallback(
		(e: KonvaEventObject<MouseEvent>) => {
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

			if (
				isWallPlacementTool(activeCustomTool || tool) &&
				!wallPlacement
			) {
				const wallResult = findNearestWall(pos, walls, 30);
				setHoveredWallId(wallResult ? wallResult.wall.id : null);
				if (wallResult) {
					setWallAnchorPoints(getWallAnchorPoints(wallResult.wall, cabinets, drawingState.openings));
				} else {
					setWallAnchorPoints([]);
				}
			} else if (!isWallPlacementTool(activeCustomTool || tool)) {
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
			// Snap to guideline endpoints
			let bestSnapDist = currentSnap ? distanceBetween(pos, currentSnap.point) : SNAP_RADIUS;
			for (const g of guidelines) {
				for (const gpt of [g.start, g.end]) {
					const d = distanceBetween(pos, gpt);
					if (d < bestSnapDist) {
						bestSnapDist = d;
						currentSnap = { point: gpt, type: 'endpoint' };
					}
				}
			}
			setSnapResult(currentSnap);

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
		]
	);

	const handleMouseUp = useCallback(
		(e: KonvaEventObject<MouseEvent>) => {
			if (
				e.evt.button === 1 ||
				(isPanning && drawingState.tool === 'pan')
			) {
				setIsPanning(false);
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
		[dragState, getPointerPos, onMoveComplete, isPanning, drawingState.tool]
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
		if (!ip.end || ip.angle === undefined || ip.length === undefined) return;
		const cabinet: Cabinet = {
			id: generateId(),
			type: 'island',
			start: ip.start,
			end: ip.end,
			depth: ip.depth,
			length: pixelsToCm(ip.length),
			depthFlipped: ip.isFlipped,
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
			if (e.key === 'Escape') {
				if (islandPlacement) {
					setIslandPlacement(null);
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
				if (islandPlacement?.phase === 'settingDepth') {
					setIslandPlacement(prev => prev ? { ...prev, isFlipped: !prev.isFlipped } : null);
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
					const depthPx = cmToPixels(CABINET_DEPTHS[cabType]);

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
					// Dynamically determine interior depth direction using the same
					// logic as calculateDepthDirection — works for any polygon room.
					const interiorFlipped = calculateDepthDirection(
						offsetPosition,
						lengthEndPt,
						drawingState.walls
					);
					const ghostYTop = interiorFlipped ? -depthPx : 0;
					const ghostYMid = interiorFlipped ? -depthPx / 2 : depthPx / 2;
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
			const liveEnd = shiftHeldRef.current
				? constrainToAxis(measureTape.startPoint, mousePos)
				: mousePos;
			const liveLenCm = Math.round(pixelsToCm(distanceBetween(measureTape.startPoint, liveEnd)));
			const liveMid = { x: (measureTape.startPoint.x + liveEnd.x) / 2, y: (measureTape.startPoint.y + liveEnd.y) / 2 };
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


	// ── Island Cabinet rendering ────────────────────────────────────────────
	const renderIslandPlacement = () => {
		if (!islandPlacement || !mousePos) return null;
		const ip = islandPlacement;
		const elements: JSX.Element[] = [];

		if (ip.phase === 'settingLength') {
			// Live axis line from start to mouse (ortho-locked if Shift)
			const liveEnd = shiftHeldRef.current ? constrainToAxis(ip.start, mousePos) : mousePos;
			const lenPx = distanceBetween(ip.start, liveEnd);
			const lenCm = Math.round(pixelsToCm(lenPx));
			const mid = { x: (ip.start.x + liveEnd.x) / 2, y: (ip.start.y + liveEnd.y) / 2 };
			elements.push(
				<Group key="island-phase1" listening={false}>
					<Line
						points={[ip.start.x, ip.start.y, liveEnd.x, liveEnd.y]}
						stroke="#F59E0B"
						strokeWidth={2 / scale}
						dash={[6, 4]}
						listening={false}
					/>
					<Circle x={ip.start.x} y={ip.start.y} radius={5 / scale}
						fill="#F59E0B" listening={false} />
					<Circle x={liveEnd.x} y={liveEnd.y} radius={4 / scale}
						stroke="#F59E0B" strokeWidth={1.5 / scale} fill="white" listening={false} />
					{lenPx > 10 && (
						<>
							<Rect
								x={mid.x - 18 / scale} y={mid.y - 9 / scale}
								width={36 / scale} height={16 / scale}
								fill="#F59E0B" cornerRadius={3 / scale} opacity={0.9}
							/>
							<Text x={mid.x} y={mid.y}
								text={`${lenCm}cm`} fontSize={9 / scale} fill="white"
								align="center" offsetX={18 / scale} offsetY={8 / scale} listening={false} />
						</>
					)}
				</Group>
			);
		} else if (ip.phase === 'settingDepth' && ip.end && ip.angle !== undefined && ip.length !== undefined) {
			const depthPx = cmToPixels(ip.depth);
			const angleDeg = (ip.angle * 180) / Math.PI;
			const perpSign = ip.isFlipped ? 1 : -1;
			const perpAngle = ip.angle + perpSign * Math.PI / 2;
			const depthMidX = (ip.start.x + ip.end.x) / 2 + Math.cos(perpAngle) * depthPx / 2;
			const depthMidY = (ip.start.y + ip.end.y) / 2 + Math.sin(perpAngle) * depthPx / 2;
			const depthCm = Math.round(ip.depth);
			const lenCm = Math.round(pixelsToCm(ip.length));
			elements.push(
				<Group key="island-phase2" listening={false}>
					{/* Base edge */}
					<Line
						points={[ip.start.x, ip.start.y, ip.end.x, ip.end.y]}
						stroke="#F59E0B" strokeWidth={2 / scale} listening={false}
					/>
					<Circle x={ip.start.x} y={ip.start.y} radius={5 / scale} fill="#F59E0B" listening={false} />
					<Circle x={ip.end.x} y={ip.end.y} radius={5 / scale} fill="#F59E0B" listening={false} />
					{/* Extruded rectangle */}
					<Group x={ip.start.x} y={ip.start.y} rotation={angleDeg} listening={false}>
						<Rect
							x={0} y={ip.isFlipped ? 0 : -depthPx}
							width={ip.length} height={depthPx}
							fill="rgba(168,85,247,0.2)" stroke="#A855F7"
							strokeWidth={1.5 / scale} dash={[6, 3]}
						/>
						<Text
							x={ip.length / 2} y={ip.isFlipped ? depthPx / 2 : -depthPx / 2}
							text="IC" fontSize={12 / scale} fill="#7C3AED"
							align="center" offsetX={8 / scale} offsetY={6 / scale} listening={false}
						/>
					</Group>
					{/* Length label */}
					<Rect
						x={(ip.start.x + ip.end.x) / 2 - 18 / scale}
						y={(ip.start.y + ip.end.y) / 2 - 9 / scale}
						width={36 / scale} height={16 / scale}
						fill="#F59E0B" cornerRadius={3 / scale} opacity={0.9}
					/>
					<Text
						x={(ip.start.x + ip.end.x) / 2} y={(ip.start.y + ip.end.y) / 2}
						text={`${lenCm}cm`} fontSize={9 / scale} fill="white"
						align="center" offsetX={18 / scale} offsetY={8 / scale} listening={false}
					/>
					{/* Depth label */}
					<Rect
						x={depthMidX - 18 / scale} y={depthMidY - 9 / scale}
						width={36 / scale} height={16 / scale}
						fill="#A855F7" cornerRadius={3 / scale} opacity={0.9}
					/>
					<Text
						x={depthMidX} y={depthMidY}
						text={`${depthCm}cm`} fontSize={9 / scale} fill="white"
						align="center" offsetX={18 / scale} offsetY={8 / scale} listening={false}
					/>
				</Group>
			);
		}

		if (elements.length === 0) return null;
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
		const depthPx = cmToPixels(cabinet.depth);
		const deg = (angle * 180) / Math.PI;
		const yOffset = cabinet.depthFlipped ? -depthPx : 0;

		// Simple rectangle — cabinets overlap cleanly at corners (L-shape)
		const points = [
			0,
			yOffset,
			length,
			yOffset,
			length,
			yOffset + depthPx,
			0,
			yOffset + depthPx,
		];
		const minX = 0;
		const maxX = length;
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
					<Text
						x={0}
						y={yOffset}
						width={length}
						height={depthPx}
						text={style.label}
						fontSize={Math.min(11, depthPx * 0.35)}
						fill={style.textColor}
						fontStyle="bold"
						fontFamily="sans-serif"
						align="center"
						verticalAlign="middle"
						listening={false}
					/>
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
				{renderDimensionLabel(
					cabinet.start,
					cabinet.end,
					drawingState.unit
				)}
			</Group>
		);
	};

	const renderWalls = () => {
		return drawingState.walls.map((wall) => {
			const isSelected = drawingState.selectedId === wall.id;
			const isHovered = hoveredWallId === wall.id;
			const strokeColor = isSelected
				? '#f97316'
				: isHovered
					? '#A855F7'
					: '#374151';
			return (
				<Group key={wall.id}>
					{isHovered && (
						<Line
							points={[
								wall.start.x,
								wall.start.y,
								wall.end.x,
								wall.end.y,
							]}
							stroke="#A855F7"
							strokeWidth={(wall.thickness + 8) / scale}
							opacity={0.2}
							lineCap="round"
							lineJoin="round"
							listening={false}
						/>
					)}
					<Line
						points={[
							wall.start.x,
							wall.start.y,
							wall.end.x,
							wall.end.y,
						]}
						stroke={strokeColor}
						strokeWidth={
							wall.thickness / scale > 4 ? wall.thickness : 4
						}
						lineCap="round"
						lineJoin="round"
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
		const order: Record<CabinetType, number> = {
			base: 0,
			tall: 1,
			wall_cabinet: 2,
			island: 3,
		};

		const sortedCabinets = [...drawingState.cabinets].sort((a, b) => {
			const tA = order[a.type] ?? 0;
			const tB = order[b.type] ?? 0;
			if (tA === tB) {
				// preserve existing placement tie-breaker fallback logic
				const oA = drawingState.cabinets.indexOf(a);
				const oB = drawingState.cabinets.indexOf(b);
				return oA - oB;
			}
			return tA - tB;
		});

		return sortedCabinets.map((cabinet) => {
			const isSelected = drawingState.selectedId === cabinet.id;
			return renderCabinetBody(cabinet, isSelected, pairs);
		});
	};

	const renderWallCornerJoints = () => {
		const joints = getWallCornerJoints(drawingState.walls);
		return joints.map((joint, idx) => {
			const polygon = getWallCornerPolygon(joint);
			const points = polygon.flatMap((p) => [p.x, p.y]);
			return (
				<Line
					key={`wall-corner-${idx}`}
					points={points}
					fill="#374151"
					closed={true}
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
			const wallThickPx = WALL_THICKNESS;

			return (
				<Group key={opening.id}>
					<Line
						points={[
							opening.start.x,
							opening.start.y,
							opening.end.x,
							opening.end.y,
						]}
						stroke={isSelected ? '#f97316' : style.stroke}
						strokeWidth={wallThickPx}
						lineCap="butt"
						lineJoin="round"
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
										-wallThickPx / 2,
										length,
										wallThickPx / 2,
									]}
									stroke={style.textColor}
									strokeWidth={0.8 / scale}
									opacity={0.4}
									listening={false}
								/>
								<Line
									points={[
										0,
										wallThickPx / 2,
										length,
										-wallThickPx / 2,
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
									wallThickPx / 2,
									0,
									wallThickPx / 2 + length * 0.4,
									length * 0.3,
									wallThickPx / 2,
								]}
								stroke={style.stroke}
								strokeWidth={1 / scale}
								opacity={0.4}
								tension={0.5}
								listening={false}
							/>
						)}
						<Text
							x={0}
							y={-wallThickPx / 2}
							width={length}
							height={wallThickPx}
							text={style.label}
							fontSize={Math.min(9, wallThickPx * 0.6)}
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
						fill={style.stroke}
					/>
					<Circle
						x={opening.end.x}
						y={opening.end.y}
						radius={4 / scale}
						fill={style.stroke}
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
		const labelX = mid.x + Math.cos(angle + Math.PI / 2) * perpOffset;
		const labelY = mid.y + Math.sin(angle + Math.PI / 2) * perpOffset;

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
				listening={false}
			/>
		);
	};

	const renderSplitPreview = () => {
		const { isDrawing, startPoint, previewPoint, tool, cabinets } =
			drawingState;
		if (!isDrawing || !startPoint || !previewPoint || tool !== 'tall') {
			return null;
		}

		const overlapping = findOverlappingCabinets(
			startPoint,
			previewPoint,
			cabinets,
			['base', 'wall_cabinet']
		);
		if (overlapping.length === 0) {
			return null;
		}

		return (
			<Group listening={false}>
				{overlapping.map((cab) => {
					const { splitStart, splitEnd, consumed } =
						computeSplitPoints(cab, startPoint, previewPoint);

					const depthPx = cmToPixels(cab.depth);
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
			return (
				<Group listening={false}>
					<Line
						points={[
							startPoint.x,
							startPoint.y,
							previewPoint.x,
							previewPoint.y,
						]}
						stroke="#9CA3AF"
						strokeWidth={WALL_THICKNESS}
						dash={[8, 4]}
						lineCap="round"
						opacity={0.5}
					/>
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
			const depthPx = cmToPixels(CABINET_DEPTHS[tool as CabinetType]);
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
		return (
			<Group listening={false}>
				<Circle
					x={snapResult.point.x}
					y={snapResult.point.y}
					radius={SNAP_VISUAL_RADIUS / scale}
					fill={snapResult.type === 'corner' ? '#f97316' : '#3B82F6'}
					opacity={0.6}
				/>
				<Circle
					x={snapResult.point.x}
					y={snapResult.point.y}
					radius={(SNAP_VISUAL_RADIUS + 4) / scale}
					stroke={
						snapResult.type === 'corner' ? '#f97316' : '#3B82F6'
					}
					strokeWidth={1.5 / scale}
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
		const depthPx = cmToPixels(cab.depth);
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
			style={{ cursor: getCursorStyle() }}
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
			>
				<Layer name="grid">{renderGrid()}</Layer>
				{refImg && (
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
					{stage !== 'site_measurement' && renderClearanceZones()}
					{stage !== 'site_measurement' && renderWalls()}
					{stage !== 'site_measurement' && renderWallCornerJoints()}
					{stage !== 'site_measurement' && renderOpenings()}
					{stage !== 'site_measurement' && renderCabinets()}
					{renderWallPoints()}
					{renderWallPointRuler()}
					{renderMeasureTape()}
					{renderIslandPlacement()}
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

			{islandPlacement && (
				<IslandDimensionPanel
					phase={islandPlacement.phase}
					liveLengthCm={mousePos ? pixelsToCm(distanceBetween(islandPlacement.start,
						shiftHeldRef.current ? constrainToAxis(islandPlacement.start, mousePos) : mousePos)) : 0}
					liveDepthCm={islandPlacement.depth}
					unit={drawingState.unit}
					onLengthConfirm={(cm) => {
						if (!islandPlacement || !mousePos) return;
						const liveEnd = shiftHeldRef.current ? constrainToAxis(islandPlacement.start, mousePos) : mousePos;
						const angle = angleBetween(islandPlacement.start, liveEnd);
						const lengthPx = cmToPixels(cm);
						const end: Point = {
							x: islandPlacement.start.x + Math.cos(angle) * lengthPx,
							y: islandPlacement.start.y + Math.sin(angle) * lengthPx,
						};
						setIslandPlacement({ ...islandPlacement, phase: 'settingDepth', end, angle, length: lengthPx });
					}}
					onDepthConfirm={(cm) => placeIsland({ ...islandPlacement, depth: cm })}
					onCancel={() => setIslandPlacement(null)}
				/>
			)}

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

			<div className="absolute bottom-3 left-3 flex items-center gap-2 select-none pointer-events-none">
				<div className="bg-card/90 border border-border rounded-md px-2.5 py-1.5 text-[10px] font-mono text-muted-foreground backdrop-blur-sm">
					Zoom: {(scale * 100).toFixed(0)}%
				</div>
				{mousePos && (
					<div className="bg-card/90 border border-border rounded-md px-2.5 py-1.5 text-[10px] font-mono text-muted-foreground backdrop-blur-sm">
						X: {Math.round(mousePos.x / PIXELS_PER_CM)} Y:{' '}
						{Math.round(mousePos.y / PIXELS_PER_CM)} cm
					</div>
				)}
				{snapResult && (
					<div className="bg-primary/10 border border-primary/20 rounded-md px-2.5 py-1.5 text-[10px] font-mono text-primary backdrop-blur-sm">
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

			{/* Wall point detail panel — shown when a wall point is selected */}
			{selectedWallPoint && (
				<div className="absolute top-4 right-4 z-50 bg-white border-2 border-gray-200 rounded-xl shadow-xl w-72 p-4">
					<div className="flex items-center justify-between mb-3">
						<div className="flex items-center gap-2">
							<span className="text-lg">
								{selectedWallPoint.type === 'electrical'
									? '⚡'
									: '💧'}
							</span>
							<h3 className="text-sm font-bold text-gray-800">
								{selectedWallPoint.type === 'electrical'
									? 'Electrical Point'
									: 'Plumbing Point'}
							</h3>
						</div>
						<button
							onClick={() => setSelectedWallPoint(null)}
							className="text-gray-400 hover:text-gray-600 text-lg leading-none"
						>
							×
						</button>
					</div>
					<div className="space-y-2 text-sm text-gray-700">
						<div className="flex justify-between">
							<span className="text-gray-500">
								Height from floor
							</span>
							<span className="font-semibold">
								{selectedWallPoint.heightCm} cm
							</span>
						</div>
						<div className="flex justify-between">
							<span className="text-gray-500">
								Distance from corner
							</span>
							<span className="font-semibold">
								{selectedWallPoint.distanceCm} cm
							</span>
						</div>
						{selectedWallPoint.note && (
							<div>
								<span className="text-gray-500 block">
									Note
								</span>
								<span className="text-gray-800">
									{selectedWallPoint.note}
								</span>
							</div>
						)}
						{selectedWallPoint.photo && (
							<img
								src={selectedWallPoint.photo}
								alt="wall point photo"
								className="w-full h-28 object-cover rounded-lg border border-gray-200 mt-1"
							/>
						)}
					</div>
					<div className="mt-3 flex gap-2">
						<button
							onClick={() => {
								setEditingWallPoint(selectedWallPoint);
								setSelectedWallPoint(null);
							}}
							className="flex-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg py-1.5 hover:bg-blue-50 transition-colors"
						>
							Edit
						</button>
						<button
							onClick={() => {
								onDeleteWallPoint?.(selectedWallPoint.id);
								setSelectedWallPoint(null);
							}}
							className="flex-1 text-xs font-medium text-red-600 border border-red-200 rounded-lg py-1.5 hover:bg-red-50 transition-colors"
						>
							Delete
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
