import type {UseBoundStore} from "zustand";
import {create, type StoreApi} from 'zustand';
import {devtools} from "zustand/middleware";
import {EMPTY} from "rxjs";
import type {IterateChartData} from "../../charts/observables/iterates.ts";
import {iteratesObservable} from "../../charts/observables/iterates.ts";
import type {IterateSeries} from "../../charts/series/iterateSeries.ts";
import {type Datum, datumOf, type TimeSeries} from "../../charts/series/timeSeries.ts";
import {seriesFrom} from "../../charts/series/baseSeries.ts";
import {IteratesDataSource} from "../../charts/datasources/iteratesDataSource.ts";
import type {DataGenerator} from "../../charts/datasources/StreamingDataSource.ts";
import {iterateFunctionObservable} from "../dataproviders/randomIterateData.ts";
import {createInitialVisibility, type Visibility} from "../options/visibility.ts";
import {DEFAULT_DROP_AFTER_20} from "../options/dropDataAfter.ts";
import {type DataSourceSlice, dataSourceSlice} from "./stateslices/dataSourceStateSlice.ts";
import type {PoincarePlotZoomState} from "../../charts/plots/PoincarePlot.tsx";
import {DEFAULT_LINE_END_COLOR, DEFAULT_LINE_START_COLOR} from "../../charts/plots/colorizedLine.ts";

/**
 * An iterate function, `x[n+1] = f(x[n])`, as a function of the time and `x[n]`
 */
export type IterateFunction = (time: number, xn: number) => Datum

const UPDATE_PERIOD = 50

/**
 * Finds where each series' iteration should start: from the latest iterate the series already
 * holds, so that a run started after a pause continues the iteration rather than starting over;
 * or, for a series with no iterates yet, from its seed. The latest iterate holds `x[m]` (as its
 * `iterateN`) at its time, and the iterate functions are deterministic, so iterating from `x[m]`
 * regenerates `x[m+1]`, `x[m+2]`, ..., and the first new iterate is `(x[m+1], x[m+1+lag])` -- exactly
 * the one that would have come next without the pause (for whatever lag is selected now).
 * @param currentSeries The data source's current iterate series
 * @param seeds The seed (initial) value for each series
 * @return The starting point for each series, as a single-datum time-series
 */
export function iterationStartsFor(currentSeries: Array<IterateSeries>, seeds: Array<TimeSeries>): Array<TimeSeries> {
    const latestIterates = new Map(currentSeries.flatMap(series =>
        series.last().map(iterate => [[series.name, iterate] as const]).getOrElse([])
    ))
    return seeds.map(seed => {
        const latest = latestIterates.get(seed.name)
        return latest === undefined ? seed : seriesFrom<Datum>(seed.name, [datumOf(latest.time, latest.iterateN)])
    })
}

/**
 * Creates the iterates generator: iterates the specified function and converts the stream into
 * `f[n](x)` versus `f[n+lag](x)` iterates. Each start continues from the data source's current
 * iterates (see {@link iterationStartsFor}), so Pause -> Run picks up where the iteration left off;
 * series without any iterates yet (e.g. after Clear) start from their seeds.
 * @param iterateFunction The iterate function
 * @param lagN The lag of the iterates plot (e.g. f[n](x) vs f[n+N](x), where N is the lag)
 * @param seeds The seed (initial) value for each series
 * @return The data generator
 */
export const iteratesGenerator = (
    iterateFunction: IterateFunction,
    lagN: number,
    seeds: Array<TimeSeries>
): DataGenerator<IterateChartData, IterateSeries> =>
    currentSeries => iteratesObservable(
        iterateFunctionObservable(iterateFunction, iterationStartsFor(currentSeries, seeds), UPDATE_PERIOD),
        lagN
    )

/**
 * A generator that emits nothing -- the chart sets the real generator (from the selected iterate
 * function and lag) just before each run
 */
const NO_DATA: DataGenerator<IterateChartData, IterateSeries> = () => EMPTY

/**
 * Creates the chart's data source
 * @param initialData The initial series (owned by the data source from here on)
 * @param dropAfterMs Data older than this (ms) is dropped
 * @return The data source
 */
