# Webcam Timeline Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a webcam timeline row where users can create time-bounded regions that override the global webcam position, with 300ms smooth transitions at region boundaries, mirroring the existing zoom region pattern.

**Architecture:** New `WebcamRegion` type stored in `EditorState.webcamRegions`. A pure `computeWebcamPositionAtTime` function handles the time → active position lookup with interpolation. The editor preview and the frame exporter both call the same function so the exported video matches the preview. Every touched file has a parallel zoom-region construct already in it.

**Tech Stack:** React 18, TypeScript, Vitest, `dnd-timeline`.

**Spec:** `docs/superpowers/specs/2026-04-11-webcam-timeline-track-design.md`

---

## File Structure

**New:**
- `src/components/video-editor/videoPlayback/webcamRegionUtils.ts` — pure time→position function
- `src/components/video-editor/videoPlayback/webcamRegionUtils.test.ts` — unit tests

**Modified:**
- `src/components/video-editor/types.ts` — `WebcamRegion` type
- `src/hooks/useEditorHistory.ts` — `webcamRegions` field + initial state
- `src/components/video-editor/projectPersistence.ts` — serialize/deserialize
- `src/components/video-editor/VideoEditor.tsx` — state, handlers, wiring
- `src/components/video-editor/timeline/TimelineEditor.tsx` — new row, props, rendering
- `src/components/video-editor/timeline/Item.tsx` — webcam variant
- `src/components/video-editor/VideoPlayback.tsx` — canvas interaction + render-time lookup
- `src/lib/exporter/frameRenderer.ts` — use `computeWebcamPositionAtTime`
- `src/lib/exporter/videoExporter.ts` — forward `webcamRegions` to renderer config

---

## Task 1: `WebcamRegion` Type

**Files:**
- Modify: `src/components/video-editor/types.ts`

- [ ] **Step 1: Add the type**

In `src/components/video-editor/types.ts`, after the existing `WebcamPosition` interface (around line 17-20), add:

```ts
export interface WebcamRegion {
	id: string;
	startMs: number;
	endMs: number;
	position: WebcamPosition;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd Z:/Studio-NOPE/openscreen && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/video-editor/types.ts
git commit -m "Add WebcamRegion type"
```

---

## Task 2: `computeWebcamPositionAtTime` Pure Function + Tests

