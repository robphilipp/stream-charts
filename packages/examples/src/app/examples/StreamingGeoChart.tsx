import {type JSX, useCallback, useEffect, useMemo, useRef, useState} from "react"
import * as d3 from "d3"
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
    type GeoFlash,
    type GeoLayer,
    type GeoMapData,
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
import {
    BY_GRID_CELL,
    DEFAULT_DATA_UPDATE_PERIOD,
    DROP_RATE,
    MEAN_SIGNAL,
    measureNamesOf,
    AUTO_ROLLUP_NAMES,
    ROLLUP_NAMES,
    useGeoChartStore,
    WEAK_SIGNAL,
    WEAKEST_SIGNAL,
} from "./appstate/geoChartStore.ts"
import {CARRIERS, type CellEvent, initialCellTowerData, type PhoneFix, PHONES, TOWERS_BY_COUNTRY, type TowerPing} from "./dataproviders/cellTowerData.ts"
import {COUNTRIES, COUNTRY_BORDERS, type DetailedWorld, detailedWorld, LAND, UNITED_KINGDOM, UNITED_STATES} from "./dataproviders/worldMap.ts"
import {FocusControl} from "./controls/FocusControl.tsx"

const CHART_ID = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)

// how much history (ms) the example starts with
const INITIAL_HISTORY = 10_000

// how long (ms) events take to fade (when fading older events)
const FADE_DURATION = 30_000

// the zoom from which the map is drawn at its finer level of detail (1:50m, rather than 1:110m)
const DETAILED_ZOOM = 6

// the shapes that the view can frame (see the plot's `fitTo`): Europe and London as boxes of
// longitude and latitude (wound as d3 wants a small polygon), and the United Kingdom's outline
const FOCUS_SHAPES = {
    europe: d3.geoGraticule().extent([[-11, 35], [32, 61]]).outline(),
    uk: UNITED_KINGDOM,
    london: d3.geoGraticule().extent([[-0.55, 51.28], [0.3, 51.7]]).outline(),
    usa: UNITED_STATES,
}

// the countries' tints, by their number of towers (none for a country without any)
const MOST_TOWERS = Math.max(...TOWERS_BY_COUNTRY.values())
const towersColor = (towers: number): string => d3.interpolateBlues(0.3 + 0.7 * towers / MOST_TOWERS)

/**
 * @param feature A country
 * @return Its number of towers (0 for a country without any)
 */
const towersIn = (feature: GeoJSON.Feature): number => TOWERS_BY_COUNTRY.get(feature.properties?.name) ?? 0

/**
 * @param coarse The map's data at its coarser level of detail (1:110m)
 * @param detailed The same at its finer level of detail (1:50m), once loaded
 * @return The map's data, by zoom: the coarser, and, from DETAILED_ZOOM in, the finer
 */
const byZoom = <T extends GeoMapData>(coarse: T, detailed: T | undefined): GeoMapData =>
    detailed === undefined ? coarse : [{minZoom: 0, data: coarse as d3.GeoPermissibleObjects}, {minZoom: DETAILED_ZOOM, data: detailed as d3.GeoPermissibleObjects}]

// how long (ms) a phone's new (estimated) location flashes
const FLASH_DURATION = 1500
// how a phone's actual place flashes as it's located: smaller and shorter than its estimated
// location's flash, in its own color, by theme
const ACTUAL_FLASH = {radius: 8, duration: 600}
const ACTUAL_COLORS = {light: '#ff8f00', dark: '#ffd54f'}

/**
 * The flashes of the phones' locations: as each arrives, a ring at the estimated location, and a
 * small, short one at the phone's actual place (each when it's on)
 * @param located Whether the estimated locations flash
 * @param actual Whether the phones' actual places flash
 * @param actualColor The color of the actual places' flashes
 * @return The flashes of an event (see the plot's `flashes`): none for a ping
 */
const phoneFlashesFor = (located: boolean, actual: boolean, actualColor: string) =>
    (datum: GeoDatum<CellEvent>): Array<GeoFlash> => {
        if (datum.payload.kind !== 'fix') return []
        const {phoneLatitude, phoneLongitude} = datum.payload
        return [
            ...(located ? [{}] : []),
            ...(actual ? [{latitude: phoneLatitude, longitude: phoneLongitude, ...ACTUAL_FLASH, color: actualColor}] : []),
        ]
    }

/**
 * @param fix A phone's estimated location
 * @param latitude The latitude of the estimated location
 * @param longitude The longitude of the estimated location
 * @return How far (m) the estimate is from where the phone actually was
 */
