# Shift Inversion + Sidebar Accordion + Calculator Keypad — Design Spec

**Date:** 2026-04-04
**Status:** Approved for implementation
**Areas:** `client/src/components/kitchen/DesignerCanvas.tsx`, `client/src/components/kitchen/Toolbar.tsx`, new `Keypad.tsx` + `expression-evaluator.ts`

---

## 1. Problem

Two usability issues blocking tablet use:

1. **Shift is held for ortho snap.** To get a clean 90° drag, user must hold Shift while also typing numbers in the dimension panel. Releasing Shift to type flips the ghost off-angle. This is backwards from standard CAD behavior.
2. **No number keypad for tablet.** The app will run on tablets where no system keyboard is available. Number inputs (dimensions, distances) cannot be used.

## 2. Goals

- **Goal A**: Ortho-lock is the default; Shift unlocks to free angle.
- **Goal B**: Sidebar becomes tablet-friendly: 3 collapsible sections (accordion) + on-screen calculator keypad that targets any focused number input and evaluates arithmetic expressions.

## 3. Part A — Shift Inversion

### 3.1 Current behavior
- `shiftHeldRef.current === true` → apply ortho snap (wall-relative or axis).
- `shiftHeldRef.current === false` → free angle.

### 3.2 New behavior
- `shiftHeldRef.current === false` (default) → apply ortho snap.
- `shiftHeldRef.current === true` → free angle.

### 3.3 Sites to flip (all in `DesignerCanvas.tsx`)

| Site | Purpose | Snap reference |
|---|---|---|
| Island Cabinet `settingDL` ghost + click-commit + `onCommitField` | Deep Length angle | wall-relative 4-cardinal |
| Island Cabinet `settingCL` ghost + click-commit + `onCommitField` | Cabinet Length angle | wall-relative 4-cardinal |
| Wall drawing preview (`renderPreview`) | Wall direction | world H/V |
| Measure tape preview + commit | Tape segment direction | world H/V |

Island Cabinet `settingCD` is 1D perpendicular to CL — Shift is a no-op regardless, so no change needed there.

### 3.4 Visual indicator
No change to ghost rendering. Existing cross-hair showing snap axes stays the same, but now appears when Shift is **NOT** held (the default). When Shift is held the snap indicators hide and the ghost follows raw mouse.

### 3.5 Implementation
One-character change per site: `shiftHeldRef.current` → `!shiftHeldRef.current`. No new state. Comment each site: `// Shift INVERTS ortho: default snaps; hold Shift for free angle`.

## 4. Part B — Sidebar Accordion

### 4.1 Current layout
```
NIVRA Kitchen header
  BASIC section (always visible): Select/Move, Pan, Measure, Delete
  ARCHITECTURE section (always visible): Wall, Door, Window
  KITCHEN section (always visible): Base, Wall Cab, Tall, Island
  OPTIONS section (always visible): Snap, Grid, Unit
```

### 4.2 New layout
```
NIVRA Kitchen header
  Toggle strip (3 icon buttons): Snap | Grid | Unit       [always visible]
  ─────────────────────────────────────────────────────
  ▸ BASIC              [collapsed by default]
  ▸ ARCHITECTURE       [collapsed by default]
  ▸ KITCHEN            [collapsed by default]
  ─────────────────────────────────────────────────────
  Calculator keypad (fills remaining vertical space)
```

### 4.3 Behavior
- **All three sections collapsed by default** on first load.
- **Accordion mode**: opening one section closes the other two.
- **Persisted**: last open section (or null) stored in `localStorage` key `nivra.sidebar.openSection`. Valid values: `"basic" | "architecture" | "kitchen" | null`.
- **Section header**: clickable row with name + chevron icon (`▸` collapsed, `▾` expanded). Chevron rotates 90° on state change.
- **Contents**: unchanged from current implementation — just wrapped in a collapsible container.

### 4.4 Toggle strip
The Snap/Grid/Unit buttons move to a compact row at the top of the sidebar (just under the "NIVRA Kitchen" header). Each becomes a ~32×32px icon button with tooltip. No text labels — just icon + tooltip. Active state shown by filled background.

### 4.5 OPTIONS section
Removed entirely. Its contents migrate to the toggle strip.

## 5. Part C — Calculator Keypad

### 5.1 Layout

