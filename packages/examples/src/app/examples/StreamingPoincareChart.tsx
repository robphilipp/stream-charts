import {type CSSProperties, type JSX, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {gaussMapFn, logisticMapFn, tentMapFn} from "./dataproviders/randomIterateData.ts";
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
import type {Datum} from "../charts/series/timeSeries";
import {type BaseSeries, seriesFrom} from "../charts/series/baseSeries";
import {Chart} from "../charts/Chart";
import {AxisLocation, defaultLineStyle} from '../charts/axes/axes';
import {ContinuousAxis} from "../charts/axes/ContinuousAxis";
import {Tracker} from "../charts/trackers/Tracker";
import {Tooltip} from "../charts/tooltips/Tooltip";
import {PoincarePlotTooltipContent} from "../charts/tooltips/PoincarePlotTooltipContent";
import {formatNumber, noop} from '../charts/utils';
import {PoincarePlot} from "../charts/plots/PoincarePlot";
import type {IterateDatum, IterateSeries} from "../charts/series/iterateSeries";
import * as d3 from "d3";
import {lightTheme, type Theme} from "../ui/Themes.ts";
import {buttonStyle} from "../ui/utils";
import {TrackerLabelLocation} from "../charts/trackers/trackerUtils.ts";
import {defaultMargin} from "../charts/hooks/defaultPlotDimensions";
import {DROP_AFTER_20_SEC, dropDataOptionForMs} from "./options/dropDataAfter.ts";
import {DropDataControl} from "./controls/DropDataControl.tsx";
import {InterpolationControl} from "./controls/InterpolationControl.tsx";
import {interpolationFactoryFor} from "./options/interpolations.ts";
import {iteratesGenerator, type IterateFunction, usePoincareChartStore} from "./appstate/poincareChartStore.ts";
import {ExpandableControlBar} from "../ui/ExpandableControlBar.tsx";
import {CommonExecutionControls} from "./controls/CommonExecutionControls.tsx";
import {
    ColorizedLinesIcon,
    GaussMapIcon,
    HighlightAxesIcon,
    LagIcon,
    LogisticMapIcon,
    TentMapIcon,
    TooltipIcon,
    TrackerIcon
} from "../ui/Icons.tsx";
import {LineColorsControl} from "./controls/LineColorsControl.tsx";
import {CommonControls} from "./controls/CommonControls.tsx";
import {LagDisplay} from "./controls/LagDisplay.tsx";
import {Divider} from "../ui/Divider.tsx";
import {DropDown, type DropDownOption} from "../ui/DropDown.tsx";
// import {
//     assignAxes,
//     AxisLocation,
//     Chart,
//     ChartData,
//     ContinuousAxis,
//     defaultLineStyle,
//     defaultMargin,
//     formatNumber, formatTime,
//     regexFilter,
//     PoincarePlot,
//     PoincarePlotTooltipContent,
//     Series,
//     seriesFrom,
//     Tooltip,
//     Tracker,
//     TrackerLabelLocation
// } from "stream-charts";

//
// By default, the iterates plot shows f[n](x) versus f[n+1](x). Generally, given a lag "m",
// the plot can show f[n](x) versus f[n+m](x).
//
const LAG_N: Map<string, number> = new Map<string, number>([
    ['lag = 1', 1], ['lag = 2', 2], ['lag = 3', 3], ['lag = 4', 4], ['lag = 5', 5]
])

//
// iterate functions for Poincare plots
//
type IterateFunctionCallback = (fn: IterateFunction) => void
type IterateFunctionInfo = {
    inputFn: (callback: IterateFunctionCallback, theme: Theme) => JSX.Element,
    range: [start: number, end: number]
}

/**
 * The style of an iterate function's parameter fields: the theme's colors
 * @param theme The theme
 * @return The text field's style
 */
const inputStyleFor = (theme: Theme): CSSProperties => ({
    backgroundColor: theme.backgroundColor,
    outlineStyle: 'none',
    borderColor: theme.color,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 3,
    color: theme.color,
    fontSize: 12,
    padding: 4,
    margin: 6,
    marginLeft: 0,
    marginRight: 20,
})

// input components are at the end of the file
const ITERATE_FUNCTIONS: Map<string, IterateFunctionInfo> = new Map([
    ['Tent Map', {
        inputFn: (callback: IterateFunctionCallback, theme: Theme) => (
            <TentMapGenerator onFunctionChange={callback} theme={theme}/>),
        range: [-0.05, 1.05]
    }],
    ['Logistic Map', {
        inputFn: (callback: IterateFunctionCallback, theme: Theme) => (
            <LogisticMapGenerator onFunctionChange={callback} theme={theme}/>),
        range: [-0.05, 1.05]
    }],
    ['Gauss Map', {
        inputFn: (callback: IterateFunctionCallback, theme: Theme) => (
            <GaussMapGenerator onFunctionChange={callback} theme={theme}/>),
        range: [-1.05, 1.05]
    }],
])

const DEFAULT_ITER_FUNC = Array.from(ITERATE_FUNCTIONS.entries())[0]

// the drop-down options for the lag and the iterate function (each named and valued by its key)
const LAG_OPTIONS: Array<DropDownOption<string>> = Array.from(LAG_N.keys()).map(name => ({value: name, label: name}))
const ITERATE_FUNCTION_OPTIONS: Array<DropDownOption<string>> = Array.from(ITERATE_FUNCTIONS.keys())
    .map(name => ({value: name, label: name}))

// calculates a unique chart ID when the module is loaded
const CHART_ID = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)

