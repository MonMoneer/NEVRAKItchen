import jsPDF from "jspdf";
import type { Wall, Cabinet, Opening, Layer, Island } from "./kitchen-engine";
import {
	pixelsToCm,
	computeEffectiveLengths,
	makeLayerDepthResolver,
} from "./kitchen-engine";
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

export interface SpaceTotals {
	kitchenTotal: number;
	countertopTotal: number;
	grandTotal: number;
}

function priceSpaceLayers(
	layers: Layer[],
	cabinets: Cabinet[],
	walls: Wall[],
	islands: Island[],
	ctx: PricingCtx,
): SpaceTotals {
	let kitchenTotal = 0;
	let countertopTotal = 0;
	// Built once: corner deductions are searched across every cabinet in the
	// space, so a corner shared by two differently-named runs is charged once.
	const depthCmFor = makeLayerDepthResolver(layers);
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
			{ allCabinets: cabinets, depthCmFor },
		);
		const cabinetsLengthM = layerCabinets.reduce((sum, c) => {
			const effPx = effLengths.get(c.id) ?? 0;
			return sum + pixelsToCm(effPx) / 100;
		}, 0);
		const lengthM = boundIsland
			? boundIsland.lengthCm / 100
			: layer.type === "countertop"
			? layer.manualLengthM ?? 0
			: cabinetsLengthM;

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
		if (layer.type === "countertop") {
			countertopTotal += subtotal;
		} else {
			kitchenTotal += subtotal;
		}
	}
	return { kitchenTotal, countertopTotal, grandTotal: kitchenTotal + countertopTotal };
}

/** Sum the grand total across every space in a project (used by the Schedule
 * Builder JSON export, which needs one project-wide figure, not a per-room
 * breakdown). */
export async function computeProjectGrandTotal(
	spacesData: { layers: Layer[]; cabinets: Cabinet[]; walls: Wall[]; islands: Island[] }[],
): Promise<number> {
	const ctx = await fetchSettings();
	return spacesData.reduce(
		(sum, s) => sum + priceSpaceLayers(s.layers, s.cabinets, s.walls, s.islands, ctx).grandTotal,
		0,
	);
}

// ── Per-layer spec extraction ────────────────────────────────────────────────────
//
// Each layer (not just each cabinet TYPE) gets its own named row -- two wall
// cabinets with different specs each show up separately, labelled with
// whatever name was set in the Layers panel (falling back to "Wall Cabinet 2"
// etc. for unnamed ones). Rows are grouped under a shared type heading and
// laid out in two balanced columns; a single scale factor shrinks font size
// and line spacing so any number of layers still fits above the TOTAL line.

type TypeKey = "base" | "wall_cabinet" | "tall" | "island";

const SKIRTING_TYPES: ReadonlySet<TypeKey> = new Set(["base", "tall", "island"]);
const SHELF_TYPES: ReadonlySet<TypeKey> = new Set(["base", "wall_cabinet", "tall"]);

const SHELF_LABEL: Record<string, string> = {
	glass: "Glass",
	ss: "SS (Stainless Steel)",
	none: "None",
};

function shelfLabel(key: TypeKey, shelfMaterial: string | undefined): string {
	const material = shelfMaterial || (key === "tall" ? "none" : "glass");
	return SHELF_LABEL[material] ?? "Glass";
}

const TYPE_HEADINGS: Record<TypeKey, string> = {
	base: "BASE CABINET",
	wall_cabinet: "WALL CABINET",
	tall: "TALL CABINET",
	island: "ISLAND",
};

interface SpecRow {
	label: string;
	detail: string;
}

interface SpecGroup {
	heading: string;
	rows: SpecRow[];
}

