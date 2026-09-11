/**
 * Handover payload for the Fadior Estimator (the detailed BOQ pricing tool).
 *
 * This app produces vague, early-stage estimates from a drawing; the pricing
 * tool produces the accurate factory BOQ. The handover carries only what this
 * app actually MEASURED — lengths, dimensions, finish — and names everything it
 * cannot know, so the receiving tool can raise a gap for each rather than
 * quietly defaulting it.
 *
 * Two rules the receiving side depends on:
 *  1. `lm` is already net of corner deductions. Do not deduct corners again.
 *  2. Nothing in here is a price. Rates, margins and FX live in the pricing
 *     tool and must never be overwritten by an import.
 */
import type { Cabinet, Island, Layer, LayerType, Wall } from "./kitchen-engine";
import {
  computeEffectiveLengthsDetailed,
  makeLayerDepthResolver,
  pixelsToCm,
} from "./kitchen-engine";
import {
  END_PANEL_BASE_AREA_M2,
  END_PANEL_DECOR_WIDTH_M,
  END_PANEL_WALL_AREAS_M2,
  FILLER_AREA_M2,
  MIN_CHARGEABLE_AREA_M2,
} from "./dream-home-pricing";
import type { DreamHomeFinish, SavedProject, Space } from "@shared/schema";

export const HANDOVER_KIND = "nivra.estimator.handover";
export const HANDOVER_VERSION = 1;

type RunKind = "base" | "wall" | "tall" | "island";

const RUN_KIND: Partial<Record<LayerType, RunKind>> = {
  base: "base",
  wall_cabinet: "wall",
  tall: "tall",
  island: "island",
};

export interface HandoverCornerJunction {
  /** Name of the run this run's corner was measured against. */
  withRun: string;
  deductionM: number;
}

export interface HandoverRun {
  kind: RunKind;
  name: string;
  /** NET length in metres — already corner-deducted. Price from this. */
  lm: number;
  /** As drawn, before deductions. Audit only. */
  lmRaw: number;
  lmCornerDeduction: number;
  cornerJunctions: HandoverCornerJunction[];
  /** mm */
  h: number | null;
  /** mm */
  d: number | null;
  finishId: number | null;
  finishName: string | null;
  shelf: "glass" | "ss" | "none" | null;
}

/**
 * An end panel as this app holds it. Only the decorative variant carries real
 * dimensions (a fixed 0.6 m width × a typed height); base and wall panels are
 * picked from a nominal area bucket, so `dimensionsKnown` is false and the
 * receiving tool must ask for the real size rather than trusting the area.
 */
export interface HandoverEndPanel {
  name: string;
  variant: "base" | "wall" | "decorative";
  qty: number;
  areaPerPieceM2: number;
  totalAreaM2: number;
  widthM: number | null;
  heightM: number | null;
  dimensionsKnown: boolean;
}

export interface HandoverFiller {
  name: string;
  qty: number;
  areaPerPieceM2: number;
  totalAreaM2: number;
}

export interface HandoverPayload {
  kind: typeof HANDOVER_KIND;
  version: number;
  generatedAt: string;
  source: { app: string; projectId: number; projectRef: string };
  project: { name: string; client: string; ref: string };
  space: { name: string; type: string };
  units: { length: "m"; dimension: "mm" };
  lengthBasis: "net_of_corner_deductions";
  runs: HandoverRun[];
  endPanels: HandoverEndPanel[];
  fillers: HandoverFiller[];
  /**
   * How many DRAWERS were drawn — not how many drawer cabinets hold them.
   * A reminder to price them, never a quantity to seed rows from.
   */
  drawerCount: number;
  appliancesDetected: Array<{ kind: string; widthMm: number }>;
  totals: { baseLm: number; wallLm: number; tallLm: number; islandLm: number };
  cornerWarnings: string[];
  notKnown: string[];
}

/** Everything the pricing tool needs that this app has no concept of. */
const NOT_KNOWN = [
  "drawer_cabinet_count",
  "drawer_widths",
  "drawer_configs",
  "end_panel_dimensions",
  "zones",
  "appliance_run_assignment",
  "open_cabinets",
  "led",
  "accessories",
  "wardrobes",
  "interior_doors",
  "cladding",
  "aisi",
  "relief",
  "carcass_finish",
];

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const pxToM = (px: number) => round3(pixelsToCm(px) / 100);

export interface HandoverInput {
  project: SavedProject;
  space: Space;
  layers: Layer[];
  cabinets: Cabinet[];
  walls: Wall[];
  islands: Island[];
  finishes: DreamHomeFinish[];
  elementDefs: Array<{ id: number; name: string; category: string; defaultWidth: number }>;
  elements: Array<{ definitionId: number }>;
}

