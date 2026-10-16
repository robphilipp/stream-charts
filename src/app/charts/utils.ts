import type {Dimensions, Margin} from "./styling/margins"
import * as d3 from "d3";

/**
 * No operation function for use when a default function is needed
 */
export const noop = () => {
    /* empty on purpose */
}

/**
 * Calculates whether the mouse is in the plot-area
 * @param x The x-coordinate of the mouse's position
 * @param y The y-coordinate of the mouse's position
 * @param margin The plot margins
 * @param dimensions The overall dimensions (plot dimensions plus margin)
 * @return `true` if the mouse is in the plot area; `false` if the mouse is not in the plot area
 */
export function mouseInPlotAreaFor(x: number, y: number, margin: Margin, dimensions: Dimensions): boolean {
    return x > margin.left &&
        x < dimensions.width - margin.right &&
        y > margin.top &&
        y < dimensions.height - margin.bottom
}

/**
 * Type for representing the dimensions and location of a text element's bounding box. Kept for
 * shape-compatibility with the old SVG version; `x`/`y` are always `0` for canvas text (canvas
 * `measureText` has no bbox offset the way an SVG `<text>` element's `getBBox()` does).
 */
export type BoundingBox = { x: number, y: number, width: number, height: number }

/**
 * @return An empty bounding box with x, y, width, height set to 0.
 */
export function emptyBoundingBox(): BoundingBox {
    return {x: 0, y: 0, width: 0, height: 0}
}

/**
 * Canvas replacement for the old SVG `getBBox()`-based `textWidthOf`. Measures the rendered width
 * of `text` in whatever font is currently set on `ctx`.
 * @param context The canvas 2D context; its `.font` must already be set to the font to measure with
 * @param text The text to measure
 * @return The width, in pixels, that `text` would occupy when drawn with `ctx.fillText`
 */
export function textWidthOf(context: CanvasRenderingContext2D, text: string): number {
    return context.measureText(text).width || 0
}

/**
 * Canvas replacement for the old SVG `getBBox()`-based `textDimensions`. Measures the width and
 * height of `text` as it would be rendered with the font currently set on `ctx`.
 * @param context The canvas 2D context; its `.font` must already be set to the font to measure with
 * @param text The text to measure
 * @return The bounding box for the text. `x`/`y` are always `0`; use `ascent`/`descent` (see
 * {@link textMetricsOf}) instead when you need baseline-aware placement.
 */
export function textDimensions(context: CanvasRenderingContext2D, text: string): BoundingBox {
    const metrics = context.measureText(text)
    const ascent = metrics.actualBoundingBoxAscent ?? metrics.fontBoundingBoxAscent ?? 0
    const descent = metrics.actualBoundingBoxDescent ?? metrics.fontBoundingBoxDescent ?? 0
    return {
        x: 0,
        y: 0,
        width: metrics.width || 0,
        height: ascent + descent
    }
}

/**
 * Measures `text` as rendered by `ctx`, returning both dimensions and ascent/descent -- useful
 * when you need to position text relative to its own baseline (e.g. vertically centering a tick
 * label, or rotating it about its visual center) rather than just knowing its box size.
 * @param context The canvas 2D context; its `.font` must already be set to the font to measure with
 * @param text The text to measure
 * @return The text's width, and its ascent and descent (from its baseline), in pixels
 */
export function textMetricsOf(context: CanvasRenderingContext2D, text: string): {width: number, ascent: number, descent: number} {
    const metrics = context.measureText(text)
    return {
        width: metrics.width || 0,
        ascent: metrics.actualBoundingBoxAscent ?? metrics.fontBoundingBoxAscent ?? 0,
        descent: metrics.actualBoundingBoxDescent ?? metrics.fontBoundingBoxDescent ?? 0
    }
}

/**
 * Builds a CSS font shorthand string suitable for assigning to `ctx.font`.
 * @param size The font size, in pixels
 * @param family The font family (e.g. `'sans-serif'`)
 * @param weight The font weight (e.g. `300`)
 * @return The font string (e.g. `"300 12px sans-serif"`)
 */
export function fontStringFor(size: number, family: string, weight: number): string {
    return `${weight} ${size}px ${family}`
}

/**
 * Formats a number with a d3 format specifier
 * @param value The number
 * @param format The d3 format specifier (e.g. `" ,.3f"`)
 * @return The formatted number, or `"---"` when the number is `NaN`
 */
export function formatNumber(value: number, format: string): string {
    return isNaN(value) ? '---' : d3.format(format)(value)
}

/**
 * Formats a time as a whole number, with thousands separators, followed by the units
 * @param value The time
 * @param [units=""] The units (e.g. `"ms"`), appended after a space (unless the time is `NaN`)
 * @return The formatted time, or `"---"` when the time is `NaN`
 */
