import {Dimensions, Margin} from "./margins";
import {ContinuousAxisRange, continuousAxisRangeFor} from "./continuousAxisRangeFor";
import * as d3 from "d3";
import {Axis, ScaleBand, ScaleContinuousNumeric, ScaleLinear, ZoomTransform} from "d3";
import {AxisElementSelection, SvgSelection} from "./d3types";
import {addContinuousNumericXAxis, addContinuousNumericYAxis} from "./ContinuousAxis";
import {noop} from "./utils";
import {AxesState} from "./hooks/AxesState";
import {Series} from "./datumSeries";
import {AxesAssignment} from "./plot";

export interface AxesLabelFont {
    size: number
    color: string
    family: string
    weight: number
}

export const defaultAxesLabelFont: AxesLabelFont = {
    size: 12,
    color: '#d2933f',
    weight: 300,
    family: 'sans-serif'
}

export interface SeriesLineStyle {
    color: string
    lineWidth: number
    highlightColor: string
    highlightWidth: number
    margin?: number
}

export const defaultLineStyle: SeriesLineStyle = {
    color: '#008aad',
    lineWidth: 1,
    highlightColor: '#008aad',
    highlightWidth: 3,
}

export interface Axes<X extends BaseAxis, Y extends BaseAxis> {
    xAxis: X
    yAxis: Y
}

export interface BaseAxis {
    axisId: string
    location: AxisLocation
    selection: AxisElementSelection
}

export interface ContinuousNumericAxis extends BaseAxis {
    scale: ScaleContinuousNumeric<number, number>
    generator: Axis<number | { valueOf(): number }>
    update: (domain: [startValue: number, endValue: number], plotDimensions: Dimensions, margin: Margin) => void
}

export interface CategoryAxis extends BaseAxis {
    scale: ScaleBand<string>
    generator: Axis<string>
    categorySize: number
    update: (categoryNames: Array<string>, unfilteredSize: number, plotDimensions: Dimensions, margin: Margin) => number
}

export enum AxisLocation {
    Left,
    Right,
    Bottom,
    Top
}

export function addLinearAxis(
    chartId: number,
    axisId: string,
    svg: SvgSelection,
    location: AxisLocation,
    plotDimensions: Dimensions,
    domain: [minValue: number, maxValue: number],
    axesLabelFont: AxesLabelFont,
    margin: Margin,
    axisLabel: string,
): ContinuousNumericAxis {
    switch (location) {
        // y-axis
        case AxisLocation.Left:
        case AxisLocation.Right:
            return addContinuousNumericYAxis(
                chartId,
                axisId,
                svg,
                plotDimensions,
                location,
                d3.scaleLinear(),
                domain,
                axesLabelFont,
                margin,
                axisLabel
            )

        // x-axis
        case AxisLocation.Bottom:
        case AxisLocation.Top:
            return addContinuousNumericXAxis(
                chartId,
                svg,
                plotDimensions,
                location,
                d3.scaleLinear(),
                domain,
                axesLabelFont,
                margin,
                axisLabel,
                "",
                noop,
            )
    }
}

export function addCategoryAxis(
    chartId: number,
    axisId: string,
    svg: SvgSelection,
    location: AxisLocation,
    plotDimensions: Dimensions,
    categories: Array<string>,
    axesLabelFont: AxesLabelFont,
    margin: Margin,
    axisLabel: string,
): CategoryAxis {
    switch (location) {
        case AxisLocation.Left:
        case AxisLocation.Right:
            return addCategoryYAxis(chartId, axisId, svg, plotDimensions, categories, axesLabelFont, margin, axisLabel, location)

        case AxisLocation.Bottom:
        case AxisLocation.Top:
            //todo should be the x axis
            return addCategoryYAxis(chartId, axisId, svg, plotDimensions, categories, axesLabelFont, margin, axisLabel, location)
    }
}

function addCategoryYAxis(
    chartId: number,
    axisId: string,
    svg: SvgSelection,
    plotDimensions: Dimensions,
    categories: Array<string>,
    axesLabelFont: AxesLabelFont,
    margin: Margin,
    axisLabel: string,
    location: AxisLocation,
): CategoryAxis {
    const categorySize = (plotDimensions.height - margin.top) / categories.length;
    const scale = d3.scaleBand()
        .domain(categories)
        .range([0, categorySize * categories.length]);

    // create and add the axes
    const generator = d3.axisLeft(scale);

    const selection = svg
        .append<SVGGElement>('g')
        .attr('id', `y-axis-selection-${chartId}`)
        .attr('class', 'y-axis')
        .attr('transform', `translate(${margin.left}, ${margin.top})`)
        .call(generator);

    svg
        .append<SVGTextElement>('text')
        .attr('id', `stream-chart-y-axis-label-${chartId}`)
        .attr('text-anchor', 'middle')
        .attr('font-size', axesLabelFont.size)
        .attr('fill', axesLabelFont.color)
        .attr('font-family', axesLabelFont.family)
        .attr('font-weight', axesLabelFont.weight)
        .attr('transform', `translate(${axesLabelFont.size}, ${margin.top + (plotDimensions.height - margin.top - margin.bottom) / 2}) rotate(-90)`)
        .text(axisLabel)

    const axis = {axisId, selection, location, scale, generator, categorySize, update: () => categorySize}

    return {
        ...axis,
        update: (categoryNames, unfilteredSize, plotDimensions) => updateCategoryYAxis(chartId, svg, axis, plotDimensions, unfilteredSize, categoryNames, axesLabelFont, margin)
    }
}

