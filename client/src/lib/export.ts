import jsPDF from "jspdf";
import { PDFDocument } from "pdf-lib";
import type { Wall, Cabinet, Opening, Layer } from "./kitchen-engine";
import { pixelsToCm, OPENING_STYLES, computeEffectiveLengths } from "./kitchen-engine";
import letterheadUrl from "@assets/NIVRA_LETTERHEAD_V1.1_(1)_1772051682721.pdf?url";

const cabinetLabels: Record<string, string> = {
  base: "Base Cabinet",
  wall_cabinet: "Wall Cabinet",
  tall: "Tall Cabinet",
  island: "Island",
  end_panel: "End Panel",
  filler: "Filler",
  drawer: "Drawer",
};

async function fetchSettings() {
  const [settingsRes, finishingRes] = await Promise.all([
    fetch("/api/admin/settings"),
    fetch("/api/finishing-options"),
  ]);
  return {
    settings: await settingsRes.json(),
    finishing: await finishingRes.json(),
  };
}

async function fetchPriceMatrix(type: string) {
  const res = await fetch(`/api/price-matrix?type=${type}`);
  return res.json();
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function generateQuoteNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const seq = Math.floor(10000 + Math.random() * 90000);
  return `NIVRA-${year}-${seq}`;
}

export async function exportToPDF(
  walls: Wall[],
  cabinets: Cabinet[],
  selectedFinishingId: string,
  projectName?: string,
  clientName?: string,
  clientPhone?: string,
  openings: Opening[] = [],
  layoutImageDataUrl?: string,
  layers: Layer[] = [],
) {
  const { finishing } = await fetchSettings();

  const activeFinishing = finishing.find(
    (f: { id: number }) => f.id.toString() === selectedFinishingId
  ) || finishing[0];
  const currency = "AED";
  const quoteNo = generateQuoteNumber();
  const dateStr = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  const topSafe = 30;

  let y = topSafe;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(37, 99, 235);
  doc.text("QUOTATION", margin, y);
  y += 10;

  const infoFontSize = 8.5;
  const infoLineHeight = 5;

  const col2X = margin + contentWidth * 0.55;

  const leftInfo: [string, string][] = [
    ["Project:", projectName || "Kitchen Layout"],
    ["Quote No:", quoteNo],
    ["Date:", dateStr],
  ];

  const rightInfo: [string, string][] = [];
  if (clientName) rightInfo.push(["Client:", clientName]);
  if (clientPhone) rightInfo.push(["Phone:", clientPhone]);

  const maxLines = Math.max(leftInfo.length, rightInfo.length);
  for (let i = 0; i < maxLines; i++) {
    if (i < leftInfo.length) {
      const [label, value] = leftInfo[i];
      doc.setFont("helvetica", "bold");
      doc.setFontSize(infoFontSize);
      doc.setTextColor(100, 100, 100);
      doc.text(label, margin, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);
      doc.text(value, margin + 22, y);
    }
    if (i < rightInfo.length) {
      const [label, value] = rightInfo[i];
      doc.setFont("helvetica", "bold");
      doc.setFontSize(infoFontSize);
      doc.setTextColor(100, 100, 100);
      doc.text(label, col2X, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);
      doc.text(value, col2X + 18, y);
    }
    y += infoLineHeight;
  }

  y += 3;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  if (layoutImageDataUrl) {
    const viewW = contentWidth;
    const viewH = 145;

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = layoutImageDataUrl;
    });

    const imgAspect = img.width / img.height;
    const boxAspect = viewW / viewH;
    let drawW: number, drawH: number;
    if (imgAspect > boxAspect) {
      drawW = viewW;
      drawH = viewW / imgAspect;
    } else {
      drawH = viewH;
      drawW = viewH * imgAspect;
    }

    const imgX = margin + (viewW - drawW) / 2;
    const imgY = y + (viewH - drawH) / 2;

    doc.addImage(layoutImageDataUrl, "PNG", imgX, imgY, drawW, drawH);

    y += viewH + 4;
  }

  doc.setFontSize(7);
  const legendY = y;
  const legendItems: { label: string; color: number[] }[] = [
    { label: "Wall", color: [55, 65, 81] },
    { label: "Base Cabinet", color: [...hexToRgb("#3B82F6")] },
    { label: "Wall Cabinet", color: [...hexToRgb("#22C55E")] },
    { label: "Tall Cabinet", color: [...hexToRgb("#A855F7")] },
  ];
  if (openings.some((o) => o.type === "door")) {
    legendItems.push({ label: "Door", color: [...hexToRgb(OPENING_STYLES.door.stroke)] });
  }
  if (openings.some((o) => o.type === "window")) {
    legendItems.push({ label: "Window", color: [...hexToRgb(OPENING_STYLES.window.stroke)] });
  }
  let lx = margin;
  legendItems.forEach((item) => {
    const c = item.color;
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(lx, legendY - 2, 3, 3, "F");
    doc.setTextColor(80, 80, 80);
    doc.text(item.label, lx + 5, legendY);
    lx += 33;
  });
  y += 8;

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text("Cost Estimation", margin, y);
  y += 6;

  const colX = [margin, margin + contentWidth * 0.25, margin + contentWidth * 0.45, margin + contentWidth * 0.65, margin + contentWidth * 0.82];
  const headers = ["Layer", "Qty", "Depth×Height", "Finish", "Subtotal"];

  doc.setFillColor(242, 242, 247);
  doc.rect(margin, y - 3.5, contentWidth, 6, "F");

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100, 100, 100);
  headers.forEach((h, i) => doc.text(h, colX[i], y));
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(50, 50, 50);

  let total = 0;

  const uniqueTypes = [...new Set(layers.map((l) => l.type))];
  const priceMatrices: Record<string, any[]> = {};
  for (const t of uniqueTypes) {
    priceMatrices[t] = await fetchPriceMatrix(t);
  }

  for (let idx = 0; idx < layers.length; idx++) {
    const layer = layers[idx];
    const isCountType = layer.type === "end_panel" || layer.type === "filler" || layer.type === "drawer";
    const isIsland = layer.type === "island";

    const layerCabinets = cabinets.filter((c) => c.layerId === layer.id || layer.cabinetIds.includes(c.id));
    const effLengths = computeEffectiveLengths(layerCabinets, walls, layer.depth ?? undefined);
    const lengthM = layerCabinets.reduce((sum, c) => {
      const effPx = effLengths.get(c.id) ?? 0;
      return sum + pixelsToCm(effPx) / 100;
    }, 0);
    const effectiveDepth = isIsland && layerCabinets.length > 0
      ? pixelsToCm(layerCabinets[0].depth)
      : (layer.depth ?? 0);

    const matrix = priceMatrices[layer.type] ?? [];
    const priceEntry = matrix.find((m: any) => m.depth === effectiveDepth && m.height === (layer.height ?? 0));
    const pricePerUnit = priceEntry ? parseFloat(priceEntry.pricePerUnit) : 0;

    const layerFinish = finishing.find((f: any) => f.id === layer.finishId);
    const multiplier = layerFinish ? parseFloat(layerFinish.multiplier) : 1;

    const qty = isCountType ? (layer.qty ?? 0) : lengthM;
    const subtotal = pricePerUnit * qty * multiplier;
    total += subtotal;

    if (idx % 2 === 1) {
      doc.setFillColor(250, 250, 252);
      doc.rect(margin, y - 3.5, contentWidth, 5.5, "F");
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(50, 50, 50);

    doc.text(cabinetLabels[layer.type] || layer.type, colX[0], y);
    doc.text(isCountType ? `${layer.qty ?? 0} pcs` : `${lengthM.toFixed(2)} m`, colX[1], y);
    doc.text(`${effectiveDepth}×${layer.height ?? 0} cm`, colX[2], y);
    doc.text(layerFinish?.label ?? "—", colX[3], y);

    doc.setFont("helvetica", "bold");
    doc.text(`${subtotal.toFixed(0)} ${currency}`, colX[4], y);
    y += 5.5;
  }

  if (layers.length === 0) {
    doc.setTextColor(150, 150, 150);
    doc.text("No layers configured", margin, y);
    y += 5;
  }

  y += 2;
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text("Total Estimated Price:", margin, y);

  doc.setFontSize(12);
  doc.setTextColor(37, 99, 235);
  const totalText = `${total.toFixed(0)} ${currency}`;
  doc.text(totalText, pageWidth - margin, y, { align: "right" });

  const contentPdfBytes = doc.output("arraybuffer");

  const letterheadBytes = await fetch(letterheadUrl).then(r => r.arrayBuffer());
  const letterheadDoc = await PDFDocument.load(letterheadBytes);
  const contentDoc = await PDFDocument.load(contentPdfBytes);

  const outputDoc = await PDFDocument.create();

  const [letterheadEmbed] = await outputDoc.embedPages(letterheadDoc.getPages());
  const [contentEmbed] = await outputDoc.embedPages(contentDoc.getPages());

  const a4Width = 595.28;
  const a4Height = 841.89;

  const page = outputDoc.addPage([a4Width, a4Height]);

  page.drawPage(letterheadEmbed, { x: 0, y: 0, width: a4Width, height: a4Height });
  page.drawPage(contentEmbed, { x: 0, y: 0, width: a4Width, height: a4Height });

  const pdfBytes = await outputDoc.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  const filename = projectName
    ? `NIVRA-${projectName.replace(/\s+/g, "-")}.pdf`
    : "NIVRA-Kitchen-Layout.pdf";
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
