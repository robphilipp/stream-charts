import type {Series} from "../plots/plot";
import type {Dimensions, Margin} from "../styling/margins";
import type {OrdinalStringAxis} from "../axes/axes";
import type {ScaleContinuousNumeric} from "d3";
import type {Datum} from "../series/timeSeries";
import {firstIndexAtOrAfter} from "../utils";

/**
 * Properties for rendering the tooltip. This is the style for the container
 * of the content.
 */
export interface TooltipStyle {
    /**
     * Visibility of the tooltip when the mouse hovers over a data series or point.
     */
    visible: boolean

    /**
     * The size of the font displayed in the tooltip
     */
    fontSize: number
    /**
     * The color of the text displayed in the tooltip
     */
    fontColor: string
    /**
     * The font family for the text displayed in the tooltip
     */
    fontFamily: string
    /**
     * The font weight for the text displayed in the tooltip
     */
    fontWeight: number

    /**
     * The background color
     */
    backgroundColor: string;
    backgroundOpacity: number;

    borderColor: string;
    borderOpacity: number;
    borderWidth: number;
    borderRadius: number;

    paddingLeft: number;
    paddingRight: number;
    paddingTop: number;
    paddingBottom: number;
}

/**
 * The default tooltip style
 */
export const defaultTooltipStyle: TooltipStyle = {
    visible: false,

    fontSize: 12,
    fontColor: 'rgba(10,31,58,0.99)',
    // fontColor: '#d2933f',
    // fontColor: '#202020',
    fontFamily: 'sans-serif',
    fontWeight: 250,

    backgroundColor: '#202020',
    backgroundOpacity: 0.8,

    borderColor: '#d2933f',
    borderOpacity: 1,
    borderWidth: 1,
    borderRadius: 5,

    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 5,
    paddingBottom: 10,
};

/**
 * Where a tooltip's box goes (the x and y of its top left corner, relative to the chart), and the
 * size of its content (without the padding)
 */
export interface TooltipDimensions {
    x: number,
    y: number,
    contentWidth: number,
    contentHeight: number
}

/**
 * Removes the tooltip when the mouse has moved away from the data point. Tooltips are now always
 * plain HTML overlay elements (see `Tooltip.tsx`) rather than SVG elements appended to the chart's
 * SVG root, so this no longer needs to special-case SVG vs. HTML removal the way the old version did.
 *
 * `scope` is required (no default falling back to `document`) so a caller can't accidentally
 * remove every `.tooltip` element on the page -- pass the specific chart instance's own overlay
 * container (`canvas.parentElement`, see `Tooltip.tsx`) so this only ever touches that chart's own
 * tooltip, never another chart instance's, or an unrelated host-app element that happens to also
 * use the `tooltip` class.
 * @param scope The DOM node to search within (e.g. this chart instance's overlay container)
 */
export function removeTooltip(scope: ParentNode): void {
    scope.querySelectorAll('.tooltip').forEach(element => element.remove())
}

/**
 * Calculates the x-coordinate of the left side of the tooltip. The tooltip goes to the right of the
 * mouse, unless it would run past the right edge of the plot, in which case it goes to the left of
 * the mouse (and never past the left edge of the chart).
 * @param x The x-coordinate of the mouse, relative to the chart
 * @param width The tooltip's (rendered) width, including its padding and border
 * @param plotDimensions The dimensions of the plot
 * @param tooltipStyle The tooltip style information (its left padding is used as the gap between
 * the mouse and the tooltip)
 * @param margin The plot margin
 * @return The x-coordinate of the tooltip's left side, relative to the chart
 */
export function tooltipX(x: number, width: number, plotDimensions: Dimensions, tooltipStyle: TooltipStyle, margin: Margin): number {
    const gap = tooltipStyle.paddingLeft
    if (x + gap + width <= margin.left + plotDimensions.width) {
        return x + gap
    }
    return Math.max(0, x - gap - width)
}

