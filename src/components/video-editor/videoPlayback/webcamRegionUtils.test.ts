import { describe, expect, it } from "vitest";
import type { WebcamPosition, WebcamRegion } from "@/components/video-editor/types";
import { computeWebcamPositionAtTime } from "./webcamRegionUtils";

const base: WebcamPosition = { cx: 0.8, cy: 0.8 };

function makeRegion(
	id: string,
	startMs: number,
	endMs: number,
	cx: number,
	cy: number,
): WebcamRegion {
	return { id, startMs, endMs, position: { cx, cy } };
}

describe("computeWebcamPositionAtTime", () => {
	it("returns base when there are no regions", () => {
		const result = computeWebcamPositionAtTime({ globalPosition: base, regions: [] }, 5000);
		expect(result).toEqual(base);
	});

	it("returns center when global position is null and no regions", () => {
		const result = computeWebcamPositionAtTime({ globalPosition: null, regions: [] }, 5000);
		expect(result).toEqual({ cx: 0.5, cy: 0.5 });
	});

	it("returns base before any region starts", () => {
		const regions = [makeRegion("r1", 2000, 4000, 0.1, 0.1)];
		const result = computeWebcamPositionAtTime({ globalPosition: base, regions }, 500);
		expect(result).toEqual(base);
	});

	it("returns base after all regions end", () => {
		const regions = [makeRegion("r1", 2000, 4000, 0.1, 0.1)];
		const result = computeWebcamPositionAtTime({ globalPosition: base, regions }, 10000);
		expect(result).toEqual(base);
	});

	it("returns region position at exact start boundary", () => {
		const regions = [makeRegion("r1", 2000, 4000, 0.1, 0.1)];
		const result = computeWebcamPositionAtTime({ globalPosition: base, regions }, 2000);
		expect(result).toEqual({ cx: 0.1, cy: 0.1 });
	});

	it("returns region position at exact end boundary", () => {
		const regions = [makeRegion("r1", 2000, 4000, 0.1, 0.1)];
		const result = computeWebcamPositionAtTime({ globalPosition: base, regions }, 4000);
		expect(result).toEqual({ cx: 0.1, cy: 0.1 });
	});

	it("returns region position well inside a region", () => {
		const regions = [makeRegion("r1", 2000, 4000, 0.1, 0.1)];
		const result = computeWebcamPositionAtTime({ globalPosition: base, regions }, 3000);
		expect(result).toEqual({ cx: 0.1, cy: 0.1 });
	});

	it("returns base 1ms before a region starts", () => {
		const regions = [makeRegion("r1", 2000, 4000, 0.1, 0.1)];
		const result = computeWebcamPositionAtTime({ globalPosition: base, regions }, 1999);
		expect(result).toEqual(base);
	});

	it("returns base 1ms after a region ends", () => {
		const regions = [makeRegion("r1", 2000, 4000, 0.1, 0.1)];
		const result = computeWebcamPositionAtTime({ globalPosition: base, regions }, 4001);
		expect(result).toEqual(base);
	});

	it("switches cleanly between back-to-back regions", () => {
		const regions = [
			makeRegion("r1", 2000, 4000, 0.1, 0.1),
			makeRegion("r2", 4001, 6000, 0.9, 0.9),
		];
		expect(computeWebcamPositionAtTime({ globalPosition: base, regions }, 3999)).toEqual({
			cx: 0.1,
			cy: 0.1,
		});
		expect(computeWebcamPositionAtTime({ globalPosition: base, regions }, 4001)).toEqual({
			cx: 0.9,
			cy: 0.9,
		});
	});

	it("returns the first matching region when regions overlap (implementation detail)", () => {
		// Note: the app UI prevents overlapping regions, but the function should still be deterministic.
		const regions = [
			makeRegion("r1", 2000, 4000, 0.1, 0.1),
			makeRegion("r2", 3000, 5000, 0.9, 0.9),
		];
		const result = computeWebcamPositionAtTime({ globalPosition: base, regions }, 3500);
		expect(result).toEqual({ cx: 0.1, cy: 0.1 });
	});
});
