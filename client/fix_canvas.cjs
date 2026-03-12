const fs = require('fs');
const path = './src/components/kitchen/DesignerCanvas.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
`					setWallPlacement({
						phase: 'settingOffset',
						tool: (activeCustomTool || tool) as WallPlacementTool,
						wall,
						referenceEndpoint: initPos,
						wallAngle,
						currentOffsetPx: 0,
						currentPosition: initPos,
					});
					setShowDimensionInput(true);
					const offsetPos = wallPlacement.currentPosition;

					if (
						wallPlacement.tool === 'electrical' ||
						wallPlacement.tool === 'plumbing'
					) {
						setWallPointPlacement({
							type: wallPlacement.tool as
								| 'electrical'
								| 'plumbing',
							phase: 'enterDistance', // Can bypass this phase UI with next step
							wall: wallPlacement.wall,
							referenceEndpoint: wallPlacement.referenceEndpoint,
							position: offsetPos,
							distanceCm: pixelsToCm(
								distanceBetween(
									wallPlacement.referenceEndpoint,
									offsetPos
								)
							),
						});
						setShowWallPointForm(true);
						setWallPlacement(null);
						setShowDimensionInput(false);
						return;
					}

					if (wallPlacement.tool === 'island_base') {
						// Transition to setting depth
						setWallPlacement((prev) =>
							prev
								? {
										...prev,
										phase: 'settingDepth',
										offsetPosition: offsetPos,
										currentPosition: offsetPos,
										currentOffsetPx: 0,
									}
								: null
						);
						return;
					}`,
`					const newWallPlacement: WallPlacementState = {
						phase: 'settingOffset',
						tool: (activeCustomTool || tool) as WallPlacementTool,
						wall,
						referenceEndpoint: initPos,
						wallAngle,
						currentOffsetPx: 0,
						currentPosition: initPos,
					};
					setWallPlacement(newWallPlacement);
					setShowDimensionInput(true);
					const offsetPos = newWallPlacement.currentPosition;

					if (
						newWallPlacement.tool === 'electrical' ||
						newWallPlacement.tool === 'plumbing'
					) {
						setWallPointPlacement({
							type: newWallPlacement.tool as
								| 'electrical'
								| 'plumbing',
							phase: 'enterDistance', // Can bypass this phase UI with next step
							wall: newWallPlacement.wall,
							referenceEndpoint: newWallPlacement.referenceEndpoint,
							position: offsetPos,
							distanceCm: pixelsToCm(
								distanceBetween(
									newWallPlacement.referenceEndpoint,
									offsetPos
								)
							),
						});
						setShowWallPointForm(true);
						setWallPlacement(null);
						setShowDimensionInput(false);
						return;
					}

					if (newWallPlacement.tool === 'island_base') {
						// Transition to setting depth
						setWallPlacement({
							...newWallPlacement,
							phase: 'settingDepth',
							offsetPosition: offsetPos,
							currentPosition: offsetPos,
							currentOffsetPx: 0,
						});
						return;
					}`
);

fs.writeFileSync(path, code);
