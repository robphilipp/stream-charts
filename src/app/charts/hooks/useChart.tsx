import * as React from 'react';
import {createContext, useContext, useEffect, useRef, useState} from 'react';
import {Dimensions, Margin, plotDimensionsFrom} from "../margins";
import {GSelection} from "../d3types";
import {Observable, Subscription} from "rxjs";
import {ChartData} from "../chartData";
import {Datum, Series} from "../datumSeries";
import {noop} from "../utils";
import {BaseAxis, SeriesLineStyle} from "../axes";
import {ContinuousAxisRange} from "../continuousAxisRangeFor";
import {AxesAssignment, TimeSeries} from "../plot";
import {TooltipDimensions} from "../tooltipUtils";
import {addAxisTo, AxesState, createAxesState} from "./AxesState";

export const defaultMargin: Margin = {top: 30, right: 20, bottom: 30, left: 50}

/**
 * The values exposed through the {@link useChart} react hook
 */
interface UseChartValues {
    /**
     * Unique ID for the chart
     */
    chartId: number
    /**
     * The width and height (in pixels) of this chart
     */
    plotDimensions: Dimensions
    /**
     * The root <g> element for the chart
     */
    mainG: GSelection | null
    /**
     * The SVG element which is the container for this chart
     */
    container: SVGSVGElement | null
    /**
     * The plot margins for the border of main G
     */
    margin: Margin
    /**
     * Base color
     */
    color: string
    /**
     * A `map(series_name -> series_line_style)`
     */
    seriesStyles: Map<string, SeriesLineStyle>

    /*
     | AXES
     */
    /**
     * The x-axes state holds the currently set x-axes, manipulation and accessor functions
     */
    xAxesState: AxesState
    /**
     * Adds an x-axis to the axes and updates the internal state
     * @param axis The axis to add
     * @param id The ID of the axis to add
     */
    addXAxis: (axis: BaseAxis, id: string) => void
    /**
     * The y-axes state holds the currently set x-axes, manipulation and accessor functions
     */
    yAxesState: AxesState
    /**
     * Adds a y-axis to the axes and updates the internal state
     * @param axis The axis to add
     * @param id The ID of the axis to add
     */
    addYAxis: (axis: BaseAxis, id: string) => void
    /**
     * Sets the axis assigned to each series. This should contain **all** the series used in
     * the chart.
     * @param assignments The assignment of the series to their axes
     */
    setAxisAssignments: (assignments: Map<string, AxesAssignment>) => void
    /**
     * Retrieves the axis assigned to the specified series
     * @return The axes assigned to the specified series
     */
    axisAssignmentsFor: (seriesName: string) => AxesAssignment

    /*
     | TIMING
     */
    /**
     * Retrieves the time range for the specified axis ID
     * @param axisId The ID of the axis for which to retrieve the time-range
     * @return The time-range as a `[t_start, t_end]` tuple if the axis ID is found, `undefined` otherwise
     */
    timeRangeFor: (axisId: string) => [start: number, end: number] | undefined
    /**
     * Sets the time-range for the specified axis ID to the specified range
     * @param axisId The ID of the axis for which to set the range
     * @param timeRange The new time range as an `[t_start, t_end]` tuple
     */
    setTimeRangeFor: (axisId: string, timeRange: [start: number, end: number]) => void

    /*
     | DATA and DATA PROCESSING
     */
    /**
     * An array of time-series representing the initial data for the chart (i.e. static data
     * before streaming starts)
     */
    initialData: Array<Series>
    /**
     * An observable source for chart data
     */
    seriesObservable?: Observable<ChartData>
    /**
     * When `true` the chart will subscribe to the observable, or if already subscribed, will remain
     * subscribed. When `false` the chart will unsubscribe to the observable if subscribed, or will
     * remain unsubscribed if not already subscribed.
     */
    shouldSubscribe?: boolean
    /**
     * The windowing time for aggregating chart-data events. Defines the update rate of the chart.
     * For example if chart-data events occur every 1 ms, and the windowing time is set to 10 ms,
     * then events will be aggregated for 10 ms, and then the chart will be updated. In this example,
     * the chart would be updated only once per 10 ms.
     */
    windowingTime?: number

    /**
     * A regular expression uses against the series names to determine which series to show in the chart
     */
    seriesFilter: RegExp