export function formatTime(value: number, units: string = ""): string {
    return `${formatNumber(value, " ,.0f")}${!isNaN(value) && units ? ` ${units}` : ""}`
}

/**
 * Formats a value with three decimal places, and thousands separators
 * @param value The value
 * @return The formatted value, or `"---"` when the value is `NaN`
 */
export function formatValue(value: number): string {
    return formatNumber(value, " ,.3f")
}

/**
 * Formats the change from one number to another (`v2 - v1`) with a d3 format specifier
 * @param v1 The number before
 * @param v2 The number after
 * @param format The d3 format specifier (e.g. `" ,.3f"`)
 * @return The formatted change, or `"---"` when either number is `NaN`
 */
export function formatChange(v1: number, v2: number, format: string): string {
    return isNaN(v1) || isNaN(v2) ? '---' : d3.format(format)(v2 - v1)
}

/**
 * Formats the change from one time to another (`v2 - v1`) as a whole number, with thousands separators
 * @param v1 The time before
 * @param v2 The time after
 * @return The formatted change, or `"---"` when either time is `NaN`
 */
export function formatTimeChange(v1: number, v2: number): string {
    return formatChange(v1, v2, " ,.0f")
}

/**
 * Formats the change from one value to another (`v2 - v1`) with three decimal places, and
 * thousands separators
 * @param v1 The value before
 * @param v2 The value after
 * @return The formatted change, or `"---"` when either value is `NaN`
 */
export function formatValueChange(v1: number, v2: number): string {
    return formatChange(v1, v2, " ,.3f")
}

/**
 * Calculates the (min, max) of all the values (from the accessor) in the data matrix, clamped by the global
 * (currentMin, currentMax).
 *
 * Curried function that accepts an accessor used to grab the value from the data point, and array of (x, y) values
 * (each (x, y) value is represented as [number, number] tuple), and a global, current min and max values. The
 * global, current min and max clamp the calculated min and max values.
 * @param accessor Access function that accepts a datum and returns the value which to use in the min-max calc
 * @return A function that accepts data (represented as a matrix of (x, y) pairs, where each row is a data series),
 * a global currentMin and currentMax, which clamp the calculated results. The function return a tuple holding the
 * min as the first value and the max as the second value (when there's no data, the min is the smaller of 0 and
 * currentMin, and the max the larger of 1 and currentMax).
 * @example
 * // function that calculates the min-max of the y-values generated by calling the minMaxOf and handing it the
 * // accessor function that grabs the y-value from the datum
 * const minMaxTimeSeriesY: (data: Array<TimeSeries>, currentMinMax: [number, number]) => [number, number] =
 minMaxOf((datum: [number, number]): number => datum[1])
 */
export const minMaxOf = <T>(accessor: (v: T) => number) =>
    (data: Array<Array<T>>, currentMinMax: [number, number]): [number, number] => [
        Math.min(d3.min(data, series => d3.min(series, datum => accessor(datum))) ?? 0, currentMinMax[0]),
        Math.max(d3.max(data, series => d3.max(series, datum => accessor(datum))) ?? 1, currentMinMax[1])
    ]

/**
 * Finds the index of the first element whose x-value (per `xFrom`) is `>= value`, in a
 * time-ordered (ascending) array-like collection, via binary search. Used to cheaply skip
 * retained-but-off-screen data before doing per-point work (scaling, segment building) in a
 * plot's draw function -- retained data (governed by `dropDataAfter`) is often much larger than
 * what's actually visible in the current axis domain (a scrolling window), so iterating the full
 * retained array every frame does a lot of work whose result is immediately discarded as
 * off-screen. Finding the visible slice's start index up front makes per-frame cost scale with
 * what's on screen, not with how much history is retained.
 * @param data An array-like collection (supports `.length` and index access), sorted ascending by `xFrom`
 * @param value The x-value to search for
 * @param xFrom A function that extracts the x-value from an element
 * @return The index of the first element with `xFrom(element) >= value`, or `data.length` if
 * every element is before `value`
 * @template D The type of the elements in `data`
 */
export function firstIndexAtOrAfter<D>(data: {length: number, [index: number]: D}, value: number, xFrom: (datum: D) => number): number {
    let lo = 0
    let hi = data.length
    while (lo < hi) {
        const mid = (lo + hi) >>> 1
        if (xFrom(data[mid]) < value) {
            lo = mid + 1
        } else {
            hi = mid
        }
    }
    return lo
}

/**
 * User specified series name may have spaces, and these may not be valid CSS ids. This
 * function replaces spaces with underscores. Kept for use in `Map`/draw-handle keys even though
 * canvas has no DOM ids to collide with.
 * @param name The name to be made safe for CSS
 * @return The name with spaces replaced with underscores
 */
export function makeIdSafeForCss(name: string): string {
    // Spaces are not valid in XML IDs, and break CSS `#id` selectors; replace them.
    return name.replace(/\s+/g, '_')
}
