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
import {
    Chart,
    defaultLineStyle,
    defaultMargin,
    type GeoDatum,
    GeoPlot,
    GeoPlotTooltipContent,
    type GeoProjectionName,
    Legend,
    LegendLocation,
    noop,
    regexFilter,
    type SeriesLineStyle,
    Tooltip,
} from "stream-charts"
import {lightTheme, type Theme} from "../ui/Themes.ts"
import Checkbox from "../ui/Checkbox"
import {buttonStyle} from "../ui/utils"
import {ExpandableControlBar} from "../ui/ExpandableControlBar.tsx"
import {CommonExecutionControls} from "./controls/CommonExecutionControls.tsx"
import {FilterIcon, MarkersIcon, TooltipIcon} from "../ui/Icons.tsx"
import {CommonControls} from "./controls/CommonControls.tsx"
import {DropDataControl} from "./controls/DropDataControl.tsx"
import {Divider} from "../ui/Divider.tsx"
import {SeriesFilter} from "./controls/SeriesFilter.tsx"
import {DROP_AFTER_100_SEC, dropDataOptionForMs} from "./options/dropDataAfter.ts"
import {BufferingControl} from "./controls/BufferingControl.tsx"
import {DataUpdateRateControl} from "./controls/DataUpdateRateControl.tsx"
import {ProjectionControl} from "./controls/ProjectionControl.tsx"
import {GeoAggregateControls} from "./controls/GeoAggregateControls.tsx"
import {BY_GRID_CELL, DEFAULT_DATA_UPDATE_PERIOD, MEASURE_NAMES, ROLLUP_NAMES, useGeoChartStore} from "./appstate/geoChartStore.ts"
import {initialGeoData, type SensorReading, SEISMIC, VESSELS, WEATHER} from "./dataproviders/randomGeoData.ts"
import {COUNTRY_BORDERS, LAND} from "./dataproviders/worldMap.ts"

const CHART_ID = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)

// how much history (ms) the example starts with
const INITIAL_HISTORY = 10_000

// how long (ms) readings take to fade (when fading older readings)
const FADE_DURATION = 30_000

// how fast (degrees per second) the globe turns (when it turns by itself)
const AUTO_ROTATE_SPEED = 6

// the readings' colors by status (when coloring by status; "ok" readings keep their series' color)
const STATUS_COLORS: Record<SensorReading['status'], string | undefined> = {
    ok: undefined,
    warning: '#f08a3b',
    alarm: '#d62728',
}

/**
 * The radius of a reading's marker, from its magnitude: a quake's magnitude, a wind speed (m/s),
 * or a vessel's speed (knots), each scaled to a similar range of sizes
 * @param datum The reading
 * @return The marker's radius (px)
 */
function radiusByMagnitude(datum: GeoDatum<SensorReading>): number {
    const {kind, magnitude} = datum.payload
    switch (kind) {
        case 'seismic':
            return 1 + magnitude * 1.2
        case 'weather':
            return 1.5 + magnitude / 6
        default:
            return 2.5
    }
}

// the series' colors, by theme (for the groups that are series, see `groupColorOf`)
const SERIES_COLORS = {
    light: new Map([[SEISMIC, '#9467bd'], [WEATHER, '#1f77b4'], [VESSELS, '#2ca02c']]),
    dark: new Map([[SEISMIC, '#c5a3ff'], [WEATHER, '#5bc0eb'], [VESSELS, '#7bd389']]),
}

/**
 * The colors of the groups' wedges, in the pies (without a "color by"): a series' color for the 10°
 * grid's groups, and the status colors for the alarms' and warnings' groups; any other group (e.g.
 * a sensor) gets one of the plot's categorical colors
 * @param theme The theme
 * @return The color of a group (by its name), or `undefined` for the plot's own choice
 */