const errorOf = (fix: PhoneFix, latitude: number, longitude: number): number =>
    Math.round(d3.geoDistance([longitude, latitude], [fix.phoneLongitude, fix.phoneLatitude]) * 6_371_000)

// how fast (degrees per second) the globe turns (when it turns by itself)
const AUTO_ROTATE_SPEED = 6

// how far the view can zoom in: far enough to see a city's towers, a few kilometers apart, from a
// view of the whole earth
const MAX_ZOOM = 2000

// a fair signal is weaker than this (dBm), and a weak one, weaker than WEAK_SIGNAL
const FAIR_SIGNAL = -100

// the pings' colors by their signal (when coloring by signal; a good signal keeps its series' color)
const SIGNAL_COLORS = {fair: '#f08a3b', weak: '#d62728'}

/**
 * @param signalStrength A signal's strength (dBm)
 * @return Its color: red when it's weak, orange when it's fair, and otherwise `undefined` (the
 * series' color)
 */
const signalColorOf = (signalStrength: number): string | undefined =>
    signalStrength < WEAK_SIGNAL ? SIGNAL_COLORS.weak : signalStrength < FAIR_SIGNAL ? SIGNAL_COLORS.fair : undefined

/**
 * The radius of an event's marker: a ping's, from its signal's strength (the stronger, the larger);
 * a phone's location's, a small blip
 * @param datum The event
 * @return The marker's radius (px)
 */
function radiusBySignal(datum: GeoDatum<CellEvent>): number {
    return datum.payload.kind === 'ping' ? 1.5 + (datum.payload.signalStrength + 140) / 14 : 4
}

/**
 * @param datum An event
 * @return A ping's color by its signal (see `signalColorOf`), or `undefined` (its series' color)
 */
const colorBySignal = (datum: GeoDatum<CellEvent>): string | undefined =>
    datum.payload.kind === 'ping' ? signalColorOf(datum.payload.signalStrength) : undefined

// the series' colors (the carriers', and the phones' locations'), by theme (also for the groups
// that are carriers, see `groupColorsFor`)
const CARRIER_COLORS = {
    light: ['#1f77b4', '#2ca02c', '#9467bd', '#bcbd22', '#17becf', '#8c564b'],
    dark: ['#5bc0eb', '#7bd389', '#c5a3ff', '#e3e36a', '#6ee7f2', '#c49c94'],
}
const SERIES_COLORS = {
    light: new Map([...CARRIERS.map(({name}, index): [string, string] => [name, CARRIER_COLORS.light[index]]), [PHONES, '#c51b7d']]),
    dark: new Map([...CARRIERS.map(({name}, index): [string, string] => [name, CARRIER_COLORS.dark[index]]), [PHONES, '#ff79c6']]),
}

// the technologies' colors (for the weak signals' groups): unlike the carriers'
const TECHNOLOGY_COLORS = new Map([['5G', '#393b79'], ['LTE', '#e7969c'], ['3G', '#7f7f7f']])

/**
 * The colors of the groups' wedges, in the pies (without a "color by"): a carrier's color for the
 * groups that are carriers, and the technologies' colors for the weak signals' groups; any other
 * group (e.g. a kind of phone) gets one of the plot's categorical colors
 * @param theme The theme
 * @return The color of a group (by its name), or `undefined` for the plot's own choice
 */
const groupColorsFor = (theme: Theme): ((group: string) => string | undefined) => {
    const seriesColors = SERIES_COLORS[theme.name === 'light' ? 'light' : 'dark']
    // (the carriers' groups are named by carrier, and, in the grid, by their series: the same names)
    return group => seriesColors.get(group) ?? TECHNOLOGY_COLORS.get(group)
}

/**
 * @param measure What colors the aggregates (a measure's name, or "count")
 * @return The colors for its values, from the lowest (0) to the highest (1): red for the bad end --
 * a weak signal (low), or a high drop rate -- and blues for the rest, which are neither good nor bad
 */
function colorSchemeOf(measure: string): (t: number) => string {
    if (measure === MEAN_SIGNAL || measure === WEAKEST_SIGNAL) return t => d3.interpolateYlOrRd(1 - t)
    if (measure === DROP_RATE) return d3.interpolateYlOrRd
    return t => d3.interpolateBlues(0.25 + 0.75 * t)
}

/**
 * @param theme The theme
 * @return The series' styles (their colors), for the theme
 */
