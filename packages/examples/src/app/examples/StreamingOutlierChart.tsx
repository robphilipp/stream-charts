import {type JSX, useCallback, useMemo, useRef, useState} from "react"
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
} from "react-resizable-grid-layout"
import * as d3 from "d3"

import {initialOutlierData} from "./dataproviders/randomOutlierData.ts"
import {
    AxisInterval,
    AxisLocation,
    Chart,
    ContinuousAxis,
    defaultLineStyle,
    defaultMargin,
    noop,
    OutlierPlot,
    OutlierPlotTooltipContent,
    outlierSeriesFrom,
    regexFilter,
    Tooltip,
    type OutlierSeries,
} from "stream-charts";
import {lightTheme, type Theme} from "../ui/Themes.ts"
import Checkbox from "../ui/Checkbox"
import {buttonStyle} from "../ui/utils"
import {INTERPOLATIONS} from "./options/interpolations.ts";
import {InterpolationControl} from "./controls/InterpolationControl.tsx";
import {ExpandableControlBar} from "../ui/ExpandableControlBar.tsx";
import {CommonExecutionControls} from "./controls/CommonExecutionControls.tsx";
import {AutoScaleIcon, FilterIcon, HighlightAxesIcon, InterpolationIcon, LagIcon, MarkersIcon, TooltipIcon} from "../ui/Icons.tsx";
import {CommonControls} from "./controls/CommonControls.tsx";
import {DropDataControl} from "./controls/DropDataControl.tsx";
import {LagDisplay} from "./controls/LagDisplay.tsx";
import {Divider} from "../ui/Divider.tsx";
import {SeriesFilter} from "./controls/SeriesFilter.tsx";
import {DROP_AFTER_100_SEC, dropDataOptionForMs} from "./options/dropDataAfter.ts";
import {CadenceControl} from "./controls/CadenceControl.tsx";
import {BufferingControl} from "./controls/BufferingControl.tsx";
import {DataUpdateRateControl} from "./controls/DataUpdateRateControl.tsx";
import {
    baseDataFnFactory,
    DEFAULT_DATA_UPDATE_PERIOD,
    DEFAULT_X_AXIS_RANGE,
    MEASURES,
    type Measures,
    NOISE_SIGMA,
    SERIES_NAME,
    useOutlierChartStore
} from "./appstate/outlierChartStore.ts";

const MEASURE_DESCRIPTIONS = [
    "Points in this band are not outliers.",
    "Points in this band are unlikely to be outliers.",
    "Points in this band are possibly outliers. Points outside of this band are likely outliers.",
] as readonly [string, string, string]

const CHART_ID = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
const X_AXIS_ID = 'x-axis-1'

// The y-axis' domain. With auto-scaling on, the axis starts out narrower, and grows (up to the
// limits) as the index and its bands wander beyond it -- with the usual domain, there would
// never be anything to grow for.
const Y_DOMAIN: [number, number] = [0, 250]
const Y_AUTO_SCALE_DOMAIN: [number, number] = [80, 160]
const Y_AUTO_SCALE_LIMITS: [number, number] = [0, 250]
const INITIAL_POINT_COUNT = 400  // 400 * 25ms = 10 s of data

/**
 * Creates the example's default initial data: a single series of the example's base function
 * (see `baseDataFnFactory`), 400 points, one update period apart
 * @return The initial data
 */
function defaultInitialOutlierData(): Array<OutlierSeries<Measures>> {
    return initialOutlierData<Measures>(
        SERIES_NAME,
        baseDataFnFactory(),
        MEASURES,
        NOISE_SIGMA,
        DEFAULT_DATA_UPDATE_PERIOD,
        INITIAL_POINT_COUNT,
        MEASURE_DESCRIPTIONS
    )
}

