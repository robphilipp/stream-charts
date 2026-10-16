import type {UseBoundStore} from "zustand";
import {create, type StoreApi} from 'zustand';
import type {TimeSeries} from "../../charts/series/timeSeries.ts";
import type {TimeSeriesChartData} from "../../charts/series/timeSeriesChartData.ts";
import {TimeSeriesDataSource} from "../../charts/datasources/timeSeriesDataSource.ts";
import type {DataGenerator} from "../../charts/datasources/StreamingDataSource.ts";
import {randomSpikeDataObservable} from "../dataproviders/randomSpikeData.ts";
import {createInitialVisibility} from "../options/visibility.ts";
import {devtools} from "zustand/middleware";
import {type DataSourceSlice, dataSourceSlice} from "./stateslices/dataSourceStateSlice.ts";
import {
    type VisibilitySlice,
    visibilitySliceStateCreator,
    type VisibilityStateSlice
} from "./stateslices/visibilityStateSlice.ts";

export type Range = [start: number, end: number]

/*
    set up the data state
 */
const SPIKE_PROBABILITY = 0.1
const DEFAULT_DATA_UPDATE_PERIOD = 50
// the spikes' values (mV): uniformly random within the spread around the mean -- shared with the
// initial data (see routeData.ts and StreamingRasterChart.tsx), so the initial and streamed spikes match
export const SPIKE_MEAN_VALUE = 55
export const SPIKE_VALUE_SPREAD = 5

/**
 * Creates the random-spike data generator for the specified update period. The data source calls
 * it with its *current* series each time it starts, so Run after Pause continues from the latest
 * accumulated data rather than starting over.
 * @param updatePeriod The period (ms) between generated spikes
 * @return The data generator
 */
const randomData = (updatePeriod: number): DataGenerator<TimeSeriesChartData, TimeSeries> =>
    currentSeries => randomSpikeDataObservable(currentSeries, updatePeriod, SPIKE_PROBABILITY, SPIKE_MEAN_VALUE, SPIKE_VALUE_SPREAD)

/**
 * Creates the chart's data source
 * @param initialData The initial series (owned by the data source from here on)
 * @param dataUpdatePeriod The period (ms) between generated spikes
 * @param dropAfterMs Data older than this (ms) is dropped
 * @return The data source
 */
const newDataSource = (initialData: Array<TimeSeries>, dataUpdatePeriod: number, dropAfterMs: number): TimeSeriesDataSource =>
    new TimeSeriesDataSource({initialData, generator: randomData(dataUpdatePeriod), dropDataAfter: dropAfterMs})

/*
    set up the visibility state
 */
const initialVisibilityState: VisibilityStateSlice = {
    visibility: createInitialVisibility()
}
const createVisibilitySlice = visibilitySliceStateCreator(initialVisibilityState)

/*
    pull all the slices together
 */
type RasterChartState = {
    xAxisRange: Range
    filterValue: string
    dropAfterMs: number
    numberOfSeries: number
    windowingTime: number
    cadence: number
    dataUpdatePeriod: number
}

const initialState: RasterChartState = {
    xAxisRange: [0, 10000],
    filterValue: '',
    dropAfterMs: 20_000,
    numberOfSeries: 50,
    windowingTime: 50,
    cadence: 25,
    dataUpdatePeriod: DEFAULT_DATA_UPDATE_PERIOD,
}

type RasterChartActions = {
    setXAxisRange: (range: Range) => void
    setFilterValue: (filterValue: string) => void
    setDropAfterMs: (dropAfterMs: number) => void
    setNumberOfSeries: (numberOfSeries: number) => void
    setWindowingTime: (windowingTime: number) => void
    setCadence: (cadence: number) => void
    setDataUpdatePeriod: (dataUpdatePeriod: number) => void
    reset: () => void
}

type RasterChartStore = RasterChartState & RasterChartActions &
    DataSourceSlice<TimeSeriesDataSource, TimeSeries> &
    VisibilitySlice

export const useRasterChartStore: UseBoundStore<StoreApi<RasterChartStore>> = create<RasterChartStore>()(
    devtools<RasterChartStore>((set, get, store) => ({
        ...initialState,
        // the data source (which owns the data generator's subscription and the series), and
        // whether it's running
        ...dataSourceSlice<TimeSeriesDataSource, TimeSeries>(
            set,
            get,
            newDataSource([], initialState.dataUpdatePeriod, initialState.dropAfterMs),
            initialData => newDataSource(initialData, get().dataUpdatePeriod, get().dropAfterMs)
        ),

        setXAxisRange: (range: Range) => set({xAxisRange: range}),

        // the compiled regex is derived from this in the component, so its reference only
        // changes when the filter value actually changes
        setFilterValue: filterValue => set({filterValue}),

        // holds status of the visibility for tooltip, tracker, markers, legend
        ...createVisibilitySlice(set, get, store),

        // data retention belongs to the data source, so keep it in step
        setDropAfterMs: (dropAfterMs: number) => {
            get().dataSource.setDropDataAfter(dropAfterMs)
            set({dropAfterMs})
        },

        setNumberOfSeries: (numberOfSeries: number) => set({numberOfSeries}),

        setWindowingTime: (windowingTime: number) => set({windowingTime}),

        setCadence: (cadence: number) => set({cadence}),

        // the update period is baked into the generator, so give the data source a new one (only
        // possible while stopped, which is the only time the control is enabled)
        setDataUpdatePeriod: (dataUpdatePeriod: number) => {
            get().dataSource.setGenerator(randomData(dataUpdatePeriod))
            set({dataUpdatePeriod})
        },

        // resets the settings, and replaces the data source with an empty one (which disposes of,
        // and so stops, the current one) -- the chart re-seeds it with its initial data
        reset: () => {
            set({...initialState, ...initialVisibilityState})
            get().setInitialData([])
        }
    })));
