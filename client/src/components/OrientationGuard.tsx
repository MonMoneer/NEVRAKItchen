import { useShouldPromptRotate } from "@/hooks/use-touch";

/**
 * Full-screen overlay shown to touch users in portrait orientation.
 *
 * The kitchen designer is designed landscape-only. Portrait would force the
 * two sidebars and canvas into a column that's unusable for CAD-style work,
 * so we block it with a friendly "rotate" message instead.
 *
 * Desktop users (mouse + keyboard) are unaffected — the overlay only shows
 * when the primary pointer is coarse (tablet / phone) AND the viewport is
 * in portrait.
 */
export function OrientationGuard() {
	const shouldPrompt = useShouldPromptRotate();

	if (!shouldPrompt) return null;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Rotate your device"
			className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-background/95 backdrop-blur-sm px-8 text-center"
			style={{
				paddingTop: "var(--safe-top)",
				paddingBottom: "var(--safe-bottom)",
				paddingLeft: "var(--safe-left)",
				paddingRight: "var(--safe-right)",
			}}
		>
			{/* Animated rotate hint — uses CSS rotation so no JS cost. */}
			<div className="relative w-24 h-32">
				<div className="absolute inset-0 animate-[rotate-device_2.4s_ease-in-out_infinite]">
					<svg
						viewBox="0 0 96 128"
						fill="none"
						stroke="currentColor"
						strokeWidth="3"
						className="w-full h-full text-primary"
					>
						{/* Device outline */}
						<rect x="4" y="4" width="88" height="120" rx="10" />
						{/* Screen */}
						<rect x="12" y="14" width="72" height="100" rx="3" strokeWidth="1.5" />
						{/* Home button dot */}
						<circle cx="48" cy="119" r="2" fill="currentColor" />
					</svg>
				</div>
			</div>

			<div className="max-w-sm space-y-2">
				<h2 className="text-2xl font-semibold text-foreground">
					Please rotate your device
				</h2>
				<p className="text-sm text-muted-foreground">
					NIVRA Kitchen is designed for landscape orientation. Rotate your
					tablet sideways to continue.
				</p>
			</div>

			<style>{`
				@keyframes rotate-device {
					0%, 35% { transform: rotate(0deg); }
					55%, 100% { transform: rotate(-90deg); }
				}
			`}</style>
		</div>
	);
}
