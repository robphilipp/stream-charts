import type {UseBoundStore} from "zustand";
import {create, type StoreApi} from 'zustand';
import {devtools} from "zustand/middleware";
import {
    byGridCell,
    bySensor,
    type DataGenerator,
    GeoDataSource,
    type GeoChartData,
    type GeoDatum,
    type GeoMeasure,
    type GeoPlotViewState,
    type GeoProjectionName,
    type GeoRollup,
    type GeoSeries,
    meanOf,
    measureOf,
    minOf,
    reduceOf,
} from "stream-charts";
import * as d3 from "d3";
import {type CellEvent, CITY_CENTERS, cellTowerDataObservable, TOWERS_BY_ID} from "../dataproviders/cellTowerData.ts";
import {DEFAULT_DROP_AFTER_100} from "../options/dropDataAfter.ts";
import {type DataSourceSlice, dataSourceSlice} from "./stateslices/dataSourceStateSlice.ts";

export const DEFAULT_DATA_UPDATE_PERIOD = 50

/*
    The roll-ups the data source keeps (see the GeoPlot's "aggregates" mode)
 */
export const BY_TOWER = "Pings by tower"
export const BY_CITY = "Pings by city"
export const WEAK_SIGNALS = "Weak signals by tower"
export const BY_PHONE = "Phones, where they are"
export const BY_GRID_CELL = "10° grid"
export const ROLLUP_NAMES = [BY_TOWER, BY_CITY, WEAK_SIGNALS, BY_PHONE, BY_GRID_CELL]

/*
    The roll-ups that the auto mode chooses among, by the zoom (see the GeoPlot's "auto" mode): the
    pings, in the cells of grids from 10° down to 0.01° (about a kilometer), broken down by carrier.
    (The phones' locations aren't clustered: they'd be half of every cluster, since each ping comes
    with one. They show, with their flashes, once the view is zoomed in to the events.)
 */
export const AUTO_CELL_SIZES = [10, 1, 0.1, 0.01]
export const AUTO_ROLLUP_NAMES = AUTO_CELL_SIZES.map(degrees => `Clusters of ${degrees}°`)

/**
 * What the view frames, when it first shows and when it's reset: the whole earth, Europe, the United
 * Kingdom, or London (see the GeoPlot's `fitTo`)
 */
export type GeoFocus = 'world' | 'europe' | 'uk' | 'london'

/**
 * What the geo plot shows: clusters of events or the events, by the zoom (auto); each event; the
 * aggregates; or the aggregates divided by their groups (pies: a wedge per group)
 */
export type GeoShow = 'auto' | 'points' | 'aggregates' | 'groups'

// a signal weaker than this (dBm) is weak (calls drop, data slows)
export const WEAK_SIGNAL = -110

/**
 * @param datum An event
 * @return Whether it's a ping to a tower (rather than a phone's estimated location)
 */
const isPing = (datum: GeoDatum<CellEvent>): boolean => datum.payload.kind === 'ping'

/**
 * @param datum An event
 * @return A ping's signal strength (dBm); `NaN` for a phone's location, which the measures leave out
 */
const signalStrength = (datum: GeoDatum<CellEvent>): number =>
    datum.payload.kind === 'ping' ? datum.payload.signalStrength : NaN

/**
 * @param datum An event
 * @return A ping's distance (km) from its tower; `NaN` for a phone's location
 */
const distance = (datum: GeoDatum<CellEvent>): number =>
    datum.payload.kind === 'ping' ? datum.payload.distance : NaN

/*
    The pings' measures: the library's mean and minimum of the signal strength, a measure of our own
    that's kept as pings come and go (the share of calls that dropped), and one that's found from all
    of a cell's pings (the median distance of the phones from their towers)
 */
export const MEAN_SIGNAL = "mean signal"
export const WEAKEST_SIGNAL = "weakest signal"
export const DROP_RATE = "drop rate"
export const MEDIAN_DISTANCE = "median distance"
export const MEASURE_NAMES = [MEAN_SIGNAL, WEAKEST_SIGNAL, DROP_RATE, MEDIAN_DISTANCE]
// the phones' measure: how well their locations fit the towers' distances
export const MEAN_ACCURACY = "mean accuracy"

