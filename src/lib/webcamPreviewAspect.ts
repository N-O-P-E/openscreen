import type { WebcamMaskShape } from "@/components/video-editor/types";

export function getPreviewAspectRatio(
	shape: WebcamMaskShape,
	nativeWidth: number,
	nativeHeight: number,
): number {
	if (shape === "circle" || shape === "square") return 1;
	if (
		Number.isFinite(nativeWidth) &&
		Number.isFinite(nativeHeight) &&
		nativeWidth > 0 &&
		nativeHeight > 0
	) {
		return nativeWidth / nativeHeight;
	}
	return 16 / 9;
}

export type PreviewSizeBounds = {
	min: number;
	max: number;
	defaultSize: number;
};

export function getPreviewSizeBounds(shape: WebcamMaskShape): PreviewSizeBounds {
	if (shape === "circle" || shape === "square") {
		return { min: 180, max: 600, defaultSize: 320 };
	}
	return { min: 256, max: 960, defaultSize: 480 };
}
