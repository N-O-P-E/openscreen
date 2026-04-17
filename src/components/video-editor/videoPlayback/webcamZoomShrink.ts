import type { WebcamLayoutPreset } from "@/lib/compositeLayout";

export const WEBCAM_ZOOM_SHRINK_AMOUNT = 0.3;

export interface WebcamZoomShrinkInput {
	zoomProgress: number;
	layoutPreset: WebcamLayoutPreset | undefined;
	webcamRect: { x: number; y: number; width: number; height: number } | null;
	stageSize: { width: number; height: number };
}

export interface WebcamZoomShrink {
	scale: number;
	originX: number;
	originY: number;
}

const IDENTITY: WebcamZoomShrink = { scale: 1, originX: 0.5, originY: 0.5 };

function pickEdgeOrigin(centerFraction: number): number {
	if (centerFraction < 1 / 3) return 0;
	if (centerFraction > 2 / 3) return 1;
	return 0.5;
}

export function computeWebcamZoomShrink({
	zoomProgress,
	layoutPreset,
	webcamRect,
	stageSize,
}: WebcamZoomShrinkInput): WebcamZoomShrink {
	if (layoutPreset !== "picture-in-picture") return IDENTITY;
	if (!webcamRect || webcamRect.width <= 0 || webcamRect.height <= 0) return IDENTITY;
	if (stageSize.width <= 0 || stageSize.height <= 0) return IDENTITY;

	const progress = Math.min(1, Math.max(0, zoomProgress));
	if (progress === 0) return IDENTITY;

	const centerX = (webcamRect.x + webcamRect.width / 2) / stageSize.width;
	const centerY = (webcamRect.y + webcamRect.height / 2) / stageSize.height;

	return {
		scale: 1 - progress * WEBCAM_ZOOM_SHRINK_AMOUNT,
		originX: pickEdgeOrigin(centerX),
		originY: pickEdgeOrigin(centerY),
	};
}
