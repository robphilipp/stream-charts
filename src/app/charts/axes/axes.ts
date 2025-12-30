import {Dimensions, Margin} from "../styling/margins";
import {ContinuousAxisRange} from "./ContinuousAxisRange";
import * as d3 from "d3";
import {Axis, ScaleBand, ScaleContinuousNumeric, ScaleLinear, ZoomTransform} from "d3";
import {AxisElementSelection, SvgSelection} from "../d3types";
import {AxesState} from "./AxesState";
import {AxesAssignment} from "../plots/plot";
import {BaseSeries} from "../series/baseSeries";
import {noop} from "../utils";
import {OrdinalAxisRange} from "./OrdinalAxisRange";
import {BaseAxisRange} from "./BaseAxisRange";
import {AxisInterval} from "./AxisInterval";

/**
 * Holds the style for the axis tick labels
 */
export type AxisTickStyle = {
    font: AxesFont
    // the rotation of the tick labels in degrees
    rotation: number
    // whether to automatically rotate tick labels to fit within the axis space
    useAutoRotation: boolean
}

/**
 * Factory function to create a default AxisTickStyle with the default font,
 * no rotation, and no auto-rotation.
 */
export function defaultAxisTickStyle(): AxisTickStyle {
    return {
        font: defaultAxesFont(),
        rotation: 0,
        useAutoRotation: false
    }
}

/**
 * Holds the font information for the axis labels
 */
export interface AxesFont {
    size: number
    color: string
    family: string
    weight: number
}

/**
 * Factory function to create a default AxesFont with the default font size, color,
 * family, and weight.
 */
export function defaultAxesFont(): AxesFont {
    return {
        size: 12,
        color: '#d2933f',
        weight: 300,
        family: 'sans-serif'
    }
}

/**
 * Holds the style information for a series in a chart
 */
export interface SeriesStyle {
    color: string
    highlightColor: string
    margin?: number
}

/**
 * Holds the style information for a series line-style in a chart.
 */
export interface SeriesLineStyle extends SeriesStyle {
    lineWidth: number
    highlightWidth: number
}

/**
 * Factory function to create a default SeriesLineStyle with the default color, line width,
 * highlight color, and highlight width.
 */
export function defaultLineStyle(): SeriesLineStyle {
    return {
        color: '#008aad',
        lineWidth: 1,
        highlightColor: '#008aad',
        highlightWidth: 3,
    }
}

/**
 * The base interface that all Axes must implement. Each axis must have a unique ID,
 * a location (top, bottom, left, right), and d3 SVG selection for the axis.
 */
export interface BaseAxis {
    axisId: string
    location: AxisLocation
    selection: AxisElementSelection
}

/**
 * Represents a continuous numeric axis.
 */
export interface ContinuousNumericAxis extends BaseAxis {
    /**
     * A d3 scale for a continuous numeric axis.
     */
    scale: ScaleContinuousNumeric<number, number>
    /**
     * A d3 axis generator for a continuous numeric axis.
     */
    generator: Axis<number | { valueOf(): number }>
    /**
     * Updates the axis based on the specified domain and plot dimensions.
     * @param domain The interval representing the domain of the axis.
     * @param plotDimensions The dimensions of the plot (without the margins).
     * @param margin The margins for the plot
     */
    update: (domain: AxisInterval, plotDimensions: Dimensions, margin: Margin) => void
}

/**
 * Represents an ordinal string axis.
 */
export interface OrdinalStringAxis extends BaseAxis {
    /**
     * A d3 scale for an ordinal string axis.
     */
    scale: ScaleBand<string>
    /**
     * A d3 axis generator for an ordinal string axis.
     */
    generator: Axis<string>
    /**
     * The size of each category on the axis.
     */
    categorySize: number
    /**
     * Updates the axis based on the specified domain and plot dimensions.
     * @param range An interval representing the range of the axis.
     * @param originalRange An interval representing the original range of the axis (before zooming or panning).
     * @param plotDimensions The dimensions of the plot (without the margins).
     * @param margin The margins for the plot
     * @return The number of pixels for each category on the axis.
     */
    update: (range: AxisInterval, originalRange: AxisInterval, plotDimensions: Dimensions, margin: Margin) => number
}

/**
 * Enumerates the possible locations of an axis.
 */
export enum AxisLocation {
    // y-axes
    Left,
    Right,
    // x-axes
    Bottom,
    Top
}

/*
        axis clip path definition
 */

/**
 * Adds a clip area for the chart to the specified SVG element. The clip-area is given
 * an `id` of `clip-series-<chart_id>`, which because the chart ID should be unique, makes
 * this unique as well
 * @param chartId The ID of the chart to which the clip area is to be added
 * @param axisId The ID of the axis to which the clip area is to be added
 * @param svg The SVG element to which the clip area is to be added
 * @param location The location of the axis
 * @param plotDimensions The dimensions of the plot
 * @param margin The margins around the plot
 * @return The ID of the clip-path
 */
export function setClipPath(
    chartId: number,
    axisId: string,
    svg: SvgSelection,
    location: AxisLocation,
    plotDimensions: Dimensions,
    margin: Margin
): string {
    const clipPathId = `chart-clip-path-${chartId}-${axisId}`

    // calculate the width and height of the clip-area for the axis
    const width = location === AxisLocation.Left ? margin.right :
        location === AxisLocation.Right ? margin.left :
            plotDimensions.width

    const height = location === AxisLocation.Top ? margin.top + 1 :
        location === AxisLocation.Bottom ? margin.bottom - 1:
            plotDimensions.height

    // remove the old clipping region and add a new one with the updated plot dimensions
    svg.select(`#${clipPathId}-defs`).remove();
    svg
        .append('defs')
            .attr('id', `${clipPathId}-defs`)
        .append("clipPath")
            .attr("id", clipPathId)
        .append("rect")
            .attr("x", 0)
            .attr("y", location === AxisLocation.Bottom ? -1 : -margin.top)
            .attr("width", width)
            .attr("height", height)

    return clipPathId
}


/*
        category axes
 */

/**
 * Adds a category axis to the specified location. When the location is top or bottom,
 * the category axis represents the x-axis. When the location is left or right, then the
 * category axis represents the y-axis.
 * @param chartId The unique ID of the chart to which this axis belongs
 * @param axisId A unique ID for the axis
 * @param svg The SVG selection (d3)
 * @param location The location of the axis
 * @param categories An array holding the category names
 * @param axisLabel The axis label
 * @param axesLabelFont The font for the axis label
 * @param axisTickStyle Styling information for the ticks (e.g. font, rotation, etc)
 * @param plotDimensions The dimensions of the plot
 * @param margin The plot margin
 * @param setAxisRangeFor Lambda that sets the axis range for the specified axis
 * @param setOriginalAxisRangeFor Lambda that sets the original axis range for the specified axis
 * @return A category axis
 */
export function addOrdinalStringAxis(
    chartId: number,
    axisId: string,
    svg: SvgSelection,
    location: AxisLocation,
    categories: Array<string>,
    axisLabel: string,
    axesLabelFont: AxesFont,
    axisTickStyle: AxisTickStyle,
    plotDimensions: Dimensions,
    margin: Margin,
    setAxisRangeFor: (axisId: string, range: AxisInterval) => void,
    setOriginalAxisRangeFor: (axisId: string, range: AxisInterval) => void,
): OrdinalStringAxis {
    switch (location) {
        case AxisLocation.Top:
        case AxisLocation.Bottom:
            return addOrdinalStringXAxis(
                chartId, axisId,
                svg,
                location,
                categories,
                axisLabel, axesLabelFont, axisTickStyle,
                plotDimensions,
                margin,
                setAxisRangeFor,
                setOriginalAxisRangeFor
            )
        case AxisLocation.Left:
        case AxisLocation.Right:
            return addOrdinalStringYAxis(
                chartId, axisId,
                svg,
                location,
                categories,
                axisLabel, axesLabelFont, axisTickStyle,
                plotDimensions,
                margin,
                setAxisRangeFor,
                setOriginalAxisRangeFor
            )

    }
}

