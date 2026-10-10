import type {Series} from "../plots/plot";
import type {Dimensions, Margin} from "../styling/margins";
import type {OrdinalStringAxis} from "../axes/axes";

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
 * time. If the specified time is larger than any time in the specified data, the returns
 * the length of the data array. If the specified time is smaller than all the values in
 * the specified array, then returns -1.
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
 * @return {[[number, number], [number, number]]} the (time, value) point that comes just before
 * the mouse and just after the mouse. If the mouse is after the last point, then the "after" point
 * is `[NaN, NaN]`. If the mouse is before the first point, then the "before" point is `[NaN, NaN]`.
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
