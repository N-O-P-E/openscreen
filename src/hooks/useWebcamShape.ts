import { useCallback, useEffect, useState } from "react";
import type { WebcamMaskShape } from "@/components/video-editor/types";

const FALLBACK_SHAPE: WebcamMaskShape = "circle";

export function useWebcamShape(): {
	shape: WebcamMaskShape;
	setShape: (shape: WebcamMaskShape) => Promise<void>;
} {
	const [shape, setShapeState] = useState<WebcamMaskShape>(FALLBACK_SHAPE);

	useEffect(() => {
		const api = window.electronAPI;
		if (!api) return;
		let cancelled = false;
		api
			.getWebcamShape()
			.then((loaded) => {
				if (!cancelled) setShapeState(loaded);
			})
			.catch(() => {});
		const unsubscribe = api.onWebcamShapeChanged((next) => {
			setShapeState(next);
		});
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, []);

	const setShape = useCallback(async (next: WebcamMaskShape) => {
		const api = window.electronAPI;
		setShapeState(next);
		if (api) {
			try {
				await api.setWebcamShape(next);
			} catch (error) {
				console.error("Failed to persist webcam shape:", error);
			}
		}
	}, []);

	return { shape, setShape };
}
