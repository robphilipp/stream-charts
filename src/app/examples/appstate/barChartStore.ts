import type {UseBoundStore} from "zustand";
import {create, type StoreApi} from 'zustand';
import type {BaseSeries} from "../../charts/series/baseSeries.ts";
import {calculateOrdinalStats, type OrdinalDatum} from "../../charts/series/ordinalSeries.ts";
import {type OrdinalChartData, ordinalsObservable} from "../../charts/observables/ordinals.ts";
import {barDanceDataObservable} from "../dataproviders/randomOrdinalData.ts";
import {createInitialVisibility} from "../options/visibility.ts";
import {DEFAULT_DROP_AFTER_10} from "../options/dropDataAfter.ts";
import type {BarPlotZoomState} from "../../charts/plots/BarPlot.tsx";
import {OrdinalDataSource} from "../../charts/datasources/ordinalDataSource.ts";
import type {DataGenerator} from "../../charts/datasources/StreamingDataSource.ts";
import {devtools} from "zustand/middleware";
import {type DataSourceSlice, dataSourceSlice} from "./stateslices/dataSourceStateSlice.ts";
import {
    type VisibilitySlice,
    visibilitySliceStateCreator,
    type VisibilityStateSlice
} from "./stateslices/visibilityStateSlice.ts";

/*
    set up the data state
 */
const DEFAULT_DATA_UPDATE_PERIOD = 50

/**
 * Creates the "dancing bars" data generator for the specified update period. The data source calls
 * it with its *current* series each time it starts, so Run after Pause continues from the latest
 * accumulated data: the generator's time starts from the series' latest time, and its stats start
 * from the series' stats (the existing data itself isn't re-emitted, which would duplicate it).
 * @param updatePeriod The period (ms) between generated data points
 * @return The data generator
 */
const randomData = (updatePeriod: number): DataGenerator<OrdinalChartData, BaseSeries<OrdinalDatum>> =>
    currentSeries => ordinalsObservable(
        barDanceDataObservable(currentSeries, updatePeriod),
        undefined,
        calculateOrdinalStats(currentSeries)
    )

/**
 * Creates the chart's data source
 * @param initialData The initial series (owned by the data source from here on)
 * @param dataUpdatePeriod The period (ms) between generated data points
 * @param dropAfterMs Data older than this (ms) is dropped
 * @return The data source
 */
const newDataSource = (initialData: Array<BaseSeries<OrdinalDatum>>, dataUpdatePeriod: number, dropAfterMs: number): OrdinalDataSource =>
    new OrdinalDataSource({initialData, generator: randomData(dataUpdatePeriod), dropDataAfter: dropAfterMs})

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
type BarChartState = {
    filterValue: string
    dropAfterMs: number
    numberOfSeries: number
    windowingTime: number
    dataUpdatePeriod: number
    // which of the time-series statistics are shown in the plot
    showMinMax: boolean
    showValue: boolean
    showMean: boolean
    showWinMinMax: boolean
    showWinMean: boolean
    // the bar plot's zoom/pan state (undefined when never zoomed/panned), handed back to the
    // plot when it remounts so that navigating away and back doesn't reset the zoom
    zoomState: BarPlotZoomState | undefined
    // whether the y-axes auto-scale (grow to fit the data)
    autoScaleYAxes: boolean
    // the auto-scaled y-axes' domains, kept so that their growth survives navigating away and back
    // (undefined until they've been auto-scaled)
    y1AutoScaledDomain: [min: number, max: number] | undefined
    y2AutoScaledDomain: [min: number, max: number] | undefined
}

const initialState: BarChartState = {
    filterValue: '',
    dropAfterMs: DEFAULT_DROP_AFTER_10[1],
    numberOfSeries: 50,
    windowingTime: 50,
    dataUpdatePeriod: DEFAULT_DATA_UPDATE_PERIOD,
    showMinMax: true,
    showValue: true,
    showMean: true,
    showWinMinMax: true,
    showWinMean: true,
    zoomState: undefined,
    autoScaleYAxes: false,
    y1AutoScaledDomain: undefined,
    y2AutoScaledDomain: undefined,
}

