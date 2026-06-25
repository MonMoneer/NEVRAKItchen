import type {
  TimelineData,
  TimelineItem,
  TimelinePhase,
} from "@shared/schema";

// Renders the client-facing "Delivery Schedule & Payment Plan" page from stored
// data. The visual design (CSS) and the self-advancing TODAY-marker logic (JS)
// live in /client/public/timeline-assets/{timeline.css,timeline.js}; this module
// only generates the data-driven markup + the countdown milestones.
//
// Per-request "today" stamping: phase/step state (done/active/past) is computed
// server-side against `new Date()`, so each page open reflects the current day.
// The JS keeps the marker/countdown live within an open session.

function esc(s: string | undefined | null): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startMs(iso: string): number | null {
  if (!iso) return null;
  const t = new Date(iso + "T00:00:00").getTime();
  return isNaN(t) ? null : t;
}
function endMs(iso: string): number | null {
  if (!iso) return null;
  const t = new Date(iso + "T23:59:59").getTime();
  return isNaN(t) ? null : t;
}

function pillWord(status: string, fallbackLabel?: string): string {
  if (fallbackLabel) return fallbackLabel;
  if (status === "paid") return "✓ Paid";
  if (status === "due") return "Due";
  return "Pending";
}

// Bold the leading "Day N" of an installation chip, like the source design.
function renderDayChip(text: string): string {
  const m = /^(Day\s*\d+)\s*(.*)$/.exec(text.trim());
  if (m) return `<span class="day"><b>${esc(m[1])}</b> ${esc(m[2])}</span>`;
  return `<span class="day">${esc(text)}</span>`;
}

function dateAttrs(start: string, end: string): string {
  if (!start && !end) return "";
  return ` data-start="${esc(start)}" data-end="${esc(end || start)}"`;
}

function renderItem(item: TimelineItem, now: number): string {
  if (item.kind === "transit") {
    return `<div class="transit"><span>⛵</span><div>${esc(item.text)}</div></div>`;
  }

  if (item.kind === "payment") {
    return `<div class="payment" data-status="${esc(item.status)}"${dateAttrs(item.start, item.end)}>
        <div class="payment-main">
          <div class="payment-eyebrow">${esc(item.eyebrow)}</div>
          <div class="payment-amount" style="font-family: Poppins; font-size: 24px">${esc(item.amount)}</div>
          ${item.detail ? `<div class="payment-detail">${esc(item.detail)}</div>` : ""}
        </div>
        <div class="payment-status-col">
          <div class="payment-when">${esc(item.when)}</div>
          <div class="pill pill-${esc(item.status)}">${esc(pillWord(item.status, item.pillLabel))}</div>
        </div>
      </div>`;
  }

  // step | days — both render as a step row; "days" adds chips.
  const end = endMs(item.end || item.start);
  const past = end != null && now > end;
  const chips =
    item.kind === "days" && item.days.length
      ? `<div class="days">${item.days.map(renderDayChip).join("")}</div>`
      : "";
  return `<div class="step${past ? " past" : ""}"${dateAttrs(item.start, item.end)}>
      <div class="step-body">
        <div class="step-title">${esc(item.title)}</div>
        ${item.detail ? `<div class="step-detail">${esc(item.detail)}</div>` : ""}
        ${chips}
      </div>
      <div class="step-date">${esc(item.dateLabel)}</div>
    </div>`;
}

function phaseState(phase: TimelinePhase, now: number): string {
  const starts: number[] = [];
  const ends: number[] = [];
  for (const it of phase.items) {
    if (it.kind === "transit") continue;
    const s = startMs(it.start);
    const e = endMs(it.end || it.start);
    if (s != null) starts.push(s);
    if (e != null) ends.push(e);
  }
  if (!ends.length) return "";
  if (now > Math.max(...ends)) return "done";
  if (starts.length && now >= Math.min(...starts)) return "active";
  return "";
}

function renderPhase(
  phase: TimelinePhase,
  now: number,
  completionHtml: string,
): string {
  return `<div class="phase" data-state="${phaseState(phase, now)}">
      <div class="phase-marker"></div>
      <div class="phase-head">
        <div class="phase-num">${esc(phase.num)}</div>
        <div class="phase-title">${esc(phase.title)}</div>
        ${phase.sub ? `<div class="phase-sub">${esc(phase.sub)}</div>` : ""}
      </div>
      ${phase.items.map((it) => renderItem(it, now)).join("\n")}
      ${completionHtml}
    </div>`;
}

