import jsPDF from "jspdf";
import type { Wall, Cabinet, Opening, Layer, Island } from "./kitchen-engine";
import { pixelsToCm, computeEffectiveLengths } from "./kitchen-engine";
import { calculateLayerPrice, type PricingLayer } from "./dream-home-pricing";
import type {
	DreamHomeFinish,
	DreamHomePrice,
	TallHeight,
	PricingSettings,
	SavedProject,
	Space,
} from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpaceExportData {
	space: Space;
	walls: Wall[];
	cabinets: Cabinet[];
	openings: Opening[];
	layers: Layer[];
	islands: Island[];
	canvasImage: string | undefined;
}

export interface ExportInput {
	project: SavedProject;
	spaces: SpaceExportData[];
	notesText: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// A4 landscape (mm)
const PAGE_W = 297;
const PAGE_H = 210;

// NIVRA brand palette pulled from the Canva template
const COLOR_BEIGE = [240, 235, 226] as const; // page accent boxes
const COLOR_ORANGE = [217, 130, 90] as const; // NIVRA wordmark / accents
const COLOR_DARK = [40, 40, 40] as const;
const COLOR_MUTED = [120, 120, 120] as const;

// Layer color swatches for the drawing-page legend
const SWATCH_BASE = [...hexToRgb("#3B82F6")] as const;
const SWATCH_WALL = [...hexToRgb("#22C55E")] as const;
const SWATCH_TALL = [...hexToRgb("#A855F7")] as const;
const SWATCH_ISLAND = [...hexToRgb("#F59E0B")] as const;

const SECTION_LABELS: Record<string, string> = {
	base: "Base Cabinet",
	wall_cabinet: "Wall Cabinet",
	tall: "Tall Cabinet",
	island: "Island",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return [r, g, b];
}

async function fetchSettings() {
	const [settingsRes, finishesRes, pricesRes, tallRes, pricingSettingsRes] =
		await Promise.all([
			fetch("/api/admin/settings"),
			fetch("/api/dream-home/finishes"),
			fetch("/api/dream-home/prices"),
			fetch("/api/dream-home/tall-heights"),
			fetch("/api/pricing-settings"),
		]);
	return {
		settings: await settingsRes.json(),
		finishes: (await finishesRes.json()) as DreamHomeFinish[],
		dreamHomePrices: (await pricesRes.json()) as DreamHomePrice[],
		tallHeights: (await tallRes.json()) as TallHeight[],
		pricingSettings: (await pricingSettingsRes.json()) as PricingSettings,
	};
}

function formatDateDDMMMYYYY(d: Date): string {
	const day = String(d.getDate()).padStart(2, "0");
	const month = d
		.toLocaleString("en-GB", { month: "short" })
		.toUpperCase();
	const year = d.getFullYear();
	return `${day} ${month} ${year}`;
}

function formatAED(n: number): string {
	return `${Math.round(n).toLocaleString("en-US")} AED`;
}

// ── Pricing ───────────────────────────────────────────────────────────────────

interface PricingCtx {
	dreamHomePrices: DreamHomePrice[];
	tallHeights: TallHeight[];
	pricingSettings: PricingSettings;
	finishes: DreamHomeFinish[];
}

/**
 * Mirrors the loop in the legacy single-space exporter: prices each layer using
 * the same logic the sidebar shows. Returns per-layer subtotals plus the total.
 */
function priceSpaceLayers(
	layers: Layer[],
	cabinets: Cabinet[],
	walls: Wall[],
	islands: Island[],
	ctx: PricingCtx,
) {
	let total = 0;
	const perLayer = new Map<string, number>();

	for (const layer of layers) {
		const isIsland = layer.type === "island";
		const boundIsland = isIsland
			? islands.find((i) => i.layerId === layer.id) ?? null
			: null;

		const layerCabinets = cabinets.filter(
			(c) => c.layerId === layer.id || layer.cabinetIds.includes(c.id),
		);
		const effLengths = computeEffectiveLengths(
			layerCabinets,
			walls,
			layer.depth ?? undefined,
		);
		const cabinetsLengthM = layerCabinets.reduce((sum, c) => {
			const effPx = effLengths.get(c.id) ?? 0;
			return sum + pixelsToCm(effPx) / 100;
		}, 0);
		const lengthM = boundIsland ? boundIsland.lengthCm / 100 : cabinetsLengthM;

		const pricingLayerInput = boundIsland
			? { ...layer, depth: boundIsland.depthCm, height: boundIsland.heightCm }
			: layer;

		const result = calculateLayerPrice({
			layer: pricingLayerInput as unknown as PricingLayer,
			lengthM,
			settings: ctx.pricingSettings,
			dreamHomePrices: ctx.dreamHomePrices,
			tallHeights: ctx.tallHeights,
		});
		const subtotal = result.error ? 0 : result.subtotalAED;
		perLayer.set(layer.id, subtotal);
		total += subtotal;
	}

	return { total, perLayer };
}

// ── Static images for pages 2 & 3 ─────────────────────────────────────────────

/**
 * Pages 2 & 3 are user-provided full A4 landscape composites exported from
 * Canva. We discover them via Vite's `import.meta.glob` so the export keeps
 * working with placeholders until both files are dropped in.
 *
 * To activate the real images, drop the files into attached_assets/:
 *   - NIVRA_about_page.png   (page 2 — About Us)
 *   - NIVRA_history_page.png (page 3 — History)
 * The build picks them up automatically; no code change required.
 */
const staticPageModules = import.meta.glob<{ default: string }>(
	"../../../attached_assets/NIVRA_about_page.*",
	{ eager: false, query: "?url", import: "default" },
);
const staticHistoryModules = import.meta.glob<{ default: string }>(
	"../../../attached_assets/NIVRA_history_page.*",
	{ eager: false, query: "?url", import: "default" },
);

async function tryLoadAssetUrl(
	modules: Record<string, () => Promise<unknown>>,
): Promise<string | null> {
	const keys = Object.keys(modules);
	if (keys.length === 0) return null;
	try {
		const url = (await modules[keys[0]]()) as unknown as string;
		const res = await fetch(url);
		if (!res.ok) return null;
		const blob = await res.blob();
		return await new Promise((resolve) => {
			const reader = new FileReader();
			reader.onloadend = () => resolve(reader.result as string);
			reader.readAsDataURL(blob);
		});
	} catch {
		return null;
	}
}

// ── Builder ───────────────────────────────────────────────────────────────────

class NivraPdfBuilder {
	private doc: jsPDF;
	private pageNo = 0;

