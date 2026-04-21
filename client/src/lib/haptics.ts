/**
 * Tiny wrapper around the Web Vibration API.
 *
 * - Android (Chrome / Samsung Internet) supports `navigator.vibrate` fully.
 * - iOS Safari silently ignores the call — no user-facing error, just no
 *   haptic. We accept that rather than add a noisy fallback.
 * - Desktop browsers: `'vibrate' in navigator` is false on most, so the
 *   call is a no-op.
 *
 * Use semantic intensity names, not millisecond values, so we can tune the
 * feel in one place later without touching every call site.
 */
type Intensity = "light" | "medium" | "heavy";

const DURATIONS: Record<Intensity, number> = {
	light: 10,
	medium: 20,
	heavy: 40,
};

export function haptic(intensity: Intensity = "light"): void {
	if (typeof navigator === "undefined") return;
	if (typeof navigator.vibrate !== "function") return;
	try {
		navigator.vibrate(DURATIONS[intensity]);
	} catch {
		// Some browsers throw on `vibrate()` when the page is backgrounded;
		// swallow silently — haptics are never critical.
	}
}