/**
 * Calculates the y-coordinate of the top of the tooltip. The tooltip goes below the mouse, unless it
 * would run past the bottom of the plot, in which case it's moved up so that its bottom lines up
 * with the plot's bottom (and never past the top edge of the chart).
 * @param y The y-coordinate of the mouse, relative to the chart
 * @param height The tooltip's (rendered) height, including its padding and border
 * @param plotDimensions The dimensions of the plot
 * @param tooltipStyle The tooltip style information (its top padding is used as the gap between
 * the mouse and the tooltip)
 * @param margin The plot margin
 * @return The y-coordinate of the tooltip's top, relative to the chart
 */
export function tooltipY(y: number, height: number, plotDimensions: Dimensions, tooltipStyle: TooltipStyle, margin: Margin): number {
    const gap = tooltipStyle.paddingTop
    if (y + gap + height <= margin.top + plotDimensions.height) {
        return y + gap
    }
    return Math.max(0, margin.top + plotDimensions.height - height)
}

/**
 * Calculates the y-coordinate of the top of a tooltip for a category (e.g. a raster plot's row):
 * the tooltip is centered on the category, but kept within the plot's top and bottom edges.
 * @param seriesName The name of the series (the category)
 * @param height The tooltip's (rendered) height, including its padding and border
 * @param axis The category axis for determining the y-value of the tooltip
 * @param margin The plot margin
 * @param categoryHeight The height (in pixels) of the category
 * @param plotDimensions The dimensions of the plot
 * @return The y-coordinate of the tooltip's top, relative to the chart
 */
export function categoryTooltipY(
    seriesName: string,
    height: number,
    axis: OrdinalStringAxis,
    margin: Margin,
    categoryHeight: number,
    plotDimensions: Dimensions
): number {
    const categoryCenter = margin.top + (axis.scale(seriesName) || 0) + categoryHeight / 2
    const top = categoryCenter - height / 2
    const lowest = margin.top + plotDimensions.height - height
    return Math.max(margin.top, Math.min(top, lowest))
}

/**
 * Returns the index of the data point whose time is the upper boundary on the specified
 * time. If the specified time is larger than any time in the specified data, then returns
 * the length of the data array. If the specified time is smaller than all the values in
 * the specified array, then returns 0. The data must not be empty.
 * @param data The array of points from which to select the
 * boundary.
 * @param value The time for which to find the bounding points
 * @param xFrom A function that extracts the x-value from the datum
 * @template D The type of the datum in the data-series
 * @return The index of the upper boundary.
 */
function boundingPointsIndex<D>(data: Series<D>, value: number, xFrom: (value: D) => number): number {
    const length = data.length
    if (value > xFrom(data[length - 1])) {
        return length
    }
    if (value < xFrom(data[0])) {
        return 0
    }
    return data.findIndex((_, index, array) => {
        const lowerIndex = Math.max(0, index - 1)
        return xFrom(array[lowerIndex]) <= value && value <= xFrom(array[index])
    })
}

/**
 * Returns the (time, value) point that comes just before the mouse and just after the mouse
 * @param data The time-series data
 * @param value The time represented by the mouse's x-coordinate
 * @param xFrom A function that extracts the x-value from the datum
 * @param emptyDatum A function that returns an empty datum
 * @template D The type of the datum in the data-series
 * @return The point that comes just before the mouse and just after the mouse. If the mouse is
 * after the last point, then the "after" point is the empty datum. If the mouse is before the
 * first point, then the "before" point is the empty datum. (Both are, for an empty series.)
 */
