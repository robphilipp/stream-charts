import {type JSX, useCallback, useMemo, useRef, useState} from 'react';
import * as d3 from "d3";
import Checkbox from "../ui/Checkbox";
import {initialSineFnData} from "./dataproviders/randomOrdinalData.ts";
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
} from 'react-resizable-grid-layout';
import {lightTheme, type Theme} from "../ui/Themes.ts";

import type {Datum, TimeSeries} from "../charts/series/timeSeries";
import {regexFilter} from "../charts/filters/regexFilter";
import {Chart} from "../charts/Chart";
import {AxisLocation, type OrdinalStringAxis} from '../charts/axes/axes';
import {ContinuousAxis} from "../charts/axes/ContinuousAxis";
import {OrdinalAxis} from "../charts/axes/OrdinalAxis";
import {Tracker} from "../charts/trackers/Tracker";
import {Tooltip} from "../charts/tooltips/Tooltip";
import {type BaseSeries, seriesFrom} from "../charts/series/baseSeries";
import {BarPlot} from "../charts/plots/BarPlot";
import {BarPlotTooltipContent} from "../charts/tooltips/BarPlotTooltipContent";
import {type OrdinalChartData} from "../charts/observables/ordinals";
import {type OrdinalDatum} from "../charts/series/ordinalSeries";
import {type BarSeriesStyle, defaultBarSeriesStyle} from "../charts/styling/barPlotStyle";
import {type WindowedOrdinalStats} from "../charts/datasources/ordinalDataSource";
import {noop} from "../charts/utils";
import {assignAxes} from "../charts/plots/plot";
import {buttonStyle} from "../ui/utils";
import type {OrdinalAxisRange} from "../charts/axes/OrdinalAxisRange.ts";
import {TrackerLabelLocation} from "../charts/trackers/trackerUtils.ts";
import {defaultMargin} from "../charts/hooks/defaultPlotDimensions";
import {ExpandableControlBar} from "../ui/ExpandableControlBar.tsx";
import {CommonExecutionControls} from "./controls/CommonExecutionControls.tsx";
import {
    AutoScaleIcon,
    HighlightAxesIcon,
    LagIcon,
    MeanIcon,
    MinValueIcon,
    TooltipIcon,
    TrackerIcon,
    ValueIcon,
    WindowedMeanIcon,
    WindowedMinValueIcon
} from "../ui/Icons.tsx";
import {CommonControls} from "./controls/CommonControls.tsx";
import {DropDataControl} from "./controls/DropDataControl.tsx";
import {LagDisplay} from "./controls/LagDisplay.tsx";
import {Divider} from "../ui/Divider.tsx";
import {DROP_AFTER_10_SEC, dropDataOptionForMs} from "./options/dropDataAfter.ts";
import {SeriesFilter} from "./controls/SeriesFilter.tsx";
import {ChartControlsHeader} from "./controls/ChartControlHeader.tsx";
import {ChartControls} from "./controls/ChartControls.tsx";
import {VerticalDivider} from "../ui/VerticalDivider.tsx";
import {BufferingControl} from "./controls/BufferingControl.tsx";
import {DataUpdateRateControl} from "./controls/DataUpdateRateControl.tsx";
import {NumberOfSeriesControl} from "./controls/NumberOfSeriesControl.tsx";
import {useBarChartStore} from "./appstate/barChartStore.ts";
// import {
//     AxisLocation,
//     CategoryAxis,
//     Chart,
//     ChartData,
//     ContinuousAxis,
//     Datum,
//     defaultLineStyle,
//     defaultMargin,
//     formatNumber,
//     formatTime,
//     RasterPlot,
//     RasterPlotTooltipContent,
//     regexFilter,
//     Series,
//     seriesFrom,
//     Tooltip,
//     Tracker,
//     TrackerLabelLocation
// } from "stream-charts"

/**
 * The properties
 */
