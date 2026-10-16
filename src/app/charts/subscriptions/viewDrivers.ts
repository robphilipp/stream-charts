import {interval, type MonoTypeOperatorFunction, type Observable, type OperatorFunction, Subscription} from "rxjs";
import {bufferCount, bufferTime, map, mergeAll, mergeWith} from "rxjs/operators";
import {continuousAxisRanges, type ContinuousNumericAxis} from "../axes/axes";
import {AxesState} from "../axes/AxesState";
import {ContinuousAxisRange} from "../axes/ContinuousAxisRange";
import type {AxesAssignment} from "../plots/plot";
import type {ChartData} from "../observables/ChartData";
import type {TimeSeriesChartData} from "../series/timeSeriesChartData";
import type {OutlierChartData} from "../observables/outliers";
import type {OrdinalChartData} from "../observables/ordinals";
import type {IterateChartData} from "../observables/iterates";
import type {StreamingDataSource} from "../datasources/StreamingDataSource";
import {currentTimesByGroup, type TimeGroupFor} from "../datasources/timeSeriesDataSource";
import {iteratesCurrentTime} from "../datasources/iteratesDataSource";

/*
 * View drivers: the *view* half of a streaming plot.
 *
 * A {@link StreamingDataSource} (owned by the application) ingests the stream and keeps the series.
 * A view driver (owned by one mounted plot) listens to the source's `chartDataUpdatesObservable` and keeps that plot's
 * view in step with the data -- advancing the visible time-window (auto-scroll, cadence) and asking
 * the plot to redraw. A plot creates its driver when it mounts and *always* unsubscribes it when it
 * unmounts. Nothing here ever outlives the plot that created it, and nothing here ever mutates the
 * series, so there is never a reason to keep a driver alive across a remount, adopt one, or defer
 * its teardown.
 *
 * (Before v2, a plot's single subscription did both the ingestion and the view work, which tied
 * the data's lifetime to the plot's -- see the data sources for the ingestion half.)
 */

/**
 * The behavior of the time window when data is added to the chart: `SCROLL` slides the window
 * forward (keeping its width) as new data passes its end; `SQUEEZE` keeps the window's start
 * pinned and widens it instead.
 * Note: a const object rather than an enum, to support `erasableSyntaxOnly`
 */
export const TimeWindowBehavior = {
    SCROLL: "SCROLL",
    SQUEEZE: "SQUEEZE"
} as const

export type TimeWindowBehavior = (typeof TimeWindowBehavior)[keyof typeof TimeWindowBehavior];

/**
 * The part of a data source a view driver needs
 */
export type ViewDriverSource<CD extends ChartData> = Pick<StreamingDataSource<CD, unknown>, 'chartDataUpdatesObservable' | 'latestTime'>

/**
 * Batches the source's updates for rendering. When the source's own emission period is known,
 * batches by a fixed count (`windowingTime / dataUpdatePeriod`) rather than by wall-clock time:
 * `bufferTime` and the source's own timer are two independent clocks, so ordinary timer jitter can
 * shift a tick across a buffer boundary, making the number of ticks per flush vary and the
 * auto-scroll uneven. Counting emissions directly is immune to that jitter.
 * @param windowingTime The time (ms) over which to batch updates
 * @param dataUpdatePeriod The period (ms) at which the source emits, when known
 * @return The batching operator
 */
function renderBatching<CD>(windowingTime: number, dataUpdatePeriod?: number): OperatorFunction<CD, Array<CD>> {
    return dataUpdatePeriod !== undefined && dataUpdatePeriod > 0 ?
        bufferCount<CD>(Math.max(1, Math.round(windowingTime / dataUpdatePeriod))) :
        bufferTime<CD>(windowingTime)
}

/**
 * Advances the visible window for the specified axis (in place, within `timesWindows`) so its
 * right edge sits at `targetTime`, preserving the window's current width (but never starting
 * before 0, in which case the window stays at [0, width] until the time passes its width) -- but only once
 * `targetTime` actually exceeds the window's current right edge. This gate is what lets a user
 * pan/zoom the window ahead of the current time and watch the data catch up to it before scrolling
 * resumes. Leaves `.original` untouched (zoom math is incremental, so it doesn't depend on it).
 * @param timesWindows A `map(axis_id -> range)` updated in place
 * @param axisId The axis to advance
 * @param targetTime The time the axis's right edge should advance to
 */