export function boundingPoints<D>(data: Series<D>, value: number, xFrom: (value: D) => number, emptyDatum: () => D): [D, D] {
    // an empty series has no bounding points at all -- guard here (not just inside
    // boundingPointsIndex) since this function's own upperIndex<=0/>=data.length fallbacks below
    // also read data[0]/data[data.length-1], which are just as undefined on an empty array
    if (data.length === 0) {
        return [emptyDatum(), emptyDatum()]
    }
    const upperIndex = boundingPointsIndex<D>(data, value, xFrom)
    if (upperIndex <= 0) {
        return [emptyDatum(), data[0]]
    }
    if (upperIndex >= data.length) {
        return [data[data.length - 1], emptyDatum()]
    }
    return [data[upperIndex - 1], data[upperIndex]]
}

/**
 * Finds the first point whose x-value is within the tolerance of the specified value, along with
 * the points before and after it
 * @param data The series' data
 * @param value The x-value to look for
 * @param tolerance How far (in the x-value's units) a point's x-value may be from the value
 * @param xFrom A function that extracts the x-value from the datum
 * @param emptyDatum A function that returns an empty datum (for a point that doesn't exist)
 * @return The point before, the point, the point after, and the point's index (-1 when no point
 * is within the tolerance, in which case the point and the point before are empty, and the point
 * after is the series' first point)
 * @template D The type of the datum in the data-series
 */
export function findPointAndNeighbors<D>(
    data: Series<D>,
    value: number,
    tolerance: number,
    xFrom: (value: D) => number,
    emptyDatum: () => D
): [D, D, D, number] {
    // find the index of the point
    const index = data.findIndex((_, index, array) => Math.abs(xFrom(array[index]) - value) <= tolerance)
    const point = index > -1 ? data[index] : emptyDatum()
    const lower = (index > 0) ? data[index-1] : emptyDatum()
    const upper = (index < data.length - 1) ? data[index+1] : emptyDatum()
    return [lower, point, upper, index]
}

/**
 * Calculates the width and height of the tooltip content. Canvas replacement for the old SVG
 * `getBBox()`-based version: tooltip content is now plain HTML, so the browser lays it out and
 * we just read the resulting box back via `getBoundingClientRect()`.
 * @param element The HTML element holding the tooltip content (must already be attached to the
 * DOM -- an unattached/`display: none` element measures as 0x0)
 * @returns The width and height of the tooltip content
 */
export function textDimensionsFor(element: HTMLElement): {width: number, height: number} {
    const rect = element.getBoundingClientRect()
    return {width: rect.width, height: rect.height}
}

/**
 * Calculates the width of the tooltip content. See {@link textDimensionsFor}.
 * @param element The HTML element holding the tooltip content
 * @returns The width of the tooltip content
 */
export function textWidthFor(element: HTMLElement): number {
    return textDimensionsFor(element).width
}

/**
 * Calculates the height of the tooltip content. See {@link textDimensionsFor}.
 * @param element The HTML element holding the tooltip content
 * @returns The height of the tooltip content
 */
export function textHeightFor(element: HTMLElement): number {
    return textDimensionsFor(element).height
}

/**
 * The points of a scatter series that a tooltip shows (and the plot highlights), depending on
 * where the mouse is over the series:
 * - directly over a data point: that `point`, along with the points `before` and `after` it
 * - over a line segment between two points: the points `before` and `after` the mouse
 *
 * `before` and `after` are undefined when there's no such point (e.g. before the first point).
 */
export type ScatterTooltipPoints =
    | { kind: 'point', before?: Datum, point: Datum, after?: Datum }
    | { kind: 'segment', before?: Datum, after?: Datum }

/**
 * The scatter plot's tooltip metadata: the points the tooltip shows
 */
export interface ScatterTooltipMetadata {
    points: ScatterTooltipPoints
}

