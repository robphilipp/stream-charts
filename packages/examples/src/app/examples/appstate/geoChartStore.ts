import type {UseBoundStore} from "zustand";
import {create, type StoreApi} from 'zustand';
import {devtools} from "zustand/middleware";
import {type DataGenerator, GeoDataSource, type GeoChartData, type GeoProjectionName, type GeoSeries} from "stream-charts";
import {randomGeoDataObservable, type SensorReading} from "../dataproviders/randomGeoData.ts";
import {DEFAULT_DROP_AFTER_100} from "../options/dropDataAfter.ts";
import {type DataSourceSlice, dataSourceSlice} from "./stateslices/dataSourceStateSlice.ts";

export const DEFAULT_DATA_UPDATE_PERIOD = 50

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
    new GeoDataSource<SensorReading>({initialData, generator: randomData(dataUpdatePeriod), dropDataAfter: dropAfterMs})

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
    })));
