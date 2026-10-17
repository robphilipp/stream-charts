import {createContext, useCallback, useContext, useSyncExternalStore} from "react";
import type {ChartData} from "../observables/ChartData";
import type {BaseSeries} from "../series/baseSeries";
import type {StreamingDataSource} from "../datasources/StreamingDataSource";

/**
 * The chart's data: its data source, the series the source held when it was handed to the chart,
 * and the chart's streaming settings and callbacks
 * @template CD The type of the chart data
 * @template D The type of datum held in each series
 * @template S The type of series
 */
export interface ChartDataValues<CD extends ChartData, D, S extends BaseSeries<D> = BaseSeries<D>> {
    /**
     * The data source handed to the chart (its `dataSource` prop)
     */
    dataSource: StreamingDataSource<CD, D, S>
    /**
     * The series the data source held when it was handed to the chart (a new data source means
     * new initial data, so plots keyed on it reset)
     */
    initialData: Array<S>
    /**
     * The time (ms) over which incoming data is batched before the plot redraws
     */
    windowingTime: number
    /**
     * The period (ms) at which the data source's generator emits new data, when known. When
     * provided, batching switches from wall-clock-based to a fixed tick count derived from
     * `windowingTime / dataUpdatePeriod` (see the view drivers in `subscriptions/viewDrivers.ts`).
     */
    dataUpdatePeriod?: number
    /**
     * Called when the chart time is updated (e.g. by plots whose axes aren't time)
     * @param time The new chart time
     */
    onUpdateChartTime: (time: number) => void
}

// the context is generic over the same type parameters as `ChartDataValues`, but a context object
// can't itself carry unbound generics -- the hooks below cast it back to the caller's concrete
// types, which is safe because `<Chart/>` is what actually supplies the value
export const ChartDataContext = createContext<unknown>(undefined)

/**
 * @return The chart's data, and its streaming settings
 * @throws Error when used outside a `<Chart>`
 */
function useChartData<CD extends ChartData, D, S extends BaseSeries<D>>(): ChartDataValues<CD, D, S> {
    const context = useContext(ChartDataContext)
    if (context === undefined) {
        throw new Error("The chart's data can only be used within a <Chart/>")
    }
    return context as ChartDataValues<CD, D, S>
}

/**
 * @return The {@link StreamingDataSource} handed to the enclosing {@link Chart} through its
 * `dataSource` prop (`undefined` only outside of a chart)
 * @template CD The type of the chart data
 * @template D The type of datum held in each series
 * @template S The type of series
 */
export function useDataSource<CD extends ChartData, D, S extends BaseSeries<D> = BaseSeries<D>>(): StreamingDataSource<CD, D, S> | undefined {
    return (useContext(ChartDataContext) as ChartDataValues<CD, D, S> | undefined)?.dataSource
}

/**
 * @return The series the chart's data source held when it was handed to the chart (for
 * components that need the set of series up front, e.g. the legend, or a plot resetting itself
 * for new data)
 * @throws Error when used outside a `<Chart>`
 * @template D The type of the datum held in each series
 */
export function useInitialData<D>(): {initialData: Array<BaseSeries<D>>} {
    const {initialData} = useChartData<ChartData, D, BaseSeries<D>>()
    return {initialData}
}

/**
 * @return The chart's streaming settings (how updates are batched for rendering) and callbacks
 * @throws Error when used outside a `<Chart>`
 */
export function useStreamingSettings(): Pick<ChartDataValues<ChartData, unknown>, 'windowingTime' | 'dataUpdatePeriod' | 'onUpdateChartTime'> {
    const {windowingTime, dataUpdatePeriod, onUpdateChartTime} = useChartData<ChartData, unknown, BaseSeries<unknown>>()
    return {windowingTime, dataUpdatePeriod, onUpdateChartTime}
}

/**
 * Subscribes the calling component to the data source's running state, so it re-renders when the
 * source starts or stops (e.g. to switch the zoom pivot, or hide markers while running).
 * @param dataSource The data source, or `undefined` (in which case this is always `false`)
 * @return Whether the data source is currently running
 */
export function useDataSourceRunning<CD extends ChartData, D>(dataSource: StreamingDataSource<CD, D> | undefined): boolean {
    const subscribe = useCallback(
        (onChange: () => void): (() => void) => {
            if (dataSource === undefined) return () => {
            }
            const subscription = dataSource.isRunningObservable.subscribe(() => onChange())
            return () => subscription.unsubscribe()
        },
        [dataSource]
    )
    return useSyncExternalStore(subscribe, () => dataSource?.running ?? false)
}
