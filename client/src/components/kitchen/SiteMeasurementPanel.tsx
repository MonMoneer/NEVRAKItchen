import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2, Zap, Droplets, ImageOff } from "lucide-react";
import type { WallPointItem } from "@/stores/useCanvasStore";
import type { Wall } from "@/lib/kitchen-engine";
import { ReferenceModal } from "./ReferenceModal";

interface SiteMeasurementPanelProps {
	referenceImage: string | null;
	wallPoints: WallPointItem[];
	walls: Wall[];
	onUpdateWallPoint: (id: number, updates: Partial<Omit<WallPointItem, "id">>) => void;
	onDeleteWallPoint: (id: number) => void;
}

interface WallPointEntryProps {
	point: WallPointItem;
	onSave: (updates: Partial<Omit<WallPointItem, "id">>) => void;
	onDelete: () => void;
}

function WallPointEntry({ point, onSave, onDelete }: WallPointEntryProps) {
	const [expanded, setExpanded] = useState(false);
	const [distance, setDistance] = useState(point.distanceCm.toString());
	const [height, setHeight] = useState(point.heightCm.toString());
	const [note, setNote] = useState(point.note);

	const isElectrical = point.type === "electrical";
	const Icon = isElectrical ? Zap : Droplets;
	const accent = isElectrical ? "text-amber-500" : "text-blue-500";

	const handleSave = () => {
		const d = parseFloat(distance);
		const h = parseFloat(height);
		onSave({
			distanceCm: !isNaN(d) && d >= 0 ? d : point.distanceCm,
			heightCm: !isNaN(h) && h >= 0 ? h : point.heightCm,
			note,
		});
		setExpanded(false);
	};

	return (
		<div className="border border-border rounded-md bg-card overflow-hidden">
			<button
				onClick={() => setExpanded((v) => !v)}
				className="w-full flex items-center gap-2 px-2 py-2 hover:bg-accent/30 transition-colors"
				data-testid={`wall-point-toggle-${point.id}`}
			>
				<Icon className={`w-4 h-4 shrink-0 ${accent}`} />
				<div className="flex-1 text-left text-[11px] text-sidebar-foreground/80">
					<span className="font-mono">{Math.round(point.distanceCm)}cm</span>
					<span className="text-muted-foreground"> · H</span>
					<span className="font-mono">{Math.round(point.heightCm)}</span>
				</div>
				{expanded ? (
					<ChevronUp className="w-3 h-3 text-muted-foreground" />
				) : (
					<ChevronDown className="w-3 h-3 text-muted-foreground" />
				)}
			</button>

			{expanded && (
				<div className="p-2 pt-0 flex flex-col gap-2">
					{point.photo ? (
						<img
							src={point.photo}
							alt={`${point.type} point photo`}
							className="w-full rounded-md border border-border object-cover max-h-40"
						/>
					) : (
						<div className="w-full h-24 rounded-md border border-border bg-muted/30 flex items-center justify-center text-muted-foreground">
							<ImageOff className="w-5 h-5" />
						</div>
					)}

					<div className="flex items-center gap-1.5">
						<label className="text-[10px] text-muted-foreground w-14">Distance</label>
						<input
							type="number"
							value={distance}
							onChange={(e) => setDistance(e.target.value)}
							className="flex-1 h-7 px-2 text-xs font-mono border border-border rounded-md bg-background outline-none focus:border-primary"
							min="0"
							step="any"
							data-testid={`wall-point-distance-${point.id}`}
						/>
						<span className="text-[10px] text-muted-foreground">cm</span>
					</div>

					<div className="flex items-center gap-1.5">
						<label className="text-[10px] text-muted-foreground w-14">Height</label>
						<input
							type="number"
							value={height}
							onChange={(e) => setHeight(e.target.value)}
							className="flex-1 h-7 px-2 text-xs font-mono border border-border rounded-md bg-background outline-none focus:border-primary"
							min="0"
							step="any"
							data-testid={`wall-point-height-${point.id}`}
						/>
						<span className="text-[10px] text-muted-foreground">cm</span>
					</div>

					<div className="flex flex-col gap-1">
						<label className="text-[10px] text-muted-foreground">Note</label>
						<textarea
							value={note}
							onChange={(e) => setNote(e.target.value)}
							className="w-full px-2 py-1 text-xs border border-border rounded-md bg-background outline-none focus:border-primary resize-y min-h-[48px]"
							data-testid={`wall-point-note-${point.id}`}
						/>
					</div>

					<div className="flex items-center justify-between gap-2">
						<button
							onClick={onDelete}
							className="flex items-center gap-1 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 rounded-md transition-colors"
							data-testid={`wall-point-delete-${point.id}`}
						>
							<Trash2 className="w-3 h-3" />
							Delete
						</button>
						<button
							onClick={handleSave}
							className="px-3 py-1 text-[11px] font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
							data-testid={`wall-point-save-${point.id}`}
						>
							Save
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

export function SiteMeasurementPanel({
	referenceImage,
	wallPoints,
	walls,
	onUpdateWallPoint,
	onDeleteWallPoint,
}: SiteMeasurementPanelProps) {
	const [modalOpen, setModalOpen] = useState(false);

	// Filter out orphan wall-points whose wall_id doesn't exist in current canvas
	const wallIds = new Set(walls.map((w) => w.id));
	const visiblePoints = wallPoints.filter(
		(wp) => !wp.wallId || wallIds.has(wp.wallId)
	);

	return (
		<>
			<aside
				className="w-[260px] shrink-0 bg-sidebar border-l border-sidebar-border flex flex-col overflow-y-auto"
				data-testid="site-measurement-panel"
			>
				{/* Reference photo */}
				<div className="p-3 border-b border-sidebar-border">
					<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
						Reference
					</p>
					{referenceImage ? (
						<button
							onClick={() => setModalOpen(true)}
							className="w-full rounded-md border border-border overflow-hidden hover:border-primary transition-colors"
							data-testid="reference-thumbnail"
						>
							<img
								src={referenceImage}
								alt="Estimated design"
								className="w-full h-auto object-contain bg-white"
							/>
						</button>
					) : (
						<div className="w-full h-32 rounded-md border border-dashed border-border bg-muted/20 flex flex-col items-center justify-center text-center p-2">
							<ImageOff className="w-5 h-5 text-muted-foreground mb-1" />
							<p className="text-[10px] text-muted-foreground">
								No reference photo yet
							</p>
						</div>
					)}
				</div>

				{/* Wall points list */}
				<div className="p-3 flex flex-col gap-2">
					<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
						Wall Points ({visiblePoints.length})
					</p>
					{visiblePoints.length === 0 ? (
						<p className="text-[11px] text-muted-foreground">
							No points added yet. Use the Electrical or Plumbing tools on the left to add points on walls.
						</p>
					) : (
						visiblePoints.map((point) => (
							<WallPointEntry
								key={point.id}
								point={point}
								onSave={(updates) => onUpdateWallPoint(point.id, updates)}
								onDelete={() => onDeleteWallPoint(point.id)}
							/>
						))
					)}
				</div>
			</aside>

			<ReferenceModal
				imageSrc={referenceImage}
				open={modalOpen}
				onClose={() => setModalOpen(false)}
			/>
		</>
	);
}