/**
 * @param datum An event
 * @return 1 when it's a call that dropped, otherwise 0
 */
const dropped = (datum: GeoDatum<CellEvent>): number =>
    datum.payload.kind === 'ping' && datum.payload.event === 'call drop' ? 1 : 0

/**
 * @param datum An event
 * @return 1 when it's a call (that went through, or dropped), otherwise 0
 */
const isCall = (datum: GeoDatum<CellEvent>): number =>
    datum.payload.kind === 'ping' && (datum.payload.event === 'call' || datum.payload.event === 'call drop') ? 1 : 0

const MEASURES: Record<string, GeoMeasure<CellEvent>> = {
    [MEAN_SIGNAL]: meanOf(signalStrength, {units: 'dBm', format: ',.0f'}),
    [WEAKEST_SIGNAL]: minOf(signalStrength, {units: 'dBm', format: ',.0f'}),
    [DROP_RATE]: reduceOf<CellEvent, {calls: number, drops: number}>({
        initial: () => ({calls: 0, drops: 0}),
        add: ({calls, drops}, datum) => ({calls: calls + isCall(datum), drops: drops + dropped(datum)}),
        remove: ({calls, drops}, datum) => ({calls: calls - isCall(datum), drops: drops - dropped(datum)}),
        value: ({calls, drops}) => calls > 0 ? drops / calls : NaN,
    }, {format: '.0%'}),
    [MEDIAN_DISTANCE]: measureOf<CellEvent>(
        events => d3.median(events, distance) ?? NaN,
        {units: 'km', format: ',.1f'}
    ),
}

/**
 * @param datum A ping
 * @return The cell of the ping's tower's city: its ID (the city's code), and the city's center
 */
function cityOf(datum: GeoDatum<CellEvent>): {id: string, latitude: number, longitude: number} {
    const city = TOWERS_BY_ID.get(datum.sensorId)?.city ?? datum.sensorId
    const [longitude, latitude] = CITY_CENTERS.get(city) ?? [datum.longitude, datum.latitude]
    return {id: city, latitude, longitude}
}

const ROLLUPS: Record<string, GeoRollup<CellEvent>> = {
    // each tower's pings, broken down by the kind of phone
    [BY_TOWER]: {cellOf: bySensor(), filter: isPing, groupBy: datum => datum.payload.phoneType, measures: MEASURES},
    // each city's pings, from all its towers, at the city's center, broken down by carrier
    [BY_CITY]: {cellOf: cityOf, filter: isPing, groupBy: datum => datum.payload.carrier, measures: MEASURES},
    // only the pings with a weak signal, by tower, broken down by technology
    [WEAK_SIGNALS]: {
        cellOf: bySensor(),
        filter: datum => datum.payload.kind === 'ping' && datum.payload.signalStrength < WEAK_SIGNAL,
        groupBy: datum => datum.payload.kind === 'ping' ? datum.payload.technology : '',
        measures: MEASURES,
    },
    // each phone, where it was last located (the phones move), broken down by carrier
    [BY_PHONE]: {
        cellOf: bySensor({position: 'latest'}),
        filter: datum => datum.payload.kind === 'fix',
        groupBy: datum => datum.payload.carrier,
        measures: {
            [MEAN_ACCURACY]: meanOf(datum => datum.payload.kind === 'fix' ? datum.payload.accuracy : NaN, {units: 'm', format: ',.0f'}),
        },
    },
    // all the pings in each 10° cell of a grid, broken down by carrier
    [BY_GRID_CELL]: {cellOf: byGridCell(10), filter: isPing, groupBy: (_datum, seriesName) => seriesName, measures: MEASURES},
    // the auto mode's clusters: the pings, broken down by carrier
    ...Object.fromEntries(AUTO_CELL_SIZES.map((degrees, index): [string, GeoRollup<CellEvent>] => [
        AUTO_ROLLUP_NAMES[index],
        {cellOf: byGridCell(degrees), filter: isPing, groupBy: (_datum, seriesName) => seriesName, measures: MEASURES},
    ])),
}

