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

// ── Public types (unchanged — callers depend on these) ──────────────────────────

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

// ── Template / page geometry ────────────────────────────────────────────────────
//
// The quotation layout is a single Illustrator artboard exported to SVG. Each
// dynamic field carries an `id="qt-*"`; we inject live data into those nodes,
// rasterize the SVG at high resolution, and place one image per PDF page.

const TEMPLATE_URL = "/template/Space.svg"; // one A4-portrait page per space
const INTRO_TEMPLATE_URL = "/template/Cover.svg"; // page-1 cover (customer details)

// Both the cover and the per-space artboards are A4 portrait (595.28 × 841.89).
const VIEW_W = 595.28;
const VIEW_H = 841.89;
const PAGE_W = 210;
const PAGE_H = Number(((PAGE_W * VIEW_H) / VIEW_W).toFixed(2)); // ≈ 297.4 mm (A4 portrait)

// Cover shares the same artboard dimensions.
const COVER_VIEW_W = VIEW_W;
const COVER_VIEW_H = VIEW_H;
const COVER_PAGE_W = PAGE_W;
const COVER_PAGE_H = PAGE_H;

// Supersample factor for the rasterized page image (crisp text & lines).
const RENDER_SCALE = 2.5;

// ── Brand fonts ─────────────────────────────────────────────────────────────────
//
// "The Seasons" is an Adobe Fonts (protected) typeface that cannot be bundled,
// so we substitute the free Cormorant Garamond. Skia and Adobe Arabic are the
// genuine files copied from the Illustrator package. We expose every family name
// the SVG references, so the artboard's own font-family declarations resolve to
// our embedded files without editing a single class.

interface FontSpec {
	families: string[];
	url: string;
	format: "woff2" | "truetype" | "opentype";
	mime: string;
	weight: string;
}

// The whole quotation uses a single typeface — EB Garamond. Every font-family
// the artboards reference (The Seasons, Skia, Adobe Arabic) is remapped to it,
// so no template edits are needed; the SVG class declarations resolve here.
const QUOTATION_FAMILIES = [
	// Every font name that appears in Cover.svg / Space.svg — all remapped to
	// EB Garamond so the quotation renders in a single consistent typeface.
	"The Seasons",
	"TheSeasons-Regular",
	"Skia",
	"Skia-Regular",
	"Adobe Arabic",
	"AdobeArabic-Regular",
	"EB Garamond",
	"EBGaramond-Regular",
	"EBGaramond-BoldItalic",
	"Montserrat",
	"Montserrat-Regular",
];

const FONT_SPECS: FontSpec[] = [
	{
		families: QUOTATION_FAMILIES,
		url: "/fonts/EBGaramond-400.woff2",
		format: "woff2",
		mime: "font/woff2",
		weight: "400",
	},
	{
		families: QUOTATION_FAMILIES,
		url: "/fonts/EBGaramond-600.woff2",
		format: "woff2",
		mime: "font/woff2",
		weight: "600",
	},
];

/** Fetch a binary asset and return it as a base64 `data:` URL. */
async function fetchAsDataUrl(url: string, mime: string): Promise<string> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`asset ${url} → ${res.status}`);
	const buf = new Uint8Array(await res.arrayBuffer());
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < buf.length; i += chunk) {
		binary += String.fromCharCode(...buf.subarray(i, i + chunk));
	}
	return `data:${mime};base64,${btoa(binary)}`;
}

interface LoadedFont extends FontSpec {
	dataUrl: string;
}

/**
 * Load every brand font once. The base64 data URLs are reused for both the SVG
 * `@font-face` block (so rasterization sees the glyphs) and the document
 * FontFace registry (so the browser has them decoded before we draw).
 */
async function loadFonts(): Promise<LoadedFont[]> {
	const loaded = await Promise.all(
		FONT_SPECS.map(async (f) => ({
			...f,
			dataUrl: await fetchAsDataUrl(f.url, f.mime),
		})),
	);

	// Register with the document so the rasterizer finds decoded glyphs.
	try {
		await Promise.all(
			loaded.flatMap((f) =>
				f.families.map(async (family) => {
					const face = new FontFace(family, `url(${f.dataUrl})`, {
						weight: f.weight,
					});
					await face.load();
					(document.fonts as FontFaceSet).add(face);
				}),
			),
		);
		await document.fonts.ready;
	} catch {
		// Non-fatal: the embedded @font-face block below still drives rendering.
	}

	return loaded;
}

