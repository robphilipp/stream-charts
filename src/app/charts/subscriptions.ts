import {bufferTime, map, mergeAll, mergeWith, windowTime} from "rxjs/operators";
import {ContinuousNumericAxis, timeRanges} from "./axes";
import {Datum, emptySeries, Series} from "./datumSeries";
import {ContinuousAxisRange, continuousAxisRangeFor} from "./continuousAxisRangeFor";
import {animationFrameScheduler, asyncScheduler, interval, Observable, Subscription} from "rxjs";
import {ChartData} from "./chartData";
import {AxesAssignment} from "./plot";
import {AxesState} from "./hooks/AxesState";

/**
 * Creates a subscription to the series observable with the data stream. The common code is
 * shared by the plots.
 * @param seriesObservable The series observable holding the stream of chart data
 * @param onSubscribe Callback for when the observable is subscribed to
 * @param windowingTime Basically the update time where data is collected and then rendered
 * @param axisAssignments The assignment of the series to their x- and y-axes
 * @param xAxesState The current state of the x-axis
 * @param onUpdateData Callback for when data is updated
 * @param dropDataAfter Limits the amount of data stored. Any data older than this value (ms) will
 * be dropped on the next update
 * @param updateTimingAndPlot The callback function to update the plot and timing
 * @param seriesMap The series-name and the associated series
 * @param setCurrentTime Callback to update the current time based on the streamed data
 * @return A subscription to the observable (for cancelling and the likes)
 */
export function subscriptionFor(
    seriesObservable: Observable<ChartData>,
    onSubscribe: (subscription: Subscription) => void,
    windowingTime: number,
    axisAssignments: Map<string, AxesAssignment>,
    xAxesState: AxesState,
    onUpdateData: ((seriesName: string, data: Array<Datum>) => void) | undefined,
    dropDataAfter: number,
    updateTimingAndPlot: (ranges: Map<string, ContinuousAxisRange>) => void,
    seriesMap: Map<string, Series>,
    setCurrentTime: (axisId: string, end: number) => void
): Subscription {
    const subscription = seriesObservable
        .pipe(bufferTime(windowingTime))
        .subscribe(async dataList => {
            await dataList.forEach(data => {
                // grab the time-winds for the x-axes
                const timesWindows = timeRanges(xAxesState.axes as Map<string, ContinuousNumericAxis>)

                // calculate the max times for each x-axis, which is the max time over all the
                // series assigned to an x-axis
                const axesSeries = Array.from(data.maxTimes.entries())
                    .reduce(
                        (assignedSeries, [seriesName,]) => {
                            const id = axisAssignments.get(seriesName)?.xAxis || xAxesState.axisDefaultName()
                            const as = assignedSeries.get(id) || []
                            as.push(seriesName)
                            assignedSeries.set(id, as)
                            return assignedSeries
                        },
                        new Map<string, Array<string>>()
                    )

                // add each new point to it's corresponding series, the new points
                // is a map(series_name -> new_point[])
                data.newPoints.forEach((newData, name) => {
                    // grab the current series associated with the new data
                    const series = seriesMap.get(name) || emptySeries(name);

                    // update the handler with the new data point
                    if (onUpdateData) onUpdateData(name, newData);

                    // add the new data to the series
                    series.data.push(...newData);

                    const axisId = axisAssignments.get(name)?.xAxis || xAxesState.axisDefaultName()
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

                        const range = timesWindows.get(axisId)
                        if (range !== undefined && range.end < currentAxisTime) {
                            const timeWindow = range.end - range.start
                            const timeRange = continuousAxisRangeFor(
                                Math.max(0, currentAxisTime - timeWindow),
                                Math.max(currentAxisTime, timeWindow)
                            )
                            timesWindows.set(axisId, timeRange)
                            setCurrentTime(axisId, timeRange.end)
                        }
                    }
                })

                // update the data
                updateTimingAndPlot(timesWindows)
            })
        })

    // provide the subscription to the caller
    onSubscribe(subscription)

    return subscription
}

/**
 * **Function has side-effects on the Series (for performance).**
 *
 * Creates a subscription to the series observable with the data stream. The common code is
 * shared by the plots.
 * @param seriesObservable The series observable holding the stream of chart data
 * @param onSubscribe Callback for when the observable is subscribed to
 * @param windowingTime Basically the update time where data is collected and then rendered
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
export function subscriptionWithCadenceFor(
    seriesObservable: Observable<ChartData>,
    onSubscribe: (subscription: Subscription) => void,
    windowingTime: number,
    axisAssignments: Map<string, AxesAssignment>,
    xAxesState: AxesState,
    onUpdateData: ((seriesName: string, data: Array<Datum>) => void) | undefined,
    dropDataAfter: number,
    updateTimingAndPlot: (ranges: Map<string, ContinuousAxisRange>) => void,
    seriesMap: Map<string, Series>,
    setCurrentTime: (axisId: string, end: number) => void,
    cadencePeriod: number
): Subscription {
    const maxTime = Array.from(seriesMap.entries())
        .reduce(
            (tMax, [, series]) => Math.max(tMax, series.last().map(datum => datum.time).getOrElse(tMax)),
            -Infinity
        )
    const cadence = interval(cadencePeriod)
        .pipe(
            map(value => ({
                currentTime: value * cadencePeriod,
                    maxTime: value * cadencePeriod,
                    maxTimes: new Map(),
                    newPoints: new Map()
                } as ChartData)
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
            const timesWindows = timeRanges(xAxesState.axes as Map<string, ContinuousNumericAxis>)

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
            const axesSeries = Array.from(data.maxTimes.entries())
                .reduce(
                    (assignedSeries, [seriesName,]) => {
                        const id = axisAssignments.get(seriesName)?.xAxis || xAxesState.axisDefaultName()
                        const as = assignedSeries.get(id) || []
                        as.push(seriesName)
                        assignedSeries.set(id, as)
                        return assignedSeries
                    },
                    new Map<string, Array<string>>()
                )

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
                const axisId = axisAssignments.get(name)?.xAxis || xAxesState.axisDefaultName()
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

