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

// Page size matches the Canva template aspect ratio (~849×478 px ≈ 16:9).
// We keep the 297mm width of A4 landscape as the long edge so printed pages
// still fit comfortably on an A4 sheet with margins; the height is derived
// from the template aspect to avoid the squashed look caused by forcing the
// images into a 297×210 A4 frame.
const PAGE_W = 297;
const PAGE_H = 167; // 297 × (478 / 849) ≈ 167.2 mm

// NIVRA brand palette pulled from the Canva template
const COLOR_ORANGE = [217, 130, 90] as const; // NIVRA wordmark / accents
const COLOR_DARK = [40, 40, 40] as const;
const COLOR_MUTED = [120, 120, 120] as const;
const COLOR_SPEC = [60, 60, 60] as const; // italic spec lines

// Layer color swatches for the drawing-page legend
const SWATCH_BASE = [...hexToRgb("#3B82F6")] as const;
const SWATCH_WALL = [...hexToRgb("#22C55E")] as const;
const SWATCH_TALL = [...hexToRgb("#A855F7")] as const;
const SWATCH_ISLAND = [...hexToRgb("#F59E0B")] as const;

const SECTION_LABELS: Record<string, string> = {
	base: "Base Cabinet",
	wall_cabinet: "WallCabinet",
	tall: "TallCabinet",
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

// ── Template asset loaders ────────────────────────────────────────────────────
//
// Every page background is exported from Canva as a full-bleed A4-landscape PNG
// (~5760×3240 px). The builder loads them via Vite's import.meta.glob so the
// app keeps building even if a file is missing; missing assets fall back to a
// vector-drawn placeholder.

const coverBgModules = import.meta.glob<{ default: string }>(
	"../../../attached_assets/NIVRA_cover_bg.*",
	{ eager: false, query: "?url", import: "default" },
);
const aboutPageModules = import.meta.glob<{ default: string }>(
	"../../../attached_assets/NIVRA_about_page.*",
	{ eager: false, query: "?url", import: "default" },
);
const historyPageModules = import.meta.glob<{ default: string }>(
	"../../../attached_assets/NIVRA_history_page.*",
	{ eager: false, query: "?url", import: "default" },
);
const planPageBgModules = import.meta.glob<{ default: string }>(
	"../../../attached_assets/NIVRA_plan_page_bg.*",
	{ eager: false, query: "?url", import: "default" },
);
const itemsPageBgModules = import.meta.glob<{ default: string }>(
	"../../../attached_assets/NIVRA_items_page_bg.*",
	{ eager: false, query: "?url", import: "default" },
);
const thankYouModules = import.meta.glob<{ default: string }>(
	"../../../attached_assets/NIVRA_thankyou_page.*",
	{ eager: false, query: "?url", import: "default" },
);

/**
 * Decode a WebP (or any browser-supported image) into a JPEG dataURL via an
 * offscreen canvas. jsPDF 4.x bundles JPEG/PNG handling natively but its WebP
 * support is inconsistent, so we always normalize to JPEG before embedding.
 */
function imageUrlToJpegDataUrl(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => {
			const canvas = document.createElement("canvas");
			canvas.width = img.naturalWidth || img.width;
			canvas.height = img.naturalHeight || img.height;
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				reject(new Error("2D context unavailable"));
				return;
			}
			// Paint a white background under the image so any transparent
			// areas in the WebP don't show as black in the rendered PDF.
			ctx.fillStyle = "#ffffff";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(img, 0, 0);
			resolve(canvas.toDataURL("image/jpeg", 0.92));
		};
		img.onerror = () => reject(new Error("image load failed"));
		img.src = url;
	});
}

async function tryLoadAssetUrl(
	modules: Record<string, () => Promise<unknown>>,
): Promise<string | null> {
	const keys = Object.keys(modules);
	if (keys.length === 0) return null;
	try {
		const url = (await modules[keys[0]]()) as unknown as string;
		return await imageUrlToJpegDataUrl(url);
	} catch {
		return null;
	}
}

interface TemplateAssets {
	cover: string | null;
	about: string | null;
	history: string | null;
	plan: string | null;
	items: string | null;
	thankYou: string | null;
}

async function loadAllTemplates(): Promise<TemplateAssets> {
	const [cover, about, history, plan, items, thankYou] = await Promise.all([
		tryLoadAssetUrl(coverBgModules),
		tryLoadAssetUrl(aboutPageModules),
		tryLoadAssetUrl(historyPageModules),
		tryLoadAssetUrl(planPageBgModules),
		tryLoadAssetUrl(itemsPageBgModules),
		tryLoadAssetUrl(thankYouModules),
	]);
	return { cover, about, history, plan, items, thankYou };
}

// ── Builder ───────────────────────────────────────────────────────────────────

class NivraPdfBuilder {
	private doc: jsPDF;
	private pageNo = 0;

	constructor() {
		this.doc = new jsPDF({
			orientation: "landscape",
			unit: "mm",
			format: [PAGE_W, PAGE_H],
		});
	}

