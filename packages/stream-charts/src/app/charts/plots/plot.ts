import type {Dimensions} from "../styling/margins";
import type {CanvasContext, DrawFn, DrawHandle} from "../d3types";
import type {FastShiftArray} from "fast-shift-array";
import type {BaseAxisRange} from "../axes/BaseAxisRange";
import type {AxisInterval} from "../axes/AxisInterval";

/**
 * A series' data: a plain array, or the `FastShiftArray` that backs a {@link BaseSeries}
 */
export type Series<D> = Array<D> | FastShiftArray<D>

// a draw function registered with the canvas context, and where it falls in the drawing order
interface RegisteredDraw {
    draw: DrawFn
    zIndex: number
}

/**
 * Creates the {@link CanvasContext} for the chart -- the drawing context plus the redraw
 * registration/scheduling API that axes, plots, and the tracker use to (re)paint themselves.
 * Replaces the old `createPlotContainer`, which appended the root SVG `<g>`.
 * Each redraw clears the canvas, and then calls every registered draw function in z-index order
 * (lowest first); a draw function that throws is logged and skipped, so it doesn't blank the rest.
 * The canvas isn't sized here: call {@link resizeCanvasTo} immediately after this with the actual
 * container dimensions.
 * @param chartId A unique value identifying the chart.
 * @param canvas The `<canvas>` DOM element backing the chart.
 * @param color The default `color` used for text/strokes when nothing more specific is set.
 * @return The canvas context
 * @throws Error when the canvas has no 2D rendering context
 */
export function createCanvasContext(
    chartId: number,
    canvas: HTMLCanvasElement,
    color: string
): CanvasContext {
    const context = canvas.getContext('2d')
    if (!context) {
        throw new Error(`Unable to acquire a 2D rendering context for chart ${chartId}`)
    }

    const dpr = window.devicePixelRatio || 1
    context.textBaseline = 'alphabetic'
    context.strokeStyle = color
    context.fillStyle = color

    const drawFns = new Map<DrawHandle, RegisteredDraw>()
    let animationFrameId: number | null = null

    const redrawNow = (): void => {
        animationFrameId = null

        // clear the full backing-store (not just the CSS-pixel size, since the backing store is
        // scaled by devicePixelRatio and the current transform includes that scale)
        context.save()
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.restore()

        Array.from(drawFns.entries())
            .sort(([, a], [, b]) => a.zIndex - b.zIndex)
            .forEach(([id, {draw}]) => {
                try {
                    draw(canvasContext)
                } catch (error) {
                    // one registrant's draw failure (e.g. a misconfigured axis assignment) must not
                    // blank every other plot/axis/tracker sharing this canvas for the frame -- and
                    // since this runs on every subsequent data tick too, an uncaught throw here would
                    // otherwise wedge the chart's rendering permanently rather than just once
                    console.error(`Error while drawing "${id}"; chart_id: ${chartId}`, error)
                }
            })
    }

    const canvasContext: CanvasContext = {
        chartId,
        canvas,
        context2D: context,
        dpr,
        register: (id, draw, zIndex = 0) => {
            drawFns.set(id, {draw, zIndex})
            canvasContext.requestRedraw()
        },
        unregister: (id) => {
            drawFns.delete(id)
            canvasContext.requestRedraw()
        },
        requestRedraw: () => {
            if (animationFrameId === null) {
                animationFrameId = window.requestAnimationFrame(redrawNow)
            }
        }
    }

    return canvasContext
}

/**
 * Resizes the canvas's backing store to match `dimensions` at the current devicePixelRatio, so
 * that drawing stays crisp on high-DPI displays, and re-applies the dpr scale to the drawing
 * context so that one drawing-unit equals one CSS pixel. Replaces the old SVG `width`/`height`
 * attribute updates. Call this whenever the container's pixel dimensions change, before the next
 * redraw.
 * @param context The canvas context
 * @param dimensions The new overall (plot + margin) dimensions, in CSS pixels
 */
export function resizeCanvasTo(context: CanvasContext, dimensions: Dimensions): void {
    const {canvas, context2D, dpr} = context
    const width = Math.max(0, dimensions.width)
    const height = Math.max(0, dimensions.height)

    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)

    context2D.setTransform(dpr, 0, 0, dpr, 0, 0)
}

/**
 * Clips subsequent drawing to a rectangular area. Replaces the old SVG `<clipPath>`/
 * `setClipPathG`/`setClipPath`. Canvas clip regions are stack-based: callers must `ctx.save()`
 * before calling this and `ctx.restore()` once the clipped drawing is done, or the clip will leak
 * into unrelated draw calls later in the same frame.
 * @param context The canvas context
 * @param dimensions The dimensions of the area to clip to
 * @param origin The top-left corner of the clip area, in canvas drawing coordinates (defaults to
 * `(0, 0)`; pass the margin's `(left, top)` when clipping to the plot area, which is offset from
 * the canvas origin)
 */
export function clipToArea(
    context: CanvasContext,
    dimensions: Dimensions,
    origin: {x: number, y: number} = {x: 0, y: 0}
): void {
    context.context2D.beginPath()
    context.context2D.rect(origin.x, origin.y, Math.max(0, dimensions.width), Math.max(0, dimensions.height))
    context.context2D.clip()
}

/**
 * Represents the assignment of an x-axis and y-axis to a series. Plots (see, for example,
 * {@link ScatterPlot} and {@link RasterPlot}) use this interface to manage the assignment
 * of axes to series
 */
export interface AxesAssignment {
    xAxis: string
    yAxis: string
}

/**
 * Factory function for the assignment of axes to series
 * @param xAxis The ID of the x-axis
 * @param yAxis The ID of the y-axis
 * @return An {@link AxesAssignment}
 */
export const assignAxes = (xAxis: string, yAxis: string): AxesAssignment => ({xAxis, yAxis})

/**
 * Converts a map holding the axes' ranges into a map holding the axes' current intervals. Used
 * when reporting the axes' bounds to the code using the chart (see the plots' `onUpdateAxesInterval`).
 * @param ranges A map associating an axis ID with that axis' range
 * @return A map associating an axis ID with that axis' current interval
 */
export function currentIntervalsFrom(ranges: Map<string, BaseAxisRange>): Map<string, AxisInterval> {
    const intervals = new Map<string, AxisInterval>()
    ranges.forEach((range, axisId) => intervals.set(axisId, range.current))
    return intervals
}