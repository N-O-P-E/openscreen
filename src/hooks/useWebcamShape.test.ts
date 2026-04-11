import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWebcamShape } from "./useWebcamShape";

type ElectronApiMock = {
	getWebcamShape: ReturnType<typeof vi.fn>;
	setWebcamShape: ReturnType<typeof vi.fn>;
	onWebcamShapeChanged: ReturnType<typeof vi.fn>;
};

let lastChangeHandler: ((shape: "rectangle" | "circle" | "square" | "rounded") => void) | null =
	null;

function installMock(
	initialShape: "rectangle" | "circle" | "square" | "rounded" = "circle",
): ElectronApiMock {
	lastChangeHandler = null;
	const mock: ElectronApiMock = {
		getWebcamShape: vi.fn().mockResolvedValue(initialShape),
		setWebcamShape: vi.fn().mockImplementation((shape) => {
			lastChangeHandler?.(shape);
			return Promise.resolve(shape);
		}),
		onWebcamShapeChanged: vi.fn().mockImplementation((cb) => {
			lastChangeHandler = cb;
			return () => {
				lastChangeHandler = null;
			};
		}),
	};
	(window as unknown as { electronAPI: ElectronApiMock }).electronAPI = mock;
	return mock;
}

describe("useWebcamShape", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("loads initial shape from electronAPI.getWebcamShape", async () => {
		installMock("square");
		const { result } = renderHook(() => useWebcamShape());
		await waitFor(() => expect(result.current.shape).toBe("square"));
	});

	it("updates shape via setShape and persists via electronAPI", async () => {
		const mock = installMock("circle");
		const { result } = renderHook(() => useWebcamShape());
		await waitFor(() => expect(result.current.shape).toBe("circle"));
		await act(async () => {
			await result.current.setShape("square");
		});
		expect(mock.setWebcamShape).toHaveBeenCalledWith("square");
		expect(result.current.shape).toBe("square");
	});

	it("reacts to external webcam-shape:changed broadcasts", async () => {
		installMock("circle");
		const { result } = renderHook(() => useWebcamShape());
		await waitFor(() => expect(result.current.shape).toBe("circle"));
		act(() => {
			lastChangeHandler?.("rectangle");
		});
		expect(result.current.shape).toBe("rectangle");
	});

	it("defaults to circle if electronAPI is unavailable", async () => {
		(window as unknown as { electronAPI?: unknown }).electronAPI = undefined;
		const { result } = renderHook(() => useWebcamShape());
		expect(result.current.shape).toBe("circle");
	});
});
