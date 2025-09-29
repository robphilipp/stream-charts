import React, {useCallback, useEffect, useMemo, useRef} from 'react'
import {NoTooltipMetadata, useChart} from "../hooks/useChart";
import {ContinuousAxisRange, continuousAxisRangeFor} from "../axes/continuousAxisRangeFor";
import * as d3 from "d3";
import {ZoomTransform} from "d3";
import {AxesAssignment, setClipPath, Series} from "./plot";
import {Datum, TimeSeries} from "../series/timeSeries";
import {
    axesForSeriesGen,
    BaseAxis,
    ContinuousNumericAxis,
    defaultLineStyle,
    panHandler,
    SeriesLineStyle,
    continuousAxisIntervals,
    continuousAxisRanges,
    axisZoomHandler
} from "../axes/axes";
import {GSelection} from "../d3types";
import {Observable, Subscription} from "rxjs";
import {noop} from "../utils";
import {Dimensions, Margin} from "../styling/margins";
import {
    subscriptionTimeSeriesFor,
    subscriptionTimeSeriesWithCadenceFor,
    TimeWindowBehavior
} from "../subscriptions/subscriptions";
import {useDataObservable} from "../hooks/useDataObservable";
import {TimeSeriesChartData} from "../series/timeSeriesChartData";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import {useInitialData} from "../hooks/useInitialData";
import {TooltipData} from "../hooks/useTooltip";

interface Props {
    /**
     * Holds the mapping between a series and the axis it uses (is assigned). The
     * map's key holds the series name, and the value is an {@link AxesAssignment}
     * object holding the ID of the assigned x-axis and y-axis.
     */
    axisAssignments?: Map<string, AxesAssignment>
    /**
     * The line interpolation curve factory. See the d3 documentation for curves at
     * {@link https://github.com/d3/d3-shape#curves} for information on available interpolations
     */
    interpolation?: d3.CurveFactory
    /**
     * The number of milliseconds of data to hold in memory before dropping it. Defaults to
     * infinity (i.e. no data is dropped)
     */
    dropDataAfter?: number
    /**
     * Enables panning (default is false)
     */
    panEnabled?: boolean
    /**
     * Enables zooming (default is false)
     */
    zoomEnabled?: boolean
    /**
     * When true, requires that the shift or control key be pressed while scrolling
     * in order to activate the zoom
     */
    zoomKeyModifiersRequired?: boolean
    /**
     * When set, uses a cadence with the specified refresh period (in milliseconds). For plots
     * where the updates are slow (> 100 ms) using a cadence of 10 to 25 ms smooths out the
     * updates and makes the plot updates look cleaner. When updates are around 25 ms or less,
     * then setting the cadence period too small will result in poor update performance. Generally
     * at high update speeds, the cadence is unnecessary. Finally, using cadence, sets the max time
     * to the current time.
     */
    withCadenceOf?: number
    timeWindowBehavior?: TimeWindowBehavior
    // initialTimes?: Map<string, number>
}

/**
 * Renders a streaming scatter plot for the series in the initial data and those sourced by the
 * observable specified as a property in the {@link Chart}. This component uses the {@link useChart}
 * hook, and therefore must be a child of the {@link Chart} in order to be plugged in to the
 * chart ecosystem (axes, tracker, tooltip).
 *
 * @param props The properties associated with the scatter plot
 * @constructor
 * @example
 <ScatterPlot
 interpolation={interpolation}
 axisAssignments={new Map([
 ['test2', assignAxes("x-axis-2", "y-axis-2")],
 ])}
 dropDataAfter={10000}
 panEnabled={true}
 zoomEnabled={true}
 zoomKeyModifiersRequired={true}
 />
 */
