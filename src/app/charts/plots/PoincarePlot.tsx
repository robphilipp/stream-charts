import React, {useCallback, useEffect, useMemo, useRef} from 'react'
import {NoTooltipMetadata, useChart} from "../hooks/useChart";
import {ContinuousAxisRange, continuousAxisRangeFor} from "../axes/continuousAxisRangeFor";
import * as d3 from "d3";
import {CurveFactory, ZoomTransform} from "d3";
import {setClipPath} from "./plot";
import {Datum} from "../series/timeSeries";
import {
    axesZoomHandler,
    BaseAxis,
    ContinuousNumericAxis,
    defaultLineStyle,
    panHandler2D,
    SeriesLineStyle
} from "../axes/axes";
import {GSelection} from "../d3types";
import {Observable, Subscription} from "rxjs";
import {formatTime, noop, textDimensions} from "../utils";
import {Dimensions, Margin} from "../styling/margins";
import {subscriptionIteratesFor} from "../subscriptions/subscriptions";
import {useDataObservable} from "../hooks/useDataObservable";
import {IterateChartData} from "../observables/iterates";
import {IterateDatum, IterateSeries} from "../series/iterateSeries";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import {useInitialData} from "../hooks/useInitialData";
import {TooltipData, useTooltip} from "../hooks/useTooltip";
import {TimeSeriesChartData} from "../series/timeSeriesChartData";

type IteratePoint = { n: number, n_1: number, time: number, index: number }
type IteratePointSeries = Array<IteratePoint>

function generateAxisRangeMap(axes: Map<string, BaseAxis>): Map<string, ContinuousAxisRange> {
    return new Map(
        Array.from(axes.entries()).map(([id, axis]) => {
            const [start, end] = (axis as ContinuousNumericAxis).scale.domain()
            return [id, continuousAxisRangeFor(start, end)]
        })
    )
}

// A sentinel that represents that no curve factory is to be used, which means
// that no line will be drawn between the iterates (kinda gross)
export const NoCurveFactory: CurveFactory = undefined as unknown as CurveFactory;

interface Props {
    /**
     * The line interpolation curve factory. See the d3 documentation for curves at
     * {@link https://github.com/d3/d3-shape#curves} for information on available interpolations
     */
    interpolation?: d3.CurveFactory
    /**
     * When set to `true` plots the data points as well as the line.
     */
    showPoints?: boolean
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
     * The smallest scale factor allowed for zooming (in). For example, a setting of 0.5 means
     * that the largest zoom amount is 2 times the current size, or put another way, an interval
     * of length 1 unit covers twice as may pixels after the zoom. Effectively, the smaller this
     * factor, the more the user can "zoom in". Default value is 0.0.
     */
    zoomMinScaleFactor?: number
    /**
     * The largest scale factor allowed for zooming (out). For example, a setting of 2.0 means
     * that at this value, the length of 1 unit covers 1/2 the number of pixels. Effectively,
     * the larger this factor, the more the user can "zoom out". Default value is 1.0.
     */
    zoomMaxScaleFactor?: number
    /**
     * When set, uses a cadence with the specified refresh period (in milliseconds). For plots
     * where the updates are slow (> 100 ms) using a cadence of 10 to 25 ms smooths out the
     * updates and makes the plot updates look cleaner. When updates are around 25 ms or less,
     * then setting the cadence period too small will result in poor update performance. Generally
     * at high update speeds, the cadence is unnecessary. Finally, using cadence, sets the max time
     * to the current time.
     */
    withCadenceOf?: number
}

/**
 * Renders a streaming Poincare (iterates) plot for the series in the initial data and those sourced by the
 * observable specified as a property in the {@link Chart}. This component uses the {@link useChart}
 * hook, and therefore must be a child of the {@link Chart} in order to be plugged in to the
 * chart ecosystem (axes, tracker, tooltip).
 *
 * @param props The properties associated with the scatter plot
 * @constructor
 * @example
 * ```typescript
 *  <ScatterPlot
 *      interpolation={interpolation}
 *      axisAssignments={new Map([
 *          ['test2', assignAxes("x-axis-2", "y-axis-2")],
 *      ])}
 *      dropDataAfter={10000}
 *      panEnabled={true}
 *      zoomEnabled={true}
 *      zoomKeyModifiersRequired={true}
 *  />
 * ```
 */
