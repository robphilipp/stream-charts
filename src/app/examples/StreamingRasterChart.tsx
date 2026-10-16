import {type JSX, useCallback, useLayoutEffect, useMemo, useRef, useState} from 'react';
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
} from 'react-resizable-grid-layout';
import {lightTheme, type Theme} from "../ui/Themes.ts";

import type {TimeSeries} from "../charts/series/timeSeries";
import {regexFilter} from "../charts/filters/regexFilter";
import {Chart} from "../charts/Chart";
import {AxisLocation, defaultLineStyle} from '../charts/axes/axes';
import {ContinuousAxis} from "../charts/axes/ContinuousAxis";
import {OrdinalAxis} from "../charts/axes/OrdinalAxis";
import {EmptyAxis} from "../charts/axes/EmptyAxis";
import {Tracker} from "../charts/trackers/Tracker";
import {Tooltip} from "../charts/tooltips/Tooltip";
import {RasterPlotTooltipContent} from "../charts/tooltips/RasterPlotTooltipContent";
import {formatNumber, noop} from '../charts/utils';
import {RasterPlot} from "../charts/plots/RasterPlot";
import {Legend} from "../charts/legends/Legend";
import {seriesFrom} from "../charts/series/baseSeries";
import {AxisInterval} from "../charts/axes/AxisInterval";
import * as d3 from "d3";
import {buttonStyle} from "../ui/utils";
import {TrackerLabelLocation} from "../charts/trackers/trackerUtils.ts";
import {LegendLocation} from "../charts/legends/constants";
import {defaultMargin} from "../charts/hooks/defaultPlotDimensions";
import {ExpandableControlBar} from "../ui/ExpandableControlBar.tsx";
import {CommonExecutionControls} from "./controls/CommonExecutionControls.tsx";
import {CommonControls} from "./controls/CommonControls.tsx";
import {EXTERNAL_LEGEND_WIDTH, LEGEND_ANIMATION_DURATION_MS, LegendControl} from "./controls/LegendControl.tsx";
import {DROP_AFTER_20_SEC, dropDataOptionForMs} from "./options/dropDataAfter.ts";
import {FilterIcon, HighlightAxesIcon, LagIcon, TooltipIcon, TrackerIcon} from "../ui/Icons.tsx";
import {SeriesFilter} from "./controls/SeriesFilter.tsx";
import {DropDataControl} from "./controls/DropDataControl.tsx";
import {LagDisplay} from "./controls/LagDisplay.tsx";
import {Divider} from "../ui/Divider.tsx";
import {CadenceControl} from "./controls/CadenceControl.tsx";
import {BufferingControl} from "./controls/BufferingControl.tsx";
import {DataUpdateRateControl} from "./controls/DataUpdateRateControl.tsx";
import {NumberOfSeriesControl} from "./controls/NumberOfSeriesControl.tsx";
import {initialRandomSpikeData} from "./dataproviders/randomSpikeData.ts";
import {SPIKE_MEAN_VALUE, SPIKE_VALUE_SPREAD, useRasterChartStore} from "./appstate/rasterChartStore.ts";
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
    timeWindow?: number;
    initialData: Array<TimeSeries>;
    seriesHeight?: number;
    plotWidth?: number;
}

// calculates a unique chart ID when the module is loaded
const CHART_ID = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)

const X_AXIS_ID = 'x-axis-1'

// generation parameters matching the initial data generated in routeData.ts, so that changing
// the number of series produces data consistent with the app's default initial data (the spikes'
// values come from the same constants as the streamed spikes', SPIKE_MEAN_VALUE and
// SPIKE_VALUE_SPREAD)
const SERIES_INITIAL_TIME = 10
const SERIES_UPDATE_PERIOD = 200
const SERIES_NUM_SPIKES = 10

/**
 * Generates the initial (static) data for the specified number of series, named "HC 1" through
 * "HC {numberOfSeries}", matching the naming used for the chart's default initial data.
 * @param numberOfSeries The number of series for which to generate initial data
 * @return The generated initial data
 */