	/** First page is auto-created by jsPDF; subsequent pages need `addPage`. */
	private newPage() {
		if (this.pageNo > 0) this.doc.addPage();
		this.pageNo += 1;
	}

	private drawBackground(dataUrl: string | null) {
		if (!dataUrl) return;
		// All template backgrounds are normalized to JPEG by the loader so
		// jsPDF embeds them in one consistent path regardless of source format.
		this.doc.addImage(dataUrl, "JPEG", 0, 0, PAGE_W, PAGE_H);
	}

	/**
	 * The plan and items templates have a small grey square next to the NIVRA
	 * badge bottom-right. We overlay the current page number there.
	 */
	private overlayPageNumber() {
		const text = String(this.pageNo).padStart(2, "0");
		this.doc.setFont("helvetica", "bold");
		this.doc.setFontSize(9);
		this.doc.setTextColor(255, 255, 255);
		// y = PAGE_H - 7mm puts the number in the badge box bottom-right
		this.doc.text(text, 287, PAGE_H - 7, { align: "right" });
	}

	// ── Cover (page 1) ────────────────────────────────────────────────────────
	addCoverPage(bg: string | null, project: SavedProject) {
		this.newPage();
		this.drawBackground(bg);

		if (!bg) {
			// Fallback: draw a minimal placeholder so the export still works.
			this.doc.setFont("helvetica", "bold");
			this.doc.setFontSize(28);
			this.doc.setTextColor(...COLOR_DARK);
			this.doc.text("Kitchen Estimation", PAGE_W / 2, 60, { align: "center" });
		}

		const clientName = project.clientName || "—";
		const location = project.address || "—";
		const date = formatDateDDMMMYYYY(new Date());
		const mobile = project.clientPhone || "—";

		// Beige card sits roughly x:160→283mm, y:90→160mm in the PNG. Labels
		// ("CLIENT:", "LOCATION:", "DATE:", "MOBILE:") are baked into the image
		// at the left edge of the card; we render only the values inline after
		// the trailing colon of each label.

		this.doc.setFont("helvetica", "normal");
		this.doc.setTextColor(...COLOR_DARK);

		// CLIENT — larger, sits on the underlined line at ~y=94mm of the 167mm page
		this.doc.setFontSize(12);
		this.doc.text(clientName, 185, 94);

		// LOCATION / DATE / MOBILE rows, inline after each baked-in label.
		// Coordinates were eyeballed against the 849×479 cover.webp and converted
		// at the page's 297mm × 167mm scale.
		this.doc.setFontSize(10);
		this.doc.text(location, 192, 106);
		this.doc.text(date, 187, 117);
		this.doc.text(mobile, 193, 129);
	}

	// ── Static full-bleed page (About / History / Thank You) ─────────────────
	addFullBleedPage(bg: string | null, fallbackTitle: string) {
		this.newPage();
		if (bg) {
			this.drawBackground(bg);
			return;
		}
		// Fallback placeholder if the asset is missing
		this.doc.setFont("helvetica", "bold");
		this.doc.setFontSize(28);
		this.doc.setTextColor(...COLOR_DARK);
		this.doc.text(fallbackTitle, PAGE_W / 2, PAGE_H / 2, { align: "center" });
		this.doc.setFont("helvetica", "normal");
		this.doc.setFontSize(9);
		this.doc.setTextColor(200, 100, 100);
		this.doc.text(
			"Missing template — drop the matching PNG into attached_assets/",
			PAGE_W / 2,
			PAGE_H / 2 + 12,
			{ align: "center" },
		);
	}

