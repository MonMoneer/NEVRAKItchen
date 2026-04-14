# URGENT FIX: Wall Drawing Does Not Chain

## Problem

The Cowork test report found that wall drawing only creates ONE wall then stops. The user cannot draw a multi-wall room (L-shape, rectangle, etc.) because the wall tool does not auto-continue from the endpoint of the last wall.

## What Happens Now

1. User selects Wall tool
2. Clicks to start wall, moves mouse, types length, presses Enter
3. First wall appears correctly (450cm)
4. User tries to draw second wall from the endpoint — NOTHING HAPPENS
5. All subsequent walls fail to appear

## What Should Happen

After a wall is drawn (either by clicking second point or pressing Enter with a length):
1. The wall is created and added to the canvas
2. The drawing tool should AUTOMATICALLY start a new wall from the END POINT of the wall just drawn
3. The user can immediately move mouse in a new direction and draw the next wall
4. This continues until the user presses Escape or switches tools
5. If the new wall endpoint is near the START of the first wall (within SNAP_RADIUS), auto-close the room shape

## Where to Look

File: `client/src/components/kitchen/DesignerCanvas.tsx`

In the wall drawing completion logic (inside `handleMouseDown` or `createElementAtPoints`), after a wall is successfully created:

```typescript
// After creating the wall, set the startPoint to the new wall's endpoint
// so the next click continues the chain
onDrawingStateChange((prev) => ({
    ...prev,
    startPoint: finalEnd,  // NOT null — keep drawing from the end
    previewPoint: finalEnd,
    isDrawing: true,        // Stay in drawing mode
}));
```

Currently the code probably sets `startPoint: null` and `isDrawing: false` after each wall, which kills the chain.

## Also Check

- `handleDimensionConfirm` — when user types a length and presses Enter for a wall, it should also chain to the next wall
- Make sure `showDimensionInput` stays true for the next wall
- Make sure the snap indicator shows at the new wall's endpoint

## Priority

This MUST be fixed before any of the 9 planned fixes. Without wall chaining, the entire app is unusable — no rooms can be drawn.

## Test After Fix

1. Draw 4 walls forming a rectangle — all should chain automatically
2. Draw 6 walls forming an L-shape — each wall starts from the previous endpoint
3. Press Escape mid-chain — drawing stops
4. Last wall snaps to first wall start point — room closes
5. Verify the room polygon is detected (needed for inner-face calculations later)
