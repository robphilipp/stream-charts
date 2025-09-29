import {bufferTime, map, mergeAll, mergeWith} from "rxjs/operators";
import {continuousAxisRanges, ContinuousNumericAxis} from "../axes/axes";
import {Datum, TimeSeries} from "../series/timeSeries";
import {ContinuousAxisRange, continuousAxisRangeFor} from "../axes/continuousAxisRangeFor";
import {interval, Observable, Subscription} from "rxjs";
import {TimeSeriesChartData} from "../series/timeSeriesChartData";
import {AxesAssignment} from "../plots/plot";
import {AxesState} from "../hooks/AxesState";
import {BaseSeries, emptySeries} from "../series/baseSeries";
import {IterateChartData} from "../observables/iterates";
import {IterateDatum, IterateSeries} from "../series/iterateSeries";
import {
    copyOrdinalDatumExtremum,
    copyOrdinalStats,
    copyOrdinalValueStats,
    copyValueStatsForSeries,
    defaultOrdinalStats,
    defaultOrdinalValueStats,
    initialMaxValueDatum,
    initialMinValueDatum,
    OrdinalChartData,
    OrdinalStats,
    OrdinalValueStats
} from "../observables/ordinals";
import {ChartData} from "../observables/ChartData";
import {OrdinalDatum} from "../series/ordinalSeries";
import {MutableRefObject} from "react";

export enum TimeWindowBehavior { SCROLL, SQUEEZE }

/**
 * Creates a subscription to the series observable with the data stream. The common code is
 * shared by the plots.
 * @param seriesObservable The series observable holding the stream of chart data
 * @param onSubscribe Callback for when the observable is subscribed to
 * @param windowingTime Basically the update time when data is collected and then rendered
 * @param axisAssignments The assignment of the series to their x- and y-axes
 * @param xAxesState The current state of the x-axis
 * @param onUpdateData Callback for when data is updated
 * @param dropDataAfter Limits the amount of data stored. Any data older than this value (ms) will
 * be dropped on the next update
 * @param updateTimingAndPlot The callback function to update the plot and timing
 * @param seriesMap The series-name and the associated series
 * @param setCurrentTime Callback to update the current time based on the streamed data
 * @param timeWindowBehavior Whether to scroll the time axis or squeeze it
 * @param initialTimes The initial times for each axis, a map(axis_id -> initial_time)
 * @return A subscription to the observable (for cancelling and the likes)
 */