function seriesStylesFor(theme: Theme): Map<string, SeriesLineStyle> {
    const colors = SERIES_COLORS[theme.name === 'light' ? 'light' : 'dark']
    return new Map(Array.from(colors.entries()).map(([name, color]) =>
        [name, {...defaultLineStyle(), color, highlightColor: color}]
    ))
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
    const sizeBySignal = useGeoChartStore(state => state.sizeBySignal)
    const setSizeBySignal = useGeoChartStore(state => state.setSizeBySignal)
    const colorBySignalOn = useGeoChartStore(state => state.colorBySignal)
    const setColorBySignal = useGeoChartStore(state => state.setColorBySignal)
    const fadeOlder = useGeoChartStore(state => state.fadeOlder)
    const setFadeOlder = useGeoChartStore(state => state.setFadeOlder)
    const showCountries = useGeoChartStore(state => state.showCountries)
    const setShowCountries = useGeoChartStore(state => state.setShowCountries)
    const focus = useGeoChartStore(state => state.focus)
    const setFocus = useGeoChartStore(state => state.setFocus)
    const flashLocated = useGeoChartStore(state => state.flashLocated)
    const setFlashLocated = useGeoChartStore(state => state.setFlashLocated)
    const flashActual = useGeoChartStore(state => state.flashActual)
    const setFlashActual = useGeoChartStore(state => state.setFlashActual)
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
    // the map at its finer level of detail, for zoomed-in views: loaded (once) when the chart mounts
    const [detailed, setDetailed] = useState<DetailedWorld | undefined>(undefined)
    useEffect(
        () => {
            let mounted = true
            detailedWorld().then(world => {
                if (mounted) setDetailed(world)
            })
            return (): void => {
                mounted = false
            }
        },
        []
    )
    const basemap = useMemo(() => byZoom(LAND, detailed?.land), [detailed])
    // (Albers USA shows the lower 48 states, with Alaska and Hawaii moved in: each in a rectangle of
    // its own, which would show its neighbors' land, too, overlapping -- so it's drawn with the
    // United States alone)
    const albersUsa = projection === 'albersUsa'
    const borders = useMemo(() => byZoom(COUNTRY_BORDERS, detailed?.borders), [detailed])
    // the countries, tinted by their number of towers (a choropleth), and named, those with towers
    const layers = useMemo<Array<GeoLayer>>(
        () => showCountries ? [{
            data: byZoom(COUNTRIES, detailed?.countries),
            fill: (feature): string | undefined => towersIn(feature) > 0 ? towersColor(towersIn(feature)) : undefined,
            opacity: 0.45,
            label: (feature): string | undefined => towersIn(feature) > 0 ? feature.properties?.name : undefined,
        }] : [],
        [showCountries, detailed]
    )

    const phoneFlashes = useMemo(
        () => phoneFlashesFor(flashLocated, flashActual, ACTUAL_COLORS[theme.name === 'light' ? 'light' : 'dark']),
        [flashLocated, flashActual, theme]
    )
    // the roll-up's measures (e.g. the phones' differ from the pings'), and what colors its
    // aggregates: the measure picked, when the roll-up has it, and otherwise their count
    const measureNames = useMemo(() => measureNamesOf(rollupName), [rollupName])
    const shownColorBy = colorBy === 'none' || colorBy === 'count' || measureNames.includes(colorBy) ? colorBy : 'count'
    const colorScheme = useMemo(() => colorSchemeOf(shownColorBy), [shownColorBy])

    // seeds the store's data source with some history (the store survives remounts, so this only
    // needs to happen when it hasn't been seeded yet)
    const seededRef = useRef<boolean>(false)
    // eslint-disable-next-line react-hooks/refs
    if (!seededRef.current && dataSource.seriesList().length === 0) {
        seededRef.current = true
        setInitialData(initialCellTowerData(DEFAULT_DATA_UPDATE_PERIOD, INITIAL_HISTORY))
    }

    // holds the latest `resetZoom` handed back by <GeoPlot> (see its `onZoomReset` prop), so that
    // clearing the chart also resets the view (its rotation and zoom)
    const resetZoomRef = useRef<() => void>(noop)
    const handleZoomReset = useCallback((resetZoom: () => void): void => {
        resetZoomRef.current = resetZoom
    }, [])

    function handleClearClick(): void {
        // replaces the data source with a fresh one (which stops the current one), and resets the view
        setInitialData(initialCellTowerData(DEFAULT_DATA_UPDATE_PERIOD, INITIAL_HISTORY))
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
                            <MarkersIcon color={sizeBySignal ? theme.color : theme.disabledBackgroundColor}/>
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
                                checked={sizeBySignal}
                                label="size by signal"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setSizeBySignal(!sizeBySignal)}
                            />
                            <Checkbox
                                checked={colorBySignalOn}
                                label="color by signal"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setColorBySignal(!colorBySignalOn)}
                            />
                            <Divider theme={theme}/>
                            <GeoAggregateControls
                                theme={theme}
                                mode={mode}
                                handleModeChange={setMode}
                                rollupNames={ROLLUP_NAMES}
                                rollupName={rollupName}
                                handleRollupNameChange={setRollupName}
                                measureNames={measureNames}
                                colorBy={shownColorBy}
                                handleColorByChange={setColorBy}
                            />
                            <Divider theme={theme}/>
                            <FocusControl theme={theme} focus={focus} handleFocusChange={setFocus}/>
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
                                checked={showCountries}
                                label="countries"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setShowCountries(!showCountries)}
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
                                checked={flashLocated}
                                label="flash located"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setFlashLocated(!flashLocated)}
                            />
                            <Checkbox
                                checked={flashActual}
                                label="flash actual"
                                backgroundColor={theme.backgroundColor}
                                borderColor={theme.color}
                                labelColor={theme.color}
                                onChange={() => setFlashActual(!flashActual)}
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
                    <GeoPlot<CellEvent>
                        projection={projection}
                        basemap={albersUsa ? UNITED_STATES : basemap}
                        borders={showBorders && !albersUsa ? borders : undefined}
                        layers={albersUsa ? [] : layers}
                        fitTo={albersUsa ? UNITED_STATES : focus === 'world' ? undefined : FOCUS_SHAPES[focus]}
                        showGraticule={showGraticule}
                        radiusOf={sizeBySignal ? radiusBySignal : undefined}
                        colorOf={colorBySignalOn ? colorBySignal : undefined}
                        fadeDuration={fadeOlder ? FADE_DURATION : undefined}
                        flashDuration={flashLocated || flashActual ? FLASH_DURATION : undefined}
                        flashes={phoneFlashes}
                        mode={mode === 'points' || mode === 'auto' ? mode : 'aggregates'}
                        autoRollups={AUTO_ROLLUP_NAMES}
                        rollup={rollupName}
                        colorBy={shownColorBy === 'none' || mode === 'auto' ? undefined : shownColorBy}
                        colorScheme={colorScheme}
                        aggregateShape={mode === 'groups' || mode === 'auto' ? 'pies' : rollupName === BY_GRID_CELL ? 'cells' : 'circles'}
                        groupColors={groupColorOf}
                        autoRotate={autoRotate ? AUTO_ROTATE_SPEED : undefined}
                        zoomMaxScaleFactor={MAX_ZOOM}
                        viewState={geoView}
                        onViewChange={setGeoView}
                        onZoomReset={handleZoomReset}
                    />
                    <Legend
                        visible={showLegend && (mode === 'points' || mode === 'auto')}
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
                        <GeoPlotTooltipContent<CellEvent>
                            sparklineValueOf={datum => datum.payload.kind === 'ping' ? datum.payload.signalStrength : datum.payload.accuracy}
                            payloadFormatter={(payload, datum) => payload.kind === 'ping' ?
                                <PingDetails ping={payload}/> :
                                <>
                                    {/* (the sensor, above, is the phone's ID) */}
                                    <div>Phone: <b>{payload.phoneType}</b>, on {payload.carrier}</div>
                                    <div>Located from <b>{payload.towers}</b> towers, to within <b>{payload.accuracy} m</b></div>
                                    {/* (known only because the phones are simulated) */}
                                    <div>Actually <b>{errorOf(payload, datum.latitude, datum.longitude)} m</b> away</div>
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
 * A ping's details, for the tooltip: the phone, the event, the network, and the signal
 * @param props The ping
 * @return The details
 */
function PingDetails(props: {ping: TowerPing}): JSX.Element {
    const {ping} = props
    return <>
        <div>Phone: <b>{ping.deviceId}</b> ({ping.phoneType})</div>
        <div>Event: <b>{ping.event}</b></div>
        <div>Network: <b>{ping.technology}</b>, band {ping.band}, sector {ping.sector}</div>
        <div>Signal: <b style={{color: signalColorOf(ping.signalStrength)}}>{ping.signalStrength} dBm</b> (SINR {ping.signalQuality} dB)</div>
        <div>Distance: <b>{ping.distance.toFixed(2)} km</b></div>
    </>
}
