import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import type Konva from 'konva';
import { useAuthStore } from '@/stores/useAuthStore';
import {
	useProjectStore,
	type ProjectStage,
	ProjectSpace,
} from '@/stores/useProjectStore';
import { useSpaceStore } from '@/stores/useSpaceStore';
import { useCanvasStore } from '@/stores/useCanvasStore';
import {
	Toolbar,
	type ElementDef,
	type CustomTool,
} from '@/components/kitchen/Toolbar';
import { DesignerCanvas } from '@/components/kitchen/DesignerCanvas';
import { PricingPanel } from '@/components/kitchen/PricingPanel';
import {
	type Wall,
	type Cabinet,
	type Opening,
	splitCabinetAroundTall,
	findOverlappingCabinets,
	checkClearanceViolation,
	distanceBetween,
	cmToPixels,
	WALL_THICKNESS,
} from '@/lib/kitchen-engine';
import { exportToPDF } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '@/components/ui/dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import {
	ArrowLeft,
	Plus,
	ChevronDown,
	Eye,
	EyeOff,
	Camera,
	FileText,
	MoreHorizontal,
	Trash2,
} from 'lucide-react';

// ─── Space type config ────────────────────────────────────────────────────────

const SPACE_TYPES = [
	{ value: 'kitchen', label: 'Kitchen', icon: '🍳' },
	{ value: 'bathroom', label: 'Bathroom', icon: '🚿' },
	{ value: 'washroom', label: 'Washroom', icon: '🪥' },
	{ value: 'tv_unit', label: 'TV Unit', icon: '📺' },
];

const STAGE_LABELS: Record<ProjectStage, string> = {
	estimated_budget: 'Estimated Budget',
	site_measurement: 'Site Measurement',
	final: 'Final',
};

// ─── Add space dialog ─────────────────────────────────────────────────────────