export function subscriptionTimeSeriesFor(
    seriesObservable: Observable<TimeSeriesChartData>,
    onSubscribe: (subscription: Subscription) => void,
    windowingTime: number,
    axisAssignments: Map<string, AxesAssignment>,
    xAxesState: AxesState,
    onUpdateData: ((seriesName: string, data: Array<Datum>) => void) | undefined,
    dropDataAfter: number,
    updateTimingAndPlot: (ranges: Map<string, ContinuousAxisRange>) => void,
    seriesMap: Map<string, TimeSeries>,
    setCurrentTime: (axisId: string, end: number) => void,
    timeWindowBehavior: TimeWindowBehavior = TimeWindowBehavior.SCROLL,
    initialTimes: Map<string, number> = new Map<string, number>(),
): Subscription {
    const subscription = seriesObservable
        .pipe(bufferTime(windowingTime))
        .subscribe(dataList => {
            dataList.forEach(data => {
                // grab the time-windows for the x-axes
                const timesWindows = continuousAxisRanges(xAxesState.axes as Map<string, ContinuousNumericAxis>);

                //
                // calculate the max times for each x-axis, which is the max time over all the
                // series assigned to an x-axis

                // get the series associated with each axis (Map<axis_id, [series_names]>)
                const axesSeries = associatedSeriesForXAxes(data, axisAssignments, xAxesState)

                // add each new point to it's corresponding series, the new points
                // is a map(series_name -> new_point[])
                data.newPoints.forEach((newData, name) => {
                    // grab the current series associated with the new data
                    const series = seriesMap.get(name) || emptySeries(name)

                    // update the handler with the new data point
                    if (onUpdateData) onUpdateData(name, newData)

                    // add the new data to the series
                    series.data.push(...newData)

                    // calculate the current time for the series' assigned x-axis (which may end up
                    // just being the default) based on the max time for the series, and the overall
                    // max time
                    const axisId = axisAssignments.get(name)?.xAxis || xAxesState.axisDefaultId();
                    const currentAxisTime = axesSeries.get(axisId)
                        ?.reduce(
                            (tMax, seriesName) => Math.max(data.maxTimes.get(seriesName) || data.maxTime, tMax),
                            -Infinity
                        ) || data.maxTime

                    if (currentAxisTime !== undefined) {
                        // drop data that is older than the max time-window
                        while (currentAxisTime - series.data[0].time > dropDataAfter) {
                            series.data.shift()
                        }

                        // update the time range for the x-axis, and if the time range
                        // needs to be updated, then recalculate the time range for the
                        // axis, update the time windows, and call the setCurrentTime
                        // callback to update the current time for the caller
                        const range = timesWindows.get(axisId)
                        if (range !== undefined && range.end < currentAxisTime) {
                            const timeWindow = range.end - range.start
                            const timeRange = continuousAxisRangeFor(
                                // 0,
                                timeWindowBehavior === TimeWindowBehavior.SQUEEZE && initialTimes.get(axisId) !== undefined ?
                                    initialTimes.get(axisId)! :
                                    Math.max(0, currentAxisTime - timeWindow),
                                Math.max(currentAxisTime, timeWindow)
                            )
                            timesWindows.set(axisId, timeRange)
                            setCurrentTime(axisId, timeRange.end) // callback
                        }
                    }
                })

                // update the data
                updateTimingAndPlot(timesWindows)  // callback
            })
        })

    // provide the subscription to the caller
    onSubscribe(subscription)   // callback

    return subscription
}

/**
 * **Function has side effects on the Series (for performance).**
 *
 * Creates a subscription to the series observable with the data stream. The common code is
 * shared by the plots.
 * @param seriesObservable The series observable holding the stream of chart data
 * @param onSubscribe Callback for when the observable is subscribed to
 * @param windowingTime Basically the update time when data is collected and then rendered
 * @param axisAssignments The assignment of the series to their x- and y-axes
 * @param xAxesState The current state of the x-axis
 * @param onUpdateData Callback for when data is updated
 * @param dropDataAfter Limits the amount of data stored. Any data older than this value (ms) will
 * be dropped on the next update
 * @param updateTimingAndPlot The callback function to update the plot and timing
 * @param seriesMap The series-name and the associated series
 * @param setCurrentTime Callback to update the current time based on the streamed data
 * @param cadencePeriod The number of milliseconds between time updates
 * @return A subscription to the observable (for cancelling and the likes)
 */
