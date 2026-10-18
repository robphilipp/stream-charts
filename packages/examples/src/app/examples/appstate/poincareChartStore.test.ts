import {seriesFrom} from "../../charts/series/baseSeries";
import {datumOf, type Datum} from "../../charts/series/timeSeries";
import type {IterateDatum, IterateSeries} from "../../charts/series/iterateSeries";
import {IteratesDataSource} from "../../charts/datasources/iteratesDataSource";
import {tentMapFn} from "../dataproviders/randomIterateData";
import {iteratesGenerator, iterationStartsFor} from "./poincareChartStore";

/**
 * Run after Pause must continue the iteration exactly where it left off: the iterates produced by
 * a paused-and-resumed run must match those of an uninterrupted run, value for value and time for
 * time.
 */
const UPDATE_PERIOD = 50
const seeds = () => [seriesFrom<Datum>('s1', [datumOf(10, 0.3)])]

function newDataSource(lag: number) {
    return new IteratesDataSource({
        initialData: [seriesFrom<IterateDatum>('s1', []) as IterateSeries],
        generator: iteratesGenerator(tentMapFn(1.8), lag, seeds()),
    })
}

const iterates = (dataSource: IteratesDataSource): Array<IterateDatum> => Array.from(dataSource.series.get('s1')!.data)

describe('resuming the poincare iteration after a pause', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it.each([1, 3])('continues exactly where it left off (lag %i)', lag => {
        const uninterrupted = newDataSource(lag)
        uninterrupted.start()
        jest.advanceTimersByTime(20 * UPDATE_PERIOD)
        uninterrupted.stop()

        const resumed = newDataSource(lag)
        resumed.start()
        jest.advanceTimersByTime(8 * UPDATE_PERIOD)
        resumed.stop()
        jest.advanceTimersByTime(30 * UPDATE_PERIOD)    // paused: nothing happens
        resumed.start()
        // the resumed run first refills the lag window (lag extra ticks) before it can emit again
        jest.advanceTimersByTime((20 - 8 + lag) * UPDATE_PERIOD)
        resumed.stop()

        const expected = iterates(uninterrupted)
        const actual = iterates(resumed).slice(0, expected.length)
        expect(actual.length).toBe(expected.length)
        actual.forEach((iterate, index) => {
            expect(iterate.time).toBeCloseTo(expected[index].time, 9)
            expect(iterate.iterateN).toBeCloseTo(expected[index].iterateN, 12)
            expect(iterate.iterateN_1).toBeCloseTo(expected[index].iterateN_1, 12)
        })
        // and nothing was emitted twice
        expect(new Set(iterates(resumed).map(iterate => iterate.time)).size).toBe(iterates(resumed).length)
    })

    it('continues the same sequence of values when the lag changes while paused', () => {
        const dataSource = newDataSource(1)
        dataSource.start()
        jest.advanceTimersByTime(6 * UPDATE_PERIOD)
        dataSource.stop()
        const last = iterates(dataSource).at(-1)!

        dataSource.setGenerator(iteratesGenerator(tentMapFn(1.8), 2, seeds()))
        dataSource.start()
        jest.advanceTimersByTime(5 * UPDATE_PERIOD)
        dataSource.stop()

        const next = iterates(dataSource)[iterates(dataSource).indexOf(last) + 1]
        // the next iterate starts at x[m+1] (the previous run's last x[m+1], for lag 1), one period later
        expect(next.time).toBeCloseTo(last.time + UPDATE_PERIOD, 9)
        expect(next.iterateN).toBeCloseTo(last.iterateN_1, 12)
    })

    it('starts from the seeds when a series has no iterates yet', () => {
        const starts = iterationStartsFor([seriesFrom<IterateDatum>('s1', []) as IterateSeries], seeds())
        expect(Array.from(starts[0].data)).toEqual([datumOf(10, 0.3)])
    })

    it('starts from the latest iterate otherwise', () => {
        const series = seriesFrom<IterateDatum>('s1', [
            {time: 100, iterateN: 0.2, iterateN_1: 0.4},
            {time: 150, iterateN: 0.4, iterateN_1: 0.7},
        ]) as IterateSeries
        expect(Array.from(iterationStartsFor([series], seeds())[0].data)).toEqual([datumOf(150, 0.4)])
    })
})