/**
 * Determines which of a scatter series' points a tooltip shows, from where the mouse is: when the
 * mouse is over a data point, that point (and its neighbors); otherwise the points on either side
 * of the mouse (the segment it's over).
 *
 * The mouse is over a point when it's within `pointRadius` pixels of it -- or, when the point's
 * nearest neighbor is closer than three times that, within a third of the way to that neighbor.
 * Otherwise, with dense data (points a few pixels apart), the mouse would almost always be within
 * the radius of some point, and the segments between them could hardly be hovered at all.
 * @param data The series' data, ordered by x
 * @param mouse The mouse's coordinates, within the plot area (i.e. in the axes' ranges)
 * @param xScale The series' x-axis scale
 * @param yScale The series' y-axis scale
 * @param pointRadius How close (in pixels) the mouse must be to a data point to be over it
 * @return The points the tooltip shows
 */
export function scatterTooltipPoints(
    data: { length: number, [index: number]: Datum },
    mouse: [x: number, y: number],
    xScale: ScaleContinuousNumeric<number, number>,
    yScale: ScaleContinuousNumeric<number, number>,
    pointRadius: number
): ScatterTooltipPoints {
    const [mouseX, mouseY] = mouse
    const pointAt = (index: number): Datum | undefined => index >= 0 && index < data.length ? data[index] : undefined
    // the first point at, or after, the mouse's x-value
    const index = firstIndexAtOrAfter(data, xScale.invert(mouseX), datum => datum.x)

    // the on-screen distance between two points
    const distanceBetween = (a: Datum, b: Datum): number => Math.hypot(xScale(a.x) - xScale(b.x), yScale(a.y) - yScale(b.y))
    // how close the mouse must be to the point (see above)
    const radiusFor = (candidate: number): number => {
        const neighborDistances = [pointAt(candidate - 1), pointAt(candidate + 1)]
            .filter((neighbor): neighbor is Datum => neighbor !== undefined)
            .map(neighbor => distanceBetween(data[candidate], neighbor))
        return Math.min(pointRadius, ...neighborDistances.map(distance => distance / 3))
    }

    // the nearest point (on screen) that the mouse is over, among those around the mouse's x-value
    let nearest: number | undefined = undefined
    let nearestDistance = Infinity
    for (let candidate = index - 2; candidate <= index + 1; candidate++) {
        const datum = pointAt(candidate)
        if (datum === undefined) continue
        const distance = Math.hypot(xScale(datum.x) - mouseX, yScale(datum.y) - mouseY)
        if (distance <= radiusFor(candidate) && distance < nearestDistance) {
            nearestDistance = distance
            nearest = candidate
        }
    }

    if (nearest !== undefined) {
        return {kind: 'point', before: pointAt(nearest - 1), point: data[nearest], after: pointAt(nearest + 1)}
    }
    return {kind: 'segment', before: pointAt(index - 1), after: pointAt(index)}
}

/**
 * The points a scatter tooltip shows, as a list (e.g. for highlighting them)
 * @param points The points the tooltip shows
 * @return The points, in order
 */
export function scatterTooltipPointList(points: ScatterTooltipPoints): Array<Datum> {
    const list = points.kind === 'point' ?
        [points.before, points.point, points.after] :
        [points.before, points.after]
    return list.filter((datum): datum is Datum => datum !== undefined)
}

/**
 * A sparkline: a small line chart of a series' values over time (e.g. for a tooltip), as an SVG
 * path, and where its last point is
 */
export interface Sparkline {
    // the SVG path of the line, within the sparkline's width and height
    path: string
    // where the line ends (the latest value)
    end: [x: number, y: number]
    // where the marked point is (see `sparklineFor`'s `markedTime`), when one was asked for, and found
    mark?: [x: number, y: number]
}

/**
 * Creates a sparkline of the specified (time-ordered) values: time runs left to right across the
 * width, and the values are scaled to fill the height (the highest at the top). Values that
 * aren't finite are skipped.
 *
 * A long series is reduced to (at most) four points per pixel column -- the column's first,
 * lowest, highest, and last values, in the order they occurred -- so that the path stays small,
 * while still tracing the line's true shape, spikes included.
 * @param data The values, ordered by time
 * @param width The sparkline's width (in pixels)
 * @param height The sparkline's height (in pixels)
 * @param padding The space (in pixels) to leave around the line, within the width and height
 * @param valueRange The (fixed) range of values the height spans (values outside it are drawn at
 * its edge) -- by default, the range of the values themselves
 * @param markedTime The time of a point to mark (e.g. the hovered point), whose position is
 * returned as the sparkline's `mark` -- by default, none
 * @return The sparkline, or `undefined` when there are fewer than two values to draw
 */
