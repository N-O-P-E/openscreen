import type { WebcamLayoutPreset } from "@/lib/compositeLayout";

export type ZoomDepth = 1 | 2 | 3 | 4 | 5 | 6;
export type ZoomFocusMode = "manual" | "auto";
export type { WebcamLayoutPreset };
/** Webcam size as a percentage of the canvas reference dimension (10–50). */
export type WebcamSizePreset = number;

export const DEFAULT_WEBCAM_SIZE_PRESET: WebcamSizePreset = 25;

export const DEFAULT_WEBCAM_LAYOUT_PRESET: WebcamLayoutPreset = "picture-in-picture";

export type WebcamMaskShape = "rectangle" | "circle" | "square" | "rounded";

export const DEFAULT_WEBCAM_MASK_SHAPE: WebcamMaskShape = "rectangle";

export interface WebcamPosition {
	cx: number; // normalized horizontal center (0-1)
	cy: number; // normalized vertical center (0-1)
}

export interface WebcamKeyframe {
	id: string;
	timeMs: number;
	position: WebcamPosition;
	shape: WebcamMaskShape;
	sizePreset: WebcamSizePreset;
}

export const DEFAULT_WEBCAM_POSITION: WebcamPosition | null = null;

export interface ZoomFocus {
	cx: number; // normalized horizontal center (0-1)
	cy: number; // normalized vertical center (0-1)
}

export interface ZoomRegion {
	id: string;
	startMs: number;
	endMs: number;
	depth: ZoomDepth;
	focus: ZoomFocus;
	focusMode?: ZoomFocusMode;
	/** Optional freeform scale (e.g. 1.1). When set, overrides the preset depth value. */
	customScale?: number;
}

/** Allowed range for custom zoom values. */
export const MIN_CUSTOM_ZOOM_SCALE = 1.05;
export const MAX_CUSTOM_ZOOM_SCALE = 10;

export function clampCustomZoomScale(scale: number): number {
	if (!Number.isFinite(scale)) return MIN_CUSTOM_ZOOM_SCALE;
	return Math.min(MAX_CUSTOM_ZOOM_SCALE, Math.max(MIN_CUSTOM_ZOOM_SCALE, scale));
}

/** Resolves the effective zoom scale for a region, honoring customScale when set. */
export function getRegionZoomScale(region: ZoomRegion): number {
	if (typeof region.customScale === "number" && Number.isFinite(region.customScale)) {
		return clampCustomZoomScale(region.customScale);
	}
	return ZOOM_DEPTH_SCALES[region.depth];
}

export interface CursorTelemetryPoint {
	timeMs: number;
	cx: number;
	cy: number;
}

export interface TrimRegion {
	id: string;
	startMs: number;
	endMs: number;
}

export type AnnotationType = "text" | "image" | "figure" | "blur";

export type ArrowDirection =
	| "up"
	| "down"
	| "left"
	| "right"
	| "up-right"
	| "up-left"
	| "down-right"
	| "down-left";

export interface FigureData {
	arrowDirection: ArrowDirection;
	color: string;
	strokeWidth: number;
}

export type BlurShape = "rectangle" | "oval" | "freehand";

export const MIN_BLUR_INTENSITY = 2;
export const MAX_BLUR_INTENSITY = 40;
export const DEFAULT_BLUR_INTENSITY = 12;

export interface BlurData {
	shape: BlurShape;
	intensity: number;
	// Points are normalized (0-100) within the annotation bounds.
	freehandPoints?: Array<{ x: number; y: number }>;
}

export interface AnnotationPosition {
	x: number;
	y: number;
}

export interface AnnotationSize {
	width: number;
	height: number;
}

export interface AnnotationTextStyle {
	color: string;
	backgroundColor: string;
	fontSize: number; // pixels
	fontFamily: string;
	fontWeight: "normal" | "bold";
	fontStyle: "normal" | "italic";
	textDecoration: "none" | "underline";
	textAlign: "left" | "center" | "right";
}

export interface AnnotationRegion {
	id: string;
	startMs: number;
	endMs: number;
	type: AnnotationType;
	content: string; // Legacy - still used for current type
	textContent?: string; // Separate storage for text
	imageContent?: string; // Separate storage for image data URL
	position: AnnotationPosition;
	size: AnnotationSize;
	style: AnnotationTextStyle;
	zIndex: number;
	figureData?: FigureData;
	blurData?: BlurData;
}

export const DEFAULT_ANNOTATION_POSITION: AnnotationPosition = {
	x: 50,
	y: 50,
};

export const DEFAULT_ANNOTATION_SIZE: AnnotationSize = {
	width: 30,
	height: 20,
};

export const DEFAULT_ANNOTATION_STYLE: AnnotationTextStyle = {
	color: "#ffffff",
	backgroundColor: "transparent",
	fontSize: 32,
	fontFamily: "Inter",
	fontWeight: "bold",
	fontStyle: "normal",
	textDecoration: "none",
	textAlign: "center",
};

export const DEFAULT_FIGURE_DATA: FigureData = {
	arrowDirection: "right",
	color: "#34B27B",
	strokeWidth: 4,
};