function advanceAxisRangeInMapTo(timesWindows: Map<string, ContinuousAxisRange>, axisId: string, targetTime: number): void {
    const range = timesWindows.get(axisId)
    if (range === undefined) return
    const [startTime, endTime] = range.current.asTuple()
    if (endTime < targetTime) {
        const timeWindow = endTime - startTime
        timesWindows.set(axisId, range.update(Math.max(0, targetTime - timeWindow), Math.max(targetTime, timeWindow)))
    }
}

/**
 * Advances a range to a target time when new data arrives: SCROLL slides the window (width
 * preserved); SQUEEZE pins the window's start at `initialStart` so the window widens instead.
 * @param range The range to advance
 * @param targetTime The time the range's right edge should advance to
 * @param timeWindowBehavior Whether to scroll or squeeze
 * @param initialStart The pinned start time for SQUEEZE mode (ignored for SCROLL)
 * @return The advanced range, with `.original` unchanged
 */
function scrollOrSqueezeRangeTo(
    range: ContinuousAxisRange,
    targetTime: number,
    timeWindowBehavior: TimeWindowBehavior,
    initialStart?: number,
): ContinuousAxisRange {
    const [startTime, endTime] = range.current.asTuple()
    const timeWindow = endTime - startTime
    const newStart = timeWindowBehavior === TimeWindowBehavior.SQUEEZE && initialStart !== undefined ?
        initialStart :
        Math.max(0, targetTime - timeWindow)
    return range.update(newStart, Math.max(targetTime, timeWindow))
}

/**
 * @param axisAssignments The assignment of the series to their x- and y-axes
 * @param xAxesState The current state of the x-axes (for the default x-axis)
 * @return A {@link TimeGroupFor} that groups series by their assigned x-axis (or the default x-axis)
 */
function xAxisGroupFor(axisAssignments: Map<string, AxesAssignment>, xAxesState: AxesState<ContinuousNumericAxis>): TimeGroupFor {
    return name => axisAssignments.get(name)?.xAxis || xAxesState.axisDefaultId().getOrElse("")
}

/**
 * Re-syncs every x-axis to the data's ground-truth time whenever the page becomes visible again.
 * Browsers pause `requestAnimationFrame` and throttle timers for hidden pages (including a macOS
 * Spaces switch), and the cadence and data timers don't resume in lockstep, so without this an
 * axis can lag behind until whichever clock fell behind organically catches up.
 * @param dataSource The data source (for the data's ground-truth time)
 * @param xAxesState The current state of the x-axes
 * @param timesWindows A `map(axis_id -> range)` of the x-axes' windows, updated in place
 * @param setCurrentTime Records the current time for an axis
 * @param updateTimingAndPlot Redraws the plot for the (advanced) time-windows
 * @return The teardown for the listener, to add to the driver's subscription
 */
function resyncOnVisible(
    dataSource: ViewDriverSource<ChartData>,
    xAxesState: AxesState<ContinuousNumericAxis>,
    timesWindows: Map<string, ContinuousAxisRange>,
    setCurrentTime: (axisId: string, end: number) => void,
    updateTimingAndPlot: (ranges: Map<string, ContinuousAxisRange>) => void,
): () => void {
    if (typeof document === 'undefined') return () => {
    }
    const resyncAxesOnVisible = (): void => {
        if (document.visibilityState !== 'visible') return
        const groundTruthTime = dataSource.latestTime()
        if (!isFinite(groundTruthTime)) return
        xAxesState.axisIds().forEach(axisId => {
            advanceAxisRangeInMapTo(timesWindows, axisId, groundTruthTime)
            setCurrentTime(axisId, groundTruthTime)
        })
        updateTimingAndPlot(timesWindows)
    }
    document.addEventListener('visibilitychange', resyncAxesOnVisible)
    return () => document.removeEventListener('visibilitychange', resyncAxesOnVisible)
}

/**
 * The cadence ticks (wall-clock elapsed time, not a tick count, so throttled ticks don't make it
 * fall permanently behind) merged, unbuffered, with the batched data updates. Cadence ticks must
 * not go through the render batching, or each batch would deliver its cadence ticks in one burst,
 * collapsing the smooth per-tick scroll down to the batch rate.
 * @param updates$ The data source's updates
 * @param windowingTime The time (ms) over which the data updates are batched
 * @param cadencePeriod The time (ms) between cadence ticks
 * @param cadenceTick Creates the (empty) chart data for a cadence tick, from the time (ms) elapsed
 * since the cadence started
 * @return The data updates (each batch flattened back into single updates), merged with the
 * cadence ticks
 */
