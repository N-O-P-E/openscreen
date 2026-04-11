import { describe, expect, it } from "vitest";
import type {
	WebcamKeyframe,
	WebcamMaskShape,
	WebcamPosition,
	WebcamSizePreset,
} from "@/components/video-editor/types";
import { computeWebcamStateAtTime } from "./webcamKeyframeUtils";

const basePosition: WebcamPosition = { cx: 0.8, cy: 0.8 };
const baseShape: WebcamMaskShape = "rectangle";
const baseSizePreset: WebcamSizePreset = 25;

function source(keyframes: WebcamKeyframe[]) {
	return {
		globalPosition: basePosition,
		globalShape: baseShape,
		globalSizePreset: baseSizePreset,
		keyframes,
	};
}

function keyframe(
	id: string,
	timeMs: number,
	cx: number,
	cy: number,
	shape: WebcamMaskShape = "circle",
	sizePreset: WebcamSizePreset = 30,
): WebcamKeyframe {
	return { id, timeMs, position: { cx, cy }, shape, sizePreset };
}

describe("computeWebcamStateAtTime", () => {
	it("returns global state when there are no keyframes", () => {
		const result = computeWebcamStateAtTime(source([]), 5000);
		expect(result).toEqual({
			position: basePosition,
			shape: baseShape,
			sizePreset: baseSizePreset,
		});
	});

	it("returns center when global position is null and no keyframes", () => {
		const result = computeWebcamStateAtTime(
			{
				globalPosition: null,
				globalShape: baseShape,
				globalSizePreset: baseSizePreset,
				keyframes: [],
			},
			5000,
		);
		expect(result.position).toEqual({ cx: 0.5, cy: 0.5 });
	});

	it("returns global state before the first keyframe", () => {
		const keyframes = [keyframe("k1", 2000, 0.1, 0.1)];
		const result = computeWebcamStateAtTime(source(keyframes), 1000);
		expect(result).toEqual({
			position: basePosition,
			shape: baseShape,
			sizePreset: baseSizePreset,
		});
	});

	it("returns the keyframe at its exact time", () => {
		const keyframes = [keyframe("k1", 2000, 0.1, 0.1, "circle", 30)];
		const result = computeWebcamStateAtTime(source(keyframes), 2000);
		expect(result).toEqual({
			position: { cx: 0.1, cy: 0.1 },
			shape: "circle",
			sizePreset: 30,
		});
	});

	it("holds the last keyframe's state after its time", () => {
		const keyframes = [keyframe("k1", 2000, 0.1, 0.1, "circle", 30)];
		const result = computeWebcamStateAtTime(source(keyframes), 5000);
		expect(result).toEqual({
			position: { cx: 0.1, cy: 0.1 },
			shape: "circle",
			sizePreset: 30,
		});
	});

	it("picks the most recent keyframe among multiple", () => {
		const keyframes = [
			keyframe("k1", 1000, 0.1, 0.1, "circle", 20),
			keyframe("k2", 3000, 0.5, 0.5, "square", 30),
			keyframe("k3", 5000, 0.9, 0.9, "rectangle", 40),
		];
		expect(computeWebcamStateAtTime(source(keyframes), 500)).toMatchObject({
			position: basePosition,
		});
		expect(computeWebcamStateAtTime(source(keyframes), 2000)).toMatchObject({
			position: { cx: 0.1, cy: 0.1 },
			shape: "circle",
			sizePreset: 20,
		});
		expect(computeWebcamStateAtTime(source(keyframes), 4000)).toMatchObject({
			position: { cx: 0.5, cy: 0.5 },
			shape: "square",
			sizePreset: 30,
		});
		expect(computeWebcamStateAtTime(source(keyframes), 10000)).toMatchObject({
			position: { cx: 0.9, cy: 0.9 },
			shape: "rectangle",
			sizePreset: 40,
		});
	});

	it("is order-independent (sorts internally)", () => {
		const keyframes = [
			keyframe("k3", 5000, 0.9, 0.9),
			keyframe("k1", 1000, 0.1, 0.1),
			keyframe("k2", 3000, 0.5, 0.5),
		];
		const result = computeWebcamStateAtTime(source(keyframes), 4000);
		expect(result.position).toEqual({ cx: 0.5, cy: 0.5 });
	});
});