/** Build the `@font-face` CSS injected into the SVG so it is fully self-contained. */
function buildFontFaceCss(fonts: LoadedFont[]): string {
	return fonts
		.flatMap((f) =>
			f.families.map(
				(family) =>
					`@font-face{font-family:'${family}';font-weight:${f.weight};font-style:normal;` +
					`src:url(${f.dataUrl}) format('${f.format}');}`,
			),
		)
		.join("\n");
}

// ── Pricing settings ────────────────────────────────────────────────────────────

async function fetchSettings() {
	const [finishesRes, pricesRes, tallRes, pricingSettingsRes] =
		await Promise.all([
			fetch("/api/dream-home/finishes"),
			fetch("/api/dream-home/prices"),
			fetch("/api/dream-home/tall-heights"),
			fetch("/api/pricing-settings"),
		]);
	return {
		finishes: (await finishesRes.json()) as DreamHomeFinish[],
		dreamHomePrices: (await pricesRes.json()) as DreamHomePrice[],
		tallHeights: (await tallRes.json()) as TallHeight[],
		pricingSettings: (await pricingSettingsRes.json()) as PricingSettings,
	};
}

function formatDateDDMMMYYYY(d: Date): string {
	const day = String(d.getDate()).padStart(2, "0");
	const month = d.toLocaleString("en-GB", { month: "short" }).toUpperCase();
	return `${day} ${month} ${d.getFullYear()}`;
}

function formatThousands(n: number): string {
	return Math.round(n).toLocaleString("en-US");
}

// ── Pricing ─────────────────────────────────────────────────────────────────────

interface PricingCtx {
	dreamHomePrices: DreamHomePrice[];
	tallHeights: TallHeight[];
	pricingSettings: PricingSettings;
	finishes: DreamHomeFinish[];
}

function priceSpaceLayers(
	layers: Layer[],
	cabinets: Cabinet[],
	walls: Wall[],
	islands: Island[],
	ctx: PricingCtx,
) {
	let total = 0;
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
		total += result.error ? 0 : result.subtotalAED;
	}
	return total;
}

// ── Per-type spec extraction ────────────────────────────────────────────────────

type TypeKey = "base" | "wall_cabinet" | "tall" | "island";

interface BlockSpec {
	height: string;
	depth: string;
	skirting: string;
	finish: string;
	drawers: string;
}

const SKIRTING_TYPES: ReadonlySet<TypeKey> = new Set(["base", "tall", "island"]);

/**
 * The template has one fixed slot per cabinet type. We surface the representative
 * (first) layer of each type; the page TOTAL still reflects every layer.
 */
function buildSpecs(s: SpaceExportData, finishes: DreamHomeFinish[]) {
	const finishName = (id: number | null | undefined) =>
		finishes.find((f) => f.id === id)?.name || "—";

	const drawerCount = s.layers
		.filter((l) => l.type === "drawer")
		.reduce((sum, l) => sum + (l.qty ?? 0), 0);

	const specs: Partial<Record<TypeKey, BlockSpec>> = {};

	for (const key of ["base", "wall_cabinet", "tall", "island"] as TypeKey[]) {
		const layer = s.layers.find((l) => l.type === key);
		if (!layer) continue;

		const island =
			key === "island"
				? s.islands.find((i) => i.layerId === layer.id) ?? null
				: null;

		const height = island ? island.heightCm : layer.height ?? 0;
		const depth = island ? island.depthCm : layer.depth ?? 0;

		specs[key] = {
			height: height ? `${height} cm` : "—",
			depth: depth ? `${depth} cm` : "—",
			skirting: SKIRTING_TYPES.has(key) ? "+10 cm" : "",
			finish: finishName(layer.finishId),
			drawers: key === "base" && drawerCount > 0 ? `${drawerCount} drawers` : "",
		};
	}
	return specs;
}

// ── SVG fill + rasterize ────────────────────────────────────────────────────────

const SVGNS = "http://www.w3.org/2000/svg";
const XLINKNS = "http://www.w3.org/1999/xlink";

const TYPE_LABEL: Record<string, string> = {
	kitchen: "Kitchen",
	bathroom: "Bathroom",
	washroom: "Washroom",
	tv_unit: "TV Unit",
};

function setText(doc: Document, id: string, value: string) {
	const el = doc.querySelector(`#${id}`);
	if (el) el.textContent = value;
}