export function subscriptionTimeSeriesWithCadenceFor(
    seriesObservable: Observable<TimeSeriesChartData>,
    onSubscribe: (subscription: Subscription) => void,
    windowingTime: number,
    axisAssignments: Map<string, AxesAssignment>,
    xAxesState: AxesState,
    onUpdateData: ((seriesName: string, data: Array<Datum>) => void) | undefined,
    dropDataAfter: number,
    updateTimingAndPlot: (ranges: Map<string, ContinuousAxisRange>) => void,
    seriesMap: Map<string, TimeSeries>,
    setCurrentTime: (axisId: string, end: number) => void,
    cadencePeriod: number
): Subscription {
    const maxTime = Array.from(seriesMap.entries())
        .reduce(
            (tMax, [, series]) => Math.max(tMax, series.last().map(datum => datum.time).getOrDefault(tMax)),
            // (tMax, [, series]) => Math.max(tMax, series.last().map(datum => datum.time).getOrElse(tMax)),
            -Infinity
        )
    const cadence = interval(cadencePeriod)
        .pipe(
            map(value => ({
                currentTime: value * cadencePeriod,
                    maxTime: value * cadencePeriod,
                    maxTimes: new Map(),
                    newPoints: new Map()
                } as TimeSeriesChartData)
            )
        )

    const subscription = seriesObservable
        .pipe(
            mergeWith(cadence),
            bufferTime(windowingTime),
            mergeAll(),
        )
        .subscribe(data => {
            // grab the time-windows for the x-axes
            const timesWindows = continuousAxisRanges(xAxesState.axes as Map<string, ContinuousNumericAxis>)

            if (data.currentTime !== undefined) {
                xAxesState.axisIds().forEach(axisId => {
                    const range = timesWindows.get(axisId)
                    if (range !== undefined && data.currentTime !== undefined) {
                        const timeWindow = (range.end - range.start)
                        const timeRange = continuousAxisRangeFor(
                            Math.max(0, Math.max(range.end, data.currentTime + maxTime) - timeWindow),
                            Math.max(Math.max(range.end, data.currentTime + maxTime), timeWindow)
                        )
                        timesWindows.set(axisId, timeRange)
                        setCurrentTime(axisId, data.currentTime + maxTime)
                    }
                })
            }

            if (data.newPoints.size === 0) {
                updateTimingAndPlot(timesWindows)
                return
            }

            // determine which series belong to each x-axis
            const axesSeries = associatedSeriesForXAxes(data, axisAssignments, xAxesState)

            // add each new point to it's corresponding series, the new points
            // is a map(series_name -> new_point[])
            data.newPoints.forEach((newData, name) => {
                // grab the current series associated with the new data
                const series = seriesMap.get(name) || emptySeries(name);

                // update the handler with the new data point
                if (onUpdateData) onUpdateData(name, newData);

                // add the new data to the series
                series.data.push(...newData);

                // drop data when specified
                const axisId = axisAssignments.get(name)?.xAxis || xAxesState.axisDefaultId()
                const currentAxisTime = axesSeries.get(axisId)
                    ?.reduce(
                        (tMax, seriesName) => Math.max(data.maxTimes.get(seriesName) || data.maxTime, tMax),
                        -Infinity
                    ) || data.maxTime
                if (currentAxisTime !== undefined) {
                    // drop data that is older than the max time-window
                    while (currentAxisTime - series.data[0].time > dropDataAfter) {
                        series.data.shift()
                    }
                }
            })

            // update the data
            updateTimingAndPlot(timesWindows)
        })

    // provide the subscription to the caller
    onSubscribe(subscription)

    return subscription
}

/**
 * Creates a subscription to the series observable with the data stream. The common code is
 * shared by the plots.
 * @param seriesObservable The series observable holding the stream of chart data
 * @param onSubscribe Callback for when the observable is subscribed to
 * @param windowingTime Basically the update time when data is collected and then rendered
 * @param xAxesState The current state of the x-axis
 * @param yAxesState The current state of the y-axis
 * @param onUpdateData Callback for when data is updated
 * @param dropDataAfter Limits the amount of data stored. Any data older than this value (ms) will
 * be dropped on the next update
 * @param updateRangesAndPlot The callback function to update the plot
 * @param seriesMap The series-name and the associated series
 * @param updateCurrentTime Callback to update the current time based on the streamed data
 * @return A subscription to the observable (for cancelling and the likes)
 */
