const fs = require('fs');
const path = './src/components/kitchen/DesignerCanvas.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
`\t\t\t\t\tsetWallPlacement({
\t\t\t\t\t\tphase: 'settingOffset',
\t\t\t\t\t\ttool: (activeCustomTool || tool) as WallPlacementTool,
\t\t\t\t\t\twall,
\t\t\t\t\t\treferenceEndpoint: initPos,
\t\t\t\t\t\twallAngle,
\t\t\t\t\t\tcurrentOffsetPx: 0,
\t\t\t\t\t\tcurrentPosition: initPos,
\t\t\t\t\t});
\t\t\t\t\tsetShowDimensionInput(true);
\t\t\t\t\tconst offsetPos = wallPlacement.currentPosition;

\t\t\t\t\tif (
\t\t\t\t\t\twallPlacement.tool === 'electrical' ||
\t\t\t\t\t\twallPlacement.tool === 'plumbing'
\t\t\t\t\t) {
\t\t\t\t\t\tsetWallPointPlacement({
\t\t\t\t\t\t\ttype: wallPlacement.tool as
\t\t\t\t\t\t\t\t| 'electrical'
\t\t\t\t\t\t\t\t| 'plumbing',
\t\t\t\t\t\t\tphase: 'enterDistance', // Can bypass this phase UI with next step
\t\t\t\t\t\t\twall: wallPlacement.wall,
\t\t\t\t\t\t\treferenceEndpoint: wallPlacement.referenceEndpoint,
\t\t\t\t\t\t\tposition: offsetPos,
\t\t\t\t\t\t\tdistanceCm: pixelsToCm(
\t\t\t\t\t\t\t\tdistanceBetween(
\t\t\t\t\t\t\t\t\twallPlacement.referenceEndpoint,
\t\t\t\t\t\t\t\t\toffsetPos
\t\t\t\t\t\t\t\t)
\t\t\t\t\t\t\t),
\t\t\t\t\t\t});
\t\t\t\t\t\tsetShowWallPointForm(true);
\t\t\t\t\t\tsetWallPlacement(null);
\t\t\t\t\t\tsetShowDimensionInput(false);
\t\t\t\t\t\treturn;
\t\t\t\t\t}

\t\t\t\t\tif (wallPlacement.tool === 'island_base') {
\t\t\t\t\t\t// Transition to setting depth
\t\t\t\t\t\tsetWallPlacement((prev) =>
\t\t\t\t\t\t\tprev
\t\t\t\t\t\t\t\t? {
\t\t\t\t\t\t\t\t\t\t...prev,
\t\t\t\t\t\t\t\t\t\tphase: 'settingDepth',
\t\t\t\t\t\t\t\t\t\toffsetPosition: offsetPos,
\t\t\t\t\t\t\t\t\t\tcurrentPosition: offsetPos,
\t\t\t\t\t\t\t\t\t\tcurrentOffsetPx: 0,
\t\t\t\t\t\t\t\t  }
\t\t\t\t\t\t\t\t: null
\t\t\t\t\t\t);
\t\t\t\t\t\treturn;
\t\t\t\t\t}`,
`\t\t\t\t\tconst newWallPlacement: WallPlacementState = {
\t\t\t\t\t\tphase: 'settingOffset',
\t\t\t\t\t\ttool: (activeCustomTool || tool) as WallPlacementTool,
\t\t\t\t\t\twall,
\t\t\t\t\t\treferenceEndpoint: initPos,
\t\t\t\t\t\twallAngle,
\t\t\t\t\t\tcurrentOffsetPx: 0,
\t\t\t\t\t\tcurrentPosition: initPos,
\t\t\t\t\t};
\t\t\t\t\tsetWallPlacement(newWallPlacement);
\t\t\t\t\tsetShowDimensionInput(true);
\t\t\t\t\tconst offsetPos = newWallPlacement.currentPosition;

\t\t\t\t\tif (
\t\t\t\t\t\tnewWallPlacement.tool === 'electrical' ||
\t\t\t\t\t\tnewWallPlacement.tool === 'plumbing'
\t\t\t\t\t) {
\t\t\t\t\t\tsetWallPointPlacement({
\t\t\t\t\t\t\ttype: newWallPlacement.tool as
\t\t\t\t\t\t\t\t| 'electrical'
\t\t\t\t\t\t\t\t| 'plumbing',
\t\t\t\t\t\t\tphase: 'enterDistance', // Can bypass this phase UI with next step
\t\t\t\t\t\t\twall: newWallPlacement.wall,
\t\t\t\t\t\t\treferenceEndpoint: newWallPlacement.referenceEndpoint,
\t\t\t\t\t\t\tposition: offsetPos,
\t\t\t\t\t\t\tdistanceCm: pixelsToCm(
\t\t\t\t\t\t\t\tdistanceBetween(
\t\t\t\t\t\t\t\t\tnewWallPlacement.referenceEndpoint,
\t\t\t\t\t\t\t\t\toffsetPos
\t\t\t\t\t\t\t\t)
\t\t\t\t\t\t\t),
\t\t\t\t\t\t});
\t\t\t\t\t\tsetShowWallPointForm(true);
\t\t\t\t\t\tsetWallPlacement(null);
\t\t\t\t\t\tsetShowDimensionInput(false);
\t\t\t\t\t\treturn;
\t\t\t\t\t}

\t\t\t\t\tif (newWallPlacement.tool === 'island_base') {
\t\t\t\t\t\t// Transition to setting depth
\t\t\t\t\t\tsetWallPlacement({
\t\t\t\t\t\t\t\t\t\t...newWallPlacement,
\t\t\t\t\t\t\t\t\t\tphase: 'settingDepth',
\t\t\t\t\t\t\t\t\t\toffsetPosition: offsetPos,
\t\t\t\t\t\t\t\t\t\tcurrentPosition: offsetPos,
\t\t\t\t\t\t\t\t\t\tcurrentOffsetPx: 0,
\t\t\t\t\t\t});
\t\t\t\t\t\treturn;
\t\t\t\t\t}`
);

fs.writeFileSync(path, code);