function buildLayerGroups(s: SpaceExportData, finishes: DreamHomeFinish[]): SpecGroup[] {
	const finishName = (id: number | null | undefined) =>
		finishes.find((f) => f.id === id)?.name || "—";

	const drawerCount = s.layers
		.filter((l) => l.type === "drawer")
		.reduce((sum, l) => sum + (l.qty ?? 0), 0);

	const groups: SpecGroup[] = [];

	for (const key of ["base", "wall_cabinet", "tall", "island"] as TypeKey[]) {
		const layers = s.layers.filter((l) => l.type === key);
		if (layers.length === 0) continue;

		const rows: SpecRow[] = layers.map((layer, i) => {
			const island =
				key === "island" ? s.islands.find((isl) => isl.layerId === layer.id) ?? null : null;
			const height = island ? island.heightCm : layer.height ?? 0;
			const depth = island ? island.depthCm : layer.depth ?? 0;

			const parts = [
				height ? `H ${height}cm` : null,
				depth ? `D ${depth}cm` : null,
				SKIRTING_TYPES.has(key) ? "Skirting +10cm" : null,
				finishName(layer.finishId),
				SHELF_TYPES.has(key) ? `Shelf: ${shelfLabel(key, layer.shelfMaterial)}` : null,
				key === "base" && i === 0 && drawerCount > 0 ? `${drawerCount} drawers` : null,
			].filter(Boolean) as string[];

			return {
				label: layer.name || `${TYPE_HEADINGS[key]} ${i + 1}`,
				detail: parts.join("  ·  "),
			};
		});
		groups.push({ heading: TYPE_HEADINGS[key], rows });
	}

	const countertopLayers = s.layers.filter((l) => l.type === "countertop");
	if (countertopLayers.length > 0) {
		const rows: SpecRow[] = countertopLayers.map((layer, i) => {
			const lengthM = layer.manualLengthM ?? 0;
			const rate = layer.priceAedPerM ?? 0;
			const aed = lengthM * rate;
			return {
				label: layer.name || `Countertop ${i + 1}`,
				detail: `${lengthM.toFixed(2)}m × ${rate.toFixed(0)} AED/m  =  ${formatThousands(aed)} AED`,
			};
		});
		groups.push({ heading: "COUNTERTOP", rows });
	}

	return groups;
}

/** Greedily balance groups across two columns by total line count. */
function splitIntoColumns(groups: SpecGroup[]): { left: SpecGroup[]; right: SpecGroup[] } {
	const sized = groups
		.map((g) => ({ g, size: 1 + g.rows.length }))
		.sort((a, b) => b.size - a.size);
	const left: SpecGroup[] = [];
	const right: SpecGroup[] = [];
	let leftSize = 0;
	let rightSize = 0;
	for (const { g, size } of sized) {
		if (leftSize <= rightSize) {
			left.push(g);
			leftSize += size;
		} else {
			right.push(g);
			rightSize += size;
		}
	}
	return { left, right };
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

// Ids from the original fixed 4-block template layout. All hidden now that
// specs are rendered dynamically (see below) -- kept here only so the group
// each belongs to (its parent <g>) can still be located as an anchor point.
const OLD_FIXED_BLOCK_IDS: string[] = [
	"qt-base",
	"qt-wall",
	"qt-tall",
	"qt-island",
].flatMap((prefix) => [
	`${prefix}-title`,
	`${prefix}-lbl-height`,
	`${prefix}-lbl-depth`,
	`${prefix}-lbl-skirting`,
	`${prefix}-lbl-including`,
	`${prefix}-lbl-shelf`,
	`${prefix}-height`,
	`${prefix}-depth`,
	`${prefix}-skirting`,
	`${prefix}-finish`,
	`${prefix}-drawers`,
	`${prefix}-shelf`,
]).concat(["qt-countertop-title", "qt-countertop"]);

const SPECS_TOP_Y = 444.44; // matches the original qt-base-title baseline
const SPECS_BOTTOM_Y = 665; // leaves a margin above the TOTAL line (~681)
const SPECS_LEFT_X = 51.17; // matches the original base/tall column
const SPECS_RIGHT_X = 273.73; // matches the original wall/island column
const SPECS_COLUMN_GAP = 14;
const SPECS_PAGE_RIGHT_MARGIN = 544; // mirrors the left margin inside the 595.28pt-wide artboard
const BASE_LINE_HEIGHT = 14;
const BASE_HEADING_SIZE = 13;
const BASE_ROW_SIZE = 11;
const CHAR_WIDTH_FACTOR = 0.52; // rough average glyph width as a fraction of font-size, EB Garamond

/** Greedy word-wrap: breaks `text` into lines no longer than `maxChars`. */
function wrapText(text: string, maxChars: number): string[] {
	const limit = Math.max(4, maxChars);
	const words = text.split(" ");
	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (candidate.length > limit && current) {
			lines.push(current);
			current = word;
		} else {
			current = candidate;
		}
	}
	if (current) lines.push(current);
	return lines.length ? lines : [""];
}

interface WrappedRow {
	nameLines: string[];
	detailLines: string[];
}
interface WrappedGroup {
	group: SpecGroup;
	rows: WrappedRow[];
}