function initialDataForSeriesCount(numberOfSeries: number): Array<TimeSeries> {
    const seriesNames = Array.from({length: numberOfSeries}, (_, index) => `HC ${index + 1}`)
    return initialRandomSpikeData(
        seriesNames, SERIES_INITIAL_TIME, SERIES_UPDATE_PERIOD, SERIES_NUM_SPIKES, SPIKE_MEAN_VALUE, SPIKE_VALUE_SPREAD
    )
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
 * An example wrapper to a raster chart. The chart's data comes from a data source held in the
 * app's store: Run/Pause start and stop the data source, which keeps ingesting even while this
 * chart is unmounted (e.g. on another page). The {@link Chart} updates itself with the new data
 * without causing React to re-render the component.
 * @param {Props} props The properties passed down from the parent
 * @return {Element} The streaming raster chart
 * @constructor
 */
export function StreamingRasterChart(props: Props): JSX.Element {
    const {
        theme = lightTheme,
        initialData: originalInitialData = [],
    } = props

    // ----------------------------------------------------------------
    // GRAB STATE FROM STORE (zustand) -- see StreamingScatterChart for why the chart's settings
    // and data source live here rather than in local useState: this store survives a route
    // change (unmount/remount), so navigating away and back doesn't reset the chart's settings,
    // and the data source (which owns the stream's subscription and the series) keeps ingesting
    // while this chart is unmounted.
    //
    const dataSource = useRasterChartStore(state => state.dataSource)
    const setInitialData = useRasterChartStore(state => state.setInitialData)

    const running = useRasterChartStore(state => state.running)
    const setRunning = useRasterChartStore(state => state.setRunning)

    const xAxisRange = useRasterChartStore(state => state.xAxisRange)
    const setXAxisRange = useRasterChartStore(state => state.setXAxisRange)

    const filterValue = useRasterChartStore(state => state.filterValue)
    const setFilterValue = useRasterChartStore(state => state.setFilterValue)

    const visibility = useRasterChartStore(state => state.visibility)
    const setVisibility = useRasterChartStore(state => state.setVisibility)

    const dropAfterMs = useRasterChartStore(state => state.dropAfterMs)
    const setDropAfterMs = useRasterChartStore(state => state.setDropAfterMs)

    const numberOfSeries = useRasterChartStore(state => state.numberOfSeries)
    const setNumberOfSeries = useRasterChartStore(state => state.setNumberOfSeries)

    const dataUpdatePeriod = useRasterChartStore(state => state.dataUpdatePeriod)
    const setDataUpdatePeriod = useRasterChartStore(state => state.setDataUpdatePeriod)

    const windowingTime = useRasterChartStore(state => state.windowingTime)
    const setWindowingTime = useRasterChartStore(state => state.setWindowingTime)

    const cadence = useRasterChartStore(state => state.cadence)
    const setCadence = useRasterChartStore(state => state.setCadence)

    const reset = useRasterChartStore(state => state.reset)
    //
    // ----------------------------------------------------------------

    const filter = useMemo(() => filterFrom(filterValue), [filterValue])

    // the series held by the data source (a new data source means new initial data)
    const initialData = useMemo(() => dataSource.seriesList(), [dataSource])

    // whether the store has already been seeded with the initial data from the props
    const seededInitialDataRef = useRef<boolean>(false)

    const [legendLocation, setLegendLocation] = useState<LegendLocation>(LegendLocation.EXTERNAL_CONTAINER)
    const legendContainerRef = useRef<HTMLDivElement>(null)
    const [externalLegendWidth, setExternalLegendWidth] = useState<number>(0)
    const externalLegendWidthRef = useRef<number>(0)

    // elapsed time
    const startTimeRef = useRef<number>(new Date().valueOf())
    const intervalRef = useRef<ReturnType<typeof setTimeout>>(undefined)
    const [elapsed, setElapsed] = useState<number>(0)

    // holds the latest `resetZoom` handed back by <RasterPlot> (see its `onZoomReset` prop), so
    // that clearing the chart can also clear d3-zoom's own accumulated scale/pan state -- see
    // StreamingScatterChart's identical usage for the full explanation
    const resetZoomRef = useRef<() => void>(noop)
    const handleZoomReset = useCallback((resetZoom: () => void): void => {
        resetZoomRef.current = resetZoom
    }, [])

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

    function initialDataFrom(data: Array<TimeSeries>): Array<TimeSeries> {
        return data.map(series => seriesFrom(series.name, series.data.slice()))
    }

    /**
     * Called when the user changes the regular expression filter
     * @param updatedFilter The updated the filter
     */
    function handleUpdateFilterValue(updatedFilter: string): void {
        // the store compiles the regex from the filter value
        setFilterValue(updatedFilter)
    }

    /**
     * Updates the time from the chart (the max value of the axes ranges)
     * @param times A map associating the axis with its time range
     */
    function handleChartTimeUpdate(times: Map<string, AxisInterval>): void {
        // IMPORTANT: only call the store setter when the value has actually changed -- see
        // StreamingScatterChart's identical guard for the full explanation
        const xAxisInterval = times.get(X_AXIS_ID)
        if (xAxisInterval) {
            const [start, end] = xAxisInterval.asTuple()
            if (start !== xAxisRange[0] || end !== xAxisRange[1]) {
                setXAxisRange([start, end])
            }
        }
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

    function handleWindowingTimeChange(ms: number): void {
        setWindowingTime(ms)
    }

    function handleCadenceChange(ms: number): void {
        setCadence(ms)
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

        // the store reset above already restores the axis' own domain, but d3-zoom keeps its
        // own accumulated scale/pan state on the canvas element itself -- clear that too, or the
        // next zoom gesture would compute its new scale against the stale, pre-reset transform
        resetZoomRef.current()
    }

    // the chart time is the end of the x-axis range
    const chartTime = xAxisRange[1]

    return (
        <Grid
            dimensionsSupplier={useGridCell}
            gridTemplateColumns={gridTrackTemplateBuilder()
                .addTrack(withFraction(1))
                .addTrack(withPixels(Math.round(externalLegendWidth)))
                .build()}
            gridTemplateRows={gridTrackTemplateBuilder()
                .addTrack(withPixels(50))
                .addTrack(withFraction(1))
                .build()}
            gridTemplateAreas={gridTemplateAreasBuilder()
                .addArea("chart-controls", gridArea(1, 1))
                .addArea("chart", gridArea(2, 1))
                .addArea("chart-legend", gridArea(2, 2))
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
                            <TooltipIcon color={visibility.tooltip ? theme.color : theme.disabledBackgroundColor}/>
                            <TrackerIcon color={visibility.tracker ? theme.color : theme.disabledBackgroundColor}/>
                            <HighlightAxesIcon color={visibility.highlightAxes ? theme.color : theme.disabledBackgroundColor}/>
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
                                key={9}
                                checked={visibility.highlightAxes}
                                label="highlight axes"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setVisibility({...visibility, highlightAxes: !visibility.highlightAxes})}
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
                    margin={{...defaultMargin, top: 40, right: 35, left: 90, bottom: 50}}
                    // svgStyle={{'background-color': 'pink'}}
                    color={theme.color}
                    backgroundColor={theme.backgroundColor}
                    seriesStyles={new Map(initialData.map(
                        (data, index) => [data.name, {
                            ...defaultLineStyle(),
                            lineWidth: linewidthFor(data.name),
                            color: colorFor(index, initialData.length, theme.name),
                            highlightWidth: highlightLinewidthFor(data.name),
                            highlightColor: colorFor(index, initialData.length, theme.name),
                        }])
                    )}
                    // seriesStyles={new Map([
                    //     ['neuron1', {
                    //         ...defaultLineStyle(),
                    //         color: 'orange',
                    //         lineWidth: 2,
                    //         highlightColor: 'orange'
                    //     }],
                    //     ['neuron2', {
                    //         ...defaultLineStyle(),
                    //         color: 'orange',
                    //         lineWidth: 2,
                    //         highlightColor: 'orange'
                    //     }],
                    //     ['neuron3', {
                    //         ...defaultLineStyle(),
                    //         color: 'orange',
                    //         lineWidth: 2,
                    //         highlightColor: 'orange'
                    //     }],
                    //     ['neuron4', {
                    //         ...defaultLineStyle(),
                    //         color: 'orange',
                    //         lineWidth: 2,
                    //         highlightColor: 'orange'
                    //     }],
                    //     ['neuron5', {
                    //         ...defaultLineStyle(),
                    //         color: 'orange',
                    //         lineWidth: 2,
                    //         highlightColor: 'orange'
                    //     }],
                    //     ['neuron6', {
                    //         ...defaultLineStyle(),
                    //         color: theme.name === 'light' ? 'blue' : 'gray',
                    //         lineWidth: 3,
                    //         highlightColor: theme.name === 'light' ? 'blue' : 'gray',
                    //         highlightWidth: 5
                    //     }],
                    //     // ['test3', {...defaultLineStyle, color: 'dodgerblue', lineWidth: 1, highlightColor: 'dodgerblue', highlightWidth: 3}],
                    // ])}
                    dataSource={dataSource}
                    seriesFilter={filter}
                    onUpdateAxesBounds={handleChartTimeUpdate}
                    windowingTime={windowingTime}
                    dataUpdatePeriod={dataUpdatePeriod}
                >
                    <ContinuousAxis
                        axisId="x-axis-1"
                        location={AxisLocation.Bottom}
                        domain={[xAxisRange[0], xAxisRange[1]]}
                        label="t (ms)"
                        // font={{color: theme.color}}
                    />
                    <EmptyAxis
                        axisId="x-axis-2"
                        location={AxisLocation.Top}
                    />
                    <OrdinalAxis
                        axisId="y-axis-1"
                        location={AxisLocation.Left}
                        categories={initialData.map(series => series.name)}
                        label="Neuron ID"
                    />
                   <EmptyAxis
                        axisId="y-axis-2"
                        location={AxisLocation.Right}
                    />
                    <Tracker
                        visible={visibility.tracker}
                        labelLocation={TrackerLabelLocation.ByAxis}
                        labelFormatter={x => `${d3.format(",.0f")(x)} ms`}
                        style={{color: theme.color}}
                        font={{color: theme.color}}
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
                        <RasterPlotTooltipContent
                            xFormatter={value => formatNumber(value, " ,.0f") + ' ms'}
                            yFormatter={value => formatNumber(value, " ,.1f") + ' mV'}
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
                            padding: 15,
                        }}
                    />
                    <RasterPlot
                        // axisAssignments={new Map([
                        //     // ['test', assignAxes("x-axis-1", "y-axis-1")],
                        //     // ['neuron1', assignAxes("x-axis-2", "y-axis-2")],
                        //     // ['neuron2', assignAxes("x-axis-2", "y-axis-2")],
                        //     // ['neuron3', assignAxes("x-axis-2", "y-axis-2")],
                        //     // ['neuron4', assignAxes("x-axis-2", "y-axis-2")],
                        //     // ['neuron5', assignAxes("x-axis-2", "y-axis-2")],
                        //     // ['neuron6', assignAxes("x-axis-2", "y-axis-2")],
                        //     // ['test3', assignAxes("x-axis-1", "y-axis-1")],
                        // ])}
                        spikeMargin={1}
                        panEnabled={true}
                        zoomEnabled={true}
                        zoomKeyModifiersRequired={true}
                        withCadenceOf={cadence > 0 ? cadence : undefined}
                        highlightAxesOnMouseOver={visibility.highlightAxes}
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

function colorFor(index: number, numSeries: number, themeName: string): string {
    const ratio = index / numSeries / 2
    return themeName === 'light' ?
        d3.interpolateRdBu(ratio > 0.25 ? ratio + 0.5 : ratio) :
        d3.interpolateRdBu(ratio + 0.25)
}

function linewidthFor(name: string): number {
    if (name === 'test1') return 1
    if (name === 'test2' || name === 'test3') return 3

    return 1
}

function highlightLinewidthFor(name: string): number {
    if (name === 'test1') return 3
    if (name === 'test2' || name === 'test3') return 5

    return 3
}
