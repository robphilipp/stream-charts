import type {BaseAxis, SeriesStyle} from "../axes/axes";
import {BaseAxisRange} from "../axes/BaseAxisRange";
import {type JSX, useMemo} from "react";
import {defaultUseChartValues} from "./defaultUseChartValues";
import {useAxes} from "./useAxes";
import {useMouse} from "./useMouse";
import {useTooltip} from "./useTooltip";
import {useCanvasSurface} from "./useCanvasSurface";
import {ChartContext} from "./useChart";

// the defaults (constants, so that their identity doesn't change from one render to the next)
const DEFAULT_SERIES_FILTER = defaultUseChartValues().seriesFilter
const NO_SERIES_STYLES = new Map<string, SeriesStyle>()

/**
 * The properties for the {@link ChartProvider}
 * @template S The type of the series style
 */
export interface Props<S extends SeriesStyle> {
    /**
     * The unique ID for the chart
     */
    chartId: number
    /**
     * Base color
     */
    color: string
    /**
     * The base/default background color
     */
    backgroundColor: string
    /**
     * A `map(series_name -> series_line_style)` holding the style for each series
     */
    seriesStyles?: Map<string, S>
    /**
     * An optional regular expression used against the series names to determine which series to show in the chart
     */
    seriesFilter?: RegExp

    children: JSX.Element | Array<JSX.Element>
}

/**
 * The React context provider for the {@link UseChartValues}
 * @param props The properties
 * @return The children wrapped in this provider
 * @template S The type of the series style
 * @template AR The type of the axis range
 * @template A The type of the axis
 */
export default function ChartProvider<S extends SeriesStyle, AR extends BaseAxisRange, A extends BaseAxis>(props: Props<S>): JSX.Element {
    const {
        chartId,
        color,
        backgroundColor,
        seriesFilter = DEFAULT_SERIES_FILTER,
        seriesStyles = NO_SERIES_STYLES as Map<string, S>,
    } = props

    // canvas/canvasContext come from CanvasSurfaceProvider (a shared ancestor -- see Chart.tsx),
    // which sizes the canvas from usePlotDimensions() rather than from props, so this always
    // reflects the same dimensions the axes/plots are using.
    const {canvas, canvasContext} = useCanvasSurface()

    const axes = useAxes<AR, A>()
    const mouse = useMouse()
    const tooltip = useTooltip()

    // (memoized, so that the chart's components only re-render when something in it changes)
    const value = useMemo(
        () => ({chartId, color, backgroundColor, seriesStyles, seriesFilter, canvasContext, canvas, axes, mouse, tooltip}),
        [chartId, color, backgroundColor, seriesStyles, seriesFilter, canvasContext, canvas, axes, mouse, tooltip]
    )

    return <ChartContext.Provider value={value}>
        {props.children}
    </ChartContext.Provider>
}