export function subscriptionIteratesFor(
    seriesObservable: Observable<IterateChartData>,
    onSubscribe: (subscription: Subscription) => void,
    windowingTime: number,
    xAxesState: AxesState,
    yAxesState: AxesState,
    onUpdateData: ((seriesName: string, data: Array<IterateDatum>) => void) | undefined,
    dropDataAfter: number,
    updateRangesAndPlot: () => void,
    seriesMap: Map<string, IterateSeries>,
    updateCurrentTime: (time: number) => void
): Subscription {
    // maintains the x and y-axis ranges based on the original domain of the axes
    const xAxesRanges = new Map<string, ContinuousAxisRange>(Array.from(xAxesState.axes.entries())
        .map(([id, axis]) => {
            const [start, end] = (axis as ContinuousNumericAxis).scale.domain()
            return [id, continuousAxisRangeFor(start, end)]
        }))
    const yAxesRanges = new Map<string, ContinuousAxisRange>(Array.from(yAxesState.axes.entries())
        .map(([id, axis]) => {
            const [start, end] = (axis as ContinuousNumericAxis).scale.domain()
            return [id, continuousAxisRangeFor(start, end)]
        }))

    /**
     * Updates the original axis range with new domain values, while maintaining the original
     * domain values.
     * @param originals The original axis ranges
     * @param axes The current axes
     */
    function updateRange(originals: Map<string, ContinuousAxisRange>, axes: Map<string, ContinuousNumericAxis>): void {
        axes.forEach((axis, id) => {
            const [start, end] = axis.scale.domain()
            const original: ContinuousAxisRange = originals.get(id) || continuousAxisRangeFor(start, end)
            originals.set(id, original.update(start, end))
        })
    }

    const subscription = seriesObservable
        .pipe(bufferTime(windowingTime))
        .subscribe(dataList => {
            dataList.forEach(data => {
                // calculate the bounds for each of the x- and y-axes
                updateRange(xAxesRanges, xAxesState.axes  as Map<string, ContinuousNumericAxis>)
                updateRange(yAxesRanges, yAxesState.axes  as Map<string, ContinuousNumericAxis>)

                // add each new point to its corresponding series, the newPoints object
                // is a map(series_name -> new_point[])
                data.newPoints.forEach((newData, seriesName) => {
                    // grab the current series associated with the new data
                    const series = seriesMap.get(seriesName) || emptySeries(seriesName)

                    // update the handler with the new data points
                    if (onUpdateData) onUpdateData(seriesName, newData)

                    // add the new data to the series
                    series.data.push(...newData)

                    // calculate and update the current time, which will be that max time of the
                    // f[n+1](x) values (y-axis)
                    const currentTime = Array.from(data.newPoints.values())
                        .reduce((maxTime, currentSeries) => {
                            const seriesMaxTime = currentSeries.length > 0 ? currentSeries[currentSeries.length-1].time : 0
                            if (seriesMaxTime > maxTime) {
                                return seriesMaxTime
                            }
                            return maxTime
                        }, 0)

                    updateCurrentTime(currentTime)

                    // drop data that is older than the max time-window
                    while (currentTime - series.data[0].time > dropDataAfter) {
                        series.data.shift()
                    }

                })

                // update the data
                const xRange = xAxesRanges.get(xAxesState.axisDefaultId())
                const yRange = yAxesRanges.get(yAxesState.axisDefaultId())
                if (xRange !== undefined && yRange !== undefined) {
                    updateRangesAndPlot()
                }
            })
        })

    // provide the subscription to the caller
    onSubscribe(subscription)

    return subscription
}


// interface WindowedOrdinalValueStats {
//     count: number
//     sum: number
//     mean: number
//     sumSquared: number
// }

export interface WindowedOrdinalStats extends OrdinalStats {
    /**
     * A map associating each series to stats about that series (e.g. map(series_name -> stats))
     */
    windowedValueStatsForSeries: Map<string, OrdinalValueStats>
}

export function defaultWindowedOrdinalStats(): WindowedOrdinalStats {
    return {
        ...defaultOrdinalStats(),
        windowedValueStatsForSeries: new Map<string, OrdinalValueStats>(),
    }
}

function copyWindowedOrdinalStats(data: WindowedOrdinalStats): WindowedOrdinalStats {
    return {
        ...copyOrdinalStats(data),
        windowedValueStatsForSeries: new Map<string, OrdinalValueStats>(
            Array.from(data.windowedValueStatsForSeries.entries()))
    }
}

