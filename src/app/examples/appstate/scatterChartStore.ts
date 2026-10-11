import type {UseBoundStore} from "zustand";
import {create, type StoreApi} from 'zustand';
import type {TimeSeries} from "../../charts/series/timeSeries.ts";
import type {TimeSeriesChartData} from "../../charts/series/timeSeriesChartData.ts";
import {TimeSeriesDataSource} from "../../charts/datasources/timeSeriesDataSource.ts";
import type {DataGenerator} from "../../charts/datasources/StreamingDataSource.ts";
import {randomWeightDataObservable} from "../dataproviders/randomWeightData.ts";
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
const DATA_DELTA = 25
const DATA_MIN = 10
const DATA_MAX = 1000
const DEFAULT_DATA_UPDATE_PERIOD = 50

/**
 * Creates the random-weight data generator for the specified update period. The data source calls
 * it with its *current* series each time it starts, so Run after Pause continues from the latest
 * accumulated data rather than starting over.
 * @param updatePeriod The period (ms) between generated data points
 * @return The data generator
 */
const randomData = (updatePeriod: number): DataGenerator<TimeSeriesChartData, TimeSeries> =>
    currentSeries => randomWeightDataObservable(currentSeries, DATA_DELTA, updatePeriod, DATA_MIN, DATA_MAX)

/**
 * Creates the chart's data source
 * @param initialData The initial series (owned by the data source from here on)
 * @param dataUpdatePeriod The period (ms) between generated data points
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
type ScatterChartState = {
    x1axisRange: Range
    x2axisRange: Range
    filterValue: string
    selectedInterpolationName: string
    dropAfterMs: number
    numberOfSeries: number
    windowingTime: number
    cadence: number
    dataUpdatePeriod: number
    // whether the y-axes auto-scale (grow to fit the data)
    autoScaleYAxes: boolean
}

const initialState: ScatterChartState = {
    x1axisRange: [0, 10000],
    x2axisRange: [0, 5000],
    filterValue: '',
    selectedInterpolationName: 'curveLinear',
    dropAfterMs: 20_000,
    numberOfSeries: 10,
    windowingTime: 50,
    cadence: 0,
    dataUpdatePeriod: DEFAULT_DATA_UPDATE_PERIOD,
    autoScaleYAxes: false,
}

type ScatterChartActions = {
    setX1axisRange: (range: Range) => void
    setX2axisRange: (range: Range) => void
    setFilterValue: (filterValue: string) => void
    setSelectedInterpolationName: (name: string) => void
    setDropAfterMs: (dropAfterMs: number) => void
    setNumberOfSeries: (numberOfSeries: number) => void
    setWindowingTime: (windowingTime: number) => void
    setCadence: (cadence: number) => void
    setDataUpdatePeriod: (dataUpdatePeriod: number) => void
    setAutoScaleYAxes: (autoScaleYAxes: boolean) => void
    reset: () => void
}

type ScatterChartStore = ScatterChartState & ScatterChartActions &
    DataSourceSlice<TimeSeriesDataSource, TimeSeries> &
    VisibilitySlice

export const useScatterChartStore: UseBoundStore<StoreApi<ScatterChartStore>> = create<ScatterChartStore>()(
    devtools<ScatterChartStore>((set, get, store) => ({
        ...initialState,
        // the data source (which owns the data generator's subscription and the series), and
        // whether it's running
        ...dataSourceSlice<TimeSeriesDataSource, TimeSeries>(
            set,
            get,
            newDataSource([], initialState.dataUpdatePeriod, initialState.dropAfterMs),
            initialData => newDataSource(initialData, get().dataUpdatePeriod, get().dropAfterMs)
        ),

        setX1axisRange: (range: Range) => set({x1axisRange: range}),
        setX2axisRange: (range: Range) => set({x2axisRange: range}),

        // the compiled regex is updated alongside its string representation so that the
        // regex reference only changes when the filter value actually changes
        setFilterValue: filterValue => set({filterValue}),

        // holds status of the visibility for tooltip, tracker, markers, legend
        ...createVisibilitySlice(set, get, store),

        setSelectedInterpolationName: name => set({selectedInterpolationName: name}),

        // data retention belongs to the data source, so keep it in step
        setDropAfterMs: (dropAfterMs: number) => {
            get().dataSource.setDropDataAfter(dropAfterMs)
            set({dropAfterMs})
        },

        setNumberOfSeries: (numberOfSeries: number) => set({numberOfSeries}),

        setWindowingTime: (windowingTime: number) => set({windowingTime}),

        setCadence: (cadence: number) => set({cadence}),

        setAutoScaleYAxes: (autoScaleYAxes: boolean) => set({autoScaleYAxes}),

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