/**
 * The properties
 */
/**
 * The properties of the Poincaré example
 */
interface Props {
    // the theme (defaults to the light theme)
    theme?: Theme
    // (unused)
    timeWindow?: number
    // the seeds (initial values) of the iterates
    initialData: Array<BaseSeries<Datum>>
    // (unused)
    plotHeight?: number
    // (unused)
    plotWidth?: number
}

/**
 * Example of a streaming Poincare chart that shows iterate functions plotted as f[n](x) versus f[n+m](x).
 * I've added a few iterate functions: tent-map, logistic-map, and Gauss-map, with parameter inputs so that
 * you can play with the functions interactively.
 * @param props The props
 * @return The example
 */
export function StreamingPoincareChart(props: Props): JSX.Element {
    const {
        theme = lightTheme,
        initialData = [],
    } = props

    const chartId = useRef<number>(CHART_ID)

    // the seed (initial) value for each series, from which each run iterates (never mutated)
    const seeds = useMemo(
        () => initialData.map(series => seriesFrom<Datum>(series.name, series.data.slice())),
        [initialData]
    )

    // ----------------------------------------------------------------
    // GRAB STATE FROM STORE (zustand) -- the store survives a route change (unmount/remount), so
    // navigating away and back keeps the chart's settings, and its data source (which owns the
    // stream's subscription and the iterates) keeps ingesting while this chart is unmounted
    //
    const dataSource = usePoincareChartStore(state => state.dataSource)
    const setInitialData = usePoincareChartStore(state => state.setInitialData)
    const running = usePoincareChartStore(state => state.running)
    const setRunning = usePoincareChartStore(state => state.setRunning)

    const visibility = usePoincareChartStore(state => state.visibility)
    const setVisibility = usePoincareChartStore(state => state.setVisibility)
    const highlightAxes = usePoincareChartStore(state => state.highlightAxes)
    const setHighlightAxes = usePoincareChartStore(state => state.setHighlightAxes)
    // whether the lines connecting the points are colorized, and their start and end colors
    const colorizeLines = usePoincareChartStore(state => state.colorizeLines)
    const setColorizeLines = usePoincareChartStore(state => state.setColorizeLines)
    const lineStartColor = usePoincareChartStore(state => state.lineStartColor)
    const setLineStartColor = usePoincareChartStore(state => state.setLineStartColor)
    const lineEndColor = usePoincareChartStore(state => state.lineEndColor)
    const setLineEndColor = usePoincareChartStore(state => state.setLineEndColor)
    const lineColorSteps = usePoincareChartStore(state => state.lineColorSteps)
    const setLineColorSteps = usePoincareChartStore(state => state.setLineColorSteps)

    const selectedInterpolationName = usePoincareChartStore(state => state.selectedInterpolationName)
    const setSelectedInterpolationName = usePoincareChartStore(state => state.setSelectedInterpolationName)
    const dropAfterMs = usePoincareChartStore(state => state.dropAfterMs)
    const setDropAfterMs = usePoincareChartStore(state => state.setDropAfterMs)
    const selectedLagN = usePoincareChartStore(state => state.selectedLagN)
    const setSelectedLagN = usePoincareChartStore(state => state.setSelectedLagN)
    const selectedIterateFunction = usePoincareChartStore(state => state.selectedIterateFunction)
    const setSelectedIterateFunction = usePoincareChartStore(state => state.setSelectedIterateFunction)
    const axesRange = usePoincareChartStore(state => state.axesRange)
    const setAxesRange = usePoincareChartStore(state => state.setAxesRange)
    const zoomState = usePoincareChartStore(state => state.zoomState)
    const setZoomState = usePoincareChartStore(state => state.setZoomState)
    //
    // ----------------------------------------------------------------

    const interpolation = useMemo(() => interpolationFactoryFor(selectedInterpolationName), [selectedInterpolationName])
    const lagN = LAG_N.get(selectedLagN) || 1

    // holds the latest `resetZoom` handed back by <PoincarePlot> (see its `onZoomReset` prop), so
    // that clearing the chart also resets the zoom
    const resetZoomRef = useRef<() => void>(noop)
    const handleZoomReset = useCallback((resetZoom: () => void): void => {
        resetZoomRef.current = resetZoom
    }, [])

    // the iterate function is set by its parameter-input component (which calls back with the
    // function whenever its parameters change, including on mount)
    const [iterateFunction, setIterateFunction] = useState<IterateFunction>(() => tentMapFn(1.8))

    // the parameter-input component for the selected iterate function
    const iterFuncInput = useMemo(
        () => (ITERATE_FUNCTIONS.get(selectedIterateFunction) || DEFAULT_ITER_FUNC[1]).inputFn(
            (iterFn: IterateFunction) => setIterateFunction(() => iterFn),
            theme
        ),
        [selectedIterateFunction, theme]
    )

    /**
     * Creates the (empty) iterate series, one for each seed -- the iterates are generated from the
     * seeds once the chart runs
     * @return An empty iterate series for each seed
     */
    const emptyIterates = (): Array<IterateSeries> => seeds.map(series => seriesFrom<IterateDatum>(series.name, []))

    // seeds the store's data source with the (empty) iterate series (the store survives remounts,
    // so this only needs to happen when the store hasn't been seeded yet). The ref guard keeps this
    // from looping when there are no seeds.
    const seededRef = useRef<boolean>(false)
    if (!seededRef.current && dataSource.seriesList().length === 0) {
        seededRef.current = true
        setInitialData(emptyIterates())
    }

    // elapsed time
    const startTimeRef = useRef<number>(new Date().valueOf())
    const intervalRef = useRef<ReturnType<typeof setTimeout>>(undefined)
    const [elapsed, setElapsed] = useState<number>(0)

    // chart time
    const [chartTime, setChartTime] = useState<number>(0)

    /**
     * Called when the interpolation is change for the chart. Converts the selected
     * interpolation name into the d3 curve-factory.
     * @param selectedInterpolation The name of the selected interpolation
     */
    function handleInterpolationChange(selectedInterpolation: string): void {
        // the interpolation's curve factory is derived from its name (see `interpolation` above)
        setSelectedInterpolationName(selectedInterpolation)
    }

    // /**
    //  * When the user changes the time after which to drop points that are older than that time
    //  * @param selectedDropAfterName The name (in the select dropdown) representing the drop-after time
    //  */
    // function handleDropAfterChange(selectedDropAfterName: string): void {
    //     const dropAfter = DROP_DATA_AFTER_SECONDS.get(selectedDropAfterName) || Infinity
    //     setDropAfterMs(dropAfter)
    //     // setSelectedDropAfterName(selectedDropAfterName)
    // }

    /**
     * The lag of the iterates plot (e.g. f[n](x) vs f[n+N](x), where N is the lag)
     * @param selectedLagN The name in the select dropdown that represents the lag N
     */
    function handleUpdateLag(selectedLagN: string): void {
        // the lag is derived from its name (see `lagN` above)
        setSelectedLagN(selectedLagN)
    }

    /**
     * Updates the plot, axis bounds, and clears the data when the user selects a different
     * iterate function from the select dropdown
     * @param iterateFunction The name of the iterate function to use
     */
    function handleIterateFunctionChange(iterateFunction: string): void {
        setSelectedIterateFunction(iterateFunction)

        handleClearChart()

        const [start, end] = ITERATE_FUNCTIONS.get(iterateFunction)?.range || [0, 1]
        setAxesRange([start, end])
    }

    /**
     * Clears the chart and initializes the zoom
     */
    function handleClearChart(): void {
        // replaces the data source with a fresh (empty) one, which stops the current one
        setInitialData(emptyIterates())
        setElapsed(0)

        // and resets the zoom (the axes' bounds below don't change when the iterate function
        // stays the same, so nothing else would)
        resetZoomRef.current()

        const [start, end] = ITERATE_FUNCTIONS.get(selectedIterateFunction)?.range || [0, 1]
        setAxesRange([start, end])
    }

    /**
     * Updates the time from the chart (the max value of the axes ranges)
     * @param time The current max time
     */
    function handleChartTimeUpdate(time: number): void {
        setChartTime(time)
    }

    function handleRunPauseClick(): void {
        if (!running) {
            // each run iterates the selected function, at the selected lag, continuing from where the
            // iteration left off (or from the seeds, when there's no data yet)
            dataSource.setGenerator(iteratesGenerator(iterateFunction, lagN, seeds))
            startTimeRef.current = new Date().valueOf()
            setElapsed(0)
            intervalRef.current = setInterval(() => setElapsed(new Date().valueOf() - startTimeRef.current), 1000)
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current)
            intervalRef.current = undefined
        }
        setRunning(!running)
    }

    function selectedIterateIcon(): JSX.Element {
        switch (selectedIterateFunction) {
            case 'Gauss Map':
                return <GaussMapIcon color={theme.color}/>
            case 'Logistic Map':
                return <LogisticMapIcon color={theme.color}/>
            case 'Tent Map':
            default:
                return <TentMapIcon color={theme.color}/>
        }
    }

    return (
        <Grid
            dimensionsSupplier={useGridCell}
            gridTemplateColumns={gridTrackTemplateBuilder()
                .addTrack(withFraction(1))
                .build()}
            gridTemplateRows={gridTrackTemplateBuilder()
                .addTrack(withPixels(50))
                .addTrack(withFraction(1))
                .addTrack(withPixels(10))
                .build()}
            gridTemplateAreas={gridTemplateAreasBuilder()
                .addArea("chart-controls", gridArea(1, 1))
                .addArea("chart", gridArea(2, 1))
                .addArea("chart-bottom", gridArea(3, 1))
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
                            <HighlightAxesIcon color={highlightAxes ? theme.color : theme.disabledBackgroundColor}/>
                            {colorizeLines ?
                                <ColorizedLinesIcon color={theme.color} startColor={lineStartColor} endColor={lineEndColor}/> :
                                <ColorizedLinesIcon color={theme.disabledBackgroundColor}/>
                            }
                            {selectedIterateIcon()}
                        </CommonExecutionControls>
                        <CommonControls>
                            <DropDataControl
                                theme={theme}
                                value={dropDataOptionForMs(dropAfterMs).getOrElse(DROP_AFTER_20_SEC)}
                                handleDropAfterChange={setDropAfterMs}
                                disabled={running}
                            />
                            <LagDisplay
                                theme={theme}
                                lag={elapsed - chartTime}
                            />
                            <Divider theme={theme}/>
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
                                key={3}
                                checked={highlightAxes}
                                label="highlight axes"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setHighlightAxes(!highlightAxes)}
                            />
                            <InterpolationControl
                                theme={theme}
                                selectedInterpolationName={selectedInterpolationName}
                                handleInterpolationChange={handleInterpolationChange}
                            />
                            <LineColorsControl
                                theme={theme}
                                colorizeLines={colorizeLines}
                                setColorizeLines={setColorizeLines}
                                startColor={lineStartColor}
                                setStartColor={setLineStartColor}
                                endColor={lineEndColor}
                                setEndColor={setLineEndColor}
                                steps={lineColorSteps}
                                setSteps={setLineColorSteps}
                            />
                            <Divider theme={theme}/>
                            <DropDown
                                theme={theme}
                                name="lagN"
                                options={LAG_OPTIONS}
                                value={selectedLagN}
                                onChange={handleUpdateLag}
                                disabled={running}
                            />
                            <Divider theme={theme}/>
                            <DropDown
                                theme={theme}
                                name="iterate_function"
                                options={ITERATE_FUNCTION_OPTIONS}
                                value={selectedIterateFunction}
                                onChange={handleIterateFunctionChange}
                                disabled={running}
                            />
                            <div>{iterFuncInput}</div>
                        </CommonControls>
                    </ExpandableControlBar>
                </div>
            </GridItem>
            <GridItem gridAreaName="chart">
                <Chart
                    chartId={chartId.current}
                    width={useGridCellWidth()}
                    height={useGridCellHeight()}
                    margin={{...defaultMargin, top: 40, bottom: 30, right: 60}}
                    // svgStyle={{'background-color': 'pink'}}
                    color={theme.color}
                    backgroundColor={theme.backgroundColor}
                    seriesStyles={new Map([
                        ['test1', {
                            ...defaultLineStyle(),
                            color: 'orange',
                            lineWidth: 1,
                            highlightColor: 'orange'
                        }],
                        ['test2', {
                            ...defaultLineStyle(),
                            color: theme.name === 'light' ? 'blue' : 'gray',
                            lineWidth: 1,
                            highlightColor: theme.name === 'light' ? 'blue' : 'gray',
                            highlightWidth: 5
                        }],
                        ['test3', {
                            ...defaultLineStyle(),
                            color: theme.name === 'light' ? 'red' : 'gray',
                            lineWidth: 1,
                            highlightColor: theme.name === 'light' ? 'dodgerblue' : 'gray',
                            highlightWidth: 5
                        }],
                    ])}
                    dataSource={dataSource}
                    onUpdateChartTime={handleChartTimeUpdate}
                    windowingTime={25}
                >
                    <ContinuousAxis
                        axisId="x-axis-1"
                        location={AxisLocation.Bottom}
                        domain={axesRange}
                        label="f[n](x)"
                        updateAxisBasedOnDomainValues={false}
                    />
                    <ContinuousAxis
                        axisId="y-axis-1"
                        location={AxisLocation.Left}
                        domain={axesRange}
                        label={`f[n+${lagN}](x)`}
                        updateAxisBasedOnDomainValues={false}
                    />
                    <ContinuousAxis
                        axisId="x-axis-2"
                        location={AxisLocation.Top}
                        domain={axesRange}
                        label="f[n](x)"
                        updateAxisBasedOnDomainValues={false}
                    />
                    <ContinuousAxis
                        axisId="y-axis-2"
                        location={AxisLocation.Right}
                        domain={axesRange}
                        label={`f[n+${lagN}](x)`}
                        updateAxisBasedOnDomainValues={false}
                    />
                    <Tracker
                        key="tracker-x-axis"
                        visible={visibility.tracker}
                        // labelLocation={TrackerLabelLocation.Nowhere}
                        labelLocation={TrackerLabelLocation.ByAxis}
                        trackerAxis={AxisLocation.Bottom}
                        labelFormatter={x => `${d3.format(",.3f")(x)}`}
                        style={{color: theme.color}}
                        font={{color: theme.color}}
                        // onTrackerUpdate={update => console.dir("bottom", update)}
                    />
                    <Tracker
                        key="tracker-y-axis"
                        visible={visibility.tracker}
                        // labelLocation={TrackerLabelLocation.Nowhere}
                        labelLocation={TrackerLabelLocation.ByAxis}
                        trackerAxis={AxisLocation.Left}
                        labelFormatter={x => `${d3.format(",.3f")(x)}`}
                        style={{color: theme.color}}
                        font={{color: theme.color}}
                        // onTrackerUpdate={update => console.dir("left", update)}
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
                        <PoincarePlotTooltipContent
                            xLabel="t (ms)"
                            yLabel="f(x)"
                            yValueFormatter={value => formatNumber(value, " ,.4f")}
                        />
                    </Tooltip>
                    <PoincarePlot
                        interpolation={interpolation}
                        panEnabled={true}
                        zoomEnabled={true}
                        zoomKeyModifiersRequired={true}
                        // withCadenceOf={30}
                        highlightAxesOnMouseOver={highlightAxes}
                        colorizeLines={colorizeLines}
                        lineStartColor={lineStartColor}
                        lineEndColor={lineEndColor}
                        lineColorSteps={lineColorSteps}
                        zoomState={zoomState}
                        onZoomStateChange={setZoomState}
                        onZoomReset={handleZoomReset}
                    />
                </Chart>
            </GridItem>
        </Grid>
    );
}