interface Props {
    theme?: Theme
    timeWindow?: number
    initialData: Array<BaseSeries<Datum>>
    seriesHeight?: number
    plotWidth?: number
}

// The y-axes' domain. With auto-scaling on, the axes start out narrower, and grow (up to the
// limits) as the bars' values wander beyond them -- the example's values stay within [-1, 1], so
// with the usual domain, there would never be anything to grow for.
const Y_DOMAIN: [number, number] = [-1.1, 1.1]
const Y_AUTO_SCALE_DOMAIN: [number, number] = [-0.5, 0.5]
const Y_AUTO_SCALE_LIMITS: [number, number] = [-1.1, 1.1]

// calculates a unique chart ID when the module is loaded
const CHART_ID = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)

// generation parameters matching the initial data generated in routeData.ts, so that changing
// the number of series produces data consistent with the app's default initial data
const SERIES_TIME_INTERVAL = 1000
const SERIES_NUM_POINTS = 4

/**
 * Generates the initial (static) data for the specified number of series, named "HC 1" through
 * "HC {numberOfSeries}", matching the naming used for the chart's default initial data.
 * @param numberOfSeries The number of series for which to generate initial data
 * @return The generated initial data
 */
function initialDataForSeriesCount(numberOfSeries: number): Array<TimeSeries> {
    const seriesNames = Array.from({length: numberOfSeries}, (_, index) => `HC ${index + 1}`)
    return initialSineFnData(seriesNames, SERIES_TIME_INTERVAL, SERIES_NUM_POINTS)
}

/**
 * Converts each of the specified time-series to a base-series of ordinal data. Recall that a
 * `TimeSeries` is a `BaseSeries` of `Datum` which are (time, value)-pairs. The bar chart shows
 * the current (time, value) for each series (as well as stats). `OrdinalDatum` is a
 * (name, time, value)-tuple which we need for an ordinal chart. Hence the conversion.
 * @param data An array of time-series to plot
 * @return An array of base-series of ordinal data
 */
function initialDataFrom(data: Array<TimeSeries>): Array<BaseSeries<OrdinalDatum>> {
    return data.map(series => seriesFrom<OrdinalDatum>(series.name, series.data.map(datum => ({
        time: datum.x,
        ordinal: series.name,
        value: datum.y,
    }))))
}

/**
 * Compiles the filter's regex string into a `RegExp`, falling back to a match-everything
 * regex when the string isn't a valid regular expression. See StreamingScatterChart's identical
 * helper for why this lives outside the component (a stable reference, not recompiled by a
 * selector on every render).
 * @param filterValue The string representation of the regex
 * @return The compiled regex, or a match-everything regex when the string is invalid
 */
const filterFrom = (filterValue: string): RegExp => regexFilter(filterValue).getOrElse(new RegExp(''))

/**
 * An example wrapper to a bar chart. The chart's data comes from a data source held in the
 * app's store: Run/Pause start and stop the data source, which keeps ingesting even while this
 * chart is unmounted (e.g. on another page). The {@link Chart} updates itself with the new data
 * without causing React to re-render the component.
 * @param {Props} props The properties passed down from the parent
 * @return {Element} The streaming raster chart
 * @constructor
 */
