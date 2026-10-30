import {type AxesAssignment, clipToArea, type Series} from "./plot";
import {useStreamingTimeAxes} from "./useStreamingTimeAxes";
import {useHoveredSeries} from "../hooks/useHoveredSeries";
import {noop} from "../utils";
import {useChart} from "../hooks/useChart";
import type {RasterTooltipMetadata} from "../tooltips/tooltipUtils";
import {useCallback, useEffect, useRef} from "react";
import type {Datum, TimeSeries} from "../series/timeSeries";
import {
    type BaseAxis,
    AxisType,
    checkAxisType,
    type ContinuousNumericAxis,
    defaultLineStyle,
    type OrdinalStringAxis,
    type SeriesLineStyle
} from "../axes/axes";
import type {CanvasContext} from "../d3types";
import {seriesAt, canvasLocalPoint, type SeriesGeometry} from "./hitTesting";
import type {Margin} from "../styling/margins";
import {timeSeriesAxisTimes} from "../subscriptions/viewDrivers";
import {useDataSource, useDataSourceRunning, useInitialData} from "../hooks/useDataSource";
import type {TimeSeriesChartData} from "../series/timeSeriesChartData";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import type {TooltipData} from "../hooks/useTooltip";
import {ContinuousAxisRange} from "../axes/ContinuousAxisRange";
import {FastShiftArray} from "fast-shift-array";

/**
 * The properties of the {@link RasterPlot}
 */
export interface Props {
    /**
     * Holds the mapping between a series and the axis it uses (is assigned). The
     * map's key holds the series name, and the value is an {@link AxesAssignment}
     * object holding the ID of the assigned x-axis and y-axis.
     */
    axisAssignments?: Map<string, AxesAssignment>
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
     * to activate the zoom
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
     * Margins on individual series can also be set through the {@link ChartProps.seriesStyles} property.
     */
    spikeMargin?: number
    /**
     * When true, hovering over a series also highlights the x- and y-axes it is plotted
     * against (in the series' own highlight color/width). Defaults to `false`.
     */
    highlightAxesOnMouseOver?: boolean
    /**
     * Called whenever this plot (re)creates its zoom behavior, handing
     * the caller a `resetZoom` function that programmatically clears d3-zoom's own accumulated
     * scale/pan state back to identity. See {@link ScatterPlot}'s identical prop for the full
     * explanation of why this is needed. Only meaningful (called) while `zoomEnabled` is true.
     */
    onZoomReset?: (resetZoom: () => void) => void
}

/**
 * Renders a streaming neuron raster plot for the series held by the {@link StreamingDataSource}
 * handed to the {@link Chart} (its `dataSource` prop). This component uses the {@link useChart}
 * hook, and therefore must be a child of the {@link Chart} in order to be plugged in to the
 * chart ecosystem (axes, tracker, tooltip).
 *
 * The plot never subscribes to the data stream itself -- see {@link ScatterPlot} for how the
 * application-owned data source and this plot's mount-scoped view driver divide the work.
 *
 * Internally, this no longer creates/updates SVG `<line>` elements. Instead, it registers a single
 * draw function with the chart's {@link CanvasContext} that redraws every series' spikes from
 * scratch each time the canvas repaints. Mouse hover (for the tooltip) is handled by hit-testing
 * the mouse position against the last-drawn spike geometry -- as *disjoint* segments, since unlike
 * a scatter series, consecutive spikes are not connected by a line (see `hitTesting.ts`). When
 * the data source is paused, hovering over a spike shows the tooltip (when there's one).
 *
 * @param props The properties associated with the raster plot
 * @return `null` (the plot draws onto the chart's canvas)
 * @example
 <RasterPlot
     axisAssignments={new Map([
        ['neuron1', assignAxes("x-axis-2", "y-axis-2")],
        ['neuron2', assignAxes("x-axis-2", "y-axis-2")],
     ])}
     spikeMargin={1}
     panEnabled={true}
     zoomEnabled={true}
     zoomKeyModifiersRequired={true}
 />
 */