/**
 * The tent map's parameter field (µ, initially 1.8), which hands the tent-map function for the
 * entered µ to the callback (when it mounts, and whenever µ changes)
 * @param props The callback for the iterate function, and the theme
 * @return The labeled parameter field
 */
function TentMapGenerator(props: { onFunctionChange: (fn: IterateFunction) => void, theme?: Theme }): JSX.Element {
    const {theme = lightTheme, onFunctionChange} = props

    const [mu, setMu] = useState<string>('1.8')

    // we need the useEffect so that on mount, we issue the callback with the new iterate
    // function
    useEffect(() => {
        onFunctionChange(tentMapFn(parseFloat(mu)))
    }, [mu, onFunctionChange]);

    return (
        <label style={{color: theme.color}}>µ = <input
            type="text"
            value={mu}
            onChange={event => setMu(event.currentTarget.value)}
            style={inputStyleFor(theme)}
        /></label>
    )
}

/**
 * The logistic map's parameter field (r, initially 4.0), which hands the logistic-map function for
 * the entered r to the callback (when it mounts, and whenever r changes)
 * @param props The callback for the iterate function, and the theme
 * @return The labeled parameter field
 */
function LogisticMapGenerator(props: { onFunctionChange: (fn: IterateFunction) => void, theme?: Theme }): JSX.Element {
    const {theme = lightTheme, onFunctionChange} = props

    const [r, setR] = useState<string>('4.0')

    // we need the useEffect so that on mount, we issue the callback with the new iterate
    // function
    useEffect(() => {
        onFunctionChange(logisticMapFn(parseFloat(r)))
    }, [r, onFunctionChange]);

    return (
        <label style={{color: theme.color}}>r = <input
            type="text"
            value={r}
            onChange={event => setR(event.currentTarget.value)}
            style={inputStyleFor(theme)}
        /></label>
    )
}