function updateCategoryYAxis(
    chartId: number,
    svg: SvgSelection,
    axis: CategoryAxis,
    plotDimensions: Dimensions,
    unfilteredSize: number,
    names: Array<string>,
    axesLabelFont: AxesLabelFont,
    margin: Margin,
): number {
    const categorySize = (plotDimensions.height - margin.top) / unfilteredSize
    axis.scale
        .domain(names)
        .range([0, categorySize * names.length])
    axis.selection.call(axis.generator)

    svg
        .select(`#stream-chart-y-axis-label-${chartId}`)
        .attr('transform', `translate(${axesLabelFont.size}, ${margin.top + (plotDimensions.height - margin.top - margin.bottom) / 2}) rotate(-90)`)

    return categorySize
}

/**
 * The result of a zoom action
 */
export interface ZoomResult {
    range: ContinuousAxisRange
    zoomFactor: number
}

/**
 * Called when the user uses the scroll wheel (or scroll gesture) to zoom in or out. Zooms in/out
 * at the location of the mouse when the scroll wheel or gesture was applied.
 * @param transform The d3 zoom transformation information
 * @param x The x-position of the mouse when the scroll wheel or gesture is used
 * @param plotDimensions The current dimensions of the plot
 * @param axis The axis being zoomed
 * @param range The current range for the axis being zoomed
 * @return The updated range and the new zoom factor
 */
export function calculateZoomFor(
    transform: ZoomTransform,
    x: number,
    plotDimensions: Dimensions,
    axis: ContinuousNumericAxis,
    range: ContinuousAxisRange,
): ZoomResult {
    const time = axis.generator.scale<ScaleLinear<number, number>>().invert(x);
    return {
        range: range.scale(transform.k, time),
        zoomFactor: transform.k
    };
}

/**
 * Adjusts the range and updates the plot when the plot is dragged to the left or right
 * @param deltaX The amount that the plot is dragged
 * @param plotDimensions The dimensions of the plot
 * @param axis The axis being zoomed
 * @param range The current range for the axis being zoomed
 * @return The updated range
 */
export function calculatePanFor(
    deltaX: number,
    plotDimensions: Dimensions,
    axis: ContinuousNumericAxis,
    range: ContinuousAxisRange,
): ContinuousAxisRange {
    const scale = axis.generator.scale<ScaleLinear<number, number>>()
    const currentTime = range.start
    const x = scale(currentTime)
    if (x !== undefined) {
        const deltaTime = scale.invert(x + deltaX) - currentTime
        return range.translate(-deltaTime)
    }
    return range
}

/**
 * Accepts the series, the assignment of the series to axes, and the current x-axes state, and
 * returns a an array of the distinct axis IDs that cover all the series in the plot.
 *
 * @param series The array of series
 * @param axisAssignments A map association a series name with its axis assignments
 * @param xAxesState The current axis state
 * @return an array of the distinct axes that cover all the series in the plot
 */
export function axesForSeriesGen(
    series: Array<Series>,
    axisAssignments: Map<string, AxesAssignment>,
    xAxesState: AxesState
): Array<string> {
    return series.map(srs => srs.name)
        // grab the x-axis assigned to the series, or use a the default x-axis if not
        // assignment has been made
        .map(name => axisAssignments.get(name)?.xAxis || xAxesState.axisDefaultName())
        // de-dup the array of axis IDs so that we don't end up applying the pan or zoom
        // transformation more than once
        .reduce((accum: Array<string>, axisId: string) => {
            if (!accum.find(id => id === axisId)) {
                accum.push(axisId)
            }
            return accum
        }, [])
}

/**
 * Higher-order function that generates a handler for pan events, given the distinct series IDs that cover all
 * the axes in the chart, the margin, time-range update function, and the current state of the x-axes. This
 * function returns a handler function. And this handler function adjusts the time-range when the plot is dragged
 * to the left or right. After calling the handler function, the plot needs to be updated as well, and this is
 * left for the caller.
 *
 * Please note that the function generated by this function has side-effects -- it updates the time-ranges
 *
 * @param axesForSeries The distinct axes that cover all the series
 * @param margin The plot margin
 * @param setTimeRangeFor Function for setting the new time-range for a specific axis
 * @param xAxesState The current state of the x-axes
 * @return A handler function for pan events
 */
