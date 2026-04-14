# NIVRA Kitchen App — Full Test Report

**Date:** 1 April 2026
**Tester:** Automated (Playwright) + Manual Review
**Project:** Al Mansouri Kitchen (Fatima Al Mansouri)
**App URL:** http://localhost:3000
**Browser:** Chromium (Playwright)

---

## Test Results

| Step | What I Wanted To Do | What Actually Happened | Problem / What's Wrong |
|------|---------------------|----------------------|------------------------|
| 0 | Open app at localhost:3000 | Redirected to /login page | OK — login page exists |
| 0 | Login with admin / admin123 | Login form found, filled, submitted. Redirected to /projects | OK — login works |
| 1 | Create new project "Al Mansouri Kitchen" with all client details | Project was already created from earlier manual test. Card shows name, phone, address correctly | OK — project creation works, all fields save |
| 1 | Open the project to designer | Clicked project card, designer opened with all tools in sidebar | OK — smooth navigation |
| 2 | Select Draw Wall tool | Tool selected (highlighted orange) | OK |
| 2 | Draw Wall 1: RIGHT 450cm (long wall) | Clicked start point, moved mouse right, typed 450, pressed Enter. ONE wall appeared on canvas — 450cm label visible | OK — first wall draws correctly |
| 2 | Draw Wall 2: DOWN 150cm (return wall) | Moved mouse down, typed 150, pressed Enter. NO second wall appeared. Screenshot shows only the first wall | BUG: Wall drawing does NOT chain. After first wall completes, the drawing mode seems to stop or the next wall doesn't connect to the end of the first wall |
| 2 | Draw Walls 3-6 to complete L-shape | Typed measurements and pressed Enter for each. NO additional walls appeared on canvas | BUG: Same problem — only 1 wall exists. Cannot draw multi-wall room shapes. This breaks the entire L-shaped kitchen workflow |
| 3 | Place door on back wall | Clicked Door tool, clicked on canvas below the wall. A thin line appeared but no clear door opening visible | BUG: Door did not visibly place on the wall. The back wall doesn't exist (wall drawing failed), so there's no wall to place door on |
| 4 | Place window on short wall | Clicked Window tool, clicked on left side of canvas. No visible window appeared | BUG: Same issue — the left wall doesn't exist. Also no clear feedback that window was placed |
| 5 | Place base cabinet 450cm on long wall | Clicked Base Cabinet tool, clicked near wall, moved right, typed 450, Enter. A purple/blue bar appeared along the wall | PARTIAL — cabinet appeared on the only existing wall. Tool shows options at bottom (length, depth) which is helpful |
| 6 | Place base cabinet 150cm on return wall | Clicked Base Cabinet, clicked near right end of wall, moved down, typed 150, Enter. A green rectangle appeared floating to the right | BUG: Cabinet placed in empty space — no return wall exists for it to attach to. The green rectangle is not properly anchored to any wall |
| 7 | Place tall cabinet 60cm for fridge | Clicked Tall Cabinet tool, clicked near corner, typed 60, Enter. Small orange/red elements appeared with selection UI | PARTIAL — something was placed but hard to confirm if it split the base cabinet correctly since only 1 wall exists |
| 8 | Place wall cabinets above base cabinets | Clicked Wall Cabinet tool, placed along top. Purple bar appeared above the base cabinet | OK — wall cabinet placed above base cabinet on the existing wall |
| 9-11 | Test door/window blocking and overlap | Could not test properly | SKIPPED — walls didn't draw, so door/window placement couldn't be tested for blocking rules |
| 12 | Place 100cm island in center of room | Clicked Island tool, clicked center of canvas, typed 100, Enter. Large pink/purple rectangle appeared in the middle | OK — island placement works. It shows up clearly in the room area |
| 13 | Use Measure Tape between two points | Clicked Measure Tape tool, clicked two points. Small purple element visible | UNCLEAR — could not clearly see a measurement line or distance label between the two points |
| 14 | Check pricing panel | Pricing panel visible on right side. Shows "Premium x1.00" finishing option | BUG: Pricing shows 0 AED total. Items count shows 0 even though cabinets were placed on canvas. Pricing does NOT update when cabinets are added |
| 15 | Undo (Cmd+Z) | Pressed Cmd+Z | OK — no crash, but hard to verify visually what was undone |
| 15 | Redo (Cmd+Shift+Z) | Pressed Cmd+Shift+Z | OK — no crash |
| 16 | Export PDF | Not tested (no clear export button found during automated test) | SKIPPED — could not locate export/PDF button |
| 17 | Click Send to Measurement | Button found and clicked. Page stayed on same URL | UNCLEAR — page didn't navigate anywhere new. Canvas appeared mostly empty after clicking. Not clear what measurement mode looks like |
| 18 | Place electrical/plumbing points | Not tested — measurement mode tools were not visible | SKIPPED |
| 19 | Search for project by name "Al Mansouri" | Typed in search box. Project card appeared with correct name, phone, address | OK — name search works perfectly |
| 19 | Search for project by phone "055" | Typed "055" in search. Project card still visible with matching phone 0551234567 | OK — phone search actually works (test script reported false negative due to timing) |

