import {
    addContinuousNumericXAxis,
    addContinuousNumericYAxis,
    AxesFont,
    AxisLocation,
    ContinuousNumericAxis,
    defaultAxesFont,
    labelIdFor
} from "./axes";
import {useChart} from "../hooks/useChart";
import {useEffect, useRef} from "react";
import * as d3 from "d3";
import {ScaleContinuousNumeric} from "d3";
import {Dimensions, Margin} from "../styling/margins";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import {Datum} from "../series/timeSeries";
import {AxisInterval} from "./AxisInterval";
import {ContinuousAxisRange} from "./ContinuousAxisRange";

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
    font?: Partial<AxesFont>
    // the axis label
    label: string
    // The domain prop holds the axis bounds as a (min, max) tuple. The default
    // behavior is to update the axis bounds when the **values** of the domain
    // prop change, rather than when the object reference changes. This allows
    // a user of the chart to specify a tuple-literal as the ranges, rather than
    // forcing the user of the chart to create a ref and use that ref.
    //
    // This behavior is important when allowing the axes to scroll in time, as
    // is done in the scatter plot or the raster plot. In this case, if the user
    // of the raster chart specifies the axis domain as a tuple-literal, then
    // the bounds will get reset to their original value with each render.
    //
    // However, for charts that don't scroll, such as the iterates chart, but where
    // the user would like to change axis-bounds, say for a different iterates
    // function, we would like the axis bounds to be reset based on a change to
    // the object ref instead. In this case, we can set this property to false.
    updateAxisBasedOnDomainValues?: boolean
}

/**
 * Represents a continuous numeric axis (x or y) that can be place on the top, bottom,
 * left, or right of the chart. The domain (axis range) can be managed by this axis
 *  component or managed externally (i.e. deferred). This component returns null, meaning
 * React won't render it because we are updating the SVG element and don't want React
 * involved, except to call this function if the props change.
 * @param props The properties for the axis
 * @constructor
 */
export function ContinuousAxis(props: Props): null {
    const {
        chartId,
        container,
        axes,
        color
    } = useChart<Datum, any, any, ContinuousAxisRange, ContinuousNumericAxis>()

    const {
        xAxesState,
        yAxesState,
        addXAxis,
        addYAxis,
        axisRangeFor,
        setAxisIntervalFor,
        setAxisRangeFor,
        addAxesRangesUpdateHandler,
    } = axes

    const {
        plotDimensions,
        margin
    } = usePlotDimensions()

    const {
        axisId,
        location,
        scale = d3.scaleLinear(),
        domain,
        updateAxisBasedOnDomainValues = true,
        label,
    } = props

    const axisRef = useRef<ContinuousNumericAxis>(undefined)
    const rangeUpdateHandlerIdRef = useRef<string>(undefined)

    const axisIdRef = useRef<string>(axisId)
    const marginRef = useRef<Margin>(margin)
    const domainRef = useRef<AxisInterval>(AxisInterval.as(domain))
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
                const font: AxesFont = {...defaultAxesFont(), color, ...props.font}

                const handleRangeUpdates = (updates: Map<string, ContinuousAxisRange>, plotDim: Dimensions): void => {
                    if (rangeUpdateHandlerIdRef.current && axisRef.current) {
                        const range = updates.get(axisId)
                        if (range) {
                            axisRef.current.update(range.current, plotDim, marginRef.current)
                        }
                    }
                }

                if (axisRef.current === undefined) {
                    switch (location) {
                        case AxisLocation.Bottom:
                        case AxisLocation.Top: {
                            axisRef.current = addContinuousNumericXAxis(
                                chartId, axisId, svg, plotDimensions, location, scale, domain,
                                font, margin, label, setAxisIntervalFor
                            )
                            // add the x-axis to the chart context
                            const [start, end] = AxisInterval.as(domain).asTuple()
                            addXAxis(axisRef.current, axisId, ContinuousAxisRange.from(start, end))
                            // addXAxis(axisRef.current, axisId, AxisInterval.as(domain))

                            // add an update handler
                            rangeUpdateHandlerIdRef.current = `x-axis-${chartId}-${location.valueOf()}`
                            addAxesRangesUpdateHandler(rangeUpdateHandlerIdRef.current, handleRangeUpdates)

                            break
                        }

                        case AxisLocation.Left:
                        case AxisLocation.Right: {
                            axisRef.current = addContinuousNumericYAxis(
                                chartId, axisId, svg, plotDimensions, location, scale, domain,
                                font, margin, label, setAxisIntervalFor
                            )
                            // add the y-axis to the chart context
                            const [start, end] = AxisInterval.as(domain).asTuple()
                            addYAxis(axisRef.current, axisId, ContinuousAxisRange.from(start, end))
                            // addYAxis(axisRef.current, axisId, AxisInterval.as(domain))

                            // add an update handler
                            rangeUpdateHandlerIdRef.current = `y-axis-${chartId}-${location.valueOf()}`
                            addAxesRangesUpdateHandler(rangeUpdateHandlerIdRef.current, handleRangeUpdates)
                        }
                    }
                } else {
                    const axisRange = axisRangeFor(axisId)
                    const domain = axisRange
                        .map(range => range.current)
                        .getOrElse(AxisInterval.empty())
                    if (domain.isNotEmpty()) {
                        axisRef.current.update(domain, plotDimensions, margin)
                    }

                    if (
                        (updateAxisBasedOnDomainValues && (domainRef.current.start !== domain.start || domainRef.current.end !== domain.end)) ||
                        (!updateAxisBasedOnDomainValues && domainRef.current !== domain)
                    ) {
                        domainRef.current = domain
                        axisRange.ifPresent(range => setAxisRangeFor(axisId, range.updateOriginal(domain.start, domain.end)))

                    }

                    svg.select(`#${labelIdFor(chartId, location)}`).attr('fill', color)
                }
            }
        },
        [
            chartId, axisId, label, location, props.font, xAxesState, yAxesState, addXAxis, addYAxis, domain,
            scale, container, margin, plotDimensions, setAxisIntervalFor,
            axisRangeFor,
            addAxesRangesUpdateHandler,
            setAxisRangeFor,
            color, updateAxisBasedOnDomainValues
        ]
    )

    return null
}