type BarChartActions = {
    setFilterValue: (filterValue: string) => void
    setDropAfterMs: (dropAfterMs: number) => void
    setNumberOfSeries: (numberOfSeries: number) => void
    setWindowingTime: (windowingTime: number) => void
    setDataUpdatePeriod: (dataUpdatePeriod: number) => void
    setShowMinMax: (show: boolean) => void
    setShowValue: (show: boolean) => void
    setShowMean: (show: boolean) => void
    setShowWinMinMax: (show: boolean) => void
    setShowWinMean: (show: boolean) => void
    setZoomState: (zoomState: BarPlotZoomState) => void
    setAutoScaleYAxes: (autoScaleYAxes: boolean) => void
    setY1AutoScaledDomain: (domain: [min: number, max: number]) => void
    setY2AutoScaledDomain: (domain: [min: number, max: number]) => void
    reset: () => void
}

type BarChartStore = BarChartState & BarChartActions &
    DataSourceSlice<OrdinalDataSource, BaseSeries<OrdinalDatum>> &
    VisibilitySlice

export const useBarChartStore: UseBoundStore<StoreApi<BarChartStore>> = create<BarChartStore>()(
    devtools<BarChartStore>((set, get, store) => ({
        ...initialState,
        // the data source (which owns the data generator's subscription, the series, and their
        // stats), and whether it's running
        ...dataSourceSlice<OrdinalDataSource, BaseSeries<OrdinalDatum>>(
            set,
            get,
            newDataSource([], initialState.dataUpdatePeriod, initialState.dropAfterMs),
            initialData => newDataSource(initialData, get().dataUpdatePeriod, get().dropAfterMs)
        ),

        // the compiled regex is derived from this in the component, so its reference only
        // changes when the filter value actually changes
        setFilterValue: filterValue => set({filterValue}),

        // holds status of the visibility for tooltip, tracker, and axes highlighting
        ...createVisibilitySlice(set, get, store),

        // data retention belongs to the data source, so keep it in step
        setDropAfterMs: (dropAfterMs: number) => {
            get().dataSource.setDropDataAfter(dropAfterMs)
            set({dropAfterMs})
        },

        setNumberOfSeries: (numberOfSeries: number) => set({numberOfSeries}),

        setWindowingTime: (windowingTime: number) => set({windowingTime}),

        setShowMinMax: (showMinMax: boolean) => set({showMinMax}),
        setShowValue: (showValue: boolean) => set({showValue}),
        setShowMean: (showMean: boolean) => set({showMean}),
        setShowWinMinMax: (showWinMinMax: boolean) => set({showWinMinMax}),
        setShowWinMean: (showWinMean: boolean) => set({showWinMean}),

        setZoomState: (zoomState: BarPlotZoomState) => set({zoomState}),

        // (turning auto-scaling on, or off, starts the axes afresh)
        setAutoScaleYAxes: (autoScaleYAxes: boolean) =>
            set({autoScaleYAxes, y1AutoScaledDomain: undefined, y2AutoScaledDomain: undefined}),
        setY1AutoScaledDomain: (domain: [min: number, max: number]) => set({y1AutoScaledDomain: domain}),
        setY2AutoScaledDomain: (domain: [min: number, max: number]) => set({y2AutoScaledDomain: domain}),

        // the update period is baked into the generator, so give the data source a new one (only
        // possible while stopped, which is the only time the control is enabled)
        setDataUpdatePeriod: (dataUpdatePeriod: number) => {
            get().dataSource.setGenerator(randomData(dataUpdatePeriod))
            set({dataUpdatePeriod})
        },

        // resets the settings (including the zoom state), and replaces the data source with an
        // empty one (which disposes of, and so stops, the current one) -- the chart re-seeds it
        // with its initial data
        reset: () => {
            set({...initialState, ...initialVisibilityState})
            get().setInitialData([])
        }
    })));
