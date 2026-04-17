import { describe, expect, it } from "vitest";
import { computeWebcamZoomShrink, WEBCAM_ZOOM_SHRINK_AMOUNT } from "./webcamZoomShrink";

const stage = { width: 1920, height: 1080 };

function rectAt(cx: number, cy: number, w = 240, h = 180) {
	return {
		x: cx * stage.width - w / 2,
		y: cy * stage.height - h / 2,
		width: w,
		height: h,
	};
}

describe("computeWebcamZoomShrink", () => {
	it("is a no-op for vertical-stack layout", () => {
		const result = computeWebcamZoomShrink({
			zoomProgress: 1,
			layoutPreset: "vertical-stack",
			webcamRect: rectAt(0.9, 0.9),
			stageSize: stage,
		});
		expect(result).toEqual({ scale: 1, originX: 0.5, originY: 0.5 });
	});

	it("is a no-op for webcam-only layout", () => {
		const result = computeWebcamZoomShrink({
			zoomProgress: 1,
			layoutPreset: "webcam-only",
			webcamRect: rectAt(0.5, 0.5),
			stageSize: stage,
		});
		expect(result.scale).toBe(1);
	});

	it("is a no-op when layoutPreset is undefined", () => {
		const result = computeWebcamZoomShrink({
			zoomProgress: 1,
			layoutPreset: undefined,
			webcamRect: rectAt(0.9, 0.9),
			stageSize: stage,
		});
		expect(result.scale).toBe(1);
	});

	it("is a no-op when zoomProgress is 0", () => {
		const result = computeWebcamZoomShrink({
			zoomProgress: 0,
			layoutPreset: "picture-in-picture",
			webcamRect: rectAt(0.9, 0.9),
			stageSize: stage,
		});
		expect(result).toEqual({ scale: 1, originX: 0.5, originY: 0.5 });
	});

	it("is a no-op when webcamRect is null", () => {
		const result = computeWebcamZoomShrink({
			zoomProgress: 1,
			layoutPreset: "picture-in-picture",
			webcamRect: null,
			stageSize: stage,
		});
		expect(result.scale).toBe(1);
	});

	it("reaches full shrink amount when zoomProgress is 1", () => {
		const result = computeWebcamZoomShrink({
			zoomProgress: 1,
			layoutPreset: "picture-in-picture",
			webcamRect: rectAt(0.9, 0.9),
			stageSize: stage,
		});
		expect(result.scale).toBeCloseTo(1 - WEBCAM_ZOOM_SHRINK_AMOUNT, 10);
	});

	it("interpolates linearly with zoomProgress", () => {
		const result = computeWebcamZoomShrink({
			zoomProgress: 0.5,
			layoutPreset: "picture-in-picture",
			webcamRect: rectAt(0.9, 0.9),
			stageSize: stage,
		});
		expect(result.scale).toBeCloseTo(1 - 0.5 * WEBCAM_ZOOM_SHRINK_AMOUNT, 10);
	});

	it("clamps zoomProgress above 1", () => {
		const result = computeWebcamZoomShrink({
			zoomProgress: 2,
			layoutPreset: "picture-in-picture",
			webcamRect: rectAt(0.9, 0.9),
			stageSize: stage,
		});
		expect(result.scale).toBeCloseTo(1 - WEBCAM_ZOOM_SHRINK_AMOUNT, 10);
	});

	it("clamps zoomProgress below 0", () => {
		const result = computeWebcamZoomShrink({
			zoomProgress: -1,
			layoutPreset: "picture-in-picture",
			webcamRect: rectAt(0.9, 0.9),
			stageSize: stage,
		});
		expect(result.scale).toBe(1);
	});

	it("anchors to bottom-right when webcam center is in bottom-right third", () => {
		const result = computeWebcamZoomShrink({
			zoomProgress: 1,
			layoutPreset: "picture-in-picture",
			webcamRect: rectAt(0.9, 0.9),
			stageSize: stage,
		});
		expect(result.originX).toBe(1);
		expect(result.originY).toBe(1);
	});

	it("anchors to top-left when webcam center is in top-left third", () => {
		const result = computeWebcamZoomShrink({
			zoomProgress: 1,
			layoutPreset: "picture-in-picture",
			webcamRect: rectAt(0.1, 0.1),
			stageSize: stage,
		});
		expect(result.originX).toBe(0);
		expect(result.originY).toBe(0);
	});

	it("anchors to top-right when webcam is top-right", () => {
		const result = computeWebcamZoomShrink({
			zoomProgress: 1,
			layoutPreset: "picture-in-picture",
			webcamRect: rectAt(0.9, 0.1),
			stageSize: stage,
		});
		expect(result.originX).toBe(1);
		expect(result.originY).toBe(0);
	});

	it("anchors to bottom-left when webcam is bottom-left", () => {
		const result = computeWebcamZoomShrink({
			zoomProgress: 1,
			layoutPreset: "picture-in-picture",
			webcamRect: rectAt(0.1, 0.9),
			stageSize: stage,
		});
		expect(result.originX).toBe(0);
		expect(result.originY).toBe(1);
	});

	it("anchors to center when webcam is centered", () => {
		const result = computeWebcamZoomShrink({
			zoomProgress: 1,
			layoutPreset: "picture-in-picture",
			webcamRect: rectAt(0.5, 0.5),
			stageSize: stage,
		});
		expect(result.originX).toBe(0.5);
		expect(result.originY).toBe(0.5);
	});

	it("anchors to bottom-center when webcam hugs bottom edge horizontally centered", () => {
		const result = computeWebcamZoomShrink({
			zoomProgress: 1,
			layoutPreset: "picture-in-picture",
			webcamRect: rectAt(0.5, 0.95),
			stageSize: stage,
		});
		expect(result.originX).toBe(0.5);
		expect(result.originY).toBe(1);
	});
});