export function ScatterPlot(props: Props): null {
    const {
        chartId,
        container,
        mainG,
        axes,
        color,
        seriesStyles,
        seriesFilter,

        mouse
    } = useChart<Datum, SeriesLineStyle, NoTooltipMetadata>()

    const {
        initialData
    } = useInitialData<TimeSeriesChartData, Datum>()

    const {
        xAxesState,
        yAxesState,
        setAxisBoundsFor,
        updateAxesBounds = noop,
        onUpdateAxesBounds,
        originalAxisBounds
    } = axes

    const {mouseOverHandlerFor, mouseLeaveHandlerFor} = mouse

    const {plotDimensions, margin} = usePlotDimensions()

    const {
        seriesObservable,
        windowingTime = 100,
        shouldSubscribe,

        onSubscribe = noop,
        onUpdateData,
    } = useDataObservable()

    const {
        axisAssignments = new Map<string, AxesAssignment>(),
        interpolation = d3.curveLinear,
        dropDataAfter = Infinity,
        panEnabled = false,
        zoomEnabled = false,
        zoomKeyModifiersRequired = true,
        withCadenceOf,
        timeWindowBehavior = TimeWindowBehavior.SCROLL,
    } = props

    const initialTimes = useMemo(
        () => new Map<string, number>(
            Array.from(originalAxisBounds().entries())
                .map(([axisId, [start,]]) => ([axisId, start]))
        ),
        [originalAxisBounds]
    )

    // why do "dataRef" and "seriesRef" both hold on to the same underlying data? for performance.
    //
    // the "dataRef" and "seriesRef" both point to the same underlying data, a collection
    // of series. The series in "dataRef" are bound to the DOM elements through d3. The "seriesRef" series
    // are the ones that are updated as new data is streamed in.
    //
    // the "dataRef" object holds on to a copy of the initial data (which is an array of
    // time-series, e.i. an array of BaseSeries<OrdinalDatum> objects). The slice just creates a copy of
    // the array, but the references to the BaseSeries objects are the same and still point to the same
    // data as the "initialData" array.
    //
    // the "seriesRef" object is a reference to a map (series_name -> BaseSeries<OrdinalDatum>) which is
    // used to update the data in the series. When new data enters, it is appended to one or more series.
    //
    // the series in the "dataRef" object are the ones bound to the DOM elements in d3, and so as these
    // are updated, d3 will update the DOM elements (the elements in this plot).
    const dataRef = useRef<Array<TimeSeries>>(initialData.slice() as Array<TimeSeries>)
    const seriesRef = useRef<Map<string, TimeSeries>>(new Map(initialData.map(series => [series.name, series as TimeSeries])))
    // map(axis_id -> current_time) -- maps the axis ID to the current time for that axis
    const currentTimeRef = useRef<Map<string, number>>(new Map())

    const subscriptionRef = useRef<Subscription>(undefined)
    const isSubscriptionClosed = () => subscriptionRef.current === undefined || subscriptionRef.current.closed

    const allowTooltip = useRef<boolean>(isSubscriptionClosed())

    useEffect(
        () => {
            currentTimeRef.current = new Map(Array.from(xAxesState.axes.keys()).map(id => [id, 0]))
        },
        [xAxesState]
    )

    // calculates the distinct series IDs that cover all the series in the plot
    const axesForSeries = useMemo(
        (): Array<string> => axesForSeriesGen<Datum>(initialData, axisAssignments, xAxesState),
        [initialData, axisAssignments, xAxesState]
    )

    // updates the timing using the onUpdateTime and updatePlot references. This and the references
    // defined above allow the axes' times to be updated properly by avoid stale reference to these
    // functions.
    const updateTimingAndPlot = useCallback((ranges: Map<string, ContinuousAxisRange>): void => {
            if (mainG !== null) {
                onUpdateTimeRef.current(ranges)
                updatePlotRef.current(ranges, mainG)
                if (onUpdateAxesBounds) {
                    setTimeout(() => {
                        const times = new Map<string, [number, number]>()
                        ranges.forEach((range, name) => times.set(name, [range.start, range.end]))
                        onUpdateAxesBounds(times)
                    }, 0)
                }
            }
        },
        [mainG, onUpdateAxesBounds]
    )

    // todo find better way
    // when the initial data changes, then reset the plot. note that the initial data doesn't change
    // during the normal course of updates from the observable, only when the plot is restarted.
    useEffect(
        () => {
            dataRef.current = initialData.slice()
            seriesRef.current = new Map(initialData.map(series => [series.name, series as TimeSeries]))
            currentTimeRef.current = new Map(Array.from(xAxesState.axes.keys()).map(id => [id, 0]))
            updateTimingAndPlot(new Map(Array.from(continuousAxisRanges(xAxesState.axes as Map<string, ContinuousNumericAxis>).entries())
                    .map(([id, range]) => {
                        // grab the current range, then calculate the minimum time from the initial data, and
                        // set that as the start, and then add the range to it for the end time
                        const [start, end] = range.original
                        const minTime = initialData
                            .filter(srs => axisAssignments.get(srs.name)?.xAxis === id)
                            .reduce(
                                (tMin, series) => Math.min(
                                    tMin,
                                    !series.isEmpty() ? series.data[0].time : tMin
                                ),
                                Infinity
                            )
                        const startTime = minTime === Infinity ? 0 : minTime
                        return [id, continuousAxisRangeFor(startTime, startTime + end - start)]
                    })
                )
            )
        },
        // ** not happy about this **
        // only want this effect to run when the initial data is changed, which mean all the
        // other dependencies are recalculated anyway.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [initialData]
    )

    /**
     * Adjusts the time-range and updates the plot when the plot is dragged to the left or right
     * @param deltaX The amount that the plot is dragged
     * @param plotDimensions The dimensions of the plot
     * @param series An array of series names
     * @param ranges A map holding the axis ID and its associated time range
     */
    const onPan = useCallback(
        (x: number,
         plotDimensions: Dimensions,
         series: Array<string>,
         ranges: Map<string, ContinuousAxisRange>,
        ) => panHandler(axesForSeries, margin, setAxisBoundsFor, xAxesState)(x, plotDimensions, series, ranges),
        [axesForSeries, margin, setAxisBoundsFor, xAxesState]
    )

    /**
     * Called when the user uses the scroll wheel (or scroll gesture) to zoom in or out. Zooms in/out
     * at the location of the mouse when the scroll wheel or gesture was applied.
     * @param transform The d3 zoom transformation information
     * @param x The x-position of the mouse when the scroll wheel or gesture is used
     * @param plotDimensions The dimensions of the plot
     * @param series An array of series names
     * @param ranges A map holding the axis ID and its associated time-range
     */
    const onZoom = useCallback(
        (
            transform: ZoomTransform,
            x: number,
            plotDimensions: Dimensions,
            ranges: Map<string, ContinuousAxisRange>,
        ) => axisZoomHandler(axesForSeries, margin, setAxisBoundsFor, xAxesState)
        (transform, x, plotDimensions, ranges),
        [axesForSeries, margin, setAxisBoundsFor, xAxesState]
    )

    const updatePlot = useCallback(
        /**
         * Updates the plot data for the specified time-range, which may have changed due to zoom or pan
         * @param timeRanges The current time range
         * @param mainGElem The main <g> element selection for that holds the plot
         */
        (timeRanges: Map<string, ContinuousAxisRange>, mainGElem: GSelection) => {
            if (container) {
                // select the svg element bind the data to them
                const svg = d3.select<SVGSVGElement, any>(container)

                // create a map associating series-names to their time-series.
                //
                // performance-related confusion: wondering where the dataRef is updated? well it isn't
                // directly. The dataRef holds on to an array of references to the Series. And so does the
                // seriesRef, though is uses a map(series_name -> series). The seriesRef is use to append
                // data to the underlying Series, and the dataRef is used so that we can just use
                // dataRef.current and don't have to do Array.from(seriesRef.current.values()) which
                // creates a temporary array
                const boundedSeries = new Map(dataRef.current.map(series => [
                    series.name,
                    series.data
                ]))

                // set up panning
                if (panEnabled) {
                    const drag = d3.drag<SVGSVGElement, Datum>()
                        .on("start", () => {
                            d3.select(container).style("cursor", "move")
                            // during panning, we need to disable viewing the tooltip to prevent
                            // tooltips from rendering but not getting removed
                            allowTooltip.current = false;
                        })
                        .on("drag", (event) => {
                            onPan(
                                event.dx,
                                plotDimensions,
                                Array.from(boundedSeries.keys()),
                                timeRanges,
                            )
                            updatePlotRef.current(timeRanges, mainGElem)
                        })
                        .on("end", () => {
                            d3.select(container).style("cursor", "auto")
                            // during panning, we disabled viewing the tooltip to prevent
                            // tooltips from rendering but not getting removed, now that panning
                            // is over, allow tooltips to render again
                            allowTooltip.current = isSubscriptionClosed();
                        })

                    svg.call(drag)
                }

                // set up for zooming
                if (zoomEnabled) {
                    const zoom = d3.zoom<SVGSVGElement, Datum>()
                        .filter(event => !zoomKeyModifiersRequired || event.shiftKey || event.ctrlKey)
                        .scaleExtent([0, 10])
                        .translateExtent([[margin.left, margin.top], [plotDimensions.width, plotDimensions.height]])
                        .on("zoom", event => {
                                onZoom(
                                    event.transform,
                                    event.sourceEvent.offsetX - margin.left,
                                    plotDimensions,
                                    timeRanges,
                                )
                                updatePlotRef.current(timeRanges, mainGElem)
                            }
                        )

                    svg.call(zoom)
                }

                // define the clip-path so that the series lines don't go beyond the plot area
                const clipPathId = setClipPath(chartId, svg, plotDimensions, margin)

                boundedSeries.forEach((data, name) => {
                    // grab the x and y axes assigned to the series, and if either or both
                    // axes aren't found, then give up and return
                    const [xAxisLinear, yAxisLinear] = axesFor(name, axisAssignments, xAxesState.axisFor, yAxesState.axisFor)
                    if (xAxisLinear === undefined || yAxisLinear === undefined) return

                    // grab the style for the series
                    const {color, lineWidth} = seriesStyles.get(name) || {
                        ...defaultLineStyle(),
                        highlightColor: defaultLineStyle().color
                    }

                    // only show the data for which the filter matches
                    const plotData = (name.match(seriesFilter)) ? data : []

                    // create the time-series paths
                    mainGElem
                        .selectAll(`#${name}-${chartId}-scatter`)
                        .data([[], plotData], () => `${name}`)
                        .join(
                            enter => enter
                                .append("path")
                                .attr("class", 'time-series-lines')
                                .attr("id", `${name}-${chartId}-scatter`)
                                .attr(
                                    "d",
                                    d3.line<Datum>()
                                        .x((d: Datum) => xAxisLinear.scale(d.time) || 0)
                                        .y((d: Datum) => yAxisLinear.scale(d.value) || 0)
                                        .curve(interpolation)
                                )
                                .attr("fill", "none")
                                .attr("stroke", color)
                                .attr("stroke-width", lineWidth)
                                .attr('transform', `translate(${margin.left}, ${margin.top})`)
                                .attr("clip-path", `url(#${clipPathId})`)
                                .on(
                                    "mouseover",
                                    (event, datumArray) =>
                                        // recall that this handler is passed down via the "useChart" hook
                                        handleMouseOverSeries(
                                            container,
                                            xAxisLinear,
                                            name,
                                            datumArray,
                                            event,
                                            margin,
                                            seriesStyles,
                                            allowTooltip.current,
                                            mouseOverHandlerFor(`tooltip-${chartId}`)
                                        )
                                )
                                .on(
                                    "mouseleave",
                                    event => handleMouseLeaveSeries(
                                        name,
                                        event.currentTarget,
                                        seriesStyles,
                                        mouseLeaveHandlerFor(`tooltip-${chartId}`)
                                    )
                                ),
                            update => update,
                            exit => exit.remove()
                        )
                })
            }
        },
        [
            container, panEnabled, zoomEnabled, chartId, plotDimensions, margin, onPan,
            zoomKeyModifiersRequired, onZoom, axisAssignments, xAxesState.axisFor,
            yAxesState.axisFor, seriesStyles, seriesFilter, interpolation,
            mouseOverHandlerFor, mouseLeaveHandlerFor
        ]
    )

    // need to keep the function references for use by the subscription, which forms a closure
    // on them. without the references, the closures become stale, and resizing during streaming
    // doesn't work properly
    const updatePlotRef = useRef(updatePlot)
    useEffect(
        () => {
            updatePlotRef.current = updatePlot
        },
        [updatePlot]
    )
    const onUpdateTimeRef = useRef(updateAxesBounds)
    useEffect(
        () => {
            onUpdateTimeRef.current = updateAxesBounds
        },
        [updateAxesBounds]
    )

    // memoized function for subscribing to the chart-data observable
    const subscribe = useCallback(
        () => {
            if (seriesObservable === undefined || mainG === null) return undefined
            if (withCadenceOf !== undefined) {
                return subscriptionTimeSeriesWithCadenceFor(
                    seriesObservable as Observable<TimeSeriesChartData>,
                    onSubscribe,
                    windowingTime,
                    axisAssignments, xAxesState,
                    onUpdateData,
                    dropDataAfter,
                    updateTimingAndPlot,
                    // as new data flows into the subscription, the subscription
                    // updates this map directly (for performance)
                    seriesRef.current,
                    (axisId, end) => currentTimeRef.current.set(axisId, end),
                    withCadenceOf
                )
            }
            return subscriptionTimeSeriesFor(
                seriesObservable as Observable<TimeSeriesChartData>,
                onSubscribe,
                windowingTime,
                axisAssignments, xAxesState,
                onUpdateData,
                dropDataAfter,
                updateTimingAndPlot,
                // as new data flows into the subscription, the subscription
                // updates this map directly (for performance)
                seriesRef.current,
                (axisId, end) => currentTimeRef.current.set(axisId, end),
                timeWindowBehavior,
                initialTimes,
            )
        },
        [
            axisAssignments, dropDataAfter, mainG,
            onSubscribe, onUpdateData,
            seriesObservable, updateTimingAndPlot, windowingTime, xAxesState,
            withCadenceOf,
            initialTimes, timeWindowBehavior
        ]
    )

    const timeRangesRef = useRef<Map<string, ContinuousAxisRange>>(new Map())
    useEffect(
        () => {
            if (container && mainG) {
                // so this gets a bit complicated. the time-ranges need to be updated whenever the time-ranges
                // change. for example, as data is streamed in, the times change, and then we need to update the
                // time-range. however, we want to keep the time-ranges to reflect their original scale so that
                // we can zoom properly (so the updates can't fuck with the scale). At the same time, when the
                // interpolation changes, then the update plot changes, and the time-ranges must maintain their
                // original scale as well.
                if (timeRangesRef.current.size === 0) {
                    // when no time-ranges have yet been created, then create them and hold on to a mutable
                    // reference to them
                    timeRangesRef.current = continuousAxisRanges(xAxesState.axes as Map<string, ContinuousNumericAxis>)
                } else {
                    // when the time-ranges already exist, then we want to update the time-ranges for each
                    // existing time-range in a way that maintains the original scale.
                    const intervals = continuousAxisIntervals(xAxesState.axes as Map<string, ContinuousNumericAxis>)
                    timeRangesRef.current
                        .forEach((range, id, rangesMap) => {
                            const [start, end] = intervals.get(id) || [NaN, NaN]
                            if (!isNaN(start) && !isNaN(end)) {
                                // update the reference map with the new (start, end) portion of the range,
                                // while keeping the original scale intact
                                rangesMap.set(id, range.update(start, end))
                            }
                        })
                }
                updatePlot(timeRangesRef.current, mainG)
            }
        },
        [chartId, color, container, mainG, plotDimensions, updatePlot, xAxesState]
    )

    // subscribe/unsubscribe to the observable chart data. when the `shouldSubscribe`
    // is changed to `true` and we haven't subscribed yet, then subscribe. when the
    // `shouldSubscribe` is `false` and we had subscribed, then unsubscribe. otherwise,
    // do nothing.
    useEffect(
        () => {
            if (shouldSubscribe && subscriptionRef.current === undefined) {
                subscriptionRef.current = subscribe()
                allowTooltip.current = false
            } else if (!shouldSubscribe && subscriptionRef.current !== undefined) {
                subscriptionRef.current?.unsubscribe()
                subscriptionRef.current = undefined
                allowTooltip.current = true
            }
        },
        [shouldSubscribe, subscribe]
    )

    return null
}

