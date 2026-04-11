import type { WebcamPosition, WebcamRegion } from "@/components/video-editor/types";

const CENTER_POSITION: WebcamPosition = { cx: 0.5, cy: 0.5 };

export interface WebcamPositionSource {
	globalPosition: WebcamPosition | null;
	regions: WebcamRegion[];
}

export function computeWebcamPositionAtTime(
	source: WebcamPositionSource,
	timeMs: number,
): WebcamPosition {
	const base: WebcamPosition = source.globalPosition ?? CENTER_POSITION;
	const regions = source.regions;
	if (regions.length === 0) return base;

	for (const region of regions) {
		if (timeMs >= region.startMs && timeMs <= region.endMs) {
			return region.position;
		}
	}

	return base;
}
