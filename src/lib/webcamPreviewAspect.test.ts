import { describe, expect, it } from "vitest";
import { getPreviewAspectRatio, getPreviewSizeBounds } from "./webcamPreviewAspect";

describe("getPreviewAspectRatio", () => {
	it("returns 1 for circle", () => {
		expect(getPreviewAspectRatio("circle", 1280, 720)).toBe(1);
	});

	it("returns 1 for square", () => {
		expect(getPreviewAspectRatio("square", 1280, 720)).toBe(1);
	});

	it("returns native camera ratio for rectangle", () => {
		expect(getPreviewAspectRatio("rectangle", 1280, 720)).toBeCloseTo(16 / 9, 4);
	});

	it("falls back to 16/9 for rectangle when native size is unknown", () => {
		expect(getPreviewAspectRatio("rectangle", 0, 0)).toBeCloseTo(16 / 9, 4);
	});

	it("treats rounded as native ratio (same as rectangle) for preview", () => {
		expect(getPreviewAspectRatio("rounded", 1920, 1080)).toBeCloseTo(16 / 9, 4);
	});

	it("falls back to 16/9 when native dimensions are not finite", () => {
		expect(getPreviewAspectRatio("rectangle", Number.POSITIVE_INFINITY, 720)).toBeCloseTo(
			16 / 9,
			4,
		);
		expect(getPreviewAspectRatio("rectangle", Number.NaN, 720)).toBeCloseTo(16 / 9, 4);
	});
});

describe("getPreviewSizeBounds", () => {
	it("returns 1:1 bounds for circle/square", () => {
		expect(getPreviewSizeBounds("circle")).toEqual({ min: 180, max: 600, defaultSize: 320 });
		expect(getPreviewSizeBounds("square")).toEqual({ min: 180, max: 600, defaultSize: 320 });
	});

	it("returns 16:9-friendly bounds for rectangle/rounded", () => {
		expect(getPreviewSizeBounds("rectangle")).toEqual({ min: 256, max: 960, defaultSize: 480 });
		expect(getPreviewSizeBounds("rounded")).toEqual({ min: 256, max: 960, defaultSize: 480 });
	});
});