/**
 * Attempts to locate the x- and y-axes for the specified series. If no axis is found for the
 * series name, then uses the default returned by the useChart() hook
 * @param seriesName Name of the series for which to retrieve the axis
 * @param axisAssignments A map holding the series name and the associated x- and y-axes assigned
 * to that series. Note that the series in the axis-assignment map is merely a subset of the set
 * of series names.
 * @param xAxisFor The function that accepts an axis ID and returns the corresponding x-axis
 * @param yAxisFor The function that accepts an axis ID and returns the corresponding y-axis
 */
function axesFor(
    seriesName: string,
    axisAssignments: Map<string, AxesAssignment>,
    xAxisFor: (id: string) => BaseAxis | undefined,
    yAxisFor: (id: string) => BaseAxis | undefined,
): [xAxis: ContinuousNumericAxis, yAxis: ContinuousNumericAxis] {
    const axes = axisAssignments.get(seriesName)
    const xAxis = xAxisFor(axes?.xAxis || "")
    const xAxisLinear = xAxis as ContinuousNumericAxis
    const yAxis = yAxisFor(axes?.yAxis || "")
    const yAxisLinear = yAxis as ContinuousNumericAxis
    if (xAxis && !xAxisLinear) {
        throw Error("Scatter plot requires that x-axis be of type LinearAxis")
    }
    if (yAxis && !yAxisLinear) {
        throw Error("Scatter plot requires that y-axis be of type LinearAxis")
    }
    return [xAxisLinear, yAxisLinear]
}

