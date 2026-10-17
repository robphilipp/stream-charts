import {type JSX, useCallback, useLayoutEffect, useMemo, useRef, useState} from "react";
import Checkbox from "../ui/Checkbox";
import {
    Grid,
    gridArea,
    GridItem,
    gridTemplateAreasBuilder,
    gridTrackTemplateBuilder,
    useGridCell,
    useGridCellHeight,
    useGridCellWidth,
    withFraction,
    withPixels
} from "react-resizable-grid-layout";
import type {Datum, TimeSeries} from "../charts/series/timeSeries";
import {Chart} from "../charts/Chart";
import {AxisLocation, defaultLineStyle} from '../charts/axes/axes';
import {ContinuousAxis} from "../charts/axes/ContinuousAxis";
import {Tracker} from "../charts/trackers/Tracker";
import {Tooltip} from "../charts/tooltips/Tooltip";
import {ScatterPlotTooltipContent} from "../charts/tooltips/ScatterPlotTooltipContent";
import {formatNumber, noop} from '../charts/utils';
import {ScatterPlot} from "../charts/plots/ScatterPlot";
import {Legend} from "../charts/legends/Legend";
import {assignAxes} from "../charts/plots/plot";
import * as d3 from "d3";
import {lightTheme, type Theme} from "../ui/Themes.ts";
import {seriesFrom} from "../charts/series/baseSeries";
import {AxisInterval, regexFilter} from "../charts";
import {TrackerLabelLocation} from "../charts/trackers/trackerUtils.ts";
import {LegendLocation} from "../charts/legends/constants";
import {defaultMargin} from "../charts/hooks/defaultPlotDimensions";
import {ExpandableControlBar} from "../ui/ExpandableControlBar.tsx";
import {CommonControls} from "./controls/CommonControls.tsx";
import {buttonStyle} from "../ui/utils.ts";
import {CommonExecutionControls} from "./controls/CommonExecutionControls.tsx";
import {INTERPOLATIONS} from "./options/interpolations.ts";
import {EXTERNAL_LEGEND_WIDTH, LEGEND_ANIMATION_DURATION_MS, LegendControl} from "./controls/LegendControl.tsx";
import {InterpolationControl} from "./controls/InterpolationControl.tsx";
import {AutoScaleIcon, FilterIcon, HighlightAxesIcon, InterpolationIcon, LagIcon, MarkersIcon, TooltipIcon, TrackerIcon} from "../ui/Icons.tsx";
import {SeriesFilter} from "./controls/SeriesFilter.tsx";
import {DropDataControl} from "./controls/DropDataControl.tsx";
import {NumberOfSeriesControl} from "./controls/NumberOfSeriesControl.tsx";
import {DataUpdateRateControl} from "./controls/DataUpdateRateControl.tsx";
import {BufferingControl} from "./controls/BufferingControl.tsx";
import {CadenceControl} from "./controls/CadenceControl.tsx";
import {LagDisplay} from "./controls/LagDisplay.tsx";
import {Divider} from "../ui/Divider.tsx";
import {useScatterChartStore} from "./appstate/scatterChartStore.ts";
import {Optional} from "result-fn";
import {DROP_AFTER_20_SEC, dropDataOptionForMs} from "./options/dropDataAfter.ts";
import {initialRandomWeightData} from "./dataproviders/randomWeightData.ts";

// calculates a unique chart ID when the module is loaded
const CHART_ID = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)

const X1_AXIS_ID = 'x-axis-1'
const X2_AXIS_ID = 'x-axis-2'

// The y-axes' domains. With auto-scaling on, they start out narrower, and grow (up to the limits)
// as the data wanders beyond them -- the example's data never leaves [10, 1000], so with the
// usual domains, there would never be anything to grow for.
const Y1_DOMAIN: [number, number] = [0, 1000]
const Y1_AUTO_SCALE_DOMAIN: [number, number] = [400, 600]
const Y1_AUTO_SCALE_LIMITS: [number, number] = [0, 1000]
const Y2_DOMAIN: [number, number] = [10, 1200]
const Y2_AUTO_SCALE_DOMAIN: [number, number] = [200, 800]
const Y2_AUTO_SCALE_LIMITS: [number, number] = [10, 1200]

