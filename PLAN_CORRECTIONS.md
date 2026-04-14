# 3 Corrections to the Fix Plan — Apply Before Executing

## Correction 1: Step 4 (FIX 1) — Doors/Windows MUST also be offset

The code `if (tool !== 'wall' && parentWallId)` correctly covers doors and windows too. But make sure to TEST this explicitly:

After applying Step 4, verify:
- Place a door on a wall → door sits on inner face
- Place a cabinet starting from that door edge → cabinet edge touches door edge with ZERO gap
- Both door AND cabinet must be on the SAME inner face line

If doors stay on center line while cabinets move to inner face, you'll get a gap of WALL_THICKNESS/2 between them. Both must be offset equally.

---

## Correction 2: Step 5 (FIX 3) — Do NOT add a separate 'selectingAnchor' phase

The plan adds a new `selectingAnchor` phase to `WallPlacementPhase`. This changes the flow from 2 clicks to 3 clicks (hover → click anchor → set offset → set length). This will confuse NIVRA's salespeople.

Instead, do this:
- Keep the CURRENT click flow (click wall → settingOffset → settingLength)
- When user clicks on a wall, CHECK if the click is within SNAP_RADIUS of any anchor point from `getWallAnchorPoints()`
- If YES → use that anchor as `referenceEndpoint`
- If NO → fallback to nearest wall endpoint (current behavior)
- Same number of clicks, smarter selection

So do NOT add 'selectingAnchor' to WallPlacementPhase. Keep it as: 'idle' | 'settingOffset' | 'settingLength'.

The anchor point VISUAL MARKERS (Step 6) still render on hover — the user sees them, but clicks directly into settingOffset phase using the nearest anchor.

---

## Correction 3: Step 9 (FIX 6) — Add screenshot capture BEFORE switching stage

The plan handles showing the locked reference image, but doesn't specify WHEN the screenshot is captured. Add this:

In `project-detail.tsx`, when the user clicks "Advance to Site Measurement":

1. BEFORE changing the project stage, capture the canvas screenshot:
```typescript
// Get Konva stage reference
const dataUrl = konvaStageRef.current?.toDataURL({ pixelRatio: 2 });
if (dataUrl && activeSpaceId) {
  // Save as referenceImage on the active space
  await fetch(`/api/spaces/${activeSpaceId}/reference`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ referenceImage: dataUrl }),
  });
}
```

2. THEN advance the project stage to 'site_measurement'

3. Do this for EACH space in the project (loop through all spaces, capture each canvas)

Without this step, there's no reference image to show in site measurement mode. The `/api/spaces/:id/reference` endpoint already exists in routes.ts (line 262).

---

## Updated Verification Checklist (add these 3 items)

After the original 12 items, also verify:
- [ ] Door on wall sits on inner face (same line as cabinets)
- [ ] Clicking wall near door edge auto-selects door edge as anchor (no extra click needed)
- [ ] Advancing to site measurement captures and shows reference screenshot