**Files:**
- Create: `src/components/video-editor/videoPlayback/webcamRegionUtils.ts`
- Create: `src/components/video-editor/videoPlayback/webcamRegionUtils.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/video-editor/videoPlayback/webcamRegionUtils.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { WebcamPosition, WebcamRegion } from "@/components/video-editor/types";
import { computeWebcamPositionAtTime } from "./webcamRegionUtils";

const base: WebcamPosition = { cx: 0.8, cy: 0.8 };

function makeRegion(id: string, startMs: number, endMs: number, cx: number, cy: number): WebcamRegion {
	return { id, startMs, endMs, position: { cx, cy } };
}

describe("computeWebcamPositionAtTime", () => {
	it("returns base when there are no regions", () => {
		const result = computeWebcamPositionAtTime({ globalPosition: base, regions: [] }, 5000);
		expect(result).toEqual(base);
	});

	it("returns center when global position is null and no regions", () => {
		const result = computeWebcamPositionAtTime({ globalPosition: null, regions: [] }, 5000);
		expect(result).toEqual({ cx: 0.5, cy: 0.5 });
	});

	it("returns base before any region starts", () => {
		const regions = [makeRegion("r1", 2000, 4000, 0.1, 0.1)];
		const result = computeWebcamPositionAtTime({ globalPosition: base, regions }, 500);
		expect(result).toEqual(base);
	});

	it("returns base after all regions end", () => {
		const regions = [makeRegion("r1", 2000, 4000, 0.1, 0.1)];
		const result = computeWebcamPositionAtTime({ globalPosition: base, regions }, 10000);
		expect(result).toEqual(base);
	});

	it("returns region position well inside a region (far from boundaries)", () => {
		const regions = [makeRegion("r1", 2000, 4000, 0.1, 0.1)];
		const result = computeWebcamPositionAtTime({ globalPosition: base, regions }, 3000);
		expect(result).toEqual({ cx: 0.1, cy: 0.1 });
	});

	it("interpolates into a region at its start boundary", () => {
		const regions = [makeRegion("r1", 2000, 4000, 0.1, 0.1)];
		// 150ms into the region — halfway through a 300ms transition
		const result = computeWebcamPositionAtTime({ globalPosition: base, regions }, 2150);
		// ease-in-out cubic at t=0.5 is 0.5; halfway between base(0.8,0.8) and region(0.1,0.1)
		expect(result.cx).toBeCloseTo(0.45, 3);
		expect(result.cy).toBeCloseTo(0.45, 3);
	});

	it("interpolates out of a region at its end boundary", () => {
		const regions = [makeRegion("r1", 2000, 4000, 0.1, 0.1)];
		// 150ms before region end — halfway through a 300ms ease-out
		const result = computeWebcamPositionAtTime({ globalPosition: base, regions }, 3850);
		expect(result.cx).toBeCloseTo(0.45, 3);
		expect(result.cy).toBeCloseTo(0.45, 3);
	});

	it("interpolates between two back-to-back regions at the shared boundary", () => {
		const regions = [
			makeRegion("r1", 2000, 4000, 0.1, 0.1),
			makeRegion("r2", 4000, 6000, 0.9, 0.9),
		];
		// 150ms before r1 ends, 150ms before r2 starts — still inside r1
		const at3850 = computeWebcamPositionAtTime({ globalPosition: base, regions }, 3850);
		// 150ms into r2 — inside r2 transition window
		const at4150 = computeWebcamPositionAtTime({ globalPosition: base, regions }, 4150);
		// At the seam, expect the two adjacent values to lerp toward each other, not back to base
		// r1 end-window should blend toward r2's position (0.9), not base (0.8)
		expect(at3850.cx).toBeGreaterThan(0.1);
		expect(at3850.cx).toBeLessThan(0.9);
		expect(at4150.cx).toBeGreaterThan(0.1);
		expect(at4150.cx).toBeLessThan(0.9);
	});

	it("handles a region whose duration is shorter than twice the transition window", () => {
		// Region is only 200ms long — shorter than 300ms transition window
		const regions = [makeRegion("r1", 2000, 2200, 0.1, 0.1)];
		const midRegion = computeWebcamPositionAtTime({ globalPosition: base, regions }, 2100);
		// Should not crash; should be somewhere between base and region
		expect(midRegion.cx).toBeGreaterThan(0.1);
		expect(midRegion.cx).toBeLessThan(0.8);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd Z:/Studio-NOPE/openscreen && npx vitest run src/components/video-editor/videoPlayback/webcamRegionUtils.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the function**

Create `src/components/video-editor/videoPlayback/webcamRegionUtils.ts`:

```ts
import type { WebcamPosition, WebcamRegion } from "@/components/video-editor/types";

export const WEBCAM_TRANSITION_WINDOW_MS = 300;

const CENTER_POSITION: WebcamPosition = { cx: 0.5, cy: 0.5 };

export interface WebcamPositionSource {
	globalPosition: WebcamPosition | null;
	regions: WebcamRegion[];
}

