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
import { LayerPanel } from '@/components/kitchen/LayerPanel';
// DEPRECATED: SiteMeasurementPanel replaced by SpacesPreviewPanel + WallPointPopup (2026-04-16)
// import { SiteMeasurementPanel } from '@/components/kitchen/SiteMeasurementPanel';
import { SpacesPreviewPanel } from '@/components/kitchen/SpacesPreviewPanel';
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
import { exportToPDF, type SpaceExportData } from '@/lib/export';
import { ExportNotesDialog } from '@/components/ExportNotesDialog';
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
	Undo2,
	Redo2,
} from 'lucide-react';

// ─── Space type config ────────────────────────────────────────────────────────

const SPACE_TYPES = [
	{ value: 'kitchen', label: 'Kitchen', icon: '🍳' },
	{ value: 'bathroom', label: 'Bathroom', icon: '🚿' },
	{ value: 'washroom', label: 'Washroom', icon: '🪥' },
	{ value: 'tv_unit', label: 'TV Unit', icon: '📺' },
];

const STAGE_LABELS: Record<ProjectStage, string> = {
	estimated_price: 'Estimated Price',
	site_measurement: 'Site Measurement',
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
	// Sidebar collapse state — persisted per-session so the layout survives
	// navigating between projects. Keyed simply because this is per-user
	// preference, not per-project design data.
	const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState<boolean>(
		() => {
			if (typeof window === 'undefined') return false;
			return window.localStorage.getItem('nivra:leftCollapsed') === '1';
		},
	);
	const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState<boolean>(
		() => {
			if (typeof window === 'undefined') return false;
			return window.localStorage.getItem('nivra:rightCollapsed') === '1';
		},
	);
	useEffect(() => {
		window.localStorage.setItem(
			'nivra:leftCollapsed',
			leftSidebarCollapsed ? '1' : '0',
		);
	}, [leftSidebarCollapsed]);
	useEffect(() => {
		window.localStorage.setItem(
			'nivra:rightCollapsed',
			rightSidebarCollapsed ? '1' : '0',
		);
	}, [rightSidebarCollapsed]);
	const [spaceNotes, setSpaceNotes] = useState('');
	const [elementDefs, setElementDefs] = useState<ElementDef[]>([]);
	const [activeElementDefId, setActiveElementDefId] = useState<number | null>(
		null
	);
	const [activeCustomTool, setActiveCustomTool] = useState<CustomTool>(null);
	const [switchConfirmDialog, setSwitchConfirmDialog] = useState<{
		open: boolean;
		targetStage: 'estimated_price' | 'site_measurement';
	}>({ open: false, targetStage: 'estimated_price' });
	const [exportDialogOpen, setExportDialogOpen] = useState(false);
	const [isExporting, setIsExporting] = useState(false);
	const konvaStageRef = useRef<Konva.Stage | null>(null);
	const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

	const activeSpace = spaces.find((s) => s.id === activeSpaceId);
	const stage = (currentProject?.stage ?? 'estimated_price') as ProjectStage;
	const isTechnician = user?.role === 'technician';
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
	// Which space field backs the current canvas, based on stage
	const canvasSourceField: 'canvasData' | 'siteMeasurementData' =
		stage === 'site_measurement' ? 'siteMeasurementData' : 'canvasData';

	// Track previous space/field so we can flush saves to the RIGHT space on switch
	const prevSpaceRef = useRef<{ id: number | null; field: 'canvasData' | 'siteMeasurementData' }>({
		id: activeSpaceId,
		field: canvasSourceField,
	});

	// Save canvas data to server AND update local space store so switching
	// spaces always loads the freshest data (not the stale initial-load copy).
	const saveCanvasNow = useCallback(
		(spaceId: number, field: 'canvasData' | 'siteMeasurementData') => {
			const data = canvasStore.getCanvasData();
			updateSpace(spaceId, { [field]: data, finishing: data.selectedFinishing } as any);
			fetch(`/api/spaces/${spaceId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ [field]: data, finishing: data.selectedFinishing }),
			});
		},
		[canvasStore, updateSpace]
	);

	useEffect(() => {
		// Flush pending save for the PREVIOUS space before loading new one.
		if (saveTimeout.current) {
			clearTimeout(saveTimeout.current);
			saveTimeout.current = null;
			const prev = prevSpaceRef.current;
			if (prev.id) {
				saveCanvasNow(prev.id, prev.field);
			}
		}

		// Update ref to current values
		prevSpaceRef.current = { id: activeSpaceId, field: canvasSourceField };

		if (!activeSpace) {
			return;
		}
		setSpaceNotes(activeSpace.notes ?? '');

		// Load the correct field — NO fallback to canvasData in measurement mode
		// (measurement starts with a blank canvas)
		const data = activeSpace[canvasSourceField] as any;
		if (data) {
			if (data.wallPoints && data.walls) {
				const wallIds = new Set((data.walls as any[]).map((w: any) => w.id));
				data.wallPoints = (data.wallPoints as any[]).filter(
					(wp: any) => !wp.wallId || wallIds.has(wp.wallId)
				);
			}
			canvasStore.loadFromCanvasData(data);
		} else {
			canvasStore.clear();
			canvasStore.setSelectedFinishing(activeSpace.finishing ?? '1');
		}
	}, [activeSpaceId, canvasSourceField]); // eslint-disable-line react-hooks/exhaustive-deps

	// Flush pending save on unmount (user clicks Back / navigates away)
	useEffect(() => {
		return () => {
			if (saveTimeout.current) {
				clearTimeout(saveTimeout.current);
				saveTimeout.current = null;
				const prev = prevSpaceRef.current;
				if (prev.id) saveCanvasNow(prev.id, prev.field);
			}
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	const scheduleCanvasSave = useCallback(() => {
		if (!activeSpaceId) {
			return;
		}
		if (saveTimeout.current) {
			clearTimeout(saveTimeout.current);
		}
		saveTimeout.current = setTimeout(() => {
			saveCanvasNow(activeSpaceId, canvasSourceField);
		}, 1500);
	}, [activeSpaceId, canvasSourceField, saveCanvasNow]);

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

			// Block same-type overlap (base on base, wall_cabinet on wall_cabinet)
			if (cabinet.type === 'base' || cabinet.type === 'wall_cabinet') {
				const sameTypeOverlap = findOverlappingCabinets(
					cabinet.start,
					cabinet.end,
					drawingState.cabinets,
					[cabinet.type]
				);
				if (sameTypeOverlap.length > 0) {
					toast({
						title: `Cannot overlap existing ${cabinet.type === 'base' ? 'base' : 'wall'} cabinet`,
						variant: 'destructive',
					});
					return;
				}
			}

			let newCabinets = [...drawingState.cabinets];
			if (cabinet.type === 'tall') {
				const overlapping = findOverlappingCabinets(
					cabinet.start,
					cabinet.end,
					newCabinets,
					['base', 'wall_cabinet'],
					cabinet,
				);
				for (const existing of overlapping) {
					const result = splitCabinetAroundTall(
						existing,
						cabinet.start,
						cabinet.end,
						cabinet,
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
				// Read fresh store state (avoid stale closure on activeLayerId)
				const freshState = useCanvasStore.getState();
				const activeLayerId = freshState.activeLayerId;
				console.log("[tall-draw] activeLayerId=", activeLayerId, "layers=", freshState.layers.map((l) => ({ id: l.id, type: l.type })));
				const cabinetWithLayer = activeLayerId
					? { ...cabinet, layerId: activeLayerId }
					: cabinet;
				newCabinets.push(cabinetWithLayer);
				console.log("[tall-draw] pushed cabinet with layerId=", cabinetWithLayer.layerId, "cabinet id=", cabinetWithLayer.id);
				canvasStore.setDrawingState((prev) => ({
					...prev,
					cabinets: newCabinets,
					startPoint: null,
					previewPoint: null,
					isDrawing: false,
				}));
				if (activeLayerId) {
					const activeLayer = freshState.layers.find(
						(l) => l.id === activeLayerId
					);
					if (activeLayer) {
						console.log("[tall-draw] updating layer cabinetIds from", activeLayer.cabinetIds, "adding", cabinetWithLayer.id);
						canvasStore.updateLayer(activeLayerId, {
							cabinetIds: [
								...activeLayer.cabinetIds,
								cabinetWithLayer.id,
							],
						});
					} else {
						console.log("[tall-draw] WARNING: activeLayerId set but layer not found in freshState.layers");
					}
				} else {
					console.log("[tall-draw] WARNING: no activeLayerId — cabinet drawn without layer assignment");
				}
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

	const handleExport = useCallback(() => {
		setExportDialogOpen(true);
	}, []);

	const handleExportConfirm = useCallback(
		async (notesText: string) => {
			setExportDialogOpen(false);
			if (!currentProject) {
				toast({ title: 'Export failed', variant: 'destructive' });
				return;
			}
			setIsExporting(true);

			const waitTwoFrames = () =>
				new Promise<void>((resolve) =>
					requestAnimationFrame(() =>
						requestAnimationFrame(() => resolve())
					)
				);
			const sleep = (ms: number) =>
				new Promise((resolve) => setTimeout(resolve, ms));

			const originalActiveId = activeSpaceId;
			const collected: SpaceExportData[] = [];

			try {
				// Flush any pending save for the current space before snapshotting.
				if (saveTimeout.current) {
					clearTimeout(saveTimeout.current);
					saveTimeout.current = null;
					if (activeSpaceId) {
						saveCanvasNow(activeSpaceId, canvasSourceField);
					}
				}

				for (const sp of spaces) {
					// Switching activeSpaceId triggers the load effect, which calls
					// canvasStore.loadFromCanvasData() and schedules a Konva redraw.
					setActiveSpaceId(sp.id);
					await waitTwoFrames();
					await sleep(60);

					const { drawingState, layers, islands } = canvasStore;
					const canvasImage = captureCanvasImage();
					collected.push({
						space: sp as any,
						walls: drawingState.walls,
						cabinets: drawingState.cabinets,
						openings: drawingState.openings,
						layers,
						islands,
						canvasImage,
					});
				}

				await exportToPDF({
					project: currentProject as any,
					spaces: collected,
					notesText,
				});
				toast({ title: 'PDF exported successfully' });
			} catch (err) {
				console.error('[export] failed:', err);
				toast({ title: 'Export failed', variant: 'destructive' });
			} finally {
				// Restore original active space
				if (originalActiveId && originalActiveId !== activeSpaceId) {
					setActiveSpaceId(originalActiveId);
				}
				setIsExporting(false);
			}
		},
		[
			activeSpaceId,
			canvasSourceField,
			canvasStore,
			captureCanvasImage,
			currentProject,
			saveCanvasNow,
			setActiveSpaceId,
			spaces,
			toast,
		]
	);

	// ── Stage transitions ───────────────────────────────────────────────────────

	const handleStageSwitch = useCallback(
		async (targetStage: 'estimated_price' | 'site_measurement') => {
			if (targetStage === stage || !activeSpaceId) return;

			// 1. Flush any pending auto-save
			if (saveTimeout.current) {
				clearTimeout(saveTimeout.current);
				saveTimeout.current = null;
			}

			// 2. Save current canvas data to the current stage's field
			const currentField =
				stage === 'site_measurement' ? 'siteMeasurementData' : 'canvasData';
			saveCanvasNow(activeSpaceId, currentField);

			// 3. If switching TO measurement, always capture a fresh reference image
			//    (captures the estimation canvas with cabinets visible BEFORE stage changes)
			if (targetStage === 'site_measurement') {
				try {
					const image = captureCanvasImage();
					if (image) {
						await fetch(`/api/spaces/${activeSpaceId}/reference`, {
							method: 'PUT',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ referenceImage: image }),
						});
						updateSpace(activeSpaceId, { referenceImage: image });
					}
				} catch (err) {
					console.error('[stage-switch] failed to capture reference image:', err);
				}
			}

			// 4. Clear the canvas immediately so the old stage's drawing disappears
			canvasStore.clear();

			// 5. Update project stage on server
			try {
				const res = await fetch(`/api/projects/${currentProject!.id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ stage: targetStage }),
				});
				if (res.ok) {
					updateCurrentProject({ stage: targetStage });
					// The useEffect on [activeSpaceId, canvasSourceField] will reactively
					// load the correct data (siteMeasurementData or canvasData) for the new stage.
					// If null, the canvas stays clear (blank board for measurement).
					toast({
						title: `Switched to ${targetStage === 'site_measurement' ? 'Site Measurement' : 'Estimation'}`,
					});
				}
			} catch (err: any) {
				toast({
					title: 'Failed to switch stage',
					description: err.message,
					variant: 'destructive',
				});
			}

			setSwitchConfirmDialog({ open: false, targetStage: 'estimated_price' });
		},
		[
			stage,
			activeSpaceId,
			saveCanvasNow,
			captureCanvasImage,
			spaces,
			updateSpace,
			currentProject,
			updateCurrentProject,
			toast,
		]
	);

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
				case 'm':
					canvasStore.setTool('select');
					setActiveCustomTool('measure_tape');
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

				{/* Stage toggle + controls */}
				<div className="flex items-center gap-2 shrink-0">
					{/* Stage toggle */}
					<div className="flex items-center bg-muted rounded-lg p-0.5">
						<button
							onClick={() => {
								if (stage !== 'estimated_price') {
									setSwitchConfirmDialog({ open: true, targetStage: 'estimated_price' });
								}
							}}
							className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
								stage === 'estimated_price'
									? 'bg-background shadow-sm text-foreground'
									: 'text-muted-foreground hover:text-foreground'
							}`}
						>
							Estimation
						</button>
						<button
							onClick={() => {
								if (stage !== 'site_measurement') {
									setSwitchConfirmDialog({ open: true, targetStage: 'site_measurement' });
								}
							}}
							className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
								stage === 'site_measurement'
									? 'bg-background shadow-sm text-foreground'
									: 'text-muted-foreground hover:text-foreground'
							}`}
						>
							Measurement
						</button>
					</div>

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

					{/* Touch-only undo/redo — keyboard users have Ctrl+Z/Y already.
					    Hidden on fine-pointer devices with `touch:` prefix +
					    `hidden` default. */}
					<Button
						size="sm"
						variant="ghost"
						onClick={handleUndo}
						disabled={!canvasStore.canUndo()}
						className="hidden touch:inline-flex touch:h-11 touch:w-11"
						title="Undo"
					>
						<Undo2 className="h-4 w-4 touch:h-5 touch:w-5" />
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={handleRedo}
						disabled={!canvasStore.canRedo()}
						className="hidden touch:inline-flex touch:h-11 touch:w-11"
						title="Redo"
					>
						<Redo2 className="h-4 w-4 touch:h-5 touch:w-5" />
					</Button>

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
									// Always visible (previously hover-only, invisible on touch
									// devices). Ghosted by default; opaque on focus/hover/tablets.
									className="absolute -top-1 -right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-500 hover:bg-red-200 text-xs opacity-40 hover:opacity-100 focus-visible:opacity-100 transition-opacity touch:opacity-100 touch:h-7 touch:w-7"
									title="Remove space"
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
				{/* Toolbar (left sidebar) — collapsible to a 48px rail on tablets
				    so the canvas can use more horizontal space. */}
				<div
					className={`shrink-0 relative transition-[width] duration-200 ${
						leftSidebarCollapsed ? 'w-[48px]' : 'w-[220px]'
					}`}
				>
					{/* Collapse toggle — always visible on touch, subtle on desktop. */}
					<button
						type="button"
						onClick={() => setLeftSidebarCollapsed((v) => !v)}
						className="absolute top-1/2 -translate-y-1/2 right-[-12px] z-20 w-6 h-11 rounded-r-md bg-card border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground"
						title={leftSidebarCollapsed ? 'Expand tools' : 'Collapse tools'}
						aria-label={leftSidebarCollapsed ? 'Expand tools sidebar' : 'Collapse tools sidebar'}
					>
						<ChevronDown
							className={`h-3.5 w-3.5 transition-transform ${
								leftSidebarCollapsed ? '-rotate-90' : 'rotate-90'
							}`}
						/>
					</button>
					<div
						className={
							leftSidebarCollapsed ? 'pointer-events-none opacity-0' : 'h-full'
						}
					>
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
						stage === 'site_measurement'
							? referenceImage
							: null
					}
					activeCustomTool={activeCustomTool}
						guidelines={canvasStore.guidelines}
						onAddGuideline={(g) => {
							canvasStore.addGuideline(g);
							scheduleCanvasSave();
						}}
						onClearGuidelines={() => {
							canvasStore.clearGuidelines();
							scheduleCanvasSave();
						}}
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

				{/* Layer panel (hidden for technicians) — collapsible to a rail */}
				{canEditPricing && (
					<div
						className={`shrink-0 relative transition-[width] duration-200 ${
							rightSidebarCollapsed ? 'w-[48px]' : 'w-[280px]'
						}`}
					>
						<button
							type="button"
							onClick={() => setRightSidebarCollapsed((v) => !v)}
							className="absolute top-1/2 -translate-y-1/2 left-[-12px] z-20 w-6 h-11 rounded-l-md bg-card border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground"
							title={rightSidebarCollapsed ? 'Expand layers' : 'Collapse layers'}
							aria-label={rightSidebarCollapsed ? 'Expand layers sidebar' : 'Collapse layers sidebar'}
						>
							<ChevronDown
								className={`h-3.5 w-3.5 transition-transform ${
									rightSidebarCollapsed ? 'rotate-90' : '-rotate-90'
								}`}
							/>
						</button>
						<div
							className={
								rightSidebarCollapsed
									? 'pointer-events-none opacity-0'
									: 'h-full'
							}
						>
							<LayerPanel
								cabinets={drawingState.cabinets}
								walls={drawingState.walls}
							/>
						</div>
					</div>
				)}

				{/* Spaces preview panel (right sidebar during site_measurement) */}
				{stage === 'site_measurement' && (
					<SpacesPreviewPanel
						spaces={spaces}
						activeSpaceId={activeSpaceId}
						onSelectSpace={(id) => setActiveSpaceId(id)}
					/>
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

			{/* Stage switch confirmation dialog */}
			<Dialog
				open={switchConfirmDialog.open}
				onOpenChange={(open) => {
					if (!open) setSwitchConfirmDialog((prev) => ({ ...prev, open: false }));
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							Switch to{' '}
							{switchConfirmDialog.targetStage === 'site_measurement'
								? 'Site Measurement'
								: 'Estimation'}
							?
						</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-muted-foreground">
						Your current work will be saved automatically. You can switch back
						anytime.
					</p>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() =>
								setSwitchConfirmDialog((prev) => ({ ...prev, open: false }))
							}
						>
							Cancel
						</Button>
						<Button
							onClick={() => handleStageSwitch(switchConfirmDialog.targetStage)}
						>
							Switch
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Export notes dialog */}
			<ExportNotesDialog
				open={exportDialogOpen}
				onCancel={() => setExportDialogOpen(false)}
				onConfirm={handleExportConfirm}
			/>

			{/* Export-in-progress overlay (blocks UI during multi-space capture) */}
			{isExporting && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
					<div className="rounded-lg border bg-card p-6 shadow-lg">
						<p className="text-sm font-medium">Preparing PDF…</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Capturing each space — please don't close this tab.
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
