import {useCallback, useEffect, useRef} from "react";
import * as d3 from "d3";
import type {D3ZoomEvent} from "d3";
import type {CanvasContext} from "../d3types";

/**
 * A zoom gesture's step, as the plot's zoom handler gets it
 */
export interface ZoomStep {
    /**
     * The zoom factor of this step alone, relative to the previous step (d3-zoom's own scale is
     * cumulative; the zoom math in `axes.ts` is incremental -- see `ContinuousAxisRange.scale`)
     */
    factor: number
    /**
     * d3-zoom's cumulative scale (e.g. for ordinal axes, whose zoom snaps back to the original
     * range exactly at 1 -- see `OrdinalAxisRange.scale`)
     */
    k: number
    /**
     * Where the mouse is, relative to the canvas
     */
    x: number
    y: number
}

/**
 * The options for {@link useCanvasZoomPan}
 */
export interface CanvasZoomPanOptions {
    /**
     * Whether dragging pans the plot
     */
    panEnabled: boolean
    /**
     * Whether the mouse wheel zooms the plot
     */
    zoomEnabled: boolean
    /**
     * Whether zooming requires the shift (or ctrl) key to be held down
     */
    keyModifiersRequired: boolean
    /**
     * The smallest and largest (cumulative) zoom scales
     */
    scaleExtent: [min: number, max: number]
    /**
     * The plot's margin and dimensions, which bound the zoom's translation
     */
    translateExtent: [[left: number, top: number], [right: number, bottom: number]]
    /**
     * Called when a pan (drag) starts (e.g. to suppress tooltips while panning)
     */
    onPanStart?: () => void
    /**
     * Called for each step of a pan
     * @param dx The horizontal distance (px) moved since the previous step
     * @param dy The vertical distance (px) moved since the previous step
     */
    onPan: (dx: number, dy: number) => void
    /**
     * Called when a pan ends
     */
    onPanEnd?: () => void
    /**
     * Called for each step of a zoom gesture (a real one: programmatic changes to d3-zoom's
     * transform, e.g. a reset, aren't reported)
     * @param step The step's zoom factor, d3-zoom's cumulative scale, and the mouse position
     */
    onZoom: (step: ZoomStep) => void
    /**
     * The plot's `onZoomReset` property: called (whenever zooming is set up) with a function that
     * resets the zoom -- d3-zoom's own transform, and then the plot's view (see `resetView`)
     */
    onZoomReset?: (resetZoom: () => void) => void
    /**
     * Restores the plot's view (its axes' original ranges) when the zoom is reset (see `onZoomReset`)
     */
    resetView?: () => void
}

/**
 * The zoom controls a plot gets back from {@link useCanvasZoomPan}
 */
export interface CanvasZoomPanControls {
    /**
     * Resets d3-zoom's own (cumulative) transform to identity, e.g. when the plot's axes are reset
     * to their original ranges -- otherwise the next zoom gesture would continue from the stale,
     * accumulated scale
     */
    resetZoomTransform: () => void
    /**
     * Sets d3-zoom's own (cumulative) scale, e.g. when restoring a saved zoom state. Sets it
     * directly (where d3-zoom keeps it), without dispatching a "zoom" event.
     * @param k The scale
     */
    setZoomScale: (k: number) => void
}

/**
 * Sets up panning (dragging) and zooming (the mouse wheel) on a plot's canvas, with d3's drag and
 * zoom behaviors, and detaches them when the plot unmounts (or the canvas, or the settings they
 * depend on, change).
 *
 * - Zooming only responds to wheel events (and, when required, only with the shift or ctrl key
 *   down): d3-zoom also handles mouse drags on its own, which would otherwise fire zoom events for
 *   the same gesture the dedicated drag behavior pans with.
 * - d3-zoom's scale is cumulative; each zoom step is also handed to the plot as an incremental
 *   factor (relative to the previous step), which is reset whenever d3-zoom's transform is.
 * - The handlers are always the plot's latest ones, so the behaviors needn't be re-attached when
 *   the handlers change.
 * @param canvasContext The plot's canvas context (`null` until the canvas exists)
 * @param options Whether panning and zooming are enabled, their extents, and the handlers
 * @return The controls for d3-zoom's own transform (reset it, or set its scale)
 */