	constructor() {
		this.doc = new jsPDF({
			orientation: "landscape",
			unit: "mm",
			format: "a4",
		});
	}

	/** First page is auto-created by jsPDF; subsequent pages need `addPage`. */
	private newPage() {
		if (this.pageNo > 0) this.doc.addPage();
		this.pageNo += 1;
	}

	private drawFooter() {
		// Bottom-right NIVRA wordmark + page number
		const x = PAGE_W - 20;
		const y = PAGE_H - 10;
		this.doc.setFont("helvetica", "bold");
		this.doc.setFontSize(11);
		this.doc.setTextColor(...COLOR_ORANGE);
		this.doc.text("NIVRA", x, y, { align: "right" });
		this.doc.setFont("helvetica", "normal");
		this.doc.setFontSize(8);
		this.doc.setTextColor(...COLOR_MUTED);
		this.doc.text(String(this.pageNo).padStart(2, "0"), PAGE_W - 8, y, {
			align: "right",
		});
	}

	private drawWordmarkTopLeft() {
		this.doc.setFont("helvetica", "bold");
		this.doc.setFontSize(20);
		this.doc.setTextColor(...COLOR_ORANGE);
		this.doc.text("NIVRA", 18, 22);
		this.doc.setFont("helvetica", "normal");
		this.doc.setFontSize(7);
		this.doc.setTextColor(...COLOR_MUTED);
		this.doc.text("THE ART OF LIVING", 18, 27);
	}

