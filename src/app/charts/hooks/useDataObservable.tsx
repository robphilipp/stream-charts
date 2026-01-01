import {createContext, JSX, useContext} from "react";
import {concat, from, Observable, Subscription} from "rxjs";
import {ChartData} from "../observables/ChartData";
import {useInitialData} from "./useInitialData";
import {BaseSeries} from "../series/baseSeries";
// import {noop} from "../utils";

/**
 * No operation function for use when a default function is needed
 */
const noop = () => {
    /* empty on purpose */
}

// type SeriesObservable = Observable<TimeSeriesChartData> | Observable<IterateChartData>
// type Data = Array<Datum> | Array<IterateDatum>

/**
 * The values exposed through the {@link useDataObservable} react hook
 */
interface UseObservableValues<CD extends ChartData, D> {
    /**
     * An observable source for chart data
     */
    // seriesObservable?: SeriesObservable
    seriesObservable?: Observable<CD>
    /**
     * When `true` the chart will subscribe to the observable, or if already subscribed, will remain
     * subscribed. When `false` the chart will unsubscribe to the observable if subscribed, or will
     * remain unsubscribed if not already subscribed.
     */
    shouldSubscribe?: boolean
    /**
     * The windowing time for aggregating chart-data events. Defines the update rate of the chart.
     * For example if chart-data events occur every 1 ms, and the windowing time is set to 10 ms,
     * then events will be aggregated for 10 ms, and then the chart will be updated. In this example,
     * the chart would be updated only once per 10 ms.
     */
    windowingTime?: number

    /*
     | USER CALLBACK FUNCTIONS
     */
    /**
     * Callback function that is called when the chart subscribes to the observable
     * @param subscription The subscription resulting form the subscribe action
     */
    onSubscribe: (subscription: Subscription) => void
    /**
     * Callback function that is called when new data arrives to the chart.
     * @param seriesName The name of the series for which new data arrived
     * @param data The new data that arrived in the windowing tine
     * @see UseChartValues.windowingTime
     */
    onUpdateData?: (seriesName: string, data: Array<D>) => void
    /**
     * todo
     * @param time
     */
    onUpdateChartTime?: (time: number) => void
}

const defaultObservableValues: UseObservableValues<any, any> = {
    windowingTime: NaN,
    shouldSubscribe: false,

    // user callbacks
    onSubscribe: noop,
}

const DataObservableContext = createContext<UseObservableValues<any, any>>(defaultObservableValues)

interface Props<CD extends ChartData, D> {
    // live data
    seriesObservable?: Observable<CD>
    windowingTime?: number
    shouldSubscribe?: boolean

    /*
     | USER CALLBACK FUNCTIONS
     */
    /**
     * Callback function that is called when the chart subscribes to the observable
     * @param subscription The subscription resulting form the subscribe action
     */
    onSubscribe?: (subscription: Subscription) => void
    /**
     * Callback function that is called when new data arrives to the chart.
     * @param seriesName The name of the series for which new data arrived
     * @param data The new data that arrived in the windowing tine
     * @see UseChartValues.windowingTime
     */
    onUpdateData?: (seriesName: string, data: Array<D>) => void
    onUpdateChartTime?: (time: number) => void

    children: JSX.Element | Array<JSX.Element>
}

/**
 * The react context provider for the {@link UseObservableValues}
 * @param props The properties
 * @return The children wrapped in this provider
 * @constructor
 */
export default function DataObservableProvider<CD extends ChartData, D>(props: Props<CD, D>): JSX.Element {

    const {
        seriesObservable,
        windowingTime = defaultObservableValues.windowingTime || 100,
        shouldSubscribe,

        onSubscribe = noop,
        onUpdateData = noop,
        onUpdateChartTime = noop,
    } = props

    // when initial data is provided, and importantly, when a function is provided that converts
    // the initial data into an object of type ChartData, and when there is a defined series
    // observable, then the initial data is prepended to the data observable.
    const {initialData, asChartData} = useInitialData<CD, D>()
    const observable = dataObservable<CD, D>(seriesObservable, initialData, asChartData)

    return <DataObservableContext.Provider
        value={{
            seriesObservable: observable,
            windowingTime,
            shouldSubscribe,

            onSubscribe,
            onUpdateData,
            onUpdateChartTime,
        }}
    >
        {props.children}
    </DataObservableContext.Provider>
}

/**
 * When initial data is provided, and importantly, when a function is provided that converts
 * the initial data into an object of type ChartData, and when there is a defined series
 * observable, then the initial data is prepended to the data observable. When only initial data
 * is provided and a conversion function, then a creates an observable from the initial data.
 * And, when only a defined series observable is specified, then that is used (this is the default,
 * and backward compatible behavior).
 * @param seriesObservable An optional series observable
 * @param initialData An array of initial data series
 * @param asChartData A function that converts the initial data series into chart data
 * @return An {@link Observable} of {@link ChartData}, or an `undefined`
 */
function dataObservable<CD extends ChartData, D>(
    seriesObservable?: Observable<CD>,
    initialData?: Array<BaseSeries<D>>,
    asChartData?: (seriesList: Array<BaseSeries<D>>) => CD
): Observable<CD> | undefined {
    if (seriesObservable !== undefined && initialData !== undefined && initialData.length > 0 && asChartData !== undefined) {
        return concat(from([asChartData(initialData)]), seriesObservable)
    } else if (initialData !== undefined && initialData.length > 0 && asChartData !== undefined) {
        return from([asChartData(initialData)])
    } else {
        return seriesObservable
    }
}

/**
 * React hook that sets up the React context for the chart values.
 * @return The {@link UseObservableValues} held in the React context.
 */
export function useDataObservable<CD extends ChartData, D>(): UseObservableValues<CD, D> {
    const context = useContext<UseObservableValues<CD, D>>(DataObservableContext)
    const {onSubscribe} = context
    if (onSubscribe === undefined) {
        throw new Error("useDataObservable can only be used when the parent is a <DataObservableProvider/>")
    }
    return context
}