4-column × 5-row button grid, each button ~48×44px (tablet-friendly touch targets):

```
┌──────┬──────┬──────┬──────┐
│  C   │  ÷   │  ×   │  CE  │
├──────┼──────┼──────┼──────┤
│  7   │  8   │  9   │  −   │
├──────┼──────┼──────┼──────┤
│  4   │  5   │  6   │  +   │
├──────┼──────┼──────┼──────┤
│  1   │  2   │  3   │      │
├──────┼──────┼──────┤  =   │
│  %   │  0   │  .   │      │
└──────┴──────┴──────┴──────┘
```

`=` spans rows 4-5 on the right. Dark background for `=`. Operators (`÷ × − + % =`) amber/orange accent. Digits + `.` neutral. `C` muted red. `CE` muted.

### 5.2 Display strip

Above the button grid:

```
┌──────────────────────────────┐
│                      20+40   │ ← expression line (text-sm, right-aligned)
│                    = 60.00   │ ← preview line  (text-xs, muted, right-aligned)
└──────────────────────────────┘
```

- **Expression line**: what the user is typing.
- **Preview line**: live evaluation result. Shows `= <result>` when valid, `= —` when invalid/empty.
- When a number input is focused, the display mirrors that input's value instead of the scratchpad.
- Height: fixed ~44px (two lines).

### 5.3 Key semantics

| Key label | Sends | Action when pressed |
|---|---|---|
| `0`-`9` | digit | Append to expression |
| `.` | `.` | Append. Prevents double decimals in the current operand. |
| `+ − × ÷` | `+ - * /` | Append operator. Prevents consecutive operators (replace). |
| `%` | `%` | Append `%` as a suffix operator on the preceding number: `N%` → `N/100` (e.g. `10%` = `0.1`, so `200*10%` = `20`). Not the modulo operator. |
| `CE` | — | Delete last character (backspace). |
| `C` | — | Clear entire expression. |
| `=` | — | Evaluate. Transfer result to focused input or scratchpad. |

### 5.4 Target modes

| State | Keypad behavior |
|---|---|
| **A number input is focused** | Each press appends/modifies that input's value directly via synthetic input events. Display mirrors the input's value. `=` evaluates input's value and replaces. |
| **No number input focused (scratchpad mode)** | Keypress goes to internal scratchpad state. Display shows scratchpad. When user focuses any number input, scratchpad auto-transfers to it and clears. |

### 5.5 Auto-transfer on focus

- When the user focuses a number input (listener: global `focusin` event filtered to `input[type="number"]`), the keypad checks if its scratchpad has a value and, if so, writes it to that input (same transfer mechanism as `=`) and clears the scratchpad.
- The scratchpad persists indefinitely until (a) auto-transferred on input focus or (b) user presses `C`.

### 5.6 Input-writing mechanism

For React-controlled inputs, dispatching a native `input` event is not enough — React tracks values via its own cached value. Use the proven React-internals-safe technique:

```ts
const setNativeValue = (el: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;
  if (valueSetter) valueSetter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
```

This works for all React-controlled inputs in the app.

### 5.7 Expression evaluator

Pure function, no `eval()`. Supports:
- Operators: `+ - * / %`
- Standard precedence: `%` → `* /` → `+ -`
- Decimal numbers (`1.5`, `.5`)
- `N%` token = `N/100`
- No parentheses, no functions, no variables

```ts
export function evaluateExpression(expr: string): number | null;
```

Returns `null` for invalid expressions (unbalanced, double operators, leading operator other than `-`, division by zero).

### 5.8 Enter key behavior in focused input
When an input has focus and user presses `=` on the keypad (or `Enter` on external keyboard), the current value is evaluated. If the input already held a plain number, it stays the same. If it held `20+40`, it becomes `60`.

## 6. Component architecture

```
Toolbar.tsx  (existing, modified)
  ├── Header ("NIVRA Kitchen")
  ├── <ToggleStrip /> (new inline: Snap/Grid/Unit icons)
  ├── <Accordion>
  │     ├── AccordionSection("basic", ...)
  │     ├── AccordionSection("architecture", ...)
  │     └── AccordionSection("kitchen", ...)
  └── <Keypad /> (new)

Keypad.tsx (new)
  ├── DisplayStrip (expression + preview)
  └── ButtonGrid (17 buttons)

expression-evaluator.ts (new, pure)
  └── evaluateExpression(expr: string): number | null
```

