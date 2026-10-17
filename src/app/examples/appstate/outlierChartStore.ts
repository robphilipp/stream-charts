import type {UseBoundStore} from "zustand";
import {create, type StoreApi} from 'zustand';
import {devtools} from "zustand/middleware";
import type {OutlierChartData} from "../../charts/observables/outliers.ts";
import type {OutlierSeries} from "../../charts/series/outlierSeries.ts";
import {OutlierDataSource} from "../../charts/datasources/outlierDataSource.ts";
import type {DataGenerator} from "../../charts/datasources/StreamingDataSource.ts";
import {periodicWithSeveralBandsFn, randomOutlierDataObservable} from "../dataproviders/randomOutlierData.ts";
import {DEFAULT_DROP_AFTER_100} from "../options/dropDataAfter.ts";
import {type DataSourceSlice, dataSourceSlice} from "./stateslices/dataSourceStateSlice.ts";

/*
    the example's data-generation parameters
 */
// 1 sigma (~68%), 2 sigma (~95%), 3 sigma (~99.7%)
export const MEASURES = [0.68, 0.95, 0.997] as const
export type Measures = typeof MEASURES
export const SERIES_NAME = "Spot Price Index"
export const DEFAULT_DATA_UPDATE_PERIOD = 25
export const NOISE_SIGMA = 0.5
const PERIODS: Array<[period: number, offset: number]> = [[4000, -1], [970, 1.3], [310, 2.1]]
const PERIOD_MAGNITUDE = 30

/**
 * @return The base data function (a sum of periodic functions with noise bands) for the example
 */
export function baseDataFnFactory() {
    return periodicWithSeveralBandsFn<Measures>(PERIODS, PERIOD_MAGNITUDE)
}

/**
 * @param seriesList The series
 * @return The time of the latest datum in any of the series (0 when there's no data)
 */
function lastTimeIn(seriesList: Array<OutlierSeries<Measures>>): number {
    return seriesList.reduce(
        (tMax, series) => Math.max(tMax, series.last().map(d => d.datum.x).getOrElse(0)),
        0
    )
}

/**
 * Creates the random outlier-data generator for the specified update period. The data source
 * calls it with its *current* series each time it starts, so Run after Pause continues from the
 * latest accumulated data rather than starting over.
 * @param updatePeriod The period (ms) between generated data points
 * @return The data generator
 */
const randomData = (updatePeriod: number): DataGenerator<OutlierChartData<Measures>, OutlierSeries<Measures>> =>
    currentSeries => randomOutlierDataObservable<Measures>(
        SERIES_NAME, baseDataFnFactory(), MEASURES, NOISE_SIGMA, updatePeriod, lastTimeIn(currentSeries)
    )

/**
 * Creates the chart's data source
 * @param initialData The initial series (owned by the data source from here on)
 * @param dataUpdatePeriod The period (ms) between generated data points
 * @param dropAfterMs Data older than this (ms) is dropped
 * @return The data source
 */
const newDataSource = (
    initialData: Array<OutlierSeries<Measures>>,
    dataUpdatePeriod: number,
    dropAfterMs: number
): OutlierDataSource<Measures> =>
    new OutlierDataSource<Measures>({initialData, generator: randomData(dataUpdatePeriod), dropDataAfter: dropAfterMs})

export type Range = [start: number, end: number]

/**
 * The x-axis' default (un-zoomed, un-scrolled) range
 */
export const DEFAULT_X_AXIS_RANGE: Range = [0, 40000]

type OutlierChartState = {
    // the x-axis' current (zoomed, panned, scrolled) range, handed back to the axis as its domain
    // when the chart remounts, so navigating away and back keeps the view
    xAxisRange: Range
    filterValue: string
    dropAfterMs: number
    windowingTime: number
    cadence: number
    dataUpdatePeriod: number
    selectedInterpolationName: string
    showMarkers: boolean
    showTooltip: boolean
    highlightAxes: boolean
    // whether the y-axis auto-scales (grows to fit the data)
    autoScaleYAxis: boolean
    // the auto-scaled y-axis' domain, kept so that its growth survives navigating away and back
    // (undefined until it's been auto-scaled)
    yAutoScaledDomain: Range | undefined
}