/**
 * Creates a subscription to the series observable with the data stream. The common code is
 * shared by the plots.
 * @param seriesObservable The series observable holding the stream of chart data
 * @param onSubscribe Callback for when the observable is subscribed to
 * @param windowingTime Basically the update time when data is collected and then rendered
 * @param axisAssignments The assignment of the series to their x- and y-axes
 * @param yAxesState The current state of the x-axis
 * @param onUpdateData Callback for when data is updated
 * @param dropDataAfter Limits the amount of data stored. Any data older than this value (ms) will
 * be dropped on the next update
 * @param updateTimingAndPlot The callback function to update the plot and timing
 * @param seriesMap The series-name and the associated series
 * @param ordinalStatsRef The statistics about the data in the chart and about each series
 * @param setCurrentTime Callback to update the current time based on the streamed data
 * @return A subscription to the observable (for cancelling and the likes)
 */
export function subscriptionOrdinalXFor(
    seriesObservable: Observable<OrdinalChartData>,
    onSubscribe: (subscription: Subscription) => void,
    windowingTime: number,
    axisAssignments: Map<string, AxesAssignment>,
    yAxesState: AxesState,
    onUpdateData: ((seriesName: string, data: Array<OrdinalDatum>) => void) | undefined,
    dropDataAfter: number,
    updateTimingAndPlot: (ranges: Map<string, ContinuousAxisRange>) => void,
    seriesMap: Map<string, BaseSeries<OrdinalDatum>>,
    ordinalStatsRef: MutableRefObject<WindowedOrdinalStats>,
    setCurrentTime: (currentTime: number) => void,
): Subscription {

    /**
     * First of two functions to calculate the current ordinal stats for the current time window. This
     * function updates the windowed stats for the new data.
     * @param newData The new data for that series
     * @param windowedStats The current windowed ordinal value status
     * @return The windowed ordinal value stats updated for the new data
     */
    function updatedWindowedValueStatsForNewData(newData: Array<OrdinalDatum>, windowedStats: OrdinalValueStats): OrdinalValueStats {
        const updatedStats = copyOrdinalValueStats(windowedStats)
        updatedStats.count += newData.length
        const newSum = newData.reduce((total, datum) => total + datum.value, 0)
        updatedStats.sum += newSum
        updatedStats.sumSquared += newSum * newSum
        updatedStats.mean = (updatedStats.count > 0) ? updatedStats.sum / updatedStats.count : NaN
        updatedStats.min = newData.reduce((min, datum) => datum.value < min.value ? datum : min, updatedStats.min)
        updatedStats.max = newData.reduce((max, datum) => datum.value > max.value ? datum : max, updatedStats.max)
        return updatedStats
    }

    /**
     * Second of two functions to calculate the current ordinal stats for the current time window. This
     * function updates the windowed stats by for the dropped data
     * @param droppedData An array of datum that was dropped from the time window
     * @param windowedStats The current windowed ordinal value stats
     * @param lifetimeStats The lifetime ordinal value stats
     * @param series An array of series holding all the current data in the time-window
     * @return The windowed ordinal value stats updated for the dropped data
     */
    function updateWindowedValueStatsForDroppedData(
        droppedData: Array<OrdinalDatum>,
        windowedStats: OrdinalValueStats,
        lifetimeStats: OrdinalValueStats,
        series: BaseSeries<OrdinalDatum>
    ): OrdinalValueStats {
        const updatedStats = copyOrdinalValueStats(windowedStats)
        // calculate the windowed stats based on the dropped data
        updatedStats.count -= droppedData.length
        const droppedSum = droppedData.reduce((total, datum) => total + datum.value, 0)
        updatedStats.sum -= droppedSum
        updatedStats.sumSquared -= droppedSum * droppedSum
        updatedStats.mean = (updatedStats.count > 0) ? updatedStats.sum / updatedStats.count : NaN
        updatedStats.min = series.data.reduce((min, datum) => datum.value < min.value ? datum : min, initialMinValueDatum())
        updatedStats.max = series.data.reduce((max, datum) => datum.value > max.value ? datum : max, initialMaxValueDatum())
        return updatedStats
    }

    //
    // beginning of the subscription function
    //
    const subscription = seriesObservable
        .pipe(bufferTime(windowingTime))
        .subscribe(dataList => {
            dataList.forEach((data: OrdinalChartData) => {
                // grab the axis ranges for the y-axes
                const yAxisRanges = continuousAxisRanges(yAxesState.axes as Map<string, ContinuousNumericAxis>);

                //
                // calculate the max times for each x-axis, which is the max time over all the
                // series assigned to an x-axis

                // get the series associated with each y-axis (Map<axis_id, [series_names]>)
                const axesSeries = associatedSeriesForYAxes(data, axisAssignments, yAxesState)

                // add each new point to it's corresponding series, the new points
                // is a map(series_name -> new_point[])
                data.newPoints.forEach((newData, name) => {
                    // grab the current series associated with the new data
                    const series = seriesMap.get(name) || emptySeries(name)

                    // update the handler with the new data point
                    if (onUpdateData) onUpdateData(name, newData)

                    // add the new data to the series
                    series.data.push(...newData)

                    // grab the stats
                    ordinalStatsRef.current.minDatum = copyOrdinalDatumExtremum(data.stats.minDatum)
                    ordinalStatsRef.current.maxDatum = copyOrdinalDatumExtremum(data.stats.maxDatum)
                    ordinalStatsRef.current.valueStatsForSeries = copyValueStatsForSeries(data.stats.valueStatsForSeries)

                    // set up for the windowed-stats
                    const lifetimeValueStats = data.stats.valueStatsForSeries.get(name) || defaultOrdinalValueStats()
                    if (!ordinalStatsRef.current.windowedValueStatsForSeries.has(name)) {
                        ordinalStatsRef.current.windowedValueStatsForSeries.set(name, copyOrdinalValueStats(lifetimeValueStats))
                        // ordinalStatsRef.current.windowedValueStatsForSeries.set(name, defaultOrdinalValueStats())
                    }

                    // update the windowed-stats for the new points (later will deal with datum
                    // that were dropped)
                    const updatedStats = ordinalStatsRef.current.windowedValueStatsForSeries.get(name)!
                    const windowedValueStats = updatedWindowedValueStatsForNewData(newData, updatedStats)
                    ordinalStatsRef.current.windowedValueStatsForSeries.set(name, windowedValueStats)

                    // calculate the current value for the series' assigned y-axis (which may end up
                    // just being the default) based on the max time for the series, and the overall
                    // max time
                    const axisId = axisAssignments.get(name)?.yAxis || yAxesState.axisDefaultId();
                    const currentTime = axesSeries.get(axisId)
                        ?.reduce(
                            (tMax, _) => Math.max(data.stats.maxDatum.time.time, tMax),
                            -Infinity
                        ) || NaN
                    setCurrentTime(currentTime)

                    if (currentTime !== undefined) {
                        // drop data that is older than the max time-window, holding on to the dropped ones
                        let droppedData: Array<OrdinalDatum> = []
                        while (currentTime - series.data[0].time > dropDataAfter) {
                            const dropped = series.data.shift()
                            if (dropped !== undefined) {
                                droppedData.push(dropped)
                            }
                        }

                        // calculate the windowed stats based on the dropped data
                        if (droppedData.length > 0 && lifetimeValueStats !== undefined) {
                            ordinalStatsRef.current.windowedValueStatsForSeries.set(
                                name,
                                updateWindowedValueStatsForDroppedData(droppedData, windowedValueStats, lifetimeValueStats, series)
                            )
                        }

                        // // update the time range for the x-axis, and if the time range
                        // // needs to be updated, then recalculate the time range for the
                        // // axis, update the time windows, and call the setCurrentTime
                        // // callback to update the current time for the caller
                        // const range = yAxisRanges.get(axisId)
                        // if (range !== undefined && range.end < currentAxisTime) {
                        //     const timeWindow = range.end - range.start
                        //     const timeRange = continuousAxisRangeFor(
                        //         // 0,
                        //         timeWindowBehavior === TimeWindowBehavior.SQUEEZE && initialTimes.get(axisId) !== undefined ?
                        //             initialTimes.get(axisId)! :
                        //             Math.max(0, currentAxisTime - timeWindow),
                        //         Math.max(currentAxisTime, timeWindow)
                        //     )
                        //     yAxisRanges.set(axisId, timeRange)
                        //     setCurrentTime(axisId, timeRange.end) // callback
                        // }
                    }
                })

                // // grab the stats
                // ordinalStatsRef.current.minDatum = copyOrdinalDatumExtremum(data.stats.minDatum)
                // ordinalStatsRef.current.maxDatum = copyOrdinalDatumExtremum(data.stats.maxDatum)
                // ordinalStatsRef.current.valueStatsForSeries = copyValueStatsForSeries(data.stats.valueStatsForSeries)

                // update the data
                updateTimingAndPlot(yAxisRanges)  // callback
            })
        })

    // provide the subscription to the caller
    onSubscribe(subscription)   // callback

    return subscription
}