    /*
     | USER CALLBACK FUNCTIONS
     */
    /**
     * Callback function that is called when the chart subscribes to the observable
     * @param subscription The subscription resulting form the subscribe action
     */
    onSubscribe: (subscription: Subscription) => void
    /**
     * Callback when the time range changes.
     * @param times The times (start, end) times for each axis in the plot
     * @return void
     */
    onUpdateTime?: (times: Map<string, [start: number, end: number]>) => void
    /**
     * Callback function that is called when new data arrives to the chart.
     * @param seriesName The name of the series for which new data arrived
     * @param data The new data that arrived in the windowing tine
     * @see UseChartValues.windowingTime
     */
    onUpdateData?: (seriesName: string, data: Array<Datum>) => void

    /*
     | INTERNAL CHART EVENT HANDLERS
     */
    /**
     * Callback function that is called when the time ranges change. The time ranges could
     * change because of a zoom action, a pan action, or as new data is streamed in.
     * @param times A `map(axis_id -> time_range)` that associates the axis ID with the
     * current time range.
     */
    updateTimeRanges: (times: Map<string, ContinuousAxisRange>) => void
    /**
     * Update the plot dimensions (for example, on a window resize)
     * @param dimensions the new dimensions of the plot
     */
    updateDimensions: (dimensions: Dimensions) => void
    /**
     * Adds a handler for when the time is updated. The time could change because of a zoom action,
     * a pan action, or as new data is streamed in.
     * @param handlerId The unique ID of the handler to register/add
     * @param handler The handler function
     */
    addTimeUpdateHandler: (handlerId: string, handler: (updates: Map<string, ContinuousAxisRange>, plotDim: Dimensions) => void) => void
    /**
     * Removes the time-update handler with the specified ID
     * @param handlerId The ID of the handler to remove
     */
    removeTimeUpdateHandler: (handlerId: string) => void

    /*
     | INTERNAL INTERACTION EVENT HANDLERS
     */
    /**
     * Adds a mouse-over-series handler with the specified ID and handler function
     * @param handlerId The handler ID
     * @param handler The handler function called when a mouse-over-series event occurs
     * @return The handler ID
     */
    registerMouseOverHandler: (
        handlerId: string,
        handler: (seriesName: string, time: number, series: TimeSeries, mouseCoords: [x: number, y: number]) => void
    ) => string
    /**
     * Removes the mouse-over-series handler with the specified ID
     * @param handlerId The ID of the handler to remove
     */
    unregisterMouseOverHandler: (handlerId: string) => void
    /**
     * Attempts to retrieve the mouse-over-series handler for the specified ID
     * @param handlerId The ID of the handler
     * @return The mouse-over-series handler for the ID, or `undefined` if not found
     */
    mouseOverHandlerFor: (handlerId: string) =>
        ((seriesName: string, time: number, series: TimeSeries, mouseCoords: [x: number, y: number]) => void) | undefined
    /**
     * Adds a mouse-leave-series handler with the specified ID and handler function
     * @param handlerId The handler ID
     * @param handler The handler function called when a mouse-leave-series event occurs
     * @return The handler ID
     */
    registerMouseLeaveHandler: (handlerId: string, handler: (seriesName: string) => void) => string
    /**
     * Removes the mouse-leave-series handler with the specified ID
     * @param handlerId The ID of the handler to remove
     */
    unregisterMouseLeaveHandler: (handlerId: string) => void
    /**
     * Attempts to retrieve the mouse-leave-series handler for the specified ID
     * @param handlerId The ID of the handler
     * @return The mouse-leave-series handler for the ID, or `undefined` if not found
     */
    mouseLeaveHandlerFor: (handlerId: string) => ((seriesName: string) => void) | undefined

    /**
     * Registers the provider of the tooltip content (generally this will be registered by the plot).
     * When this function is called again, overwrites the previously registered provider with the
     * one specified. This function can be called repeatedly.
     * @param provider The function that provides the content when called.
     */
    registerTooltipContentProvider: (
        provider: (
            seriesName: string,
            time: number,
            series: TimeSeries,
            mouseCoords: [x: number, y: number]
        ) => TooltipDimensions) => void
    /**
     * @return The registered function that provides the tooltip content. If no function has been
     * registered, then returns `undefined`.
     */
    tooltipContentProvider: () =>
        ((seriesName: string, time: number, series: TimeSeries, mouseCoords: [x: number, y: number]) => TooltipDimensions) |
        undefined
}