const AXIS_ASSIGNMENTS = new Map([
    ['Series 2', assignAxes("x-axis-2", "y-axis-2")],
    ['Series 3', assignAxes("x-axis-2", "y-axis-1")],
])

// generation parameters matching the initial data generated in routeData.ts, so that changing
// the number of series produces data consistent with the app's default initial data
const SERIES_INITIAL_TIME = 10
const SERIES_INITIAL_VALUE = 500
const SERIES_UPDATE_PERIOD = 50
const SERIES_DELTA = 20
const SERIES_NUM_POINTS = 100

/**
 * Generates the initial (static) data for the specified number of series, named "Series 0"
 * through "Series {numberOfSeries - 1}", matching the naming used for the chart's default
 * initial data.
 * @param numberOfSeries The number of series for which to generate initial data
 * @return The generated initial data
 */
function initialDataForSeriesCount(numberOfSeries: number): Array<TimeSeries> {
    const seriesNames = Array.from({length: numberOfSeries}, (_, index) => `Series ${index}`)
    return initialRandomWeightData(
        seriesNames, SERIES_INITIAL_TIME, SERIES_INITIAL_VALUE, SERIES_UPDATE_PERIOD, SERIES_DELTA, SERIES_NUM_POINTS
    )
}

/**
 * Compiles the filter's regex string into a `RegExp`, falling back to a match-everything
 * regex when the string isn't a valid regular expression. The component compiles it in a
 * `useMemo` keyed on the filter's string (which is what the store holds), so that its reference
 * remains stable across renders -- rather than in a store selector, which would hand
 * `useSyncExternalStore` a new object on every call, and React would re-render forever.
 * @param filterValue The string representation of the regex
 * @return The compiled regex, or a match-everything regex when the string is invalid
 */
const filterFrom = (filterValue: string): RegExp => regexFilter(filterValue).getOrElse(new RegExp(''))

/**
 * The properties
 */
interface Props {
    // the theme (defaults to the light theme)
    theme?: Theme
    // (unused)
    timeWindow?: number
    // the initial data (the default number of series, see routeData.ts)
    initialData?: Array<TimeSeries>
    // (unused)
    plotHeight?: number
    // (unused)
    plotWidth?: number
}

/**
 * The scatter-chart example: its control bar (run/pause, reset, and the settings), and a scatter
 * chart of random walks, with two x-axes and two y-axes, streamed from the store's data source
 * @param props The theme and the initial data
 * @return The example
 */