function wrapGroups(groups: SpecGroup[], columnWidth: number, fontSize: number): WrappedGroup[] {
	const maxChars = Math.max(4, Math.floor(columnWidth / (fontSize * CHAR_WIDTH_FACTOR)));
	return groups.map((group) => ({
		group,
		rows: group.rows.map((row) => ({
			nameLines: wrapText(row.label, maxChars),
			detailLines: row.detail ? wrapText(row.detail, maxChars) : [],
		})),
	}));
}

function countWrappedLines(wrapped: WrappedGroup[]): number {
	return wrapped.reduce(
		(n, g) => n + 1 + g.rows.reduce((rn, r) => rn + r.nameLines.length + r.detailLines.length, 0),
		0,
	);
}

function renderSpecColumn(doc: Document, container: Element, wrapped: WrappedGroup[], x: number, scale: number) {
	const lineHeight = BASE_LINE_HEIGHT * scale;
	let y = SPECS_TOP_Y;
	for (const { group, rows } of wrapped) {
		const heading = doc.createElementNS(SVGNS, "text");
		heading.setAttribute("x", String(x));
		heading.setAttribute("y", String(y));
		heading.setAttribute("fill", "#cd7a4a");
		heading.setAttribute("font-family", "TheSeasons-Regular, 'The Seasons'");
		heading.setAttribute("font-size", String(BASE_HEADING_SIZE * scale));
		heading.textContent = group.heading;
		container.appendChild(heading);
		y += lineHeight * 1.3;

		for (const row of rows) {
			for (const line of row.nameLines) {
				const el = doc.createElementNS(SVGNS, "text");
				el.setAttribute("x", String(x));
				el.setAttribute("y", String(y));
				el.setAttribute("fill", "#231f20");
				el.setAttribute("font-family", "EBGaramond-600, 'EB Garamond'");
				el.setAttribute("font-weight", "600");
				el.setAttribute("font-size", String(BASE_ROW_SIZE * scale));
				el.textContent = line;
				container.appendChild(el);
				y += lineHeight;
			}
			for (const line of row.detailLines) {
				const el = doc.createElementNS(SVGNS, "text");
				el.setAttribute("x", String(x));
				el.setAttribute("y", String(y));
				el.setAttribute("fill", "#565253");
				el.setAttribute("font-family", "EBGaramond-Regular, 'EB Garamond'");
				el.setAttribute("font-size", String(BASE_ROW_SIZE * scale));
				el.textContent = line;
				container.appendChild(el);
				y += lineHeight;
			}
			y += lineHeight * 0.25;
		}
		y += lineHeight * 0.5;
	}
}

// ── Totals block (subtotals + grand total + estimate range) ─────────────────────

const TOTALS_LEFT_X = 50.33;
const TOTALS_TOP_Y = 683;
const TOTALS_SUBTOTAL_GAP = 15;
const TOTALS_SUBTOTAL_SIZE = 10.5;
const TOTALS_GRAND_GAP = 26;
const TOTALS_GRAND_SIZE = 19;
const TOTALS_RANGE_GAP = 20;
const TOTALS_RANGE_SIZE = 10;

// The estimate range communicates uncertainty before final measurement/design:
// low end is 15% under the computed total, high end is 15% over it.
const ESTIMATE_RANGE_LOW_FACTOR = 0.85;
const ESTIMATE_RANGE_HIGH_FACTOR = 1.15;

function renderTotalsLine(
	doc: Document,
	container: Element,
	x: number,
	y: number,
	label: string,
	value: string,
	fontSize: number,
	labelColor: string,
	valueColor: string,
	bold: boolean,
) {
	const el = doc.createElementNS(SVGNS, "text");
	el.setAttribute("x", String(x));
	el.setAttribute("y", String(y));
	el.setAttribute("font-family", "EBGaramond-Regular, 'EB Garamond'");
	el.setAttribute("font-size", String(fontSize));

	const labelSpan = doc.createElementNS(SVGNS, "tspan");
	labelSpan.setAttribute("fill", labelColor);
	if (bold) {
		labelSpan.setAttribute("font-family", "EBGaramond-600, 'EB Garamond'");
		labelSpan.setAttribute("font-weight", "600");
	}
	labelSpan.textContent = label;
	el.appendChild(labelSpan);

	if (value) {
		const valueSpan = doc.createElementNS(SVGNS, "tspan");
		valueSpan.setAttribute("fill", valueColor);
		if (bold) {
			valueSpan.setAttribute("font-family", "EBGaramond-600, 'EB Garamond'");
			valueSpan.setAttribute("font-weight", "600");
		}
		valueSpan.textContent = `   ${value}`;
		el.appendChild(valueSpan);
	}
	container.appendChild(el);
}

