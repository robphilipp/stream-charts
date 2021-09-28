import {AxesAssignment, setClipPath, TimeSeries} from "./plot";
import * as d3 from "d3";
import {ZoomTransform} from "d3";
import {noop} from "./utils";
import {useChart} from "./hooks/useChart";
import React, {useCallback, useEffect, useMemo, useRef} from "react";
import {Datum, PixelDatum, Series} from "./datumSeries";
import {ContinuousAxisRange, continuousAxisRangeFor} from "./continuousAxisRangeFor";
import {GSelection} from "./d3types";
import {
    axesForSeriesGen,
    BaseAxis,
    CategoryAxis,
    ContinuousNumericAxis,
    defaultLineStyle,
    panHandler,
    SeriesLineStyle,
    timeIntervals,
    timeRanges,
    zoomHandler
} from "./axes";
import {Subscription} from "rxjs";
import {Dimensions, Margin} from "./margins";
import {defaultTooltipStyle, TooltipStyle} from "./tooltipUtils";
import {subscriptionFor, subscriptionWithCadenceFor} from "./subscriptions";

interface Props {
    /**
     * Holds the mapping between a series and the axis it uses (is assigned). The
     * map's key holds the series name, and the value is an {@link AxesAssignment}
     * object holding the ID of the assigned x-axis and y-axis.
     */
    axisAssignments?: Map<string, AxesAssignment>
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
    /**
     * The (optional, default = 2 pixels) top and bottom margin (in pixels) for the spike lines in the plot.
     * Margins on individual series can also be set through the {@link Chart.seriesStyles} property.
     */
    spikeMargin?: number
}

