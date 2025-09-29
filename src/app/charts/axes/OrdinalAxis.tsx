import * as axes from "./axes"
import {
    addCategoryAxis,
    AxesFont,
    AxisLocation,
    AxisTickStyle,
    defaultAxesFont,
    defaultAxisTickStyle,
    labelIdFor
} from "./axes"
import * as d3 from "d3";
import {ScaleBand} from "d3";
import {useChart} from "../hooks/useChart";
import {useEffect, useRef} from "react";
import {Margin} from "../styling/margins";
import {usePlotDimensions} from "../hooks/usePlotDimensions";

interface Props {
    // the unique ID of the axis
    axisId: string
    // the location of the axis. for y-axes, this mut be either left or right,
    // for x-axis, must be either top or bottom.
    location: AxisLocation
    // category axes
    scale?: ScaleBand<string>
    // the min and max values for the axis
    categories: Array<string>
    // the font for drawing the axis ticks and labels
    font?: Partial<AxesFont>
    // styling for the axis ticks (e.g. font, rotation, etc)
    axisTickStyle?: Partial<AxisTickStyle>
    // the axis label
    label: string
}

/**
 * Category axis that represents the x-axis when its location is either on the bottom or the top.
 * When the axis location is left or right, then the category axis represents the y-axis. The category
 * axis requires a set of categories that will form the axis. Generally, these categories should
 * be the name of the series used to represent each category.
 * @param props The properties for the component
 * @return null
 * @constructor
 */
export function OrdinalAxis(props: Props): null {
    const {
        chartId,
        container,
        axes,
        color,
    } = useChart()

    const {addXAxis, addYAxis} = axes

    const {plotDimensions, margin} = usePlotDimensions()

    const {
        axisId,
        location,
        categories,
        label,
    } = props

    const axisRef = useRef<axes.CategoryAxis>(undefined)

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
                const font: AxesFont = {...defaultAxesFont(), color, ...props.font}
                const axisTickStyle = {...defaultAxisTickStyle(), ...props.axisTickStyle}

                if (axisRef.current === undefined) {
                    axisRef.current = addCategoryAxis(chartId, axisId, svg, location, categories, label, font, axisTickStyle, plotDimensions, margin)

                    // add the x-axis or y-axis to the chart context depending on its
                    // location
                    switch (location) {
                        case AxisLocation.Left:
                        case AxisLocation.Right:
                            addYAxis(axisRef.current, axisId)
                            break
                        case AxisLocation.Top:
                        case AxisLocation.Bottom:
                            addXAxis(axisRef.current, axisId)
                    }
                } else {
                    // update the category size in case the plot dimensions changed
                    axisRef.current.categorySize = axisRef.current.update(categories, categories.length, plotDimensions, margin)
                    svg.select(`#${labelIdFor(chartId, location)}`).attr('fill', color)
                }
            }
        },
        [
            addXAxis, addYAxis,
            axisId,
            categories,
            chartId,
            color,
            container,
            label,
            location,
            margin,
            plotDimensions,
            props.axisTickStyle,
            props.font
        ]
    )

    return null
}
