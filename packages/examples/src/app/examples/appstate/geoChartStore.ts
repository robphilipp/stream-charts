import type {UseBoundStore} from "zustand";
import {create, type StoreApi} from 'zustand';
import {devtools} from "zustand/middleware";
import {
    byGridCell,
    byLocation,
    bySensor,
    type DataGenerator,
    GeoDataSource,
    type GeoChartData,
    type GeoDatum,
    type GeoPlotViewState,
    type GeoProjectionName,
    type GeoRollup,
    type GeoSeries,
    maxOf,
    meanOf,
} from "stream-charts";
import {randomGeoDataObservable, type SensorReading} from "../dataproviders/randomGeoData.ts";
import {DEFAULT_DROP_AFTER_100} from "../options/dropDataAfter.ts";
import {type DataSourceSlice, dataSourceSlice} from "./stateslices/dataSourceStateSlice.ts";

export const DEFAULT_DATA_UPDATE_PERIOD = 50

/*
    The roll-ups the data source keeps (see the GeoPlot's "aggregates" mode)
 */
export const BY_LOCATION = "Events by location"
export const BY_SENSOR = "Events by sensor"
export const ALERTS_BY_LOCATION = "Alarms and warnings by location"
export const BY_GRID_CELL = "10° grid"
export const ROLLUP_NAMES = [BY_LOCATION, BY_SENSOR, ALERTS_BY_LOCATION, BY_GRID_CELL]

const reading = (datum: GeoDatum<SensorReading>): number => datum.payload.magnitude

// each roll-up's measures: the peak and the mean reading (a quake's magnitude, a wind speed, or a
// vessel's speed)
const MEASURES = {
    "peak reading": maxOf(reading),
    "mean reading": meanOf(reading),
}

const ROLLUPS: Record<string, GeoRollup<SensorReading>> = {
    // all the events at a place, whichever sensor reported them, broken down by sensor (a seismic
    // site has several sensors at the same place)
    [BY_LOCATION]: {cellOf: byLocation(0.01), groupBy: datum => datum.sensorId, measures: MEASURES},
    // each sensor's events, where the sensor last was (the vessels move)
    [BY_SENSOR]: {cellOf: bySensor({position: 'latest'}), measures: MEASURES},
    // only the warnings and alarms, by place, broken down by status
    [ALERTS_BY_LOCATION]: {
        cellOf: byLocation(0.01),
        filter: datum => datum.payload.status !== 'ok',
        groupBy: datum => datum.payload.status,
        measures: MEASURES,
    },
    // all the events in each 10° cell of a grid, broken down by series
    [BY_GRID_CELL]: {cellOf: byGridCell(10), groupBy: (_datum, seriesName) => seriesName, measures: MEASURES},
}

/**
 * @param seriesList The series
 * @return The time of the latest event in any of the series (0 when there are none)
 */
function lastTimeIn(seriesList: Array<GeoSeries<SensorReading>>): number {
    return seriesList.reduce(
        (tMax, series) => Math.max(tMax, series.last().map(datum => datum.time).getOrElse(0)),
        0
    )
}

/**
 * Creates the random sensor-event generator for the specified update period. The data source calls
 * it with its current series each time it starts, so Run after Pause continues from the latest event.
 * @param updatePeriod The period (ms) between ticks of the sensor network
 * @return The data generator
 */
const randomData = (updatePeriod: number): DataGenerator<GeoChartData<SensorReading>, GeoSeries<SensorReading>> =>
    currentSeries => randomGeoDataObservable(updatePeriod, lastTimeIn(currentSeries))

/**
 * Creates the chart's data source
 * @param initialData The initial series (owned by the data source from here on)
 * @param dataUpdatePeriod The period (ms) between ticks of the sensor network
 * @param dropAfterMs Events older than this (ms) are dropped
 * @return The data source
 */
const newDataSource = (
    initialData: Array<GeoSeries<SensorReading>>,
    dataUpdatePeriod: number,
    dropAfterMs: number
): GeoDataSource<SensorReading> =>
    new GeoDataSource<SensorReading>({
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
    // whether the markers' size follows the reading's magnitude
    sizeByMagnitude: boolean
    // whether the markers' color follows the reading's status (rather than the series' color)
    colorByStatus: boolean
    // whether older readings fade
    fadeOlder: boolean
    // whether the globe turns by itself
    autoRotate: boolean
    // the plot's view (rotation and zoom), kept so that it survives navigating away and back
    // (undefined until the view has changed)
    geoView: GeoPlotViewState | undefined
    // whether the plot shows each event, or a roll-up's aggregates
    mode: 'points' | 'aggregates'
    // the roll-up shown in the aggregates mode
    rollupName: string
    // what colors the aggregates ('none', or a measure's name)
    colorBy: string
}

const initialState: GeoChartState = {
    filterValue: '',
    dropAfterMs: DEFAULT_DROP_AFTER_100[1],
    windowingTime: 50,
    dataUpdatePeriod: DEFAULT_DATA_UPDATE_PERIOD,
    projection: 'orthographic',
    showGraticule: true,
    showBorders: true,
    showTooltip: true,
    showLegend: true,
    sizeByMagnitude: true,
    colorByStatus: false,
    fadeOlder: true,
    autoRotate: false,
    geoView: undefined,
    mode: 'points',
    rollupName: BY_LOCATION,
    colorBy: 'peak reading',
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
    setSizeByMagnitude: (sizeByMagnitude: boolean) => void
    setColorByStatus: (colorByStatus: boolean) => void
    setFadeOlder: (fadeOlder: boolean) => void
    setAutoRotate: (autoRotate: boolean) => void
    setGeoView: (geoView: GeoPlotViewState) => void
    setMode: (mode: 'points' | 'aggregates') => void
    setRollupName: (rollupName: string) => void
    setColorBy: (colorBy: string) => void
}

type GeoChartStore = GeoChartState & GeoChartActions &
    DataSourceSlice<GeoDataSource<SensorReading>, GeoSeries<SensorReading>>

/**
 * The geo chart's state, which survives the chart being unmounted (e.g. navigating to another page
 * and back) -- including its data source, which keeps ingesting in the meantime.
 */
export const useGeoChartStore: UseBoundStore<StoreApi<GeoChartStore>> = create<GeoChartStore>()(
    devtools<GeoChartStore>((set, get) => ({
        ...initialState,
        ...dataSourceSlice<GeoDataSource<SensorReading>, GeoSeries<SensorReading>>(
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
        setSizeByMagnitude: (sizeByMagnitude: boolean): void => set({sizeByMagnitude}),
        setColorByStatus: (colorByStatus: boolean): void => set({colorByStatus}),
        setFadeOlder: (fadeOlder: boolean): void => set({fadeOlder}),
        setAutoRotate: (autoRotate: boolean): void => set({autoRotate}),
        setGeoView: (geoView: GeoPlotViewState): void => set({geoView}),
        setMode: (mode: 'points' | 'aggregates'): void => set({mode}),
        setRollupName: (rollupName: string): void => set({rollupName}),
        setColorBy: (colorBy: string): void => set({colorBy}),
    })));