function withCadence<CD extends {currentTime?: number}>(
    updates$: Observable<CD>,
    windowingTime: number,
    cadencePeriod: number,
    cadenceTick: (elapsed: number) => CD,
): Observable<CD> {
    const cadenceStartTime = performance.now()
    const cadence = interval(cadencePeriod).pipe(map(() => cadenceTick(performance.now() - cadenceStartTime)))
    return updates$.pipe(bufferTime<CD>(windowingTime), mergeAll(), mergeWith(cadence) as MonoTypeOperatorFunction<CD>)
}

/**
 * Tracks the best-known stream time and when it was measured, so a cadence tick can project the
 * current stream time as `knownTime + (now - measuredAt)`. Seeded from the data source -- which
 * kept ingesting while the plot was unmounted, so this is the true current time even right after
 * a remount -- and corrected forward whenever real data overtakes the projection (but never
 * backward, which would make cadence stutter by the data's processing latency on every tick).
 * @param seedTime The best-known stream time to start from (`-Infinity` when there's no data yet)
 * @return The anchor: `now()` projects the current stream time, `isKnown()` says whether there's a
 * stream time to project from, and `correctTo(time)` moves the anchor forward to a later real time
 */
function cadenceAnchor(seedTime: number) {
    let knownTime = seedTime
    let measuredAt = performance.now()
    const now = (): number => knownTime + (performance.now() - measuredAt)
    return {
        now,
        isKnown: (): boolean => isFinite(knownTime),
        correctTo: (realTime: number): void => {
            if (realTime > now()) {
                knownTime = realTime
                measuredAt = performance.now()
            }
        }
    }
}

/**
 * The view driver for a time-series plot without cadence: advances each x-axis's window (SCROLL
 * or SQUEEZE) as new data arrives, and asks the plot to redraw.
 * @param dataSource The data source whose updates drive the view
 * @param windowingTime The time (ms) over which updates are batched before redrawing
 * @param axisAssignments The assignment of the series to their x- and y-axes
 * @param xAxesState The current state of the x-axes
 * @param updateTimingAndPlot Redraws the plot for the (advanced) time-windows
 * @param setCurrentTime Records the current time for an axis
 * @param timeWindowBehavior Whether the time axis scrolls or squeezes
 * @param initialTimes The pinned start time for each axis, for SQUEEZE
 * @param dataUpdatePeriod The period (ms) at which the source emits, when known (see {@link renderBatching})
 * @return The driver's subscription, to unsubscribe when the plot unmounts
 */
export function timeSeriesViewDriverFor(
    dataSource: ViewDriverSource<TimeSeriesChartData>,
    windowingTime: number,
    axisAssignments: Map<string, AxesAssignment>,
    xAxesState: AxesState<ContinuousNumericAxis>,
    updateTimingAndPlot: (ranges: Map<string, ContinuousAxisRange>) => void,
    setCurrentTime: (axisId: string, end: number) => void,
    timeWindowBehavior: TimeWindowBehavior = TimeWindowBehavior.SCROLL,
    initialTimes: Map<string, number> = new Map<string, number>(),
    dataUpdatePeriod?: number,
): Subscription {
    // built ONCE, here, and advanced in place on every update: the plot hands this same map
    // back to its pan/zoom handlers (via `updateTimingAndPlot`), so their mutations land here too
    // rather than being discarded by a rebuild
    const timesWindows = continuousAxisRanges(xAxesState.axes)
    const groupFor = xAxisGroupFor(axisAssignments, xAxesState)

    return dataSource.chartDataUpdatesObservable
        .pipe(renderBatching<TimeSeriesChartData>(windowingTime, dataUpdatePeriod))
        .subscribe(dataList => dataList.forEach(data => {
            const groupTimes = currentTimesByGroup(data, groupFor)
            data.newPoints.forEach((_, name) => {
                const axisId = groupFor(name)
                const currentAxisTime = groupTimes.get(axisId) || data.maxTime
                // record the axis' "now" on every update -- not only once the window starts
                // scrolling -- since the plot's zoom pivots on it while streaming: before the data
                // reaches the window's end, there would otherwise be no "now" to pivot on, and the
                // zoom would pivot on the window's right edge, possibly leaving the data off-screen
                setCurrentTime(axisId, currentAxisTime)
                const range = timesWindows.get(axisId)
                if (range !== undefined) {
                    const [, endTime] = range.current.asTuple()
                    if (endTime < currentAxisTime) {
                        timesWindows.set(axisId, scrollOrSqueezeRangeTo(range, currentAxisTime, timeWindowBehavior, initialTimes.get(axisId)))
                    }
                }
            })
            updateTimingAndPlot(timesWindows)
        }))
}

