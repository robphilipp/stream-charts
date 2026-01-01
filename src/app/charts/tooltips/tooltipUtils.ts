import {Series} from "../plots/plot";
import * as d3 from "d3";
import {Datum} from "../series/timeSeries";
import {Dimensions, Margin} from "../styling/margins";
import {OrdinalStringAxis} from "../axes/axes";

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
 * Removes the tooltip when the mouse has moved away from the spike
 */
export function removeTooltip() {
    d3.selectAll<SVGPathElement, Datum>('.tooltip').remove()
}

/**
 * Calculates the x-coordinate of the upper left-hand side of the tooltip rectangle (obviously without
 * "rounded corners"). Adjusts the x-coordinate so that tooltip is visible on the edges of the plot.
 * @param x The current x-coordinate of the mouse
 * @param textWidth The width of the tooltip text
 * @param plotDimensions The dimensions of the plot
 * @param tooltipStyle The tooltip style information
 * @param margin The plot margin
 * @return The x-coordinate of the lower left-hand side of the tooltip rectangle
 */
export function tooltipX(x: number, textWidth: number, plotDimensions: Dimensions, tooltipStyle: TooltipStyle, margin: Margin): number {
    if (x > plotDimensions.width + margin.left - (textWidth + tooltipStyle.paddingLeft + tooltipStyle.paddingRight)) {
        return x - textWidth - margin.right + tooltipStyle.paddingRight + tooltipStyle.paddingLeft
    }
    return x + tooltipStyle.paddingLeft
}

/**
 * Calculates the y-coordinate of the upper-left-hand corner of the tooltip rectangle. Adjusts the y-coordinate
 * so that the tooltip is visible on the upper edge of the plot
 * @param y The y-coordinate of the mouse
 * @param textHeight The height of the header and neuron ID text
 * @param plotDimensions The dimensions of the plot
 * @param tooltipStyle The tooltip style information
 * @param margin The plot margin
 * @return The y-coordinate of the lower-left-hand corner of the tooltip rectangle
 */
export function tooltipY(y: number, textHeight: number, plotDimensions: Dimensions, tooltipStyle: TooltipStyle, margin: Margin): number {
    if (y > plotDimensions.height + margin.top - (textHeight + tooltipStyle.paddingTop + tooltipStyle.paddingBottom)) {
        return plotDimensions.height + margin.top - (textHeight + tooltipStyle.paddingTop + tooltipStyle.paddingBottom)
    }
    return y + tooltipStyle.paddingTop
}

/**
 * Calculates the y-coordinate for the upper-left-hand the tooltip rectangle. Adjusts the y-coordinate so
 * that the tooltip is visible on the upper and lower edges of the plot
 * @param seriesName The name of the series
 * @param textHeight The height of the header and neuron ID text
 * @param axis The category axis for determining the y-value of the tooltip
 * @param tooltipStyle The tooltip style
 * @param margin The plot margin
 * @param categoryHeight The height (in pixels) of the category
 * @param plotDimensions The dimensions of the plot
 * @return The y-coordinate of the lower-left-hand corner of the tooltip rectangle
 */
export function categoryTooltipY(
    seriesName: string,
    textHeight: number,
    axis: OrdinalStringAxis,
    tooltipStyle: TooltipStyle,
    margin: Margin,
    categoryHeight: number,
    plotDimensions: Dimensions
): number {
    const y = axis.scale(seriesName) || 0
    const halfHeight = (tooltipStyle.paddingBottom + textHeight + tooltipStyle.paddingTop) / 2
    if (y < halfHeight) {
        return margin.top
    }
    if (y > plotDimensions.height + margin.top - halfHeight) {
        return plotDimensions.height + margin.top - textHeight
    }
    return y + margin.top - halfHeight + categoryHeight / 2
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
