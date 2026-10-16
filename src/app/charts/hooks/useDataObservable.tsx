import {createContext, useContext} from "react";

/**
 * The chart's streaming settings and callbacks (the data itself comes from the chart's data
 * source -- see {@link useDataSource})
 */
export interface UseObservableValues {
    /**
     * The time (in milliseconds) over which incoming data is batched before the plot redraws
     */
    windowingTime?: number
    /**
     * The period (ms) at which the data source's generator emits new data, when known. When
     * provided, batching switches from wall-clock-based to a fixed tick count derived from
     * `windowingTime / dataUpdatePeriod` (see the view drivers in `subscriptions/viewDrivers.ts`).
     */
    dataUpdatePeriod?: number

    /*
     | USER CALLBACK FUNCTIONS
     */
    /**
     * Callback function that is called when the chart time is updated
     * @param time The new chart time
     */
    onUpdateChartTime?: (time: number) => void
}

export const DataObservableContext = createContext<UseObservableValues | undefined>(undefined)

/**
 * React hook for the chart's streaming settings and callbacks. Must be used within a
 * {@link DataObservableProvider} (i.e. within a `<Chart>`).
 * @return The {@link UseObservableValues} held in the React context.
 * @throws Error when this hook is used outside of its provider
 */
export function useDataObservable(): UseObservableValues {
    const context = useContext(DataObservableContext)
    if (context === undefined) {
        throw new Error("useDataObservable can only be used when the parent is a <DataObservableProvider/>")
    }
    return context
}