export function RasterPlot(props: Props): null {
    const {
        chartId,
        container,
        mainG,
        xAxesState,
        yAxesState,
        setTimeRangeFor,
        plotDimensions,
        margin,
        color,
        seriesStyles,
        initialData,
        seriesFilter,

        setAxisAssignments,

        seriesObservable,
        windowingTime = 100,
        shouldSubscribe,

        onSubscribe = noop,
        onUpdateData = noop,
        onUpdateTime = noop,

        mouseOverHandlerFor,
        mouseLeaveHandlerFor,
    } = useChart()

    const {
        axisAssignments = new Map<string, AxesAssignment>(),
        dropDataAfter = Infinity,
        panEnabled = false,
        zoomEnabled = false,
        zoomKeyModifiersRequired = true,
        withCadenceOf,
        spikeMargin = 2,
    } = props

    // some 'splainin: the dataRef holds on to a copy of the initial data, but, the Series in the array
    // are by reference, so the seriesRef, also holds on to the same Series. When the Series in seriesRef
    // get appended with new data, it's updating the underlying series, and so the dataRef sees those
    // changes as well. The dataRef is used for performance, so that in the updatePlot function we don't
    // need to create a temporary array to holds the series data, rather, we can just use the one held in
    // the dataRef.
    const dataRef = useRef<Array<Series>>(initialData.slice())
    const seriesRef = useRef<Map<string, Series>>(new Map(initialData.map(series => [series.name, series])))
    // map(axis_id -> current_time) -- maps the axis ID to the current time for that axis
    const currentTimeRef = useRef<Map<string, number>>(new Map())

    useEffect(
        () => {
            currentTimeRef.current = new Map(Array.from(xAxesState.axes.keys()).map(id => [id, 0]))
        },
        [xAxesState]
    )

    // set the axis assignments needed if a tooltip is being used
    useEffect(
        () => {
            setAxisAssignments(axisAssignments)
        },
        [axisAssignments, setAxisAssignments]
    )

    // calculates the distinct series IDs that cover all the series in the plot
    const axesForSeries = useMemo(
        () => axesForSeriesGen(initialData, axisAssignments, xAxesState),
        [initialData, axisAssignments, xAxesState]
    )

    // updates the timing using the onUpdateTime and updatePlot references. This and the references
    // defined above allow the axes' times to be update properly by avoid stale reference to these
    // functions.
    const updateTimingAndPlot = useCallback((ranges: Map<string, ContinuousAxisRange>): void => {
            if (mainG !== null) {
                onUpdateTimeRef.current(ranges)
                updatePlotRef.current(ranges, mainG)
            }
        },
        [mainG]
    )

    // todo find better way
    // when the initial data changes, then reset the plot. note that the initial data doesn't change
    // during the normal course of updates from the observable, only when the plot is restarted.
    useEffect(
        () => {
            dataRef.current = initialData.slice()
            seriesRef.current = new Map(initialData.map(series => [series.name, series]))
            currentTimeRef.current = new Map(Array.from(xAxesState.axes.keys()).map(id => [id, 0]))
            updateTimingAndPlot(new Map(Array.from(timeRanges(xAxesState.axes as Map<string, ContinuousNumericAxis>).entries())
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
     * Calculates the upper and lower y-coordinate for the spike line
     * @param categorySize The size of the category (i.e. plot_height / num_series)
     * @param lineWidth The width of the series line
     * @param margin The margin applied to the top and bottom of the spike line (vertical spacing)
     * @return An object with two functions, that when handed a y-coordinate, return the location
     * for the start (yUpper) or end (yLower) of the spikes line.
     */
    function yCoordsFn(categorySize: number, lineWidth: number, margin: number):
        { yUpper: (y: number) => number, yLower: (y: number) => number } {
        if (categorySize <= margin) return {
            yUpper: y => y,
            yLower: y => y + lineWidth
        }
        return {
            yUpper: y => y + margin,
            yLower: y => y + categorySize - margin
        }
    }

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
         ranges: Map<string, ContinuousAxisRange>
        ) => panHandler(axesForSeries, margin, setTimeRangeFor, xAxesState)(x, plotDimensions, series, ranges),
        [axesForSeries, margin, setTimeRangeFor, xAxesState]
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
            series: Array<string>,
            ranges: Map<string, ContinuousAxisRange>,
        ) => zoomHandler(axesForSeries, margin, setTimeRangeFor, xAxesState)(transform, x, plotDimensions, series, ranges),
        [axesForSeries, margin, setTimeRangeFor, xAxesState]
    )

    /**
     * @param timeRanges
     * @param mainGElem
     */
    const updatePlot = useCallback(
        (timeRanges: Map<string, ContinuousAxisRange>, mainGElem: GSelection) => {
            if (container) {
                // select the svg element bind the data to them
                const svg = d3.select<SVGSVGElement, any>(container)

                // set up panning
                if (panEnabled) {
                    const drag = d3.drag<SVGSVGElement, Datum>()
                        .on("start", () => d3.select(container).style("cursor", "move"))
                        .on("drag", (event: any) => {
                            const names = dataRef.current.map(series => series.name)
                            onPan(event.dx, plotDimensions, names, timeRanges)
                            // need to update the plot with the new time-ranges
                            updatePlotRef.current(timeRanges, mainGElem)
                        })
                        .on("end", () => d3.select(container).style("cursor", "auto"))

                    svg.call(drag)
                }

                // set up for zooming
                if (zoomEnabled) {
                    const zoom = d3.zoom<SVGSVGElement, Datum>()
                        .filter((event: any) => !zoomKeyModifiersRequired || event.shiftKey || event.ctrlKey)
                        .scaleExtent([0, 10])
                        .translateExtent([[margin.left, margin.top], [plotDimensions.width, plotDimensions.height]])
                        .on("zoom", (event: any) => {
                                onZoom(
                                    event.transform,
                                    event.sourceEvent.offsetX - margin.left,
                                    plotDimensions,
                                    dataRef.current.map(series => series.name),
                                    timeRanges,
                                )
                                updatePlotRef.current(timeRanges, mainGElem)
                            }
                        )

                    svg.call(zoom)
                }

                // enter, update, delete the raster data
                dataRef.current.forEach(series => {
                    const [xAxis, yAxis] = axesFor(series.name, axisAssignments, xAxesState.axisFor, yAxesState.axisFor)

                    // grab the series styles, or the defaults if none exist
                    const {color, lineWidth, margin: spikeLineMargin = spikeMargin} = seriesStyles.get(series.name) || {
                        ...defaultLineStyle,
                        highlightColor: defaultLineStyle.color
                    }

                    // only show the data for which the regex filter matches
                    const plotData = (series.name.match(seriesFilter)) ? series.data : []

                    const seriesContainer = svg
                        .select<SVGGElement>(`#${series.name}-${chartId}-raster`)
                        .selectAll<SVGLineElement, PixelDatum>('line')
                        .data(plotData as PixelDatum[])

                    //
                    // enter new elements
                    const {yUpper, yLower} = yCoordsFn(yAxis.categorySize, lineWidth, spikeLineMargin)

                    // grab the value (index) associated with the series name (this is a category axis)
                    const y = yAxis.scale(series.name) || 0
                    // enter
                    seriesContainer
                        .enter()
                        .append<SVGLineElement>('line')
                        .attr('x1', datum => datum.x)
                        .attr('x2', datum => datum.x)
                        .attr('y1', _ => yUpper(y))
                        .attr('y2', _ => yLower(y))
                        .attr('stroke', color)
                        .attr('stroke-width', lineWidth)
                        .attr('class', 'spikes-lines')
                        .on(
                            "mouseover",
                            (event, datumArray) =>
                                handleMouseOverSeries(
                                    chartId,
                                    container,
                                    xAxis,
                                    series.name,
                                    [datumArray.time, datumArray.value],
                                    event,
                                    margin,
                                    defaultTooltipStyle,
                                    seriesStyles,
                                    plotDimensions,
                                    mouseOverHandlerFor(`tooltip-${chartId}`)
                                )
                        )
                        .on(
                            "mouseleave",
                            event => handleMouseLeaveSeries(
                                series.name,
                                event.currentTarget,
                                seriesStyles,
                                mouseLeaveHandlerFor(`tooltip-${chartId}`)
                            )
                        )
                        .each(datum => datum.x = xAxis.scale(datum.time))

                    // update
                    seriesContainer
                        .each(datum => datum.x = xAxis.scale(datum.time))
                        .attr('x1', datum => datum.x)
                        .attr('x2', datum => datum.x)
                        .attr('y1', _ => yUpper(y))
                        .attr('y2', _ => yLower(y))
                        .attr('stroke', color)

                    // exit old elements
                    seriesContainer.exit().remove()
                })
            }
        },
        [
            axisAssignments, chartId, container, margin,
            mouseLeaveHandlerFor, mouseOverHandlerFor, onPan, onZoom,
            panEnabled,
            plotDimensions,
            seriesFilter, seriesStyles,
            xAxesState.axisFor, yAxesState.axisFor,
            zoomEnabled, zoomKeyModifiersRequired,
            spikeMargin
        ]
    )

    // need to keep the function references for use by the subscription, which forms a closure
    // on them. without the references, the closures become stale, and resizing during streaming
    // doesn't work properly
    const updatePlotRef = useRef<(r: Map<string, ContinuousAxisRange>, g: GSelection) => void>(noop)
    useEffect(
        () => {
            if (mainG !== null && container !== null) {
                // when the update plot function doesn't yet exist, then create the container holding the plot
                if (updatePlotRef.current === noop) {
                    const svg = d3.select<SVGSVGElement, any>(container)
                    const clipPathId = setClipPath(chartId, svg, plotDimensions, margin)
                    mainG
                        .selectAll<SVGGElement, Series>('g')
                        .data<Series>(dataRef.current)
                        .enter()
                        .append('g')
                        .attr('class', 'spikes-series')
                        .attr('id', series => `${series.name}-${chartId}-raster`)
                        .attr('transform', `translate(${margin.left}, ${margin.top})`)
                        .attr("clip-path", `url(#${clipPathId})`)

                }
                updatePlotRef.current = updatePlot
            }
        },
        [chartId, container, mainG, margin, plotDimensions, updatePlot]
    )

    const onUpdateTimeRef = useRef(onUpdateTime)
    useEffect(
        () => {
            onUpdateTimeRef.current = onUpdateTime
        },
        [onUpdateTime]
    )

    // memoized function for subscribing to the chart-data observable
    const subscribe = useCallback(
        () => {
            if (seriesObservable === undefined || mainG === null) return undefined
            if (withCadenceOf !== undefined) {
                return subscriptionWithCadenceFor(
                    seriesObservable,
                    onSubscribe,
                    windowingTime,
                    axisAssignments, xAxesState,
                    onUpdateData,
                    dropDataAfter,
                    updateTimingAndPlot,
                    seriesRef.current,
                    (axisId, end) => currentTimeRef.current.set(axisId, end),
                    withCadenceOf
                )
            }
            return subscriptionFor(
                seriesObservable,
                onSubscribe,
                windowingTime,
                axisAssignments, xAxesState,
                onUpdateData,
                dropDataAfter,
                updateTimingAndPlot,
                seriesRef.current,
                (axisId, end) => currentTimeRef.current.set(axisId, end)
            )
        },
        [
            axisAssignments, dropDataAfter, mainG,
            onSubscribe, onUpdateData,
            seriesObservable, updateTimingAndPlot, windowingTime, xAxesState,
            withCadenceOf
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
                    timeRangesRef.current = timeRanges(xAxesState.axes as Map<string, ContinuousNumericAxis>)
                } else {
                    // when the time-ranges already exist, then we want to update the time-ranges for each
                    // existing time-range in a way that maintains the original scale.
                    const intervals = timeIntervals(xAxesState.axes as Map<string, ContinuousNumericAxis>)
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
    const subscriptionRef = useRef<Subscription>()
    useEffect(
        () => {
            if (shouldSubscribe && subscriptionRef.current === undefined) {
                subscriptionRef.current = subscribe()
            } else if (!shouldSubscribe && subscriptionRef.current !== undefined) {
                subscriptionRef.current?.unsubscribe()
                subscriptionRef.current = undefined
            }
        },
        [shouldSubscribe, subscribe]
    )

    return null
}

/**
 * Attempts to locate the x- and y-axes for the specified series. If no axis is found for the
 * series name, then uses the default returned by the useChart() hook.
 * @param seriesName Name of the series for which to retrieve the axis
 * @param axisAssignments A map holding the series name and the associated x- and y-axes assigned
 * to that series. Note that the series in the axis-assignment map is merely a subset of the set
 * of series names.
 * @param xAxisFor The function that accepts an axis ID and returns the corresponding x-axis
 * @param yAxisFor The function that accepts an axis ID and returns the corresponding y-axis
 * @return A 2d tuple holding the linear x-axis as its first element and the category y-axis as
 * the second element.
 */
function axesFor(
    seriesName: string,
    axisAssignments: Map<string, AxesAssignment>,
    xAxisFor: (id: string) => BaseAxis | undefined,
    yAxisFor: (id: string) => BaseAxis | undefined,
): [xAxis: ContinuousNumericAxis, yAxis: CategoryAxis] {
    const axes = axisAssignments.get(seriesName)
    const xAxis = xAxisFor(axes?.xAxis || "")
    const xAxisLinear = xAxis as ContinuousNumericAxis
    if (xAxis && !xAxisLinear) {
        throw Error("Raster plot requires that x-axis be of type LinearAxis")
    }
    const yAxis = yAxisFor(axes?.yAxis || "")
    const yAxisCategory = yAxis as CategoryAxis
    if (yAxis && !yAxisCategory) {
        throw Error("Raster plot requires that y-axis be of type CategoryAxis")
    }
    return [xAxisLinear, yAxisCategory]
}

/**
 * Renders a tooltip showing the neuron, spike time, and the spike strength when the mouse hovers over a spike.
 * @param chartId The ID of the chart
 * @param container The chart container
 * @param xAxis The x-axis
 * @param seriesName The name of the series (i.e. the neuron ID)
 * @param selectedDatum The selected datum
 * @param event The mouse-over series event
 * @param margin The plot margin
 * @param tooltipStyle The tooltip style information
 * @param seriesStyles The series style information (needed for (un)highlighting)
 * @param plotDimensions The dimensions of the plot
 * @param mouseOverHandlerFor The handler for the mouse over (registered by the <Tooltip/>)
 */
function handleMouseOverSeries(
    chartId: number,
    container: SVGSVGElement,
    xAxis: ContinuousNumericAxis,
    seriesName: string,
    selectedDatum: [x: number, y: number],
    event: React.MouseEvent<SVGPathElement>,
    margin: Margin,
    tooltipStyle: TooltipStyle,
    seriesStyles: Map<string, SeriesLineStyle>,
    plotDimensions: Dimensions,
    mouseOverHandlerFor: ((seriesName: string, time: number, series: TimeSeries, mouseCoords: [x: number, y: number]) => void) | undefined,
): void {
    // grab the time needed for the tooltip ID
    const [x, y] = d3.pointer(event, container)
    const time = Math.round(xAxis.scale.invert(x - margin.left))

    const {highlightColor, highlightWidth} = seriesStyles.get(seriesName) || defaultLineStyle

    // Use d3 to select element, change color and size
    d3.select<SVGPathElement, Datum>(event.currentTarget)
        .attr('stroke', highlightColor)
        .attr('stroke-width', highlightWidth)

    if (mouseOverHandlerFor) {
        // the contract for the mouse over handler is for a time-series, but here we only
        // need one point, the selected datum, and so we convert it into an array of point
        // (i.e. a time-series). The category tooltip is (and custom ones, must) be
        // written to expect only the selected point
        mouseOverHandlerFor(seriesName, time, [selectedDatum], [x, y])
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
    const {color, lineWidth} = seriesStyles.get(seriesName) || defaultLineStyle
    d3.select<SVGPathElement, Datum>(segment)
        .attr('stroke', color)
        .attr('stroke-width', lineWidth)

    if (mouseLeaverHandlerFor) {
        mouseLeaverHandlerFor(seriesName)
    }
}