/**
 * Adds a category axis representing the x-axis.
 * @param chartId The unique ID of the chart to which this axis belongs
 * @param axisId A unique ID for the axis
 * @param svg The SVG selection (d3)
 * @param location The location of the axis
 * @param categories An array holding the category names
 * @param axisLabel The axis label
 * @param axesLabelFont The font for the axis label
 * @param axisTickStyle Styling information for the ticks (e.g. font, rotation, etc)
 * @param plotDimensions The dimensions of the plot
 * @param margin The plot margin
 * @param setAxisRangeFor Lambda that sets the axis range for the specified axis
 * @param setOriginalAxisRangeFor Lambda that sets the original axis range for the specified axis
 * @return A category axis
 */
function addOrdinalStringXAxis(
    chartId: number,
    axisId: string,
    svg: SvgSelection,
    location: AxisLocation.Bottom | AxisLocation.Top,
    categories: Array<string>,
    axisLabel: string,
    axesLabelFont: AxesFont,
    axisTickStyle: AxisTickStyle,
    plotDimensions: Dimensions,
    margin: Margin,
    setAxisRangeFor: (axisId: string, range: AxisInterval) => void,
    setOriginalAxisRangeFor: (axisId: string, range: AxisInterval) => void,
): OrdinalStringAxis {
    const scale = d3.scaleBand()
        .domain(categories)
        .range([0, plotDimensions.width])
    const categorySize = scale.bandwidth()

    // create and add the axes
    const generator = location === AxisLocation.Bottom ? d3.axisBottom(scale) : d3.axisTop(scale)

    const clipPathId = setClipPath(chartId, axisId, svg, location, plotDimensions, margin)
    const selection = svg
        .append<SVGGElement>('g')
            .attr('id', `x-axis-selection-${chartId}-${axisId}`)
            .attr("clip-path", `url(#${clipPathId})`)
        .classed('x-axis', true)
            .attr('transform', `translate(${margin.left}, ${yTranslation(location, plotDimensions, margin)})`)
        .call(generator)

    // rotate the tick-labels by the specified amount (in degrees)
    let maxTickLabelHeight = 0
    const {font, rotation} = axisTickStyle
    selection
        .selectAll("text")
        .style("text-anchor", "end")
        .each(function () {
            const degrees = location === AxisLocation.Bottom ? -rotation : rotation
            const radians = degrees * Math.PI / 180
            const {width, height, x, y} = (this as SVGTextElement).getBBox()
            const xOrigin = x + width
            const yOrigin = location === AxisLocation.Bottom ? y + height / 2 : y + height / 2

            d3.select(this)
                .attr("transform", () => `translate(${width * Math.cos(radians) / 2}, 0) rotate(${degrees}, ${xOrigin}, ${yOrigin})`)

            const newHeight = Math.abs(width * Math.sin(radians))
            if (newHeight > maxTickLabelHeight) {
                maxTickLabelHeight = newHeight
            }
        })

    svg
        .append<SVGTextElement>('text')
            .attr('id', labelIdFor(chartId, location))
            .style('text-anchor', 'middle')
            // when the axis is at the top, want the label to hang from the top (y=0) of the plot
            .attr('dominant-baseline', location === AxisLocation.Top ? "hanging" : "baseline")
            .attr('font-size', font.size)
            .attr('fill', font.color)
            .attr('font-family', font.family)
            .attr('font-weight', font.weight)
        .text(axisLabel)

    const axis = {axisId, selection, location, scale, generator, categorySize, update: () => categorySize}

    return {
        ...axis,
        update: (range: AxisInterval, originalRange: AxisInterval, plotDimensions: Dimensions, margin: Margin) => {
            const categorySize = updateOrdinalStringXAxis(chartId, axis, svg, location, categories, range, axesLabelFont, plotDimensions, margin)
            setAxisRangeFor(axisId, range)
            setOriginalAxisRangeFor(axisId, originalRange)
            return categorySize
        }
    }
}

/**
 * Adds a category axis representing the y-axis.
 * @param chartId The unique ID of the chart to which this axis belongs
 * @param axisId A unique ID for the axis
 * @param svg The SVG selection (d3)
 * @param location The location of the axis
 * @param categories An array holding the category names
 * @param axisLabel The axis label
 * @param axesLabelFont The font for the axis label
 * @param axisTickStyle Styling information for the ticks (e.g. font, rotation, etc)
 * @param plotDimensions The dimensions of the plot
 * @param margin The plot margin
 * @param setAxisRangeFor Lambda that sets the axis range for the specified axis
 * @param setOriginalAxisRangeFor Lambda that sets the original axis range for the specified axis
 * @return A category axis
 */
function addOrdinalStringYAxis(
    chartId: number,
    axisId: string,
    svg: SvgSelection,
    location: AxisLocation.Left | AxisLocation.Right,
    categories: Array<string>,
    axisLabel: string,
    axesLabelFont: AxesFont,
    axisTickStyle: AxisTickStyle,
    plotDimensions: Dimensions,
    margin: Margin,
    setAxisRangeFor: (axisId: string, range: AxisInterval) => void,
    setOriginalAxisRangeFor: (axisId: string, range: AxisInterval) => void,
): OrdinalStringAxis {
    const scale = d3.scaleBand()
        .domain(categories)
        .range([0, plotDimensions.height])
    const categorySize = scale.bandwidth()

    // create and add the axes
    const generator = location === AxisLocation.Left ? d3.axisLeft(scale) : d3.axisRight(scale)

    const selection = svg
        .append<SVGGElement>('g')
            .attr('id', `y-axis-selection-${chartId}`)
            .attr('class', 'y-axis')
            .attr('transform', `translate(${xTranslation(location, plotDimensions, margin)}, ${margin.top})`)
        .call(generator);

    // rotate the tick-labels by the specified amount (in degrees)
    const {font, rotation} = axisTickStyle
    selection
        .selectAll("text")
        .style("text-anchor", "end")
        .each(function () {
            const degrees = location === AxisLocation.Left ? -rotation : rotation
            const {width, height, x, y} = (this as SVGTextElement).getBBox()
            const xTranslation = location === AxisLocation.Left ? 0 : width
            const xOrigin = x + width
            const yOrigin = location === AxisLocation.Left ? y + height / 2 : y + height / 2

            d3.select(this)
                .attr("transform", () => `translate(${xTranslation}, 0) rotate(${degrees}, ${xOrigin}, ${yOrigin})`)
        })

    svg
        .append<SVGTextElement>('text')
            .attr('id', labelIdFor(chartId, location))
            .attr('text-anchor', 'middle')
            .attr('font-size', font.size)
            .attr('fill', font.color)
            .attr('font-family', font.family)
            .attr('font-weight', font.weight)
            .attr('transform', `translate(${ordinalLabelXTranslation(location, plotDimensions, margin, axesLabelFont)}, ${ordinalLabelYTranslation(location, plotDimensions, margin)}) rotate(-90)`)
        .text(axisLabel)

    const axis = {axisId, selection, location, scale, generator, categorySize, update: () => categorySize}

    return {
        ...axis,
        update: (range: AxisInterval, originalRange: AxisInterval, plotDimensions: Dimensions, margin: Margin) => {
            const categorySize = updateOrdinalStringYAxis(chartId, axis, svg, location, categories, range, axesLabelFont, plotDimensions, margin)
            setAxisRangeFor(axisId, range)
            setOriginalAxisRangeFor(axisId, originalRange)
            return categorySize
        }
    }
}