const newDataSource = (initialData: Array<IterateSeries>, dropAfterMs: number): IteratesDataSource =>
    new IteratesDataSource({initialData, generator: NO_DATA, dropDataAfter: dropAfterMs})

type PoincareChartState = {
    dropAfterMs: number
    selectedInterpolationName: string
    selectedLagN: string
    selectedIterateFunction: string
    axesRange: [start: number, end: number]
    visibility: Visibility
    highlightAxes: boolean
    // whether the lines connecting the points change color along their length, the colors their
    // sweep starts and ends with, and the number of points (steps) a sweep takes
    colorizeLines: boolean
    lineStartColor: string
    lineEndColor: string
    lineColorSteps: number
    // the plot's zoom/pan state (undefined when never zoomed/panned), handed back to the plot
    // when it remounts so that navigating away and back doesn't reset the zoom
    zoomState: PoincarePlotZoomState | undefined
}

const initialState: PoincareChartState = {
    dropAfterMs: DEFAULT_DROP_AFTER_20[1],
    selectedInterpolationName: 'curveStepAfter',
    selectedLagN: 'lag = 1',
    selectedIterateFunction: 'Tent Map',
    axesRange: [0, 1],
    visibility: createInitialVisibility(),
    highlightAxes: false,
    colorizeLines: false,
    lineStartColor: DEFAULT_LINE_START_COLOR,
    lineEndColor: DEFAULT_LINE_END_COLOR,
    // (a slow sweep: at the example's 20 iterates a second, 1000 steps take well over an hour)
    lineColorSteps: 1000,
    zoomState: undefined,
}

type PoincareChartActions = {
    setDropAfterMs: (dropAfterMs: number) => void
    setSelectedInterpolationName: (name: string) => void
    setSelectedLagN: (name: string) => void
    setSelectedIterateFunction: (name: string) => void
    setAxesRange: (range: [start: number, end: number]) => void
    setVisibility: (visibility: Visibility) => void
    setHighlightAxes: (highlight: boolean) => void
    setColorizeLines: (colorize: boolean) => void
    setLineStartColor: (color: string) => void
    setLineEndColor: (color: string) => void
    setLineColorSteps: (steps: number) => void
    setZoomState: (zoomState: PoincarePlotZoomState) => void
}

type PoincareChartStore = PoincareChartState & PoincareChartActions &
    DataSourceSlice<IteratesDataSource, IterateSeries>

/**
 * The Poincaré chart's state, which survives the chart being unmounted (e.g. navigating to
 * another page and back) -- including its data source, which keeps ingesting in the meantime.
 */
export const usePoincareChartStore: UseBoundStore<StoreApi<PoincareChartStore>> = create<PoincareChartStore>()(
    devtools<PoincareChartStore>((set, get) => ({
        ...initialState,
        // the data source (which owns the data generator's subscription and the series), and
        // whether it's running
        ...dataSourceSlice<IteratesDataSource, IterateSeries>(
            set,
            get,
            newDataSource([], initialState.dropAfterMs),
            initialData => newDataSource(initialData, get().dropAfterMs)
        ),

        // data retention belongs to the data source, so keep it in step
        setDropAfterMs: (dropAfterMs: number) => {
            get().dataSource.setDropDataAfter(dropAfterMs)
            set({dropAfterMs})
        },
        setSelectedInterpolationName: (selectedInterpolationName: string) => set({selectedInterpolationName}),
        setSelectedLagN: (selectedLagN: string) => set({selectedLagN}),
        setSelectedIterateFunction: (selectedIterateFunction: string) => set({selectedIterateFunction}),
        setAxesRange: (axesRange: [start: number, end: number]) => set({axesRange}),
        setVisibility: (visibility: Visibility) => set({visibility}),
        setHighlightAxes: (highlightAxes: boolean) => set({highlightAxes}),
        setColorizeLines: (colorizeLines: boolean) => set({colorizeLines}),
        setLineStartColor: (lineStartColor: string) => set({lineStartColor}),
        setLineEndColor: (lineEndColor: string) => set({lineEndColor}),
        setLineColorSteps: (lineColorSteps: number) => set({lineColorSteps}),
        setZoomState: (zoomState: PoincarePlotZoomState) => set({zoomState}),
    })));
