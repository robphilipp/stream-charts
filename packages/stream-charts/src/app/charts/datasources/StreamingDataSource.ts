import {BehaviorSubject, Observable, Subject, Subscription} from "rxjs";
import type {ChartData} from "../observables/ChartData";
import type {BaseSeries} from "../series/baseSeries";

/**
 * Creates the observable of chart data that a {@link StreamingDataSource} subscribes to when it
 * starts. Handed the source's *current* series (not the original initial data), so that a source
 * that is stopped and then started again (Pause -> Run) resumes generating from where the
 * accumulated data left off, rather than starting over from the initial data.
 */
export type DataGenerator<CD extends ChartData, S> = (currentSeries: Array<S>) => Observable<CD>

/**
 * Owns the ingestion side of a streaming chart: the one subscription to the data generator, and
 * the series that the incoming data accumulates into.
 *
 * A data source is deliberately *not* tied to any React component. The application creates it
 * (e.g. in a store), starts and stops it (Run/Pause), and hands it to a {@link Chart}. Plots only
 * ever *read* from it -- its `series`, and its `chartDataUpdatesObservable` notifications, which a
 * plot subscribes to for exactly as long as it is mounted. That split is what lets data keep accumulating while a
 * chart is unmounted (e.g. the user navigated to another page) without any subscription bound to
 * an unmounted plot instance being kept alive, adopted, or torn down later on.
 *
 * Unlike earlier designs, there is never more than one subscription to the generator, and it
 * exists only while the source is running.
 * @template CD The type of chart data emitted by the generator
 * @template D The type of datum held in each series
 * @template S The type of series
 */
export interface StreamingDataSource<CD extends ChartData, D, S extends BaseSeries<D> = BaseSeries<D>> {
    /**
     * The live series, keyed by series name, in insertion order. Mutated in place as data
     * arrives (for performance), so readers see new data without the map being replaced.
     */
    readonly series: ReadonlyMap<string, S>
    /**
     * Whether the source is currently subscribed to its generator
     */
    readonly running: boolean
    /**
     * Emits each chunk of chart data *after* it has been ingested into {@link series}. Hot: a
     * subscriber only sees data that arrives after it subscribes (everything before that is
     * already in {@link series}).
     */
    readonly chartDataUpdatesObservable: Observable<CD>
    /**
     * Emits whether the source is running, starting with the current value
     */
    readonly isRunningObservable: Observable<boolean>
    /**
     * @return The series, as an array, in insertion order
     */
    seriesList(): Array<S>
    /**
     * @return The latest time of any datum in any series (the stream's "ground truth" time), or
     * `-Infinity` when there is no data
     */
    latestTime(): number
    /**
     * Subscribes to the generator (a no-op when already running)
     */
    start(): void
    /**
     * Unsubscribes from the generator (a no-op when not running). Nothing keeps generating data
     * in the background once this returns.
     */
    stop(): void
    /**
     * Replaces the generator, e.g. when the data-update period changes. Only allowed while the
     * source is stopped -- the new generator is used by the next {@link start}.
     * @param generator The new generator
     */
    setGenerator(generator: DataGenerator<CD, S>): void
    /**
     * Stops the source and completes its observables. A disposed source can't be started again.
     */
    dispose(): void
}

/**
 * The lifecycle shared by every kind of data source. Subclasses only supply how a chunk of chart
 * data is ingested into the series, and how to find the latest time in the series.
 */
export abstract class BaseStreamingDataSource<CD extends ChartData, D, S extends BaseSeries<D>>
    implements StreamingDataSource<CD, D, S> {

    protected readonly seriesMap: Map<string, S>

    private generator: DataGenerator<CD, S>
    private subscription: Subscription | undefined = undefined
    private disposed = false

    private readonly updatesSubject = new Subject<CD>()
    private readonly runningSubject = new BehaviorSubject<boolean>(false)

    readonly chartDataUpdatesObservable: Observable<CD> = this.updatesSubject.asObservable()
    readonly isRunningObservable: Observable<boolean> = this.runningSubject.asObservable()

    /**
     * @param initialData The initial series. The source takes ownership of these series and
     * mutates them in place as data arrives.
     * @param generator Creates the observable of chart data when the source starts
     */
    protected constructor(initialData: Array<S>, generator: DataGenerator<CD, S>) {
        this.seriesMap = new Map(initialData.map(series => [series.name, series]))
        this.generator = generator
    }

    /**
     * The live series, keyed by series name, in insertion order (see {@link StreamingDataSource.series})
     * @return The series map (mutated in place as data arrives)
     */
    get series(): ReadonlyMap<string, S> {
        return this.seriesMap
    }

    /**
     * Whether the source is currently subscribed to its generator
     * @return `true` while the source is running; `false` otherwise
     */
    get running(): boolean {
        return this.runningSubject.value
    }

    /**
     * @return The series, as an array, in insertion order
     */
    seriesList(): Array<S> {
        return Array.from(this.seriesMap.values())
    }

    /**
     * Subscribes to the generator, handing it the current series, so that a restarted source
     * resumes from the data accumulated so far. Each chunk of data the generator emits is ingested
     * into the series, and then emitted through {@link chartDataUpdatesObservable}. When the
     * generator fails or completes, the source stops. A no-op when the source is already running,
     * or has been disposed.
     */
    start(): void {
        if (this.disposed || this.subscription !== undefined) return

        const subscription = this.generator(this.seriesList()).subscribe({
            next: data => {
                this.ingest(data)
                this.updatesSubject.next(data)
            },
            error: error => {
                console.error("Streaming data source's generator failed; stopping the source", error)
                this.markStopped()
            },
            complete: () => this.markStopped()
        })

        // the generator may have completed (or failed) synchronously during `subscribe`, in which
        // case `markStopped` has already run and there is nothing left to hold on to
        if (!subscription.closed) {
            this.subscription = subscription
            this.runningSubject.next(true)
        }
    }

    /**
     * Unsubscribes from the generator (a no-op when not running). Nothing keeps generating data
     * in the background once this returns.
     */
    stop(): void {
        if (this.subscription === undefined) return
        this.subscription.unsubscribe()
        this.markStopped()
    }

    /**
     * Replaces the generator, e.g. when the data-update period changes. The new generator is used
     * by the next {@link start}.
     * @param generator The new generator
     * @throws Error when the source is running (the generator can only be replaced while stopped)
     */
    setGenerator(generator: DataGenerator<CD, S>): void {
        if (this.subscription !== undefined) {
            throw new Error("The data source's generator can only be replaced while the source is stopped")
        }
        this.generator = generator
    }

    /**
     * Stops the source and completes its observables. A disposed source can't be started again.
     */
    dispose(): void {
        this.stop()
        this.disposed = true
        this.updatesSubject.complete()
        this.runningSubject.complete()
    }

    /**
     * @return The latest time of any datum in any series (the stream's "ground truth" time), or
     * `-Infinity` when there is no data
     */
    abstract latestTime(): number

    /**
     * Adds a chunk of chart data to the series (and applies any data-retention rules)
     * @param data The chart data emitted by the generator
     */
    protected abstract ingest(data: CD): void

    /**
     * Forgets the generator subscription, and reports that the source stopped (when it was running)
     */
    private markStopped(): void {
        this.subscription = undefined
        if (this.runningSubject.value) this.runningSubject.next(false)
    }
}