/**
 * Updates the category axis representing the x-axis, calculates and returns the
 * number of pixels for each category on the x-axis.
 * @param chartId The unique ID of the chart to which this axis belongs
 * @param axis The category axis to be updated
 * @param svg The SVG selection (d3)
 * @param location The location of the axis
 * @param names An array holding the category names
 * @param axesLabelFont The font for the axis label
 * @param plotDimensions The dimensions of the plot
 * @param margin The plot margin
 * @param range The range of the axis (e.g., start and end) in pixels
 * @param axesLabelFont The font for the axis label
 * @param plotDimensions The dimensions of the plot
 * @param margin The plot margin
 * adjust the axis label location when needed
 * @return The number of pixels for each category
 */
function updateOrdinalStringXAxis(
    chartId: number,
    axis: OrdinalStringAxis,
    svg: SvgSelection,
    location: AxisLocation.Bottom | AxisLocation.Top,
    names: Array<string>,   // domain (categories)
    range: AxisInterval,    // range (pixels)
    axesLabelFont: AxesFont,
    plotDimensions: Dimensions,
    margin: Margin
): number {
    const updatedRange = AxisInterval.from(
        Math.min(range.start, 0),
        Math.max(range.end, plotDimensions.width)
    )

    axis.scale = axis.scale
        .domain(names)
        .range(updatedRange.asTuple())

    axis.categorySize = axis.scale.bandwidth()

    const clipPathId = setClipPath(chartId, axis.axisId, svg, location, plotDimensions, margin)
    axis.selection = axis.selection
        .attr('transform', `translate(${margin.left}, ${yTranslation(location, plotDimensions, margin)})`)
        .attr("clip-path", `url(#${clipPathId})`)
        .call(axis.generator)

    const xLabelTranslation = ordinalLabelXTranslation(location, plotDimensions, margin, axesLabelFont)
    const yLabelTranslation = ordinalLabelYTranslation(location, plotDimensions, margin)
    svg
        .select(`#${labelIdFor(chartId, location)}`)
        .attr('transform', `translate(${xLabelTranslation}, ${yLabelTranslation})`)

    return axis.categorySize
}

/**
 * Updates the category axis representing the y-axis, calculates and returns the
 * number of pixels for each category on the y-axis.
 * @param chartId The unique ID of the chart to which this axis belongs
 * @param axis The category axis to be updated
 * @param svg The SVG selection (d3)
 * @param location The location of the axis
 * @param names An array holding the category names
 * @param range The range of the axis (e.g. start and end)
 * @param axesLabelFont The font for the axis label
 * @param plotDimensions The dimensions of the plot
 * @param margin The plot margin
 * @param axesLabelFont The font for the axis label
 * @param plotDimensions The dimensions of the plot
 * @param margin The plot margin
 * @return The number of pixels for each category
 */
function updateOrdinalStringYAxis(
    chartId: number,
    axis: OrdinalStringAxis,
    svg: SvgSelection,
    location: AxisLocation.Left | AxisLocation.Right,
    names: Array<string>, // domain
    range: AxisInterval,  // range
    axesLabelFont: AxesFont,
    plotDimensions: Dimensions,
    margin: Margin,
): number {
    const updatedRange = AxisInterval.from(
        Math.min(range.start, 0),
        Math.max(range.end, plotDimensions.height)
    )

    axis.scale = axis.scale
        .domain(names)
        .range(updatedRange.asTuple())
    axis.categorySize = axis.scale.bandwidth()
    axis.selection = axis.selection
        .attr('transform', `translate(${xTranslation(location, plotDimensions, margin)}, ${margin.top})`)
        .call(axis.generator)

    svg
        .select(`#${labelIdFor(chartId, location)}`)
        .attr('transform', `translate(${ordinalLabelXTranslation(location, plotDimensions, margin, axesLabelFont)}, ${ordinalLabelYTranslation(location, plotDimensions, margin)}) rotate(-90)`)

    return axis.categorySize
}

/**
 * Calculates the number of pixels by which to translate the label in the x-direction for the axis.
 * The calculation uses the dimensions and margins of the plot, the location of the
 * axis, and the font for the label.
 * @param location The axis location (i.e. top, bottom, left, right)
 * @param plotDimensions The dimensions of the plot
 * @param margin The margins for the plot
 * @param axesLabelFont The font for the axis label
 * @return The number of pixels to translate the label in the x-direction
 */
function ordinalLabelXTranslation(
    location: AxisLocation,
    plotDimensions: Dimensions,
    margin: Margin,
    axesLabelFont: AxesFont,
): number {
    switch (location) {
        case AxisLocation.Left:
        case AxisLocation.Right:
            return location === AxisLocation.Left ?
                axesLabelFont.size :
                margin.left + plotDimensions.width + margin.right - axesLabelFont.size
        case AxisLocation.Top:
        case AxisLocation.Bottom:
            return (plotDimensions.width + margin.left + margin.right) / 2
    }
}

/**
 * Calculates the number of pixels by which to translate the label in the y-direction the axis.
 * The calculation uses the dimensions and margins of the plot, the location of the
 * axis, and the font for the label.
 * @param location The axis location (i.e. top, bottom, left, right)
 * @param plotDimensions The dimensions of the plot
 * @param margin The margins for the plot
 * @return The number of pixels to translate the label for the y-direction
 */
function ordinalLabelYTranslation(
    location: AxisLocation,
    plotDimensions: Dimensions,
    margin: Margin
): number {
    switch (location) {
        case AxisLocation.Left:
        case AxisLocation.Right:
            return (margin.top + margin.bottom + plotDimensions.height) / 2
        case AxisLocation.Top:
            return 0
        case AxisLocation.Bottom:
            return margin.top + margin.bottom + plotDimensions.height
    }
}


/*
    continuous numeric axes
 */

/**
 * Adds a new x-axis to the SVG element at the specified location
 * @param chartId The ID of the chart
 * @param axisId The ID of the axis
 * @param svg The SVG selection to which to add the axis
 * @param plotDimensions The dimensions of the plot
 * @param location The location of the axis
 * @param scaleGenerator The higher-order function that returns the axis d3 "scale" function
 * @param domain The axis range (start, end)
 * @param axesLabelFont The font for the axis labels
 * @param margin The plot margins for the border of main SVG group
 * @param axisLabel The label for the axis
 * @param setAxisRangeFor A callback used to set the axis range
 * @return A {@link ContinuousNumericAxis} based on the arguments to this function
 */
