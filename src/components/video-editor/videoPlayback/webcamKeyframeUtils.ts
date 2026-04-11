import type {
	WebcamKeyframe,
	WebcamMaskShape,
	WebcamPosition,
	WebcamSizePreset,
} from "@/components/video-editor/types";

export interface WebcamStateSource {
	globalPosition: WebcamPosition | null;
	globalShape: WebcamMaskShape;
	globalSizePreset: WebcamSizePreset;
	keyframes: WebcamKeyframe[];
}

export interface WebcamState {
	position: WebcamPosition;
	shape: WebcamMaskShape;
	sizePreset: WebcamSizePreset;
}

const CENTER_POSITION: WebcamPosition = { cx: 0.5, cy: 0.5 };

export function computeWebcamStateAtTime(source: WebcamStateSource, timeMs: number): WebcamState {
	const baseState: WebcamState = {
		position: source.globalPosition ?? CENTER_POSITION,
		shape: source.globalShape,
		sizePreset: source.globalSizePreset,
	};
	if (source.keyframes.length === 0) return baseState;

	let activeKeyframe: WebcamKeyframe | null = null;
	for (const keyframe of source.keyframes) {
		if (keyframe.timeMs <= timeMs) {
			if (!activeKeyframe || keyframe.timeMs > activeKeyframe.timeMs) {
				activeKeyframe = keyframe;
			}
		}
	}

	if (!activeKeyframe) return baseState;

	return {
		position: activeKeyframe.position,
		shape: activeKeyframe.shape,
		sizePreset: activeKeyframe.sizePreset,
	};
}