function easeInOutCubic(t: number): number {
	if (t < 0.5) return 4 * t * t * t;
	const p = 2 * t - 2;
	return 0.5 * p * p * p + 1;
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function lerpPosition(a: WebcamPosition, b: WebcamPosition, t: number): WebcamPosition {
	const eased = easeInOutCubic(t);
	return { cx: lerp(a.cx, b.cx, eased), cy: lerp(a.cy, b.cy, eased) };
}

function positionForRegionOrBase(
	region: WebcamRegion | null,
	base: WebcamPosition,
): WebcamPosition {
	return region ? region.position : base;
}

export function computeWebcamPositionAtTime(
	source: WebcamPositionSource,
	timeMs: number,
): WebcamPosition {
	const base: WebcamPosition = source.globalPosition ?? CENTER_POSITION;
	const regions = source.regions;
	if (regions.length === 0) return base;

	const sorted = [...regions].sort((a, b) => a.startMs - b.startMs);

	let active: WebcamRegion | null = null;
	let previous: WebcamRegion | null = null;
	let next: WebcamRegion | null = null;

	for (const region of sorted) {
		if (timeMs >= region.startMs && timeMs <= region.endMs) {
			active = region;
		} else if (region.endMs < timeMs) {
			previous = region;
		} else if (region.startMs > timeMs && !next) {
			next = region;
		}
	}

	if (active) {
		const halfDuration = (active.endMs - active.startMs) / 2;
		const window = Math.min(WEBCAM_TRANSITION_WINDOW_MS, halfDuration);
		const msIntoRegion = timeMs - active.startMs;
		const msToRegionEnd = active.endMs - timeMs;

		if (window > 0 && msIntoRegion < window) {
			// Ease in: previous state → active region
			const previousState = positionForRegionOrBase(previous, base);
			const t = msIntoRegion / window;
			return lerpPosition(previousState, active.position, t);
		}
		if (window > 0 && msToRegionEnd < window) {
			// Ease out: active region → next state
			const nextState = positionForRegionOrBase(next, base);
			const t = 1 - msToRegionEnd / window;
			return lerpPosition(active.position, nextState, t);
		}
		return active.position;
	}

	// Not inside any region — check if we're inside a "tail" from a previous region or a "head" from a next region
	if (previous) {
		const msSincePreviousEnd = timeMs - previous.endMs;
		if (msSincePreviousEnd < WEBCAM_TRANSITION_WINDOW_MS) {
			// The easing was handled during the active region's end-window; outside, snap back to base
			// but only if no next region interferes
			if (!next || next.startMs - timeMs >= WEBCAM_TRANSITION_WINDOW_MS) {
				return base;
			}
		}
	}
	if (next) {
		const msToNextStart = next.startMs - timeMs;
		if (msToNextStart < WEBCAM_TRANSITION_WINDOW_MS) {
			// The easing is handled when the active next region starts; outside, we're still at base
			return base;
		}
	}
	return base;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd Z:/Studio-NOPE/openscreen && npx vitest run src/components/video-editor/videoPlayback/webcamRegionUtils.test.ts
```
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/video-editor/videoPlayback/webcamRegionUtils.ts src/components/video-editor/videoPlayback/webcamRegionUtils.test.ts
git commit -m "Add computeWebcamPositionAtTime with ease-in-out transitions"
```

---

## Task 3: Editor State Field

**Files:**
- Modify: `src/hooks/useEditorHistory.ts`

- [ ] **Step 1: Add `webcamRegions` to imports, state, and initial state**

In `src/hooks/useEditorHistory.ts`:

Add `WebcamRegion` to the type imports at the top (around line 2-12):

```ts
import type {
	AnnotationRegion,
	CropRegion,
	SpeedRegion,
	TrimRegion,
	WebcamLayoutPreset,
	WebcamMaskShape,
	WebcamPosition,
	WebcamRegion,
	WebcamSizePreset,
	ZoomRegion,
} from "@/components/video-editor/types";
```

Add `webcamRegions: WebcamRegion[];` to the `EditorState` interface (around line 24) after `annotationRegions`:

```ts
annotationRegions: AnnotationRegion[];
webcamRegions: WebcamRegion[];
```

Add `webcamRegions: [],` to `INITIAL_EDITOR_STATE` (around line 43-60) after `annotationRegions: []`:

```ts
annotationRegions: [],
webcamRegions: [],
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd Z:/Studio-NOPE/openscreen && npx tsc --noEmit
```

Expected: there may be errors in `VideoEditor.tsx`, `projectPersistence.ts`, and `frameRenderer.ts` complaining that `webcamRegions` is missing in objects they construct. **That is fine** — those will be fixed in later tasks. If the only errors are about `webcamRegions` being missing in those files, proceed. If there are NEW errors in `useEditorHistory.ts` itself, fix those first.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useEditorHistory.ts
git commit -m "Add webcamRegions to EditorState"
```

---

## Task 4: Project Persistence

**Files:**
- Modify: `src/components/video-editor/projectPersistence.ts`

- [ ] **Step 1: Add `webcamRegions` to the imports**

In `src/components/video-editor/projectPersistence.ts`, find the existing type imports and add `WebcamRegion` alongside the others (probably in the same import statement that imports `ZoomRegion`, `TrimRegion`, etc.). Example:

```ts
import type {
	AnnotationRegion,
	SpeedRegion,
	TrimRegion,
	WebcamLayoutPreset,
	WebcamMaskShape,
	WebcamPosition,
	WebcamRegion,
	WebcamSizePreset,
	ZoomRegion,
	// ... etc
} from "./types";
```

(Adjust to match the exact existing import shape.)

- [ ] **Step 2: Add `webcamRegions` to `ProjectEditorState`**

In the `ProjectEditorState` interface (around line 46), add after `annotationRegions`:

```ts
annotationRegions: AnnotationRegion[];
webcamRegions: WebcamRegion[];
```

- [ ] **Step 3: Add normalization in `normalizeProjectEditor`**

After the existing `normalizedAnnotationRegions` block (around line 253+), add:

```ts
const normalizedWebcamRegions: WebcamRegion[] = Array.isArray(editor.webcamRegions)
	? editor.webcamRegions
			.filter((region): region is WebcamRegion => Boolean(region && typeof region.id === "string"))
			.map((region) => {
				const rawStart = isFiniteNumber(region.startMs) ? Math.round(region.startMs) : 0;
				const rawEnd = isFiniteNumber(region.endMs) ? Math.round(region.endMs) : rawStart + 1000;
				const startMs = Math.max(0, Math.min(rawStart, rawEnd));
				const endMs = Math.max(startMs + 1, rawEnd);
				const cx = clamp(isFiniteNumber(region.position?.cx) ? region.position.cx : 0.5, 0, 1);
				const cy = clamp(isFiniteNumber(region.position?.cy) ? region.position.cy : 0.5, 0, 1);
				return {
					id: region.id,
					startMs,
					endMs,
					position: { cx, cy },
				};
			})
	: [];
```

- [ ] **Step 4: Include `webcamRegions` in the returned object**

Find the `return` statement at the end of `normalizeProjectEditor` and add `webcamRegions: normalizedWebcamRegions,` alongside the other normalized fields.

- [ ] **Step 5: Update `createProjectSnapshot` if applicable**

Search the file for `createProjectSnapshot`. If it constructs an object with `zoomRegions`, `trimRegions`, etc., add `webcamRegions` to that object as well. Match the existing pattern.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd Z:/Studio-NOPE/openscreen && npx tsc --noEmit
```

Expected: any errors about `webcamRegions` in `projectPersistence.ts` should be gone. Remaining errors in `VideoEditor.tsx` and `frameRenderer.ts` are still expected.

- [ ] **Step 7: Commit**

```bash
git add src/components/video-editor/projectPersistence.ts
git commit -m "Persist webcamRegions in project file schema"
```

---

## Task 5: VideoEditor Handlers + State

**Files:**
- Modify: `src/components/video-editor/VideoEditor.tsx`

- [ ] **Step 1: Add `WebcamRegion` import**

At the top of the file, add `WebcamRegion` to the imports from `./types` (find the existing import that includes `ZoomRegion` and add `WebcamRegion` alphabetically).

- [ ] **Step 2: Destructure `webcamRegions` from history**

Find the destructuring of `useEditorHistory` result (around line 80-90, where `zoomRegions`, `trimRegions`, `pushState`, `updateState` are pulled out). Add `webcamRegions` alongside the other region arrays.

- [ ] **Step 3: Add selection state and id counter**

Find the `useState` declarations for `selectedZoomId` (around line 123) and add two new hooks below:

```tsx
const [selectedWebcamRegionId, setSelectedWebcamRegionId] = useState<string | null>(null);
const nextWebcamRegionIdRef = useRef<number>(1);
```

Also add it to the `setSelected*` clearing logic in `handleSelectZoom`, `handleSelectTrim`, `handleSelectAnnotation`, `handleSelectBlur`, `handleSelectSpeed` — every existing "clear other selections" block should also call `setSelectedWebcamRegionId(null)`.

- [ ] **Step 4: Add handlers**

After `handleSelectSpeed` (around line 849+), add:

```tsx
const handleSelectWebcamRegion = useCallback((id: string | null) => {
	setSelectedWebcamRegionId(id);
	if (id) {
		setSelectedZoomId(null);
		setSelectedTrimId(null);
		setSelectedAnnotationId(null);
		setSelectedBlurId(null);
		setSelectedSpeedId(null);
	}
}, []);

const handleWebcamRegionAdded = useCallback(
	(span: Span) => {
		const newStart = Math.round(span.start);
		const newEnd = Math.round(span.end);
		const hasOverlap = webcamRegions.some(
			(region) => newStart < region.endMs && newEnd > region.startMs,
		);
		if (hasOverlap) {
			toast.error("Webcam regions cannot overlap");
			return;
		}
		const id = `webcam-${nextWebcamRegionIdRef.current++}`;
		const basePosition = webcamPosition ?? { cx: 0.5, cy: 0.5 };
		const newRegion: WebcamRegion = {
			id,
			startMs: newStart,
			endMs: newEnd,
			position: { ...basePosition },
		};
		pushState((prev) => ({ webcamRegions: [...prev.webcamRegions, newRegion] }));
		setSelectedWebcamRegionId(id);
		setSelectedZoomId(null);
		setSelectedTrimId(null);
		setSelectedAnnotationId(null);
		setSelectedBlurId(null);
		setSelectedSpeedId(null);
	},
	[pushState, webcamPosition, webcamRegions],
);

const handleWebcamRegionSpanChange = useCallback(
	(id: string, span: Span) => {
		const newStart = Math.round(span.start);
		const newEnd = Math.round(span.end);
		const hasOverlap = webcamRegions.some(
			(region) => region.id !== id && newStart < region.endMs && newEnd > region.startMs,
		);
		if (hasOverlap) return;
		pushState((prev) => ({
			webcamRegions: prev.webcamRegions.map((region) =>
				region.id === id ? { ...region, startMs: newStart, endMs: newEnd } : region,
			),
		}));
	},
	[pushState, webcamRegions],
);

const handleWebcamRegionPositionChange = useCallback(
	(id: string, position: WebcamPosition) => {
		updateState((prev) => ({
			webcamRegions: prev.webcamRegions.map((region) =>
				region.id === id
					? {
							...region,
							position: {
								cx: Math.max(0, Math.min(1, position.cx)),
								cy: Math.max(0, Math.min(1, position.cy)),
							},
						}
					: region,
			),
		}));
	},
	[updateState],
);

const handleWebcamRegionDelete = useCallback(
	(id: string) => {
		pushState((prev) => ({
			webcamRegions: prev.webcamRegions.filter((r) => r.id !== id),
		}));
		if (selectedWebcamRegionId === id) {
			setSelectedWebcamRegionId(null);
		}
	},
	[selectedWebcamRegionId, pushState],
);
```

Note: `toast` must be imported if it isn't already. Check the file for an existing `import { toast } from "sonner";` — add it if missing.

- [ ] **Step 5: Initialize `nextWebcamRegionIdRef` from loaded regions**

Find the existing blocks that call `deriveNextId` for `zoomRegions`, `trimRegions`, etc. (around line 246+). Add:

```tsx
nextWebcamRegionIdRef.current = deriveNextId(
	"webcam",
	normalizedEditor.webcamRegions.map((region) => region.id),
);
```

Do this both in the `applyLoadedProject` function (wherever the other `deriveNextId` calls are for loaded projects) and in the fresh-recording branch if applicable (search for `deriveNextId` occurrences).

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd Z:/Studio-NOPE/openscreen && npx tsc --noEmit
```

Fix any errors in `VideoEditor.tsx` before proceeding. Errors in `TimelineEditor.tsx`, `VideoPlayback.tsx`, `frameRenderer.ts`, `videoExporter.ts` about `webcamRegions` being missing are expected.

- [ ] **Step 7: Commit**

```bash
git add src/components/video-editor/VideoEditor.tsx
git commit -m "Add webcam region handlers and selection state to VideoEditor"
```

---

## Task 6: Timeline Editor Row + Props

**Files:**
- Modify: `src/components/video-editor/timeline/TimelineEditor.tsx`

- [ ] **Step 1: Add the row ID constant**

Near the top of the file where `ZOOM_ROW_ID`, `TRIM_ROW_ID`, etc. are defined (around line 44-48), add:

```ts
const WEBCAM_ROW_ID = "row-webcam";
```

- [ ] **Step 2: Add `WebcamRegion` to type imports**

Find the existing type imports from `../types` (around line 30-37) and add `WebcamPosition, WebcamRegion` alphabetically.

- [ ] **Step 3: Add props**

In the `TimelineEditorProps` interface (around line 53-91), add:

```ts
webcamRegions?: WebcamRegion[];
onWebcamRegionAdded?: (span: Span) => void;
onWebcamRegionSpanChange?: (id: string, span: Span) => void;
onWebcamRegionDelete?: (id: string) => void;
selectedWebcamRegionId?: string | null;
onSelectWebcamRegion?: (id: string | null) => void;
```

- [ ] **Step 4: Extend `TimelineRenderItem` variant union**

In the `TimelineRenderItem` interface (around line 99-107), extend the `variant` union:

```ts
variant: "zoom" | "trim" | "annotation" | "speed" | "blur" | "webcam";
```

- [ ] **Step 5: Destructure the new props in the default export**

In `export default function TimelineEditor({ ... })` around line 764+, destructure the new props:

```ts
webcamRegions = [],
onWebcamRegionAdded,
onWebcamRegionSpanChange,
onWebcamRegionDelete,
selectedWebcamRegionId,
onSelectWebcamRegion,
```

- [ ] **Step 6: Forward them to the inner component**

The default export composes an inner `TimelineEditorInner` (or similar). Forward the new props through the same mechanism as the existing `zoom*` / `trim*` props. Match the exact pattern — do not invent a new one.

- [ ] **Step 7: Add webcam items to the render list**

Find the block that builds `items` via `useMemo` (likely around line 400-600). It constructs render items from each region array. Add a parallel block for webcam regions, mapping each `WebcamRegion` to a `TimelineRenderItem` with:

- `id: region.id`
- `rowId: WEBCAM_ROW_ID`
- `span: { start: region.startMs, end: region.endMs }`
- `label: "Cam"`
- `variant: "webcam"`

Add the resulting items to the same flat `items` array returned from the `useMemo`.

- [ ] **Step 8: Add the row to the JSX**

In the inner component where the existing `<Row>` elements are rendered (starting around line 675), add after the `SPEED_ROW_ID` row:

```tsx
const webcamItems = items.filter((item) => item.rowId === WEBCAM_ROW_ID);

// ...later in JSX, after the speed row:
<Row id={WEBCAM_ROW_ID} isEmpty={webcamItems.length === 0} hint={t("hints.pressWebcam")}>
	{webcamItems.map((item) => (
		<Item
			id={item.id}
			key={item.id}
			rowId={item.rowId}
			span={item.span}
			isSelected={item.id === selectedWebcamRegionId}
			onSelect={() => onSelectWebcamRegion?.(item.id)}
			variant="webcam"
		>
			{item.label}
		</Item>
	))}
</Row>
```

Note: `t("hints.pressWebcam")` requires adding the translation key. Locate the i18n files (search for `hints.pressZoom` — the zoom hint. Add `pressWebcam: "Press W to add webcam"` to the same file, matching the same language/namespace).

- [ ] **Step 9: Wire span change to the inner component**

The existing `handleItemDragEnd` or equivalent handler reads `item.rowId` and dispatches to the correct `on*SpanChange` callback. Add a case for `WEBCAM_ROW_ID` that dispatches to `onWebcamRegionSpanChange`.

Similarly, for `handleItemDelete` (or equivalent keyboard-delete handler), add a case for `WEBCAM_ROW_ID` that calls `onWebcamRegionDelete`.

- [ ] **Step 10: Add keyboard shortcut for add**

Find the existing keyboard handler that listens for `Z` (zoom) and `T` (trim) — likely a `useEffect` with `window.addEventListener("keydown", ...)` around line 1230+. Add a case for `KeyW` (press `W`) that computes a default span at the current playhead and calls `onWebcamRegionAdded(span)`.

Match the exact default-span logic used by zoom (search for `handleAddZoom` — likely a 3-second region clamped to video length, no overlap). Overlap is already handled inside `handleWebcamRegionAdded` (Task 5), so this handler can just compute and dispatch.

- [ ] **Step 11: Verify TypeScript compiles**

```bash
cd Z:/Studio-NOPE/openscreen && npx tsc --noEmit
```

Fix any errors in `TimelineEditor.tsx`. Errors in VideoPlayback/frameRenderer/videoExporter about missing `webcamRegions` are still expected.

- [ ] **Step 12: Commit**

```bash
git add src/components/video-editor/timeline/TimelineEditor.tsx src/i18n
git commit -m "Add webcam timeline row, keyboard shortcut, and wiring"
```

---

## Task 7: Item Component Webcam Variant

**Files:**
- Modify: `src/components/video-editor/timeline/Item.tsx`

- [ ] **Step 1: Add `"webcam"` to variant union**

Find the `variant` prop type and extend it with `"webcam"`.

- [ ] **Step 2: Add webcam styling**

Find the existing `switch (variant)` or equivalent logic that picks Tailwind classes per variant. Add a case for `"webcam"` with glass-blue styling:

```tsx
case "webcam":
	return "bg-blue-500/20 border-blue-400/50 text-blue-100 hover:bg-blue-500/30";
```

Match the shape of the existing cases — if they use a className function or tagged template, follow that exact pattern. Do not invent a new styling system.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd Z:/Studio-NOPE/openscreen && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/video-editor/timeline/Item.tsx
git commit -m "Add webcam variant styling to timeline Item"
```

---

## Task 8: Wire Timeline Editor Props in VideoEditor

**Files:**
- Modify: `src/components/video-editor/VideoEditor.tsx`

- [ ] **Step 1: Pass the new props to the `<TimelineEditor>` JSX**

Find the `<TimelineEditor ... />` JSX element (search for `<TimelineEditor`). Add the new props alongside the existing zoom/trim props:

```tsx
webcamRegions={webcamRegions}
onWebcamRegionAdded={handleWebcamRegionAdded}
onWebcamRegionSpanChange={handleWebcamRegionSpanChange}
onWebcamRegionDelete={handleWebcamRegionDelete}
selectedWebcamRegionId={selectedWebcamRegionId}
onSelectWebcamRegion={handleSelectWebcamRegion}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd Z:/Studio-NOPE/openscreen && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/video-editor/VideoEditor.tsx
git commit -m "Pass webcam region props into TimelineEditor"
```

---

## Task 9: VideoPlayback Canvas Integration

**Files:**
- Modify: `src/components/video-editor/VideoPlayback.tsx`

- [ ] **Step 1: Add props**

Add new props to the `VideoPlayback` component interface:

```ts
webcamRegions?: WebcamRegion[];
selectedWebcamRegionId?: string | null;
onWebcamRegionPositionChange?: (id: string, position: WebcamPosition) => void;
```

Import `WebcamRegion` from `./types` if not already imported.

- [ ] **Step 2: Compute the effective position via `computeWebcamPositionAtTime`**

Import the helper:

```tsx
import { computeWebcamPositionAtTime } from "./videoPlayback/webcamRegionUtils";
```

Find where the existing `webcamPosition` is used to position the webcam overlay (around line 1300-1335 — look for `computeCompositeLayout` call). Replace the direct `webcamPosition` usage with:

```tsx
const effectiveWebcamPosition = useMemo(
	() =>
		computeWebcamPositionAtTime(
			{ globalPosition: webcamPosition, regions: webcamRegions ?? [] },
			currentTime * 1000,
		),
	[webcamPosition, webcamRegions, currentTime],
);
```

Then pass `effectiveWebcamPosition` to `computeCompositeLayout` instead of `webcamPosition`.

Note: `currentTime` is the existing playback time in seconds. Multiply by 1000 to convert to ms.

- [ ] **Step 3: Route drag events to the selected region when applicable**

Find the existing pointer-drag handler that updates `webcamPosition` (around line 461-504 — look for `onPointerDown/Move/Up` on the webcam overlay). The handler currently calls `onWebcamPositionChange(newPos)`.

Replace the final setter call with:

```tsx
if (selectedWebcamRegionId && onWebcamRegionPositionChange) {
	onWebcamRegionPositionChange(selectedWebcamRegionId, newPos);
} else if (onWebcamPositionChange) {
	onWebcamPositionChange(newPos);
}
```

Leave all other drag logic alone.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd Z:/Studio-NOPE/openscreen && npx tsc --noEmit
```

- [ ] **Step 5: Pass the new props from `VideoEditor.tsx`**

In `VideoEditor.tsx`, find the `<VideoPlayback ... />` JSX and add:

```tsx
webcamRegions={webcamRegions}
selectedWebcamRegionId={selectedWebcamRegionId}
onWebcamRegionPositionChange={handleWebcamRegionPositionChange}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/video-editor/VideoPlayback.tsx src/components/video-editor/VideoEditor.tsx
git commit -m "Use webcam region position at playback time with region-aware drag"
```

---

## Task 10: Frame Renderer (Exporter) Integration

**Files:**
- Modify: `src/lib/exporter/frameRenderer.ts`
- Modify: `src/lib/exporter/videoExporter.ts`

- [ ] **Step 1: Add `webcamRegions` to frame renderer config type**

In `frameRenderer.ts`, find the `config` field type (search for `config.zoomRegions` to locate the interface). Add `webcamRegions: WebcamRegion[];` to the config type.

Import `WebcamRegion` at the top of the file:

```ts
import type { WebcamRegion } from "@/components/video-editor/types";
```

- [ ] **Step 2: Use `computeWebcamPositionAtTime` when computing webcam rect**

Import the helper:

```ts
import { computeWebcamPositionAtTime } from "@/components/video-editor/videoPlayback/webcamRegionUtils";
```

Find the `computeLayout` or `updateCompositeLayout` method (search for `webcamPosition` usage within the file). Replace direct `webcamPosition` reads with:

```ts
const effectiveWebcamPosition = computeWebcamPositionAtTime(
	{
		globalPosition: this.config.webcamPosition,
		regions: this.config.webcamRegions,
	},
	timeMs,
);
```

Then pass `effectiveWebcamPosition` to `computeCompositeLayout` (or whatever function currently consumes `webcamPosition`).

Note: the existing code may compute the webcam rect once per frame in `updateAnimationState` or at layout time. The layout must be recomputed per frame for regions to take effect — if it's currently cached per export session, make it per-frame for webcam. Match the existing zoom-region pattern, which is already per-frame.

- [ ] **Step 3: Forward `webcamRegions` in `videoExporter.ts`**

In `videoExporter.ts`, find where the renderer is constructed with `config: { ... zoomRegions, ... }`. Add `webcamRegions: <source>` to the config — the source is whatever editor state is being passed to the exporter (search for `zoomRegions:` in the file — you'll find the mapping).

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd Z:/Studio-NOPE/openscreen && npx tsc --noEmit
```

All errors about `webcamRegions` being missing from config should now be resolved. Fix any remaining issues.

- [ ] **Step 5: Run full test suite**

```bash
cd Z:/Studio-NOPE/openscreen && npx vitest run
```

Expected: all tests pass. The 2 pre-existing `gifExporter.browser.test.ts` / `videoExporter.browser.test.ts` failures (unrelated to this task) may still be there — those are known-broken fixture path issues.

- [ ] **Step 6: Commit**

```bash
git add src/lib/exporter/frameRenderer.ts src/lib/exporter/videoExporter.ts
git commit -m "Use computeWebcamPositionAtTime in exporter frame renderer"
```

---

## Task 11: Manual QA

No code. Run the following and fix anything broken, committing fixes as individual commits.

- [ ] **Step 1: Load a recording in the editor.**
- [ ] **Step 2: Press `W` at 2 seconds into the video.** A new blue region appears on a new webcam timeline row. It is automatically selected.
- [ ] **Step 3: Scrub to 3 seconds.** The webcam on the canvas jumps (or smoothly transitions) to the region's default position (same as the global position at the moment of creation).
- [ ] **Step 4: With the region selected, drag the webcam on the canvas to a new position.** The region's stored position updates. Scrub away and back — the webcam still renders at the new position within the region.
- [ ] **Step 5: Drag the region's right edge to extend it.** Duration updates.
- [ ] **Step 6: Try to create an overlapping region.** A toast appears ("Webcam regions cannot overlap") and no region is created.
- [ ] **Step 7: Export the video.** Play the exported file. The webcam should move at the region boundary, with a ~300ms smooth transition.
- [ ] **Step 8: Undo (Ctrl+Z).** The last region change reverts.
- [ ] **Step 9: Save the project, reload, verify.** The regions are still there with their positions and time ranges.
- [ ] **Step 10: Delete a region by selecting it and pressing Delete.** Region removed; webcam returns to global position during the now-empty time range.

---

## Self-Review

### Spec coverage
| Spec requirement | Task |
|---|---|
| `WebcamRegion` type | 1 |
| `EditorState.webcamRegions` field | 3 |
| `computeWebcamPositionAtTime` with 300ms ease | 2 |
| Project persistence | 4 |
| Editor state + handlers (add/select/span/position/delete) | 5 |
| Overlap rejection on add | 5 |
| Timeline row + variant + shortcut | 6, 7 |
| Canvas drag routes to selected region | 9 |
| Exporter uses interpolated position | 10 |
| Undo/redo via existing `useEditorHistory` | Handled automatically by Task 5 using `pushState` / `updateState` |
| Manual QA | 11 |

All spec requirements covered.

### Placeholder scan
No "TBD", "TODO", "fill in details", or code-less prose-only steps. Every code step has complete code.

### Type consistency
- `WebcamRegion` uses `position: WebcamPosition` (consistent across types.ts, useEditorHistory, projectPersistence, VideoEditor handlers, VideoPlayback, frameRenderer).
- `computeWebcamPositionAtTime` signature: `(source: WebcamPositionSource, timeMs: number) => WebcamPosition` (consistent in Task 2 definition and Tasks 9/10 usage).
- `WebcamPositionSource` has `globalPosition: WebcamPosition | null` and `regions: WebcamRegion[]` — matches `EditorState.webcamPosition` type.
- Handler names: `handleSelectWebcamRegion`, `handleWebcamRegionAdded`, `handleWebcamRegionSpanChange`, `handleWebcamRegionPositionChange`, `handleWebcamRegionDelete` — used consistently in Tasks 5, 8, 9.

### Scope check
Single feature, single subsystem (video editor). Not too large for one plan.