export const DEFAULT_BLUR_FREEHAND_POINTS: Array<{ x: number; y: number }> = [
	{ x: 10, y: 30 },
	{ x: 25, y: 10 },
	{ x: 55, y: 8 },
	{ x: 82, y: 20 },
	{ x: 90, y: 45 },
	{ x: 78, y: 72 },
	{ x: 52, y: 90 },
	{ x: 22, y: 84 },
	{ x: 8, y: 58 },
];

export const DEFAULT_BLUR_DATA: BlurData = {
	shape: "rectangle",
	intensity: DEFAULT_BLUR_INTENSITY,
	freehandPoints: DEFAULT_BLUR_FREEHAND_POINTS,
};

export interface CropRegion {
	x: number;
	y: number;
	width: number;
	height: number;
}

export const DEFAULT_CROP_REGION: CropRegion = {
	x: 0,
	y: 0,
	width: 1,
	height: 1,
};

/**
 * Time-ranged crop region. When active at the current playhead, the specified
 * rectangle of the screen is scaled up to fill the screen's canvas slot.
 * Transitions are instant (no interpolation). Webcam rendering is not affected.
 */
export interface TimedCropRegion {
	id: string;
	startMs: number;
	endMs: number;
	/** Normalized bounds (0-1) relative to the source video frame. */
	x: number;
	y: number;
	width: number;
	height: number;
}

export const DEFAULT_TIMED_CROP_REGION: Omit<TimedCropRegion, "id" | "startMs" | "endMs"> = {
	x: 0.25,
	y: 0.25,
	width: 0.5,
	height: 0.5,
};

export function findActiveTimedCropRegion(
	regions: TimedCropRegion[],
	timeMs: number,
): TimedCropRegion | null {
	if (!regions || regions.length === 0) return null;
	for (let i = regions.length - 1; i >= 0; i--) {
		const r = regions[i];
		if (timeMs >= r.startMs && timeMs <= r.endMs) return r;
	}
	return null;
}

export type PlaybackSpeed = number;

export const MIN_PLAYBACK_SPEED = 0.1;
// Anything above 16x causes the playhead to stall during preview
// due to the video decoder not being able to keep up.
export const MAX_PLAYBACK_SPEED = 16;

export function clampPlaybackSpeed(speed: number): PlaybackSpeed {
	return Math.round(Math.min(MAX_PLAYBACK_SPEED, Math.max(MIN_PLAYBACK_SPEED, speed)) * 100) / 100;
}

export interface SpeedRegion {
	id: string;
	startMs: number;
	endMs: number;
	speed: PlaybackSpeed;
}

/** Volume: 0 = muted, 1 = original level, up to 2 = boosted. */
export const MIN_AUDIO_VOLUME = 0;
export const MAX_AUDIO_VOLUME = 2;
export const DEFAULT_AUDIO_VOLUME = 1;

export interface AudioRegion {
	id: string;
	/** Timeline start, in milliseconds. */
	startMs: number;
	/** Timeline end, in milliseconds. */
	endMs: number;
	/** file:// URL of the source audio file. */
	sourcePath: string;
	/** Offset into the source file where this region begins playing, in milliseconds. */
	sourceOffsetMs: number;
	/** Full duration of the source file, in milliseconds. Used for clamping trim operations. */
	sourceDurationMs: number;
	/** Gain, 0 = muted, 1 = original, up to MAX_AUDIO_VOLUME. */
	volume: number;
}

export function clampAudioVolume(volume: number): number {
	if (!Number.isFinite(volume)) return DEFAULT_AUDIO_VOLUME;
	return Math.min(MAX_AUDIO_VOLUME, Math.max(MIN_AUDIO_VOLUME, volume));
}

export const SPEED_OPTIONS: Array<{ speed: PlaybackSpeed; label: string }> = [
	{ speed: 0.25, label: "0.25×" },
	{ speed: 0.5, label: "0.5×" },
	{ speed: 0.75, label: "0.75×" },
	{ speed: 1.25, label: "1.25×" },
	{ speed: 1.5, label: "1.5×" },
	{ speed: 1.75, label: "1.75×" },
	{ speed: 2, label: "2×" },
	{ speed: 3, label: "3×" },
	{ speed: 4, label: "4×" },
	{ speed: 5, label: "5×" },
];

export const DEFAULT_PLAYBACK_SPEED: PlaybackSpeed = 1.5;

export const ZOOM_DEPTH_SCALES: Record<ZoomDepth, number> = {
	1: 1.25,
	2: 1.5,
	3: 1.8,
	4: 2.2,
	5: 3.5,
	6: 5.0,
};

export const DEFAULT_ZOOM_DEPTH: ZoomDepth = 3;

export function clampFocusToDepth(focus: ZoomFocus, _depth: ZoomDepth): ZoomFocus {
	return {
		cx: clamp(focus.cx, 0, 1),
		cy: clamp(focus.cy, 0, 1),
	};
}

function clamp(value: number, min: number, max: number) {
	if (Number.isNaN(value)) return (min + max) / 2;
	return Math.min(max, Math.max(min, value));
}