	// ── Cover (page 1) ────────────────────────────────────────────────────────
	addCoverPage(project: SavedProject) {
		this.newPage();
		this.drawWordmarkTopLeft();

		// Big "Kitchen Estimation" title (right side)
		this.doc.setFont("helvetica", "normal");
		this.doc.setFontSize(38);
		this.doc.setTextColor(...COLOR_DARK);
		this.doc.text("Kitchen Estimation", PAGE_W - 18, 80, { align: "right" });

		// Info card (beige background)
		const cardX = 165;
		const cardY = 92;
		const cardW = 114;
		const cardH = 70;
		this.doc.setFillColor(...COLOR_BEIGE);
		this.doc.rect(cardX, cardY, cardW, cardH, "F");

		const clientName = project.clientName || "—";
		const location = project.address || "—";
		const date = formatDateDDMMMYYYY(new Date());
		const mob = project.clientPhone || "—";

		// CLIENT (underlined label) — top of card
		let y = cardY + 12;
		this.doc.setFont("helvetica", "bold");
		this.doc.setFontSize(11);
		this.doc.setTextColor(...COLOR_DARK);
		this.doc.text("CLIENT:", cardX + 6, y);
		const clientLabelW = this.doc.getTextWidth("CLIENT:");
		this.doc.setLineWidth(0.3);
		this.doc.setDrawColor(...COLOR_DARK);
		this.doc.line(cardX + 6, y + 0.8, cardX + 6 + clientLabelW, y + 0.8);
		this.doc.setFont("helvetica", "normal");
		this.doc.text(clientName, cardX + 6 + clientLabelW + 2, y);

		// Separator line under client
		this.doc.setDrawColor(180, 180, 180);
		this.doc.setLineWidth(0.2);
		this.doc.line(cardX + 6, y + 4, cardX + cardW - 6, y + 4);

		// Other fields
		const fields: [string, string][] = [
			["LOCATION:", location],
			["DATE:", date],
			["MOB.:", mob],
		];

		y += 12;
		this.doc.setFontSize(10);
		for (const [label, value] of fields) {
			this.doc.setFont("helvetica", "bold");
			this.doc.setTextColor(...COLOR_DARK);
			this.doc.text(label, cardX + 6, y);
			const labelW = this.doc.getTextWidth(label);
			this.doc.line(cardX + 6, y + 0.8, cardX + 6 + labelW, y + 0.8);
			this.doc.setFont("helvetica", "normal");
			this.doc.text(value, cardX + 6 + labelW + 2, y);
			y += 8;
		}

		// Footer URL
		this.doc.setFont("helvetica", "normal");
		this.doc.setFontSize(8);
		this.doc.setTextColor(...COLOR_MUTED);
		this.doc.text("http://www.nivra.ae", PAGE_W - 18, PAGE_H - 10, {
			align: "right",
		});
	}

	// ── Static image page (pages 2 & 3) ───────────────────────────────────────
	addStaticImagePage(dataUrl: string) {
		this.newPage();
		this.doc.addImage(dataUrl, "PNG", 0, 0, PAGE_W, PAGE_H);
	}

	addPlaceholderPage(title: string, body: string) {
		this.newPage();
		this.drawWordmarkTopLeft();
		this.doc.setFont("helvetica", "bold");
		this.doc.setFontSize(28);
		this.doc.setTextColor(...COLOR_DARK);
		this.doc.text(title, 30, 70);
		this.doc.setFont("helvetica", "normal");
		this.doc.setFontSize(10);
		this.doc.setTextColor(...COLOR_MUTED);
		const wrapped = this.doc.splitTextToSize(body, 230);
		this.doc.text(wrapped, 30, 90);
		this.doc.setFontSize(8);
		this.doc.setTextColor(200, 100, 100);
		this.doc.text(
			"Placeholder — replace with Canva export at attached_assets/",
			30,
			PAGE_H - 18,
		);
		this.drawFooter();
	}

	// ── Drawing page (one per space) ──────────────────────────────────────────
	addSpaceDrawingPage(s: SpaceExportData) {
		this.newPage();

		// "PLAN" heading (bottom-left, lowercase italic-ish like template)
		this.doc.setFont("helvetica", "normal");
		this.doc.setFontSize(20);
		this.doc.setTextColor(...COLOR_MUTED);
		this.doc.text("PLAN", 18, PAGE_H - 14);
		this.doc.setDrawColor(...COLOR_MUTED);
		this.doc.setLineWidth(0.3);
		this.doc.line(18, PAGE_H - 11, 60, PAGE_H - 11);

		// Legend (left column)
		const legendX = 22;
		let ly = 50;
		this.doc.setFontSize(13);
		this.doc.setTextColor(...COLOR_DARK);

		const types = new Set(s.layers.map((l) => l.type));
		const legendRows: { color: readonly [number, number, number]; label: string }[] = [];
		if (types.has("base")) legendRows.push({ color: SWATCH_BASE, label: "Base Cabinet" });
		if (types.has("wall_cabinet"))
			legendRows.push({ color: SWATCH_WALL, label: "WallCabinet" });
		if (types.has("tall")) legendRows.push({ color: SWATCH_TALL, label: "TallCabinet" });
		if (types.has("island")) legendRows.push({ color: SWATCH_ISLAND, label: "Island" });

		for (const row of legendRows) {
			this.doc.setFillColor(row.color[0], row.color[1], row.color[2]);
			this.doc.setDrawColor(row.color[0], row.color[1], row.color[2]);
			this.doc.roundedRect(legendX, ly - 5, 10, 8, 1.5, 1.5, "FD");
			this.doc.setFont("helvetica", "normal");
			this.doc.setFontSize(14);
			this.doc.setTextColor(...COLOR_DARK);
			this.doc.text(row.label, legendX + 14, ly);
			ly += 14;
		}

		// Drawing area (right of legend)
		const drawX = 90;
		const drawY = 25;
		const drawW = 190;
		const drawH = 150;

		if (s.canvasImage) {
			// Fit image inside the box preserving aspect ratio
			// We need actual pixel dims to compute aspect — load via Image element.
			// jsPDF's addImage accepts dataURL and will use given mm box; we want
			// to letter-box it so the canvas isn't distorted.
			this.fitImageInto(s.canvasImage, drawX, drawY, drawW, drawH);
		} else {
			this.doc.setDrawColor(200, 200, 200);
			this.doc.setLineDashPattern([2, 2], 0);
			this.doc.rect(drawX, drawY, drawW, drawH);
			this.doc.setLineDashPattern([], 0);
			this.doc.setFont("helvetica", "normal");
			this.doc.setFontSize(11);
			this.doc.setTextColor(...COLOR_MUTED);
			this.doc.text(
				`No drawing yet for ${s.space.name}`,
				drawX + drawW / 2,
				drawY + drawH / 2,
				{ align: "center" },
			);
		}

		this.drawFooter();
	}

