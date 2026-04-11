# Webcam Timeline Track

**Date:** 2026-04-11
**Status:** Approved (user authorized "no questions, build it")

## Problem

The video editor currently treats webcam position, size, shape, and layout as *single global values* applied to the whole recording. Users cannot animate the webcam — for example, moving it from bottom-right during the intro to top-left during a demo so it doesn't cover important screen content. Zoom, trim, annotation, blur, and speed all have timeline regions; webcam does not.

## Goals

1. Add a new **webcam timeline row** (alongside zoom/trim/annotation/blur/speed).
2. Allow the user to create time-bounded **webcam regions** that override the global webcam position during their time range.
3. Animate the webcam smoothly between regions with a 300 ms ease at region boundaries.
4. Support the same editing affordances as zoom regions: add, select, drag to move, resize via edge handles, delete.
5. When a region is selected, dragging the webcam on the editor canvas edits *that region's position*; otherwise dragging edits the global position (today's behavior).
6. Undo/redo via the existing `useEditorHistory` stack.
7. Persist regions in the project file schema.
8. Exporter uses the same time → position function as the editor preview so what you see is what you get.

## Non-Goals

- Time-varying **size, shape, or layout preset**. These stay global. The user explicitly picked position-only.
- Keyframe-based interpolation across arbitrary timestamps (region-based only, matches existing editor patterns).
- Overlapping webcam regions. The UI prevents creating overlaps during add/resize.
- Per-region transition duration (constant 300 ms ease for all boundaries).
- Migration tooling. Older projects simply load with an empty `webcamRegions` array.

## Architecture

The feature mirrors the existing **zoom region** plumbing (`zoomRegionUtils.ts`, `VideoEditor.tsx`, `TimelineEditor.tsx`, `VideoPlayback.tsx`, `frameRenderer.ts`, `projectPersistence.ts`). Every touched module has a parallel webcam-region construct.

### Data model

```ts
// src/components/video-editor/types.ts
export interface WebcamRegion {
  id: string;
  startMs: number;
  endMs: number;
  position: WebcamPosition; // { cx, cy } — normalized 0..1, same as global webcamPosition
}
```

Added to `EditorState` (`src/hooks/useEditorHistory.ts`):

```ts
webcamRegions: WebcamRegion[];
```

Default: `[]`. Existing projects loaded without this field get an empty array.

### Time → active position function

New pure module `src/components/video-editor/videoPlayback/webcamRegionUtils.ts`:

```ts
export interface WebcamPositionSource {
  globalPosition: WebcamPosition | null;
  regions: WebcamRegion[];
}

export function computeWebcamPositionAtTime(
  source: WebcamPositionSource,
  timeMs: number,
): WebcamPosition;
```

Algorithm:

1. Let `base = source.globalPosition ?? { cx: 0.5, cy: 0.5 }` (or the existing default).
2. Find the region active at `timeMs` (`r.startMs <= timeMs <= r.endMs`). Because regions cannot overlap, at most one matches.
3. Find the adjacent regions surrounding `timeMs` (previous region that ended before `timeMs`; next region that starts after `timeMs`).
4. Compute the *current target position* = active region's position if one exists, else `base`.
5. Compute the *incoming position* — if `timeMs` is within 300 ms of a region start, lerp from the previous target (`base` or previous region) to the new target using an ease-in-out cubic.
6. Compute the *outgoing position* — if `timeMs` is within 300 ms of a region end AND no new region begins immediately, lerp from the region's position back to `base`.
7. Return the final `{ cx, cy }`.

The function is pure and covered by unit tests for these cases:
- No regions → returns base
- Inside a region, far from boundaries → returns region position
- Before any region → returns base
- After all regions → returns base
- Near start boundary → interpolated between base and region
- Near end boundary → interpolated between region and base
- Back-to-back regions (no gap) → interpolated directly between A and B at the shared boundary
- Null global position → fallback to center (0.5, 0.5)

### Timeline UI

`TimelineEditor.tsx` adds:

- `WEBCAM_ROW_ID = "row-webcam"` alongside `ZOOM_ROW_ID`, `TRIM_ROW_ID`, etc.
- A new row in the row list with a hint "Press W to add webcam" when empty (mirrors the zoom hint).
- A new add-webcam button in the toolbar next to the zoom button (icon: `Webcam` from lucide-react).
- The `W` keyboard shortcut adds a region at the playhead (same pattern as `Z` for zoom).
- Existing `Item.tsx` rendering is extended with a webcam variant: glass-blue style, displays a short label ("cam" or a position indicator like "cam ⬉").

### Canvas interaction

`VideoPlayback.tsx` changes:

- Accepts `webcamRegions`, `selectedWebcamRegionId`, `onWebcamRegionPositionChange`, and keeps the existing `onWebcamPositionChange` for the global case.
- At each playback frame, calls `computeWebcamPositionAtTime({ globalPosition, regions }, currentTimeMs)` and uses the result for the webcam overlay's rendered position.
- Drag behavior: if `selectedWebcamRegionId` is set, drag calls `onWebcamRegionPositionChange(id, newPos)`. Otherwise it falls through to the existing global `onWebcamPositionChange` path.