export function StreamingScatterChart(props: Props): JSX.Element {
    const {
        theme = lightTheme,
        initialData: originalInitialData = [],
    } = props

    // ----------------------------------------------------------------
    // GRAB STATE FROM STORE (zustand)
    //
    // the data source owns the stream's subscription and the series; it lives in the store, so it
    // keeps ingesting while this chart is unmounted (e.g. on another page)
    const dataSource = useScatterChartStore(state => state.dataSource)
    const setInitialData = useScatterChartStore(state => state.setInitialData)

    const running = useScatterChartStore(state => state.running)
    const setRunning = useScatterChartStore(state => state.setRunning)

    const x1axisRange = useScatterChartStore(state => state.x1axisRange)
    const setX1axisRange = useScatterChartStore(state => state.setX1axisRange)
    const x2axisRange = useScatterChartStore(state => state.x2axisRange)
    const setX2axisRange = useScatterChartStore(state => state.setX2axisRange)

    const filterValue = useScatterChartStore(state => state.filterValue)
    const setFilterValue = useScatterChartStore(state => state.setFilterValue)

    const visibility = useScatterChartStore(state => state.visibility)
    const setVisibility = useScatterChartStore(state => state.setVisibility)

    const selectedInterpolationName = useScatterChartStore(state => state.selectedInterpolationName)
    const setSelectedInterpolationName = useScatterChartStore(state => state.setSelectedInterpolationName)

    const dropAfterMs = useScatterChartStore(state => state.dropAfterMs)
    const setDropAfterMs = useScatterChartStore(state => state.setDropAfterMs)

    const numberOfSeries = useScatterChartStore(state => state.numberOfSeries)
    const setNumberOfSeries = useScatterChartStore(state => state.setNumberOfSeries)

    const dataUpdatePeriod = useScatterChartStore(state => state.dataUpdatePeriod)
    const setDataUpdatePeriod = useScatterChartStore(state => state.setDataUpdatePeriod)

    const windowingTime = useScatterChartStore(state => state.windowingTime)
    const setWindowingTime = useScatterChartStore(state => state.setWindowingTime)

    const cadence = useScatterChartStore(state => state.cadence)
    const setCadence = useScatterChartStore(state => state.setCadence)

    const autoScaleYAxes = useScatterChartStore(state => state.autoScaleYAxes)
    const setAutoScaleYAxes = useScatterChartStore(state => state.setAutoScaleYAxes)
    // the auto-scaled y-axes' domains, kept in the store so that their growth survives navigating
    // away from the chart and back
    const y1AutoScaledDomain = useScatterChartStore(state => state.y1AutoScaledDomain)
    const setY1AutoScaledDomain = useScatterChartStore(state => state.setY1AutoScaledDomain)
    const y2AutoScaledDomain = useScatterChartStore(state => state.y2AutoScaledDomain)
    const setY2AutoScaledDomain = useScatterChartStore(state => state.setY2AutoScaledDomain)

    const reset = useScatterChartStore(state => state.reset)
    //
    // ----------------------------------------------------------------

    const filter = useMemo(() => filterFrom(filterValue), [filterValue])

    // memoized so these don't get rebuilt (and thus don't invalidate every downstream hook in the
    // chart that depends on them) on every render -- previously these were inline object/Map
    // literals created fresh on every render, which combined with the frequent re-renders driven
    // by handleChartTimeUpdate (see below) caused a lot of unnecessary recomputation throughout
    // the chart's axis/plot code.
    const chartMargin = useMemo(
        () => ({...defaultMargin, top: 40, bottom: 40, right: 60}),
        []
    )
    // the series held by the data source (a new data source means new initial data)
    const initialData = useMemo(() => dataSource.seriesList(), [dataSource])

    const chartSeriesStyles = useMemo(
        () => new Map(initialData.map(
            (data, index) => [data.name, {
                ...defaultLineStyle(),
                lineWidth: linewidthFor(data.name),
                color: colorFor(index, initialData.length, theme.name),
                highlightWidth: highlightLinewidthFor(data.name),
                highlightColor: colorFor(index, initialData.length, theme.name)
            }])
        ),
        [initialData, theme.name]
    )

    const [interpolation, setInterpolation] = useState<d3.CurveFactory>(
        () => interpolationFactoryFor(selectedInterpolationName).getOrElse(d3.curveLinear)
    )

    // whether the store has already been seeded with the initial data from the props
    const seededInitialDataRef = useRef<boolean>(false)

    // holds the latest `resetZoom` handed back by <ScatterPlot> (see its `onZoomReset` prop),
    // so that clearing the chart can also clear d3-zoom's own accumulated scale/pan state --
    // which lives on the canvas element itself, entirely separate from (and unaffected by)
    // resetting the axes' domains back to their defaults below
    const resetZoomRef = useRef<() => void>(noop)
    // stable across renders (empty deps -- it only ever assigns to a ref) so that passing it as
    // <ScatterPlot onZoomReset={...}> doesn't make that prop a fresh reference every render, which
    // would otherwise needlessly re-create the zoom behavior (see the effect's own comment on why
    // that's worth avoiding) on every one of this component's re-renders while streaming
    const handleZoomReset = useCallback((resetZoom: () => void): void => {
        resetZoomRef.current = resetZoom
    }, [])

    // elapsed time
    const startTimeRef = useRef<number>(new Date().valueOf())
    const intervalRef = useRef<ReturnType<typeof setTimeout>>(undefined)
    const [elapsed, setElapsed] = useState<number>(0)

    // legend
    const [legendLocation, setLegendLocation] = useState<LegendLocation>(LegendLocation.EXTERNAL_CONTAINER)
    const legendContainerRef = useRef<HTMLDivElement>(null)
    const [externalLegendWidth, setExternalLegendWidth] = useState<number>(0)
    const externalLegendWidthRef = useRef<number>(0)

    const shouldShowExternalLegend = visibility.legend && legendLocation === LegendLocation.EXTERNAL_CONTAINER
    const shouldRenderExternalLegend = legendLocation === LegendLocation.EXTERNAL_CONTAINER &&
        (shouldShowExternalLegend || externalLegendWidth > 0)

    useLayoutEffect(() => {
        const targetWidth = shouldShowExternalLegend ? EXTERNAL_LEGEND_WIDTH : 0
        if (externalLegendWidthRef.current === targetWidth) return

        const startWidth = externalLegendWidthRef.current
        const startedAt = performance.now()
        let animationFrameId = 0

        const easeInOutQuad = (progress: number): number =>
            progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2

        const animate = (now: number): void => {
            const progress = Math.min(1, (now - startedAt) / LEGEND_ANIMATION_DURATION_MS)
            const easedProgress = easeInOutQuad(progress)
            const nextWidth = startWidth + (targetWidth - startWidth) * easedProgress

            externalLegendWidthRef.current = nextWidth
            setExternalLegendWidth(nextWidth)

            if (progress < 1) {
                animationFrameId = requestAnimationFrame(animate)
            }
        }

        animationFrameId = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(animationFrameId)
    }, [shouldShowExternalLegend])

    /**
     * Copies the specified series (each series' data too, so that the data source that's handed
     * the copies doesn't mutate the originals as data streams in)
     * @param data The series to copy
     * @return The copies
     */
    function initialDataFrom(data: Array<TimeSeries>): Array<TimeSeries> {
        return data.map(series => seriesFrom<Datum>(series.name, series.data.slice()))
    }

    /**
     * Called when the user changes the regular expression filter
     * @param updatedFilter The updated the filter
     */
    function handleUpdateFilterValue(updatedFilter: string): void {
        // the component compiles the regex from the filter value (see `filterFrom`)
        setFilterValue(updatedFilter)
    }

    /**
     * Called when the user changes the number of series. Regenerates the initial data so
     * it has the specified number of series (only available while the chart isn't running).
     * @param count The number of series
     */
    function handleNumberOfSeriesChange(count: number): void {
        setNumberOfSeries(count)
        setInitialData(initialDataForSeriesCount(count))
    }

    /**
     * Called when the user changes the data-generation rate -- how often (in milliseconds) the
     * underlying RxJS observable produces a new data point per series (only available while the
     * chart isn't running).
     * @param ms The data-generation period, in milliseconds
     */
    function handleDataUpdatePeriodChange(ms: number): void {
        setDataUpdatePeriod(ms)
    }

    /**
     * Called when the user changes the buffering (windowing) time -- how long incoming data is
     * buffered before updating the chart (only available while the chart isn't running).
     * @param ms The windowing time, in milliseconds
     */
    function handleWindowingTimeChange(ms: number): void {
        setWindowingTime(ms)
    }

    /**
     * Called when the user changes the plot's update-cadence period -- a periodic redraw tick
     * that keeps the plot scrolling even without new data (only available while the chart isn't
     * running). A value of `0` disables the cadence.
     * @param ms The cadence period, in milliseconds (`0` disables it)
     */
    function handleCadenceChange(ms: number): void {
        setCadence(ms)
    }

    function interpolationFactoryFor(interpolationName: string): Optional<d3.CurveFactory> {
        const interpolation = INTERPOLATIONS.get(interpolationName)
        if (interpolation) {
            const [, factory] = interpolation
            return Optional.of(factory)
        }
        return Optional.empty()
    }
    /**
     * Called when the interpolation is change for the chart. Converts the selected
     * interpolation name into the d3 curve-factory.
     * @param selectedInterpolation The name of the selected interpolation
     */
    function handleInterpolationChange(selectedInterpolation: string): void {
        const factory = interpolationFactoryFor(selectedInterpolation).getOrElse(d3.curveLinear)
        setInterpolation(() => factory)
        setSelectedInterpolationName(selectedInterpolation)
    }

    /**
     * Updates the time from the chart (the max value of the axes ranges)
     * @param times A map associating the axis with its time range
     */
    function handleChartTimeUpdate(times: Map<string, AxisInterval>): void {
        // IMPORTANT: only call the store setters when the values have actually changed. A fresh
        // array from `.asTuple()` is a *new reference* every time, even when its contents are
        // identical to what's already in the store -- and since Zustand's default subscription
        // equality is referential, calling the setter unconditionally re-renders every component
        // subscribed to this slice (this component, and anything else reading x1axisRange/
        // x2axisRange) on essentially every animation frame while streaming, whether or not the
        // range actually moved.
        const x1AxisInterval = times.get(X1_AXIS_ID)
        if (x1AxisInterval) {
            const [start, end] = x1AxisInterval.asTuple()
            if (start !== x1axisRange[0] || end !== x1axisRange[1]) {
                setX1axisRange([start, end])
            }
        }
        const x2AxisInterval = times.get(X2_AXIS_ID)
        if (x2AxisInterval) {
            const [start, end] = x2AxisInterval.asTuple()
            if (start !== x2axisRange[0] || end !== x2axisRange[1]) {
                setX2axisRange([start, end])
            }
        }
    }

    // seeds the store with the initial data handed in through the props (the store survives
    // remounts, so this only needs to happen when the store hasn't been seeded yet). The ref
    // guard keeps this from looping when the supplied initial data is itself empty.
    if (!seededInitialDataRef.current && (initialData.length === 0)) {
        seededInitialDataRef.current = true
        setInitialData(initialDataFrom(originalInitialData))
    }

    function handleRunPauseClick(): void {
        if (!running) {
            startTimeRef.current = new Date().valueOf()
            setElapsed(0)
            intervalRef.current = setInterval(() => setElapsed(new Date().valueOf() - startTimeRef.current), 1000)
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current)
            intervalRef.current = undefined
        }
        setRunning(!running)
    }

    function handleClearClick(): void {
        // set the state back to the initial state of the store, and then re-seed the
        // initial data because the reset clears it (the filter is reset along with it)
        reset()
        setInitialData(initialDataFrom(originalInitialData))

        // reset local state to its original state
        setElapsed(0)
        setInterpolation(() => d3.curveLinear)

        // the store reset above already restores the axes' own domains, but d3-zoom keeps its
        // own accumulated scale/pan state on the canvas element itself -- clear that too, or the
        // next zoom gesture would compute its new scale against the stale, pre-reset transform
        resetZoomRef.current()
    }

    // the chart time is the end of the x2 axis range
    const chartTime = x1axisRange[1]
    return (
        <Grid
            dimensionsSupplier={useGridCell}
            gridTemplateColumns={gridTrackTemplateBuilder()
                .addTrack(withFraction(1))
                .addTrack(withPixels(Math.round(externalLegendWidth)))
                .build()}
            gridTemplateRows={gridTrackTemplateBuilder()
                .addTrack(withPixels(70))
                .addTrack(withFraction(1))
                .build()}
            gridTemplateAreas={gridTemplateAreasBuilder()
                .addArea("chart-controls", gridArea(1, 1))
                .addArea("chart", gridArea(2, 1))
                .addArea("chart-legend", gridArea(2, 2))
                .build()}
        >
            <GridItem gridAreaName="chart-controls">
                <div style={{
                    display: 'flex',
                    flexDirection: 'row',
                    gap: 8,
                    alignItems: 'flex-start',
                    width: '100%',
                    minWidth: 0,
                    overflowX: 'auto',
                    overflowY: 'visible',
                    scrollbarWidth: 'thin',
                    padding: '12px 28px 20px 28px',
                    marginTop: '-12px',
                    boxSizing: 'border-box',
                }}>
                    <ExpandableControlBar
                        expandButtonStyle={buttonStyle(theme)}
                        backgroundColor={theme.backgroundColor}
                        borderColor={theme.disabledBackgroundColor}
                        borderRadius={10}
                        minHeight={55}
                        autoExpandOnMouseEnter={false}
                    >
                        <CommonExecutionControls
                            theme={theme}
                            type="header"
                            isRunning={running}
                            onRunPauseClick={handleRunPauseClick}
                            onClearClick={handleClearClick}
                        >
                            <LagIcon
                                color={elapsed - chartTime > 0 ? theme.color : theme.disabledBackgroundColor}
                                fill={elapsed - chartTime > 0 ? "#c64646" : "none"}
                            />
                            <FilterIcon color={filterValue.length > 0 ? theme.color : theme.disabledBackgroundColor}/>
                            <TooltipIcon color={visibility.tooltip ? theme.color : theme.disabledBackgroundColor}/>
                            <TrackerIcon color={visibility.tracker ? theme.color : theme.disabledBackgroundColor}/>
                            <HighlightAxesIcon color={visibility.highlightAxes ? theme.color : theme.disabledBackgroundColor}/>
                            <AutoScaleIcon color={autoScaleYAxes ? theme.color : theme.disabledBackgroundColor}/>
                            <MarkersIcon color={visibility.markers ? theme.color : theme.disabledBackgroundColor}/>
                            <InterpolationIcon color={selectedInterpolationName === "curveLinear" ? theme.disabledBackgroundColor : theme.color}/>
                        </CommonExecutionControls>
                        <CommonControls>
                            <DropDataControl
                                theme={theme}
                                value={dropDataOptionForMs(dropAfterMs).getOrElse(DROP_AFTER_20_SEC)}
                                handleDropAfterChange={setDropAfterMs}
                                disabled={running}
                            />
                            <NumberOfSeriesControl
                                theme={theme}
                                numberOfSeries={numberOfSeries}
                                handleNumberOfSeriesChange={handleNumberOfSeriesChange}
                                disabled={running}
                            />
                            <DataUpdateRateControl
                                theme={theme}
                                dataUpdatePeriod={dataUpdatePeriod}
                                handleDataUpdatePeriodChange={handleDataUpdatePeriodChange}
                                disabled={running}
                            />
                            <BufferingControl
                                theme={theme}
                                windowingTime={windowingTime}
                                handleWindowingTimeChange={handleWindowingTimeChange}
                                disabled={running}
                            />
                            <CadenceControl
                                theme={theme}
                                cadence={cadence}
                                handleCadenceChange={handleCadenceChange}
                                disabled={running}
                            />
                            <LagDisplay
                                theme={theme}
                                lag={elapsed - chartTime}
                            />
                            <Divider theme={theme}/>
                            <SeriesFilter
                                theme={theme}
                                filterValue={filterValue}
                                handleFilterUpdate={handleUpdateFilterValue}
                            />
                            <Checkbox
                                key={1}
                                checked={visibility.tooltip && !running}
                                disabled={running}
                                label="tooltip"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setVisibility({...visibility, tooltip: !visibility.tooltip})}
                            />
                            <Checkbox
                                key={3}
                                checked={visibility.highlightAxes}
                                label="highlight axes"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setVisibility({...visibility, highlightAxes: !visibility.highlightAxes})}
                            />
                            <Checkbox
                                key={7}
                                checked={autoScaleYAxes}
                                label="auto-scale y-axes"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setAutoScaleYAxes(!autoScaleYAxes)}
                            />
                            <Checkbox
                                key={2}
                                checked={visibility.tracker && !running}
                                disabled={running}
                                label="tracker"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setVisibility({...visibility, tracker: !visibility.tracker})}
                            />
                            <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12}}>
                                <Checkbox
                                    key={5}
                                    checked={visibility.markers}
                                    // disabled={running}
                                    label="markers"
                                    backgroundColor={theme.backgroundColor}
                                    borderColor={theme.color}
                                    labelColor={theme.color}
                                    onChange={() => setVisibility({...visibility, markers: !visibility.markers})}
                                />
                                {visibility.markers &&
                                    <Checkbox
                                        key={6}
                                        checked={visibility.hideMarkersWhileRunning}
                                        label="hide while running"
                                        backgroundColor={theme.backgroundColor}
                                        borderColor={theme.color}
                                        labelColor={theme.color}
                                        onChange={() => setVisibility({
                                            ...visibility,
                                            hideMarkersWhileRunning: !visibility.hideMarkersWhileRunning
                                        })}
                                    />
                                }
                            </div>
                            <InterpolationControl
                                theme={theme}
                                selectedInterpolationName={selectedInterpolationName}
                                handleInterpolationChange={handleInterpolationChange}
                            />
                            <Divider theme={theme}/>
                            <LegendControl
                                theme={theme}
                                visibility={visibility.legend}
                                setVisibility={visible => setVisibility({...visibility, legend: visible})}
                                legendLocation={legendLocation}
                                setLegendLocation={setLegendLocation}
                            />
                        </CommonControls>
                    </ExpandableControlBar>
                </div>
            </GridItem>
            <GridItem gridAreaName="chart">
                <Chart
                    chartId={CHART_ID}
                    width={useGridCellWidth()}
                    height={useGridCellHeight()}
                    margin={chartMargin}
                    // svgStyle={{'background-color': 'pink'}}
                    color={theme.color}
                    backgroundColor={theme.backgroundColor}
                    seriesStyles={chartSeriesStyles}
                    dataSource={dataSource}
                    seriesFilter={filter}
                    onUpdateAxesBounds={handleChartTimeUpdate}
                    windowingTime={windowingTime}
                    dataUpdatePeriod={dataUpdatePeriod}
                >
                    <ContinuousAxis
                        axisId="x-axis-1"
                        location={AxisLocation.Bottom}
                        domain={[x1axisRange[0], x1axisRange[1]]}
                        label="Time (ms)"
                    />
                    <ContinuousAxis
                        axisId="y-axis-1"
                        location={AxisLocation.Left}
                        domain={autoScaleYAxes ? Y1_AUTO_SCALE_DOMAIN : Y1_DOMAIN}
                        autoScale={autoScaleYAxes}
                        autoScaleMin={Y1_AUTO_SCALE_LIMITS[0]}
                        autoScaleMax={Y1_AUTO_SCALE_LIMITS[1]}
                        autoScaledDomain={y1AutoScaledDomain}
                        onAutoScale={setY1AutoScaledDomain}
                        label="Distance (µm)"
                    />
                    <ContinuousAxis
                        axisId="x-axis-2"
                        location={AxisLocation.Top}
                        domain={[x2axisRange[0], x2axisRange[1]]}
                        label="Expanded Time (ms)"
                    />
                    <ContinuousAxis
                        axisId="y-axis-2"
                        location={AxisLocation.Right}
                        scale={d3.scaleLog()}
                        domain={autoScaleYAxes ? Y2_AUTO_SCALE_DOMAIN : Y2_DOMAIN}
                        autoScale={autoScaleYAxes}
                        autoScaleMin={Y2_AUTO_SCALE_LIMITS[0]}
                        autoScaleMax={Y2_AUTO_SCALE_LIMITS[1]}
                        autoScaledDomain={y2AutoScaledDomain}
                        onAutoScale={setY2AutoScaledDomain}
                        label="Distance (µm)"
                    />
                    <Tracker
                        visible={visibility.tracker}
                        labelLocation={TrackerLabelLocation.ByAxis}
                        labelFormatter={x => `${d3.format(",.0f")(x)} ms`}
                        style={{color: theme.color}}
                        font={{color: theme.color}}
                        // onTrackerUpdate={update => console.dir(update)}
                    />
                    <Tooltip
                        visible={visibility.tooltip}
                        style={{
                            fontColor: theme.color,
                            backgroundColor: theme.backgroundColor,
                            borderColor: theme.color,
                            backgroundOpacity: 0.9,
                            borderOpacity: 0.5
                        }}
                    >
                        <ScatterPlotTooltipContent
                            xLabel="t (ms)"
                            yLabel="count"
                            yValueFormatter={value => formatNumber(value, " ,.0f")}
                            yChangeFormatter={(y1, y2) => formatNumber(y2 - y1, " ,.0f")}
                        />
                    </Tooltip>
                    <Legend
                        visible={legendLocation === LegendLocation.EXTERNAL_CONTAINER ? shouldRenderExternalLegend : visibility.legend}
                        // choose either the external legend (using react createPortal) or the internal legend
                        container={legendLocation === LegendLocation.EXTERNAL_CONTAINER ? legendContainerRef : undefined}
                        location={legendLocation !== LegendLocation.EXTERNAL_CONTAINER ? legendLocation : undefined}
                        style={{
                            fontColor: theme.color,
                            backgroundColor: theme.backgroundColor,
                            borderColor: theme.backgroundColor,
                            padding: 0,
                        }}
                    />
                    <ScatterPlot
                        interpolation={interpolation}
                        axisAssignments={AXIS_ASSIGNMENTS}
                        panEnabled={true}
                        zoomEnabled={true}
                        // panEnabled={!running}
                        // zoomEnabled={!running}
                        zoomKeyModifiersRequired={true}
                        markerRadius={visibility.markers ? 2 : undefined}
                        hideMarkersWhileRunning={visibility.hideMarkersWhileRunning}
                        withCadenceOf={cadence > 0 ? cadence : undefined}
                        highlightAxesOnMouseOver={visibility.highlightAxes}
                        // timeWindowBehavior={TimeWindowBehavior.SQUEEZE}
                        onZoomReset={handleZoomReset}
                    />
                </Chart>
            </GridItem>
            <GridItem gridAreaName="chart-legend" isVisible={shouldRenderExternalLegend}>
                <div
                    ref={legendContainerRef}
                    style={{
                        marginTop: 30,
                        padding: 8,
                        opacity: externalLegendWidth / EXTERNAL_LEGEND_WIDTH,
                        overflow: 'hidden',
                    }}
                />
            </GridItem>
        </Grid>
    );
}

