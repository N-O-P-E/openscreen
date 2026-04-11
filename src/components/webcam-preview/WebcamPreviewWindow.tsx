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
	const [deviceId, setDeviceId] = useState<string | undefined>(() => getDeviceIdFromQuery());
	const [streamState, setStreamState] = useState<StreamState>({ kind: "idle" });
	const { shape, setShape } = useWebcamShape();

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

	const clipPath = getCssClipPath(shape) ?? "none";

	return (
		<div className="group relative h-screen w-screen overflow-hidden bg-transparent">
			<div
				className={cn(
					"absolute inset-0 overflow-hidden bg-black",
					shape === "circle" && "rounded-full",
				)}
				style={{ clipPath, WebkitAppRegion: "drag" } as React.CSSProperties}
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
		</div>
	);
}
