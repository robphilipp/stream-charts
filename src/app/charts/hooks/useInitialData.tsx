import {createContext, JSX, useContext} from "react";
import {BaseSeries} from "../series/baseSeries";
import {ChartData} from "../observables/ChartData";


/**
 * The values exposed through the {@link useInitialData} react hook
 */
type UseInitialDataValues<CD extends ChartData, D> = {
    /**
     * An array of series representing the initial data for the chart (i.e. static data
     * before streaming starts) where D is a datum, whose type must be the same as that
     * used for the Observable on the chart data
     */
    initialData: Array<BaseSeries<D>>

    /**
     * Function that takes an array of series (which has elements of type D) and converts
     * it into a chart data type, CD
     * @param seriesList
     */
    asChartData?: (seriesList: Array<BaseSeries<D>>) => CD
}

const defaultInitialDataValues: UseInitialDataValues<any, any> = {
    initialData: new Array<BaseSeries<any>>()
}

const InitialDataContext = createContext<UseInitialDataValues<any, any>>(defaultInitialDataValues)

interface Props<CD extends ChartData, D> {
    initialData: Array<BaseSeries<D>>
    asChartData?: (seriesList: Array<BaseSeries<D>>) => CD
    children: JSX.Element | Array<JSX.Element>
}

/**
 * The React context provider for the {@link UseInitialDataValues}
 * @param props The properties
 * @return The children wrapped in this provider
 * @constructor
 */
export default function InitialDataProvider<CD extends ChartData, D>(props: Props<CD, D>): JSX.Element {
    const {
        initialData,
        asChartData
    } = props

    return <InitialDataContext.Provider value={{initialData, asChartData}}>
        {props.children}
    </InitialDataContext.Provider>
}

/**
 * React hook that sets up the React context for the initial data values.
 * @return The {@link UseInitialDataValues} held in the React context.
 */
export function useInitialData<CD extends ChartData, D>(): UseInitialDataValues<CD, D> {
    const context = useContext<UseInitialDataValues<CD, D>>(InitialDataContext)
    const {initialData} = context
    if (initialData === undefined) {
        throw new Error("useInitialData can only be used when the parent is a <InitialDataProvider/>")
    }
    return context
}