export function buildPricingHandover(input: HandoverInput): HandoverPayload {
  const { project, space, layers, cabinets, walls, islands, finishes } = input;

  const finishName = (id: number | null) =>
    id == null ? null : finishes.find((f) => f.id === id)?.name ?? null;

  const depthCmFor = makeLayerDepthResolver(layers);
  // A run's name is what the salesperson called the layer, so corner junctions
  // can point at a name the user recognises rather than an internal id.
  const runNameOfCabinet = new Map<string, string>();
  for (const layer of layers) {
    const label = layer.name?.trim() || defaultRunName(layer.type);
    for (const cab of cabinets) {
      if (cab.layerId === layer.id || layer.cabinetIds.includes(cab.id)) {
        runNameOfCabinet.set(cab.id, label);
      }
    }
  }

  const runs: HandoverRun[] = [];

  for (const layer of layers) {
    const kind = RUN_KIND[layer.type];
    if (!kind) continue;

    const name = layer.name?.trim() || defaultRunName(layer.type);

    if (kind === "island") {
      const bound = islands.find((i) => i.layerId === layer.id);
      if (!bound) continue;
      const lm = round3(bound.lengthCm / 100);
      runs.push({
        kind,
        name,
        lm,
        lmRaw: lm,
        lmCornerDeduction: 0,
        cornerJunctions: [],
        h: bound.heightCm * 10,
        d: bound.depthCm * 10,
        finishId: layer.finishId,
        finishName: finishName(layer.finishId),
        shelf: null,
      });
      continue;
    }

    const layerCabs = cabinets.filter(
      (c) => c.layerId === layer.id || layer.cabinetIds.includes(c.id),
    );
    if (layerCabs.length === 0) continue;

    const detail = computeEffectiveLengthsDetailed(
      layerCabs,
      walls,
      layer.depth ?? undefined,
      { allCabinets: cabinets, depthCmFor },
    );

    const lm = round3(
      layerCabs.reduce((sum, c) => sum + pxToM(detail.lengths.get(c.id) ?? 0), 0),
    );
    const lmRaw = round3(
      layerCabs.reduce((sum, c) => sum + pxToM(detail.rawLengths.get(c.id) ?? 0), 0),
    );

    // Collapse per-endpoint deductions into one entry per counterpart run, so
    // the receiving tool shows "0.55 m against Return run", not raw geometry.
    const byRun = new Map<string, number>();
    for (const j of detail.junctions) {
      const other = runNameOfCabinet.get(j.cutterId) ?? "another run";
      byRun.set(other, round3((byRun.get(other) ?? 0) + pxToM(j.deductionPx)));
    }

    runs.push({
      kind,
      name,
      lm,
      lmRaw,
      lmCornerDeduction: round3(lmRaw - lm),
      cornerJunctions: [...byRun].map(([withRun, deductionM]) => ({ withRun, deductionM })),
      h: layer.height == null ? null : layer.height * 10,
      d: layer.depth == null ? null : layer.depth * 10,
      finishId: layer.finishId,
      finishName: finishName(layer.finishId),
      shelf: layer.shelfMaterial ?? null,
    });
  }

  const drawerCount = layers
    .filter((l) => l.type === "drawer")
    .reduce((sum, l) => sum + (l.qty ?? 0), 0);

  const endPanels: HandoverEndPanel[] = layers
    .filter((l) => l.type === "end_panel" && l.endPanelVariant)
    .map((l) => {
      const qty = l.qty ?? 1;
      const variant = l.endPanelVariant as HandoverEndPanel["variant"];
      // Mirrors calcEndPanel() in dream-home-pricing.ts. Base and wall are
      // nominal area buckets picked from a list; only decorative is measured.
      if (variant === "decorative") {
        const heightM = (l.endPanelDecorHeight ?? 0) / 100;
        const area = Math.max(
          END_PANEL_DECOR_WIDTH_M * heightM,
          MIN_CHARGEABLE_AREA_M2,
        );
        return {
          name: l.name?.trim() || "Decorative end panel",
          variant,
          qty,
          areaPerPieceM2: round3(area),
          totalAreaM2: round3(area * qty),
          widthM: END_PANEL_DECOR_WIDTH_M,
          heightM: heightM > 0 ? round3(heightM) : null,
          dimensionsKnown: heightM > 0,
        };
      }
      const area =
        variant === "base"
          ? END_PANEL_BASE_AREA_M2
          : l.endPanelWallArea ?? END_PANEL_WALL_AREAS_M2[0];
      return {
        name: l.name?.trim() || (variant === "base" ? "Base end panel" : "Wall end panel"),
        variant,
        qty,
        areaPerPieceM2: round3(area),
        totalAreaM2: round3(area * qty),
        widthM: null,
        heightM: null,
        dimensionsKnown: false,
      };
    });

  const fillers: HandoverFiller[] = layers
    .filter((l) => l.type === "filler")
    .map((l) => {
      const qty = l.qty ?? 0;
      return {
        name: l.name?.trim() || "Filler",
        qty,
        areaPerPieceM2: FILLER_AREA_M2,
        totalAreaM2: round3(FILLER_AREA_M2 * qty),
      };
    });

  const defById = new Map(input.elementDefs.map((d) => [d.id, d]));
  const appliancesDetected = input.elements
    .map((el) => defById.get(el.definitionId))
    .filter((d): d is NonNullable<typeof d> => !!d && d.category === "appliance")
    .map((d) => ({ kind: d.name.toLowerCase(), widthMm: d.defaultWidth * 10 }));

  const sumKind = (k: RunKind) =>
    round3(runs.filter((r) => r.kind === k).reduce((s, r) => s + r.lm, 0));

  return {
    kind: HANDOVER_KIND,
    version: HANDOVER_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      app: "NIVRA Estimator",
      projectId: project.id,
      projectRef: project.clientReference || "",
    },
    project: {
      name: project.name || "",
      client: project.clientName || "",
      ref: project.clientReference || "",
    },
    space: { name: space.name || "Kitchen", type: space.type || "kitchen" },
    units: { length: "m", dimension: "mm" },
    lengthBasis: "net_of_corner_deductions",
    runs,
    endPanels,
    fillers,
    drawerCount,
    appliancesDetected,
    totals: {
      baseLm: sumKind("base"),
      wallLm: sumKind("wall"),
      tallLm: sumKind("tall"),
      islandLm: sumKind("island"),
    },
    cornerWarnings: cornerWarnings(cabinets, walls, runNameOfCabinet),
    notKnown: NOT_KNOWN,
  };
}