export function RasterPlot(props: Props): null {
    const {
        chartId,
        canvasContext,
        axes,
        seriesStyles,
        seriesFilter,
        mouse,
    } = useChart<Datum, SeriesLineStyle, RasterTooltipMetadata, ContinuousAxisRange, ContinuousNumericAxis>()
    const {hoveredSeriesName} = useHoveredSeries()

    const {
        xAxesState,
        yAxesState,
        setAxisAssignments,
    } = axes

    const {mouseOverHandlerFor, mouseLeaveHandlerFor} = mouse

    const {plotDimensions, margin} = usePlotDimensions()

    // the application-owned source of the data, and whether it's running (streaming)
    const dataSource = useDataSource<TimeSeriesChartData, Datum, TimeSeries>()
    const running = useDataSourceRunning(dataSource)

    const {initialData} = useInitialData<Datum>()

    const {
        axisAssignments = new Map<string, AxesAssignment>(),
        panEnabled = false,
        zoomEnabled = false,
        zoomKeyModifiersRequired = true,
        withCadenceOf,
        spikeMargin = 2,
        highlightAxesOnMouseOver = false,
        onZoomReset = noop,
    } = props

    // why do "dataRef" and "seriesRef" both hold on to the same underlying data? for performance.
    //
    // the "dataRef" and "seriesRef" both point to the same underlying data, a collection
    // of series (held, and updated as new data is streamed in, by the data source). The series in
    // "dataRef" are read by the canvas draw function, and the "seriesRef" map is for looking a
    // series up by its name.
    //
    // the "dataRef" object holds on to a copy of the initial data (which is an array of
    // time-series, e.i. an array of BaseSeries<Datum> objects). The slice just creates a copy of
    // the array, but the references to the BaseSeries objects are the same and still point to the same
    // data as the "initialData" array.
    //
    // the "seriesRef" object is a reference to a map (series_name -> BaseSeries<Datum>), used to find
    // the series under the mouse (for the tooltip).
    //
    // the series in the "dataRef" object are the ones read by the next redraw, so as these are
    // updated, the next canvas repaint picks up the new data.
    const dataRef = useRef<Array<TimeSeries>>(initialData.slice())
    const seriesRef = useRef<Map<string, TimeSeries>>(
        new Map(initialData.map(
            series => [series.name, series]
            )
        )
    )

    // the last-drawn geometry for each series' spikes, in canvas coordinates, used for
    // hit-testing mouse hover on `mousemove` (see the effect below that wires up the listener)
    const geometryRef = useRef<Map<string, SeriesGeometry>>(new Map())
    // the name of the series the mouse was over on the previous `mousemove`, so we know when to
    // fire a "leave" for the old series before firing an "over" for the new one
    const lastHoveredRef = useRef<string | undefined>(undefined)

    // tooltips are only shown while the data source is paused (and not while panning)
    const allowTooltipRef = useRef<boolean>(!(dataSource?.running ?? false))

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
     * (Re-)registers this plot's draw function with the canvas context and requests a redraw.
     * Replaces the old version, which directly mutated SVG `<line>` elements bound via d3's
     * enter/update/exit join. Canvas has no persistent elements to join against, so the draw
     * function just redraws every spike from current data/scale state each time it's invoked.
     *
     * Pan/zoom behavior setup lives in a separate effect (see below), not here -- this function
     * runs on every data tick (each `windowingTime` interval), and recreating/reattaching a
     * `d3.drag()`/`d3.zoom()` behavior that often is pure overhead unrelated to drawing the new
     * data.
     * @param cc The canvas context to register the draw function with
     */
    const updatePlot = useCallback(
        (cc: CanvasContext) => {
            const draw = (context: CanvasContext) => {
                const {context2D} = context

                context2D.save()
                clipToArea(context, plotDimensions, {x: margin.left, y: margin.top})
                context2D.translate(margin.left, margin.top)

                const newGeometry = new Map<string, SeriesGeometry>()

                // enter, update, delete the raster data
                dataRef.current.forEach(series => {
                    const [xAxis, yAxis] = axesFor(
                        series.name,
                        axisAssignments,
                        axisId => xAxesState.axisFor(axisId).getOrUndefined(),
                        axisId => yAxesState.axisFor(axisId).getOrUndefined()
                    )
                    if (xAxis === undefined || yAxis === undefined) return

                    // grab the series styles, or the defaults if none exist
                    const {
                        color: seriesColor,
                        lineWidth,
                        highlightColor,
                        highlightWidth,
                        margin: spikeLineMargin = spikeMargin
                    } = seriesStyles.get(series.name) || {
                        ...defaultLineStyle(),
                        highlightColor: defaultLineStyle().color
                    }

                    const isHovered = hoveredSeriesName === series.name
                    const strokeColor = isHovered ? highlightColor : seriesColor
                    const strokeWidth = isHovered ? (highlightWidth || lineWidth) : lineWidth

                    // only show the data for which the regex filter matches
                    const plotData: FastShiftArray<Datum> = (series.name.match(seriesFilter)) ? series.data : FastShiftArray.empty<Datum>()

                    // grab the functions that are used to determine the lower and upper coordinates of
                    // the raster line (y1, y2) and then calculate the values (y1, y2) using those functions
                    const {yUpper, yLower} = yCoordsFn(yAxis.scale.bandwidth(), lineWidth, spikeLineMargin)
                    const y = yAxis.scale(series.name) || 0
                    const y1 = yUpper(y)
                    const y2 = yLower(y)

                    context2D.strokeStyle = strokeColor
                    context2D.lineWidth = strokeWidth

                    const segments: Array<[[number, number], [number, number]]> = []
                    for (let i = 0; i < plotData.length; i++) {
                        const x = xAxis.scale(plotData[i].x)
                        context2D.beginPath()
                        context2D.moveTo(x, y1)
                        context2D.lineTo(x, y2)
                        context2D.stroke()
                        segments.push([[x + margin.left, y1 + margin.top], [x + margin.left, y2 + margin.top]])
                    }

                    newGeometry.set(series.name, {
                        points: [],
                        segments,
                        hitRadius: Math.max(4, strokeWidth)
                    })
                })

                geometryRef.current = newGeometry

                context2D.restore()
            }

            cc.register(`raster-plot-${chartId}`, draw, 10)
            cc.requestRedraw()
        },
        [
            axisAssignments, chartId, plotDimensions, seriesFilter, seriesStyles, xAxesState, yAxesState,
            spikeMargin, hoveredSeriesName, margin.left, margin.top
        ]
    )

    // the time axes: their ranges, the view driver, panning and zooming, highlighting, and
    // reporting the axes' intervals -- see `useStreamingTimeAxes`
    useStreamingTimeAxes<TimeSeriesChartData, Datum>({
        canvasContext,
        dataSource,
        running,
        initialData,
        timeOf: datum => datum.x,
        axisTimesFor: timeSeriesAxisTimes(axisAssignments, xAxesState),
        axisAssignments,
        updatePlot,
        onDataReset: () => {
            dataRef.current = initialData.slice() as Array<TimeSeries>
            seriesRef.current = new Map(initialData.map(series => [series.name, series as TimeSeries]))
        },
        allowTooltipRef,
        panEnabled,
        zoomEnabled,
        zoomKeyModifiersRequired,
        onZoomReset,
        withCadenceOf,
        highlightAxesOnMouseOver,
    })

    // the series' axis assignments, for the chart (e.g. the tooltip looks up a spike's row's axis)
    useEffect(
        () => {
            setAxisAssignments(axisAssignments)
        },
        [axisAssignments, setAxisAssignments]
    )

    // wires up a single mousemove/mouseleave listener on the shared canvas to replace the old
    // per-element SVG mouseover/mouseleave handlers. Hit-tests the mouse position against the
    // last-drawn spike geometry (see `geometryRef`, populated by the draw function above).
    useEffect(
        () => {
            if (!canvasContext) return

            const canvas = canvasContext.canvas

            const handleMove = (event: MouseEvent) => {
                if (!allowTooltipRef.current) return

                const [x, y] = canvasLocalPoint(event, canvas)
                const hit = seriesAt(x, y, geometryRef.current)

                if (hit?.name === lastHoveredRef.current && hit !== undefined) {
                    // still hovering the same series -- no enter/leave to fire, but the specific
                    // spike may have changed, so fall through and re-report below
                } else if (lastHoveredRef.current !== undefined) {
                    handleMouseLeaveSeries(lastHoveredRef.current, mouseLeaveHandlerFor(`tooltip-${chartId}`))
                }

                if (hit !== undefined) {
                    const series = seriesRef.current.get(hit.name)
                    const selectedDatum = series?.data[hit.index]
                    const xAxis = axesFor(
                        hit.name,
                        axisAssignments,
                        axisId => xAxesState.axisFor(axisId).getOrUndefined(),
                        axisId => yAxesState.axisFor(axisId).getOrUndefined()
                    )[0]
                    if (series !== undefined && selectedDatum !== undefined && xAxis !== undefined) {
                        handleMouseOverSeries(
                            xAxis,
                            hit.name,
                            selectedDatum,
                            series.data,
                            [x, y],
                            margin,
                            mouseOverHandlerFor(`tooltip-${chartId}`)
                        )
                    }
                }

                lastHoveredRef.current = hit?.name
            }

            const handleLeaveCanvas = () => {
                if (lastHoveredRef.current !== undefined) {
                    handleMouseLeaveSeries(lastHoveredRef.current, mouseLeaveHandlerFor(`tooltip-${chartId}`))
                    lastHoveredRef.current = undefined
                }
            }

            canvas.addEventListener('mousemove', handleMove)
            canvas.addEventListener('mouseleave', handleLeaveCanvas)
            return () => {
                canvas.removeEventListener('mousemove', handleMove)
                canvas.removeEventListener('mouseleave', handleLeaveCanvas)
            }
        },
        [canvasContext, chartId, margin, axisAssignments, xAxesState, yAxesState, mouseOverHandlerFor, mouseLeaveHandlerFor]
    )

    // this plot needs a data source (see the `Chart`'s `dataSource` prop)
    useEffect(
        () => {
            if (dataSource === undefined) {
                console.error("RasterPlot requires a data source; set the enclosing Chart's `dataSource` prop")
            }
        },
        [dataSource]
    )

    // unregister this plot's draw function on unmount
    useEffect(
        () => {
            return () => {
                if (canvasContext) {
                    canvasContext.unregister(`raster-plot-${chartId}`)
                }
            }
        },
        [canvasContext, chartId]
    )

    return null
}