const defaultUseChartValues: UseChartValues = {
    chartId: NaN,
    container: null,
    mainG: null,
    plotDimensions: {width: 0, height: 0},
    margin: defaultMargin,
    color: '#d2933f',
    seriesStyles: new Map(),

    // axes
    xAxesState: createAxesState(),
    yAxesState: createAxesState(),
    addXAxis: noop,
    addYAxis: noop,
    setAxisAssignments: noop,
    axisAssignmentsFor: () => ({xAxis: "", yAxis: ""}),

    // timing
    timeRangeFor: () => [NaN, NaN],
    setTimeRangeFor: noop,

    // data
    initialData: [],
    seriesFilter: /./,
    windowingTime: NaN,
    shouldSubscribe: false,

    // user callbacks
    onSubscribe: noop,

    // internal event handlers
    updateTimeRanges: noop,
    updateDimensions: noop,
    addTimeUpdateHandler: () => noop,
    removeTimeUpdateHandler: () => noop,

    // internal chart-interaction event handlers
    registerMouseOverHandler: () => '',
    unregisterMouseOverHandler: noop,
    mouseOverHandlerFor: () => undefined,
    registerMouseLeaveHandler: () => '',
    unregisterMouseLeaveHandler: noop,
    mouseLeaveHandlerFor: () => undefined,

    registerTooltipContentProvider: noop,
    tooltipContentProvider: () => undefined
}

const ChartContext = createContext<UseChartValues>(defaultUseChartValues)

interface Props {
    chartId: number
    container: SVGSVGElement | null
    mainG: GSelection | null
    containerDimensions: Dimensions
    margin: Margin
    color: string
    seriesStyles?: Map<string, SeriesLineStyle>
    initialData: Array<Series>
    seriesFilter?: RegExp

    // live data
    seriesObservable?: Observable<ChartData>
    windowingTime?: number
    shouldSubscribe?: boolean

    /*
     | USER CALLBACK FUNCTIONS
     */
    /**
     * Callback function that is called when the chart subscribes to the observable
     * @param subscription The subscription resulting form the subscribe action
     */
    onSubscribe?: (subscription: Subscription) => void
    /**
     * Callback when the time range changes.
     * @param times The times (start, end) times for each axis in the plot
     * @return void
     */
    onUpdateTime?: (times: Map<string, [start: number, end: number]>) => void
    /**
     * Callback function that is called when new data arrives to the chart.
     * @param seriesName The name of the series for which new data arrived
     * @param data The new data that arrived in the windowing tine
     * @see UseChartValues.windowingTime
     */
    onUpdateData?: (seriesName: string, data: Array<Datum>) => void

    children: JSX.Element | Array<JSX.Element>
}

/**
 * The react context provider for the {@link UseChartValues}
 * @param props The properties
 * @return The children wrapped in this provider
 * @constructor
 */