export function PoincarePlot(props: Props): null {
    const {
        chartId,
        container,
        mainG,
        axes,
        backgroundColor,
        seriesStyles,
        seriesFilter,

        mouse
    } = useChart<IterateDatum, SeriesLineStyle, NoTooltipMetadata>()

    const {
        xAxesState,
        yAxesState,
        setAxisBoundsFor,
        updateAxesBounds = noop,
        axisBoundsFor,
        addAxesBoundsUpdateHandler,
        removeAxesBoundsUpdateHandler,
    } = axes

    const {
        mouseOverHandlerFor,
        mouseLeaveHandlerFor
    } = mouse

    const {
        plotDimensions,
        margin,
    } = usePlotDimensions()

    const {
        seriesObservable,
        windowingTime = 100,
        shouldSubscribe,

        onSubscribe = noop,
        onUpdateData,
        onUpdateChartTime = noop,
    } = useDataObservable<IterateChartData, IterateDatum>()

    const {initialData} = useInitialData<TimeSeriesChartData, IterateDatum>()

    const {visibilityState: tooltipVisible} = useTooltip()

    const {
        interpolation,
        showPoints = true,
        dropDataAfter = 1000,
        panEnabled = false,
        zoomEnabled = false,
        zoomKeyModifiersRequired = true,
        zoomMinScaleFactor = 0,
        zoomMaxScaleFactor = 1,
    } = props

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
    const dataRef = useRef<Array<IterateSeries>>(initialData.slice() as Array<IterateSeries>)
    const seriesRef = useRef<Map<string, IterateSeries>>(new Map(initialData.map(series => [series.name, series as IterateSeries])))
    // map(axis_id -> current_time) -- maps the axis ID to the current time for that axis
    const currentTimeRef = useRef<number>(0)
    const xAxisRangesRef = useRef<Map<string, ContinuousAxisRange>>(new Map());
    const yAxisRangesRef = useRef<Map<string, ContinuousAxisRange>>(new Map());

    const subscriptionRef = useRef<Subscription>(undefined)
    const isSubscriptionClosed = () => subscriptionRef.current === undefined || subscriptionRef.current.closed

    const allowTooltip = useRef<boolean>(isSubscriptionClosed())

    // so that we can reset the zoom when the axes-bounds change, we hold on to the zoom-behaviour
    // and the zoom-selection so that we can reset the transform to the identity
    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, Datum>>(undefined)
    const zoomSelectionRef = useRef<d3.Selection<SVGSVGElement, any, null, undefined>>(undefined)

    // calculates the distinct axis IDs that cover all the series in the plot
    const xAxesForSeries = useMemo(
        (): Array<string> => xAxesState.axisIds(),
        [xAxesState]
    )
    const yAxesForSeries = useMemo(
        (): Array<string> => yAxesState.axisIds(),
        [yAxesState]
    )

    // when the axes are available, then set the reference, but only once
    useEffect(() => {
        if (xAxesState.axes.size > 0 && xAxisRangesRef.current.size === 0) {
            xAxisRangesRef.current = generateAxisRangeMap(xAxesState.axes)
        }
        if (yAxesState.axes.size > 0 && yAxisRangesRef.current.size === 0) {
            yAxisRangesRef.current = generateAxisRangeMap(yAxesState.axes)
        }
    }, [xAxesState, yAxesState]);

    // update the plot with the new axes bounds
    const updateRangesAndPlot = useCallback(
        (): void => {
            if (mainG !== null) {
                updatePlotRef.current(mainG)
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
            currentTimeRef.current = 0

            updateRangesAndPlot()
        },
        [initialData, updateRangesAndPlot]
    )

    /**
     * When the axes bounds have changed, we need to reset the range references so that
     * the new axis ranges are used
     * @param updates The updates to the axes
     */
    const updatedBoundsHandler = useCallback(
        (updates: Map<string, ContinuousAxisRange>): void => {
            updates.forEach((update, axisId) => {
                if (xAxisRangesRef.current.has(axisId)) {
                    xAxisRangesRef.current.set(axisId, update)
                }
                if (yAxisRangesRef.current.has(axisId)) {
                    yAxisRangesRef.current.set(axisId, update)
                }
            })
            if (zoomEnabled && zoomSelectionRef.current !== undefined && zoomRef.current !== undefined) {
                zoomSelectionRef.current.call(zoomRef.current.transform, d3.zoomIdentity)
            }
        },
        [zoomEnabled]
    )

    // strange construct so that we only add the update handler when the chart ID
    // changes, and not when the addAxesBoundsUpdateHandler or removeAxesBoundsUpdateHandler
    // which they do, and that breaks the updates...someone, please teach me react
    //
    // the update handler is needed so that when the axes bounds are changed (say to accommodate a
    // different iterate function's domain/range), then the handler needs to update the x and y
    // axes range refs
    const addAxesBoundsUpdateHandlerRef = useRef(addAxesBoundsUpdateHandler)
    const removeAxesBoundsUpdateHandlerRef = useRef(removeAxesBoundsUpdateHandler)
    useEffect(
        () => {
            addAxesBoundsUpdateHandlerRef.current(`handler-${chartId}`, updatedBoundsHandler)
            const removeHandler = removeAxesBoundsUpdateHandlerRef.current
            return () => {
                // closure on the function to remove the handler from this chart
                removeHandler(`handler-${chartId}`)
            }
        },
        [chartId, updatedBoundsHandler]
    );

    /**
     * Adjusts the time-range and updates the plot when the plot is dragged to the left or right
     * @param x The amount that the plot is dragged
     * @param plotDimensions The dimensions of the plot
     * @param series An array of series names
     * @param ranges A map holding the axis ID and its associated time range
     */
    const onPan = useCallback(
        (
            x: number,
            y: number,
            plotDimensions: Dimensions,
            series: Array<string>,
            xRanges: Map<string, ContinuousAxisRange>,
            yRanges: Map<string, ContinuousAxisRange>,
        ) => panHandler2D(
            xAxesForSeries, yAxesForSeries,
            margin,
            setAxisBoundsFor,
            xAxesState, yAxesState
        )(x, y, plotDimensions, series, xRanges, yRanges),
        [xAxesForSeries, yAxesForSeries, margin, setAxisBoundsFor, xAxesState, yAxesState]
    )

    /**
     * Called when the user uses the scroll wheel (or scroll gesture) to zoom in or out. Zooms in/out
     * at the location of the mouse when the scroll wheel or gesture was applied. Unlike time-series
     * plots, the iterates plot zooms the x- and y-axis at the same rate.
     * @param transform The d3 zoom transformation information
     * @param x The x-position of the mouse when the scroll wheel or gesture is used
     * @param y The y-position of the mouse when the scroll wheel or gesture is used
     * @param plotDimensions The dimensions of the plot
     * @param series An array of series names
     * @param ranges A map holding the axis ID and its associated time-range
     */
    const onZoom = useCallback(
        (
            transform: ZoomTransform,
            x: number,
            y: number,
            plotDimensions: Dimensions,
            xRanges: Map<string, ContinuousAxisRange>,
            yRanges: Map<string, ContinuousAxisRange>
        ) => axesZoomHandler(
            xAxesForSeries, yAxesForSeries, margin, setAxisBoundsFor, xAxesState, yAxesState, [zoomMinScaleFactor, zoomMaxScaleFactor]
        )(transform, [x, y], plotDimensions, xRanges, yRanges),
        [xAxesForSeries, yAxesForSeries, margin, setAxisBoundsFor, xAxesState, yAxesState, zoomMinScaleFactor, zoomMaxScaleFactor]
    )

    const updatePlot = useCallback(
        /**
         * Updates the plot data for the specified time-range, which may have changed due to zoom or pan
         * @param mainGElem The main <g> element selection for that holds the plot
         */
        (mainGElem: GSelection) => {
            if (container) {
                onUpdateChartTime(currentTimeRef.current)

                // select the svg element bind the data to them
                const svg = d3.select<SVGSVGElement, any>(container)

                // create a map associating series-names to their time-series.
                //
                // performance-related confusion: wondering where the dataRef is updated? well it isn't
                // directly. The dataRef holds on to an array of references to the Series. And so does the
                // seriesRef, though it uses a map(series_name -> series). The seriesRef is used to append
                // data to the underlying Series, and the dataRef is used so that we can just use
                // dataRef.current and don't have to do Array.from(seriesRef.current.values()) which
                // creates a temporary array
                // const offset = 1
                const boundedSeries = new Map<string, IteratePointSeries>(dataRef.current.map(series => {
                    return [
                        series.name,
                        series.data
                            .filter(datum => !isNaN(datum.iterateN))
                            .map((datum, index) => ({
                                    n: datum.iterateN,
                                    n_1: datum.iterateN_1,
                                    time: datum.time,
                                    index: index
                                })
                            ) as IteratePointSeries
                    ]
                }))

                // set up panning
                if (panEnabled) {
                    const drag = d3.drag<SVGSVGElement, Datum>()
                        .on("start", () => {
                            d3.select(container).style("cursor", "move")
                            // during panning, we need to disable viewing the tooltip to prevent
                            // tooltips from rendering but not getting removed
                            allowTooltip.current = false;
                        })
                        .on("drag", event => {
                            onPan(
                                event.dx,
                                event.dy,
                                plotDimensions,
                                Array.from(boundedSeries.keys()),
                                xAxisRangesRef.current,
                                yAxisRangesRef.current
                            )
                            updatePlotRef.current(mainGElem)
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
                    zoomRef.current = d3.zoom<SVGSVGElement, Datum>()
                        .filter(event => !zoomKeyModifiersRequired || event.shiftKey || event.ctrlKey)
                        .scaleExtent([zoomMinScaleFactor, zoomMaxScaleFactor])
                        .translateExtent([[margin.left, margin.top], [plotDimensions.width, plotDimensions.height]])
                        .on("zoom", event => {
                                allowTooltip.current = false
                                if (event.sourceEvent !== null) {
                                    onZoom(
                                        event.transform,
                                        event.sourceEvent.offsetX - margin.left,
                                        event.sourceEvent.offsetY - margin.top,
                                        plotDimensions,
                                        xAxisRangesRef.current,
                                        yAxisRangesRef.current
                                    )
                                    updatePlotRef.current(mainGElem)
                                }
                                allowTooltip.current = true
                            }
                        )

                    zoomSelectionRef.current = svg.call(zoomRef.current)
                }

                // define the clip-path so that the series lines don't go beyond the plot area
                const clipPathId = setClipPath(chartId, svg, plotDimensions, margin)

                // ---
                // todo only want to do this once, on the first plot, and then leave it,
                //     unless the axes are updated, also needs to be removed/added when the
                //     plot size changes
                const xAxis = xAxesState.defaultAxis() as ContinuousNumericAxis
                const yAxis = yAxesState.defaultAxis() as ContinuousNumericAxis

                const lineGenerator = d3.line<[x: number, y: number]>()
                    .x(d => xAxis.scale(d[0] || 0))
                    .y(d => yAxis.scale(d[1] || 0))
                // ---

                const [xStart, xEnd] = xAxisRangesRef.current.get(xAxesState.axisDefaultId())?.original || [0, 0]
                const [yStart, yEnd] = yAxisRangesRef.current.get(yAxesState.axisDefaultId())?.original || [0, 0]

                mainGElem
                    .selectAll(`#fn-equals-fn1-${chartId}-poincare`)
                    .data([[[xStart, yStart], [xEnd, yEnd]] as Array<[x: number, y: number]>])
                    .join(enter => enter
                            .select("path")
                            .style("stroke", "grey")
                            .style("fill", "none")
                            .style("stroke-width", "1px")
                            .attr("class", `fn-equals-fn1-poincare`)
                            .attr("id", `#fn-equals-fn1-${chartId}-poincare`)
                            .attr('transform', `translate(${margin.left}, ${margin.top})`)
                            .attr("d", lineGenerator),
                        update => update.remove(),
                        exit => exit.remove()
                    )
                    // clear out mouse-enter callbacks for the diagonal line
                    .on("mouseenter", () => {
                    })
                    .on("mouseleave", () => {
                    })

                boundedSeries.forEach((data, name) => {
                    // grab the x and y axes assigned to the series, and if either or both
                    // axes aren't found, then give up and return
                    const [xAxisLinear, yAxisLinear] = axesFor(xAxesState.axisFor, yAxesState.axisFor)
                    if (xAxisLinear === undefined || yAxisLinear === undefined) return

                    // grab the style for the series
                    const seriesLineStyle: SeriesLineStyle = seriesStyles.get(name) || {
                        ...defaultLineStyle(),
                        highlightColor: defaultLineStyle().color
                    }

                    // only show the data for which the filter matches
                    const plotData = (name.match(seriesFilter)) ? data : []

                    // // when specified, show a circle for the actual data point
                    // if (showPoints) {
                    //     mainGElem
                    //         .selectAll(`.${name}-${chartId}-poincare-points`)
                    //         .data(plotData, () => `${name}`)
                    //         .join(
                    //             enter => enter
                    //                 .append("circle")
                    //                 .attr("class", `${name}-${chartId}-poincare-points`)
                    //                 .attr("id", (_, index) => `${name}-${chartId}-poincare-point-${index}`)
                    //                 .attr("fill", seriesLineStyle.color)
                    //                 .attr("stroke", "none")
                    //                 .attr("cx", (d: IteratePoint) => xAxisLinear.scale(d.n) || 0)
                    //                 .attr("cy", (d: IteratePoint) => yAxisLinear.scale(d.n_1) || 0)
                    //                 .attr("r", 2)
                    //                 .attr('transform', `translate(${margin.left}, ${margin.top})`)
                    //                 .attr("clip-path", `url(#${clipPathId})`)
                    //             ,
                    //             update => update
                    //                 .attr("cx", (d: IteratePoint) => xAxisLinear.scale(d.n) || 0)
                    //                 .attr("cy", (d: IteratePoint) => yAxisLinear.scale(d.n_1) || 0)
                    //             ,
                    //             exit => exit.remove()
                    //         )
                    //         .on("mouseenter",
                    //             (event: React.MouseEvent<SVGCircleElement>, datum: IteratePoint) => {
                    //                 if (allowTooltip.current && tooltipVisible) {
                    //                     return handleMouseEnterPoint(
                    //                         chartId,
                    //                         name,
                    //                         container,
                    //                         event,
                    //                         datum,
                    //                         plotData,
                    //                         xAxisLinear,
                    //                         yAxisLinear,
                    //                         margin,
                    //                         seriesLineStyle,
                    //                         backgroundColor,
                    //                         allowTooltip.current,
                    //                         mouseOverHandlerFor(`tooltip-${chartId}`)
                    //                     )
                    //                 }
                    //                 return <></>
                    //             }
                    //         )
                    //         .on("mouseleave", () => {
                    //             handleMouseLeavePoint(
                    //                 chartId,
                    //                 name,
                    //                 seriesLineStyle.color,
                    //                 mouseLeaveHandlerFor(`tooltip-${chartId}`)
                    //             )
                    //         })
                    // }
                    //
                    const pathGenerator = d3.line<IteratePoint>()
                        .x(d => xAxis.scale(d.n || 0))
                        .y(d => yAxis.scale(d.n_1 || 0))

                    if (interpolation === undefined) {
                        mainGElem
                            .selectAll(`#${name}-${chartId}-poincare`)
                            .remove()
                    } else {
                        // create the time-series paths
                        mainGElem
                            .selectAll(`#${name}-${chartId}-poincare`)
                            .data([[], plotData], () => `${name}`)
                            .join(
                                enter => enter
                                    .append("path")
                                    .attr("class", 'iterate-series-lines')
                                    .attr("id", `${name}-${chartId}-poincare`)
                                    .attr("d", pathGenerator.curve(interpolation))
                                    .style("fill", "none")
                                    .style("stroke", seriesLineStyle.color)
                                    .style("stroke-width", seriesLineStyle.lineWidth)
                                    .attr('transform', `translate(${margin.left}, ${margin.top})`)
                                    .attr("clip-path", `url(#${clipPathId})`)
                                ,
                                update => update,
                                exit => exit.remove()
                            )
                    }

                    // when specified, show a circle for the actual data point
                    if (showPoints) {
                        mainGElem
                            .selectAll(`.${name}-${chartId}-poincare-points`)
                            .data(plotData, () => `${name}`)
                            .join(
                                enter => enter
                                    .append("circle")
                                    .attr("class", `${name}-${chartId}-poincare-points`)
                                    .attr("id", (_, index) => `${name}-${chartId}-poincare-point-${index}`)
                                    .attr("fill", seriesLineStyle.color)
                                    .attr("stroke", "none")
                                    .attr("cx", (d: IteratePoint) => xAxisLinear.scale(d.n) || 0)
                                    .attr("cy", (d: IteratePoint) => yAxisLinear.scale(d.n_1) || 0)
                                    .attr("r", 2)
                                    .attr('transform', `translate(${margin.left}, ${margin.top})`)
                                    .attr("clip-path", `url(#${clipPathId})`)
                                ,
                                update => update
                                    .attr("cx", (d: IteratePoint) => xAxisLinear.scale(d.n) || 0)
                                    .attr("cy", (d: IteratePoint) => yAxisLinear.scale(d.n_1) || 0)
                                ,
                                exit => exit.remove()
                            )
                            .on("mouseenter",
                                (event: React.MouseEvent<SVGCircleElement>, datum: IteratePoint) => {
                                    if (allowTooltip.current && tooltipVisible) {
                                        return handleMouseEnterPoint(
                                            chartId,
                                            name,
                                            container,
                                            event,
                                            datum,
                                            plotData,
                                            xAxisLinear,
                                            yAxisLinear,
                                            margin,
                                            seriesLineStyle,
                                            backgroundColor,
                                            allowTooltip.current,
                                            mouseOverHandlerFor(`tooltip-${chartId}`)
                                        )
                                    }
                                    return <></>
                                }
                            )
                            .on("mouseleave", () => {
                                handleMouseLeavePoint(
                                    chartId,
                                    name,
                                    seriesLineStyle.color,
                                    mouseLeaveHandlerFor(`tooltip-${chartId}`)
                                )
                            })
                    }
                })
            }
        },
        [
            container, onUpdateChartTime, panEnabled, zoomEnabled, chartId, plotDimensions, margin,
            xAxesState, yAxesState,
            onPan,
            zoomMinScaleFactor, zoomMaxScaleFactor, zoomKeyModifiersRequired, onZoom,
            seriesStyles, seriesFilter, showPoints,
            interpolation, backgroundColor,
            mouseOverHandlerFor, mouseLeaveHandlerFor,
            tooltipVisible,
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
    const onUpdateAxesBoundsRef = useRef(updateAxesBounds)
    useEffect(
        () => {
            onUpdateAxesBoundsRef.current = updateAxesBounds
        },
        [updateAxesBounds]
    )

    // memoized function for subscribing to the chart-data observable
    const subscribe = useCallback(
        () => {
            if (seriesObservable === undefined || mainG === null) return undefined
            return subscriptionIteratesFor(
                seriesObservable as Observable<IterateChartData>,
                onSubscribe,
                windowingTime,
                xAxesState,
                yAxesState,
                onUpdateData,
                dropDataAfter,
                updateRangesAndPlot,
                // as new data flows into the subscription, the subscription
                // updates this map directly (for performance)
                seriesRef.current,
                end => currentTimeRef.current = end
            )
        },
        [
            dropDataAfter, mainG,
            onSubscribe, onUpdateData,
            seriesObservable, updateRangesAndPlot, windowingTime,
            xAxesState, yAxesState,
        ]
    )

    // updates the plot when the interpolation and filter change, because the updatePlot
    // callback has changed.
    useEffect(
        () => {
            if (container && mainG) {
                updatePlot(mainG)
            }
        },
        [axisBoundsFor, container, mainG, updatePlot]
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
 * @param xAxisFor The function that accepts an axis ID and returns the corresponding x-axis
 * @param yAxisFor The function that accepts an axis ID and returns the corresponding y-axis
 */
function axesFor(
    xAxisFor: (id: string) => BaseAxis | undefined,
    yAxisFor: (id: string) => BaseAxis | undefined,
): [xAxis: ContinuousNumericAxis, yAxis: ContinuousNumericAxis] {
    const xAxis = xAxisFor("")
    const xAxisLinear = xAxis as ContinuousNumericAxis
    const yAxis = yAxisFor("")
    const yAxisLinear = yAxis as ContinuousNumericAxis
    if (xAxis && !xAxisLinear) {
        throw Error("Poincare plot requires that x-axis be of type LinearAxis")
    }
    if (yAxis && !yAxisLinear) {
        throw Error("Poincare plot requires that y-axis be of type LinearAxis")
    }
    return [xAxisLinear, yAxisLinear]
}

/**
 * @param chartId The ID of the chart
 * @param seriesName The name of the series (i.e. the neuron ID)
 * @param container The SVG container holding the plot
 * @param event The mouse event that triggered this call
 * @param datum The datum over which the mouse has entered
 * @param plotData The iterates series
 * @param xAxisLinear The x-axis (f[n](x))
 * @param yAxisLinear The y-axis (f[n+1](x))
 * @param margin The plot margin
 * @param seriesStyle The series style information (needed for (un)highlighting)
 * @param backgroundColor
 * @param allowTooltip When set to `false` won't show tooltip, even if it is visible (used by pan)
 * @param mouseOverHandlerFor The handler for the mouse-over (registered by the <Tooltip/>)
 */
function handleMouseEnterPoint(
    chartId: number,
    seriesName: string,
    container: SVGSVGElement,
    event: React.MouseEvent<SVGPathElement>,
    datum: IteratePoint,
    plotData: IteratePointSeries,
    xAxisLinear: ContinuousNumericAxis,
    yAxisLinear: ContinuousNumericAxis,
    margin: Margin,
    seriesStyle: SeriesLineStyle,
    backgroundColor: string,
    allowTooltip: boolean,
    mouseOverHandlerFor: ((seriesName: string, time: number, tooltipData: TooltipData<IterateDatum, NoTooltipMetadata>, mouseCoords: [x: number, y: number]) => void) | undefined,
): void {
    const {color, highlightColor, lineWidth} = seriesStyle

    const padding = 4
    const circleRadius = 5
    const circleStroke = lineWidth

    const circle = event.currentTarget as SVGCircleElement

    d3.select<SVGPathElement, Datum>(circle)
        .attr("r", circleRadius)
        .style("fill", highlightColor)

    const index = plotData
        .findIndex(point => point.n === datum.n && point.n_1 === datum.n_1)

    /**
     * Displays basic information about an iterate, generally its neighbors
     * @param index The index of the iterate
     */
    function showInfo(index: number): void {
        d3.select(`#${seriesName}-${chartId}-poincare-point-${index}`)
            .attr("r", circleRadius)
            .style("fill", d3.rgb(highlightColor).brighter(0.7).toString())
            .style("stroke-width", circleStroke)
            .style("stroke", color)

        // grab the (x, y)-coordinates for the plot
        const iterateN = xAxisLinear.scale(plotData[index].n) + margin.left
        const iterateN_1 = yAxisLinear.scale(plotData[index].n_1) + margin.top

        const svg = d3.select<SVGSVGElement, any>(container)

        // add a rectangle that serves as the background for the text (to make the
        // text readable when the chart is busy)
        const rect = svg
            .append("rect")
            .attr("class", `${seriesName}-${chartId}-poincare-point-text-background`)

        // add the information about the iterate as a text element
        const textElement = svg
            .append("text")
            .attr('class', `${seriesName}-${chartId}-poincare-point-text`)
            .attr('fill', highlightColor)
            .attr('font-family', 'sans-serif')
            .attr('font-size', 11)
            .attr('font-weight', 700)
            .text(`n = ${index}; t = ${formatTime(plotData[index].time)} ms`)

        // calculate the width and height of the text element
        const {width, height} = textDimensions(textElement)

        textElement
            .attr("transform", `translate(${iterateN - 8}, ${iterateN_1 - circleRadius - circleStroke - padding})`)

        rect
            .attr("x", iterateN - padding / 2 - 8)
            .attr("y", iterateN_1 - padding / 2 - circleRadius - circleStroke - height)
            .attr("width", width + padding)
            .attr("height", height + padding / 2)
            .style("fill", backgroundColor)
    }

    if (index > 0) {
        showInfo(index - 1)
    }
    if (index < plotData.length - 1) {
        showInfo(index + 1)
    }

    const [x, y] = d3.pointer(event, container)
    const currentDatum: IteratePoint = (index >= 0) ? plotData[index] : {time: 0, n: 0, n_1: 0, index}

    if (mouseOverHandlerFor && allowTooltip) {
        mouseOverHandlerFor(
            seriesName,
            currentDatum.time,
            {series: plotData.map(ip => ({iterateN: ip.n, iterateN_1: ip.n_1, time: ip.time})), metadata: {}},
            [x, y]
        )
    }
}

function handleMouseLeavePoint(
    chartId: number,
    seriesName: string,
    color: string,
    mouseLeaverHandlerFor: ((seriesName: string) => void) | undefined,
): void {
    d3.selectAll<SVGPathElement, Datum>(`.${seriesName}-${chartId}-poincare-points`)
        .attr("r", 2)
        .style("fill", color)
        .style("stroke", "none")
    d3.selectAll(`.${seriesName}-${chartId}-poincare-point-arrows`).remove()
    d3.selectAll(`.${seriesName}-${chartId}-poincare-point-text`).remove()
    d3.selectAll(`.${seriesName}-${chartId}-poincare-point-text-background`).remove()

    if (mouseLeaverHandlerFor) {
        mouseLeaverHandlerFor(seriesName)
    }

}