/**
 * The color of a series: from d3's red-blue color scale, by the series' index (from the
 * scale's lighter middle for the dark theme)
 * @param index The index of the series
 * @param numSeries The number of series
 * @param themeName The name of the theme ("light" or "dark")
 * @return The series' color
 */
function colorFor(index: number, numSeries: number, themeName: string): string {
    const ratio = index / numSeries / 2
    return themeName === 'light' ?
        d3.interpolateRdBu(ratio > 0.25 ? ratio + 0.5 : ratio) :
        d3.interpolateRdBu(ratio + 0.25)
}

/**
 * The line width of a series: wider for "Series 2" and "Series 3" (the series assigned to the
 * second x-axis), so that they stand out
 * @param name The name of the series
 * @return The series' line width (px)
 */
function linewidthFor(name: string): number {
    if (name === 'Series 1') return 1
    if (name === 'Series 2' || name === 'Series 3') return 3

    return 1
}

/**
 * The line width of a series when it's highlighted (hovered): 2 px wider than its normal width
 * (see {@link linewidthFor})
 * @param name The name of the series
 * @return The series' highlighted line width (px)
 */
function highlightLinewidthFor(name: string): number {
    if (name === 'Series 1') return 3
    if (name === 'Series 2' || name === 'Series 3') return 5

    return 3
}