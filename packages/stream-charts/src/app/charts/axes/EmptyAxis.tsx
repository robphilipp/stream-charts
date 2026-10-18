import {
    AxisLocation,
    addEmptyXAxis,
    addEmptyYAxis,
    defaultAxesFont,
    removeContinuousXAxis,
    removeContinuousYAxis,
    type ContinuousNumericAxis,
    type SeriesStyle
} from "./axes";
import {type NoTooltipMetadata, useChart} from "../hooks/useChart";
import {useEffect, useRef} from "react";
import * as d3 from "d3";
import type {Margin} from "../styling/margins";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import type {Datum} from "../series/timeSeries";
import {AxisInterval} from "./AxisInterval";
import {ContinuousAxisRange} from "./ContinuousAxisRange";

export interface Props {
    // the unique ID of the axis
    axisId: string
    // the location of the axis. for x-axes, this must be either top or bottom. for
    // y-axes, this mut be either left or right
    location: AxisLocation
}

// linear scale
const EMPTY_AXIS_SCALE = d3.scaleLinear()

// the min and max values for the axis
const EMPTY_AXIS_DOMAIN: [min: number, max: number] = [0, 1]

/**
 * Represents an empty axis (x or y) that can be placed on the top, bottom,
 * left, or right of the chart. An empty axis is just a line where the axis
 * would be, without any ticks or labels. This component returns null, meaning React won't
 * render it because we are drawing directly onto the chart's shared canvas.
 * @param props The properties for the axis
 * @return `null` (the axis draws onto the chart's canvas)
 */
export function EmptyAxis(props: Props): null {
    const {
        chartId,
        canvasContext,
        axes,
        color,
    } = useChart<Datum, SeriesStyle, NoTooltipMetadata, ContinuousAxisRange, ContinuousNumericAxis>()

    const {
        addXAxis,
        addYAxis,
        axisRangeFor,
        setAxisRangeFor,
        setAxisIntervalFor,
    } = axes

    const {
        plotDimensions,
        margin
    } = usePlotDimensions()

    const {
        axisId,
        location,
    } = props

    const axisRef = useRef<ContinuousNumericAxis>(undefined)
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
            if (canvasContext) {
                if (axisRef.current === undefined) {
                    switch (location) {
                        case AxisLocation.Bottom:
                        case AxisLocation.Top: {
                            axisRef.current = addEmptyXAxis(
                                canvasContext, axisId, plotDimensions, location, EMPTY_AXIS_SCALE,
                                margin, setAxisIntervalFor, color, EMPTY_AXIS_DOMAIN
                            )
                            // add the x-axis to the chart context
                            const [start, end] = AxisInterval.as(EMPTY_AXIS_DOMAIN).asTuple()
                            addXAxis(axisRef.current, axisId, ContinuousAxisRange.from(start, end))

                            break
                        }

                        case AxisLocation.Left:
                        case AxisLocation.Right: {
                            axisRef.current = addEmptyYAxis(
                                canvasContext, axisId, plotDimensions, location, EMPTY_AXIS_SCALE,
                                margin, setAxisIntervalFor, color, EMPTY_AXIS_DOMAIN
                            )
                            // add the y-axis to the chart context
                            const [start, end] = AxisInterval.as(EMPTY_AXIS_DOMAIN).asTuple()
                            addYAxis(axisRef.current, axisId, ContinuousAxisRange.from(start, end))
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

                    // keep the line color in sync with the chart's color (e.g. on theme change),
                    // without recreating the axis or touching its domain
                    axisRef.current.updateFont({...defaultAxesFont(), color})
                }
            }
        },
        [
            chartId, axisId, location, addXAxis, addYAxis,
            canvasContext, margin, plotDimensions, setAxisIntervalFor,
            axisRangeFor,
            setAxisRangeFor,
            color,
        ]
    )

    // unregister the axis' draw function when the axis unmounts
    useEffect(
        () => {
            return () => {
                if (canvasContext) {
                    switch (location) {
                        case AxisLocation.Bottom:
                        case AxisLocation.Top:
                            removeContinuousXAxis(canvasContext, axisId)
                            break
                        case AxisLocation.Left:
                        case AxisLocation.Right:
                            removeContinuousYAxis(canvasContext, axisId)
                    }
                }
            }
        },
        [canvasContext, axisId, location]
    )

    return null
}