/**
 * The view driver for a time-series plot with cadence: cadence ticks advance every x-axis's window
 * smoothly between data arrivals, and real data (treated as ground truth) re-syncs the axes and
 * corrects the cadence anchor when cadence has fallen behind.
 * @param dataSource The data source whose updates drive the view
 * @param windowingTime The time (ms) over which data updates are batched before redrawing
 * @param axisAssignments The assignment of the series to their x- and y-axes
 * @param xAxesState The current state of the x-axes
 * @param updateTimingAndPlot Redraws the plot for the (advanced) time-windows
 * @param setCurrentTime Records the current time for an axis
 * @param cadencePeriod The time (ms) between cadence ticks
 * @return The driver's subscription, to unsubscribe when the plot unmounts
 */
export function timeSeriesWithCadenceViewDriverFor(
    dataSource: ViewDriverSource<TimeSeriesChartData>,
    windowingTime: number,
    axisAssignments: Map<string, AxesAssignment>,
    xAxesState: AxesState<ContinuousNumericAxis>,
    updateTimingAndPlot: (ranges: Map<string, ContinuousAxisRange>) => void,
    setCurrentTime: (axisId: string, end: number) => void,
    cadencePeriod: number,
): Subscription {
    const anchor = cadenceAnchor(dataSource.latestTime())
    const timesWindows = continuousAxisRanges(xAxesState.axes)
    const groupFor = xAxisGroupFor(axisAssignments, xAxesState)

    // catch the axes up to the current stream time right away, rather than leaving them where they
    // were restored to until the first tick arrives (which, right after a remount, can take a
    // noticeable while and would show up as "pause, then jump")
    if (anchor.isKnown()) {
        xAxesState.axisIds().forEach(axisId => advanceAxisRangeInMapTo(timesWindows, axisId, anchor.now()))
        updateTimingAndPlot(timesWindows)
    }

    const cadenceTick = (elapsed: number): TimeSeriesChartData => ({
        seriesNames: new Set<string>(),
        currentTime: elapsed,
        maxTime: elapsed,
        maxTimes: new Map(),
        newPoints: new Map()
    })

    const subscription = withCadence(dataSource.chartDataUpdatesObservable, windowingTime, cadencePeriod, cadenceTick)
        .subscribe(data => {
            if (data.currentTime !== undefined) {
                // a cadence tick: advance every axis to the projected stream time
                const cadenceTime = anchor.now()
                xAxesState.axisIds().forEach(axisId => {
                    advanceAxisRangeInMapTo(timesWindows, axisId, cadenceTime)
                    setCurrentTime(axisId, cadenceTime)
                })
            }

            if (data.newPoints.size > 0) {
                // real data: re-sync each series' axis to the data's own time, and correct the
                // cadence anchor if the data has overtaken it
                const groupTimes = currentTimesByGroup(data, groupFor)
                data.newPoints.forEach((_, name) => {
                    const axisId = groupFor(name)
                    const currentAxisTime = groupTimes.get(axisId) || data.maxTime
                    advanceAxisRangeInMapTo(timesWindows, axisId, currentAxisTime)
                    anchor.correctTo(currentAxisTime)
                })
            }

            updateTimingAndPlot(timesWindows)
        })

    subscription.add(resyncOnVisible(dataSource, xAxesState, timesWindows, setCurrentTime, updateTimingAndPlot))

    // one more catch-up on the next paint frame, narrowing the gap until the first real tick
    // (whose scheduling can lag right after a route change, while React commits the new tree)
    const catchUpFrame = requestAnimationFrame(() => {
        if (!anchor.isKnown()) return
        xAxesState.axisIds().forEach(axisId => advanceAxisRangeInMapTo(timesWindows, axisId, anchor.now()))
        updateTimingAndPlot(timesWindows)
    })
    subscription.add(() => cancelAnimationFrame(catchUpFrame))

    return subscription
}