	private fitImageInto(
		dataUrl: string,
		x: number,
		y: number,
		w: number,
		h: number,
	) {
		// Pull pixel dims from the dataURL header so we can preserve aspect ratio.
		// Synchronous-ish via Image() — but addImage itself accepts dimensions, so
		// we just need a quick measurement. jsPDF lets us pass undefined for one
		// axis but to letterbox cleanly we measure first.
		try {
			const img = new (window as any).Image();
			img.src = dataUrl;
			// Decoded synchronously for already-loaded dataURLs in modern browsers;
			// when not, naturalWidth/Height are 0 and we fall back to filling the box.
			const iw = img.naturalWidth || img.width;
			const ih = img.naturalHeight || img.height;
			if (iw > 0 && ih > 0) {
				const boxAspect = w / h;
				const imgAspect = iw / ih;
				let dw: number;
				let dh: number;
				if (imgAspect > boxAspect) {
					dw = w;
					dh = w / imgAspect;
				} else {
					dh = h;
					dw = h * imgAspect;
				}
				const dx = x + (w - dw) / 2;
				const dy = y + (h - dh) / 2;
				this.doc.addImage(dataUrl, "PNG", dx, dy, dw, dh);
				return;
			}
		} catch {
			// fall through
		}
		this.doc.addImage(dataUrl, "PNG", x, y, w, h);
	}