export function addContinuousNumericXAxis(
    chartId: number,
    axisId: string,
    svg: SvgSelection,
    plotDimensions: Dimensions,
    location: AxisLocation.Bottom | AxisLocation.Top,
    scaleGenerator: ScaleContinuousNumeric<number, number>,
    domain: [minValue: number, maxValue: number],
    axesLabelFont: AxesFont,
    margin: Margin,
    axisLabel: string,
    setAxisRangeFor: (axisId: string, timeRange: AxisInterval) => void,
): ContinuousNumericAxis {
    const scale = scaleGenerator.domain(domain).range([0, plotDimensions.width])

    const selection = svg
        .append<SVGGElement>('g')
        .attr('transform', `translate(${margin.left}, ${yTranslation(location, plotDimensions, margin)})`)

    svg
        .append<SVGTextElement>('text')
            .attr('id', labelIdFor(chartId, location))
            .style('text-anchor', 'middle')
            // when the axis is at the top, want the label to hang from the top (y=0) of the plot
            .style('dominant-baseline', location === AxisLocation.Top ? "hanging" : "baseline")
            .style('font-size', axesLabelFont.size)
            .style('fill', axesLabelFont.color)
            .style('font-family', axesLabelFont.family)
            .style('font-weight', axesLabelFont.weight)
            .attr('transform', `translate(${margin.left + plotDimensions.width / 2}, ${continuousLabelYTranslation(location, plotDimensions, margin)})`)
        .text(axisLabel)

    const axis: ContinuousNumericAxis = {
        axisId,
        location,
        selection,
        scale,
        generator: location === AxisLocation.Bottom ? d3.axisBottom(scale) : d3.axisTop(scale),
        update: noop
    }
    return {
        ...axis,
        update: (domain: AxisInterval, plotDimensions: Dimensions, margin: Margin) => {
            updateLinearXAxis(domain, axisLabel, chartId, svg, axis, plotDimensions, margin, location)
            setAxisRangeFor(axisId, domain)
        }
    }
}

/**
 * Updates the x-axis with the new domain and axis label
 * @param domain The new (start, end) range of the axis
 * @param label The new label for the axis
 * @param chartId The ID of the chart
 * @param svg The SVG selection of which the axis is a child node
 * @param axis The x-axis
 * @param plotDimensions The dimensions of the plot
 * @param margin The plot margins for the border of main SVG group
 * @param location The location of the axis (i.e. top, bottom, left, right)
 */
function updateLinearXAxis(
    domain: AxisInterval,
    label: string,
    chartId: number,
    svg: SvgSelection,
    axis: ContinuousNumericAxis,
    plotDimensions: Dimensions,
    margin: Margin,
    location: AxisLocation.Bottom | AxisLocation.Top,
): void {
    axis.scale.domain(domain.asTuple()).range([0, plotDimensions.width])

    axis.selection
        .attr('transform', `translate(${margin.left}, ${yTranslation(location, plotDimensions, margin)})`)
        .call(axis.generator)
    svg
        .select(`#${labelIdFor(chartId, location)}`)
        .attr('transform', `translate(${margin.left + plotDimensions.width / 2}, ${continuousLabelYTranslation(location, plotDimensions, margin)})`)
        .text(label)
}

/**
 * The number of pixels to translate the x-axis label to the right
 * @param location The location of the x-axis
 * @param plotDimensions The dimensions of the plot
 * @param margin The plot margins for the border of main SVG group
 * @return The number of pixels to translate the x-axis label to the right
 */
function continuousLabelYTranslation(location: AxisLocation.Bottom | AxisLocation.Top, plotDimensions: Dimensions, margin: Margin): number {
    return location === AxisLocation.Bottom ? plotDimensions.height + margin.top + margin.bottom : 0
}

/**
 * Adds a new y-axis to the SVG element at the specified location
 * @param chartId The ID of the chart
 * @param axisId The ID of the axis
 * @param svg The SVG selection to which to add the axis
 * @param plotDimensions The dimensions of the plot
 * @param location The location of the axis
 * @param scaleGenerator The higher-order function that returns the axis d3 "scale" function
 * @param domain The axis range (start, end)
 * @param axesLabelFont The font for the axis labels
 * @param margin The plot margins for the border of main SVG group
 * @param axisLabel The label for the axis
 * @param setAxisRangeFor A callback used to set the axis range
 * @return A {@link ContinuousNumericAxis} based on the arguments to this function
 */
export function addContinuousNumericYAxis(
    chartId: number,
    axisId: string,
    svg: SvgSelection,
    plotDimensions: Dimensions,
    location: AxisLocation.Left | AxisLocation.Right,
    scaleGenerator: ScaleContinuousNumeric<number, number>,
    domain: [minValue: number, maxValue: number],
    axesLabelFont: AxesFont,
    margin: Margin,
    axisLabel: string,
    setAxisRangeFor: (axisId: string, range: AxisInterval) => void,
): ContinuousNumericAxis {
    const scale = scaleGenerator
        .domain(domain)
        .range([Math.max(margin.bottom, plotDimensions.height), 0])

    const selection = svg
        .append<SVGGElement>('g')
        .attr('class', 'y-axis')
        .attr('transform', `translate(${xTranslation(location, plotDimensions, margin)}, ${margin.top})`)

    svg
        .append<SVGTextElement>('text')
            .attr('id', labelIdFor(chartId, location))
            .attr('text-anchor', 'start')
            .attr('font-size', axesLabelFont.size)
            .attr('fill', axesLabelFont.color)
            .attr('font-family', axesLabelFont.family)
            .attr('font-weight', axesLabelFont.weight)
            .attr('transform', `translate(${continuousLabelXTranslation(location, plotDimensions, margin, axesLabelFont)}, ${margin.top + plotDimensions.height / 2}) rotate(-90)`)
        .text(axisLabel)

    const axis: ContinuousNumericAxis = {
        axisId,
        location,
        selection,
        scale,
        generator: location === AxisLocation.Left ? d3.axisLeft(scale) : d3.axisRight(scale),
        update: noop
    }
    return {
        ...axis,
        update: (domain: AxisInterval, plotDimensions: Dimensions, margin: Margin) => {
            updateLinearYAxis(domain, axisLabel, chartId, svg, axis, plotDimensions, margin, axesLabelFont, location)
            setAxisRangeFor(axisId, domain)
        }
    }
}

/**
 * Updates the y-axis with the new domain and axis label
 * @param domain The new (start, end) range of the axis
 * @param label The new label for the axis
 * @param chartId The ID of the chart
 * @param svg The SVG selection of which the axis is a child node
 * @param axis The y-axis
 * @param plotDimensions The dimensions of the plot
 * @param margin The plot margins for the border of main SVG group
 * @param axesLabelFont The font for the axis label
 * @param location The location of the axis (i.e. top, bottom, left, right)
 */
function updateLinearYAxis(
    domain: AxisInterval,
    label: string,
    chartId: number,
    svg: SvgSelection,
    axis: ContinuousNumericAxis,
    plotDimensions: Dimensions,
    margin: Margin,
    axesLabelFont: AxesFont,
    location: AxisLocation.Left | AxisLocation.Right,
): void {
    axis.scale.domain(domain.asTuple()).range([Math.max(margin.bottom, plotDimensions.height), 0])
    axis.selection
        .attr('transform', `translate(${xTranslation(location, plotDimensions, margin)}, ${margin.top})`)
        .call(axis.generator)

    svg
        .select(`#${labelIdFor(chartId, location)}`)
        .attr('transform', `translate(${continuousLabelXTranslation(location, plotDimensions, margin, axesLabelFont)}, ${margin.top + plotDimensions.height / 2}) rotate(-90)`)
        .text(label)
}

/**
 * The number of pixels to translate the y-axis label down
 * @param location The location of the y-axis
 * @param plotDimensions The dimensions of the plot
 * @param margin The plot margins for the border of main SVG group
 * @param axesLabelFont The font for the axis label
 * @return The number of pixels to translate the y-axis label down
 */