export function StreamingBarChart(props: Props): JSX.Element {
    const {
        theme = lightTheme,
        initialData: originalInitialData = [],
    } = props

    // const chartId = useRef<number>(CHART_ID)

    // ----------------------------------------------------------------
    // GRAB STATE FROM STORE (zustand) -- see StreamingScatterChart for why the chart's settings
    // and subscription live here rather than in local useState: this store survives a route
    // change (unmount/remount), so navigating away and back doesn't reset the chart's settings,
    // and (via the `subscription` handed to <BarPlot>) doesn't lose in-flight streamed data.
    //
    // the data source owns the stream's subscription, the series, and their stats; it lives in the
    // store, so it keeps ingesting while this chart is unmounted (e.g. on another page)
    const dataSource = useBarChartStore(state => state.dataSource)
    const setInitialData = useBarChartStore(state => state.setInitialData)

    const running = useBarChartStore(state => state.running)
    const setRunning = useBarChartStore(state => state.setRunning)

    const filterValue = useBarChartStore(state => state.filterValue)
    const setFilterValue = useBarChartStore(state => state.setFilterValue)

    const visibility = useBarChartStore(state => state.visibility)
    const setVisibility = useBarChartStore(state => state.setVisibility)

    const dropAfterMs = useBarChartStore(state => state.dropAfterMs)
    const setDropAfterMs = useBarChartStore(state => state.setDropAfterMs)

    const numberOfSeries = useBarChartStore(state => state.numberOfSeries)
    const setNumberOfSeries = useBarChartStore(state => state.setNumberOfSeries)

    const dataUpdatePeriod = useBarChartStore(state => state.dataUpdatePeriod)
    const setDataUpdatePeriod = useBarChartStore(state => state.setDataUpdatePeriod)

    const windowingTime = useBarChartStore(state => state.windowingTime)
    const setWindowingTime = useBarChartStore(state => state.setWindowingTime)

    // which of the time-series statistics are shown in the plot
    const showMinMax = useBarChartStore(state => state.showMinMax)
    const setShowMinMax = useBarChartStore(state => state.setShowMinMax)
    const showValue = useBarChartStore(state => state.showValue)
    const setShowValue = useBarChartStore(state => state.setShowValue)
    const showMean = useBarChartStore(state => state.showMean)
    const setShowMean = useBarChartStore(state => state.setShowMean)
    const showWinMinMax = useBarChartStore(state => state.showWinMinMax)
    const setShowWinMinMax = useBarChartStore(state => state.setShowWinMinMax)
    const showWinMean = useBarChartStore(state => state.showWinMean)
    const setShowWinMean = useBarChartStore(state => state.setShowWinMean)

    const autoScaleYAxes = useBarChartStore(state => state.autoScaleYAxes)
    const setAutoScaleYAxes = useBarChartStore(state => state.setAutoScaleYAxes)
    // the auto-scaled y-axes' domains, kept in the store so that their growth survives navigating
    // away from the chart and back
    const y1AutoScaledDomain = useBarChartStore(state => state.y1AutoScaledDomain)
    const setY1AutoScaledDomain = useBarChartStore(state => state.setY1AutoScaledDomain)
    const y2AutoScaledDomain = useBarChartStore(state => state.y2AutoScaledDomain)
    const setY2AutoScaledDomain = useBarChartStore(state => state.setY2AutoScaledDomain)

    const zoomState = useBarChartStore(state => state.zoomState)
    const setZoomState = useBarChartStore(state => state.setZoomState)

    const reset = useBarChartStore(state => state.reset)
    //
    // ----------------------------------------------------------------

    const filter = useMemo(() => filterFrom(filterValue), [filterValue])

    // the series held by the data source (a new data source means new initial data)
    const initialData = useMemo(() => dataSource.seriesList(), [dataSource])

    // whether the store has already been seeded with the initial data from the props
    const seededInitialDataRef = useRef<boolean>(false)

    // holds the latest `resetZoom` handed back by <BarPlot> (see its `onZoomReset` prop), so
    // that clearing the chart can also clear the zoom -- see StreamingRasterChart's identical usage
    const resetZoomRef = useRef<() => void>(noop)
    const handleZoomReset = useCallback((resetZoom: () => void): void => {
        resetZoomRef.current = resetZoom
    }, [])

    // elapsed time
    const startTimeRef = useRef<number>(new Date().valueOf())
    const intervalRef = useRef<ReturnType<typeof setTimeout>>(undefined)
    const [elapsed, setElapsed] = useState<number>(0)

    // chart time
    const [chartTime, setChartTime] = useState<number>(0)

    /**
     * Called when the user changes the regular expression filter to filter the time-series
     * @param updatedFilter The updated the filter
     */
    function handleUpdateFilterValue(updatedFilter: string): void {
        // the filter's regex is compiled from the filter value (see `filter` above)
        setFilterValue(updatedFilter)
    }

    /**
     * Updates the chart time based on the observable data time
     * @param time The time from the observable data
     */
    function handleChartTimeUpdate(time: number): void {
        setChartTime(time)
    }

    /**
     * Called when the user changes the number of series. Regenerates the initial data so
     * it has the specified number of series (only available while the chart isn't running).
     * @param count The number of series
     */
    function handleNumberOfSeriesChange(count: number): void {
        setNumberOfSeries(count)
        setInitialData(initialDataFrom(initialDataForSeriesCount(count)))
    }

    function handleWindowingTimeChange(ms: number): void {
        setWindowingTime(ms)
    }

    function handleDataUpdatePeriodChange(ms: number): void {
        setDataUpdatePeriod(ms)
    }

    // seeds the store with the initial data handed in through the props (the store survives
    // remounts, so this only needs to happen when the store hasn't been seeded yet). The ref
    // guard keeps this from looping when the supplied initial data is itself empty.
    // eslint-disable-next-line react-hooks/refs
    if (!seededInitialDataRef.current && (initialData.length === 0)) {
        seededInitialDataRef.current = true
        setInitialData(initialDataFrom(originalInitialData))
        setNumberOfSeries(originalInitialData.length)
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

    /**
     * Clears the chart and initializes the zoom
     */
    function handleClearChart(): void {
        // set the state back to the initial state of the store, and then re-seed the
        // initial data (and number of series) because the reset clears it
        reset()
        setInitialData(initialDataFrom(originalInitialData))
        setNumberOfSeries(originalInitialData.length)

        // reset local state to its original state
        setElapsed(0)

        // the store reset above clears the saved zoom state, but the live plot keeps its own
        // (d3-zoom's scale on the canvas, and the axes' zoomed ranges) -- clear that too
        resetZoomRef.current()
    }

    // const inputStyle: CSSProperties = {
    //     backgroundColor: theme.backgroundColor,
    //     outlineStyle: 'none',
    //     borderColor: theme.color,
    //     borderStyle: 'solid',
    //     borderWidth: 1,
    //     borderRadius: 3,
    //     color: theme.color,
    //     fontSize: 12,
    //     padding: 4,
    //     margin: 6,
    //     marginRight: 20
    // }

    return (
        <Grid
            dimensionsSupplier={useGridCell}
            gridTemplateColumns={gridTrackTemplateBuilder()
                .addTrack(withFraction(1))
                .build()}
            gridTemplateRows={gridTrackTemplateBuilder()
                .addTrack(withPixels(70))
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
                            onClearClick={handleClearChart}
                        >
                            <LagIcon
                                color={elapsed - chartTime > 0 ? theme.color : theme.disabledBackgroundColor}
                                fill={elapsed - chartTime > 0 ? "#c64646" : "none"}
                            />
                            <TooltipIcon color={visibility.tooltip ? theme.color : theme.disabledBackgroundColor}/>
                            <TrackerIcon color={visibility.tracker ? theme.color : theme.disabledBackgroundColor}/>
                            <HighlightAxesIcon color={visibility.highlightAxes ? theme.color : theme.disabledBackgroundColor}/>
                            <AutoScaleIcon color={autoScaleYAxes ? theme.color : theme.disabledBackgroundColor}/>
                        </CommonExecutionControls>
                        <CommonControls>
                            <DropDataControl
                                theme={theme}
                                value={dropDataOptionForMs(dropAfterMs).getOrElse(DROP_AFTER_10_SEC)}
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
                                key={2}
                                checked={visibility.tracker && !running}
                                disabled={running}
                                label="tracker"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setVisibility({...visibility, tracker: !visibility.tracker})}
                            />
                            <Checkbox
                                key={8}
                                checked={visibility.highlightAxes}
                                label="highlight axes"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setVisibility({...visibility, highlightAxes: !visibility.highlightAxes})}
                            />
                            <Checkbox
                                key={9}
                                checked={autoScaleYAxes}
                                label="auto-scale y-axes"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setAutoScaleYAxes(!autoScaleYAxes)}
                            />
                        </CommonControls>
                    </ExpandableControlBar>
                    <ExpandableControlBar
                        expandButtonStyle={buttonStyle(theme)}
                        backgroundColor={theme.backgroundColor}
                        borderColor={theme.disabledBackgroundColor}
                        borderRadius={10}
                        minHeight={55}
                        autoExpandOnMouseEnter={false}
                    >
                        <ChartControlsHeader type={"header"} theme={theme}>
                            <div style={{paddingRight: 10}} >Stats Controls</div>
                            <VerticalDivider color={theme.disabledBackgroundColor} height="25%"/>
                            <ValueIcon color={showValue ? theme.color : theme.disabledColor}/>
                            <VerticalDivider color={theme.disabledBackgroundColor} height="25%"/>
                            <MinValueIcon color={showMinMax ? theme.color : theme.disabledColor}/>
                            <VerticalDivider color={theme.disabledBackgroundColor} height="25%"/>
                            <MeanIcon color={showMean ? theme.color : theme.disabledColor}/>
                            <VerticalDivider color={theme.disabledBackgroundColor} height="25%"/>
                            <WindowedMinValueIcon color={showWinMinMax ? theme.color : theme.disabledColor}/>
                            <VerticalDivider color={theme.disabledBackgroundColor} height="25%"/>
                            <WindowedMeanIcon color={showWinMean ? theme.color : theme.disabledColor}/>
                        </ChartControlsHeader>
                        <ChartControls type={"controls"}>
                            <Checkbox
                                key={7}
                                checked={showValue}
                                label="value"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setShowValue(!showValue)}
                                marginLeft={0}
                            />
                            <Checkbox
                                key={3}
                                checked={showMinMax}
                                label="min/max"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setShowMinMax(!showMinMax)}
                                marginLeft={0}
                            />
                            <Checkbox
                                key={4}
                                checked={showMean}
                                label="mean"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setShowMean(!showMean)}
                                marginLeft={0}
                            />
                            <Checkbox
                                key={5}
                                checked={showWinMinMax}
                                label="win min/max"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setShowWinMinMax(!showWinMinMax)}
                                marginLeft={0}
                            />
                            <Checkbox
                                key={6}
                                checked={showWinMean}
                                label="win mean"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setShowWinMean(!showWinMean)}
                                marginLeft={0}
                            />

                        </ChartControls>
                    </ExpandableControlBar>
                </div>
            </GridItem>
            <GridItem gridAreaName="chart">
                <Chart<OrdinalChartData, OrdinalDatum, BarSeriesStyle, WindowedOrdinalStats, OrdinalAxisRange, OrdinalStringAxis>
                    chartId={CHART_ID}
                    width={useGridCellWidth()}
                    height={useGridCellHeight()}
                    margin={{...defaultMargin, top: 60, bottom: 80, right: 75, left: 70}}
                    // svgStyle={{'background-color': 'pink'}}
                    color={theme.color}
                    backgroundColor={theme.backgroundColor}
                    seriesStyles={new Map<string, BarSeriesStyle>([
                        ['HC 1', {
                            ...defaultBarSeriesStyle('orange'),
                            lineWidth: 2,
                            minMaxBar: {
                                ...defaultBarSeriesStyle('orange').minMaxBar,
                                stroke: {
                                    ...defaultBarSeriesStyle('orange').minMaxBar.stroke,
                                    width: 0
                                }
                            }
                        } as BarSeriesStyle],
                        ['HC 14', {
                            ...defaultBarSeriesStyle(theme.name === 'light' ? 'blue' : 'gray'),
                            lineWidth: 3,
                            highlightWidth: 5,
                            minMaxBar: {
                                ...defaultBarSeriesStyle(theme.name === 'light' ? 'blue' : 'gray').minMaxBar,
                                widthFraction: 1
                            }

                        } as BarSeriesStyle],
                        ['HC 31', {
                            ...defaultBarSeriesStyle('green'),
                            lineWidth: 2,
                        } as BarSeriesStyle],
                    ])}
                    dataSource={dataSource}
                    seriesFilter={filter}
                    onUpdateChartTime={handleChartTimeUpdate}
                    windowingTime={windowingTime}
                    dataUpdatePeriod={dataUpdatePeriod}
                >
                    <OrdinalAxis
                        axisId="x-axis-1"
                        location={AxisLocation.Bottom}
                        categories={initialData.map(series => series.name)}
                        label="neuron"
                        axisTickStyle={{rotation: 90}}
                    />
                    <OrdinalAxis
                        axisId="x-axis-2"
                        location={AxisLocation.Top}
                        categories={initialData.map(series => series.name)}
                        label="neuron"
                        axisTickStyle={{rotation: 40}}
                    />
                    <ContinuousAxis
                        axisId="y-axis-1"
                        location={AxisLocation.Left}
                        domain={autoScaleYAxes ? Y_AUTO_SCALE_DOMAIN : Y_DOMAIN}
                        autoScale={autoScaleYAxes}
                        autoScaleMin={Y_AUTO_SCALE_LIMITS[0]}
                        autoScaleMax={Y_AUTO_SCALE_LIMITS[1]}
                        autoScaledDomain={y1AutoScaledDomain}
                        onAutoScale={setY1AutoScaledDomain}
                        label="ρ (mV)"
                    />
                    <ContinuousAxis
                        axisId="y-axis-2"
                        location={AxisLocation.Right}
                        domain={autoScaleYAxes ? Y_AUTO_SCALE_DOMAIN : Y_DOMAIN}
                        autoScale={autoScaleYAxes}
                        autoScaleMin={Y_AUTO_SCALE_LIMITS[0]}
                        autoScaleMax={Y_AUTO_SCALE_LIMITS[1]}
                        autoScaledDomain={y2AutoScaledDomain}
                        onAutoScale={setY2AutoScaledDomain}
                        label="ρ (mV)"
                    />
                    <Tracker
                        // todo add horizontal/vertical for track, or both, maybe a mode
                        visible={visibility.tracker}
                        trackerAxis={AxisLocation.Left}
                        labelLocation={TrackerLabelLocation.ByAxis}
                        labelFormatter={x => `${d3.format(".2f")(x)} mV`}
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
                        }}
                    >
                        <BarPlotTooltipContent ordinalUnits="mV"/>
                    </Tooltip>
                    <BarPlot
                        barMargin={1}
                        // dropDataAfter={5000000}
                        panEnabled={true}
                        zoomEnabled={true}
                        zoomKeyModifiersRequired={true}
                        // withCadenceOf={50}

                        // to have the upper axis zoom when the series zoom, we must have at
                        // least one series assigned to this axis.
                        axisAssignments={new Map([
                            ['HC 1', assignAxes("x-axis-2", "y-axis-2")],
                        ])}

                        showMinMaxBars={showMinMax}
                        showValueLines={showValue}
                        showMeanValueLines={showMean}
                        showWindowedMinMaxBars={showWinMinMax}
                        showWindowedMeanValueLines={showWinMean}
                        highlightAxesOnMouseOver={visibility.highlightAxes}
                        zoomState={zoomState}
                        onZoomStateChange={setZoomState}
                        onZoomReset={handleZoomReset}
                    />
                </Chart>
            </GridItem>
        </Grid>
    );
}
