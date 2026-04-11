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

	it("returns region position well inside a region (far from boundaries)", () => {
		const regions = [makeRegion("r1", 2000, 4000, 0.1, 0.1)];
		const result = computeWebcamPositionAtTime({ globalPosition: base, regions }, 3000);
		expect(result).toEqual({ cx: 0.1, cy: 0.1 });
	});

	it("interpolates into a region at its start boundary", () => {
		const regions = [makeRegion("r1", 2000, 4000, 0.1, 0.1)];
		// 150ms into the region — halfway through a 300ms transition
		const result = computeWebcamPositionAtTime({ globalPosition: base, regions }, 2150);
		// ease-in-out cubic at t=0.5 is 0.5; halfway between base(0.8,0.8) and region(0.1,0.1)
		expect(result.cx).toBeCloseTo(0.45, 3);
		expect(result.cy).toBeCloseTo(0.45, 3);
	});

	it("interpolates out of a region at its end boundary", () => {
		const regions = [makeRegion("r1", 2000, 4000, 0.1, 0.1)];
		// 150ms before region end — halfway through a 300ms ease-out
		const result = computeWebcamPositionAtTime({ globalPosition: base, regions }, 3850);
		expect(result.cx).toBeCloseTo(0.45, 3);
		expect(result.cy).toBeCloseTo(0.45, 3);
	});

	it("interpolates between two back-to-back regions at the shared boundary", () => {
		const regions = [
			makeRegion("r1", 2000, 4000, 0.1, 0.1),
			makeRegion("r2", 4000, 6000, 0.9, 0.9),
		];
		const at3850 = computeWebcamPositionAtTime({ globalPosition: base, regions }, 3850);
		const at4150 = computeWebcamPositionAtTime({ globalPosition: base, regions }, 4150);
		expect(at3850.cx).toBeGreaterThan(0.1);
		expect(at3850.cx).toBeLessThan(0.9);
		expect(at4150.cx).toBeGreaterThan(0.1);
		expect(at4150.cx).toBeLessThan(0.9);
	});

	it("handles a region whose duration is shorter than twice the transition window", () => {
		const regions = [makeRegion("r1", 2000, 2200, 0.1, 0.1)];
		const midRegion = computeWebcamPositionAtTime({ globalPosition: base, regions }, 2100);
		expect(midRegion.cx).toBeGreaterThan(0.1);
		expect(midRegion.cx).toBeLessThan(0.8);
	});
});