/**
 * The view driver for an outlier plot without cadence. Mirrors {@link timeSeriesViewDriverFor}
 * for outlier data, where each series' current time is the newest datum in the chunk.
 * @param dataSource The data source whose updates drive the view
 * @param windowingTime The time (ms) over which updates are batched before redrawing
 * @param axisAssignments The assignment of the series to their x- and y-axes
 * @param xAxesState The current state of the x-axes
 * @param updateTimingAndPlot Redraws the plot for the (advanced) time-windows
 * @param setCurrentTime Records the current time for an axis
 * @param [timeWindowBehavior=SCROLL] Whether the time axis scrolls or squeezes
 * @param [initialTimes] The pinned start time for each axis, for SQUEEZE
 * @param [dataUpdatePeriod] The period (ms) at which the source emits, when known (see {@link renderBatching})
 * @return The driver's subscription, to unsubscribe when the plot unmounts
 */
export function outlierViewDriverFor<M extends readonly number[]>(
    dataSource: ViewDriverSource<OutlierChartData<M>>,
    windowingTime: number,
    axisAssignments: Map<string, AxesAssignment>,
    xAxesState: AxesState<ContinuousNumericAxis>,
    updateTimingAndPlot: (ranges: Map<string, ContinuousAxisRange>) => void,
    setCurrentTime: (axisId: string, end: number) => void,
    timeWindowBehavior: TimeWindowBehavior = TimeWindowBehavior.SCROLL,
    initialTimes: Map<string, number> = new Map<string, number>(),
    dataUpdatePeriod?: number,
): Subscription {
    const timesWindows = continuousAxisRanges(xAxesState.axes)

    return dataSource.chartDataUpdatesObservable
        .pipe(renderBatching<OutlierChartData<M>>(windowingTime, dataUpdatePeriod))
        .subscribe(dataList => dataList.forEach(data => {
            data.newPoints.forEach((newData, name) => {
                const axisId = axisAssignments.get(name)?.xAxis || xAxesState.axisDefaultId().getOrElse("")
                const currentAxisTime = Math.max(...newData.map(datum => datum.datum.x), -Infinity)
                if (!Number.isFinite(currentAxisTime)) return
                // record the axis' "now" on every update -- see timeSeriesViewDriverFor's identical
                // call for why (the zoom pivots on it while streaming)
                setCurrentTime(axisId, currentAxisTime)
                const range = timesWindows.get(axisId)
                if (range !== undefined) {
                    const [, endTime] = range.current.asTuple()
                    if (endTime < currentAxisTime) {
                        timesWindows.set(axisId, scrollOrSqueezeRangeTo(range, currentAxisTime, timeWindowBehavior, initialTimes.get(axisId)))
                    }
                }
            })
            updateTimingAndPlot(timesWindows)
        }))
}

/**
 * The view driver for an outlier plot with cadence. Mirrors
 * {@link timeSeriesWithCadenceViewDriverFor}; outlier plots don't support per-series axis
 * assignments here, so all axes advance to the same time.
 * @param dataSource The data source whose updates drive the view
 * @param windowingTime The time (ms) over which data updates are batched before redrawing
 * @param xAxesState The current state of the x-axes
 * @param updateTimingAndPlot Redraws the plot for the (advanced) time-windows
 * @param setCurrentTime Records the current time for an axis
 * @param cadencePeriod The time (ms) between cadence ticks
 * @return The driver's subscription, to unsubscribe when the plot unmounts
 */