/**
 * The Gauss map's parameter fields (α, initially 4.90, and β, initially -0.52), which hand the
 * Gauss-map function for the entered α and β to the callback (when it mounts, and whenever either
 * changes)
 * @param props The callback for the iterate function, and the theme
 * @return The labeled parameter fields
 */
function GaussMapGenerator(props: { onFunctionChange: (fn: IterateFunction) => void, theme?: Theme }): JSX.Element {
    const {theme = lightTheme, onFunctionChange} = props

    const [alpha, setAlpha] = useState<string>('4.90')
    const [beta, setBeta] = useState<string>('-0.52')

    // we need the useEffect so that on mount, we issue the callback with the new iterate
    // function
    useEffect(() => {
        onFunctionChange(gaussMapFn(parseFloat(alpha), parseFloat(beta)))
    }, [alpha, beta, onFunctionChange]);

    return <div>
        <div>
            <label style={{color: theme.color}}>α = <input
                type="text"
                value={alpha}
                onChange={event => setAlpha(event.currentTarget.value)}
                style={{...inputStyleFor(theme)}}
            /></label>
        </div>
        <div>
            <label style={{color: theme.color}}>β = <input
                type="text"
                value={beta}
                onChange={event => setBeta(event.currentTarget.value)}
                style={inputStyleFor(theme)}
            /></label>
        </div>
    </div>
}