export function panHandler(
    axesForSeries: Array<string>,
    margin: Margin,
    setTimeRangeFor: (axisId: string, timeRange: [start: number, end: number]) => void,
    xAxesState: AxesState
): (
    x: number,
    plotDimensions: Dimensions,
    series: Array<string>,
    ranges: Map<string, ContinuousAxisRange>,
) => void {
    /**
     * Adjusts the time-range and updates the plot when the plot is dragged to the left or right
     * @param deltaX The amount that the plot is dragged
     * @param plotDimensions The dimensions of the plot
     * @param series An array of series names
     * @param ranges A map holding the axis ID and its associated time range
     */
    return (deltaX, plotDimensions, series, ranges) => {
        // run through the axis IDs, adjust their domain, and update the time-range set for that axis
        axesForSeries
            .forEach(axisId => {
                const xAxis = xAxesState.axisFor(axisId) as ContinuousNumericAxis
                const timeRange = ranges.get(axisId)
                if (timeRange) {
                    // calculate the change in the time-range based on the pixel change from the drag event
                    const range = calculatePanFor(deltaX, plotDimensions, xAxis, timeRange)
                    if (Math.abs(range.start - timeRange.start) < 2) return

                    // update the time-range for the axis
                    ranges.set(axisId, range)

                    const {start, end} = range
                    setTimeRangeFor(axisId, [start, end])

                    // update the axis' time-range
                    xAxis.update([start, end], plotDimensions, margin)
                }
            })
        // hey, don't forget to update the plot with the new time-ranges in the code calling this... :)
    }
}

/**
 * Higher-order function that generates a handler for zoom events, given the distinct series IDs that cover all
 * the axes in the chart, the margin, time-range update function, and the current state of the x-axes. This
 * function returns a handler function. And this handler function adjusts the time-range when the plot is zoomed.
 * After calling the handler function, the plot needs to be updated as well, and this is left for the caller.
 *
 * Please note that the function generated by this function has side-effects -- it updates the time-ranges
 *
 * @param axesForSeries The distinct axes that cover all the series
 * @param margin The plot margin
 * @param setTimeRangeFor Function for setting the new time-range for a specific axis
 * @param xAxesState The current state of the x-axes
 * @return A handler function for pan events
 */
export function zoomHandler(
    axesForSeries: Array<string>,
    margin: Margin,
    setTimeRangeFor: (axisId: string, timeRange: [start: number, end: number]) => void,
    xAxesState: AxesState
): (
    transform: ZoomTransform,
    x: number,
    plotDimensions: Dimensions,
    series: Array<string>,
    ranges: Map<string, ContinuousAxisRange>,
) => void {
    /**
     * Called when the user uses the scroll wheel (or scroll gesture) to zoom in or out. Zooms in/out
     * at the location of the mouse when the scroll wheel or gesture was applied.
     * @param transform The d3 zoom transformation information
     * @param x The x-position of the mouse when the scroll wheel or gesture is used
     * @param plotDimensions The dimensions of the plot
     * @param series An array of series names
     * @param ranges A map holding the axis ID and its associated time-range
     */
    return (transform, x, plotDimensions, series, ranges) => {
        // run through the axis IDs, adjust their domain, and update the time-range set for that axis
        axesForSeries
            .forEach(axisId => {
                const xAxis = xAxesState.axisFor(axisId) as ContinuousNumericAxis
                const timeRange = ranges.get(axisId)
                if (timeRange) {
                    const zoom = calculateZoomFor(transform, x, plotDimensions, xAxis, timeRange)

                    // update the axis range
                    ranges.set(axisId, zoom.range)

                    setTimeRangeFor(axisId, [zoom.range.start, zoom.range.end])

                    // update the axis' time-range
                    xAxis.update([zoom.range.start, zoom.range.end], plotDimensions, margin)
                }
            })
        // hey, don't forget to update the plot with the new time-ranges in the code calling this... :)
    }
}

/**
 * Calculates the time-ranges for each of the axes in the map
 * @param xAxes The map containing the axes and their associated IDs
 * @return a map associating the axis IDs to their time-range
 */
export function timeRanges(xAxes: Map<string, ContinuousNumericAxis>): Map<string, ContinuousAxisRange> {
    return new Map(Array.from(xAxes.entries())
        .map(([id, axis]) => {
            const [start, end] = axis.scale.domain()
            return [id, continuousAxisRangeFor(start, end)]
        }))
}

/**
 * Calculates the time-intervals (start, end) for each of the x-axis
 * @param xAxes The x-axes representing the time
 * @return A map associating each x-axis with a (start, end) interval
 */
export function timeIntervals(xAxes: Map<string, ContinuousNumericAxis>): Map<string, [start: number, end: number]> {
    return new Map(Array.from(xAxes.entries())
        .map(([id, axis]) => [id, axis.scale.domain()] as [string, [number, number]]))
}