function hide(doc: Document, id: string) {
	const el = doc.querySelector(`#${id}`) as SVGElement | null;
	if (el) el.style.display = "none";
}

/** Inject one room's data into the template SVG and return the markup string. */
function fillRoomSvg(
	templateText: string,
	s: SpaceExportData,
	total: number,
	specs: Partial<Record<TypeKey, BlockSpec>>,
	fontCss: string,
): string {
	const doc = new DOMParser().parseFromString(templateText, "image/svg+xml");

	// 1. Make the SVG self-contained: embed the brand fonts.
	const style = doc.querySelector("style");
	if (style) style.textContent = `${fontCss}\n${style.textContent ?? ""}`;

	// 2. Customer block lives on the intro page only — hide it here.
	["qt-cust-labels", "qt-customer", "qt-location", "qt-date", "qt-mobile"].forEach(
		(id) => hide(doc, id),
	);

	// 3. Title + room name.
	const typeLabel = TYPE_LABEL[s.space.type as string] ?? "Space";
	setText(doc, "qt-title", `${typeLabel}  Estimation`);
	const roomName = s.space.name || typeLabel;
	setText(doc, "qt-room", roomName);
	setText(doc, "qt-room2", roomName);

	// 4. Cabinet blocks.
	const blocks: { key: TypeKey; prefix: string }[] = [
		{ key: "base", prefix: "qt-base" },
		{ key: "wall_cabinet", prefix: "qt-wall" },
		{ key: "tall", prefix: "qt-tall" },
		{ key: "island", prefix: "qt-island" },
	];
	for (const { key, prefix } of blocks) {
		const spec = specs[key];
		if (!spec) {
			// Room doesn't have this cabinet type — hide the whole block
			// (header + static labels + value fields) so it reads as absent,
			// not as missing data.
			[
				`${prefix}-title`,
				`${prefix}-lbl-height`,
				`${prefix}-lbl-depth`,
				`${prefix}-lbl-skirting`,
				`${prefix}-lbl-including`,
				`${prefix}-height`,
				`${prefix}-depth`,
				`${prefix}-skirting`,
				`${prefix}-finish`,
				`${prefix}-drawers`,
			].forEach((id) => hide(doc, id));
			continue;
		}
		setText(doc, `${prefix}-height`, spec.height);
		setText(doc, `${prefix}-depth`, spec.depth);
		setText(doc, `${prefix}-skirting`, spec.skirting);
		setText(doc, `${prefix}-finish`, spec.finish);
		setText(doc, `${prefix}-drawers`, spec.drawers);
	}

	// 5. Total (number only; "AED" is baked into the artboard).
	setText(doc, "qt-total", formatThousands(total));

	// 6. Plan drawing → the framed image slot.
	const plan = doc.querySelector("#qt-plan");
	if (plan && s.canvasImage) {
		plan.setAttribute("preserveAspectRatio", "xMidYMid meet");
		plan.setAttribute("href", s.canvasImage);
		plan.setAttributeNS(XLINKNS, "xlink:href", s.canvasImage);
	}

	return new XMLSerializer().serializeToString(doc);
}

/** Rasterize an SVG string to a high-resolution JPEG data URL. */
function svgToJpeg(
	svgText: string,
	viewW: number,
	viewH: number,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const blob = new Blob([svgText], {
			type: "image/svg+xml;charset=utf-8",
		});
		const url = URL.createObjectURL(blob);
		const img = new Image();
		img.onload = () => {
			try {
				const canvas = document.createElement("canvas");
				canvas.width = Math.round(viewW * RENDER_SCALE);
				canvas.height = Math.round(viewH * RENDER_SCALE);
				const ctx = canvas.getContext("2d");
				if (!ctx) {
					reject(new Error("2D context unavailable"));
					return;
				}
				ctx.fillStyle = "#ffffff";
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
				resolve(canvas.toDataURL("image/jpeg", 0.95));
			} finally {
				URL.revokeObjectURL(url);
			}
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error("SVG rasterization failed"));
		};
		img.src = url;
	});
}

// ── Intro page ──────────────────────────────────────────────────────────────────
//
// Page 1 is a separate Illustrator design Ahmed will provide. If
// `intro-template.svg` is present (with the same qt-* ids) we render it; until
// then we draw a clean branded cover from the project data.

async function tryFetchText(url: string): Promise<string | null> {
	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		const text = await res.text();
		// A 404 SPA fallback returns HTML — reject anything that isn't an SVG.
		return text.includes("<svg") ? text : null;
	} catch {
		return null;
	}
}

