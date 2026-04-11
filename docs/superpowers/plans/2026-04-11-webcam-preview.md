# Webcam Live Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Loom-style floating webcam preview window with shape selection (circle / square / original aspect ratio) that appears whenever the webcam is enabled, is draggable and resizable, and drives the webcam shape in the final exported video.

**Architecture:** A new frameless `alwaysOnTop` Electron BrowserWindow (`webcam-preview`) renders its own `<video>` element from a second `getUserMedia` consumer on the same device. Shape state is persisted as a user preference in a JSON file in `app.getPath("userData")`, read by both the preview window and the video editor on new-recording load. Window lifecycle and shape reads/writes go through a new `electron/ipc/webcamPreviewIpc.ts` module.

**Tech Stack:** Electron 39, React 18, TypeScript, Tailwind, Radix UI, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-11-webcam-preview-design.md`

---

## File Structure

**New files:**
- `electron/ipc/webcamPreviewIpc.ts` — IPC handlers for preview window lifecycle and shape persistence
- `src/components/webcam-preview/WebcamPreviewWindow.tsx` — renderer component for the preview window
- `src/components/webcam-preview/ShapeSelector.tsx` — hover-revealed shape-selection toolbar
- `src/hooks/useWebcamShape.ts` — renderer hook wrapping shape IPC
- `src/hooks/useWebcamShape.test.ts` — unit tests for the hook
- `src/lib/webcamPreviewAspect.ts` — pure function mapping shape → aspect ratio
- `src/lib/webcamPreviewAspect.test.ts` — unit tests for the mapping

**Modified files:**
- `electron/windows.ts` — add `createWebcamPreviewWindow()`
- `electron/main.ts` — register new IPC handlers, track preview window handle
- `electron/preload.ts` — expose new IPC channels
- `src/vite-env.d.ts` — add TypeScript types for new `electronAPI` methods
- `src/App.tsx` — dispatch `windowType=webcam-preview` to `WebcamPreviewWindow`
- `src/hooks/useScreenRecorder.ts` — open/close preview window when webcam is toggled; forward device changes
- `src/components/video-editor/VideoEditor.tsx` — on new-recording load, initialize `webcamMaskShape` from the persisted preference

---

## Task 0: Verification Spike — Two-Consumer `getUserMedia`

**Purpose:** Before building the full IPC plumbing, verify that a second renderer (the preview window) can call `getUserMedia` on the same camera while the recorder is also using it. If this fails on Windows, the plan changes materially (fallback via `MediaStreamTrack.captureStream()` over `MessageChannel` becomes mandatory).

**Files:** Temporary spike only — no committed code.

- [ ] **Step 1: Launch dev server and enable webcam manually**

Run: `npm run dev`
In the launch window, enable the webcam toggle. Confirm the recorder acquires a stream (toggle should succeed; `webcamStream.current` becomes non-null in devtools).

- [ ] **Step 2: Open a second renderer and call `getUserMedia` on the same device**

In Electron devtools for the launch window, open a second window with:

```js
const w = window.open("", "", "width=320,height=320");
w.document.body.innerHTML = '<video id="v" autoplay playsinline muted></video>';
setTimeout(async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  w.document.getElementById("v").srcObject = stream;
}, 500);
```

Expected: the second window shows the camera feed simultaneously with the first stream being active.

- [ ] **Step 3: Decide on implementation path**

- **If both streams coexist:** proceed with the plan as written below.
- **If second `getUserMedia` fails:** stop here. Create an issue note in the plan document and switch to the fallback architecture (the preview window receives frames over `MessageChannel` from the LaunchWindow renderer via `MediaStreamTrack.captureStream()`). The rest of this plan assumes the direct path works.

No commit for this task — it is a go/no-go gate.

---

## Task 1: Aspect Ratio Mapping Module

**Files:**
- Create: `src/lib/webcamPreviewAspect.ts`
- Test: `src/lib/webcamPreviewAspect.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/webcamPreviewAspect.test.ts`:

```ts
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
});

