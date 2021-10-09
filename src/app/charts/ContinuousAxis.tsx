import {AxesLabelFont, AxisLocation, ContinuousNumericAxis, defaultAxesLabelFont} from "./axes";
import {useChart} from "./hooks/useChart";
import {useEffect, useRef} from "react";
import * as d3 from "d3";
import {ScaleContinuousNumeric} from "d3";
import {SvgSelection} from "./d3types";
import {Dimensions, Margin} from "./margins";
import {noop} from "./utils";
import {ContinuousAxisRange} from "./continuousAxisRangeFor";

interface Props {
    // the unique ID of the axis
    axisId: string
    // the location of the axis. for x-axes, this must be either top or bottom. for
    // y-axes, this mut be either left or right
    location: AxisLocation
    // linear, log, or power scale that defaults to linear scale when not specified
    scale?: ScaleContinuousNumeric<number, number>
    // the min and max values for the axis
    domain: [min: number, max: number]
    // the font for drawing the axis ticks and labels
    font?: Partial<AxesLabelFont>
    // the axis label
    label: string
}

export function ContinuousAxis(props: Props): null {
    const {
        chartId,
        container,
        plotDimensions,
        margin,
        xAxesState,
        yAxesState,
        addXAxis,
        addYAxis,
        setTimeRangeFor,
        timeRangeFor,
        addTimeUpdateHandler,
        color
    } = useChart()

    const {
        axisId,
        location,
        scale = d3.scaleLinear(),
        domain,
        label,
    } = props

    const axisRef = useRef<ContinuousNumericAxis>()
    const timeUpdateHandlerIdRef = useRef<string>()

    const axisIdRef = useRef<string>(axisId)
    const marginRef = useRef<Margin>(margin)
    useEffect(
        () => {
            axisIdRef.current = axisId
            marginRef.current = margin
        },
        [axisId, plotDimensions, margin]
    )

    useEffect(
        () => {
            if (container) {
                const svg = d3.select<SVGSVGElement, any>(container)
                const font: AxesLabelFont = {...defaultAxesLabelFont, color, ...props.font}

                const handleTimeUpdates = (updates: Map<string, ContinuousAxisRange>, plotDim: Dimensions): void => {
                    if (timeUpdateHandlerIdRef.current && axisRef.current) {
                        const range = updates.get(axisId)
                        if (range) {
                            axisRef.current.update([range.start, range.end], plotDim, marginRef.current)
                        }
                    }
                }

                if (axisRef.current === undefined) {
                    switch (location) {
                        case AxisLocation.Bottom:
                        case AxisLocation.Top:
                            axisRef.current = addContinuousNumericXAxis(
                                chartId,
                                svg,
                                plotDimensions,
                                location,
                                scale,
                                domain,
                                font,
                                margin,
                                label,
                                axisId,
                                setTimeRangeFor,
                            )
                            // add the x-axis to the chart context
                            addXAxis(axisRef.current, axisId)

                            // set the time-range for the time-axis
                            setTimeRangeFor(axisId, domain)

                            // add an update handler
                            timeUpdateHandlerIdRef.current = `x-axis-${chartId}-${location.valueOf()}`
                            addTimeUpdateHandler(timeUpdateHandlerIdRef.current, handleTimeUpdates)

                            break

                        case AxisLocation.Left:
                        case AxisLocation.Right:
                            axisRef.current = addContinuousNumericYAxis(
                                chartId,
                                axisId,
                                svg,
                                plotDimensions,
                                location,
                                scale,
                                domain,
                                font,
                                margin,
                                label,
                            )
                            // add the y-axis to the chart context
                            addYAxis(axisRef.current, axisId)
                    }
                } else {
                    switch (location) {
                        case AxisLocation.Bottom:
                        case AxisLocation.Top:
                            const timeRange = timeRangeFor(axisId)
                            if (timeRange) {
                                axisRef.current.update(timeRange, plotDimensions, margin)
                            }
                            if (timeUpdateHandlerIdRef.current !== undefined) {
                                addTimeUpdateHandler(timeUpdateHandlerIdRef.current, handleTimeUpdates)
                            }
                            break
                        case AxisLocation.Left:
                        case AxisLocation.Right:
                            // todo will need to use and update the domain for the y-axis when using
                            //      zoom...do something similar to what I did for the time-range
                            axisRef.current.update(domain, plotDimensions, margin)
                    }
                    svg.select(`#${labelIdFor(chartId, location)}`).attr('fill', color)
                }
            }
        },
        [
            chartId, axisId, label, location, props.font, xAxesState, yAxesState, addXAxis, addYAxis,
            domain, scale, container, margin, plotDimensions, setTimeRangeFor, timeRangeFor, addTimeUpdateHandler,
            color
        ]
    )

    return null
}

function labelIdFor(chartId: number, location: AxisLocation): string {
    switch (location) {
        case AxisLocation.Bottom:
        case AxisLocation.Top:
            return `stream-chart-x-axis-${location}-label-${chartId}`
        case AxisLocation.Left:
        case AxisLocation.Right:
            return `stream-chart-y-axis-${location}-label-${chartId}`
    }
}