function fillIntroSvg(
	templateText: string,
	project: SavedProject,
	fontCss: string,
): string {
	const doc = new DOMParser().parseFromString(templateText, "image/svg+xml");
	const style = doc.querySelector("style");
	if (style) style.textContent = `${fontCss}\n${style.textContent ?? ""}`;

	setText(doc, "qt-customer", project.clientName || "—");
	setText(doc, "qt-location", project.address || "—");
	setText(doc, "qt-date", formatDateDDMMMYYYY(new Date()));
	setText(doc, "qt-mobile", project.clientPhone || "—");

	return new XMLSerializer().serializeToString(doc);
}

function drawIntroFallback(doc: jsPDF, project: SavedProject) {
	const W = COVER_PAGE_W;
	// Soft off-white background.
	doc.setFillColor(250, 248, 245);
	doc.rect(0, 0, W, COVER_PAGE_H, "F");

	// Wordmark.
	doc.setFont("times", "normal");
	doc.setTextColor(207, 122, 73); // NIVRA orange
	doc.setFontSize(46);
	doc.text("NIVRA", W / 2, 90, { align: "center", charSpace: 2 });

	doc.setFontSize(20);
	doc.setTextColor(40, 40, 40);
	doc.text("KITCHEN ESTIMATION", W / 2, 106, {
		align: "center",
		charSpace: 1.5,
	});

	// Customer card.
	const labels = [
		["CUSTOMER", project.clientName || "—"],
		["LOCATION", project.address || "—"],
		["DATE", formatDateDDMMMYYYY(new Date())],
		["MOBILE", project.clientPhone || "—"],
	];
	let y = 150;
	const labelX = W / 2 - 55;
	const valueX = W / 2 - 5;
	doc.setFontSize(12);
	for (const [label, value] of labels) {
		doc.setFont("times", "bold");
		doc.setTextColor(120, 120, 120);
		doc.text(`${label}:`, labelX, y);
		doc.setFont("times", "normal");
		doc.setTextColor(40, 40, 40);
		doc.text(value, valueX, y);
		y += 13;
	}
}

// ── Public entry ────────────────────────────────────────────────────────────────

/** Build the quotation jsPDF document (without saving) — testable entry point. */
export async function buildQuotationDoc(input: ExportInput): Promise<jsPDF> {
	const [{ finishes, dreamHomePrices, tallHeights, pricingSettings }, fonts] =
		await Promise.all([fetchSettings(), loadFonts()]);

	const fontCss = buildFontFaceCss(fonts);
	const pricingCtx: PricingCtx = {
		finishes,
		dreamHomePrices,
		tallHeights,
		pricingSettings,
	};

	const [templateText, introText] = await Promise.all([
		fetch(TEMPLATE_URL).then((r) => r.text()),
		tryFetchText(INTRO_TEMPLATE_URL),
	]);

	// ── Page 1 — cover (A4 portrait) ──
	const doc = new jsPDF({
		orientation: "portrait",
		unit: "mm",
		format: [COVER_PAGE_W, COVER_PAGE_H],
	});
	if (introText) {
		const jpeg = await svgToJpeg(
			fillIntroSvg(introText, input.project, fontCss),
			COVER_VIEW_W,
			COVER_VIEW_H,
		);
		doc.addImage(jpeg, "JPEG", 0, 0, COVER_PAGE_W, COVER_PAGE_H);
	} else {
		drawIntroFallback(doc, input.project);
	}

	// ── Pages 2…N — one per room (landscape) ──
	for (const s of input.spaces) {
		const total = priceSpaceLayers(
			s.layers,
			s.cabinets,
			s.walls,
			s.islands,
			pricingCtx,
		);
		const specs = buildSpecs(s, finishes);
		const svg = fillRoomSvg(templateText, s, total, specs, fontCss);
		const jpeg = await svgToJpeg(svg, VIEW_W, VIEW_H);
		doc.addPage([PAGE_W, PAGE_H], "portrait");
		doc.addImage(jpeg, "JPEG", 0, 0, PAGE_W, PAGE_H);
	}

	return doc;
}

export async function exportToPDF(input: ExportInput): Promise<void> {
	const doc = await buildQuotationDoc(input);
	const safeName = (input.project.name || input.project.clientName || "Estimation")
		.trim()
		.replace(/\s+/g, "-");
	doc.save(`NIVRA-${safeName}.pdf`);
}
