# Webcam Live Preview with Shape Selection

**Date:** 2026-04-11
**Status:** Approved, moving to implementation plan

## Problem

When the webcam is enabled during a recording session, there is no live preview — the user cannot see themselves to frame the shot (unlike Loom, which shows a floating camera bubble). There is also no way to choose how the webcam is framed (circle vs. square vs. native aspect ratio) before or during recording.

## Goals

1. A floating, always-on-top webcam preview window that appears whenever the webcam is enabled and disappears when it is disabled — visible over any app, including fullscreen.
2. A shape selector (Circle / Square / Original) inside the preview window itself, controllable on hover.
3. The shape selected live in the preview is also the shape applied in the final exported video (WYSIWYG).
4. The preview is draggable to any position on screen and resizable, with aspect ratio locked per shape.

## Non-Goals

- Mirroring/flipping the webcam preview.
- Background blur / replacement in the preview.
- Per-shape corner-radius customization (the existing `rounded` variant in `webcamMaskShapes.ts` stays export-only; the new preview UI exposes only circle/square/rectangle).
- Click-through on the preview window.

## Architecture

### New Electron window

`createWebcamPreviewWindow(deviceId, shape)` in `electron/windows.ts`, patterned on the existing `createHudOverlayWindow` (`electron/windows.ts:20-75`).

Key `BrowserWindow` options:
- `frame: false`, `transparent: true`, `alwaysOnTop: true`, `skipTaskbar: true`
- `resizable: true`, `movable: true`, `hasShadow: false`
- `webPreferences`: same preload as existing windows
- Default size: 320×320
- Default position: bottom-right of the primary display with a 24px margin
- Loads `index.html?windowType=webcam-preview`

### New renderer route

`WebcamPreviewWindow.tsx`, added to the `App.tsx` window-type dispatch (`src/App.tsx:14-22`) alongside `LaunchWindow`, `VideoEditor`, and `SourceSelector`.

Responsibilities:
- Opens its own `getUserMedia({ video: { deviceId } })` stream. Modern Chromium multiplexes device access, so a second consumer on the same device coexists with the recorder's stream.
- Renders a single `<video autoPlay muted playsInline>` inside a shape-clipped container.
- Whole window drags via `-webkit-app-region: drag` on the outer div. Buttons use `no-drag`.
- Shape-selector toolbar pinned to the bottom of the bubble, fades in on hover (150ms), three icon buttons (Circle / Square / Original). Currently-selected shape is highlighted. Built with existing Radix + Tailwind primitives.

### Reused, not rebuilt

- `WebcamMaskShape` type in `src/components/video-editor/types.ts` — the `"rectangle"` value is surfaced in the UI as "Original" (matches camera native aspect).
- `getCssClipPath()` from `src/lib/webcamMaskShapes.ts` for the live clip.
- `drawCanvasClipPath()` in the same module keeps working unchanged at export time — same shape state feeds both pipelines.
- Compositing pipeline in `src/lib/exporter/videoExporter.ts` and `src/lib/exporter/frameRenderer.ts` is untouched.

## Data Flow

### Single source of truth: main process

Shape needs to be shared across three windows (LaunchWindow, WebcamPreviewWindow, VideoEditor) and persisted across window reopens. `localStorage` is not shared across Electron `BrowserWindows`, so the main process owns it.

New module: `electron/ipc/webcamShape.ts`
- In-memory state: `currentShape: WebcamMaskShape`, default `"circle"`.
- Persisted to disk alongside other settings (same mechanism as existing settings — reuse, do not invent).
- `ipcMain.handle("webcam-shape:get")` → returns `currentShape`.
- `ipcMain.on("webcam-shape:set", shape)` → updates state, persists, broadcasts.
- Broadcast: `webContents.getAllWebContents().forEach(wc => wc.send("webcam-shape:changed", shape))`.

### Renderer-side hook: `useWebcamShape()`

`src/hooks/useWebcamShape.ts`
- Calls `webcam-shape:get` on mount.
- Subscribes to `webcam-shape:changed` broadcasts.
- Provides `setShape()` that fires `webcam-shape:set`.
- Returns `{ shape, setShape }`.

Consumers:
- `WebcamPreviewWindow` (reads + writes).
- `useScreenRecorder` (reads — for export pipeline to pick up the current shape).
- Any existing video-editor surface that reads export shape (replace direct access with the hook).

### Window lifecycle

Preview opens and closes in lockstep with the webcam toggle in `useScreenRecorder`:

```
useScreenRecorder.setWebcamEnabled(true)
  ├─ requestCameraAccess()                             (existing)
  ├─ getUserMedia → webcamStream.current               (existing)
  └─ ipcRenderer.send("webcam-preview:open", deviceId) (NEW)
       └─ main: createWebcamPreviewWindow(deviceId, currentShape)

useScreenRecorder.setWebcamEnabled(false)
  └─ ipcRenderer.send("webcam-preview:close")          (NEW)
       └─ main: webcamPreviewWindow?.close()
```

