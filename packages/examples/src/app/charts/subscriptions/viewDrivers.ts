import {interval, type Observable, type OperatorFunction, Subscription} from "rxjs";
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
 * Marks a cadence tick in a view driver's stream of updates (rather than disguising the tick as an
 * empty chunk of chart data)
 */
const CADENCE_TICK = Symbol('cadence-tick')
type CadenceTick = typeof CADENCE_TICK

/**
 * The cadence ticks merged, unbuffered, with the batched data updates. Cadence ticks must not go
 * through the render batching, or each batch would deliver its cadence ticks in one burst,
 * collapsing the smooth per-tick scroll down to the batch rate. (The ticks carry no time: the
 * driver projects the stream time from its own wall-clock anchor, so throttled ticks don't make it
 * fall permanently behind.)
 * @param updates$ The data source's updates
 * @param windowingTime The time (ms) over which the data updates are batched
 * @param cadencePeriod The time (ms) between cadence ticks
 * @return The data updates (each batch flattened back into single updates), merged with the
 * cadence ticks
 */
function withCadence<CD>(updates$: Observable<CD>, windowingTime: number, cadencePeriod: number): Observable<CD | CadenceTick> {
    const cadence = interval(cadencePeriod).pipe(map((): CadenceTick => CADENCE_TICK))
    return updates$.pipe(
        bufferTime<CD>(windowingTime),
        mergeAll(),
        mergeWith(cadence) as OperatorFunction<CD, CD | CadenceTick>
    )
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
 * Gives the current time ("now") of each x-axis that a chunk of chart data has new points for
 * @template CD The type of the chart data
 */
export type AxisTimesFor<CD> = (data: CD) => Map<string, number>

/**
 * The x-axes' times for time-series chart data: each axis's time is the latest time of the
 * series assigned to it (see {@link currentTimesByGroup}), falling back to the chunk's latest time
 * @param axisAssignments The assignment of the series to their x- and y-axes
 * @param xAxesState The current state of the x-axes (for the default x-axis)
 * @return The x-axes' times for a chunk of chart data
 */
export function timeSeriesAxisTimes(
    axisAssignments: Map<string, AxesAssignment>,
    xAxesState: AxesState<ContinuousNumericAxis>,
): AxisTimesFor<TimeSeriesChartData> {
    const groupFor = xAxisGroupFor(axisAssignments, xAxesState)
    return data => {
        const groupTimes = currentTimesByGroup(data, groupFor)
        const times = new Map<string, number>()
        data.newPoints.forEach((_, name) => {
            const axisId = groupFor(name)
            times.set(axisId, groupTimes.get(axisId) || data.maxTime)
        })
        return times
    }
}

/**
 * The x-axes' times for outlier chart data: each axis's time is the time of the newest datum, of
 * the series assigned to it, in the chunk
 * @param axisAssignments The assignment of the series to their x- and y-axes
 * @param xAxesState The current state of the x-axes (for the default x-axis)
 * @return The x-axes' times for a chunk of chart data
 * @template M The type of the outlier series' measures
 */
export function outlierAxisTimes<M extends readonly number[]>(
    axisAssignments: Map<string, AxesAssignment>,
    xAxesState: AxesState<ContinuousNumericAxis>,
): AxisTimesFor<OutlierChartData<M>> {
    const groupFor = xAxisGroupFor(axisAssignments, xAxesState)
    return data => {
        const times = new Map<string, number>()
        data.newPoints.forEach((newData, name) => {
            const axisId = groupFor(name)
            let time = times.get(axisId) ?? -Infinity
            for (const datum of newData) time = Math.max(time, datum.datum.x)
            if (Number.isFinite(time)) times.set(axisId, time)
        })
        return times
    }
}

/**
 * The options of a time-axis view driver (see {@link timeAxisViewDriverFor})
 */
export interface TimeAxisViewDriverOptions {
    /**
     * The time (ms) over which updates are batched before redrawing
     */
    windowingTime: number
    /**
     * The period (ms) at which the source emits, when known (see {@link renderBatching}); not
     * used with cadence
     */
    dataUpdatePeriod?: number
    /**
     * The time (ms) between cadence ticks, which advance the axes smoothly between data arrivals.
     * Without one, the axes only advance as data arrives.
     */
    cadencePeriod?: number
    /**
     * Whether the time axes scroll or squeeze as data passes their ends (without cadence).
     * Defaults to SCROLL.
     */
    timeWindowBehavior?: TimeWindowBehavior
    /**
     * The pinned start time for each axis, for SQUEEZE
     */
    initialTimes?: Map<string, number>
}

/**
 * The view driver for a plot whose x-axes are time (the scatter, raster, and outlier plots): it
 * advances each x-axis's window as the data's time passes its end, records each axis's current
 * time, and asks the plot to redraw.
 *
 * Without cadence, each axis's window advances (SCROLL or SQUEEZE) as new data passes its end.
 * With cadence, cadence ticks advance every axis's window smoothly between data arrivals, to the
 * stream time projected from a wall-clock anchor; real data (treated as ground truth) re-syncs the
 * axes, and corrects the anchor when cadence has fallen behind. The driver also catches the axes up
 * to the data source's latest time when it starts (e.g. after a remount), and whenever the page
 * becomes visible again.
 * @param dataSource The data source whose updates drive the view
 * @param xAxesState The current state of the x-axes
 * @param axisTimesFor Gives the current time of each x-axis that a chunk of data has new points for
 * (e.g. {@link timeSeriesAxisTimes} or {@link outlierAxisTimes})
 * @param updateTimingAndPlot Redraws the plot for the (advanced) time-windows
 * @param setCurrentTime Records the current time for an axis
 * @param options The batching, cadence, and time-window behavior
 * @return The driver's subscription, to unsubscribe when the plot unmounts
 * @template CD The type of the chart data
 */
export function timeAxisViewDriverFor<CD extends ChartData>(
    dataSource: ViewDriverSource<CD>,
    xAxesState: AxesState<ContinuousNumericAxis>,
    axisTimesFor: AxisTimesFor<CD>,
    updateTimingAndPlot: (ranges: Map<string, ContinuousAxisRange>) => void,
    setCurrentTime: (axisId: string, end: number) => void,
    options: TimeAxisViewDriverOptions,
): Subscription {
    const {
        windowingTime,
        dataUpdatePeriod,
        cadencePeriod,
        timeWindowBehavior = TimeWindowBehavior.SCROLL,
        initialTimes = new Map<string, number>(),
    } = options

    // built ONCE, here, and advanced in place on every update: the plot hands this same map
    // back to its pan/zoom handlers (via `updateTimingAndPlot`), so their mutations land here too
    // rather than being discarded by a rebuild
    const timesWindows = continuousAxisRanges(xAxesState.axes)

    if (cadencePeriod === undefined) {
        return dataSource.chartDataUpdatesObservable
            .pipe(renderBatching<CD>(windowingTime, dataUpdatePeriod))
            .subscribe(dataList => dataList.forEach(data => {
                axisTimesFor(data).forEach((currentAxisTime, axisId) => {
                    // record the axis' "now" on every update -- not only once the window starts
                    // scrolling -- since the plot's zoom pivots on it while streaming: before the
                    // data reaches the window's end, there would otherwise be no "now" to pivot on,
                    // and the zoom would pivot on the window's right edge, possibly leaving the
                    // data off-screen
                    setCurrentTime(axisId, currentAxisTime)
                    const range = timesWindows.get(axisId)
                    if (range !== undefined && range.current.end < currentAxisTime) {
                        timesWindows.set(axisId, scrollOrSqueezeRangeTo(range, currentAxisTime, timeWindowBehavior, initialTimes.get(axisId)))
                    }
                })
                updateTimingAndPlot(timesWindows)
            }))
    }

    const anchor = cadenceAnchor(dataSource.latestTime())
    const catchUp = (): void => {
        if (!anchor.isKnown()) return
        xAxesState.axisIds().forEach(axisId => advanceAxisRangeInMapTo(timesWindows, axisId, anchor.now()))
        updateTimingAndPlot(timesWindows)
    }

    // catch the axes up to the current stream time right away, rather than leaving them where they
    // were restored to until the first tick arrives (which, right after a remount, can take a
    // noticeable while and would show up as "pause, then jump")
    catchUp()

    const subscription = withCadence(dataSource.chartDataUpdatesObservable, windowingTime, cadencePeriod)
        .subscribe(update => {
            if (update === CADENCE_TICK) {
                // a cadence tick: advance every axis to the projected stream time
                const cadenceTime = anchor.now()
                xAxesState.axisIds().forEach(axisId => {
                    advanceAxisRangeInMapTo(timesWindows, axisId, cadenceTime)
                    setCurrentTime(axisId, cadenceTime)
                })
            } else {
                // real data: re-sync each axis to the data's own time, and correct the cadence
                // anchor if the data has overtaken it
                axisTimesFor(update).forEach((currentAxisTime, axisId) => {
                    advanceAxisRangeInMapTo(timesWindows, axisId, currentAxisTime)
                    anchor.correctTo(currentAxisTime)
                })
            }
            updateTimingAndPlot(timesWindows)
        })

    subscription.add(resyncOnVisible(dataSource, xAxesState, timesWindows, setCurrentTime, updateTimingAndPlot))

    // one more catch-up on the next paint frame, narrowing the gap until the first real tick
    // (whose scheduling can lag right after a route change, while React commits the new tree)
    const catchUpFrame = requestAnimationFrame(catchUp)
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