const initialState: OutlierChartState = {
    xAxisRange: DEFAULT_X_AXIS_RANGE,
    filterValue: '',
    dropAfterMs: DEFAULT_DROP_AFTER_100[1],
    windowingTime: 25,
    // 0 means disabled
    cadence: 0,
    dataUpdatePeriod: DEFAULT_DATA_UPDATE_PERIOD,
    selectedInterpolationName: 'curveLinear',
    showMarkers: true,
    showTooltip: true,
    highlightAxes: false,
    autoScaleYAxis: false,
    yAutoScaledDomain: undefined,
}

type OutlierChartActions = {
    setXAxisRange: (range: Range) => void
    setFilterValue: (filterValue: string) => void
    setDropAfterMs: (dropAfterMs: number) => void
    setWindowingTime: (windowingTime: number) => void
    setCadence: (cadence: number) => void
    setDataUpdatePeriod: (dataUpdatePeriod: number) => void
    setSelectedInterpolationName: (name: string) => void
    setShowMarkers: (show: boolean) => void
    setShowTooltip: (show: boolean) => void
    setHighlightAxes: (highlight: boolean) => void
    setAutoScaleYAxis: (autoScaleYAxis: boolean) => void
    setYAutoScaledDomain: (domain: Range) => void
}

type OutlierChartStore = OutlierChartState & OutlierChartActions &
    DataSourceSlice<OutlierDataSource<Measures>, OutlierSeries<Measures>>

/**
 * The outlier chart's state, which survives the chart being unmounted (e.g. navigating to another
 * page and back) -- including its data source, which keeps ingesting in the meantime.
 */
export const useOutlierChartStore: UseBoundStore<StoreApi<OutlierChartStore>> = create<OutlierChartStore>()(
    devtools<OutlierChartStore>((set, get) => ({
        ...initialState,
        // the data source (which owns the data generator's subscription and the series), and
        // whether it's running
        ...dataSourceSlice<OutlierDataSource<Measures>, OutlierSeries<Measures>>(
            set,
            get,
            newDataSource([], initialState.dataUpdatePeriod, initialState.dropAfterMs),
            initialData => newDataSource(initialData, get().dataUpdatePeriod, get().dropAfterMs)
        ),

        setXAxisRange: (xAxisRange: Range) => set({xAxisRange}),

        setFilterValue: filterValue => set({filterValue}),

        // data retention belongs to the data source, so keep it in step
        setDropAfterMs: (dropAfterMs: number) => {
            get().dataSource.setDropDataAfter(dropAfterMs)
            set({dropAfterMs})
        },

        setWindowingTime: (windowingTime: number) => set({windowingTime}),

        setCadence: (cadence: number) => set({cadence}),

        // the update period is baked into the generator, so give the data source a new one (only
        // possible while stopped, which is the only time the control is enabled)
        setDataUpdatePeriod: (dataUpdatePeriod: number) => {
            get().dataSource.setGenerator(randomData(dataUpdatePeriod))
            set({dataUpdatePeriod})
        },

        setSelectedInterpolationName: (selectedInterpolationName: string) => set({selectedInterpolationName}),
        setShowMarkers: (showMarkers: boolean) => set({showMarkers}),
        setShowTooltip: (showTooltip: boolean) => set({showTooltip}),
        setHighlightAxes: (highlightAxes: boolean) => set({highlightAxes}),
        // (turning auto-scaling on, or off, starts the axis afresh)
        setAutoScaleYAxis: (autoScaleYAxis: boolean) => set({autoScaleYAxis, yAutoScaledDomain: undefined}),
        setYAutoScaledDomain: (yAutoScaledDomain: Range) => set({yAutoScaledDomain}),
    })));