Device change (user picks a different camera in LaunchWindow):
```
ipcRenderer.send("webcam-preview:device-change", newDeviceId)
  └─ main forwards to preview window
       └─ preview re-acquires getUserMedia with new deviceId
```

### Shape change flow (WYSIWYG)

```
User clicks "Square" in preview bubble
  → useWebcamShape().setShape("square")
  → ipcRenderer.send("webcam-shape:set", "square")
  → main updates state, persists, broadcasts "webcam-shape:changed"
  → preview window:
     - updates clip-path on <video>
     - sends "webcam-preview:set-aspect" 1.0 to main
     - main calls window.setAspectRatio(1.0)
  → video editor / exporter read the new shape on next render
```

## Shape → Window Behavior

| Shape | Aspect | Clip-path on video | Min size | Max size |
|---|---|---|---|---|
| `circle` | 1:1 | `circle(50%)` | 180×180 | 600×600 |
| `square` | 1:1 | none | 180×180 | 600×600 |
| `rectangle` (UI label: "Original") | camera native (typically 16:9) | none | 256×144 | 960×540 |

### Aspect ratio enforcement

Uses Electron's `BrowserWindow.setAspectRatio(ratio)` — supported on macOS and Windows. On shape change, preview sends `webcam-preview:set-aspect` with the target ratio; main calls `setAspectRatio()`. Linux is best-effort: the window remains resizable, aspect is not enforced during drag. This is documented as a known platform limitation; acceptable because the primary target platforms are Windows and macOS.

### "Original" aspect computation

Camera native aspect is read once from `webcamStream.getVideoTracks()[0].getSettings()` (`width / height`) after the stream starts. Fallback: `16/9` when settings are unavailable.

### Drag

`-webkit-app-region: drag` on the full-bleed outer container; `no-drag` on the shape-selector buttons and close button. No `react-rnd` — Electron handles window drag natively.

## Error Handling

| Scenario | Behavior |
|---|---|
| `getUserMedia` rejects (permission denied) | Preview window shows compact error state: "Camera unavailable" with a retry button. Does not crash recording. |
| Device disconnects mid-session (`track.onended`) | Preview shows error state; IPC notifies main; LaunchWindow webcam toggle flips off. |
| Second `getUserMedia` on same device fails (rare, some Linux configs) | Fallback path: preview requests main renderer to forward frames via `MediaStreamTrack.captureStream()` over a `MessageChannel`. **Only build this if Step-0 verification shows it is needed.** |
| Preview window closed manually (X button) | Treated as "disable webcam" — IPC flips the LaunchWindow webcam toggle off. |
| Shape changed while recording | Live preview updates immediately. Exporter reads shape at export time, so the final video matches. |

## Testing

### Unit
- `useWebcamShape` hook: mock `ipcRenderer`, verify get/set/subscribe behavior.
- Shape → aspect-ratio mapping function: pure, trivial.

### Integration (Vitest browser)
- Mount `WebcamPreviewWindow` with a mocked `getUserMedia`.
- Verify shape buttons update the `clip-path` CSS on the `<video>` element.
- Verify error state appears when `getUserMedia` rejects.

### Manual E2E
1. Enable webcam in LaunchWindow → preview appears bottom-right.
2. Drag preview to a new position → survives across start/stop recording.
3. Switch shape circle → square → original → aspect locks, clip updates, bubble does not jump.
4. Record a short clip → export → webcam in the final video matches the shape shown live.
5. Disable webcam → preview window closes.
6. Close preview via X → webcam toggle flips off in LaunchWindow.
7. Record while another app is fullscreen → preview still floats above.

### Platforms
Verify on Windows (primary target) and macOS. Document Linux `setAspectRatio` limitation in-spec; no blocker.

## Step 0 — Verification required before implementation

Before building the full IPC plumbing, verify the **two-consumer `getUserMedia`** assumption on Windows (target platform). If a second `getUserMedia` on the same device fails, the fallback `captureStream()` + `MessageChannel` path becomes mandatory and the plan changes. A 10-minute spike in a fresh Electron window is enough to answer this.

## Files Touched (anticipated)

**New:**
- `electron/windows.ts` — add `createWebcamPreviewWindow()`
- `electron/ipc/webcamShape.ts` — new IPC module for shape state
- `electron/ipc/webcamPreview.ts` — new IPC module for window lifecycle
- `src/components/webcam-preview/WebcamPreviewWindow.tsx` — new renderer route
- `src/components/webcam-preview/ShapeSelector.tsx` — hover toolbar
- `src/hooks/useWebcamShape.ts` — new hook

**Modified:**
- `src/App.tsx` — dispatch on `windowType=webcam-preview`
- `src/hooks/useScreenRecorder.ts` — open/close preview window on webcam toggle, read shape via `useWebcamShape`
- `electron/main.ts` — register new IPC handlers, track preview window handle
- `electron/preload.ts` — expose new IPC channels
- Video editor / exporter — replace direct shape reads with `useWebcamShape` (one-line swap per call site)
