import {noop} from "../utils";
import {useChart} from "../hooks/useChart";
import {TrackerSelection} from "../d3types";
import {
    defaultTrackerLabelFont,
    defaultTrackerStyle,
    removeTrackerControl,
    trackerControlInstance,
    TrackerLabelFont,
    TrackerStyle
} from "./trackerUtils";
import * as d3 from "d3";
import {useEffect, useMemo, useRef} from "react";
import {AxisLocation, BaseAxis, ContinuousNumericAxis} from "../axes/axes";
import {usePlotDimensions} from "../hooks/usePlotDimensions";

export interface TrackerAxisInfo {
    x: number
    axisLocation: AxisLocation
}

// map(axis_id -> tracker_axis_info)
export type TrackerAxisUpdate = Map<string, TrackerAxisInfo>

export enum TrackerLabelLocation {
    Nowhere,
    ByAxis,
}

interface Props {
    visible: boolean
    trackerAxis?: AxisLocation
    labelLocation?: TrackerLabelLocation
    labelFormatter?: (value: number) => string
    style?: Partial<TrackerStyle>,
    font?: Partial<TrackerLabelFont>,
    onTrackerUpdate?: (update: TrackerAxisUpdate) => void
}

/**
 * A tracker line that displays or reports the x or y coordinates at the mouse location. The tracker
 * handles single axes and dual axes.
 * @param props The tracker control properties
 * @return null component
 * @constructor
 */
export function Tracker(props: Props): null {
    const {
        visible,
        trackerAxis = AxisLocation.Bottom,
        labelLocation = TrackerLabelLocation.ByAxis,
        labelFormatter,
        style,
        font,
        onTrackerUpdate = noop
    } = props
    const {
        chartId,
        container,
        axes,
        backgroundColor
    } = useChart()

    const {xAxesState, yAxesState} = axes
    const axisState = (trackerAxis === AxisLocation.Bottom || trackerAxis === AxisLocation.Top) ?
        xAxesState :
        yAxesState

    const {plotDimensions, margin} = usePlotDimensions()

    const trackerStyle = useMemo(() => ({...defaultTrackerStyle, ...style}), [style])
    const trackerFont = useMemo(() => ({...defaultTrackerLabelFont, ...font}), [font])
    const trackerRef = useRef<TrackerSelection>(undefined)

    const axisRef = useRef<Map<string, ContinuousNumericAxis>>(new Map())
    useEffect(
        () => {
            const axes = new Map<string, ContinuousNumericAxis>()
            axisState.axes.forEach((axis: BaseAxis, id: string) => axes.set(id, axis as ContinuousNumericAxis))
            axisRef.current = axes
        },
        [axisState]
    )

    // when the container, tracker-control function, or visibility change, then we need to update the
    // tracker control
    useEffect(
        () => {
            if (container) {
                const svg = d3.select<SVGSVGElement, any>(container)
                if (visible && container) {
                    const trackerLabels = new Map<ContinuousNumericAxis, (x: number) => string>(
                        Array.from(axisRef.current.values()).map(axis => {
                            const formatter = labelFormatter ??
                                ((value: number) => labelLocation === TrackerLabelLocation.Nowhere ?
                                    "" :
                                    `${d3.format(",.0f")(value)}`
                                )
                            return [axis, formatter]
                        })
                    )

                    trackerRef.current = trackerControlInstance(
                        chartId,
                        container,
                        svg,
                        plotDimensions,
                        margin,
                        trackerStyle,
                        trackerFont,
                        trackerLabels,
                        labelLocation,
                        onTrackerUpdate,
                        trackerAxis,
                        backgroundColor
                    )
                }
                // if the tracker was defined and is now no longer defined (i.e., props changed, then remove the tracker)
                else if (!visible && trackerRef.current !== undefined) {
                    removeTrackerControl(svg, trackerAxis)
                    trackerRef.current = undefined
                }
            }
        },
        [backgroundColor, chartId, container, labelFormatter, labelLocation, margin, onTrackerUpdate, plotDimensions, trackerAxis, trackerFont, trackerStyle, visible]
    )

    return null
}