/**
 * Attempts to locate the x- and y-axes for the specified series. If the series has no axis
 * assignment, then uses the default (first) x- and y-axes.
 * @param seriesName Name of the series for which to retrieve the axis
 * @param axisAssignments A map holding the series name and the associated x- and y-axes assigned
 * to that series. Note that the series in the axis-assignment map is merely a subset of the set
 * of series names.
 * @param xAxisFor The function that accepts an axis ID and returns the corresponding x-axis
 * @param yAxisFor The function that accepts an axis ID and returns the corresponding y-axis
 * @return A 2d tuple holding the linear x-axis as its first element and the category y-axis as
 * the second element (either is actually `undefined` when it isn't found, despite the type).
 * @throws Error when the x-axis isn't a continuous numeric axis, or the y-axis isn't a category axis
 */
function axesFor(
    seriesName: string,
    axisAssignments: Map<string, AxesAssignment>,
    xAxisFor: (id: string) => BaseAxis | undefined,
    yAxisFor: (id: string) => BaseAxis | undefined,
): [xAxis: ContinuousNumericAxis, yAxis: OrdinalStringAxis] {
    const axes = axisAssignments.get(seriesName)
    const xAxis = xAxisFor(axes?.xAxis || "")
    checkAxisType("RasterPlot", "x", xAxis, AxisType.ContinuousNumeric)
    const xAxisLinear = xAxis as ContinuousNumericAxis
    const yAxis = yAxisFor(axes?.yAxis || "")
    checkAxisType("RasterPlot", "y", yAxis, AxisType.OrdinalString)
    const yAxisCategory = yAxis as OrdinalStringAxis
    return [xAxisLinear, yAxisCategory]
}