function renderTotalsBlock(doc: Document, container: Element, totals: SpaceTotals) {
	const x = TOTALS_LEFT_X;
	let y = TOTALS_TOP_Y;

	renderTotalsLine(
		doc, container, x, y,
		"KITCHEN CABINETS", `${formatThousands(totals.kitchenTotal)} AED`,
		TOTALS_SUBTOTAL_SIZE, "#cd7a4a", "#565253", false,
	);
	y += TOTALS_SUBTOTAL_GAP;

	renderTotalsLine(
		doc, container, x, y,
		"COUNTERTOPS", `${formatThousands(totals.countertopTotal)} AED`,
		TOTALS_SUBTOTAL_SIZE, "#cd7a4a", "#565253", false,
	);
	y += TOTALS_GRAND_GAP;

	renderTotalsLine(
		doc, container, x, y,
		"GRAND TOTAL ESTIMATE", `${formatThousands(totals.grandTotal)} AED`,
		TOTALS_GRAND_SIZE, "#be7446", "#231f20", true,
	);
	y += TOTALS_RANGE_GAP;

	const low = Math.round(totals.grandTotal * ESTIMATE_RANGE_LOW_FACTOR);
	const high = Math.round(totals.grandTotal * ESTIMATE_RANGE_HIGH_FACTOR);
	renderTotalsLine(
		doc, container, x, y,
		"Estimated Range:", `${formatThousands(low)} – ${formatThousands(high)} AED`,
		TOTALS_RANGE_SIZE, "#8a8586", "#8a8586", false,
	);
}

/** Inject one room's data into the template SVG and return the markup string. */
function fillRoomSvg(
	templateText: string,
	s: SpaceExportData,
	totals: SpaceTotals,
	groups: SpecGroup[],
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

	// 4. Cabinet + countertop specs -- fully dynamic, one row per layer, so
	// multiple layers of the same type (e.g. two wall cabinet runs) each show
	// their own name/details instead of being collapsed into one block.
	OLD_FIXED_BLOCK_IDS.forEach((id) => hide(doc, id));
	const anchor = doc.getElementById("qt-base-title");
	const container = anchor?.parentElement;
	if (container) {
		const { left, right } = splitIntoColumns(groups);
		const leftWidth = SPECS_RIGHT_X - SPECS_LEFT_X - SPECS_COLUMN_GAP;
		const rightWidth = SPECS_PAGE_RIGHT_MARGIN - SPECS_RIGHT_X;
		const available = SPECS_BOTTOM_Y - SPECS_TOP_Y;

		let scale = 1;
		for (let i = 0; i < 40; i++) {
			const fontSize = BASE_ROW_SIZE * scale;
			const maxLines = Math.max(
				countWrappedLines(wrapGroups(left, leftWidth, fontSize)),
				countWrappedLines(wrapGroups(right, rightWidth, fontSize)),
			);
			const needed = maxLines * BASE_LINE_HEIGHT * scale * 1.15;
			if (needed <= available || scale <= 0.55) break;
			scale *= 0.95;
		}
		const fontSize = BASE_ROW_SIZE * scale;
		renderSpecColumn(doc, container, wrapGroups(left, leftWidth, fontSize), SPECS_LEFT_X, scale);
		renderSpecColumn(doc, container, wrapGroups(right, rightWidth, fontSize), SPECS_RIGHT_X, scale);
	}

	// 5. Totals block -- replaces the old static single "TOTAL" line with a
	// dynamic breakdown (per-category subtotals, grand total, estimate range).
	const totalAnchor = doc.getElementById("qt-total");
	const totalsContainer = totalAnchor?.parentElement;
	if (totalsContainer) {
		(totalsContainer as Element).setAttribute("style", "display: none");
		const totalsHost = totalsContainer.parentElement ?? totalsContainer;
		renderTotalsBlock(doc, totalsHost, totals);
	}

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
	setText(doc, "qt-reference", project.clientReference || "—");
	setText(doc, "qt-prepared-by", project.preparedBy || "—");

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
		["REFERENCE", project.clientReference || "—"],
		["PREPARED BY", project.preparedBy || "—"],
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
		const totals = priceSpaceLayers(
			s.layers,
			s.cabinets,
			s.walls,
			s.islands,
			pricingCtx,
		);
		const groups = buildLayerGroups(s, finishes);
		const svg = fillRoomSvg(templateText, s, totals, groups, fontCss);
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