function continuousLabelXTranslation(location: AxisLocation.Left | AxisLocation.Right, plotDimensions: Dimensions, margin: Margin, axesLabelFont: AxesFont): number {
    return location === AxisLocation.Left ?
        axesLabelFont.size :
        margin.left + plotDimensions.width + margin.right - axesLabelFont.size
}

/*
    common axis functions
 */

/**
 * Calculates the number of pixels by which to translate the x-axis.
 * @param location The axis location (i.e. top, bottom, left, right)
 * @param plotDimensions The dimensions of the plot
 * @param margin The margins for the plot
 * @return The number of pixels to translate the x-axis
 */
function xTranslation(location: AxisLocation.Left | AxisLocation.Right, plotDimensions: Dimensions, margin: Margin): number {
    return location === AxisLocation.Left ? margin.left : margin.left + plotDimensions.width
}

/**
 * The number of pixels to translate the x-axis to the right
 * @param location The location of the x-axis
 * @param plotDimensions The dimensions of the plot
 * @param margin The plot margins for the border of main SVG group
 * @return The number of pixels to translate the y-axis to the down
 */
function yTranslation(location: AxisLocation.Bottom | AxisLocation.Top, plotDimensions: Dimensions, margin: Margin): number {
    return location === AxisLocation.Bottom ?
        plotDimensions.height + margin.top :
        margin.top
}

/**
 * Calculates a unique ID for the axis based on the location and chart ID
 * @param chartId The unique ID of the chart
 * @param location The axis location (i.e. top, bottom, left, right)
 * @return A unique ID for the axis
 */
export function labelIdFor(chartId: number, location: AxisLocation): string {
    switch (location) {
        case AxisLocation.Left:
        case AxisLocation.Right:
            return `stream-chart-y-axis-${location}-label-${chartId}`
        case AxisLocation.Top:
        case AxisLocation.Bottom:
            return `stream-chart-x-axis-${location}-label-${chartId}`
    }
}


/*
    zooming
 */

/**
 * The result of a zoom action
 */
export interface ZoomResult<AR extends BaseAxisRange> {
    range: AR
    // range: ContinuousAxisRange
    zoomFactor: number
}

// /**
//  * todo this can be generalized to any continuous numeric axis, replace x with value
//  * Called when the user uses the scroll wheel (or scroll gesture) to zoom in or out. Zooms in/out
//  * at the location of the mouse when the scroll wheel or gesture was applied.
//  * @param transform The d3 zoom transformation information
//  * @param x The x-position of the mouse when the scroll wheel or gesture is used
//  * @param axis The axis being zoomed
//  * @param range The current range for the axis being zoomed
//  * @return The updated range and the new zoom factor
//  */
// // export function calculateZoomFor<AR extends BaseAxisRange>(
// export function calculateZoomFor(
//     transform: ZoomTransform,
//     x: number,
//     axis: ContinuousNumericAxis,
//     range: ContinuousAxisRange,
// ): ZoomResult<ContinuousAxisRange> {
//     const time = axis.generator.scale<ScaleLinear<number, number>>().invert(x);
//     return {
//         range: range.scale(transform.k, time),
//         zoomFactor: transform.k
//     } as ZoomResult<ContinuousAxisRange>
// }

/**
 * Called when the user uses the scroll wheel (or scroll gesture) to zoom in or out. Zooms in/out
 * at the location of the mouse when the scroll wheel or gesture was applied, while ensure that
 * the range (start, end) is contained within the constraint (min, max).
 * @param transform The d3 zoom transformation information
 * @param x The x-position of the mouse when the scroll wheel or gesture is used
 * @param axis The axis being zoomed
 * @param range The current range for the axis being zoomed
 * @param constraint The minimum and maximum value the scaled range can have
 * @return The updated range and the new zoom factor
 */
export function calculateConstrainedZoomFor(
    transform: ZoomTransform,
    x: number,
    axis: ContinuousNumericAxis,
    range: ContinuousAxisRange,
    constraint: [min: number, max: number],
): ZoomResult<ContinuousAxisRange> {
    const domainValue = axis.generator.scale<ScaleLinear<number, number>>().invert(x);
    return {
        range: range.constrainedScale(transform.k, domainValue, constraint),
        zoomFactor: transform.k
    } as ZoomResult<ContinuousAxisRange>
}

/**
 * Calculates the zoom for an ordinal axis.
 * @param transform The d3 zoom transformation information
 * @param x The x-position of the mouse when the scroll wheel or gesture is used
 * @param range The current range for the axis being zoomed
 * @param constraint The minimum and maximum value the scaled range can have
 * @return A ZoomResult holding the updated range and the new zoom factor
 */
export function calculateOrdinalConstrainedZoomFor(
    transform: ZoomTransform,
    x: number,
    range: OrdinalAxisRange,
    constraint: [min: number, max: number],
): ZoomResult<OrdinalAxisRange> {
    const updatedRange = range.constrainedScale(transform.k, x, constraint) as OrdinalAxisRange
    const k = range.original.equals(updatedRange.original)  ? 1 : transform.k
    return {
        range: updatedRange,
        zoomFactor: k
    } as ZoomResult<OrdinalAxisRange>
}

/*
    panning
 */

/**
 * Adjusts the range and updates the plot when the plot is dragged to the left or right
 * @param delta The amount that the plot is dragged
 * @param axis The axis being zoomed
 * @param range The current range for the axis being zoomed
 * @param [constrainToOriginalRange=false] When set to `true` then the pan requires that the axis
 * range remains a subset of the origin axis range; when `false` the pan allows and range
 * @return The updated range
 */
export function calculatePanFor(
    delta: number,
    axis: ContinuousNumericAxis,
    range: ContinuousAxisRange,
    constrainToOriginalRange: boolean = false
): ContinuousAxisRange {
    const scale = axis.generator.scale<ScaleLinear<number, number>>()
    const value = scale(range.current.start)
    if (value !== undefined) {
        const deltaValue = scale.invert(value + delta) - range.current.start
        const constraint: [start: number, end: number] = constrainToOriginalRange ?
            range.original.asTuple() :
            [-Infinity, Infinity]
        return range.translate(-deltaValue, constraint)
    }
    return range
}

export function calculateOrdinalPanFor(
    delta: number,
    range: OrdinalAxisRange,
    plotDimensions: Dimensions,
    constrainToOriginalRange: boolean = false
): OrdinalAxisRange {
    const constraint: [start: number, end: number] = constrainToOriginalRange ?
        range.original.asTuple() :
        [-Infinity, Infinity]
    // only allow panning if the plot dimensions (i.e. [0, width]) is in the current axis range
    // todo deal with the fact that this could be a pan of the y-axis
    if (range.current.start + delta > 0 || range.current.end + delta < plotDimensions.width) {
        return range
    }
    return range.translate(delta, constraint) as OrdinalAxisRange
}

/*

 */

/**
 * Accepts the series, the assignment of the series to axes, and the current x-axes state, and
 * returns an array of the distinct axis IDs that cover all the series in the plot.
 *
 * @param series The array of series
 * @param axisAssignments A map association a series name with its axis assignments
 * @param axesState The current axis state
 * @return an array of the distinct axes that cover all the series in the plot
 */
