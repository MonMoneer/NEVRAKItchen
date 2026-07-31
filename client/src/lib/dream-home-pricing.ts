import type { DreamHomePrice, TallHeight, PricingSettings } from "@shared/schema";

// ─── Constants ──────────────────────────────────────────────────────────────

const STANDARDS = {
  base:         { heightMm: 670, depthMm: 550 },
  wall_cabinet: { heightMm: 700, depthMm: 330 },
  tall:         { depthMm: 550 },
} as const;

export const DREAM_HOME_TALL_HEIGHTS = [1900, 2000, 2100, 2200, 2400, 2600];
export const PLATINUM_TALL_HEIGHTS = [2700, 2800, 2900, 3000];

export const END_PANEL_BASE_AREA_M2 = 0.5;
export const END_PANEL_WALL_AREAS_M2 = [0.2, 0.3, 0.4] as const;
export const END_PANEL_DECOR_WIDTH_M = 0.6;
export const MIN_CHARGEABLE_AREA_M2 = 0.2;
export const FILLER_AREA_M2 = 0.2;

// ─── Core helpers ───────────────────────────────────────────────────────────

export function heightSurcharge(cm: number, standardMm: number): number {
  const mm = cm * 10;
  const extra = Math.max(0, mm - standardMm);
  const steps = Math.ceil(extra / 100);
  return 1 + 0.1 * steps;
}

export function depthSurcharge(cm: number, standardMm: number): number {
  const mm = cm * 10;
  const extra = Math.max(0, mm - standardMm);
  const steps = Math.ceil(extra / 100);
  return 1 + 0.1 * steps;
}

export function snapTallHeight(cm: number): { source: "dream_home" | "platinum"; heightMm: number } {
  const mm = cm * 10;
  if (mm <= 2600) {
    const snapped = DREAM_HOME_TALL_HEIGHTS.find((h) => h >= mm) ?? 2600;
    return { source: "dream_home", heightMm: snapped };
  }
  const snapped = PLATINUM_TALL_HEIGHTS.find((h) => h >= mm) ?? 3000;
  return { source: "platinum", heightMm: snapped };
}