// Countdown milestones: every dated item, labelled by its title/eyebrow.
function buildMilestones(data: TimelineData): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = [];
  for (const phase of data.phases) {
    for (const it of phase.items) {
      if (it.kind === "transit") continue;
      const date = it.start;
      if (!date) continue;
      const label =
        it.kind === "payment" ? it.eyebrow.toLowerCase() : it.title.toLowerCase();
      out.push({ date, label });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function renderTimeline(data: TimelineData): string {
  const now = Date.now();
  const initial = (data.client.name || "•").trim().charAt(0).toUpperCase() || "•";

  const completion = `<div class="completion">
        <div>
          <div class="completion-eyebrow">Estimated project completion</div>
          <div class="completion-title">${esc(data.completion.title)}</div>
        </div>
        <div class="completion-date">
          <div class="completion-date-big">${esc(data.completion.dateBig)}</div>
          <div class="completion-date-sub">${esc(data.completion.dateSub)}</div>
        </div>
      </div>`;

  const phasesHtml = data.phases
    .map((p, i) =>
      renderPhase(p, now, i === data.phases.length - 1 ? completion : ""),
    )
    .join("\n");

  const summaryCells = data.summary.payments
    .map((p) => {
      const color =
        p.status === "paid"
          ? "var(--paid)"
          : p.status === "due"
            ? "var(--due)"
            : "var(--mid)";
      return `<div class="summary-cell">
          <div class="summary-cell-label">${esc(p.label)}</div>
          <div class="summary-cell-amount" style="font-family: Poppins; font-size: 24px">${esc(p.amount)}</div>
          <div class="summary-cell-status" style="color:${color};">${esc(p.when)} &nbsp;·&nbsp; ${esc(pillWord(p.status))}</div>
        </div>`;
    })
    .join("\n");

  const milestonesJson = JSON.stringify(buildMilestones(data));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(data.title || "Project Schedule")} · NIVRA</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/timeline-assets/timeline.css">
</head>
<body>
<div class="actions">
  <button class="btn" onclick="window.print()" title="Print or save as PDF">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/></svg>
    Print / PDF
  </button>
</div>

<div class="page" data-theme="${esc(data.theme)}" id="page">
  <div class="content">

    <div class="meta-strip">
      <img src="/timeline-assets/nivra-logo.png" alt="NIVRA" class="crest-logo">
      <div class="doc-ref">${esc(data.docRef)}${data.issuedDate ? ` &nbsp;·&nbsp; Issued ${esc(data.issuedDate)}` : ""}</div>
    </div>

    <div class="eyebrow">${esc(data.eyebrow)}</div>
    <h1 class="title">${esc(data.title)}</h1>
    ${data.subtitle ? `<p class="subtitle">${esc(data.subtitle)}</p>` : ""}

    <div class="head-rule"></div>

    <div class="today-bar">
      <div class="today-bar-left">
        <span class="today-dot"></span>
        <div>
          <div class="today-label">Where we are today</div>
          <div class="today-date" id="todayDate">&mdash;</div>
        </div>
      </div>
      <div class="countdown">
        <div class="countdown-num" id="countdownNum">&mdash;</div>
        <div class="countdown-label" id="countdownLabel"></div>
      </div>
    </div>

    <div class="client">
      <div class="client-head">
        <div class="avatar">${esc(initial)}</div>
        <div>
          <div class="client-name">${esc(data.client.name)}</div>
          <div class="client-tag">${esc(data.client.tag)}</div>
        </div>
      </div>
      <div class="client-grid">
        <div class="client-cell"><div class="cell-label">Phone</div><div class="cell-value">${esc(data.client.phone)}</div></div>
        <div class="client-cell"><div class="cell-label">Delivery address</div><div class="cell-value">${esc(data.client.address)}</div></div>
        <div class="client-cell"><div class="cell-label">Project value</div><div class="cell-value">${esc(data.client.projectValue)}</div></div>
        <div class="client-cell"><div class="cell-label">Approval</div><div class="cell-value">${esc(data.client.approval)}</div></div>
      </div>
    </div>

    ${data.note ? `<div class="note">${esc(data.note)}</div>` : ""}

    <div class="timeline" id="timeline">
      <div class="rail" id="rail"></div>
      <div class="now-marker" id="nowMarker"></div>
      ${phasesHtml}
    </div>

    ${
      data.summary.payments.length
        ? `<div class="summary">
      <div class="summary-title">Payment Summary${data.summary.total ? ` &nbsp;·&nbsp; ${esc(data.summary.total)} Total` : ""}</div>
      <div class="summary-grid">
        ${summaryCells}
      </div>
      ${data.footer ? `<div class="footer">${esc(data.footer)}</div>` : ""}
    </div>`
        : ""
    }
  </div>
</div>

<script>window.__MILESTONES = ${milestonesJson};</script>
<script src="/timeline-assets/timeline.js"></script>
</body>
</html>`;
}

export function renderTimelineNotFound(): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Schedule not found</title>
<style>body{font-family:system-ui,sans-serif;background:#EFEDE7;color:#4A4844;display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:24px}h1{font-weight:500;color:#1F1E1B}</style>
</head><body><div><h1>Schedule not available</h1><p>This link is invalid or has been removed. Please contact NIVRA.</p></div></body></html>`;
}
