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

	ipcMain.on("webcam-preview:set-aspect", (_event, ratio: number) => {
		const win = getWebcamPreviewWindow();
		if (!win || win.isDestroyed()) return;
		if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio <= 0) return;
		win.setAspectRatio(ratio);
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
}
