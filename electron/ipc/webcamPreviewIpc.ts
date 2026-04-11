import fs from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { createWebcamPreviewWindow, getWebcamPreviewWindow } from "../windows";

export type WebcamPreviewShape = "rectangle" | "circle" | "square" | "rounded";

const SETTINGS_FILE = path.join(app.getPath("userData"), "webcam-preview-settings.json");
const DEFAULT_SHAPE: WebcamPreviewShape = "circle";

type WebcamPreviewSettings = {
	shape: WebcamPreviewShape;
};

let cachedSettings: WebcamPreviewSettings | null = null;

async function loadSettings(): Promise<WebcamPreviewSettings> {
	if (cachedSettings) return cachedSettings;
	try {
		const raw = await fs.readFile(SETTINGS_FILE, "utf8");
		const parsed = JSON.parse(raw) as Partial<WebcamPreviewSettings>;
		const shape = isValidShape(parsed.shape) ? parsed.shape : DEFAULT_SHAPE;
		cachedSettings = { shape };
	} catch {
		cachedSettings = { shape: DEFAULT_SHAPE };
	}
	return cachedSettings;
}

async function saveSettings(settings: WebcamPreviewSettings): Promise<void> {
	await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf8");
	cachedSettings = settings;
}

function isValidShape(value: unknown): value is WebcamPreviewShape {
	return value === "rectangle" || value === "circle" || value === "square" || value === "rounded";
}

export function registerWebcamPreviewIpc(): void {
	ipcMain.handle("webcam-shape:get", async (): Promise<WebcamPreviewShape> => {
		const settings = await loadSettings();
		return settings.shape;
	});

	ipcMain.handle(
		"webcam-shape:set",
		async (_event, shape: unknown): Promise<WebcamPreviewShape> => {
			if (!isValidShape(shape)) throw new Error(`Invalid webcam shape: ${String(shape)}`);
			await saveSettings({ shape });
			BrowserWindow.getAllWindows().forEach((win) => {
				if (!win.isDestroyed()) win.webContents.send("webcam-shape:changed", shape);
			});
			return shape;
		},
	);
}

export function registerWebcamPreviewLifecycleIpc(options: {
	onRequestDisableWebcam: () => void;
}): void {
	ipcMain.on("webcam-preview:open", (_event, deviceId: string | undefined) => {
		createWebcamPreviewWindow(deviceId);
	});

	ipcMain.on("webcam-preview:close", () => {
		const win = getWebcamPreviewWindow();
		if (win && !win.isDestroyed()) win.close();
	});

	ipcMain.on("webcam-preview:set-device", (_event, deviceId: string | undefined) => {
		const win = getWebcamPreviewWindow();
		if (win && !win.isDestroyed()) {
			win.webContents.send("webcam-preview:device-changed", deviceId);
		}
	});

	ipcMain.on("webcam-preview:request-close", () => {
		options.onRequestDisableWebcam();
		const win = getWebcamPreviewWindow();
		if (win && !win.isDestroyed()) win.close();
	});

	ipcMain.on("webcam-preview:set-position", (_event, x: unknown, y: unknown) => {
		const win = getWebcamPreviewWindow();
		if (!win || win.isDestroyed()) return;
		if (typeof x !== "number" || typeof y !== "number") return;
		if (!Number.isFinite(x) || !Number.isFinite(y)) return;
		win.setPosition(Math.round(x), Math.round(y));
	});

	ipcMain.on("webcam-preview:set-size", (_event, width: unknown, height: unknown) => {
		const win = getWebcamPreviewWindow();
		if (!win || win.isDestroyed()) {
			console.log("[webcam-preview:set-size] skipped — window missing or destroyed");
			return;
		}
		if (typeof width !== "number" || typeof height !== "number") {
			console.log("[webcam-preview:set-size] skipped — invalid types", { width, height });
			return;
		}
		if (!Number.isFinite(width) || !Number.isFinite(height)) {
			console.log("[webcam-preview:set-size] skipped — non-finite", { width, height });
			return;
		}
		const roundedWidth = Math.max(180, Math.min(960, Math.round(width)));
		const roundedHeight = Math.max(180, Math.min(960, Math.round(height)));
		const currentBounds = win.getBounds();
		console.log("[webcam-preview:set-size]", {
			requestedWidth: width,
			requestedHeight: height,
			roundedWidth,
			roundedHeight,
			currentBounds,
		});
		win.setBounds({
			x: currentBounds.x,
			y: currentBounds.y,
			width: roundedWidth,
			height: roundedHeight,
		});
		const newBounds = win.getBounds();
		console.log("[webcam-preview:set-size] after setBounds", newBounds);
	});
}