	// ── Drawing page (one per space) ──────────────────────────────────────────
	addSpaceDrawingPage(bg: string | null, s: SpaceExportData) {
		this.newPage();
		this.drawBackground(bg);

		// Legend (left column) — fits comfortably above the "Kitchen Estimation"
		// footer line that's baked into 412.webp.
		const legendX = 22;
		let ly = 40;

		const types = new Set(s.layers.map((l) => l.type));
		const legendRows: {
			color: readonly [number, number, number];
			label: string;
		}[] = [];
		if (types.has("base"))
			legendRows.push({ color: SWATCH_BASE, label: "Base Cabinet" });
		if (types.has("wall_cabinet"))
			legendRows.push({ color: SWATCH_WALL, label: "WallCabinet" });
		if (types.has("tall"))
			legendRows.push({ color: SWATCH_TALL, label: "TallCabinet" });
		if (types.has("island"))
			legendRows.push({ color: SWATCH_ISLAND, label: "Island" });

		for (const row of legendRows) {
			this.doc.setFillColor(row.color[0], row.color[1], row.color[2]);
			this.doc.setDrawColor(row.color[0], row.color[1], row.color[2]);
			this.doc.roundedRect(legendX, ly - 5, 9, 7, 1.5, 1.5, "FD");
			this.doc.setFont("helvetica", "normal");
			this.doc.setFontSize(12);
			this.doc.setTextColor(...COLOR_DARK);
			this.doc.text(row.label, legendX + 13, ly);
			ly += 11;
		}

		// Drawing area (right of legend) — fits in the open template space
		// above the bottom footer line.
		const drawX = 80;
		const drawY = 18;
		const drawW = 200;
		const drawH = 125;

		if (s.canvasImage) {
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

		this.overlayPageNumber();
	}

	private fitImageInto(
		dataUrl: string,
		x: number,
		y: number,
		w: number,
		h: number,
	) {
		try {
			const img = new (window as any).Image();
			img.src = dataUrl;
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
		bg: string | null,
		s: SpaceExportData,
		notesText: string,
		ctx: PricingCtx,
	) {
		this.newPage();
		this.drawBackground(bg);

		const { total } = priceSpaceLayers(
			s.layers,
			s.cabinets,
			s.walls,
			s.islands,
			ctx,
		);

		// Left column: items grouped by type
		const colX = 28;
		let y = 24;

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

		const drawerCount = s.layers
			.filter((l) => l.type === "drawer")
			.reduce((sum, l) => sum + (l.qty ?? 0), 0);

		for (const key of sectionOrder) {
			const layersInGroup = groups[key];
			if (layersInGroup.length === 0) continue;

			// Section heading
			this.doc.setFont("helvetica", "normal");
			this.doc.setFontSize(15);
			this.doc.setTextColor(...COLOR_DARK);
			this.doc.text(SECTION_LABELS[key], colX, y);
			y += 6;

			// De-duplicate spec lines across layers in this group
			const seen = new Set<string>();
			this.doc.setFont("helvetica", "italic");
			this.doc.setFontSize(10);
			this.doc.setTextColor(...COLOR_SPEC);

			for (const layer of layersInGroup) {
				const depth = layer.depth ?? 0;
				const height = layer.height ?? 0;
				const finish = ctx.finishes.find((f) => f.id === layer.finishId);
				const finishName = finish?.name || "—";
				const sig = `${depth}|${height}|${finishName}`;
				if (seen.has(sig)) continue;
				seen.add(sig);

				this.doc.text(`-Depth ${depth} × Height ${height} cm`, colX + 8, y);
				y += 4;
				if (key === "base" || key === "tall" || key === "island") {
					this.doc.text("+10cm skirting", colX + 8, y);
					y += 4;
				}
				this.doc.text(`-${finishName}`, colX + 8, y);
				y += 4;
				if (key === "base" && drawerCount > 0 && seen.size === 1) {
					this.doc.text(`-Including ${drawerCount} drawers`, colX + 8, y);
					y += 4;
				}
			}
			y += 3;
		}

		// TOTAL — sits above the "Kitchen Estimation" footer line.
		this.doc.setFont("helvetica", "bold");
		this.doc.setFontSize(14);
		this.doc.setTextColor(...COLOR_DARK);
		this.doc.text(`TOTAL:  ${formatAED(total)}`, colX + 25, PAGE_H - 25);

		// Right column: note box + signature, anchored to roughly half the
		// content height so it sits clear of the left-column items.
		const noteX = 175;
		this.doc.setFont("helvetica", "normal");
		this.doc.setFontSize(12);
		this.doc.setTextColor(...COLOR_DARK);
		this.doc.text("note:", noteX, 60);

		this.doc.setFont("helvetica", "italic");
		this.doc.setFontSize(9);
		this.doc.setTextColor(...COLOR_SPEC);
		const wrapped = this.doc.splitTextToSize(notesText, 95);
		this.doc.text(wrapped, noteX, 66);

		this.doc.setFont("helvetica", "normal");
		this.doc.setFontSize(12);
		this.doc.setTextColor(...COLOR_DARK);
		this.doc.text(
			"Signature: .............................................",
			noteX,
			110,
		);

		this.overlayPageNumber();
	}

	finalize(filename: string) {
		this.doc.save(filename);
	}
}

// ── Public entry ──────────────────────────────────────────────────────────────

export async function exportToPDF(input: ExportInput): Promise<void> {
	const [{ finishes, dreamHomePrices, tallHeights, pricingSettings }, assets] =
		await Promise.all([fetchSettings(), loadAllTemplates()]);

	const pricingCtx: PricingCtx = {
		finishes,
		dreamHomePrices,
		tallHeights,
		pricingSettings,
	};

	const builder = new NivraPdfBuilder();

	// Page 1 — Cover
	builder.addCoverPage(assets.cover, input.project);

	// Pages 2 & 3 — full-bleed Canva exports (About Us, History)
	builder.addFullBleedPage(assets.about, "BUILT ONCE — LASTS FOREVER");
	builder.addFullBleedPage(assets.history, "HISTORY OF NIVRA");

	// Per-space pages — drawing + items, interleaved
	for (const s of input.spaces) {
		builder.addSpaceDrawingPage(assets.plan, s);
		builder.addSpaceItemsPage(assets.items, s, input.notesText, pricingCtx);
	}

	// Final page — Thank You
	builder.addFullBleedPage(assets.thankYou, "THANK YOU");

	const safeName = (input.project.name || input.project.clientName || "Estimation")
		.trim()
		.replace(/\s+/g, "-");
	builder.finalize(`NIVRA-${safeName}.pdf`);
}