/**
 * Compiles the filter's regex string into a `RegExp`, falling back to a match-everything regex
 * when the string isn't a valid regular expression (see StreamingScatterChart's identical helper).
 * @param filterValue The string representation of the regex
 * @return The compiled regex, or a match-everything regex when the string is invalid
 */
const filterFrom = (filterValue: string): RegExp => regexFilter(filterValue).getOrElse(new RegExp(''))

/**
 * Builds a fresh array of {@link OutlierSeries} from the given template. The data source appends
 * to `series.data` in place, so it needs its own copy of the data arrays -- otherwise the pristine
 * seed gets mutated and "Clear" silently becomes a no-op.
 * @param template The series to copy
 * @return The copies (with copies of their data)
 */
function freshCopyOf(template: Array<OutlierSeries<Measures>>): Array<OutlierSeries<Measures>> {
    return template.map(series => outlierSeriesFrom(series.name, series.data.slice(), series.measures, series.measureDescriptions))
}

/**
 * The properties of the outlier example
 */
interface Props {
    // the theme (defaults to the light theme)
    theme?: Theme
    // (unused)
    timeWindow?: number
    // the initial data (defaults to the example's default initial data)
    initialData?: Array<OutlierSeries<Measures>>
    // (unused)
    plotHeight?: number
    // (unused)
    plotWidth?: number
}

/**
 * The outlier-chart example: its control bar (run/pause, reset, and the settings), and an outlier
 * chart of a noisy periodic series, with its confidence bands, streamed from the store's data source
 * @param props The theme and the initial data
 * @return The example
 */