const groupColorsFor = (theme: Theme): ((group: string) => string | undefined) => {
    const seriesColors = SERIES_COLORS[theme.name === 'light' ? 'light' : 'dark']
    return group => seriesColors.get(group) ?? STATUS_COLORS[group as SensorReading['status']]
}

/**
 * @param datum A reading
 * @return The reading's color by its status, or `undefined` (its series' color) when it's ok
 */
const colorByStatus = (datum: GeoDatum<SensorReading>): string | undefined => STATUS_COLORS[datum.payload.status]

/**
 * @param theme The theme
 * @return The series' styles (their colors), for the theme
 */
function seriesStylesFor(theme: Theme): Map<string, SeriesLineStyle> {
    const light = theme.name === 'light'
    const style = (color: string): SeriesLineStyle => ({...defaultLineStyle(), color, highlightColor: color})
    return new Map([
        [SEISMIC, style(light ? '#9467bd' : '#c5a3ff')],
        [WEATHER, style(light ? '#1f77b4' : '#5bc0eb')],
        [VESSELS, style(light ? '#2ca02c' : '#7bd389')],
    ])
}

/**
 * Compiles the filter's regex string into a `RegExp`, falling back to a match-everything regex
 * when the string isn't a valid regular expression
 * @param filterValue The string representation of the regex
 * @return The compiled regex
 */
const filterFrom = (filterValue: string): RegExp => regexFilter(filterValue).getOrElse(new RegExp(''))

/**
 * The properties of the geo example
 */
interface Props {
    // the theme (defaults to the light theme)
    theme?: Theme
}

/**
 * The geo-chart example: its control bar (run/pause, reset, and the settings), and a map (by
 * default a globe) of a random network of seismic stations, weather stations, and vessels,
 * streamed from the store's data source
 * @param props The theme
 * @return The example
 */