export function axesForSeriesGen<D, A extends BaseAxis>(
    series: Array<BaseSeries<D>>,
    axisAssignments: Map<string, AxesAssignment>,
    axesState: AxesState<A>
): Array<string> {
    return series.map(srs => srs.name)
        // grab the x-axis assigned to the series, or use the default x-axis if not
        // assignment has been made
        .map(name => axisAssignments.get(name)?.xAxis || axesState.axisDefaultId().getOrElse(""))
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
 * Pans the axis range by the specified amount.
 * @param delta The pan amount in the axis specified for the series
 * @param axesForSeries The names of the axes of a dimension (x or y)
 * @param axesState The state for the axes of a dimension
 * @param ranges The current ranges for the axes of a dimension
 * @param setAxisRange Function for setting the new time-range for a specific axis
 * @param plotDimensions The current plot dimensions (width, height)
 * @param margin The plot margin
 * @param [constrainToOriginalRange=true] Optional argument, that when set to `true`, constrains the
 * axis range to remain in the origin axis range; when `false` the axis range is unconstrained
 */
function panAxes(
    delta: number,
    axesForSeries: Array<string>,
    axesState: AxesState<ContinuousNumericAxis>,
    ranges: Map<string, ContinuousAxisRange>,
    setAxisRange: (axisId: string, axisRange: AxisInterval) => void,
    plotDimensions: Dimensions,
    margin: Margin,
    constrainToOriginalRange: boolean = true
): void {
    axesForSeries.forEach(axisId => {
        axesState.axisFor(axisId).ifPresent((axis) => {
            const currentRange = ranges.get(axisId)
            if (currentRange) {
                // calculate the change in the axis-range based on the pixel change from the drag event
                const range = calculatePanFor(delta, axis, currentRange, constrainToOriginalRange)

                // update the time-range for the axis
                ranges.set(axisId, range)

                setAxisRange(axisId, range.current)

                // update the axis' time-range
                axis.update(range.current.copy(), plotDimensions, margin)
            }
        })
    })
}

/**
 * Pans the axis range by the specified amount.
 * @param delta The pan amount in the axis specified for the series
 * @param axesForSeries The names of the axes of a dimension (x or y)
 * @param axesState The state for the axes of a dimension
 * @param ranges The current ranges for the axes of a dimension
 * @param setAxisRange Function for setting the new time-range for a specific axis
 * @param plotDimensions The current plot dimensions (width, height)
 * @param margin The plot margin
 * @param [constrainToOriginalRange=false] Optional argument, that when set to `true`, constrains the
 * axis range to remain in the origin axis range; when `false` the axis range is unconstrained
 */
function ordinalPanAxes(
    delta: number,
    axesForSeries: Array<string>,
    axesState: AxesState<OrdinalStringAxis>,
    ranges: Map<string, OrdinalAxisRange>,
    setAxisRange: (axisId: string, axisRange: AxisInterval) => void,
    plotDimensions: Dimensions,
    margin: Margin,
    constrainToOriginalRange: boolean = false
): void {
    axesForSeries.forEach(axisId => {
        axesState.axisFor(axisId).ifPresent(axis => {
            const currentRange = ranges.get(axisId)
            if (currentRange && axis) {
                // calculate the change in the axis-range based on the pixel change from the drag event
                const range = calculateOrdinalPanFor(delta, currentRange, plotDimensions, constrainToOriginalRange)

                // update the time-range for the axis
                ranges.set(axisId, range)

                setAxisRange(axisId, range.current)

                // update the axis' time-range
                axis.update(range.current, range.original, plotDimensions, margin)
            }
        })
    })
}

/**
 * Higher-order function that generates a handler for pan events, given the distinct series IDs that cover all
 * the axes in the chart, the margin, axis-range update function, and the current state of the x-axes. This
 * function returns a handler function. And this handler function adjusts the time-range when the plot is dragged
 * to the left or right. After calling the handler function, the plot needs to be updated as well, and this is
 * left for the caller.
 *
 * Please note that the function generated by this function has side effects -- it updates the axes ranges.
 *
 * @param axesForSeries The distinct axes that cover all the series
 * @param margin The plot margin
 * @param setAxisRangeFor Function for setting the new axis-range for a specific axis
 * @param axesState The current state of the x-axes or y-axes
 * @param [constrainToOriginalRange=false] Optional argument, that when set to `true`, constrains the
 * axis range to remain in the origin axis range; when `false` the axis range is unconstrained
 * @return A handler function for pan events
 */
export function panHandler(
    axesForSeries: Array<string>,
    margin: Margin,
    setAxisRangeFor: (axisId: string, axisRange: AxisInterval) => void,
    axesState: AxesState<ContinuousNumericAxis>,
    constrainToOriginalRange: boolean = false
): (
    x: number,
    plotDimensions: Dimensions,
    // series: Array<string>,
    ranges: Map<string, ContinuousAxisRange>,
) => void {
    /**
     * Adjusts the time-range and updates the plot when the plot is dragged to the left or right
     * @param deltaX The amount that the plot is dragged
     * @param plotDimensions The dimensions of the plot
     * @param series An array of series names
     * @param ranges A map holding the axis ID and its associated time range
     */
    return (delta: number, plotDimensions: Dimensions, ranges: Map<string, ContinuousAxisRange>) => {
    // return (delta: number, plotDimensions: Dimensions, series: Array<string>, ranges: Map<string, ContinuousAxisRange>) => {
        // run through the axis IDs, adjust their domain, and update the time-range set for that axis
        panAxes(delta, axesForSeries, axesState, ranges, setAxisRangeFor, plotDimensions, margin, constrainToOriginalRange)
        // hey, don't forget to update the plot with the new time-ranges in the code calling this... :)
    }
}

/**
 * Higher-order function that generates a handler for pan events, given the distinct series IDs that cover all
 * the axes in the chart, the margin, axis-range update function, and the current state of the x-axes. This
 * function returns a handler function. And this handler function adjusts the time-range when the plot is dragged
 * to the left or right. After calling the handler function, the plot needs to be updated as well, and this is
 * left for the caller.
 *
 * Please note that the function generated by this function has side effects -- it updates the axes ranges.
 *
 * @param axesForSeries The distinct axes that cover all the series
 * @param margin The plot margin
 * @param setAxisRangeFor Function for setting the new axis-range for a specific axis
 * @param axesState The current state of the x-axes or y-axes
 * @param [constrainToOriginalRange=false] Optional argument, that when set to `true`, constrains the
 * axis range to remain in the origin axis range; when `false` the axis range is unconstrained
 * @return A handler function for pan events
 */
export function ordinalPanHandler(
    axesForSeries: Array<string>,
    margin: Margin,
    setAxisRangeFor: (axisId: string, axisRange: AxisInterval) => void,
    axesState: AxesState<OrdinalStringAxis>,
    constrainToOriginalRange: boolean = false
): (
    x: number,
    plotDimensions: Dimensions,
    series: Array<string>,
    ranges: Map<string, OrdinalAxisRange>,
) => void {
    /**
     * Adjusts the time-range and updates the plot when the plot is dragged to the left or right
     * @param deltaX The amount that the plot is dragged
     * @param plotDimensions The dimensions of the plot
     * @param series An array of series names
     * @param ranges A map holding the axis ID and its associated time range
     */
    return (delta: number, plotDimensions: Dimensions, series: Array<string>, ranges: Map<string, OrdinalAxisRange>) => {
        // run through the axis IDs, adjust their domain, and update the time-range set for that axis
        ordinalPanAxes(delta, axesForSeries, axesState, ranges, setAxisRangeFor, plotDimensions, margin, constrainToOriginalRange)
        // hey, don't forget to update the plot with the new ranges in the code calling this... :)
    }
}

/**
 * Higher-order function that generates a handler for pan events, given the distinct series IDs that cover all
 * the axes in the chart, the margin, time-range update function, and the current state of the x-axes. This
 * function returns a handler function. And this handler function adjusts the time-range when the plot is dragged
 * to the left or right. After calling the handler function, the plot needs to be updated as well, and this is
 * left for the caller.
 *
 * Please note that the function generated by this function has side effects -- it updates the axes ranges.
 *
 * @param xAxesForSeries The distinct x-axes that cover all the series
 * @param yAxesForSeries The distinct y-axes that cover all the series
 * @param margin The plot margin
 * @param setAxisRange Function for setting the new time-range for a specific axis
 * @param xAxesState The current state of the x-axes
 * @param yAxesState The current state of the y-axes
 * @param [constrainToOriginalRange=true] Optional argument, that when set to `true`, constrains the
 * axis range to remain in the origin axis range; when `false` the axis range is unconstrained
 * @return A handler function for pan events
 */
export function panHandler2D(
    xAxesForSeries: Array<string>,
    yAxesForSeries: Array<string>,
    margin: Margin,
    setAxisRange: (axisId: string, axisRange: AxisInterval) => void,
    xAxesState: AxesState<ContinuousNumericAxis>,
    yAxesState: AxesState<ContinuousNumericAxis>,
    constrainToOriginalRange: boolean = true
): (
    x: number,
    y: number,
    plotDimensions: Dimensions,
    series: Array<string>,
    xRanges: Map<string, ContinuousAxisRange>,
    yRanges: Map<string, ContinuousAxisRange>,
) => void {
    /**
     * Adjusts the time-range and updates the plot when the plot is dragged to the left or right
     * @param deltaX The amount that the plot is dragged
     * @param plotDimensions The dimensions of the plot
     * @param series An array of series names
     * @param ranges A map holding the axis ID and its associated time range
     */
    return (deltaX, deltaY, plotDimensions, series, xRanges, yRanges) => {
        // run through the x- and y-axes and update them by delta, within the original bounds
        panAxes(deltaX, xAxesForSeries, xAxesState, xRanges, setAxisRange, plotDimensions, margin, constrainToOriginalRange)
        panAxes(deltaY, yAxesForSeries, yAxesState, yRanges, setAxisRange, plotDimensions, margin, constrainToOriginalRange)
        // hey, don't forget to update the plot with the new time-ranges in the code calling this... :)
    }
}

/**
 * Calculates the zoom for the specified axis and updates the axis and the axis ranges
 * @param value The x- or y-coordinate of the mouse
 * @param axisId
 * @param margin The plot margin
 * @param setRangeFor Function for setting the new time-range for a specific axis * @param scaleExtent The smallest and largest scale factors allowed
 * @param axesState
 * @param ranges A map associating axis IDs with axis ranges
 * @param scaleExtent The smallest and largest scale factors allowed
 * @param transform The d3 zoom transformation information
 * @param plotDimensions The dimensions of the plot
 */
function calcZoomAndUpdate(
    value: number,
    axisId: string,
    margin: Margin,
    setRangeFor: (axisId: string, range: AxisInterval) => void,
    axesState: AxesState<ContinuousNumericAxis>,
    ranges: Map<string, ContinuousAxisRange>,
    scaleExtent: [min: number, max: number],
    transform: ZoomTransform,
    plotDimensions: Dimensions,
): void {
    const [, zoomMax] = scaleExtent

    axesState.axisFor(axisId).ifPresent(axis => {
        const range = ranges.get(axisId)
        if (range && axis) {

            // calculate the constraint for the zoom
            const constraint: [number, number] = isFinite(zoomMax) ?
                [range.original.start * zoomMax, range.original.end * zoomMax] :
                [0, Infinity]

            const zoom = calculateConstrainedZoomFor(transform, value, axis, range, constraint)

            // update the axis range
            ranges.set(axisId, zoom.range)

            setRangeFor(axisId, zoom.range.current)

            // update the axis' range
            axis.update(zoom.range.current, plotDimensions, margin)
        }
    })
}

function calcOrdinalZoomAndUpdate(
    value: number,
    axisId: string,
    margin: Margin,
    setRangeFor: (axisId: string, range: AxisInterval) => void,
    setOriginalRangeFor: (axisId: string, range: AxisInterval) => void,
    axesState: AxesState<OrdinalStringAxis>,
    ranges: Map<string, OrdinalAxisRange>,
    scaleExtent: [min: number, max: number],
    transform: ZoomTransform,
    plotDimensions: Dimensions,
): void {
    const [, zoomMax] = scaleExtent

    axesState.axisFor(axisId).ifPresent(axis => {
        const range = ranges.get(axisId)
        if (range && axis) {
            // calculate the constraint for the zoom
            // const [originalStart, originalEnd] = range.original
            const constraint: [number, number] = isFinite(zoomMax) ?
                [range.original.start * zoomMax, range.original.end * zoomMax] :
                [range.original.start, range.original.end]

            const zoom = calculateOrdinalConstrainedZoomFor(transform, value, range, constraint)

            // update the axis range
            ranges.set(axisId, zoom.range)

            setRangeFor(axisId, zoom.range.current)
            const origRange = AxisInterval.from(0, plotDimensions.width)
            setOriginalRangeFor(axisId, origRange)

            // update the axis' range
            axis.update(zoom.range.current, origRange, plotDimensions, margin)
        }
    })
}

/**
 * Higher-order function that generates a handler for zoom events, given the distinct series IDs that cover all
 * the axes in the chart, the margin, range update function, and the current state of the x- or y-axes. This
 * function returns a handler function. And this handler function adjusts the range when the plot is zoomed.
 * After calling the handler function, the plot needs to be updated as well, and this is left for the caller.
 *
 * Please note that the function generated by this function has side effects -- it updates the axes ranges.
 *
 * @param axesForSeries The distinct axes that cover all the series
 * @param margin The plot margin
 * @param setRangeFor Function for setting the new time-range for a specific axis
 * @param axesState The current state of the x- or y-axes
 * @param scaleExtent The minimum and maximum allowed scale factors
 * @return A handler function for pan events
 */
export function continuousAxisZoomHandler(
    axesForSeries: Array<string>,
    margin: Margin,
    setRangeFor: (axisId: string, range: AxisInterval) => void,
    axesState: AxesState<ContinuousNumericAxis>,
    scaleExtent: [min: number, max: number] = [0, Infinity],
): (
    transform: ZoomTransform,
    x: number,
    plotDimensions: Dimensions,
    ranges: Map<string, ContinuousAxisRange>,
) => void {

    /**
     * Called when the user uses the scroll wheel (or scroll gesture) to zoom in or out. Zooms in/out
     * at the location of the mouse when the scroll wheel or gesture was applied.
     * @param transform The d3 zoom transformation information
     * @param x The x-position of the mouse when the scroll wheel or gesture is used
     * @param plotDimensions The dimensions of the plot
     * @param ranges A map holding the axis ID and its associated time-range
     */
    return (transform, x, plotDimensions, ranges) => {
        // run through the axis IDs, adjust their domain, and update the time-range set for that axis
        axesForSeries.forEach(axisId =>
            calcZoomAndUpdate(x, axisId, margin, setRangeFor, axesState, ranges, scaleExtent, transform, plotDimensions)
        )
        // hey, don't forget to update the plot with the new time-ranges in the code calling this... :)
    }
}

/**
 * Higher-order function that generates a handler for zoom events, given the distinct series IDs that cover all
 * the axes in the chart, the margin, range update function, and the current state of the x- or y-axes. This
 * function returns a handler function. And this handler function adjusts the range when the plot is zoomed.
 * After calling the handler function, the plot needs to be updated as well, and this is left for the caller.
 *
 * Please note that the function generated by this function has side effects -- it updates the axes ranges.
 *
 * @param axesForSeries The distinct axes that cover all the series
 * @param margin The plot margin
 * @param setRangeFor Function for setting the new time-range for a specific axis
 * @param setOriginalRangeFor Function for setting the new original range for a specific axis
 * @param axesState The current state of the x- or y-axes
 * @param scaleExtent The minimum and maximum allowed scale factors
 * @return A handler function for pan events
 */
export function ordinalAxisZoomHandler(
    axesForSeries: Array<string>,
    margin: Margin,
    setRangeFor: (axisId: string, range: AxisInterval) => void,
    setOriginalRangeFor: (axisId: string, range: AxisInterval) => void,
    axesState: AxesState<OrdinalStringAxis>,
    scaleExtent: [min: number, max: number] = [0, Infinity],
): (
    transform: ZoomTransform,
    x: number,
    plotDimensions: Dimensions,
    ranges: Map<string, OrdinalAxisRange>,
) => void {

    /**
     * Called when the user uses the scroll wheel (or scroll gesture) to zoom in or out. Zooms in/out
     * at the location of the mouse when the scroll wheel or gesture was applied.
     * @param transform The d3 zoom transformation information
     * @param x The x-position of the mouse when the scroll wheel or gesture is used
     * @param plotDimensions The dimensions of the plot
     * @param ranges A map holding the axis ID and its associated time-range
     */
    return (transform, x, plotDimensions, ranges) => {
        // run through the axis IDs, adjust their domain, and update the time-range set for that axis
        axesForSeries.forEach(axisId =>
            calcOrdinalZoomAndUpdate(x, axisId, margin, setRangeFor, setOriginalRangeFor, axesState, ranges, scaleExtent, transform, plotDimensions)
        )
        // hey, don't forget to update the plot with the new time-ranges in the code calling this... :)
    }
}

/**
 * Higher-order function that generates a handler for zoom events, given the distinct series IDs that cover all
 * the axes in the chart, the margin, range update function, and the current state of the x- or y-axes. This
 * function returns a handler function. And this handler function adjusts the time-range when the plot is zoomed.
 * After calling the handler function, the plot needs to be updated as well, and this is left for the caller.
 *
 * Please note that the function generated by this function has side effects -- it updates the axes ranges.
 *
 * @param xAxesForSeries The distinct x-axes that cover all the series
 * @param yAxesForSeries The distinct y-axes that cover all the series
 * @param margin The plot margin
 * @param setRangeFor Function for setting the new time-range for a specific axis
 * @param xAxesState The current state of the x-axes
 * @param yAxesState The current state of the y-axes
 * @param scaleExtent The smallest and largest scale factors allowed
 * @return A handler function for pan events
 */
export function axesZoomHandler(
    xAxesForSeries: Array<string>,
    yAxesForSeries: Array<string>,
    margin: Margin,
    setRangeFor: (axisId: string, range: AxisInterval) => void,
    xAxesState: AxesState<ContinuousNumericAxis>,
    yAxesState: AxesState<ContinuousNumericAxis>,
    scaleExtent: [min: number, max: number],
): (
    transform: ZoomTransform,
    mousePosition: [x: number, y: number],
    plotDimensions: Dimensions,
    xRanges: Map<string, ContinuousAxisRange>,
    yRanges: Map<string, ContinuousAxisRange>,
) => void {

    /**
     * Called when the user uses the scroll wheel (or scroll gesture) to zoom in or out. Zooms in/out
     * at the location of the mouse when the scroll wheel or gesture was applied.
     * @param transform The d3 zoom transformation information
     * @param mousePosistion The position of the mouse when the scroll wheel or gesture is used
     * @param plotDimensions The dimensions of the plot
     * @param ranges A map holding the axis ID and its associated time-range
     */
    return (transform, mousePosition, plotDimensions, xRanges, yRanges) => {
        // run through the axis IDs, adjust their domain, and update the time-range set for that axis
        const [x, y] = mousePosition
        xAxesForSeries.forEach(id =>
            calcZoomAndUpdate(x, id, margin, setRangeFor, xAxesState, xRanges, scaleExtent, transform, plotDimensions)
        )
        yAxesForSeries.forEach(id =>
            calcZoomAndUpdate(y, id, margin, setRangeFor, yAxesState, yRanges, scaleExtent, transform, plotDimensions)
        )
        // hey, don't forget to update the plot with the new time-ranges in the code calling this... :)
    }
}

/**
 * Calculates the axis-ranges for each of the continuous numeric axes in the map
 * @param axes The map containing the axes and their associated IDs
 * @return a map associating the axis IDs to their continuous axis-range
 */
export function continuousAxisRanges(axes: Map<string, ContinuousNumericAxis>): Map<string, ContinuousAxisRange> {
    return continuousRange(axes)
}

/**
 * Calculates the axis-ranges for each of the ordinal axes in the map
 * @param axes The map containing the axes and their associated IDs
 * @param originalRange The original range of the axis
 * @return a map associating the axis IDs to their ordinal axis-range
 */
export function ordinalAxisRanges(axes: Map<string, OrdinalStringAxis>, originalRange: AxisInterval): Map<string, OrdinalAxisRange> {
    return ordinalRange(axes, originalRange)
}

/**
 * Calculates the axis interval (start, end) for each of the axis
 * @param axes The axes representing the time
 * @return A map associating each axis with a (start, end) interval
 */
export function continuousAxisIntervals(axes: Map<string, ContinuousNumericAxis>): Map<string, AxisInterval> {
    return new Map(Array.from(axes.entries())
        .map(([id, axis]) => {
            const [start, end] = axis.scale.domain()
            return [id, AxisInterval.from(start, end)] as [string, AxisInterval]
        }))
}

/**
 * Calculates the axis interval (start, end) for each of the axis
 * @param axes The axes representing the time
 * @return A map associating each axis with a (start, end) interval
 */
export function ordinalAxisIntervals(axes: Map<string, OrdinalStringAxis>): Map<string, {interval: AxisInterval, categories: Array<string>}> {
    return new Map(Array.from(axes.entries())
        .map(([id, axis]) => {
            const [start, end] = axis.scale.range()
            return [id, {interval: AxisInterval.from(start, end), categories: axis.scale.domain()}]
        }))
}

/**
 * Returns the bounds on the specified continuous numeric axes
 * @param axes A map associating an axis ID with a {@link ContinuousNumericAxis}
 * @return A map associating each specified axis ID with the interval covered (bounds) by the axis
 */
export function continuousRange(axes: Map<string, ContinuousNumericAxis>): Map<string, ContinuousAxisRange> {
    return new Map(Array.from(axes.entries())
        .map(([id, axis]) => {
            const [start, end] = axis.scale.domain()
            return [id, ContinuousAxisRange.from(start, end)]
        }))
}

/**
 * Returns the bounds on the specified continuous numeric axes
 * @param axes A map associating an axis ID with a {@link OrdinalStringAxis}
 * @param originalRange The original range of the axis
 * @return A map associating each specified axis ID with the interval covered (bounds) by the axis
 */
export function ordinalRange(axes: Map<string, OrdinalStringAxis>, originalRange: AxisInterval): Map<string, OrdinalAxisRange> {
    return new Map(Array.from(axes.entries())
        .map(([id, _]) =>
            [id, OrdinalAxisRange.from(originalRange.start, originalRange.end)]
        )
    )
}