export function StreamingOutlierChart(props: Props): JSX.Element {
    const {
        theme = lightTheme,
        initialData: originalInitialData,
    } = props

    // pristine template that never gets mutated; freshCopyOf() produces working copies for the chart
    const [seededInitialData] = useState<Array<OutlierSeries<Measures>>>(() =>
        originalInitialData && originalInitialData.length > 0
            ? originalInitialData
            : defaultInitialOutlierData()
    )

    // ----------------------------------------------------------------
    // GRAB STATE FROM STORE (zustand) -- the store survives a route change (unmount/remount), so
    // navigating away and back keeps the chart's settings, and its data source (which owns the
    // stream's subscription and the series) keeps ingesting while this chart is unmounted
    //
    const dataSource = useOutlierChartStore(state => state.dataSource)
    const setInitialData = useOutlierChartStore(state => state.setInitialData)
    const running = useOutlierChartStore(state => state.running)
    const setRunning = useOutlierChartStore(state => state.setRunning)

    const xAxisRange = useOutlierChartStore(state => state.xAxisRange)
    const setXAxisRange = useOutlierChartStore(state => state.setXAxisRange)

    const windowingTime = useOutlierChartStore(state => state.windowingTime)
    const setWindowingTime = useOutlierChartStore(state => state.setWindowingTime)
    // 0 means disabled (unchecked); CadenceControl's own default of 25ms is what appears once
    // the checkbox is checked
    const cadence = useOutlierChartStore(state => state.cadence)
    const setCadence = useOutlierChartStore(state => state.setCadence)
    const dataUpdatePeriod = useOutlierChartStore(state => state.dataUpdatePeriod)
    const setDataUpdatePeriod = useOutlierChartStore(state => state.setDataUpdatePeriod)

    const filterValue = useOutlierChartStore(state => state.filterValue)
    const setFilterValue = useOutlierChartStore(state => state.setFilterValue)
    const dropAfterMs = useOutlierChartStore(state => state.dropAfterMs)
    const setDropAfterMs = useOutlierChartStore(state => state.setDropAfterMs)

    const selectedInterpolationName = useOutlierChartStore(state => state.selectedInterpolationName)
    const setSelectedInterpolationName = useOutlierChartStore(state => state.setSelectedInterpolationName)
    const showMarkers = useOutlierChartStore(state => state.showMarkers)
    const setShowMarkers = useOutlierChartStore(state => state.setShowMarkers)
    const showTooltip = useOutlierChartStore(state => state.showTooltip)
    const setShowTooltip = useOutlierChartStore(state => state.setShowTooltip)
    const highlightAxes = useOutlierChartStore(state => state.highlightAxes)
    const setHighlightAxes = useOutlierChartStore(state => state.setHighlightAxes)
    const autoScaleYAxis = useOutlierChartStore(state => state.autoScaleYAxis)
    const setAutoScaleYAxis = useOutlierChartStore(state => state.setAutoScaleYAxis)
    // the auto-scaled y-axis' domain, kept in the store so that its growth survives navigating
    // away from the chart and back
    const yAutoScaledDomain = useOutlierChartStore(state => state.yAutoScaledDomain)
    const setYAutoScaledDomain = useOutlierChartStore(state => state.setYAutoScaledDomain)
    //
    // ----------------------------------------------------------------

    const filter = useMemo(() => filterFrom(filterValue), [filterValue])
    const interpolation = useMemo(
        () => (INTERPOLATIONS.get(selectedInterpolationName) || ['Linear', d3.curveLinear])[1],
        [selectedInterpolationName]
    )

    // seeds the store's data source with the initial data (the store survives remounts, so this
    // only needs to happen when the store hasn't been seeded yet). The ref guard keeps this from
    // looping when the supplied initial data is itself empty.
    const seededRef = useRef<boolean>(false)
    // eslint-disable-next-line react-hooks/refs
    if (!seededRef.current && dataSource.seriesList().length === 0) {
        seededRef.current = true
        setInitialData(freshCopyOf(seededInitialData))
    }

    const startTimeRef = useRef<number>(new Date().valueOf())
    const intervalRef = useRef<ReturnType<typeof setTimeout>>(undefined)
    const [elapsed, setElapsed] = useState<number>(0)

    // holds the latest `resetZoom` handed back by <OutlierPlot> (see its `onZoomReset` prop), so
    // that clearing the chart can also clear d3-zoom's own accumulated scale/pan state -- see
    // StreamingScatterChart's identical usage for the full explanation
    const resetZoomRef = useRef<() => void>(noop)
    const handleZoomReset = useCallback((resetZoom: () => void): void => {
        resetZoomRef.current = resetZoom
    }, [])

    function handleUpdateRegex(updatedFilter: string): void {
        // the filter's regex is compiled from the filter value (see `filter` above)
        setFilterValue(updatedFilter)
    }

    function handleInterpolationChange(name: string): void {
        // the interpolation's curve factory is derived from its name (see `interpolation` above)
        setSelectedInterpolationName(name)
    }

    function handleChartTimeUpdate(times: Map<string, AxisInterval>): void {
        // keeps the x-axis' current range in the store (so the view survives navigating away and
        // back). IMPORTANT: only call the store setter when the value has actually changed -- see
        // StreamingScatterChart's identical guard for the full explanation
        const xAxisInterval = times.get(X_AXIS_ID)
        if (xAxisInterval) {
            const [start, end] = xAxisInterval.asTuple()
            if (start !== xAxisRange[0] || end !== xAxisRange[1]) {
                setXAxisRange([start, end])
            }
        }
    }

    function handleWindowingTimeChange(ms: number): void {
        setWindowingTime(ms)
    }

    function handleCadenceChange(ms: number): void {
        setCadence(ms)
    }

    function handleDataUpdatePeriodChange(ms: number): void {
        setDataUpdatePeriod(ms)
    }

    function handleRunPauseClick(): void {
        if (!running) {
            startTimeRef.current = new Date().valueOf()
            setElapsed(0)
            intervalRef.current = setInterval(
                () => setElapsed(new Date().valueOf() - startTimeRef.current),
                1000
            )
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current)
            intervalRef.current = undefined
        }
        setRunning(!running)
    }

    function handleClearClick(): void {
        // replaces the data source with a fresh one holding the initial data (which stops the
        // current one); like before, Clear resets the data and the zoom, not the settings
        setInitialData(freshCopyOf(seededInitialData))
        setElapsed(0)
        setXAxisRange(DEFAULT_X_AXIS_RANGE)

        // the axes reset via the new data source above, but d3-zoom keeps its own accumulated scale/pan
        // state on the canvas element itself -- clear that too, or the next zoom gesture would
        // compute its new scale against the stale, pre-reset transform
        resetZoomRef.current()
    }

    // the chart time is the end of the x-axis range
    const chartTime = xAxisRange[1]

    return (
        <Grid
            dimensionsSupplier={useGridCell}
            gridTemplateColumns={gridTrackTemplateBuilder()
                .addTrack(withFraction(1))
                .build()}
            gridTemplateRows={gridTrackTemplateBuilder()
                .addTrack(withPixels(50))
                .addTrack(withFraction(1))
                .build()}
            gridTemplateAreas={gridTemplateAreasBuilder()
                .addArea("chart-controls", gridArea(1, 1))
                .addArea("chart", gridArea(2, 1))
                .build()}
            styles={{color: '#d2933f'}}
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
                            <TooltipIcon color={showTooltip ? theme.color : theme.disabledBackgroundColor}/>
                            {/*<TrackerIcon color={visibility.tracker ? theme.color : theme.disabledBackgroundColor}/>*/}
                            <MarkersIcon color={showMarkers ? theme.color : theme.disabledBackgroundColor}/>
                            <HighlightAxesIcon color={highlightAxes ? theme.color : theme.disabledBackgroundColor}/>
                            <AutoScaleIcon color={autoScaleYAxis ? theme.color : theme.disabledBackgroundColor}/>
                            <InterpolationIcon
                                color={selectedInterpolationName === "curveLinear" ? theme.disabledBackgroundColor : theme.color}/>
                        </CommonExecutionControls>
                        <CommonControls>
                            <DropDataControl
                                theme={theme}
                                value={dropDataOptionForMs(dropAfterMs).getOrElse(DROP_AFTER_100_SEC)}
                                handleDropAfterChange={setDropAfterMs}
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
                                handleFilterUpdate={handleUpdateRegex}
                            />
                            <div style={{display: 'flex', flexDirection: 'row', gap: '5'}}>
                                <Checkbox
                                    key={1}
                                    checked={showTooltip && !running}
                                    disabled={running}
                                    label="tooltip"
                                    backgroundColor={theme.backgroundColor}
                                    borderColor={theme.color}
                                    labelColor={theme.color}
                                    onChange={() => setShowTooltip(!showTooltip)}
                                />
                            </div>
                            {/*<Checkbox*/}
                            {/*    key={2}*/}
                            {/*    checked={visibility.tracker && !running}*/}
                            {/*    disabled={running}*/}
                            {/*    label="tracker"*/}
                            {/*    backgroundColor={theme.backgroundColor}*/}
                            {/*    borderColor={theme.color}*/}
                            {/*    labelColor={theme.color}*/}
                            {/*    onChange={() => setVisibility({...visibility, tracker: !visibility.tracker})}*/}
                            {/*/>*/}
                            <Checkbox
                                key={5}
                                checked={showMarkers}
                                disabled={running}
                                label="markers"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setShowMarkers(!showMarkers)}
                            />
                            <Checkbox
                                key={6}
                                checked={highlightAxes}
                                label="highlight axes"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setHighlightAxes(!highlightAxes)}
                            />
                            <Checkbox
                                key={7}
                                checked={autoScaleYAxis}
                                label="auto-scale y-axis"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setAutoScaleYAxis(!autoScaleYAxis)}
                            />
                            <Divider theme={theme}/>
                            <InterpolationControl
                                theme={theme}
                                selectedInterpolationName={selectedInterpolationName}
                                handleInterpolationChange={handleInterpolationChange}
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
                    margin={{...defaultMargin, top: 40, bottom: 40, right: 60}}
                    color={theme.color}
                    backgroundColor={theme.backgroundColor}
                    seriesStyles={new Map([
                        [SERIES_NAME, {
                            ...defaultLineStyle(),
                            color: theme.name === 'light' ? '#1f77b4' : '#5bc0eb',
                            lineWidth: 1.5,
                            highlightColor: theme.name === 'light' ? '#1f77b4' : '#5bc0eb',
                            highlightWidth: 3,
                        }]
                    ])}
                    dataSource={dataSource}
                    seriesFilter={filter}
                    onUpdateAxesBounds={handleChartTimeUpdate}
                    windowingTime={windowingTime}
                    dataUpdatePeriod={dataUpdatePeriod}
                >
                    <ContinuousAxis
                        axisId={X_AXIS_ID}
                        location={AxisLocation.Bottom}
                        domain={[xAxisRange[0], xAxisRange[1]]}
                        label="Time (ms)"
                    />
                    <ContinuousAxis
                        axisId="y-axis-1"
                        location={AxisLocation.Left}
                        domain={autoScaleYAxis ? Y_AUTO_SCALE_DOMAIN : Y_DOMAIN}
                        autoScale={autoScaleYAxis}
                        autoScaleMin={Y_AUTO_SCALE_LIMITS[0]}
                        autoScaleMax={Y_AUTO_SCALE_LIMITS[1]}
                        autoScaledDomain={yAutoScaledDomain}
                        onAutoScale={setYAutoScaledDomain}
                        label="Spot Price Index (USD)"
                    />
                    <OutlierPlot<Measures>
                        interpolation={interpolation}
                        panEnabled={true}
                        zoomEnabled={true}
                        zoomKeyModifiersRequired={true}
                        bandOpacity={0.12}
                        bandOpacityStep={0.14}
                        markerRadius={showMarkers ? 2 : 0}
                        outlierMarkerColors={['#f4c542', '#f08a3b', '#d62728']}
                        withCadenceOf={cadence > 0 ? cadence : undefined}
                        highlightAxesOnMouseOver={highlightAxes}
                        onZoomReset={handleZoomReset}
                    />
                    <Tooltip
                        visible={showTooltip}
                        style={{
                            fontColor: theme.color,
                            backgroundColor: theme.backgroundColor,
                            borderColor: theme.color,
                            backgroundOpacity: 0.9,
                            borderOpacity: 0.5,
                        }}
                    >
                        <OutlierPlotTooltipContent
                            datumFormatter={(x, y) =>
                                <div>Index: <b>{y.toFixed(2)} USD</b> (<em>@ {x.toFixed(0)} ms</em>)</div>}
                            bandFormatter={(lower, upper) => <div>Band: [{lower}, {upper})</div>}
                            measureFormatter={measureDescription}
                        >
                            {/* You can uncomment the MyOutlierTooltipContent below to use a custom tooltip */}
                            {/*<MyOutlierTooltipContent/>*/}
                        </OutlierPlotTooltipContent>
                    </Tooltip>
                </Chart>
            </GridItem>
        </Grid>
    )
}

/**
 * Creates the JSX element that describes the probability of points being in or outside the outlier band.
 * @param innerProb The probability of points being within the outlier band.
 * @param outerProb The probability of points being outside the outlier band.
 */
function measureDescription(innerProb: number, outerProb: number): JSX.Element {
    if (Math.abs(outerProb) < 1e-4) {
        return <div>
            <hr/>
            Points have a {(innerProb * 100).toFixed(1)}% probability of being in this band.
            <hr/>
        </div>
    }
    return <div>
        <hr/>
        <div>Points have a {(innerProb * 100).toFixed(1)}% probability of being in this band,</div>
        <div>and a {(outerProb * 100).toFixed(1)}% probability of being outside this band.</div>
        <hr/>
    </div>
}
