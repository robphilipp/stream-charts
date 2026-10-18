// Canvas replacement for the old SVG-selection type aliases. There's no DOM element tree to hold
// a d3 `Selection` over anymore, so instead every axis/plot/tracker draws directly into a shared
// `CanvasRenderingContext2D`, coordinated through the `CanvasContext` below.

/**
 * Everything a draw-function needs to paint onto the chart's canvas, plus the API for registering
 * and scheduling redraws. This is what gets threaded through `useChart()` in place of the old
 * `mainG` (root SVG `<g>` selection) and `container` (root `<svg>` element).
 */
export interface CanvasContext {
    /** unique id for the chart; mirrors the old `chartId` used to namespace SVG element ids */
    chartId: number
    /** the backing `<canvas>` DOM element */
    canvas: HTMLCanvasElement
    /** the 2D drawing context for the canvas (already scaled for devicePixelRatio) */
    context2D: CanvasRenderingContext2D
    /** the current device-pixel-ratio scaling applied to the context */
    dpr: number
    /**
     * Registers a draw function to be invoked on every redraw. Registering under an `id` that's
     * already in use replaces the previous draw function for that id (so components can safely
     * re-register on every render without leaking duplicate draws).
     * @param id A unique handle for this draw function (e.g. `axis-${chartId}-${axisId}`)
     * @param draw The function to call, every redraw, to paint this element
     * @param zIndex Controls draw order (lower first); defaults to 0. Use this to keep, e.g.,
     * the tracker drawing on top of the series, which draw on top of the axes.
     */
    register: (id: DrawHandle, draw: DrawFn, zIndex?: number) => void
    /**
     * Removes a previously registered draw function so it no longer participates when the canvas
     * is redrawn.
     */
    unregister: (id: DrawHandle) => void
    /**
     * Schedules the canvas to be redrawn on the next animation frame. Safe to call many times
     * within the same frame/tick -- calls are coalesced into a single `requestAnimationFrame`.
     */
    requestRedraw: () => void
}

/** A function that paints something onto the shared canvas context. */
export type DrawFn = (cc: CanvasContext) => void

/** The id used to register/unregister a draw function with a {@link CanvasContext}. */
export type DrawHandle = string