### Exporter integration

`src/lib/exporter/frameRenderer.ts`:

- Reads `webcamRegions` from `config`.
- Replaces the direct use of `webcamPosition` in the composite step with `computeWebcamPositionAtTime({ globalPosition: webcamPosition, regions: webcamRegions }, frameTimeMs)`.
- No changes to `compositeLayout.ts` — the layout function still takes a single `position` argument. We just compute which position to pass in.
- `videoExporter.ts` is updated to forward `webcamRegions` to the renderer config.

### VideoEditor wiring

`VideoEditor.tsx` adds handlers parallel to the existing zoom handlers:

- `handleWebcamRegionAdded` — adds a new region at the playhead with `startMs = now`, `endMs = now + 3000` (or clamped to video length), `position = current computed position at now`, and a generated id. Pushes to history. Refuses overlap.
- `handleWebcamRegionSelect` — sets `selectedWebcamRegionId`.
- `handleWebcamRegionSpanChange` — updates `startMs`/`endMs` via `pushState`, refuses overlap.
- `handleWebcamRegionPositionChange` — live preview via `updateState`, commits on pointer-up via `pushState`.
- `handleWebcamRegionDelete` — removes the region and clears selection.

New state: `const [selectedWebcamRegionId, setSelectedWebcamRegionId] = useState<string | null>(null);`

ID counter: `nextWebcamRegionIdRef.current` (follows the `nextZoomIdRef` pattern).

### Project persistence

`src/components/video-editor/projectPersistence.ts`:

- `normalizeProjectEditor()` reads `webcamRegions` from the stored project (fallback `[]`), validates each entry (id string, finite startMs/endMs with start < end, position cx/cy in [0..1]), and drops invalid entries.
- `createProjectSnapshot()` (for unsaved-changes detection) includes `webcamRegions` in the stored state.
- Project schema version does NOT bump. Missing field is silently treated as `[]`. Forward-compatible.

### Load-from-recording-session path

In `VideoEditor.tsx`, the path that loads a fresh recording (Task 11 of the previous feature) doesn't need to change — `INITIAL_EDITOR_STATE.webcamRegions` is already `[]`, and the editor inherits that.

## Visual style

The new webcam timeline item uses a glass-blue style (`bg-blue-500/20 border-blue-400/40`) to distinguish it from zoom (green), annotation (yellow), blur (pink), trim (red), and speed (purple). Exact colors chosen during implementation to fit the existing palette.

## Error handling

- Attempting to create a region that overlaps an existing one: the add action is rejected with a toast ("Webcam regions cannot overlap").
- Dragging a region's edge into an overlap: clamped to the nearest non-overlapping boundary.
- Dragging a region's position on canvas: clamped to `[0..1]` in both cx and cy.
- Deleting the last region: clears `selectedWebcamRegionId` and returns the webcam to the global position.
- Loading a corrupted project: invalid entries are silently dropped.

## Testing

**Unit tests** (`webcamRegionUtils.test.ts`):
- 9 cases listed in the Algorithm section. Fully deterministic — no DOM, no refs.

**Integration smoke test** (manual):
1. Load a recording in the editor.
2. Press `W` at 2s → a 3s region appears on the webcam timeline row.
3. Scrub to 3s → canvas shows the webcam at the region's default position.
4. Select the region, drag the webcam on the canvas → region position updates.
5. Drag the region's right edge to 6s → duration extends.
6. Try to create an overlapping region → toast + no region created.
7. Export the video → the exported webcam moves as expected at region boundaries.
8. Undo (Ctrl+Z) → region removed / change reverted.
9. Save the project, reload → region persists.
10. Delete the region → webcam returns to global position.

**No automated E2E test.** The existing editor has no E2E harness for timeline interactions and adding one is out of scope.

## Files Touched

**New:**
- `src/components/video-editor/videoPlayback/webcamRegionUtils.ts`
- `src/components/video-editor/videoPlayback/webcamRegionUtils.test.ts`

**Modified:**
- `src/components/video-editor/types.ts` — `WebcamRegion` type
- `src/hooks/useEditorHistory.ts` — `webcamRegions` field + initial state
- `src/components/video-editor/VideoEditor.tsx` — handlers, state, wiring to timeline and canvas
- `src/components/video-editor/timeline/TimelineEditor.tsx` — new row, button, keyboard shortcut
- `src/components/video-editor/timeline/Item.tsx` — webcam item rendering variant
- `src/components/video-editor/VideoPlayback.tsx` — canvas interaction + position computation at playback time
- `src/lib/exporter/frameRenderer.ts` — use `computeWebcamPositionAtTime` during composite
- `src/lib/exporter/videoExporter.ts` — forward `webcamRegions` to the renderer config
- `src/components/video-editor/projectPersistence.ts` — serialize/deserialize

## Out of Scope

- Direct drag-corner resize of the webcam on the canvas
- Per-region size/shape/layout
- Keyframe animation
- Cursor-following (like zoom's auto-focus)
- Multi-select of regions