/**
 * Renders a tooltip showing the neuron, spike time, and the spike strength when the mouse hovers over a spike.
 * @param container The chart container
 * @param xAxis The x-axis
 * @param seriesName The name of the series (i.e. the neuron ID)
 * @param series The time series
 * @param event The mouse-over series event
 * @param margin The plot margin
 * @param seriesStyles The series style information (needed for (un)highlighting)
 * @param allowTooltip When set to `false` won't show tooltip, even if it is visible (used by pan)
 * @param mouseOverHandlerFor The handler for the mouse over (registered by the <Tooltip/>)
 */
function handleMouseOverSeries(
    container: SVGSVGElement,
    xAxis: ContinuousNumericAxis,
    seriesName: string,
    series: Series<Datum>,
    event: React.MouseEvent<SVGPathElement>,
    margin: Margin,
    seriesStyles: Map<string, SeriesLineStyle>,
    allowTooltip: boolean,
    mouseOverHandlerFor: ((seriesName: string, time: number, tooltipData: TooltipData<Datum, NoTooltipMetadata>, mouseCoords: [x: number, y: number]) => void) | undefined,
): void {
    // grab the time needed for the tooltip ID
    const [x, y] = d3.pointer(event, container)
    const time = Math.round(xAxis.scale.invert(x - margin.left))

    const {highlightColor, highlightWidth} = seriesStyles.get(seriesName) || defaultLineStyle()

    // Use d3 to select element, change color and size
    d3.select<SVGPathElement, Datum>(event.currentTarget)
        .attr('stroke', highlightColor)
        .attr('stroke-width', highlightWidth)

    if (mouseOverHandlerFor && allowTooltip) {
        mouseOverHandlerFor(seriesName, time, {series,  metadata: {}}, [x, y])
    }
}

/**
 * Unselects the time series and calls the mouse-leave-series handler registered for this series.
 * @param seriesName The name of the series (i.e. the neuron ID)
 * @param segment The SVG line element representing the spike, over which the mouse is hovering.
 * @param seriesStyles The styles for the series (for (un)highlighting)
 * @param mouseLeaverHandlerFor Registered handler for the series when the mouse leaves
 */
function handleMouseLeaveSeries(
    seriesName: string,
    segment: SVGPathElement,
    seriesStyles: Map<string, SeriesLineStyle>,
    mouseLeaverHandlerFor: ((seriesName: string) => void) | undefined,
): void {
    const {color, lineWidth} = seriesStyles.get(seriesName) || defaultLineStyle()
    d3.select<SVGPathElement, Datum>(segment)
        .attr('stroke', color)
        .attr('stroke-width', lineWidth)

    if (mouseLeaverHandlerFor) {
        mouseLeaverHandlerFor(seriesName)
    }
}