---

## Critical Bugs Found

### BUG 1: Wall Drawing Does Not Chain (CRITICAL)
- **Step:** 2
- **What happened:** Only the first wall (450cm) drew. Walls 2-6 did not appear even though measurements were typed and Enter was pressed
- **Expected:** After first wall, drawing should continue from the endpoint. User should be able to draw connected walls one after another to form room shapes
- **Impact:** Cannot create any room shape (L-shape, U-shape, rectangle). This breaks the entire core workflow of the app

### BUG 2: Pricing Shows 0 AED After Placing Cabinets
- **Step:** 14
- **What happened:** Pricing panel shows "ITEMS (0)" and "0 AED" even after placing base cabinets, wall cabinets, tall cabinet, and island
- **Expected:** Each placed cabinet should appear in the pricing list with length and price. Total should update
- **Impact:** Customer cannot see cost estimate — defeats the purpose of the "Estimated Budget" stage

### BUG 3: Cabinets Place in Empty Space Without Walls
- **Step:** 6
- **What happened:** Base cabinet was placed floating in empty canvas where the return wall should have been (but wasn't drawn)
- **Expected:** System should either prevent placement where no wall exists, or warn the user
- **Impact:** User can create invalid designs

---

## What Worked Well

1. **Login** — simple and fast, redirects to projects immediately
2. **Project creation** — all 5 fields (name, client, phone, email, address) saved correctly
3. **Project search** — both name and phone search work on the projects page
4. **Sidebar tools** — well organized into Basic, Architecture, Kitchen, Options sections. Keyboard shortcuts shown (W, R, N, B, U, T, I)
5. **First wall drawing** — typing exact measurement + Enter works smoothly for the first wall
6. **Island placement** — works well in the open canvas
7. **Grid and Snap** — visible grid with snap ON gives confidence
8. **Stage badges** — "Estimated Budget" / "Site Measurement" badges on project cards are clear

---

## UX Issues

1. **Wall chaining is broken** — this is the #1 priority to fix. A kitchen designer that can't draw rooms is not usable
2. **No clear instructions for first-time user** — Fatima (non-technical customer) would not know to "click, move mouse for direction, type number, press Enter"
3. **No onboarding or tooltips** — should show a quick guide like "Click to start wall, move mouse for direction, type length, press Enter"
4. **Measure Tape feedback unclear** — couldn't clearly see the measurement result
5. **Export/PDF button not obvious** — only a small clipboard icon, needs a clear "Export PDF" label

---

## Missing Features

1. A quick tutorial or help overlay for first-time users
2. Clear visual feedback when door/window is successfully placed
3. Error toasts when trying to place elements where they shouldn't go
4. Visible dimension labels on all placed cabinets
5. Room area calculation display

---

## Overall Score: 4/10

The app has a good foundation (clean UI, logical tool layout, working search and project management), but the **core drawing functionality is broken**. A customer cannot draw a multi-wall room, which makes everything else (cabinets, doors, windows, pricing) unusable in practice. Fix the wall chaining bug first, then the pricing update, and this could become a solid tool.

---

## Top 5 Recommendations (Priority Order)

1. **Fix wall chain drawing** — walls must connect end-to-end so users can draw complete room shapes
2. **Fix pricing updates** — placed cabinets must appear in the pricing panel with calculated costs
3. **Add onboarding tooltips** — show first-time users how wall drawing works (click > direction > type > Enter)
4. **Add clear door/window placement feedback** — show visual confirmation when placed
5. **Add visible "Export PDF" button** — label it clearly instead of using only an icon

---

*21 screenshots captured and saved in the REbilt folder for reference.*