export function addContinuousNumericXAxis(
    chartId: number,
    svg: SvgSelection,
    plotDimensions: Dimensions,
    location: AxisLocation.Bottom | AxisLocation.Top,
    scaleGenerator: ScaleContinuousNumeric<number, number>,
    domain: [minValue: number, maxValue: number],
    axesLabelFont: AxesLabelFont,
    margin: Margin,
    axisLabel: string,
    axisId: string,
    setTimeRangeFor: (axisId: string, timeRange: [start: number, end: number]) => void,
): ContinuousNumericAxis {
    const scale = scaleGenerator.domain(domain).range([0, plotDimensions.width])

    const selection = svg
        .append<SVGGElement>('g')
        .attr('transform', `translate(${margin.left}, ${yTranslation(location, plotDimensions, margin)})`)

    svg
        .append<SVGTextElement>('text')
        .attr('id', labelIdFor(chartId, location))
        .attr('text-anchor', 'middle')
        .attr('font-size', axesLabelFont.size)
        .attr('fill', axesLabelFont.color)
        .attr('font-family', axesLabelFont.family)
        .attr('font-weight', axesLabelFont.weight)
        .attr('transform', `translate(${margin.left + plotDimensions.width / 2}, ${labelYTranslation(location, plotDimensions, margin)})`)
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
        update: (domain: [start: number, end: number], plotDimensions: Dimensions, margin: Margin) => {
            updateLinearXAxis(chartId, svg, axis, domain, plotDimensions, margin, location)
            setTimeRangeFor(axisId, domain)
        }
    }
}

function yTranslation(location: AxisLocation.Bottom | AxisLocation.Top, plotDimensions: Dimensions, margin: Margin): number {
    return location === AxisLocation.Bottom ?
        Math.max(margin.bottom + margin.top, plotDimensions.height + margin.top - margin.bottom) :
        margin.top
}

function labelYTranslation(location: AxisLocation.Bottom | AxisLocation.Top, plotDimensions: Dimensions, margin: Margin): number {
    return location === AxisLocation.Bottom ?
        plotDimensions.height + margin.top + margin.bottom / 3 :
        margin.top / 3
}

function updateLinearXAxis(
    chartId: number,
    svg: SvgSelection,
    axis: ContinuousNumericAxis,
    domain: [startValue: number, endValue: number],
    plotDimensions: Dimensions,
    margin: Margin,
    location: AxisLocation.Bottom | AxisLocation.Top,
): void {
    axis.scale.domain(domain).range([0, plotDimensions.width])

    axis.selection
        .attr('transform', `translate(${margin.left}, ${yTranslation(location, plotDimensions, margin)})`)
        .call(axis.generator)
    svg
        .select(`#${labelIdFor(chartId, location)}`)
        .attr('transform', `translate(${margin.left + plotDimensions.width / 2}, ${labelYTranslation(location, plotDimensions, margin)})`)
}


export function addContinuousNumericYAxis(
    chartId: number,
    axisId: string,
    svg: SvgSelection,
    plotDimensions: Dimensions,
    location: AxisLocation.Left | AxisLocation.Right,
    scaleGenerator: ScaleContinuousNumeric<number, number>,
    domain: [minValue: number, maxValue: number],
    axesLabelFont: AxesLabelFont,
    margin: Margin,
    axisLabel: string,
): ContinuousNumericAxis {
    const scale = scaleGenerator
        .domain(domain)
        .range([Math.max(margin.bottom, plotDimensions.height - margin.bottom), 0])

    const generator = location === AxisLocation.Left ? d3.axisLeft(scale) : d3.axisRight(scale)
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
        .attr('transform', `translate(${labelXTranslation(location, plotDimensions, margin, axesLabelFont)}, ${margin.top + plotDimensions.height / 2}) rotate(-90)`)
        .text(axisLabel)

    const axis = {axisId, selection, location, scale, generator, update: noop}
    return {
        ...axis,
        update: (domain, plotDimensions, margin) => updateLinearYAxis(
            chartId, svg, axis, domain, plotDimensions, margin, axesLabelFont, location
        )
    }
}

function xTranslation(location: AxisLocation.Left | AxisLocation.Right, plotDimensions: Dimensions, margin: Margin): number {
    return location === AxisLocation.Left ?
        margin.left :
        margin.left + plotDimensions.width
}

function labelXTranslation(location: AxisLocation.Left | AxisLocation.Right, plotDimensions: Dimensions, margin: Margin, axesLabelFont: AxesLabelFont): number {
    return location === AxisLocation.Left ?
        axesLabelFont.size :
        margin.left + plotDimensions.width + margin.right - axesLabelFont.size
}

function updateLinearYAxis(
    chartId: number,
    svg: SvgSelection,
    axis: ContinuousNumericAxis,
    domain: [startValue: number, endValue: number],
    plotDimensions: Dimensions,
    margin: Margin,
    axesLabelFont: AxesLabelFont,
    location: AxisLocation.Left | AxisLocation.Right,
): void {
    axis.scale.domain(domain).range([Math.max(margin.bottom, plotDimensions.height - margin.bottom), 0])
    axis.selection
        .attr('transform', `translate(${xTranslation(location, plotDimensions, margin)}, ${margin.top})`)
        .call(axis.generator)

    svg
        .select(`#${labelIdFor(chartId, location)}`)
        .attr('transform', `translate(${labelXTranslation(location, plotDimensions, margin, axesLabelFont)}, ${margin.top + plotDimensions.height / 2}) rotate(-90)`)
}