/**
 * Reports a tooltip showing the neuron, spike time, and the spike's value when the mouse hovers over a spike.
 * Replaces the old version, which mutated the hovered SVG `<line>`'s stroke directly; highlighting is now
 * handled by the draw function reading `hoveredSeriesName` from chart state rather than by touching an
 * element here.
 * @param xAxis The x-axis
 * @param seriesName The name of the series (i.e. the neuron ID)
 * @param selectedDatum The selected datum
 * @param spikes All the series' spikes that the chart holds (for the tooltip's statistics)
 * @param mouseCoords The `[x, y]` position of the mouse, in canvas coordinates
 * @param margin The plot margin
 * @param mouseOverHandlerFor The handler for the mouse over (registered by the <Tooltip/>)
 */
function handleMouseOverSeries(
    xAxis: ContinuousNumericAxis,
    seriesName: string,
    selectedDatum: Datum,
    spikes: Series<Datum>,
    mouseCoords: [x: number, y: number],
    margin: Margin,
    mouseOverHandlerFor: ((seriesName: string, time: number, tooltipData: TooltipData<Datum, RasterTooltipMetadata>, mouseCoords: [x: number, y: number]) => void) | undefined,
): void {
    // grab the time needed for the tooltip ID
    const [x] = mouseCoords
    const time = Math.round(xAxis.scale.invert(x - margin.left))

    if (mouseOverHandlerFor) {
        // the contract for the mouse over handler is for a time-series, but here we only
        // need one point, the selected datum, and so we convert it into an array of point
        // (i.e. a time-series). The category tooltip is (and custom ones, must) be
        // written to expect only the selected point. All the series' spikes (that the chart
        // holds) come along in the metadata, for the tooltip's statistics
        mouseOverHandlerFor(seriesName, time, {series: [selectedDatum], metadata: {spikes}}, mouseCoords)
    }
}

/**
 * Calls the mouse-leave-series handler registered for this series. Replaces the old version, which
 * also reset the hovered SVG element's stroke color/width directly; that reset is now implicit --
 * once `hoveredSeriesName` is cleared, the next redraw simply paints the spikes in their normal
 * (non-highlighted) style.
 * @param seriesName The name of the series (i.e. the neuron ID)
 * @param mouseLeaverHandlerFor Registered handler for the series when the mouse leaves
 */
function handleMouseLeaveSeries(
    seriesName: string,
    mouseLeaverHandlerFor: ((seriesName: string) => void) | undefined,
): void {
    if (mouseLeaverHandlerFor) {
        mouseLeaverHandlerFor(seriesName)
    }
}
