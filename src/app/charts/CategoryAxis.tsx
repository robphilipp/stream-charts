import * as axes from "./axes"
import {AxesLabelFont, AxisLocation, defaultAxesLabelFont} from "./axes"
import * as d3 from "d3";
import {ScaleBand} from "d3";
import {useChart} from "./hooks/useChart";
import {useEffect, useRef} from "react";
import {Dimensions, Margin} from "./margins";
import {SvgSelection} from "./d3types";

interface Props {
    // the unique ID of the axis
    axisId: string
    // the location of the axis. for y-axes, this mut be either left or right
    location: AxisLocation.Left | AxisLocation.Right
    // category axes
    scale?: ScaleBand<string>
    // the min and max values for the axis
    categories: Array<string>
    // the font for drawing the axis ticks and labels
    font?: Partial<AxesLabelFont>
    // the axis label
    label: string
}

/**
 * Category axis, which for the moment is only available as a y-axis. The category axis requires
 * a set of categories that will form the y-axis. Generally, these categories should be the name
 * of the series used to represent each category.
 * @param props The properties for the component
 * @return null
 * @constructor
 */
export function CategoryAxis(props: Props): null {
    const {
        chartId,
        container,
        plotDimensions,
        margin,
        addYAxis,
        color,
    } = useChart()

    const {
        axisId,
        location,
        categories,
        label,
    } = props

    const axisRef = useRef<axes.CategoryAxis>()

    const axisIdRef = useRef<string>(axisId)
    const marginRef = useRef<Margin>(margin)
    useEffect(
        () => {
            axisIdRef.current = axisId
            marginRef.current = margin
        },
        [axisId, margin]
    )

    useEffect(
        () => {
            if (container) {
                const svg = d3.select<SVGSVGElement, any>(container)
                const font: AxesLabelFont = {...defaultAxesLabelFont, color, ...props.font}

                if (axisRef.current === undefined) {
                    axisRef.current = addCategoryYAxis(
                        chartId,
                        axisId,
                        svg,
                        plotDimensions,
                        categories,
                        font,
                        margin,
                        label,
                        location
                    )
                    // add the y-axis to the chart context
                    addYAxis(axisRef.current, axisId)
                } else {
                    // update the category size in case the plot dimensions changed
                    axisRef.current.categorySize = axisRef.current.update(categories, categories.length, plotDimensions, margin)
                    svg.select(`#${labelIdFor(chartId, location)}`).attr('fill', color)
                }
            }
        },
        [addYAxis, axisId, categories, chartId, color, container, label, location, margin, plotDimensions, props.font]
    )

    return null
}

function labelIdFor(chartId: number, location: AxisLocation.Left | AxisLocation.Right): string {
    return `stream-chart-x-axis-${location}-label-${chartId}`
}

function categorySizeFor(dimensions: Dimensions, margin: Margin, numCategories: number): number {
    return Math.max(margin.bottom, dimensions.height - margin.bottom) / numCategories
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
    location: AxisLocation.Left | AxisLocation.Right,
): axes.CategoryAxis {
    const categorySize = categorySizeFor(plotDimensions, margin, categories.length)
    const scale = d3.scaleBand()
        .domain(categories)
        .range([0, categorySize * categories.length]);

    // create and add the axes
    const generator = location === AxisLocation.Left ? d3.axisLeft(scale) : d3.axisRight(scale)

    const selection = svg
        .append<SVGGElement>('g')
        .attr('id', `y-axis-selection-${chartId}`)
        .attr('class', 'y-axis')
        .attr('transform', `translate(${xTranslation(location, plotDimensions, margin)}, ${margin.top})`)
        .call(generator);

    svg
        .append<SVGTextElement>('text')
        .attr('id', labelIdFor(chartId, location))
        .attr('text-anchor', 'middle')
        .attr('font-size', axesLabelFont.size)
        .attr('fill', axesLabelFont.color)
        .attr('font-family', axesLabelFont.family)
        .attr('font-weight', axesLabelFont.weight)
        .attr('transform', `translate(${labelXTranslation(location, plotDimensions, margin, axesLabelFont)}, ${labelYTranslation(plotDimensions, margin)}) rotate(-90)`)
        .text(axisLabel)

    const axis = {axisId, selection, location, scale, generator, categorySize, update: () => categorySize}

    return {
        ...axis,
        update: (categoryNames, unfilteredSize, dimensions) =>
            updateCategoryYAxis(chartId, svg, axis, dimensions, unfilteredSize, categoryNames, axesLabelFont, margin, location)
    }
}

function updateCategoryYAxis(
    chartId: number,
    svg: SvgSelection,
    axis: axes.CategoryAxis,
    plotDimensions: Dimensions,
    unfilteredSize: number,
    names: Array<string>,
    axesLabelFont: AxesLabelFont,
    margin: Margin,
    location: AxisLocation.Left | AxisLocation.Right,
): number {
    const categorySize = categorySizeFor(plotDimensions, margin, unfilteredSize)
    axis.scale
        .domain(names)
        .range([0, categorySize * names.length])
    axis.selection
        .attr('transform', `translate(${xTranslation(location, plotDimensions, margin)}, ${margin.top})`)
        .call(axis.generator)

    svg
        .select(`#${labelIdFor(chartId, location)}`)
        .attr('transform', `translate(${labelXTranslation(location, plotDimensions, margin, axesLabelFont)}, ${labelYTranslation(plotDimensions, margin)}) rotate(-90)`)

    return categorySize
}


function xTranslation(location: AxisLocation.Left | AxisLocation.Right, plotDimensions: Dimensions, margin: Margin): number {
    return location === AxisLocation.Left ?
        margin.left :
        margin.left + plotDimensions.width
}

function labelXTranslation(
    location: AxisLocation.Left | AxisLocation.Right,
    plotDimensions: Dimensions,
    margin: Margin,
    axesLabelFont: AxesLabelFont,
): number {
    return location === AxisLocation.Left ?
        axesLabelFont.size :
        margin.left + plotDimensions.width + margin.right - axesLabelFont.size
}

function labelYTranslation(plotDimensions: Dimensions, margin: Margin): number {
    return (margin.top + margin.bottom + plotDimensions.height) / 2
}