function AddSpaceDialog({
	open,
	onOpenChange,
	onAdd,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	onAdd: (name: string, type: string) => void;
}) {
	const [type, setType] = useState('kitchen');
	const [name, setName] = useState('');

	const handleSubmit = () => {
		const label = SPACE_TYPES.find((t) => t.value === type)?.label ?? type;
		onAdd(name.trim() || label, type);
		onOpenChange(false);
		setName('');
		setType('kitchen');
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Add Space</DialogTitle>
				</DialogHeader>
				<div className="space-y-3 py-2">
					<div className="grid grid-cols-2 gap-2">
						{SPACE_TYPES.map((t) => (
							<button
								key={t.value}
								onClick={() => setType(t.value)}
								className={`flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
									type === t.value
										? 'border-primary bg-primary/5 font-medium'
										: 'border-border hover:border-primary/50'
								}`}
							>
								<span>{t.icon}</span>
								{t.label}
							</button>
						))}
					</div>
					<Input
						placeholder="Custom name (optional)"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button onClick={handleSubmit}>Add space</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Notes + photos side panel ────────────────────────────────────────────────

function SpaceSidePanel({
	spaceId,
	notes,
	onNotesChange,
	stage,
}: {
	spaceId: number;
	notes: string;
	onNotesChange: (v: string) => void;
	stage: ProjectStage;
}) {
	const [photos, setPhotos] = useState<
		{ id: number; caption: string; createdAt: string }[]
	>([]);
	const [uploading, setUploading] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);
	const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		fetch(`/api/spaces/${spaceId}/photos`)
			.then((r) => r.json())
			.then((d) => setPhotos(Array.isArray(d) ? d : []));
	}, [spaceId]);

	const handleNotesChange = (v: string) => {
		onNotesChange(v);
		if (saveTimeout.current) {
			clearTimeout(saveTimeout.current);
		}
		saveTimeout.current = setTimeout(() => {
			fetch(`/api/spaces/${spaceId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notes: v }),
			});
		}, 800);
	};

	const handlePhotoUpload = async (
		e: React.ChangeEvent<HTMLInputElement>
	) => {
		const file = e.target.files?.[0];
		if (!file) {
			return;
		}
		setUploading(true);

		const reader = new FileReader();
		reader.onload = async () => {
			const data = reader.result as string;
			try {
				const res = await fetch(`/api/spaces/${spaceId}/photos`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ data, caption: file.name }),
				});
				if (res.ok) {
					const photo = await res.json();
					setPhotos((prev) => [photo, ...prev]);
				}
			} finally {
				setUploading(false);
				if (fileRef.current) {
					fileRef.current.value = '';
				}
			}
		};
		reader.readAsDataURL(file);
	};

	const handleDeletePhoto = async (id: number) => {
		await fetch(`/api/photos/${id}`, { method: 'DELETE' });
		setPhotos((prev) => prev.filter((p) => p.id !== id));
	};

	return (
		<div className="w-64 shrink-0 border-l flex flex-col bg-white overflow-y-auto">
			<div className="px-3 py-2 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
				<FileText className="h-3.5 w-3.5" /> Notes
			</div>
			<div className="p-2">
				<Textarea
					value={notes}
					onChange={(e) => handleNotesChange(e.target.value)}
					placeholder="Add notes for this space…"
					className="text-sm resize-none min-h-[120px]"
				/>
			</div>

			<div className="px-3 py-2 border-b border-t text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-between">
				<span className="flex items-center gap-1.5">
					<Camera className="h-3.5 w-3.5" /> Photos
				</span>
				<button
					className="text-primary hover:underline text-xs normal-case"
					onClick={() => fileRef.current?.click()}
					disabled={uploading}
				>
					{uploading ? 'Uploading…' : '+ Add'}
				</button>
				<input
					ref={fileRef}
					type="file"
					accept="image/*"
					capture="environment"
					className="hidden"
					onChange={handlePhotoUpload}
				/>
			</div>

			<div className="p-2 space-y-2">
				{photos.length === 0 ? (
					<p className="text-xs text-muted-foreground text-center py-4">
						No photos yet
					</p>
				) : (
					photos.map((photo) => (
						<div
							key={photo.id}
							className="flex items-center justify-between text-xs bg-gray-50 rounded p-1.5"
						>
							<span className="truncate text-muted-foreground">
								{photo.caption || 'photo'}
							</span>
							<button
								onClick={() => handleDeletePhoto(photo.id)}
								className="ml-1 text-red-400 hover:text-red-600"
							>
								<Trash2 className="h-3 w-3" />
							</button>
						</div>
					))
				)}
			</div>
		</div>
	);
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProjectDetail({ id }: { id: number }) {
	const [, navigate] = useLocation();
	const { toast } = useToast();
	const { user } = useAuthStore();
	const { currentProject, setCurrentProject, updateCurrentProject } =
		useProjectStore();
	const {
		spaces,
		activeSpaceId,
		setSpaces,
		setActiveSpaceId,
		updateSpace,
		addSpace,
		removeSpace,
	} = useSpaceStore();
	const canvasStore = useCanvasStore();

	const [addSpaceOpen, setAddSpaceOpen] = useState(false);
	const [showSidePanel, setShowSidePanel] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [spaceNotes, setSpaceNotes] = useState('');
	const [elementDefs, setElementDefs] = useState<ElementDef[]>([]);
	const [activeElementDefId, setActiveElementDefId] = useState<number | null>(
		null
	);
	const [activeCustomTool, setActiveCustomTool] = useState<CustomTool>(null);
	const konvaStageRef = useRef<Konva.Stage | null>(null);
	const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

	const activeSpace = spaces.find((s) => s.id === activeSpaceId);
	const stage = (currentProject?.stage ?? 'estimated_budget') as ProjectStage;
	const isTechnician = user?.role === 'technician';
	// Pricing hidden for technicians AND during site_measurement (field measure only)
	const canEditPricing = !isTechnician && stage !== 'site_measurement';

	// Load element definitions once
	useEffect(() => {
		fetch('/api/element-definitions')
			.then((r) => r.json())
			.then((d) => setElementDefs(Array.isArray(d) ? d : []));
	}, []);

	// Load project + spaces
	useEffect(() => {
		fetch(`/api/projects/${id}`)
			.then((r) => r.json())
			.then((data) => {
				if (data.error) {
					return navigate('/projects');
				}
				setCurrentProject(data);
				setSpaces(data.spaces ?? []);
			});
	}, [id, setCurrentProject, setSpaces, navigate]);

	// Load canvas data when active space changes
	useEffect(() => {
		if (!activeSpace) {
			return;
		}
		setSpaceNotes(activeSpace.notes ?? '');

		const data = activeSpace.canvasData as any;
		if (data) {
			canvasStore.loadFromCanvasData(data);
		} else {
			canvasStore.clear();
			canvasStore.setSelectedFinishing(activeSpace.finishing ?? '1');
		}
	}, [activeSpaceId]); // eslint-disable-line react-hooks/exhaustive-deps

	// Auto-save canvas data on changes (debounced)
	const scheduleCanvasSave = useCallback(() => {
		if (!activeSpaceId) {
			return;
		}
		if (saveTimeout.current) {
			clearTimeout(saveTimeout.current);
		}
		saveTimeout.current = setTimeout(async () => {
			const data = canvasStore.getCanvasData();
			await fetch(`/api/spaces/${activeSpaceId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					canvasData: data,
					finishing: data.selectedFinishing,
				}),
			});
		}, 1500);
	}, [activeSpaceId, canvasStore]);

	// ── Canvas event handlers ───────────────────────────────────────────────────

	const handleAddWall = useCallback(
		(wall: Wall) => {
			canvasStore.addWall(wall);
			scheduleCanvasSave();
		},
		[canvasStore, scheduleCanvasSave]
	);

	const handleAddCabinet = useCallback(
		(cabinet: Cabinet) => {
			const { drawingState } = canvasStore;
			const violation = checkClearanceViolation(
				cabinet.start,
				cabinet.end,
				cabinet.type,
				drawingState.openings,
				drawingState.walls
			);
			if (violation) {
				toast({ title: violation.reason, variant: 'destructive' });
				return;
			}

			let newCabinets = [...drawingState.cabinets];
			if (cabinet.type === 'tall') {
				const overlapping = findOverlappingCabinets(
					cabinet.start,
					cabinet.end,
					newCabinets,
					['base', 'wall_cabinet']
				);
				for (const existing of overlapping) {
					const result = splitCabinetAroundTall(
						existing,
						cabinet.start,
						cabinet.end
					);
					newCabinets = newCabinets.filter(
						(c) => c.id !== existing.id
					);
					if (result.before) {
						newCabinets.push(result.before);
					}
					if (result.after) {
						newCabinets.push(result.after);
					}
				}
				newCabinets.push(cabinet);
				canvasStore.setDrawingState((prev) => ({
					...prev,
					cabinets: newCabinets,
					startPoint: null,
					previewPoint: null,
					isDrawing: false,
				}));
			} else {
				canvasStore.addCabinet(cabinet);
			}
			scheduleCanvasSave();
		},
		[canvasStore, toast, scheduleCanvasSave]
	);

	const handleAddOpening = useCallback(
		(opening: Opening) => {
			canvasStore.addOpening(opening);
			scheduleCanvasSave();
		},
		[canvasStore, scheduleCanvasSave]
	);

	const handleUpdateCabinet = useCallback(
		(id: string, updates: Partial<Cabinet>) => {
			canvasStore.setDrawingState((prev) => ({
				...prev,
				cabinets: prev.cabinets.map((c) =>
					c.id === id
						? {
								...c,
								...updates,
								length: distanceBetween(
									updates.start || c.start,
									updates.end || c.end
								),
							}
						: c
				),
			}));
		},
		[canvasStore]
	);

	const handleAddElement = useCallback(
		(partial: Parameters<typeof canvasStore.addElement>[0]) => {
			const def = elementDefs.find((d) => d.id === partial.definitionId);
			if (!def) {
				return;
			}
			canvasStore.addElement({
				...partial,
				name: def.name,
				category: def.category,
				icon: def.icon,
			});
			scheduleCanvasSave();
		},
		[elementDefs, canvasStore, scheduleCanvasSave]
	);

	const handleMoveComplete = useCallback(() => {
		canvasStore.moveComplete();
		scheduleCanvasSave();
	}, [canvasStore, scheduleCanvasSave]);

	const handleDeleteItem = useCallback(
		(id: string) => {
			canvasStore.deleteItem(id);
			scheduleCanvasSave();
		},
		[canvasStore, scheduleCanvasSave]
	);

	const handleUndo = useCallback(() => {
		canvasStore.undo();
		scheduleCanvasSave();
	}, [canvasStore, scheduleCanvasSave]);

	const handleRedo = useCallback(() => {
		canvasStore.redo();
		scheduleCanvasSave();
	}, [canvasStore, scheduleCanvasSave]);

	const handleClear = useCallback(() => {
		canvasStore.clear();
		scheduleCanvasSave();
		toast({ title: 'Canvas cleared' });
	}, [canvasStore, scheduleCanvasSave, toast]);

	// ── Canvas image capture ────────────────────────────────────────────────────

	const captureCanvasImage = useCallback((): string | undefined => {
		const konvaStage = konvaStageRef.current;
		if (!konvaStage) {
			return undefined;
		}
		const { drawingState } = canvasStore;

		const allPoints: { x: number; y: number }[] = [];
		drawingState.walls.forEach((w) => {
			allPoints.push(w.start, w.end);
		});
		drawingState.cabinets.forEach((c) => {
			allPoints.push(c.start, c.end);
		});
		drawingState.openings.forEach((o) => {
			allPoints.push(o.start, o.end);
		});
		if (allPoints.length === 0) {
			return undefined;
		}

		const maxDepthPx = drawingState.cabinets.reduce(
			(max, c) => Math.max(max, cmToPixels(c.depth)),
			0
		);
		const extraMargin = Math.max(maxDepthPx, WALL_THICKNESS) + 40;
		const padding = 80 + extraMargin;
		const minX = Math.min(...allPoints.map((p) => p.x)) - padding;
		const minY = Math.min(...allPoints.map((p) => p.y)) - padding;
		const maxX = Math.max(...allPoints.map((p) => p.x)) + padding;
		const maxY = Math.max(...allPoints.map((p) => p.y)) + padding;

		const gridLayer = konvaStage.findOne('.grid');
		const wasGridVisible = gridLayer?.visible();
		if (gridLayer) {
			gridLayer.visible(false);
		}
		konvaStage.batchDraw();

		const scale = konvaStage.scaleX() || 1;
		const dataUrl = konvaStage.toDataURL({
			x: minX * scale + konvaStage.x(),
			y: minY * scale + konvaStage.y(),
			width: (maxX - minX) * scale,
			height: (maxY - minY) * scale,
			pixelRatio: 3 / scale,
			mimeType: 'image/png',
		});

		if (gridLayer) {
			gridLayer.visible(wasGridVisible ?? true);
		}
		konvaStage.batchDraw();
		return dataUrl;
	}, [canvasStore]);

	// ── Export ─────────────────────────────────────────────────────────────────

	const handleExport = useCallback(async () => {
		try {
			const { drawingState, selectedFinishing } = canvasStore;
			const layoutImage = captureCanvasImage();
			await exportToPDF(
				drawingState.walls,
				drawingState.cabinets,
				selectedFinishing,
				currentProject?.name,
				currentProject?.clientName,
				currentProject?.clientPhone,
				drawingState.openings,
				layoutImage
			);
			toast({ title: 'PDF exported successfully' });
		} catch {
			toast({ title: 'Export failed', variant: 'destructive' });
		}
	}, [canvasStore, captureCanvasImage, currentProject, toast]);

	// ── Stage transitions ───────────────────────────────────────────────────────

	const handleAdvanceToMeasurement = useCallback(async () => {
		if (
			!confirm(
				'Send to Site Measurement? This will save and capture the current design as reference.'
			)
		) {
			return;
		}
		setIsSaving(true);

		try {
			// Flush any pending auto-save for the active space first
			if (saveTimeout.current) {
				clearTimeout(saveTimeout.current);
				saveTimeout.current = null;
			}
			if (activeSpaceId) {
				const data = canvasStore.getCanvasData();
				await fetch(`/api/spaces/${activeSpaceId}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						canvasData: data,
						finishing: data.selectedFinishing,
					}),
				});
			}

			// Capture and save reference image for the active space
			if (activeSpaceId) {
				const image = captureCanvasImage();
				if (image) {
					await fetch(`/api/spaces/${activeSpaceId}/reference`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ referenceImage: image }),
					});
				}
			}

			const res = await fetch(`/api/projects/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stage: 'site_measurement' }),
			});

			if (res.ok) {
				updateCurrentProject({ stage: 'site_measurement' });
				toast({ title: 'Project sent to Site Measurement' });
			}
		} finally {
			setIsSaving(false);
		}
	}, [
		id,
		spaces,
		activeSpaceId,
		captureCanvasImage,
		updateCurrentProject,
		toast,
	]);

	const handleAdvanceToFinal = useCallback(async () => {
		if (!confirm('Mark as Final? This will lock the measurements.')) {
			return;
		}
		setIsSaving(true);

		try {
			const res = await fetch(`/api/projects/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stage: 'final' }),
			});
			if (res.ok) {
				updateCurrentProject({ stage: 'final' });
				toast({ title: 'Project marked as Final' });
			}
		} finally {
			setIsSaving(false);
		}
	}, [id, updateCurrentProject, toast]);

	// ── Add / delete spaces ────────────────────────────────────────────────────

	const handleAddSpace = useCallback(
		async (name: string, type: string) => {
			const res = await fetch(`/api/projects/${id}/spaces`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, type, sortOrder: spaces.length }),
			});
			if (res.ok) {
				const space = await res.json();
				addSpace(space);
			}
		},
		[id, spaces.length, addSpace]
	);

	const handleDeleteSpace = useCallback(
		async (spaceId: number) => {
			if (!confirm('Delete this space and all its data?')) {
				return;
			}
			const res = await fetch(`/api/spaces/${spaceId}`, {
				method: 'DELETE',
			});
			if (res.ok) {
				removeSpace(spaceId);
			}
		},
		[removeSpace]
	);

	// ── Keyboard shortcuts ─────────────────────────────────────────────────────

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			) {
				return;
			}
			if (e.ctrlKey || e.metaKey) {
				if (e.key === 'z') {
					e.preventDefault();
					handleUndo();
				} else if (e.key === 'y') {
					e.preventDefault();
					handleRedo();
				} else if (e.key === 's') {
					e.preventDefault();
					scheduleCanvasSave();
				}
				return;
			}
			if (e.key === 'Escape') {
				setActiveElementDefId(null);
				return;
			}

			switch (e.key.toLowerCase()) {
				case 'v':
					canvasStore.setTool('select');
					setActiveCustomTool(null);
					setActiveElementDefId(null);
					break;
				case 'h':
					canvasStore.setTool('pan');
					setActiveCustomTool(null);
					break;
				case 'w':
					canvasStore.setTool('wall');
					setActiveCustomTool(null);
					break;
				case 'b':
					canvasStore.setTool('base');
					setActiveCustomTool(null);
					break;
				case 'u':
					canvasStore.setTool('wall_cabinet');
					setActiveCustomTool(null);
					break;
				case 't':
					canvasStore.setTool('tall');
					setActiveCustomTool(null);
					break;
				case 'r':
					canvasStore.setTool('door');
					setActiveCustomTool(null);
					break;
				case 'n':
					canvasStore.setTool('window');
					setActiveCustomTool(null);
					break;
				case 'd':
					canvasStore.setTool('delete');
					setActiveCustomTool(null);
					break;
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [handleUndo, handleRedo, canvasStore, scheduleCanvasSave]);

	if (!currentProject) {
		return (
			<div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
				Loading project…
			</div>
		);
	}

	const { drawingState } = canvasStore;
	const referenceImage = activeSpace?.referenceImage ?? null;

	return (
		<div className="flex h-screen flex-col overflow-hidden">
			{/* Top bar */}
			<header className="flex items-center gap-2 border-b bg-white px-3 py-2 shrink-0">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => navigate('/projects')}
				>
					<ArrowLeft className="h-4 w-4 mr-1" />
					Back
				</Button>

				<div className="flex-1 min-w-0">
					<span className="font-semibold text-sm truncate">
						{currentProject.name}
					</span>
					{currentProject.clientName && (
						<span className="text-xs text-muted-foreground ml-2">
							{currentProject.clientName}
						</span>
					)}
				</div>

				{/* Stage badge + advance button */}
				<div className="flex items-center gap-2 shrink-0">
					<span className="text-xs text-muted-foreground">
						{STAGE_LABELS[stage]}
					</span>

					{stage === 'estimated_budget' && !isTechnician && (
						<Button
							size="sm"
							variant="outline"
							onClick={handleAdvanceToMeasurement}
							disabled={isSaving}
						>
							Send to Measurement
						</Button>
					)}
					{stage === 'site_measurement' && !isTechnician && (
						<Button
							size="sm"
							variant="outline"
							onClick={handleAdvanceToFinal}
							disabled={isSaving}
						>
							Mark as Final
						</Button>
					)}

					{/* Reference overlay toggle (technician in measurement stage) */}
					{stage === 'site_measurement' && referenceImage && (
						<Button
							size="sm"
							variant="ghost"
							onClick={canvasStore.toggleReferenceOverlay}
						>
							{canvasStore.showReferenceOverlay ? (
								<>
									<EyeOff className="h-4 w-4 mr-1" /> Hide ref
								</>
							) : (
								<>
									<Eye className="h-4 w-4 mr-1" /> Show ref
								</>
							)}
						</Button>
					)}

					<Button
						size="sm"
						variant="ghost"
						onClick={() => setShowSidePanel((v) => !v)}
					>
						<FileText className="h-4 w-4" />
					</Button>
				</div>
			</header>

			{/* Space tabs */}
			<div className="flex items-center gap-1 border-b bg-white px-3 py-1 shrink-0 overflow-x-auto">
				{spaces.map((space) => {
					const icon =
						SPACE_TYPES.find((t) => t.value === space.type)?.icon ??
						'🏠';
					return (
						<div key={space.id} className="relative group">
							<button
								onClick={() => setActiveSpaceId(space.id)}
								className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
									space.id === activeSpaceId
										? 'bg-primary text-primary-foreground'
										: 'hover:bg-gray-100 text-muted-foreground'
								}`}
							>
								<span>{icon}</span>
								{space.name}
							</button>
							{spaces.length > 1 && (
								<button
									onClick={() => handleDeleteSpace(space.id)}
									className="absolute -top-1 -right-1 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-red-100 text-red-500 hover:bg-red-200 text-xs"
								>
									×
								</button>
							)}
						</div>
					);
				})}
				<button
					onClick={() => setAddSpaceOpen(true)}
					className="flex items-center gap-1 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-gray-100 rounded-md"
				>
					<Plus className="h-3.5 w-3.5" />
					Add
				</button>
			</div>

			{/* Main workspace */}
			<div className="flex flex-1 overflow-hidden">
				{/* Toolbar */}
				<div className="w-[220px] shrink-0">
					<Toolbar
						activeTool={drawingState.tool}
						onToolChange={(tool) => {
							canvasStore.setTool(tool);
						}}
						activeCustomTool={activeCustomTool}
						onCustomToolChange={setActiveCustomTool}
						stage={stage}
						snapEnabled={drawingState.snapEnabled}
						onSnapToggle={() =>
							canvasStore.setDrawingState((prev) => ({
								...prev,
								snapEnabled: !prev.snapEnabled,
							}))
						}
						gridEnabled={drawingState.gridEnabled}
						onGridToggle={() =>
							canvasStore.setDrawingState((prev) => ({
								...prev,
								gridEnabled: !prev.gridEnabled,
							}))
						}
						unit={drawingState.unit}
						onUnitToggle={() =>
							canvasStore.setDrawingState((prev) => ({
								...prev,
								unit: prev.unit === 'cm' ? 'm' : 'cm',
							}))
						}
						canUndo={canvasStore.canUndo()}
						canRedo={canvasStore.canRedo()}
						onUndo={handleUndo}
						onRedo={handleRedo}
						onClear={handleClear}
						onExport={handleExport}
						onSave={() => scheduleCanvasSave()}
						onOpen={() => {}}
						onAdmin={() => navigate('/admin')}
						currentProject={currentProject.name}
						elementDefs={elementDefs}
						activeElementDefId={activeElementDefId}
						onElementSelect={setActiveElementDefId}
					/>
				</div>

				{/* Canvas */}
				<DesignerCanvas
					drawingState={drawingState}
					onDrawingStateChange={canvasStore.setDrawingState}
					onAddWall={handleAddWall}
					onAddCabinet={handleAddCabinet}
					onAddOpening={handleAddOpening}
					onUpdateWall={(id, updates) =>
						canvasStore.updateWall(id, updates)
					}
					onUpdateCabinet={handleUpdateCabinet}
					onMoveComplete={handleMoveComplete}
					onDeleteItem={handleDeleteItem}
					onSelectItem={(id) => canvasStore.selectItem(id)}
					onStageRef={(s) => {
						konvaStageRef.current = s;
					}}
					stage={stage}
					referenceImage={
						canvasStore.showReferenceOverlay &&
						stage === 'site_measurement'
							? referenceImage
							: null
					}
					activeCustomTool={activeCustomTool}
					wallPoints={canvasStore.wallPoints}
					onAddWallPoint={(point) => {
						canvasStore.addWallPoint(point);
						scheduleCanvasSave();
					}}
					onDeleteWallPoint={(wpId) => {
						canvasStore.deleteWallPoint(wpId);
						scheduleCanvasSave();
					}}
					onUpdateWallPoint={(id, updates) => {
						canvasStore.updateWallPoint(id, updates);
						scheduleCanvasSave();
					}}
					canvasElements={canvasStore.elements}
					activeElementDefId={activeElementDefId}
					onAddElement={handleAddElement}
					onUpdateElement={(id, updates) => {
						canvasStore.updateElement(id, updates);
						scheduleCanvasSave();
					}}
					onDeleteElement={(id) => {
						canvasStore.deleteElement(id);
						scheduleCanvasSave();
					}}
				/>

				{/* Pricing panel (hidden for technicians) */}
				{canEditPricing && (
					<div className="w-[260px] shrink-0">
						<PricingPanel
							cabinets={drawingState.cabinets}
							walls={drawingState.walls}
							selectedFinishing={canvasStore.selectedFinishing}
							onFinishingChange={(v) => {
								canvasStore.setSelectedFinishing(v);
								scheduleCanvasSave();
							}}
						/>
					</div>
				)}

				{/* Side panel: notes + photos */}
				{showSidePanel && activeSpace && (
					<SpaceSidePanel
						spaceId={activeSpace.id}
						notes={spaceNotes}
						onNotesChange={(v) => {
							setSpaceNotes(v);
							updateSpace(activeSpace.id, { notes: v });
						}}
						stage={stage}
					/>
				)}
			</div>

			<AddSpaceDialog
				open={addSpaceOpen}
				onOpenChange={setAddSpaceOpen}
				onAdd={handleAddSpace}
			/>
		</div>
	);
}