export function outlierWithCadenceViewDriverFor<M extends readonly number[]>(
    dataSource: ViewDriverSource<OutlierChartData<M>>,
    windowingTime: number,
    xAxesState: AxesState<ContinuousNumericAxis>,
    updateTimingAndPlot: (ranges: Map<string, ContinuousAxisRange>) => void,
    setCurrentTime: (axisId: string, end: number) => void,
    cadencePeriod: number,
): Subscription {
    const anchor = cadenceAnchor(dataSource.latestTime())
    const timesWindows = continuousAxisRanges(xAxesState.axes)

    if (anchor.isKnown()) {
        xAxesState.axisIds().forEach(axisId => advanceAxisRangeInMapTo(timesWindows, axisId, anchor.now()))
        updateTimingAndPlot(timesWindows)
    }

    const cadenceTick = (elapsed: number): OutlierChartData<M> => ({
        seriesNames: new Set<string>(),
        newPoints: new Map(),
        currentTime: elapsed,
    })

    const subscription = withCadence(dataSource.chartDataUpdatesObservable, windowingTime, cadencePeriod, cadenceTick)
        .subscribe(data => {
            if (data.currentTime !== undefined) {
                const cadenceTime = anchor.now()
                xAxesState.axisIds().forEach(axisId => {
                    advanceAxisRangeInMapTo(timesWindows, axisId, cadenceTime)
                    setCurrentTime(axisId, cadenceTime)
                })
            }

            if (data.newPoints.size > 0) {
                const maxRealTime = Array.from(data.newPoints.values()).reduce(
                    (tMax, newData) => Math.max(tMax, ...newData.map(datum => datum.datum.x)),
                    -Infinity
                )
                if (isFinite(maxRealTime)) {
                    xAxesState.axisIds().forEach(axisId => advanceAxisRangeInMapTo(timesWindows, axisId, maxRealTime))
                    anchor.correctTo(maxRealTime)
                }
            }

            updateTimingAndPlot(timesWindows)
        })

    subscription.add(resyncOnVisible(dataSource, xAxesState, timesWindows, setCurrentTime, updateTimingAndPlot))

    const catchUpFrame = requestAnimationFrame(() => {
        if (!anchor.isKnown()) return
        xAxesState.axisIds().forEach(axisId => advanceAxisRangeInMapTo(timesWindows, axisId, anchor.now()))
        updateTimingAndPlot(timesWindows)
    })
    subscription.add(() => cancelAnimationFrame(catchUpFrame))

    return subscription
}

/**
 * The view driver for an ordinal (bar) plot: reports the chart-wide current time and asks the
 * plot to redraw as new data arrives. (The stats are kept by the data source.) Unlike the
 * time-series drivers, it has no axis ranges to advance: an ordinal plot's axes don't scroll as
 * data arrives, so its axes' ranges change only through the plot's own zoom, pan, and resize.
 * @param dataSource The data source whose updates drive the view
 * @param windowingTime The time (ms) over which updates are batched before redrawing
 * @param updateTimingAndPlot Redraws the plot (and reports the chart time)
 * @param setCurrentTime Records the chart-wide current time
 * @param dataUpdatePeriod The period (ms) at which the source emits, when known (see {@link renderBatching})
 * @return The driver's subscription, to unsubscribe when the plot unmounts
 */
export function ordinalViewDriverFor(
    dataSource: ViewDriverSource<OrdinalChartData>,
    windowingTime: number,
    updateTimingAndPlot: () => void,
    setCurrentTime: (currentTime: number) => void,
    dataUpdatePeriod?: number,
): Subscription {
    return dataSource.chartDataUpdatesObservable
        .pipe(renderBatching<OrdinalChartData>(windowingTime, dataUpdatePeriod))
        .subscribe(dataList => dataList.forEach(data => {
            if (data.newPoints.size > 0) setCurrentTime(data.stats.maxDatum.time.time || NaN)
            updateTimingAndPlot()
        }))
}

/**
 * The view driver for an iterates (Poincaré) plot: reports the current time and asks the plot to
 * redraw as new data arrives (once the plot has both an x-axis and a y-axis).
 * @param dataSource The data source whose updates drive the view
 * @param windowingTime The time (ms) over which updates are batched before redrawing
 * @param xAxesState The current state of the x-axes
 * @param yAxesState The current state of the y-axes
 * @param updateRangesAndPlot Updates the axes' ranges, and redraws the plot
 * @param updateCurrentTime Records the current time (see {@link iteratesCurrentTime})
 * @return The driver's subscription, to unsubscribe when the plot unmounts
 */
export function iteratesViewDriverFor(
    dataSource: ViewDriverSource<IterateChartData>,
    windowingTime: number,
    xAxesState: AxesState<ContinuousNumericAxis>,
    yAxesState: AxesState<ContinuousNumericAxis>,
    updateRangesAndPlot: () => void,
    updateCurrentTime: (time: number) => void,
): Subscription {
    return dataSource.chartDataUpdatesObservable
        .pipe(bufferTime<IterateChartData>(windowingTime))
        .subscribe(dataList => dataList.forEach(data => {
            if (data.newPoints.size > 0) updateCurrentTime(iteratesCurrentTime(data))
            // (the original only redrew once both a default x-axis and a default y-axis existed)
            if (xAxesState.axes.size > 0 && yAxesState.axes.size > 0) updateRangesAndPlot()
        }))
}