export function toAED(cny: number, s: PricingSettings): number {
  const fx = Number(s.fxRate);
  const packing = Number(s.packingMult);
  const shipping = Number(s.shippingMult);
  const margin = Number(s.marginDiv);
  if (margin === 0) return 0;
  // Packing is a real pass-through cost, not something the margin should mark
  // up: compute it as a surcharge on the pre-margin (but post-shipping) price,
  // then add it back in after margin is applied to everything else.
  const priceWithoutMargin = cny * fx * shipping;
  const packingSurcharge = priceWithoutMargin * (packing - 1);
  return priceWithoutMargin / margin + packingSurcharge;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type LayerType = "base" | "wall_cabinet" | "tall" | "island" | "end_panel" | "filler" | "drawer" | "countertop";
export type EndPanelVariant = "base" | "wall" | "decorative";
export type ShelfMaterial = "glass" | "ss" | "none";

export interface PricingLayer {
  id: string;
  type: LayerType;
  depth: number | null;
  height: number | null;
  finishId?: number | null;
  shelfMaterial?: ShelfMaterial;
  endPanelVariant?: EndPanelVariant;
  endPanelWallArea?: number;
  endPanelDecorHeight?: number;
  qty?: number;
  manualLengthM?: number;
  priceAedPerM?: number;
}

export interface PriceInput {
  layer: PricingLayer;
  lengthM: number;
  settings: PricingSettings;
  dreamHomePrices: DreamHomePrice[];
  tallHeights: TallHeight[];
}

export interface PriceResult {
  subtotalAED: number;
  breakdown: string;
  rateLabel?: string;
  error?: string;
}

// ─── Lookup helpers ─────────────────────────────────────────────────────────

function lookupDreamHomePrice(prices: DreamHomePrice[], cabinetType: string, finishId: number): number {
  const row = prices.find((p) => p.cabinetType === cabinetType && p.finishId === finishId);
  return row ? Number(row.priceCnyPerM) : 0;
}

function lookupTallPrice(tallHeights: TallHeight[], heightMm: number, finishId: number): number {
  const row = tallHeights.find((t) => t.heightMm === heightMm && t.finishId === finishId);
  return row ? Number(row.priceCnyPerM) : 0;
}

// ─── Shelf upgrade pricing ──────────────────────────────────────────────────
//
// SS shelves are priced by area: rate (CNY/m²) × cabinet depth (m) × length
// (m) × shelf count. Base/wall have exactly 1 shelf per lm; tall cabinets get
// `tallShelfCount` shelves (a count set by height bracket). Glass is included
// free on base/wall (their normal shelf material); on tall, glass is a flat
// per-piece charge (no depth factor) × shelf count × length.

function tallShelfCount(heightMm: number, settings: PricingSettings): number {
  return heightMm <= 2300 ? Number(settings.tallShelfCountMin) : Number(settings.tallShelfCountMax);
}

function shelfCnyForBaseOrWall(
  material: ShelfMaterial | undefined,
  depthCm: number,
  lengthM: number,
  settings: PricingSettings,
): number {
  if (material !== "ss") return 0; // glass (default) is included, no charge
  return Number(settings.shelfSsRateCnyPerM2) * (depthCm / 100) * lengthM;
}

function shelfCnyForTall(
  material: ShelfMaterial | undefined,
  depthCm: number,
  lengthM: number,
  heightMm: number,
  settings: PricingSettings,
): { cny: number; count: number } {
  if (!material || material === "none") return { cny: 0, count: 0 };
  const count = tallShelfCount(heightMm, settings);
  if (material === "glass") {
    return { cny: Number(settings.shelfGlassRateCnyPerPc) * count * lengthM, count };
  }
  return { cny: Number(settings.shelfSsRateCnyPerM2) * (depthCm / 100) * lengthM * count, count };
}

// ─── Settings breakdown suffix (common to all calculations) ─────────────────

function settingsSuffix(s: PricingSettings): string {
  return `× ${Number(s.fxRate)} (FX) × ${Number(s.shippingMult)} (shipping) / ${Number(s.marginDiv)} (margin) + packing surcharge (${Number(s.packingMult)}, no margin)`;
}

// ─── Main calculator ────────────────────────────────────────────────────────

export function calculateLayerPrice(input: PriceInput): PriceResult {
  const { layer } = input;
  switch (layer.type) {
    case "base":
    case "wall_cabinet":
      return calcBaseOrWall(input);
    case "tall":
      return calcTall(input);
    case "island":
      return calcIsland(input);
    case "end_panel":
      return calcEndPanel(input);
    case "filler":
      return calcFiller(input);
    case "drawer":
      return calcDrawer(input);
    case "countertop":
      return calcCountertop(input);
    default:
      return { subtotalAED: 0, breakdown: "Unknown layer type" };
  }
}

function calcBaseOrWall(input: PriceInput): PriceResult {
  const { layer, lengthM, settings, dreamHomePrices } = input;
  if (!layer.finishId) return { subtotalAED: 0, breakdown: "No finish selected" };
  if (layer.depth == null || layer.height == null) return { subtotalAED: 0, breakdown: "Depth/height missing" };

  const std = STANDARDS[layer.type as "base" | "wall_cabinet"];
  const base = lookupDreamHomePrice(dreamHomePrices, layer.type, layer.finishId);
  if (base === 0) return { subtotalAED: 0, breakdown: "No price data" };

  const hSur = heightSurcharge(layer.height, std.heightMm);
  const dSur = depthSurcharge(layer.depth, std.depthMm);
  const shelfCny = shelfCnyForBaseOrWall(layer.shelfMaterial, layer.depth, lengthM, settings);
  const cny = base * hSur * dSur * lengthM + shelfCny;
  const aed = toAED(cny, settings);

  const shelfNote = shelfCny > 0 ? ` + ${shelfCny.toFixed(0)} CNY (SS shelf)` : "";
  const breakdown = `${base} CNY/m × (${hSur.toFixed(2)} × ${dSur.toFixed(2)}) × ${lengthM.toFixed(2)}m${shelfNote} ${settingsSuffix(settings)} = ${aed.toFixed(0)} AED`;
  const rateLabel = `${base} CNY/m × ${hSur.toFixed(2)} (H) × ${dSur.toFixed(2)} (D)`;
  return { subtotalAED: aed, breakdown, rateLabel };
}

function calcTall(input: PriceInput): PriceResult {
  const { layer, lengthM, settings, tallHeights } = input;
  if (!layer.finishId) return { subtotalAED: 0, breakdown: "No finish selected" };
  if (layer.depth == null || layer.height == null) return { subtotalAED: 0, breakdown: "Depth/height missing" };

  const snapped = snapTallHeight(layer.height);
  const base = lookupTallPrice(tallHeights, snapped.heightMm, layer.finishId);
  if (base === 0) return { subtotalAED: 0, breakdown: "No tall price data" };

  const dSur = depthSurcharge(layer.depth, STANDARDS.tall.depthMm);
  const shelf = shelfCnyForTall(layer.shelfMaterial, layer.depth, lengthM, snapped.heightMm, settings);
  const cny = base * dSur * lengthM + shelf.cny;
  const aed = toAED(cny, settings);

  const sourceLabel = snapped.source === "platinum" ? "Platinum" : "Dream Home";
  const shelfNote = shelf.cny > 0 ? ` + ${shelf.cny.toFixed(0)} CNY (${shelf.count}× ${layer.shelfMaterial} shelf)` : "";
  const breakdown = `${sourceLabel} ${snapped.heightMm}mm: ${base} CNY/m × ${dSur.toFixed(2)} × ${lengthM.toFixed(2)}m${shelfNote} ${settingsSuffix(settings)} = ${aed.toFixed(0)} AED`;
  const rateLabel = `${base} CNY/m (${sourceLabel} ${snapped.heightMm}mm) × ${dSur.toFixed(2)} (D)`;
  return { subtotalAED: aed, breakdown, rateLabel };
}

function calcIsland(input: PriceInput): PriceResult {
  const { layer, lengthM, settings, dreamHomePrices } = input;
  if (!layer.finishId) return { subtotalAED: 0, breakdown: "No finish selected" };
  if (layer.depth == null || layer.height == null) return { subtotalAED: 0, breakdown: "Depth/height missing" };
  if (layer.depth > 110) return { subtotalAED: 0, breakdown: "", error: "Island depth max 110 cm" };

  const base = lookupDreamHomePrice(dreamHomePrices, "base", layer.finishId);
  if (base === 0) return { subtotalAED: 0, breakdown: "No price data" };

  const hSur = heightSurcharge(layer.height, STANDARDS.base.heightMm);
  const singleRowCny = base * hSur * lengthM;

  let cny: number;
  let breakdown: string;
  let rateLabel: string;
  const decorativeRate = Number(settings.decorativeCnyPerM2);

  if (layer.depth < 75) {
    // 1 row + auto back panel
    const backAreaM2 = lengthM * (layer.height / 100);
    const backCny = backAreaM2 * decorativeRate;
    cny = singleRowCny + backCny;
    breakdown = `(${base} × ${hSur.toFixed(2)} × ${lengthM.toFixed(2)}m) + (${backAreaM2.toFixed(2)}m² × ${decorativeRate}) = ${cny.toFixed(0)} CNY ${settingsSuffix(settings)}`;
    rateLabel = `${base} CNY/m × ${hSur.toFixed(2)} + back panel ${decorativeRate} CNY/m²`;
  } else {
    // 2 rows, no back panel (2nd row replaces back)
    cny = 2 * singleRowCny;
    breakdown = `2 rows × ${base} × ${hSur.toFixed(2)} × ${lengthM.toFixed(2)}m = ${cny.toFixed(0)} CNY ${settingsSuffix(settings)}`;
    rateLabel = `2 rows × ${base} CNY/m × ${hSur.toFixed(2)} (H)`;
  }

  return { subtotalAED: toAED(cny, settings), breakdown, rateLabel };
}

function calcEndPanel(input: PriceInput): PriceResult {
  const { layer, settings } = input;
  const qty = layer.qty ?? 1;
  const rate = Number(settings.decorativeCnyPerM2);
  let areaM2 = 0;
  let label = "";

  switch (layer.endPanelVariant) {
    case "base":
      areaM2 = END_PANEL_BASE_AREA_M2 * qty;
      label = `${qty} × 0.5m² (Base)`;
      break;
    case "wall": {
      const variant = layer.endPanelWallArea ?? 0.2;
      areaM2 = variant * qty;
      label = `${qty} × ${variant}m² (Wall)`;
      break;
    }
    case "decorative": {
      const heightCm = layer.endPanelDecorHeight ?? 0;
      const pieceArea = Math.max(END_PANEL_DECOR_WIDTH_M * (heightCm / 100), MIN_CHARGEABLE_AREA_M2);
      areaM2 = pieceArea * qty;
      label = `${qty} × ${pieceArea.toFixed(2)}m² (Decor, min ${MIN_CHARGEABLE_AREA_M2})`;
      break;
    }
    default:
      return { subtotalAED: 0, breakdown: "Select end panel variant" };
  }

  const cny = areaM2 * rate;
  const aed = toAED(cny, settings);
  return {
    subtotalAED: aed,
    breakdown: `${label} × ${rate} CNY/m² = ${cny.toFixed(0)} CNY ${settingsSuffix(settings)} = ${aed.toFixed(0)} AED`,
    rateLabel: `${rate} CNY/m² × ${areaM2.toFixed(2)}m²`,
  };
}

function calcFiller(input: PriceInput): PriceResult {
  const { layer, settings } = input;
  const qty = layer.qty ?? 0;
  const rate = Number(settings.decorativeCnyPerM2);
  const areaM2 = FILLER_AREA_M2 * qty;
  const cny = areaM2 * rate;
  const aed = toAED(cny, settings);
  return {
    subtotalAED: aed,
    breakdown: `${qty} × 0.2m² × ${rate} CNY/m² = ${cny.toFixed(0)} CNY ${settingsSuffix(settings)} = ${aed.toFixed(0)} AED`,
    rateLabel: `${rate} CNY/m² × ${areaM2.toFixed(2)}m²`,
  };
}

// Countertop is not drawn on canvas -- its length is a manually-entered value
// (pre-filled once from the base cabinet total, then freely editable) and its
// rate is a flat AED/m figure typed in directly, with no CNY/FX conversion.
function calcCountertop(input: PriceInput): PriceResult {
  const { layer, lengthM } = input;
  const rate = Number(layer.priceAedPerM ?? 0);
  const aed = lengthM * rate;
  return {
    subtotalAED: aed,
    breakdown: `${lengthM.toFixed(2)}m × ${rate.toFixed(2)} AED/m (flat) = ${aed.toFixed(0)} AED`,
    rateLabel: `${rate.toFixed(2)} AED/m × ${lengthM.toFixed(2)}m`,
  };
}

function calcDrawer(input: PriceInput): PriceResult {
  const { layer, settings } = input;
  const qty = layer.qty ?? 0;
  const flatAed = Number(settings.drawerFlatAed);
  const aed = qty * flatAed;
  return {
    subtotalAED: aed,
    breakdown: `${qty} × ${flatAed} AED (flat) = ${aed.toFixed(0)} AED`,
    rateLabel: `${flatAed} AED × ${qty} pcs (flat)`,
  };
}