describe("getPreviewSizeBounds", () => {
  it("returns 1:1 bounds for circle/square", () => {
    expect(getPreviewSizeBounds("circle")).toEqual({ min: 180, max: 600, defaultSize: 320 });
    expect(getPreviewSizeBounds("square")).toEqual({ min: 180, max: 600, defaultSize: 320 });
  });

  it("returns 16:9-friendly bounds for rectangle/rounded", () => {
    expect(getPreviewSizeBounds("rectangle")).toEqual({ min: 256, max: 960, defaultSize: 480 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/webcamPreviewAspect.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/webcamPreviewAspect.ts`:

```ts
import type { WebcamMaskShape } from "@/components/video-editor/types";

export function getPreviewAspectRatio(
  shape: WebcamMaskShape,
  nativeWidth: number,
  nativeHeight: number,
): number {
  if (shape === "circle" || shape === "square") return 1;
  if (nativeWidth > 0 && nativeHeight > 0) return nativeWidth / nativeHeight;
  return 16 / 9;
}

export type PreviewSizeBounds = {
  min: number;
  max: number;
  defaultSize: number;
};

export function getPreviewSizeBounds(shape: WebcamMaskShape): PreviewSizeBounds {
  if (shape === "circle" || shape === "square") {
    return { min: 180, max: 600, defaultSize: 320 };
  }
  return { min: 256, max: 960, defaultSize: 480 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/webcamPreviewAspect.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/webcamPreviewAspect.ts src/lib/webcamPreviewAspect.test.ts
git commit -m "Add webcam preview aspect ratio mapping module"
```

---

## Task 2: IPC Shape Persistence Module

**Purpose:** Single source of truth for the user's preferred webcam shape, persisted to disk so it survives app restarts and is readable from any renderer.

**Files:**
- Create: `electron/ipc/webcamPreviewIpc.ts`

- [ ] **Step 1: Create the persistence module skeleton**

Create `electron/ipc/webcamPreviewIpc.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";

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
  cachedSettings = settings;
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf8");
}

function isValidShape(value: unknown): value is WebcamPreviewShape {
  return value === "rectangle" || value === "circle" || value === "square" || value === "rounded";
}

export function registerWebcamPreviewIpc(): void {
  ipcMain.handle("webcam-shape:get", async (): Promise<WebcamPreviewShape> => {
    const settings = await loadSettings();
    return settings.shape;
  });

  ipcMain.handle("webcam-shape:set", async (_event, shape: unknown): Promise<WebcamPreviewShape> => {
    if (!isValidShape(shape)) throw new Error(`Invalid webcam shape: ${String(shape)}`);
    await saveSettings({ shape });
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send("webcam-shape:changed", shape);
    });
    return shape;
  });
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: no errors for `electron/ipc/webcamPreviewIpc.ts`.

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/webcamPreviewIpc.ts
git commit -m "Add webcam preview IPC persistence module"
```

---

## Task 3: `createWebcamPreviewWindow` in `electron/windows.ts`

**Files:**
- Modify: `electron/windows.ts`

- [ ] **Step 1: Add the new window factory**

At the bottom of `electron/windows.ts`, add:

```ts
let webcamPreviewWindow: BrowserWindow | null = null;

export function getWebcamPreviewWindow(): BrowserWindow | null {
  return webcamPreviewWindow;
}

export function createWebcamPreviewWindow(deviceId: string | undefined): BrowserWindow {
  if (webcamPreviewWindow && !webcamPreviewWindow.isDestroyed()) {
    webcamPreviewWindow.show();
    webcamPreviewWindow.focus();
    return webcamPreviewWindow;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;

  const windowWidth = 320;
  const windowHeight = 320;
  const margin = 24;

  const x = Math.floor(workArea.x + workArea.width - windowWidth - margin);
  const y = Math.floor(workArea.y + workArea.height - windowHeight - margin);

  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 180,
    minHeight: 180,
    maxWidth: 960,
    maxHeight: 960,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: true,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: !HEADLESS,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  win.setAspectRatio(1);

  webcamPreviewWindow = win;

  win.on("closed", () => {
    if (webcamPreviewWindow === win) {
      webcamPreviewWindow = null;
    }
  });

  const query: Record<string, string> = { windowType: "webcam-preview" };
  if (deviceId) query.deviceId = deviceId;

  if (VITE_DEV_SERVER_URL) {
    const params = new URLSearchParams(query).toString();
    win.loadURL(`${VITE_DEV_SERVER_URL}?${params}`);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"), { query });
  }

  return win;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add electron/windows.ts
git commit -m "Add createWebcamPreviewWindow factory"
```

---

## Task 4: Register Preview Lifecycle IPC Handlers

**Purpose:** Handle `webcam-preview:open`, `:close`, `:set-device`, `:set-aspect`, and `:request-close` events from renderers.

**Files:**
- Modify: `electron/ipc/webcamPreviewIpc.ts`
- Modify: `electron/main.ts`

- [ ] **Step 1: Add lifecycle handlers to the IPC module**

Add to `electron/ipc/webcamPreviewIpc.ts` (below `registerWebcamPreviewIpc`):

```ts
import { createWebcamPreviewWindow, getWebcamPreviewWindow } from "../windows";

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
}
```

- [ ] **Step 2: Register both handlers from `main.ts`**

In `electron/main.ts`, add import near the existing `registerIpcHandlers` import:

```ts
import {
  registerWebcamPreviewIpc,
  registerWebcamPreviewLifecycleIpc,
} from "./ipc/webcamPreviewIpc";
```

Inside `app.whenReady().then(async () => { ... })` — just before `registerIpcHandlers(...)` — add:

```ts
registerWebcamPreviewIpc();
registerWebcamPreviewLifecycleIpc({
  onRequestDisableWebcam: () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("webcam-preview:disable-webcam");
    }
  },
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/webcamPreviewIpc.ts electron/main.ts
git commit -m "Register webcam preview IPC lifecycle handlers"
```

---

## Task 5: Preload Bindings + TypeScript Types

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/vite-env.d.ts`

- [ ] **Step 1: Expose new IPC methods in preload**

In `electron/preload.ts`, inside the `contextBridge.exposeInMainWorld("electronAPI", { ... })` object, add:

```ts
openWebcamPreview: (deviceId: string | undefined) => {
  ipcRenderer.send("webcam-preview:open", deviceId);
},
closeWebcamPreview: () => {
  ipcRenderer.send("webcam-preview:close");
},
setWebcamPreviewDevice: (deviceId: string | undefined) => {
  ipcRenderer.send("webcam-preview:set-device", deviceId);
},
setWebcamPreviewAspect: (ratio: number) => {
  ipcRenderer.send("webcam-preview:set-aspect", ratio);
},
requestCloseWebcamPreview: () => {
  ipcRenderer.send("webcam-preview:request-close");
},
getWebcamShape: (): Promise<"rectangle" | "circle" | "square" | "rounded"> => {
  return ipcRenderer.invoke("webcam-shape:get");
},
setWebcamShape: (shape: "rectangle" | "circle" | "square" | "rounded") => {
  return ipcRenderer.invoke("webcam-shape:set", shape);
},
onWebcamShapeChanged: (
  callback: (shape: "rectangle" | "circle" | "square" | "rounded") => void,
) => {
  const listener = (_event: Electron.IpcRendererEvent, shape: "rectangle" | "circle" | "square" | "rounded") => {
    callback(shape);
  };
  ipcRenderer.on("webcam-shape:changed", listener);
  return () => ipcRenderer.removeListener("webcam-shape:changed", listener);
},
onWebcamPreviewDeviceChanged: (callback: (deviceId: string | undefined) => void) => {
  const listener = (_event: Electron.IpcRendererEvent, deviceId: string | undefined) => {
    callback(deviceId);
  };
  ipcRenderer.on("webcam-preview:device-changed", listener);
  return () => ipcRenderer.removeListener("webcam-preview:device-changed", listener);
},
onDisableWebcamRequested: (callback: () => void) => {
  const listener = () => callback();
  ipcRenderer.on("webcam-preview:disable-webcam", listener);
  return () => ipcRenderer.removeListener("webcam-preview:disable-webcam", listener);
},
```

- [ ] **Step 2: Add TypeScript types to `src/vite-env.d.ts`**

In `src/vite-env.d.ts`, inside the `electronAPI` interface (anywhere in the object), add:

```ts
openWebcamPreview: (deviceId: string | undefined) => void;
closeWebcamPreview: () => void;
setWebcamPreviewDevice: (deviceId: string | undefined) => void;
setWebcamPreviewAspect: (ratio: number) => void;
requestCloseWebcamPreview: () => void;
getWebcamShape: () => Promise<"rectangle" | "circle" | "square" | "rounded">;
setWebcamShape: (
  shape: "rectangle" | "circle" | "square" | "rounded",
) => Promise<"rectangle" | "circle" | "square" | "rounded">;
onWebcamShapeChanged: (
  callback: (shape: "rectangle" | "circle" | "square" | "rounded") => void,
) => () => void;
onWebcamPreviewDeviceChanged: (callback: (deviceId: string | undefined) => void) => () => void;
onDisableWebcamRequested: (callback: () => void) => () => void;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add electron/preload.ts src/vite-env.d.ts
git commit -m "Expose webcam preview IPC methods to renderer"
```

---

## Task 6: `useWebcamShape` Hook + Test

**Files:**
- Create: `src/hooks/useWebcamShape.ts`
- Create: `src/hooks/useWebcamShape.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useWebcamShape.test.ts`:

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWebcamShape } from "./useWebcamShape";

type ElectronApiMock = {
  getWebcamShape: ReturnType<typeof vi.fn>;
  setWebcamShape: ReturnType<typeof vi.fn>;
  onWebcamShapeChanged: ReturnType<typeof vi.fn>;
};

let lastChangeHandler: ((shape: "rectangle" | "circle" | "square" | "rounded") => void) | null = null;

function installMock(initialShape: "rectangle" | "circle" | "square" | "rounded" = "circle"): ElectronApiMock {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useWebcamShape.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useWebcamShape.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useWebcamShape.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useWebcamShape.ts src/hooks/useWebcamShape.test.ts
git commit -m "Add useWebcamShape hook with IPC-backed persistence"
```

---

## Task 7: `ShapeSelector` Component

**Purpose:** A small pill-shaped toolbar with three icon buttons (Circle / Square / Original) that appears on hover over the preview bubble.

**Files:**
- Create: `src/components/webcam-preview/ShapeSelector.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/webcam-preview/ShapeSelector.tsx`:

```tsx
import { Circle, RectangleHorizontal, Square } from "lucide-react";
import type { WebcamMaskShape } from "@/components/video-editor/types";
import { cn } from "@/lib/utils";

type ShapeOption = {
  value: WebcamMaskShape;
  label: string;
  Icon: typeof Circle;
};

const OPTIONS: ShapeOption[] = [
  { value: "circle", label: "Circle", Icon: Circle },
  { value: "square", label: "Square", Icon: Square },
  { value: "rectangle", label: "Original", Icon: RectangleHorizontal },
];

type Props = {
  value: WebcamMaskShape;
  onChange: (shape: WebcamMaskShape) => void;
  visible: boolean;
};

export function ShapeSelector({ value, onChange, visible }: Props) {
  return (
    <div
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      className={cn(
        "absolute bottom-3 left-1/2 -translate-x-1/2",
        "flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 shadow-lg backdrop-blur-sm",
        "transition-opacity duration-150",
        visible ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
    >
      {OPTIONS.map(({ value: optionValue, label, Icon }) => {
        const selected = optionValue === value;
        return (
          <button
            key={optionValue}
            type="button"
            aria-label={label}
            aria-pressed={selected}
            onClick={() => onChange(optionValue)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
              selected ? "bg-white text-black" : "text-white/80 hover:bg-white/20",
            )}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (If `WebkitAppRegion` is not a recognized CSS property in React's types, the cast to `React.CSSProperties` handles it.)

- [ ] **Step 3: Commit**

```bash
git add src/components/webcam-preview/ShapeSelector.tsx
git commit -m "Add ShapeSelector hover toolbar component"
```

---

## Task 8: `WebcamPreviewWindow` Component

**Files:**
- Create: `src/components/webcam-preview/WebcamPreviewWindow.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/webcam-preview/WebcamPreviewWindow.tsx`:

```tsx
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useWebcamShape } from "@/hooks/useWebcamShape";
import { getPreviewAspectRatio } from "@/lib/webcamPreviewAspect";
import { getCssClipPath } from "@/lib/webcamMaskShapes";
import { cn } from "@/lib/utils";
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
  const [hovering, setHovering] = useState(false);
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
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
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
    const api = window.electronAPI;
    if (!api) return;
    return api.onWebcamPreviewDeviceChanged((next) => {
      setDeviceId(next);
    });
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    const nativeWidth = streamState.kind === "ready" ? streamState.width : 0;
    const nativeHeight = streamState.kind === "ready" ? streamState.height : 0;
    const ratio = getPreviewAspectRatio(shape, nativeWidth, nativeHeight);
    api.setWebcamPreviewAspect(ratio);
  }, [shape, streamState]);

  const clipPath = getCssClipPath(shape) ?? "none";

  return (
    <div
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      className="relative h-screen w-screen overflow-hidden bg-transparent"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div
        className={cn(
          "absolute inset-0 overflow-hidden bg-black",
          shape === "circle" && "rounded-full",
        )}
        style={{ clipPath }}
      >
        {streamState.kind === "ready" && (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
          />
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
          hovering ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        <X size={12} />
      </button>

      <ShapeSelector value={shape} onChange={setShape} visible={hovering} />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/webcam-preview/WebcamPreviewWindow.tsx
git commit -m "Add WebcamPreviewWindow component"
```

---

## Task 9: Wire `WebcamPreviewWindow` into `App.tsx` Dispatch

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the new case to the window-type switch**

Edit `src/App.tsx`. Add the import at the top with the other component imports:

```tsx
import { WebcamPreviewWindow } from "./components/webcam-preview/WebcamPreviewWindow";
```

In the `useEffect` that checks `windowType`, update the transparent-background condition:

```tsx
if (type === "hud-overlay" || type === "source-selector" || type === "webcam-preview") {
  document.body.style.background = "transparent";
  document.documentElement.style.background = "transparent";
  document.getElementById("root")?.style.setProperty("background", "transparent");
}
```

Then inside the `switch (windowType)` block, add:

```tsx
case "webcam-preview":
  return <WebcamPreviewWindow />;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Smoke test manually**

Run: `npm run dev`

Open the Electron devtools on the LaunchWindow. In the console:

```js
window.electronAPI.openWebcamPreview(undefined);
```

Expected: a 320×320 transparent bubble appears bottom-right of the primary display, shows the webcam feed (or a "Camera unavailable" message if denied), and is draggable. Click the X button — bubble closes. Hover — see the shape selector at the bottom. Click shape buttons — clip-path on the video updates; the window resizes to 16:9 when "Original" is picked.

If anything is broken, fix it now before moving on. Record what you found and fixed in the commit message.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "Dispatch webcam-preview window type to WebcamPreviewWindow"
```

---

## Task 10: Open/Close Preview on Webcam Toggle in `useScreenRecorder`

**Files:**
- Modify: `src/hooks/useScreenRecorder.ts`

- [ ] **Step 1: Open the preview window when the webcam is enabled**

In `src/hooks/useScreenRecorder.ts`, find `setWebcamEnabled` (starts around line 173). Replace its body with:

```ts
const setWebcamEnabled = useCallback(
  async (enabled: boolean) => {
    if (!enabled) {
      setWebcamEnabledState(false);
      window.electronAPI?.closeWebcamPreview();
      return true;
    }

    const accessResult = await requestCameraAccess();
    if (!accessResult.success) {
      toast.error(t("recording.failedCameraAccess"));
      return false;
    }

    if (!accessResult.granted) {
      toast.error(t("recording.cameraBlocked"));
      return false;
    }

    setWebcamEnabledState(true);
    window.electronAPI?.openWebcamPreview(webcamDeviceId);
    return true;
  },
  [t, webcamDeviceId],
);
```

- [ ] **Step 2: Forward device changes to the preview window**

Add the following effect to the body of `useScreenRecorder` (just after the existing `useEffect` that wires `onStopRecordingFromTray`, before the return statement):

```ts
useEffect(() => {
  if (!webcamEnabled) return;
  window.electronAPI?.setWebcamPreviewDevice(webcamDeviceId);
}, [webcamEnabled, webcamDeviceId]);
```

- [ ] **Step 3: React to the preview window's "disable webcam" request**

Add another effect just after Step 2's effect:

```ts
useEffect(() => {
  const api = window.electronAPI;
  if (!api) return;
  return api.onDisableWebcamRequested(() => {
    setWebcamEnabledState(false);
  });
}, []);
```

- [ ] **Step 4: Close the preview window when recording finalizes or the hook unmounts**

At the end of `teardownMedia` (around line 171, after the `mixingContext.current = null` block), add:

```ts
window.electronAPI?.closeWebcamPreview();
```

Wait — do NOT add this to `teardownMedia`. The preview window should stay open if the webcam is still enabled after recording stops. Instead, add a cleanup effect for when the recorder hook unmounts:

```ts
useEffect(() => {
  return () => {
    window.electronAPI?.closeWebcamPreview();
  };
}, []);
```

Add this as a separate effect in the body of `useScreenRecorder`.

- [ ] **Step 5: Manual test**

Run: `npm run dev`

Enable the webcam in the LaunchWindow → preview should appear.
Switch camera device → preview should re-acquire with the new device.
Start recording → preview stays visible.
Stop recording → preview stays visible (as long as webcam toggle is still on).
Disable webcam toggle → preview closes.
Enable webcam → preview reopens.
Click X button on preview → webcam toggle in LaunchWindow flips off.

Fix any issues before committing.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useScreenRecorder.ts
git commit -m "Open webcam preview window when webcam is enabled"
```

---

## Task 11: Initialize Editor `webcamMaskShape` from Preview Preference

**Purpose:** When a new recording is loaded into the video editor, pick up the shape the user chose in the preview so the exported video matches (WYSIWYG).

**Files:**
- Modify: `src/components/video-editor/VideoEditor.tsx`

- [ ] **Step 1: Find the effect that handles new-recording loads**

Read `src/components/video-editor/VideoEditor.tsx` and locate the effect that fires when a new recording session is loaded (the place where `pushState` or the initial state setter is called after `getCurrentRecordingSession`). Check `git grep -n "getCurrentRecordingSession\|setCurrentRecordingSession" src/components/video-editor/VideoEditor.tsx` and the surrounding `useEffect`.

- [ ] **Step 2: Add an effect that reads the persisted shape and applies it**

Near the other initialization effects in `VideoEditor.tsx`, add:

```tsx
useEffect(() => {
  const api = window.electronAPI;
  if (!api) return;
  let cancelled = false;
  api
    .getWebcamShape()
    .then((shape) => {
      if (cancelled) return;
      pushState({ webcamMaskShape: shape });
    })
    .catch(() => {});
  return () => {
    cancelled = true;
  };
}, [pushState]);
```

**Important:** only apply this on initial mount — if the user loaded a saved project file, that project's `webcamMaskShape` should win. Wrap the effect so it only runs when the current project was loaded from a fresh recording (no saved project path). The exact condition depends on existing state; the simplest gate is to check whether `currentProjectPath` is null at the time the effect runs:

```tsx
useEffect(() => {
  const api = window.electronAPI;
  if (!api) return;
  // Only override from preview preference when this is a fresh recording
  // (i.e. not a project loaded from disk).
  if (currentProjectPath) return;
  let cancelled = false;
  api
    .getWebcamShape()
    .then((shape) => {
      if (cancelled) return;
      pushState({ webcamMaskShape: shape });
    })
    .catch(() => {});
  return () => {
    cancelled = true;
  };
}, [currentProjectPath, pushState]);
```

If the variable name in the editor differs from `currentProjectPath`, use the equivalent in the current file (e.g. whatever tracks "this editor was opened from a saved .openscreen file vs. a recording").

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual test**

1. Launch app → enable webcam → pick "Square" in the preview bubble → start recording → record 2 seconds → stop.
2. Editor opens. Check the video editor's webcam shape control — should show "Square", not the previous default of "Rectangle".
3. Export the video. Webcam in the exported file should appear as a square.
4. Load a saved `.openscreen` project that stored `webcamMaskShape: "circle"`. Verify the editor uses "circle" (not overridden by the preference).

- [ ] **Step 5: Commit**

```bash
git add src/components/video-editor/VideoEditor.tsx
git commit -m "Initialize editor webcam shape from preview preference on new recordings"
```

---

## Task 12: Manual QA Pass

No code — run the full end-to-end verification matrix from the spec. Fix any issues found, committing fixes as separate commits with descriptive messages.

- [ ] **Step 1: Enable webcam in LaunchWindow → preview appears bottom-right at 320×320.**
- [ ] **Step 2: Drag preview to a new position → survives across start/stop recording.**
- [ ] **Step 3: Switch shape circle → square → original → aspect locks, clip updates, bubble does not jump to a weird position. (macOS and Windows only; Linux aspect-lock is best-effort.)**
- [ ] **Step 4: Record a short clip → export → webcam in the final video matches the shape shown live.**
- [ ] **Step 5: Disable webcam → preview window closes.**
- [ ] **Step 6: Close preview via X → webcam toggle flips off in LaunchWindow.**
- [ ] **Step 7: Record while another app is fullscreen → preview still floats above.**
- [ ] **Step 8: Change webcam device (USB vs built-in) while preview is open → preview updates to the new device.**
- [ ] **Step 9: Deny camera permission once → preview shows "Camera unavailable" error state without crashing.**
- [ ] **Step 10: Unplug USB camera mid-preview → error state appears; LaunchWindow toggle flips off.**

Any bugs → fix → commit fix with a specific message (e.g. "Fix preview window not closing on webcam disable").

---

## Self-Review

### Spec coverage check

| Spec section | Implementing task |
|---|---|
| New Electron window with HUD-pattern flags | Task 3 |
| New renderer route + component with own `getUserMedia` | Tasks 8, 9 |
| Shape selector UI in preview (hover toolbar, 3 options) | Tasks 7, 8 |
| Reuse `WebcamMaskShape`, `getCssClipPath`, `drawCanvasClipPath` | Tasks 7, 8 (no modification to export pipeline) |
| Main-process shape persistence + IPC get/set | Task 2 |
| `useWebcamShape` hook | Task 6 |
| Window lifecycle IPC (open/close/device-change) | Tasks 4, 5, 10 |
| Shape change → setAspectRatio IPC | Tasks 4, 5, 8 |
| Drag via `-webkit-app-region: drag` | Task 8 |
| Error handling: getUserMedia rejected, track ended | Task 8 |
| Close-button → disable-webcam sync | Tasks 4, 5, 8, 10 |
| WYSIWYG: editor picks up shape from preview preference | Task 11 |
| Step-0 verification of two-consumer `getUserMedia` | Task 0 |
| Unit tests for hook and aspect mapping | Tasks 1, 6 |
| Manual E2E matrix | Task 12 |

All spec items covered.

### Placeholder scan

Searched for "TBD", "TODO", "FIXME", "implement later". None found. Every code block is complete runnable code (except Task 11 step 2, which intentionally has a conditional logic note that depends on actual editor state naming — this is called out explicitly as a lookup in Task 11 step 1).

### Type consistency check

- `WebcamMaskShape` is imported from `@/components/video-editor/types` in all renderer code.
- The main-process `WebcamPreviewShape` type mirrors `WebcamMaskShape` exactly (`"rectangle" | "circle" | "square" | "rounded"`) — declared separately to keep main process independent of renderer imports.
- `getWebcamShape` / `setWebcamShape` signatures match between preload (Task 5) and the hook (Task 6).
- `openWebcamPreview` signature: `(deviceId: string | undefined) => void` — matches in preload, `vite-env.d.ts`, and the call site in `useScreenRecorder` (Task 10).
- `getPreviewAspectRatio(shape, nativeWidth, nativeHeight)` — same signature in Task 1's test, implementation, and Task 8's call site.

### Scope check

Single feature, single subsystem. Not too large for one plan.
