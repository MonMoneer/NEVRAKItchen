import { useEffect, useState } from "react";
import { useIsTouch, useIsLandscape } from "@/hooks/use-touch";

/**
 * One-time teaching overlay shown the first time a touch user opens the
 * designer. Explains the three gestures that differ from desktop:
 *   1. Pinch to zoom
 *   2. Two-finger drag to pan
 *   3. Long-press an item for options
 *
 * Persisted in localStorage so it never shows a second time on the same
 * device. Dismissible with a single tap. Invisible on desktop.
 */
const SEEN_KEY = "nivra:touch-coach-seen";

export function TouchCoachOverlay() {
	const isTouch = useIsTouch();
	const isLandscape = useIsLandscape();
	const [visible, setVisible] = useState<boolean>(false);

	useEffect(() => {
		if (!isTouch || !isLandscape) return;
		if (typeof window === "undefined") return;
		const seen = window.localStorage.getItem(SEEN_KEY) === "1";
		if (!seen) setVisible(true);
	}, [isTouch, isLandscape]);

	const dismiss = () => {
		window.localStorage.setItem(SEEN_KEY, "1");
		setVisible(false);
	};

	if (!visible) return null;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Touch gesture tips"
			className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 px-6"
		>
			<div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 flex flex-col gap-4">
				<div>
					<h2 className="text-lg font-semibold text-foreground mb-1">
						Welcome — a few touch tips
					</h2>
					<p className="text-sm text-muted-foreground">
						Your device is touch-first. Three gestures worth knowing:
					</p>
				</div>

				<ul className="space-y-3">
					<li className="flex gap-3 items-start">
						<span className="text-2xl shrink-0 leading-none pt-0.5">🤏</span>
						<div>
							<div className="text-sm font-medium">Pinch to zoom</div>
							<div className="text-xs text-muted-foreground">
								Spread or squeeze two fingers anywhere on the canvas.
							</div>
						</div>
					</li>
					<li className="flex gap-3 items-start">
						<span className="text-2xl shrink-0 leading-none pt-0.5">✌️</span>
						<div>
							<div className="text-sm font-medium">
								Two fingers to pan
							</div>
							<div className="text-xs text-muted-foreground">
								Drag with two fingers to move around your design.
							</div>
						</div>
					</li>
					<li className="flex gap-3 items-start">
						<span className="text-2xl shrink-0 leading-none pt-0.5">👆</span>
						<div>
							<div className="text-sm font-medium">Long-press for options</div>
							<div className="text-xs text-muted-foreground">
								Hold on a cabinet or wall to flip, delete, or view details.
							</div>
						</div>
					</li>
				</ul>

				<button
					type="button"
					onClick={dismiss}
					className="mt-2 h-12 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 active:opacity-80"
				>
					Got it
				</button>
			</div>
		</div>
	);
}
