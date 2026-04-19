import {addEmptyXAxis, addEmptyYAxis, AxisLocation, ContinuousNumericAxis,} from "./axes";
import {useChart} from "../hooks/useChart";
import {useEffect, useRef} from "react";
import * as d3 from "d3";
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
}

// linear scale
const EMPTY_AXIS_SCALE = d3.scaleLinear()

// the min and max values for the axis
const EMPTY_AXIS_DOMAIN: [min: number, max: number] = [0, 1]

/**
 * Represents an empty axis (x or y) that can be place on the top, bottom,
 * left, or right of the chart. An empty axis is just a line where the axis
 * would be, without any ticks or labels.
 * @param props The properties for the axis
 * @constructor
 */
export function EmptyAxis(props: Props): null {
    const {
        chartId,
        container,
        axes,
    } = useChart<Datum, any, any, ContinuousAxisRange, ContinuousNumericAxis>()

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
            if (container) {
                const svg = d3.select<SVGSVGElement, any>(container)

                if (axisRef.current === undefined) {
                    switch (location) {
                        case AxisLocation.Bottom:
                        case AxisLocation.Top: {
                            axisRef.current = addEmptyXAxis(
                                axisId, svg, plotDimensions, location, EMPTY_AXIS_SCALE,
                                margin, setAxisIntervalFor, EMPTY_AXIS_DOMAIN
                            )
                            // add the x-axis to the chart context
                            const [start, end] = AxisInterval.as(EMPTY_AXIS_DOMAIN).asTuple()
                            addXAxis(axisRef.current, axisId, ContinuousAxisRange.from(start, end))

                            break
                        }

                        case AxisLocation.Left:
                        case AxisLocation.Right: {
                            axisRef.current = addEmptyYAxis(
                                axisId, svg, plotDimensions, location, EMPTY_AXIS_SCALE,
                                margin, setAxisIntervalFor, EMPTY_AXIS_DOMAIN
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
                }
            }
        },
        [
            chartId, axisId, location, addXAxis, addYAxis,
            container, margin, plotDimensions, setAxisIntervalFor,
            axisRangeFor,
            setAxisRangeFor,
        ]
    )

    return null
}
