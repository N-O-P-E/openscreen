import type { WebcamPosition, WebcamRegion } from "@/components/video-editor/types";

export const WEBCAM_TRANSITION_WINDOW_MS = 300;

const CENTER_POSITION: WebcamPosition = { cx: 0.5, cy: 0.5 };

export interface WebcamPositionSource {
	globalPosition: WebcamPosition | null;
	regions: WebcamRegion[];
}

function easeInOutCubic(t: number): number {
	if (t < 0.5) return 4 * t * t * t;
	const p = 2 * t - 2;
	return 0.5 * p * p * p + 1;
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function lerpPosition(a: WebcamPosition, b: WebcamPosition, t: number): WebcamPosition {
	const eased = easeInOutCubic(t);
	return { cx: lerp(a.cx, b.cx, eased), cy: lerp(a.cy, b.cy, eased) };
}

function positionForRegionOrBase(
	region: WebcamRegion | null,
	base: WebcamPosition,
): WebcamPosition {
	return region ? region.position : base;
}

export function computeWebcamPositionAtTime(
	source: WebcamPositionSource,
	timeMs: number,
): WebcamPosition {
	const base: WebcamPosition = source.globalPosition ?? CENTER_POSITION;
	const regions = source.regions;
	if (regions.length === 0) return base;

	const sorted = [...regions].sort((a, b) => a.startMs - b.startMs);

	let active: WebcamRegion | null = null;
	let previous: WebcamRegion | null = null;
	let next: WebcamRegion | null = null;

	for (const region of sorted) {
		if (timeMs >= region.startMs && timeMs <= region.endMs) {
			active = region;
		} else if (region.endMs < timeMs) {
			previous = region;
		} else if (region.startMs > timeMs && !next) {
			next = region;
		}
	}

	if (active) {
		const window = WEBCAM_TRANSITION_WINDOW_MS;
		const msIntoRegion = timeMs - active.startMs;
		const msToRegionEnd = active.endMs - timeMs;

		let current: WebcamPosition = active.position;
		const easingIn = window > 0 && msIntoRegion < window;
		const easingOut = window > 0 && msToRegionEnd < window;

		if (easingIn) {
			const previousState = positionForRegionOrBase(previous, base);
			const t = msIntoRegion / window;
			current = lerpPosition(previousState, current, t);
		}
		if (easingOut) {
			const nextState = positionForRegionOrBase(next, base);
			const t = 1 - msToRegionEnd / window;
			current = lerpPosition(current, nextState, t);
		}
		return current;
	}

	return base;
}