export function sparklineFor(
    data: { length: number, [index: number]: { time: number, value: number } },
    width: number,
    height: number,
    padding: number = 2,
    valueRange?: [min: number, max: number],
    markedTime?: number
): Sparkline | undefined {
    const points: Array<{ time: number, value: number }> = []
    for (let i = 0; i < data.length; i++) {
        if (Number.isFinite(data[i].time) && Number.isFinite(data[i].value)) points.push(data[i])
    }
    if (points.length < 2) return undefined

    const startTime = points[0].time
    const timeSpan = points[points.length - 1].time - startTime
    let minValue = Infinity
    let maxValue = -Infinity
    if (valueRange !== undefined) {
        [minValue, maxValue] = valueRange
    } else {
        points.forEach(({value}) => {
            minValue = Math.min(minValue, value)
            maxValue = Math.max(maxValue, value)
        })
    }
    const innerWidth = width - 2 * padding
    const innerHeight = height - 2 * padding
    const xOf = (time: number) => padding + (timeSpan > 0 ? (time - startTime) / timeSpan * innerWidth : innerWidth / 2)
    // (a flat line sits in the middle)
    const yOf = (value: number) => padding + (maxValue > minValue ?
        (maxValue - Math.min(maxValue, Math.max(minValue, value))) / (maxValue - minValue) * innerHeight :
        innerHeight / 2)

    // each pixel column's first, lowest, highest, and last values, in the order they occurred
    const reduced: Array<{ time: number, value: number }> = []
    let column: Array<{ index: number, point: { time: number, value: number } }> = []
    let columnX = Math.floor(xOf(points[0].time))
    const flushColumn = () => {
        if (column.length === 0) return
        const lowest = column.reduce((low, entry) => entry.point.value < low.point.value ? entry : low)
        const highest = column.reduce((high, entry) => entry.point.value > high.point.value ? entry : high)
        const kept = new Map([column[0], lowest, highest, column[column.length - 1]].map(entry => [entry.index, entry.point]))
        Array.from(kept.entries()).sort(([a], [b]) => a - b).forEach(([, point]) => reduced.push(point))
        column = []
    }
    points.forEach((point, index) => {
        const x = Math.floor(xOf(point.time))
        if (x !== columnX) {
            flushColumn()
            columnX = x
        }
        column.push({index, point})
    })
    flushColumn()

    const coordinates = reduced.map(({time, value}) => [xOf(time), yOf(value)] as [number, number])
    const round = (value: number) => Math.round(value * 100) / 100
    const marked = markedTime === undefined ? undefined : points.find(point => point.time === markedTime)
    return {
        path: coordinates.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${round(x)},${round(y)}`).join(' '),
        end: coordinates[coordinates.length - 1],
        ...(marked !== undefined ? {mark: [xOf(marked.time), yOf(marked.value)] as [number, number]} : {}),
    }
}

/**
 * The raster plot's tooltip metadata: all of the hovered series' spikes that the chart holds (the
 * tooltip data's `series` holds just the hovered spike)
 */
export interface RasterTooltipMetadata {
    spikes: Series<Datum>
}

/**
 * Statistics of a series' (time, value) points -- e.g. a raster chart's spikes, or a scatter
 * chart's points -- over the window of data that the chart holds. Those that need at least two
 * points are undefined when there's only one.
 */
export interface SeriesStatistics {
    // the number of points
    count: number
    // the mean of the points' values
    meanValue: number | undefined
    // the (sample) standard deviation of the points' values
    valueStandardDeviation: number | undefined
    // the mean time between consecutive points
    meanInterval: number | undefined
}

/**
 * Calculates the statistics of a series' (time, value) points: their count, the mean and the
 * (sample) standard deviation of their values, and the mean time between consecutive points.
 * Points whose value or time isn't finite are skipped.
 * @param spikes The points (e.g. spikes), ordered by time
 * @return The statistics
 */
export function seriesStatistics(spikes: { length: number, [index: number]: Datum }): SeriesStatistics {
    const valid: Array<Datum> = []
    for (let i = 0; i < spikes.length; i++) {
        if (Number.isFinite(spikes[i].x) && Number.isFinite(spikes[i].y)) valid.push(spikes[i])
    }
    const count = valid.length
    if (count === 0) return {count, meanValue: undefined, valueStandardDeviation: undefined, meanInterval: undefined}

    const meanValue = valid.reduce((sum, spike) => sum + spike.y, 0) / count
    if (count < 2) return {count, meanValue, valueStandardDeviation: undefined, meanInterval: undefined}

    const sumOfSquares = valid.reduce((sum, spike) => sum + (spike.y - meanValue) ** 2, 0)
    return {
        count,
        meanValue,
        valueStandardDeviation: Math.sqrt(sumOfSquares / (count - 1)),
        // the intervals between consecutive spikes sum to the span from the first to the last
        meanInterval: (valid[count - 1].x - valid[0].x) / (count - 1),
    }
}

/**
 * Formats a value, or shows a dash when there isn't one (e.g. the standard deviation of a single
 * point)
 * @param value The value, if there is one
 * @param formatter Formats the value
 * @return The formatted value, or a dash
 */
export function valueOrMissing(value: number | undefined, formatter: (value: number) => string): string {
    return value === undefined ? '–' : formatter(value)
}

// the largest lag (in points) for which the autocorrelation is calculated by default
const MAX_AUTOCORRELATION_LAG = 50

/**
 * Calculates the (sample) autocorrelation of a series' values, by lag: for each lag `k` (in
 * points, not time -- a series' points needn't be evenly spaced in time), the correlation between
 * the values and the values `k` points later,
 * <p>`r[k] = sum[t](x[t] - mean) * (x[t+k] - mean) / sum[t](x[t] - mean)^2`</p>
 * so `r[0]` is 1, and the values are between -1 and 1. Points whose value or time isn't finite are
 * skipped.
 * @param points The series' points, ordered by time
 * @param maxLag The largest lag -- by default, a quarter of the number of points (the usual rule
 * of thumb, since the estimates for larger lags rest on too few pairs of points), but no more than 50
 * @return The autocorrelation for each lag, from 0 to the largest lag, or `undefined` when there
 * are fewer than four points (so no lag beyond 0), or the values don't vary
 */
export function autocorrelation(
    points: { length: number, [index: number]: Datum },
    maxLag?: number
): Array<number> | undefined {
    const values: Array<number> = []
    for (let i = 0; i < points.length; i++) {
        if (Number.isFinite(points[i].x) && Number.isFinite(points[i].y)) values.push(points[i].y)
    }
    const count = values.length
    const largestLag = Math.min(count - 1, maxLag ?? Math.min(MAX_AUTOCORRELATION_LAG, Math.floor(count / 4)))
    if (largestLag < 1) return undefined

    const mean = values.reduce((sum, value) => sum + value, 0) / count
    const deviations = values.map(value => value - mean)
    const variance = deviations.reduce((sum, deviation) => sum + deviation * deviation, 0)
    if (variance === 0) return undefined

    const correlations: Array<number> = []
    for (let lag = 0; lag <= largestLag; lag++) {
        let sum = 0
        for (let t = 0; t + lag < count; t++) sum += deviations[t] * deviations[t + lag]
        correlations.push(sum / variance)
    }
    return correlations
}
