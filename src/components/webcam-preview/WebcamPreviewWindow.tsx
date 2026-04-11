import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useWebcamShape } from "@/hooks/useWebcamShape";
import { cn } from "@/lib/utils";
import { getCssClipPath } from "@/lib/webcamMaskShapes";
import { getPreviewAspectRatio } from "@/lib/webcamPreviewAspect";
import { ShapeSelector } from "./ShapeSelector";

type StreamState =
	| { kind: "idle" }
	| { kind: "ready"; stream: MediaStream; width: number; height: number }
	| { kind: "error"; message: string };

function getDeviceIdFromQuery(): string | undefined {
	const params = new URLSearchParams(window.location.search);
	const id = params.get("deviceId");
	return id ?? undefined;
}

async function acquireStream(deviceId: string | undefined): Promise<MediaStream> {
	const constraints: MediaStreamConstraints = {
		audio: false,
		video: deviceId
			? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
			: { width: { ideal: 1280 }, height: { ideal: 720 } },
	};
	return navigator.mediaDevices.getUserMedia(constraints);
}

export function WebcamPreviewWindow() {
	const videoRef = useRef<HTMLVideoElement>(null);
	const dragStateRef = useRef<{
		startWinX: number;
		startWinY: number;
		startMouseX: number;
		startMouseY: number;
	} | null>(null);
	const resizeStateRef = useRef<{
		startWinWidth: number;
		startWinHeight: number;
		startMouseX: number;
		startMouseY: number;
		aspectRatio: number;
		pointerId: number;
	} | null>(null);
	const [deviceId, setDeviceId] = useState<string | undefined>(() => getDeviceIdFromQuery());
	const [streamState, setStreamState] = useState<StreamState>({ kind: "idle" });
	const { shape, setShape } = useWebcamShape();

	const handleDragStart = (event: React.MouseEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		dragStateRef.current = {
			startWinX: window.screenX,
			startWinY: window.screenY,
			startMouseX: event.screenX,
			startMouseY: event.screenY,
		};
	};

	const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.stopPropagation();
		const target = event.currentTarget;
		target.setPointerCapture(event.pointerId);
		const width = window.innerWidth;
		const height = window.innerHeight;
		resizeStateRef.current = {
			startWinWidth: width,
			startWinHeight: height,
			startMouseX: event.screenX,
			startMouseY: event.screenY,
			aspectRatio: width / height,
			pointerId: event.pointerId,
		};
	};

	const handleResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		const resize = resizeStateRef.current;
		if (!resize) return;
		if (event.pointerId !== resize.pointerId) return;
		const dx = event.screenX - resize.startMouseX;
		let newWidth = Math.max(180, Math.min(960, resize.startWinWidth + dx));
		let newHeight = newWidth / resize.aspectRatio;
		if (newHeight > 960) {
			newHeight = 960;
			newWidth = newHeight * resize.aspectRatio;
		}
		if (newHeight < 180) {
			newHeight = 180;
			newWidth = newHeight * resize.aspectRatio;
		}
		window.electronAPI?.setWebcamPreviewSize(newWidth, newHeight);
	};

	const handleResizePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
		const resize = resizeStateRef.current;
		if (!resize) return;
		if (event.pointerId !== resize.pointerId) return;
		try {
			event.currentTarget.releasePointerCapture(event.pointerId);
		} catch {
			// ignore — capture may have already been released
		}
		resizeStateRef.current = null;
	};

	useEffect(() => {
		let cancelled = false;
		let localStream: MediaStream | null = null;

		(async () => {
			try {
				const stream = await acquireStream(deviceId);
				if (cancelled) {
					stream.getTracks().forEach((t) => t.stop());
					return;
				}
				localStream = stream;
				const track = stream.getVideoTracks()[0];
				const settings = track?.getSettings() ?? {};
				const width = typeof settings.width === "number" ? settings.width : 1280;
				const height = typeof settings.height === "number" ? settings.height : 720;

				track?.addEventListener("ended", () => {
					setStreamState({ kind: "error", message: "Camera disconnected" });
				});

				setStreamState({ kind: "ready", stream, width, height });
			} catch (error) {
				const message = error instanceof Error ? error.message : "Camera unavailable";
				setStreamState({ kind: "error", message });
			}
		})();

		return () => {
			cancelled = true;
			if (localStream) {
				localStream.getTracks().forEach((t) => t.stop());
			}
		};
	}, [deviceId]);

	useEffect(() => {
		if (streamState.kind !== "ready") return;
		const video = videoRef.current;
		if (!video) return;
		video.srcObject = streamState.stream;
	}, [streamState]);

	useEffect(() => {
		const api = window.electronAPI;
		if (!api) return;
		return api.onWebcamPreviewDeviceChanged((next) => {
			setDeviceId(next);
		});
	}, []);

	useEffect(() => {
		const api = window.electronAPI;
		if (!api) return;
		if (shape === "rectangle" || shape === "rounded") {
			if (streamState.kind !== "ready") return;
			const ratio = getPreviewAspectRatio(shape, streamState.width, streamState.height);
			api.setWebcamPreviewAspect(ratio);
			return;
		}
		const ratio = getPreviewAspectRatio(shape, 0, 0);
		api.setWebcamPreviewAspect(ratio);
	}, [shape, streamState]);

	useEffect(() => {
		const handleMouseMove = (event: MouseEvent) => {
			const drag = dragStateRef.current;
			if (!drag) return;
			const dx = event.screenX - drag.startMouseX;
			const dy = event.screenY - drag.startMouseY;
			window.electronAPI?.setWebcamPreviewPosition(drag.startWinX + dx, drag.startWinY + dy);
		};
		const handleMouseUp = () => {
			dragStateRef.current = null;
		};
		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, []);

	const clipPath = getCssClipPath(shape) ?? "none";

	return (
		<div className="group relative h-screen w-screen overflow-hidden bg-transparent">
			<div
				className={cn(
					"absolute inset-0 overflow-hidden bg-black cursor-move",
					shape === "circle" && "rounded-full",
				)}
				style={{ clipPath }}
				onMouseDown={handleDragStart}
			>
				{streamState.kind === "ready" && (
					<video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
				)}
				{streamState.kind === "error" && (
					<div className="flex h-full w-full items-center justify-center p-4 text-center text-sm text-white">
						{streamState.message}
					</div>
				)}
			</div>

			<button
				type="button"
				aria-label="Close preview"
				style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
				onClick={() => window.electronAPI?.requestCloseWebcamPreview()}
				className={cn(
					"absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full",
					"bg-black/60 text-white transition-opacity",
					"opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto",
				)}
			>
				<X size={12} />
			</button>

			<ShapeSelector value={shape} onChange={setShape} />

			<div
				aria-hidden
				className="absolute inset-0 pointer-events-none rounded-2xl border-2 border-white/30 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
			/>

			<div
				onPointerDown={handleResizePointerDown}
				onPointerMove={handleResizePointerMove}
				onPointerUp={handleResizePointerUp}
				onPointerCancel={handleResizePointerUp}
				aria-label="Resize preview"
				style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
				className={cn(
					"absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize",
					"opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto",
					"transition-opacity duration-150",
				)}
			>
				<div className="absolute bottom-1 right-1 h-3 w-3 rounded-sm border-b-2 border-r-2 border-white/70" />
			</div>
		</div>
	);
}