/**
 * Determines which series are assigned to which x-axes, and returns a map holding the
 * x-axis names and their associated list of series
 * @param data The chart data
 * @param axisAssignments A map holding the  series names and its associated x-axis and y-axis names
 * @param xAxesState Holds information about the axis and how it is displayed
 * @return A map holding the x-axis names the names of the series associated with the axis.
 */
function associatedSeriesForXAxes(
    data: TimeSeriesChartData,
    axisAssignments: Map<string, AxesAssignment>,
    xAxesState: AxesState
): Map<string, Array<string>> {
    return associatedSeriesFor(
        assignment => assignment?.xAxis || xAxesState.axisDefaultId(),
        data,
        axisAssignments
    )
}

/**
 * Determines which series are assigned to which y-axes, and returns a map holding the
 * x-axis names and their associated list of series
 * @param data The chart data
 * @param axisAssignments A map holding the  series names and its associated x-axis and y-axis names
 * @param yAxesState Holds information about the axis and how it is displayed
 * @return A map holding the y-axis names the names of the series associated with the axis.
 */
function associatedSeriesForYAxes(
    data: ChartData,
    axisAssignments: Map<string, AxesAssignment>,
    yAxesState: AxesState
): Map<string, Array<string>> {
    return associatedSeriesFor(
        assignment => assignment?.yAxis || yAxesState.axisDefaultId(),
        data,
        axisAssignments
    )
}

/**
 * Determines which series are assigned to which axes, and returns a map holding the
 * axis names and their associated list of series. The extractor function returns the axis ID
 * for the series and is responsible for return the x-axis ID or the y-axis ID depending
 * on the context of the call.
 * @param axisIdExtractor A function that accepts the {@link AxesAssignment} and returns the axis ID
 * @param data The chart data
 * @param axisAssignments A map holding the  series names and its associated x-axis and y-axis names
 * @return A map holding the axis names the names of the series associated with the axis.
 */
function associatedSeriesFor(
    axisIdExtractor: (assignment?: AxesAssignment) => string,
    data: ChartData,
    axisAssignments: Map<string, AxesAssignment>
): Map<string, Array<string>> {
    return Array
        .from(data.seriesNames)
        .reduce(
            (assignedSeries, seriesName) => {
                const id = axisIdExtractor(axisAssignments.get(seriesName))
                const series = assignedSeries.get(id) || []
                series.push(seriesName)
                assignedSeries.set(id, series)
                return assignedSeries
            },
            new Map<string, Array<string>>()
        )
}