	// ── Items page (one per space) ────────────────────────────────────────────
	addSpaceItemsPage(
		s: SpaceExportData,
		notesText: string,
		ctx: PricingCtx,
	) {
		this.newPage();

		const { total } = priceSpaceLayers(
			s.layers,
			s.cabinets,
			s.walls,
			s.islands,
			ctx,
		);

		// Left column: items grouped by type
		const colX = 30;
		let y = 36;

		// Build groups
		const groups: Record<"base" | "wall_cabinet" | "tall" | "island", Layer[]> = {
			base: [],
			wall_cabinet: [],
			tall: [],
			island: [],
		};
		for (const layer of s.layers) {
			if (layer.type in groups) {
				groups[layer.type as keyof typeof groups].push(layer);
			}
		}

		const sectionOrder: (keyof typeof groups)[] = [
			"base",
			"wall_cabinet",
			"tall",
			"island",
		];

		// Count drawer layers for "Including N drawers" note on base
		const drawerCount = s.layers
			.filter((l) => l.type === "drawer")
			.reduce((sum, l) => sum + (l.qty ?? 0), 0);

		for (const key of sectionOrder) {
			const layersInGroup = groups[key];
			if (layersInGroup.length === 0) continue;

			// Section heading
			this.doc.setFont("helvetica", "normal");
			this.doc.setFontSize(18);
			this.doc.setTextColor(...COLOR_DARK);
			this.doc.text(SECTION_LABELS[key], colX, y);
			y += 7;

			// De-duplicate spec lines across layers in this group
			const seen = new Set<string>();
			this.doc.setFont("helvetica", "italic");
			this.doc.setFontSize(10);
			this.doc.setTextColor(60, 60, 60);

			for (const layer of layersInGroup) {
				const depth = layer.depth ?? 0;
				const height = layer.height ?? 0;
				const finish = ctx.finishes.find((f) => f.id === layer.finishId);
				const finishName = finish?.name || "—";
				const sig = `${depth}|${height}|${finishName}`;
				if (seen.has(sig)) continue;
				seen.add(sig);

				this.doc.text(
					`-Depth ${depth} × Height ${height} cm`,
					colX + 8,
					y,
				);
				y += 5;
				// Skirting note for base / tall / island (matches template)
				if (key === "base" || key === "tall" || key === "island") {
					this.doc.text("+10cm skirting", colX + 8, y);
					y += 5;
				}
				this.doc.text(`-${finishName}`, colX + 8, y);
				y += 5;
				if (key === "base" && drawerCount > 0 && seen.size === 1) {
					this.doc.text(`-Including ${drawerCount} drawers`, colX + 8, y);
					y += 5;
				}
			}
			y += 4;
		}

		// TOTAL (bottom-left)
		const totalY = PAGE_H - 32;
		this.doc.setFont("helvetica", "bold");
		this.doc.setFontSize(16);
		this.doc.setTextColor(...COLOR_DARK);
		this.doc.text(`TOTAL:  ${formatAED(total)}`, colX + 30, totalY);

		// "Kitchen Estimation" tab bottom-left (matches template)
		this.doc.setFont("helvetica", "normal");
		this.doc.setFontSize(14);
		this.doc.setTextColor(...COLOR_MUTED);
		this.doc.text("Kitchen Estimation", 18, PAGE_H - 14);
		this.doc.setDrawColor(...COLOR_MUTED);
		this.doc.setLineWidth(0.3);
		this.doc.line(18, PAGE_H - 11, 70, PAGE_H - 11);

		// Right column: note box + signature
		const noteX = 180;
		let ny = 60;
		this.doc.setFont("helvetica", "normal");
		this.doc.setFontSize(13);
		this.doc.setTextColor(...COLOR_DARK);
		this.doc.text("note:", noteX, ny);
		ny += 6;

		this.doc.setFont("helvetica", "italic");
		this.doc.setFontSize(10);
		this.doc.setTextColor(60, 60, 60);
		const wrapped = this.doc.splitTextToSize(notesText, 90);
		this.doc.text(wrapped, noteX, ny);
		ny += wrapped.length * 5 + 30;

		this.doc.setFont("helvetica", "normal");
		this.doc.setFontSize(13);
		this.doc.setTextColor(...COLOR_DARK);
		this.doc.text(
			"Signature: .............................................",
			noteX,
			ny,
		);

		this.drawFooter();
	}

	finalize(filename: string) {
		this.doc.save(filename);
	}
}

// ── Public entry ──────────────────────────────────────────────────────────────

export async function exportToPDF(input: ExportInput): Promise<void> {
	const { finishes, dreamHomePrices, tallHeights, pricingSettings } =
		await fetchSettings();
	const pricingCtx: PricingCtx = {
		finishes,
		dreamHomePrices,
		tallHeights,
		pricingSettings,
	};

	const builder = new NivraPdfBuilder();

	// Page 1 — Cover
	builder.addCoverPage(input.project);

	// Pages 2 & 3 — static composites (Canva). Falls back to placeholders until
	// the user drops the real images into attached_assets/.
	const aboutUrl = await tryLoadAssetUrl(staticPageModules);
	if (aboutUrl) {
		builder.addStaticImagePage(aboutUrl);
	} else {
		builder.addPlaceholderPage(
			"BUILT ONCE — LASTS FOREVER",
			"Replace this page by exporting the full A4-landscape \"About Us\" page from Canva and saving it as attached_assets/NIVRA_about_page.png. The image will then appear here full-bleed on every export.",
		);
	}

	const historyUrl = await tryLoadAssetUrl(staticHistoryModules);
	if (historyUrl) {
		builder.addStaticImagePage(historyUrl);
	} else {
		builder.addPlaceholderPage(
			"HISTORY OF NIVRA",
			"Replace this page by exporting the full A4-landscape \"History\" page from Canva and saving it as attached_assets/NIVRA_history_page.png. The image will then appear here full-bleed on every export.",
		);
	}

	// Drawing + items pages, interleaved per space
	for (const s of input.spaces) {
		builder.addSpaceDrawingPage(s);
		builder.addSpaceItemsPage(s, input.notesText, pricingCtx);
	}

	const safeName = (input.project.name || input.project.clientName || "Estimation")
		.trim()
		.replace(/\s+/g, "-");
	builder.finalize(`NIVRA-${safeName}.pdf`);
}