## 7. Sidebar persistence

Use a small helper to avoid bugs:

```ts
type AccordionKey = 'basic' | 'architecture' | 'kitchen' | null;
const KEY = 'nivra.sidebar.openSection';
const loadOpen = (): AccordionKey => {
  const v = localStorage.getItem(KEY);
  return (v === 'basic' || v === 'architecture' || v === 'kitchen') ? v : null;
};
const saveOpen = (k: AccordionKey) => {
  if (k === null) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, k);
};
```

## 8. Files to change

| File | Change |
|---|---|
| `client/src/components/kitchen/DesignerCanvas.tsx` | 4 sites × `shiftHeldRef.current` → `!shiftHeldRef.current` + comments |
| `client/src/components/kitchen/Toolbar.tsx` | Wrap Basic/Architecture/Kitchen in accordion; move Snap/Grid/Unit to top toggle strip; remove OPTIONS section; mount `<Keypad />` at bottom |
| `client/src/components/kitchen/Keypad.tsx` **(new)** | Keypad UI + display + scratchpad state + `document.activeElement` targeting |
| `client/src/lib/expression-evaluator.ts` **(new)** | Pure arithmetic parser |
| No store / schema / route changes | — |

## 9. Testing checklist

**Shift inversion**
- [ ] Wall draw: mouse drags diagonally → snaps to H/V by default; hold Shift → free angle
- [ ] Measure tape: same
- [ ] Island settingDL: ortho relative to wall by default; Shift frees angle
- [ ] Island settingCL: ortho relative to wall by default; Shift frees angle
- [ ] Diagonal wall (30°): DL/CL snap to 30°/120°/210°/300° by default
- [ ] Typing WL in panel while NOT holding Shift → ghost stays on ortho angle (fixes original bug)

**Sidebar accordion**
- [ ] First visit: all 3 sections collapsed
- [ ] Click "Basic" → expands, others stay collapsed
- [ ] Click "Architecture" → Basic auto-collapses, Architecture opens
- [ ] Reload page → last-open section restored
- [ ] Click currently-open section header → closes it, no section open, persisted
- [ ] Snap/Grid/Unit icons work identically to current toggles

**Keypad**
- [ ] Type `20+40` in scratchpad → display shows `20+40` and `= 60`
- [ ] Focus any number input → scratchpad transfers value into input, clears
- [ ] Focus an input, press `7`+`5` → input value becomes `75`
- [ ] Focus an input containing `10+5`, press `=` → input becomes `15`
- [ ] Press `CE` on `123` → becomes `12`
- [ ] Press `C` on `20+40` → clears display
- [ ] Invalid expression `5++` → preview shows `—`, `=` does nothing
- [ ] Division by zero `5/0` → preview `—`, `=` does nothing
- [ ] `200*10%` → evaluates to `20` (10% = 0.1)
- [ ] Decimal `.5+1` → `1.5`
- [ ] Double operator blocked: typing `+` then `-` replaces (stays `-`)
- [ ] Double decimal blocked in same operand: typing `.` twice no-ops the second
- [ ] Island panel WL field: keypad types into it, `=` evaluates
- [ ] Wall-placement dimension input: keypad targets it when focused
- [ ] Admin/CRM number inputs: keypad also targets them

## 10. Out of scope

- Drag-to-resize sidebar width
- Keypad resize / drag-to-move
- Memory buttons (M+, M-, MR)
- Parentheses / advanced math
- Unit-aware evaluation (e.g. auto-convert `cm`/`m` in expressions) — user still chooses unit via toggle
- Keyboard shortcut for toggling sidebar sections
- Multi-select / copy from display strip

## 11. Risks

- **React controlled-input value write**: the native-setter hack is fragile across React versions. If React 19 changes internals, this breaks. Mitigation: keep the helper isolated in `Keypad.tsx`; easy to swap.
- **Scratchpad stale-transfer**: user types `100` in scratchpad, walks away, hours later focuses an input — `100` transfers unexpectedly. Mitigation: scratchpad shown prominently in display; user can press `C` or wait. (User accepted this risk in Q3.)
- **Keypad vertical space on short viewports**: laptop screens at 720px may see keypad below fold. Mitigation: sidebar is scrollable; keypad is scrollable within sidebar if needed.