export function useCanvasZoomPan(canvasContext: CanvasContext | null, options: CanvasZoomPanOptions): CanvasZoomPanControls {
    const {
        panEnabled,
        zoomEnabled,
        keyModifiersRequired,
        scaleExtent: [minScale, maxScale],
        translateExtent: [[left, top], [right, bottom]],
        onZoomReset,
    } = options

    // the latest handlers (the behaviors call these, so they needn't be re-attached when they change)
    const handlersRef = useRef(options)
    useEffect(() => {
        handlersRef.current = options
    })

    // d3-zoom's cumulative scale as of the previous zoom step, to turn its next one into an
    // incremental factor
    const lastKRef = useRef<number>(1)
    // the attached zoom behavior (undefined while zooming isn't set up)
    const zoomRef = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown>>(undefined)

    const resetZoomTransform = useCallback(
        (): void => {
            if (canvasContext !== null && zoomRef.current !== undefined) {
                d3.select<HTMLCanvasElement, unknown>(canvasContext.canvas).call(zoomRef.current.transform, d3.zoomIdentity)
            }
            lastKRef.current = 1
        },
        [canvasContext]
    )

    const setZoomScale = useCallback(
        (k: number): void => {
            if (canvasContext !== null) {
                // (d3-zoom keeps an element's transform in its `__zoom` property)
                d3.select(canvasContext.canvas).property("__zoom", d3.zoomIdentity.scale(k))
            }
            lastKRef.current = k
        },
        [canvasContext]
    )

    useEffect(
        () => {
            if (canvasContext === null) return
            const canvasSelection = d3.select<HTMLCanvasElement, unknown>(canvasContext.canvas)

            if (panEnabled) {
                const drag = d3.drag<HTMLCanvasElement, unknown>()
                    .on("start", () => {
                        canvasSelection.style("cursor", "move")
                        handlersRef.current.onPanStart?.()
                    })
                    .on("drag", event => handlersRef.current.onPan(event.dx, event.dy))
                    .on("end", () => {
                        canvasSelection.style("cursor", "auto")
                        handlersRef.current.onPanEnd?.()
                    })
                canvasSelection.call(drag)
            }

            if (zoomEnabled) {
                const zoom = d3.zoom<HTMLCanvasElement, unknown>()
                    // wheel events only -- see the doc comment above
                    .filter(event => event.type === 'wheel' && (!keyModifiersRequired || event.shiftKey || event.ctrlKey))
                    .scaleExtent([minScale, maxScale])
                    .translateExtent([[left, top], [right, bottom]])
                    .on("zoom", (event: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
                        // a `null` source event means a programmatic change to the transform (e.g. a
                        // reset), not a user's gesture: there's nothing for the plot to do
                        if (event.sourceEvent === null) return
                        const k = event.transform.k
                        const factor = k / lastKRef.current
                        lastKRef.current = k
                        const {offsetX, offsetY} = event.sourceEvent as MouseEvent
                        handlersRef.current.onZoom({factor, k, x: offsetX, y: offsetY})
                    })
                canvasSelection.call(zoom)
                zoomRef.current = zoom

                onZoomReset?.(() => {
                    resetZoomTransform()
                    handlersRef.current.resetView?.()
                })
            }

            return () => {
                if (panEnabled) canvasSelection.on(".drag", null)
                if (zoomEnabled) {
                    canvasSelection.on(".zoom", null)
                    zoomRef.current = undefined
                }
            }
        },
        [
            canvasContext, panEnabled, zoomEnabled, keyModifiersRequired,
            minScale, maxScale, left, top, right, bottom, onZoomReset, resetZoomTransform
        ]
    )

    return {resetZoomTransform, setZoomScale}
}