/**
 * @param rollupName The name of a roll-up
 * @return The names of the roll-up's measures (e.g. for what colors its aggregates)
 */
export const measureNamesOf = (rollupName: string): Array<string> => Object.keys(ROLLUPS[rollupName]?.measures ?? {})

/**
 * @param seriesList The series
 * @return The time of the latest event in any of the series (0 when there are none)
 */
function lastTimeIn(seriesList: Array<GeoSeries<CellEvent>>): number {
    return seriesList.reduce(
        (tMax, series) => Math.max(tMax, series.last().map(datum => datum.time).getOrElse(0)),
        0
    )
}

/**
 * Creates the random cell-tower event generator for the specified update period. The data source
 * calls it with its current series each time it starts, so Run after Pause continues from the
 * latest event.
 * @param updatePeriod The period (ms) between ticks of the cell network
 * @return The data generator
 */
const randomData = (updatePeriod: number): DataGenerator<GeoChartData<CellEvent>, GeoSeries<CellEvent>> =>
    currentSeries => cellTowerDataObservable(updatePeriod, lastTimeIn(currentSeries))

/**
 * Creates the chart's data source
 * @param initialData The initial series (owned by the data source from here on)
 * @param dataUpdatePeriod The period (ms) between ticks of the cell network
 * @param dropAfterMs Events older than this (ms) are dropped
 * @return The data source
 */
const newDataSource = (
    initialData: Array<GeoSeries<CellEvent>>,
    dataUpdatePeriod: number,
    dropAfterMs: number
): GeoDataSource<CellEvent> =>
    new GeoDataSource<CellEvent>({
        initialData,
        generator: randomData(dataUpdatePeriod),
        dropDataAfter: dropAfterMs,
        rollups: ROLLUPS,
    })

type GeoChartState = {
    filterValue: string
    dropAfterMs: number
    windowingTime: number
    dataUpdatePeriod: number
    projection: GeoProjectionName
    showGraticule: boolean
    showBorders: boolean
    showTooltip: boolean
    showLegend: boolean
    // whether the pings' markers' size follows their signal's strength
    sizeBySignal: boolean
    // whether the pings' markers' color shows a weak signal (rather than the series' color)
    colorBySignal: boolean
    // whether older events fade
    fadeOlder: boolean
    // whether the countries are drawn as a layer of their own (tinted by their number of towers,
    // and named)
    showCountries: boolean
    // what the view frames
    focus: GeoFocus
    // whether each phone's new (estimated) location flashes
    flashLocated: boolean
    // whether each phone's actual place flashes (briefly) as it's located
    flashActual: boolean
    // whether the globe turns by itself
    autoRotate: boolean
    // the plot's view (rotation and zoom), kept so that it survives navigating away and back
    // (undefined, for the plot's starting view of the whole globe, until the view has changed)
    geoView: GeoPlotViewState | undefined
    // whether the plot shows each event, a roll-up's aggregates, or its aggregates by group
    mode: GeoShow
    // the roll-up shown in the aggregates mode
    rollupName: string
    // what colors the aggregates ('none', or a measure's name)
    colorBy: string
}

const initialState: GeoChartState = {
    filterValue: '',
    dropAfterMs: DEFAULT_DROP_AFTER_100[1],
    // (the events are redrawn in batches five times a second: with tens of thousands of events
    // held, redrawing them all on each of 20 batches a second would leave little time for anything
    // else; the flashes still animate smoothly between batches)
    windowingTime: 200,
    dataUpdatePeriod: DEFAULT_DATA_UPDATE_PERIOD,
    projection: 'orthographic',
    showGraticule: true,
    showBorders: true,
    showTooltip: true,
    showLegend: true,
    sizeBySignal: true,
    colorBySignal: false,
    fadeOlder: true,
    showCountries: true,
    focus: 'world',
    flashLocated: true,
    flashActual: true,
    autoRotate: false,
    geoView: undefined,
    // (clusters, from afar, which come apart into the events as the view zooms in)
    mode: 'auto',
    rollupName: BY_TOWER,
    colorBy: MEAN_SIGNAL,
}