export default function ChartProvider(props: Props): JSX.Element {
    const {
        chartId,
        container,
        mainG,
        containerDimensions,
        margin,
        color,
        initialData,
        seriesFilter = defaultUseChartValues.seriesFilter,
        seriesStyles = new Map(),

        seriesObservable,
        windowingTime = defaultUseChartValues.windowingTime || 100,
        shouldSubscribe,

        onSubscribe = noop,
        onUpdateTime = noop,
        onUpdateData = noop,
    } = props
    const [dimensions, setDimensions] = useState<Dimensions>(defaultUseChartValues.plotDimensions)

    const xAxesRef = useRef<AxesState>(createAxesState())
    const yAxesRef = useRef<AxesState>(createAxesState())
    const axisAssignmentsRef = useRef<Map<string, AxesAssignment>>(new Map())

    const timeRangesRef = useRef<Map<string, [start: number, end: number]>>(new Map())

    const timeUpdateHandlersRef = useRef<Map<string, (updates: Map<string, ContinuousAxisRange>, plotDim: Dimensions) => void>>(new Map())

    const mouseOverHandlersRef = useRef<Map<string, (seriesName: string, time: number, series: TimeSeries, mouseCoords: [x: number, y: number]) => void>>(new Map())
    const mouseLeaveHandlersRef = useRef<Map<string, (seriesName: string) => void>>(new Map())
    const tooltipContentProviderRef = useRef<((seriesName: string, time: number, series: TimeSeries, mouseCoords: [x: number, y: number]) => TooltipDimensions) | undefined>(undefined)

    // update the plot dimensions when the container size or margin change
    useEffect(
        () => {
            setDimensions(plotDimensionsFrom(containerDimensions.width, containerDimensions.height, margin))
        },
        [containerDimensions, margin]
    )

    /**
     * Called when the time is updated on one or more of the chart's axes (generally x-axes). In turn,
     * dispatches the update to all the internal time update handlers.
     * @param updates A map holding the axis ID to the updated axis time-range
     */
    function updateTimeRanges(updates: Map<string, ContinuousAxisRange>): void {
        // update the current time-ranges reference
        updates.forEach((range, id) =>
            timeRangesRef.current.set(id, [range.start, range.end])
        )
        // dispatch the updates to all the registered handlers
        timeUpdateHandlersRef.current.forEach((handler, ) => handler(updates, dimensions))
    }

    /**
     * Retrieves the x-axis and y-axis assignments for the specified series. If the axes does not have
     * an assignment, then is assumed to be using the default x- and y-axes.
     * @param seriesName The name of the series for which to retrieve the axes assignments
     * @return An {@link AxesAssignment} for the specified axes.
     */
    function axisAssignmentsFor(seriesName: string): AxesAssignment {
        return axisAssignmentsRef.current.get(seriesName) || {
            xAxis: xAxesRef.current.axisDefaultName(),
            yAxis: yAxesRef.current.axisDefaultName()
        }
    }

    return <ChartContext.Provider
        value={{
            chartId,
            plotDimensions: dimensions,
            margin,
            color,
            seriesStyles,
            initialData,
            seriesFilter,

            mainG, container,

            xAxesState: xAxesRef.current,
            yAxesState: yAxesRef.current,
            addXAxis: (axis, id) => xAxesRef.current = addAxisTo(xAxesRef.current, axis, id),
            addYAxis: (axis, id) => yAxesRef.current = addAxisTo(yAxesRef.current, axis, id),
            setAxisAssignments: assignments => axisAssignmentsRef.current = assignments,
            axisAssignmentsFor: seriesName => axisAssignmentsFor(seriesName),

            timeRangeFor: axisId => timeRangesRef.current.get(axisId),
            setTimeRangeFor: ((axisId, timeRange) => timeRangesRef.current.set(axisId, timeRange)),

            seriesObservable,
            windowingTime,
            shouldSubscribe,

            onSubscribe,
            onUpdateTime,
            onUpdateData,

            updateTimeRanges,
            updateDimensions: dimensions => setDimensions(dimensions),

            addTimeUpdateHandler: (handlerId, handler) => timeUpdateHandlersRef.current.set(handlerId, handler),
            removeTimeUpdateHandler: handlerId => timeUpdateHandlersRef.current.delete(handlerId),

            registerMouseOverHandler: (handlerId, handler) => {
                mouseOverHandlersRef.current.set(handlerId, handler)
                return handlerId
            },
            unregisterMouseOverHandler: handlerId => mouseOverHandlersRef.current.delete(handlerId),
            mouseOverHandlerFor: handlerId => mouseOverHandlersRef.current.get(handlerId),

            registerMouseLeaveHandler: (handlerId, handler) => {
                mouseLeaveHandlersRef.current.set(handlerId, handler)
                return handlerId
            },
            unregisterMouseLeaveHandler: handlerId => mouseLeaveHandlersRef.current.delete(handlerId),
            mouseLeaveHandlerFor: handlerId => mouseLeaveHandlersRef.current.get(handlerId),

            registerTooltipContentProvider: provider => tooltipContentProviderRef.current = provider,
            tooltipContentProvider: () => tooltipContentProviderRef.current,
        }}
    >
        {props.children}
    </ChartContext.Provider>
}

/**
 * React hook that sets up the react context for the chart values.
 * @return The {@link UseChartValues} held in the react context.
 */
export function useChart(): UseChartValues {
    const context = useContext<UseChartValues>(ChartContext)
    const {chartId} = context
    if (isNaN(chartId)) {
        throw new Error("useChart can only be used when the parent is a <ChartProvider/>")
    }
    return context
}