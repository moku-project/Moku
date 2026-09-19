import { INSPECT_ZOOM_MAX, INSPECT_ZOOM_STEP } from "./zoomHelpers";
import type { PinchTracker } from "./pinchZoom";

const SWIPE_MIN_DIST = 50;

export interface StripGestureTarget {
  onMouseDown(e: MouseEvent): void;
  onMouseMove(e: MouseEvent): void;
  onMouseUp(): void;
  onPointerDown(e: PointerEvent): void;
  onPointerMove(e: PointerEvent): void;
  onPointerUp(): void;
  onWheel(e: WheelEvent): void;
  consumeTap(): boolean;
}

export interface PageGestureOpts {
  getContainer:    () => HTMLElement | undefined;
  isLongstrip:     () => boolean;
  getInspectScale: () => number;
  getPan:          () => { x: number; y: number };
  setInspect:      (scale: number, panX: number, panY: number) => void;
  getPinch:        () => PinchTracker | null;
  onSwipe:         (forward: boolean) => void;
  onWheelNav:      (e: WheelEvent) => void;
  getStrip:        () => StripGestureTarget | undefined;
}

export function queryInspectImage(container: HTMLElement | null | undefined): HTMLElement | null {
  if (!container) return null;
  return (
    container.querySelector<HTMLElement>(".inspect-wrap .double-wrap") ??
    container.querySelector<HTMLElement>(".peel-stack > img.peel-front") ??
    container.querySelector<HTMLElement>(".inspect-wrap img")
  );
}

export function clampInspectPan(
  img: HTMLElement | null,
  scale: number,
  px: number,
  py: number,
): [number, number] {
  if (!img) return [px, py];
  const maxX = Math.max(0, (img.offsetWidth  * (scale - 1)) / 2);
  const maxY = Math.max(0, (img.offsetHeight * (scale - 1)) / 2);
  return [Math.max(-maxX, Math.min(maxX, px)), Math.max(-maxY, Math.min(maxY, py))];
}

export function createPageGestures(opts: PageGestureOpts) {
  let inspectDragging   = false;
  let inspectDragMoved  = false;
  let inspectDragStartX = 0;
  let inspectDragStartY = 0;
  let inspectPanStartX  = 0;
  let inspectPanStartY  = 0;
  let swipeActive       = false;
  let swipeStartX       = 0;
  let swipeStartY       = 0;
  let justSwiped        = false;

  function swipeEligible(): boolean {
    return !opts.isLongstrip() && opts.getInspectScale() <= 1 && !opts.getPinch()?.isPinching();
  }

  function applyPan(clientX: number, clientY: number) {
    if (!inspectDragMoved && Math.abs(clientX - inspectDragStartX) + Math.abs(clientY - inspectDragStartY) > 4) {
      inspectDragMoved = true;
    }
    const rawX = inspectPanStartX + (clientX - inspectDragStartX);
    const rawY = inspectPanStartY + (clientY - inspectDragStartY);
    const [cx, cy] = clampInspectPan(queryInspectImage(opts.getContainer()), opts.getInspectScale(), rawX, rawY);
    opts.setInspect(opts.getInspectScale(), cx, cy);
  }

  function onInspectMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    if ((e.target as Element).closest(".bar")) return;
    if (opts.isLongstrip()) { opts.getStrip()?.onMouseDown(e); return; }
    if (opts.getInspectScale() <= 1) return;
    inspectDragging   = true;
    inspectDragMoved  = false;
    inspectDragStartX = e.clientX;
    inspectDragStartY = e.clientY;
    const pan = opts.getPan();
    inspectPanStartX  = pan.x;
    inspectPanStartY  = pan.y;
    e.preventDefault();
  }

  function onInspectMouseMove(e: MouseEvent) {
    if (opts.isLongstrip()) { opts.getStrip()?.onMouseMove(e); return; }
    if (!inspectDragging) return;
    applyPan(e.clientX, e.clientY);
  }

  function onInspectMouseUp() {
    if (opts.isLongstrip()) { opts.getStrip()?.onMouseUp(); return; }
    inspectDragging = false;
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if ((e.target as Element).closest(".bar")) return;
    opts.getPinch()?.onPointerDown(e);
    if (opts.isLongstrip()) { opts.getStrip()?.onPointerDown(e); return; }
    if (swipeEligible() && opts.getInspectScale() <= 1) {
      swipeActive = true;
      swipeStartX = e.clientX;
      swipeStartY = e.clientY;
    }
  }

  function onPointerMove(e: PointerEvent) {
    const pinch = opts.getPinch();
    if (pinch?.isPinching()) { pinch.onPointerMove(e); swipeActive = false; return; }
    if (opts.isLongstrip()) { opts.getStrip()?.onPointerMove(e); return; }
    if (inspectDragging) applyPan(e.clientX, e.clientY);
  }

  function onPointerUp(e: PointerEvent) {
    const pinch = opts.getPinch();
    pinch?.onPointerUp(e);
    if (!pinch?.isPinching()) {
      if (opts.isLongstrip()) { opts.getStrip()?.onPointerUp(); return; }
      inspectDragging = false;
    }
    if (swipeActive) {
      swipeActive = false;
      const dx = e.clientX - swipeStartX;
      const dy = e.clientY - swipeStartY;
      if (Math.abs(dx) >= SWIPE_MIN_DIST && Math.abs(dx) > Math.abs(dy)) {
        // Dragging left always means "move the viewport rightward" (the same
        // physical gesture regardless of reading direction) - onSwipe's
        // caller (goNext/goPrev) is what already resolves that into
        // story-forward vs story-backward based on rtl. Inverting here too
        // would cancel that out and make swipe direction RTL-blind.
        const draggedLeft = dx < 0;
        justSwiped = true;
        opts.onSwipe(draggedLeft);
      }
    }
  }

  function onWheel(e: WheelEvent) {
    if (opts.isLongstrip()) {
      if (e.ctrlKey) opts.onWheelNav(e);
      else opts.getStrip()?.onWheel(e);
      return;
    }
    if (!e.ctrlKey) { opts.onWheelNav(e); return; }
    e.preventDefault();
    const scale = opts.getInspectScale();
    const next  = Math.max(1, Math.min(INSPECT_ZOOM_MAX, scale + (e.deltaY < 0 ? INSPECT_ZOOM_STEP : -INSPECT_ZOOM_STEP)));
    if (next === scale) return;
    if (next === 1) { opts.setInspect(1, 0, 0); return; }
    const container = opts.getContainer();
    const img    = queryInspectImage(container);
    const anchor = img ?? container ?? null;
    const rect   = anchor?.getBoundingClientRect();
    const cx     = rect ? e.clientX - rect.left - rect.width  / 2 : 0;
    const cy     = rect ? e.clientY - rect.top  - rect.height / 2 : 0;
    const pan    = opts.getPan();
    const ratio  = next / scale;
    const [clampedX, clampedY] = clampInspectPan(img, next, cx + (pan.x - cx) * ratio, cy + (pan.y - cy) * ratio);
    opts.setInspect(next, clampedX, clampedY);
  }

  function consumeTap(): boolean {
    if (justSwiped) { justSwiped = false; return true; }
    if (opts.isLongstrip()) return opts.getStrip()?.consumeTap() ?? false;
    if (inspectDragMoved) { inspectDragMoved = false; return true; }
    return false;
  }

  return {
    onInspectMouseDown,
    onInspectMouseMove,
    onInspectMouseUp,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    consumeTap,
  };
}