type GeoChartActions = {
    setFilterValue: (filterValue: string) => void
    setDropAfterMs: (dropAfterMs: number) => void
    setWindowingTime: (windowingTime: number) => void
    setDataUpdatePeriod: (dataUpdatePeriod: number) => void
    setProjection: (projection: GeoProjectionName) => void
    setShowGraticule: (show: boolean) => void
    setShowBorders: (show: boolean) => void
    setShowTooltip: (show: boolean) => void
    setShowLegend: (show: boolean) => void
    setSizeBySignal: (sizeBySignal: boolean) => void
    setColorBySignal: (colorBySignal: boolean) => void
    setFadeOlder: (fadeOlder: boolean) => void
    setShowCountries: (showCountries: boolean) => void
    setFocus: (focus: GeoFocus) => void
    setFlashLocated: (flashLocated: boolean) => void
    setFlashActual: (flashActual: boolean) => void
    setAutoRotate: (autoRotate: boolean) => void
    setGeoView: (geoView: GeoPlotViewState) => void
    setMode: (mode: GeoShow) => void
    setRollupName: (rollupName: string) => void
    setColorBy: (colorBy: string) => void
}

type GeoChartStore = GeoChartState & GeoChartActions &
    DataSourceSlice<GeoDataSource<CellEvent>, GeoSeries<CellEvent>>

/**
 * The geo chart's state, which survives the chart being unmounted (e.g. navigating to another page
 * and back) -- including its data source, which keeps ingesting in the meantime.
 */
export const useGeoChartStore: UseBoundStore<StoreApi<GeoChartStore>> = create<GeoChartStore>()(
    devtools<GeoChartStore>((set, get) => ({
        ...initialState,
        ...dataSourceSlice<GeoDataSource<CellEvent>, GeoSeries<CellEvent>>(
            set,
            get,
            newDataSource([], initialState.dataUpdatePeriod, initialState.dropAfterMs),
            initialData => newDataSource(initialData, get().dataUpdatePeriod, get().dropAfterMs)
        ),

        setFilterValue: (filterValue: string): void => set({filterValue}),

        // data retention belongs to the data source, so keep it in step
        setDropAfterMs: (dropAfterMs: number): void => {
            get().dataSource.setDropDataAfter(dropAfterMs)
            set({dropAfterMs})
        },

        setWindowingTime: (windowingTime: number): void => set({windowingTime}),

        // the update period is baked into the generator, so give the data source a new one (only
        // possible while stopped, which is the only time the control is enabled)
        setDataUpdatePeriod: (dataUpdatePeriod: number): void => {
            get().dataSource.setGenerator(randomData(dataUpdatePeriod))
            set({dataUpdatePeriod})
        },

        setProjection: (projection: GeoProjectionName): void => set({projection}),
        setShowGraticule: (showGraticule: boolean): void => set({showGraticule}),
        setShowBorders: (showBorders: boolean): void => set({showBorders}),
        setShowTooltip: (showTooltip: boolean): void => set({showTooltip}),
        setShowLegend: (showLegend: boolean): void => set({showLegend}),
        setSizeBySignal: (sizeBySignal: boolean): void => set({sizeBySignal}),
        setColorBySignal: (colorBySignal: boolean): void => set({colorBySignal}),
        setFadeOlder: (fadeOlder: boolean): void => set({fadeOlder}),
        setShowCountries: (showCountries: boolean): void => set({showCountries}),
        setFocus: (focus: GeoFocus): void => set({focus}),
        setFlashLocated: (flashLocated: boolean): void => set({flashLocated}),
        setFlashActual: (flashActual: boolean): void => set({flashActual}),
        setAutoRotate: (autoRotate: boolean): void => set({autoRotate}),
        setGeoView: (geoView: GeoPlotViewState): void => set({geoView}),
        setMode: (mode: GeoShow): void => set({mode}),
        setRollupName: (rollupName: string): void => set({rollupName}),
        setColorBy: (colorBy: string): void => set({colorBy}),
    })));