export function StreamingGeoChart(props: Props): JSX.Element {
    const {theme = lightTheme} = props

    // ----------------------------------------------------------------
    // GRAB STATE FROM STORE (zustand) -- the store survives a route change, and its data source
    // keeps ingesting while this chart is unmounted
    //
    const dataSource = useGeoChartStore(state => state.dataSource)
    const setInitialData = useGeoChartStore(state => state.setInitialData)
    const running = useGeoChartStore(state => state.running)
    const setRunning = useGeoChartStore(state => state.setRunning)

    const windowingTime = useGeoChartStore(state => state.windowingTime)
    const setWindowingTime = useGeoChartStore(state => state.setWindowingTime)
    const dataUpdatePeriod = useGeoChartStore(state => state.dataUpdatePeriod)
    const setDataUpdatePeriod = useGeoChartStore(state => state.setDataUpdatePeriod)
    const filterValue = useGeoChartStore(state => state.filterValue)
    const setFilterValue = useGeoChartStore(state => state.setFilterValue)
    const dropAfterMs = useGeoChartStore(state => state.dropAfterMs)
    const setDropAfterMs = useGeoChartStore(state => state.setDropAfterMs)

    const projection = useGeoChartStore(state => state.projection)
    const setProjection = useGeoChartStore(state => state.setProjection)
    const showGraticule = useGeoChartStore(state => state.showGraticule)
    const setShowGraticule = useGeoChartStore(state => state.setShowGraticule)
    const showBorders = useGeoChartStore(state => state.showBorders)
    const setShowBorders = useGeoChartStore(state => state.setShowBorders)
    const showTooltip = useGeoChartStore(state => state.showTooltip)
    const setShowTooltip = useGeoChartStore(state => state.setShowTooltip)
    const showLegend = useGeoChartStore(state => state.showLegend)
    const setShowLegend = useGeoChartStore(state => state.setShowLegend)
    const sizeByMagnitude = useGeoChartStore(state => state.sizeByMagnitude)
    const setSizeByMagnitude = useGeoChartStore(state => state.setSizeByMagnitude)
    const colorByStatusOn = useGeoChartStore(state => state.colorByStatus)
    const setColorByStatus = useGeoChartStore(state => state.setColorByStatus)
    const fadeOlder = useGeoChartStore(state => state.fadeOlder)
    const setFadeOlder = useGeoChartStore(state => state.setFadeOlder)
    const autoRotate = useGeoChartStore(state => state.autoRotate)
    const setAutoRotate = useGeoChartStore(state => state.setAutoRotate)
    const setGeoView = useGeoChartStore(state => state.setGeoView)
    const mode = useGeoChartStore(state => state.mode)
    const setMode = useGeoChartStore(state => state.setMode)
    const rollupName = useGeoChartStore(state => state.rollupName)
    const setRollupName = useGeoChartStore(state => state.setRollupName)
    const colorBy = useGeoChartStore(state => state.colorBy)
    const setColorBy = useGeoChartStore(state => state.setColorBy)
    // the view to restore when the chart mounts: read once, rather than subscribed to, since the
    // plot only reads it when it mounts (and reports every change of view to the store)
    const [geoView] = useState(() => useGeoChartStore.getState().geoView)
    //
    // ----------------------------------------------------------------

    const filter = useMemo(() => filterFrom(filterValue), [filterValue])
    const seriesStyles = useMemo(() => seriesStylesFor(theme), [theme])
    const groupColorOf = useMemo(() => groupColorsFor(theme), [theme])

    // seeds the store's data source with some history (the store survives remounts, so this only
    // needs to happen when it hasn't been seeded yet)
    const seededRef = useRef<boolean>(false)
    // eslint-disable-next-line react-hooks/refs
    if (!seededRef.current && dataSource.seriesList().length === 0) {
        seededRef.current = true
        setInitialData(initialGeoData(DEFAULT_DATA_UPDATE_PERIOD, INITIAL_HISTORY))
    }

    // holds the latest `resetZoom` handed back by <GeoPlot> (see its `onZoomReset` prop), so that
    // clearing the chart also resets the view (its rotation and zoom)
    const resetZoomRef = useRef<() => void>(noop)
    const handleZoomReset = useCallback((resetZoom: () => void): void => {
        resetZoomRef.current = resetZoom
    }, [])

    function handleClearClick(): void {
        // replaces the data source with a fresh one (which stops the current one), and resets the view
        setInitialData(initialGeoData(DEFAULT_DATA_UPDATE_PERIOD, INITIAL_HISTORY))
        resetZoomRef.current()
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
                            onRunPauseClick={() => setRunning(!running)}
                            onClearClick={handleClearClick}
                        >
                            <FilterIcon color={filterValue.length > 0 ? theme.color : theme.disabledBackgroundColor}/>
                            <TooltipIcon color={showTooltip ? theme.color : theme.disabledBackgroundColor}/>
                            <MarkersIcon color={sizeByMagnitude ? theme.color : theme.disabledBackgroundColor}/>
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
                                handleDataUpdatePeriodChange={setDataUpdatePeriod}
                                disabled={running}
                            />
                            <BufferingControl
                                theme={theme}
                                windowingTime={windowingTime}
                                handleWindowingTimeChange={setWindowingTime}
                                disabled={running}
                            />
                            <Divider theme={theme}/>
                            <SeriesFilter
                                theme={theme}
                                filterValue={filterValue}
                                handleFilterUpdate={setFilterValue}
                            />
                            <Checkbox
                                checked={showTooltip}
                                label="tooltip"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setShowTooltip(!showTooltip)}
                            />
                            <Checkbox
                                checked={showLegend}
                                label="legend"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setShowLegend(!showLegend)}
                            />
                            <Checkbox
                                checked={sizeByMagnitude}
                                label="size by magnitude"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setSizeByMagnitude(!sizeByMagnitude)}
                            />
                            <Checkbox
                                checked={colorByStatusOn}
                                label="color by status"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setColorByStatus(!colorByStatusOn)}
                            />
                            <Divider theme={theme}/>
                            <GeoAggregateControls
                                theme={theme}
                                mode={mode}
                                handleModeChange={setMode}
                                rollupNames={ROLLUP_NAMES}
                                rollupName={rollupName}
                                handleRollupNameChange={setRollupName}
                                measureNames={MEASURE_NAMES}
                                colorBy={colorBy}
                                handleColorByChange={setColorBy}
                            />
                            <Divider theme={theme}/>
                            <ProjectionControl
                                theme={theme}
                                projection={projection}
                                handleProjectionChange={(name: GeoProjectionName) => setProjection(name)}
                            />
                            <Checkbox
                                checked={showGraticule}
                                label="graticule"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setShowGraticule(!showGraticule)}
                            />
                            <Checkbox
                                checked={showBorders}
                                label="borders"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setShowBorders(!showBorders)}
                            />
                            <Checkbox
                                checked={fadeOlder}
                                label="fade older"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setFadeOlder(!fadeOlder)}
                            />
                            <Checkbox
                                checked={autoRotate}
                                label="auto-rotate"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setAutoRotate(!autoRotate)}
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
                    margin={{...defaultMargin, top: 10, bottom: 10, left: 10, right: 10}}
                    color={theme.color}
                    backgroundColor={theme.backgroundColor}
                    seriesStyles={seriesStyles}
                    dataSource={dataSource}
                    seriesFilter={filter}
                    windowingTime={windowingTime}
                    dataUpdatePeriod={dataUpdatePeriod}
                >
                    <GeoPlot<SensorReading>
                        projection={projection}
                        basemap={LAND}
                        borders={showBorders ? COUNTRY_BORDERS : undefined}
                        showGraticule={showGraticule}
                        radiusOf={sizeByMagnitude ? radiusByMagnitude : undefined}
                        colorOf={colorByStatusOn ? colorByStatus : undefined}
                        fadeDuration={fadeOlder ? FADE_DURATION : undefined}
                        mode={mode === 'points' ? 'points' : 'aggregates'}
                        rollup={rollupName}
                        colorBy={colorBy === 'none' ? undefined : colorBy}
                        aggregateShape={mode === 'groups' ? 'pies' : rollupName === BY_GRID_CELL ? 'cells' : 'circles'}
                        groupColors={groupColorOf}
                        autoRotate={autoRotate ? AUTO_ROTATE_SPEED : undefined}
                        viewState={geoView}
                        onViewChange={setGeoView}
                        onZoomReset={handleZoomReset}
                    />
                    <Legend
                        visible={showLegend && mode === 'points'}
                        location={LegendLocation.TOP_LEFT}
                        style={{
                            fontColor: theme.color,
                            backgroundColor: theme.backgroundColor,
                            borderColor: theme.color,
                            backgroundOpacity: 0.8,
                            borderOpacity: 0.3,
                        }}
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
                        <GeoPlotTooltipContent<SensorReading>
                            sparklineValueOf={datum => datum.payload.magnitude}
                            payloadFormatter={({kind, magnitude, status}) =>
                                <>
                                    <div>{readingLabel(kind)}: <b>{magnitude} {readingUnits(kind)}</b></div>
                                    <div>Status: <b style={{color: STATUS_COLORS[status]}}>{status}</b></div>
                                </>
                            }
                        />
                    </Tooltip>
                </Chart>
            </GridItem>
        </Grid>
    )
}

/**
 * @param kind The kind of sensor
 * @return What its magnitude measures
 */
function readingLabel(kind: SensorReading['kind']): string {
    switch (kind) {
        case 'seismic':
            return 'Magnitude'
        case 'weather':
            return 'Wind speed'
        default:
            return 'Speed'
    }
}

/**
 * @param kind The kind of sensor
 * @return The units of its magnitude
 */
function readingUnits(kind: SensorReading['kind']): string {
    switch (kind) {
        case 'seismic':
            return ''
        case 'weather':
            return 'm/s'
        default:
            return 'kn'
    }
}
