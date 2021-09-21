import {TimeSeries} from "./plot";
import * as d3 from "d3";
import {Datum} from "./datumSeries";
import {Dimensions, Margin} from "./margins";
import {CategoryAxis} from "./axes";

/**
 * Properties for rendering the tooltip. This is the style for the container
 * of the content.
 */
export interface TooltipStyle {
    visible: boolean;

    fontSize: number;
    fontColor: string;
    fontFamily: string;
    fontWeight: number;

    backgroundColor: string;
    backgroundOpacity: number;

    borderColor: string;
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
    fontColor: '#d2933f',
    fontFamily: 'sans-serif',
    fontWeight: 250,

    backgroundColor: '#202020',
    backgroundOpacity: 0.8,

    borderColor: '#d2933f',
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
 * Calculates the x-coordinate of the lower left-hand side of the tooltip rectangle (obviously without
 * "rounded corners"). Adjusts the x-coordinate so that tooltip is visible on the edges of the plot.
 * @param x The current x-coordinate of the mouse
 * @param textWidth The width of the tooltip text
 * @param plotDimensions The dimensions of the plot
 * @param tooltipStyle The tooltip style information
 * @param margin The plot margin
 * @return The x-coordinate of the lower left-hand side of the tooltip rectangle
 */
export function tooltipX(x: number, textWidth: number, plotDimensions: Dimensions, tooltipStyle: TooltipStyle, margin: Margin): number {
    if (x + textWidth + tooltipStyle.paddingLeft + 10 > plotDimensions.width + margin.left) {
        return x - textWidth - margin.right + tooltipStyle.paddingRight + tooltipStyle.paddingLeft
    }
    return x + tooltipStyle.paddingLeft
}

/**
 * Calculates the y-coordinate of the lower-left-hand corner of the tooltip rectangle. Adjusts the y-coordinate
 * so that the tooltip is visible on the upper edge of the plot
 * @param y The y-coordinate of the series
 * @param textHeight The height of the header and neuron ID text
 * @param plotDimensions The dimensions of the plot
 * @param tooltipStyle The tooltip style information
 * @param margin The plot margin
 * @return The y-coordinate of the lower-left-hand corner of the tooltip rectangle
 */
export function tooltipY(y: number, textHeight: number, plotDimensions: Dimensions, tooltipStyle: TooltipStyle, margin: Margin): number {
    return Math.min(
        y + margin.top - textHeight,
        plotDimensions.height - margin.top + tooltipStyle.paddingTop + tooltipStyle.paddingBottom
    )
}

/**
 * Calculates the y-coordinate of the lower-left-hand corner of the tooltip rectangle. Adjusts the y-coordinate
 * so that the tooltip is visible on the upper edge of the plot
 * @param seriesName The name of the series
 * @param textHeight The height of the header and neuron ID text
 * @param axis The category axis for determining the y-value of the tooltip
 * @param tooltipStyle The tooltip style
 * @param margin The plot margin
 * @param categoryHeight The height (in pixels) of the category
 * @return The y-coordinate of the lower-left-hand corner of the tooltip rectangle
 */
export function categoryTooltipY(
    seriesName: string,
    textHeight: number,
    axis: CategoryAxis,
    tooltipStyle: TooltipStyle,
    margin: Margin,
    categoryHeight: number
): number {
    const y = (axis.scale(seriesName) || 0) + margin.top - tooltipStyle.paddingBottom
    return y > 0 ? y : y + tooltipStyle.paddingBottom + textHeight + tooltipStyle.paddingTop + categoryHeight
}


/**
 * Returns the index of the data point whose time is the upper boundary on the specified
 * time. If the specified time is larger than any time in the specified data, the returns
 * the length of the data array. If the specified time is smaller than all the values in
 * the specified array, then returns -1.
 * @param data The array of points from which to select the
 * boundary.
 * @param time The time for which to find the bounding points
 * @return The index of the upper boundary.
 */
function boundingPointsIndex(data: TimeSeries, time: number): number {
    const length = data.length
    if (time > data[length - 1][0]) {
        return length
    }
    if (time < data[0][0]) {
        return 0
    }
    return data.findIndex((value, index, array) => {
        const lowerIndex = Math.max(0, index - 1)
        return array[lowerIndex][0] <= time && time <= array[index][0]
    })
}


/**
 * Returns the (time, value) point that comes just before the mouse and just after the mouse
 * @param data The time-series data
 * @param time The time represented by the mouse's x-coordinate
 * @return {[[number, number], [number, number]]} the (time, value) point that comes just before
 * the mouse and just after the mouse. If the mouse is after the last point, then the "after" point
 * is `[NaN, NaN]`. If the mouse is before the first point, then the "before" point is `[NaN, NaN]`.
 */
export function boundingPoints(data: TimeSeries, time: number): [[number, number], [number, number]] {
    const upperIndex = boundingPointsIndex(data, time)
    if (upperIndex <= 0) {
        return [[NaN, NaN], data[0]]
    }
    if (upperIndex >= data.length) {
        return [data[data.length - 1], [NaN, NaN]]
    }
    return [data[upperIndex - 1], data[upperIndex]]
}