function defaultRunName(type: LayerType): string {
  switch (type) {
    case "base":
      return "Base run";
    case "wall_cabinet":
      return "Wall run";
    case "tall":
      return "Tall run";
    case "island":
      return "Island";
    default:
      return "Run";
  }
}

/**
 * Corner deduction only pairs cabinets of the SAME type — a base run meeting a
 * tall run at a corner keeps its full length. That is the engine's existing
 * behaviour, not something the handover changes, but the receiving tool should
 * make the salesperson confirm it rather than inherit it silently.
 */
function cornerWarnings(
  cabinets: Cabinet[],
  walls: Wall[],
  runNameOfCabinet: Map<string, string>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const NEAR = 30; // px — same order as the engine's snap radius

  for (let i = 0; i < cabinets.length; i++) {
    for (let j = i + 1; j < cabinets.length; j++) {
      const a = cabinets[i];
      const b = cabinets[j];
      if (a.type === b.type) continue;
      if (a.type !== "tall" && b.type !== "tall") continue;

      const touches = [
        [a.start, b.start],
        [a.start, b.end],
        [a.end, b.start],
        [a.end, b.end],
      ].some(([p, q]) => Math.hypot(p.x - q.x, p.y - q.y) < NEAR);
      if (!touches) continue;

      const n1 = runNameOfCabinet.get(a.id) ?? "a run";
      const n2 = runNameOfCabinet.get(b.id) ?? "a run";
      const key = [n1, n2].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(
        `"${n1}" and "${n2}" meet at a corner but are different cabinet types, ` +
          `so no corner deduction was applied. Confirm the corner is only counted once.`,
      );
    }
  }
  return out;
}

/** Fetch the reference data the payload needs, then build and download it. */
export async function downloadPricingHandover(
  input: Omit<HandoverInput, "finishes" | "elementDefs">,
): Promise<HandoverPayload> {
  const [finishesRes, defsRes] = await Promise.all([
    fetch("/api/dream-home/finishes"),
    fetch("/api/element-definitions"),
  ]);
  const finishes = (await finishesRes.json()) as DreamHomeFinish[];
  const elementDefs = (await defsRes.json()) as HandoverInput["elementDefs"];

  const payload = buildPricingHandover({ ...input, finishes, elementDefs });

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = (payload.project.name || "project").trim().replace(/\s+/g, "-");
  const space = (payload.space.name || "kitchen").trim().replace(/\s+/g, "-");
  a.download = `${safe}-${space}-pricing-handover.json`;
  a.click();
  URL.revokeObjectURL(url);
  return payload;
}
