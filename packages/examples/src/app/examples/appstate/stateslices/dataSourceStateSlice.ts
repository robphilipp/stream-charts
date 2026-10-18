import type {StreamingDataSource} from "../../../charts/datasources/StreamingDataSource.ts";
import type {ChartData} from "../../../charts/observables/ChartData.ts";

/**
 * The part of a data source the store manages: its lifecycle and running state
 */
type ManagedDataSource = Pick<StreamingDataSource<ChartData, unknown>, 'start' | 'stop' | 'dispose' | 'isRunningObservable' | 'running'>

/**
 * Holds the chart's data source, which owns the (single) subscription to the data generator and
 * the series the data accumulates into. Because the store outlives the chart component, so does
 * the data source -- it keeps ingesting while the chart is unmounted (e.g. the user navigated to
 * another page), and the remounted chart simply picks up from it.
 * @template DS The type of the data source
 * @template S The type of series
 */
export type DataSourceSlice<DS extends ManagedDataSource, S> = {
    /**
     * The chart's data source. Replaced (never mutated into a different data set) whenever the
     * initial data changes, so components can key on its identity.
     */
    dataSource: DS
    /**
     * Whether the data source is running. Mirrors the data source's own state (e.g. becomes
     * `false` if the generator completes), and is changed through {@link setRunning}.
     */
    running: boolean
    /**
     * Replaces the data source with a new one, holding the specified initial data. Disposes of the
     * previous data source (which stops it).
     * @param initialData The initial series for the new data source
     */
    setInitialData: (initialData: Array<S>) => void
    /**
     * Starts or stops the data source (Run/Pause)
     * @param running `true` to start the data source; `false` to stop it
     */
    setRunning: (running: boolean) => void
}

/**
 * Creates the data-source slice of a store.
 * @param set The store's `set` function
 * @param get The store's `get` function
 * @param initialDataSource The data source to start out with (created by the caller, because the
 * store's own settings aren't available through `get` until the store has been created)
 * @param createDataSource Creates a data source for the specified initial data (typically reading
 * the store's current settings, e.g. the data-update period, through `get`)
 * @return The data-source slice
 */
export function dataSourceSlice<DS extends ManagedDataSource, S>(
    set: (partial: Partial<DataSourceSlice<DS, S>>) => void,
    get: () => DataSourceSlice<DS, S>,
    initialDataSource: DS,
    createDataSource: (initialData: Array<S>) => DS,
): DataSourceSlice<DS, S> {

    // mirrors the data source's own running state into the store, for as long as it is the
    // store's current data source (its observables complete when it's disposed)
    const mirrorRunning = (dataSource: DS): DS => {
        dataSource.isRunningObservable.subscribe(running => {
            const state = get()
            if (state !== undefined && state.dataSource === dataSource && state.running !== running) {
                set({running})
            }
        })
        return dataSource
    }

    return {
        dataSource: mirrorRunning(initialDataSource),
        running: initialDataSource.running,

        setInitialData: (initialData: Array<S>) => {
            get().dataSource.dispose()
            set({dataSource: mirrorRunning(createDataSource(initialData)), running: false})
        },

        setRunning: (running: boolean) => {
            const {dataSource} = get()
            if (running) dataSource.start()
            else dataSource.stop()
            set({running: dataSource.running})
        },
    }
}
