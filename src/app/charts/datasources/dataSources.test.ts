import {Observable, Subject, of, throwError} from "rxjs";
import {seriesFrom} from "../series/baseSeries";
import {datumOf, type Datum, type TimeSeries} from "../series/timeSeries";
import type {TimeSeriesChartData} from "../series/timeSeriesChartData";
import type {OutlierChartData} from "../observables/outliers";
import type {OutlierDatum, OutlierSeries} from "../series/outlierSeries";
import {defaultOrdinalStats, defaultOrdinalValueStats, type OrdinalChartData} from "../observables/ordinals";
import {type OrdinalDatum, ordinalDatumOf} from "../series/ordinalSeries";
import type {IterateChartData} from "../observables/iterates";
import type {IterateDatum, IterateSeries} from "../series/iterateSeries";
import {currentTimesByGroup, TimeSeriesDataSource} from "./timeSeriesDataSource";
import {OutlierDataSource} from "./outlierDataSource";
import {OrdinalDataSource} from "./ordinalDataSource";
import {IteratesDataSource, iteratesCurrentTime} from "./iteratesDataSource";

/**
 * A generator whose emissions the test controls, and which counts how many subscriptions to it
 * are currently live -- the thing the data source must never leak.
 */
function controllableGenerator<CD>() {
    const source = new Subject<CD>()
    const calls: Array<Array<unknown>> = []
    let live = 0
    const generator = (currentSeries: Array<unknown>): Observable<CD> => {
        calls.push(currentSeries)
        return new Observable<CD>(subscriber => {
            live += 1
            const subscription = source.subscribe(subscriber)
            return () => {
                live -= 1
                subscription.unsubscribe()
            }
        })
    }
    return {source, generator, calls, live: () => live}
}

function timeSeriesData(newPoints: Map<string, Array<Datum>>, maxTime?: number): TimeSeriesChartData {
    const maxTimes = new Map(Array.from(newPoints.entries()).map(([name, points]) => [name, points[points.length - 1].x]))
    return {
        seriesNames: new Set(newPoints.keys()),
        maxTime: maxTime ?? Math.max(...maxTimes.values()),
        maxTimes,
        newPoints,
    }
}

describe('streaming data source lifecycle', () => {
    function sourceWith(generator: (series: Array<TimeSeries>) => Observable<TimeSeriesChartData>) {
        return new TimeSeriesDataSource({
            initialData: [seriesFrom<Datum>('a', [datumOf(0, 1)])],
            generator,
        })
    }

    it('subscribes to the generator only when started, and is not running before that', () => {
        const {generator, live} = controllableGenerator<TimeSeriesChartData>()
        const dataSource = sourceWith(generator)
        expect(dataSource.running).toBe(false)
        expect(live()).toBe(0)

        dataSource.start()
        expect(dataSource.running).toBe(true)
        expect(live()).toBe(1)
    })

    it('ignores a second start while already running (never two generator subscriptions)', () => {
        const {generator, live, calls} = controllableGenerator<TimeSeriesChartData>()
        const dataSource = sourceWith(generator)
        dataSource.start()
        dataSource.start()
        expect(live()).toBe(1)
        expect(calls.length).toBe(1)
    })

    it('leaves nothing subscribed to the generator after any number of start/stop (Run/Pause) cycles', () => {
        const {generator, live} = controllableGenerator<TimeSeriesChartData>()
        const dataSource = sourceWith(generator)
        for (let cycle = 0; cycle < 10; cycle++) {
            dataSource.start()
            expect(live()).toBe(1)
            dataSource.stop()
            expect(live()).toBe(0)
            expect(dataSource.running).toBe(false)
        }
    })

    it('hands the generator the current (accumulated) series on each start, so a restart resumes', () => {
        const {source, generator, calls} = controllableGenerator<TimeSeriesChartData>()
        const dataSource = sourceWith(generator)

        dataSource.start()
        source.next(timeSeriesData(new Map([['a', [datumOf(100, 2)]]])))
        dataSource.stop()
        dataSource.start()

        const seriesAtRestart = calls[1][0] as TimeSeries
        expect(seriesAtRestart.name).toBe('a')
        expect(seriesAtRestart.last().getOrElse(datumOf(-1, -1))).toEqual(datumOf(100, 2))
    })

    it('emits updates only after the data has been ingested into the series', () => {
        const {source, generator} = controllableGenerator<TimeSeriesChartData>()
        const dataSource = sourceWith(generator)
        const seenLengths: Array<number> = []
        dataSource.chartDataUpdatesObservable.subscribe(() => seenLengths.push(dataSource.series.get('a')!.data.length))

        dataSource.start()
        source.next(timeSeriesData(new Map([['a', [datumOf(100, 2)]]])))
        expect(seenLengths).toEqual([2])
    })

    it('reports running changes through isRunningObservable, starting with the current value', () => {
        const {generator} = controllableGenerator<TimeSeriesChartData>()
        const dataSource = sourceWith(generator)
        const states: Array<boolean> = []
        dataSource.isRunningObservable.subscribe(running => states.push(running))

        dataSource.start()
        dataSource.stop()
        expect(states).toEqual([false, true, false])
    })

    it('stops when the generator completes, including synchronously during start', () => {
        const dataSource = sourceWith(() => of(timeSeriesData(new Map([['a', [datumOf(5, 1)]]]))))
        dataSource.start()
        expect(dataSource.running).toBe(false)
        // the synchronously-emitted data was still ingested
        expect(dataSource.series.get('a')!.data.length).toBe(2)
    })

    it('stops (and logs) when the generator errors', () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {
        })
        const dataSource = sourceWith(() => throwError(() => new Error('boom')))
        dataSource.start()
        expect(dataSource.running).toBe(false)
        expect(errorSpy).toHaveBeenCalled()
        errorSpy.mockRestore()
    })

    it('only allows the generator to be replaced while stopped, and uses the new one on the next start', () => {
        const first = controllableGenerator<TimeSeriesChartData>()
        const second = controllableGenerator<TimeSeriesChartData>()
        const dataSource = sourceWith(first.generator)

        dataSource.start()
        expect(() => dataSource.setGenerator(second.generator)).toThrow()
        dataSource.stop()
        dataSource.setGenerator(second.generator)
        dataSource.start()
        expect(first.live()).toBe(0)
        expect(second.live()).toBe(1)
    })

    it('stops, completes its observables, and refuses to restart once disposed', () => {
        const {generator, live} = controllableGenerator<TimeSeriesChartData>()
        const dataSource = sourceWith(generator)
        let completed = false
        dataSource.chartDataUpdatesObservable.subscribe({complete: () => completed = true})

        dataSource.start()
        dataSource.dispose()
        expect(live()).toBe(0)
        expect(completed).toBe(true)

        dataSource.start()
        expect(live()).toBe(0)
        expect(dataSource.running).toBe(false)
    })
})

describe('TimeSeriesDataSource', () => {
    it('adds new points to their series and reports the latest time', () => {
        const {source, generator} = controllableGenerator<TimeSeriesChartData>()
        const onUpdateData = jest.fn()
        const dataSource = new TimeSeriesDataSource({
            initialData: [seriesFrom<Datum>('a', []), seriesFrom<Datum>('b', [])],
            generator,
            onUpdateData,
        })
        dataSource.start()
        source.next(timeSeriesData(new Map([['a', [datumOf(10, 1)]], ['b', [datumOf(20, 2)]]])))

        expect(Array.from(dataSource.series.get('a')!.data)).toEqual([datumOf(10, 1)])
        expect(Array.from(dataSource.series.get('b')!.data)).toEqual([datumOf(20, 2)])
        expect(dataSource.latestTime()).toBe(20)
        expect(onUpdateData).toHaveBeenCalledWith('a', [datumOf(10, 1)])
    })

    it('drops data older than dropDataAfter relative to the time group\'s current time', () => {
        const {source, generator} = controllableGenerator<TimeSeriesChartData>()
        const dataSource = new TimeSeriesDataSource({
            initialData: [seriesFrom<Datum>('a', [datumOf(0, 1), datumOf(500, 1)])],
            generator,
            dropDataAfter: 1000,
        })
        dataSource.start()
        source.next(timeSeriesData(new Map([['a', [datumOf(1200, 1)]]])))

        expect(Array.from(dataSource.series.get('a')!.data).map(datum => datum.x)).toEqual([500, 1200])
    })

    it('measures each series against its own time group, not another group\'s clock', () => {
        const {source, generator} = controllableGenerator<TimeSeriesChartData>()
        const dataSource = new TimeSeriesDataSource({
            initialData: [seriesFrom<Datum>('fast', [datumOf(0, 1)]), seriesFrom<Datum>('slow', [datumOf(0, 1)])],
            generator,
            dropDataAfter: 1000,
            timeGroupFor: name => name === 'fast' ? 'x-1' : 'x-2',
        })
        dataSource.start()
        source.next(timeSeriesData(new Map([['fast', [datumOf(5000, 1)]], ['slow', [datumOf(10, 1)]]]), 5000))

        expect(Array.from(dataSource.series.get('fast')!.data).map(datum => datum.x)).toEqual([5000])
        // the slow series' own group is only at t=10, so its t=0 point is kept
        expect(Array.from(dataSource.series.get('slow')!.data).map(datum => datum.x)).toEqual([0, 10])
    })

    it('applies a changed dropDataAfter to subsequently arriving data', () => {
        const {source, generator} = controllableGenerator<TimeSeriesChartData>()
        const dataSource = new TimeSeriesDataSource({
            initialData: [seriesFrom<Datum>('a', [datumOf(0, 1)])],
            generator,
        })
        dataSource.start()
        dataSource.setDropDataAfter(100)
        source.next(timeSeriesData(new Map([['a', [datumOf(200, 1)]]])))
        expect(Array.from(dataSource.series.get('a')!.data).map(datum => datum.x)).toEqual([200])
    })

    it('computes per-group current times the same way the original subscription code did', () => {
        const data = timeSeriesData(new Map([['a', [datumOf(10, 1)]], ['b', [datumOf(30, 1)]], ['c', [datumOf(20, 1)]]]))
        const times = currentTimesByGroup(data, name => name === 'c' ? 'x-2' : 'x-1')
        expect(times).toEqual(new Map([['x-1', 30], ['x-2', 20]]))
    })
})

describe('OutlierDataSource', () => {
    const outlierDatum = (x: number, y: number): OutlierDatum<[number]> => ({datum: {x, y}, metadata: [0]} as unknown as OutlierDatum<[number]>)
    const outlierData = (newPoints: Map<string, Array<OutlierDatum<[number]>>>): OutlierChartData<[number]> => ({
        seriesNames: new Set(newPoints.keys()),
        newPoints,
    })

    it('registers series the first time they appear in the stream', () => {
        const {source, generator} = controllableGenerator<OutlierChartData<[number]>>()
        const dataSource = new OutlierDataSource<[number]>({initialData: [], generator})
        dataSource.start()
        source.next(outlierData(new Map([['new-series', [outlierDatum(10, 1)]]])))

        expect(dataSource.series.has('new-series')).toBe(true)
        expect(dataSource.latestTime()).toBe(10)
    })

    it('drops data older than dropDataAfter relative to the newest datum in the chunk', () => {
        const {source, generator} = controllableGenerator<OutlierChartData<[number]>>()
        const dataSource = new OutlierDataSource<[number]>({
            initialData: [seriesFrom('a', [outlierDatum(0, 1), outlierDatum(500, 1)]) as OutlierSeries<[number]>],
            generator,
            dropDataAfter: 1000,
        })
        dataSource.start()
        source.next(outlierData(new Map([['a', [outlierDatum(1200, 1)]]])))

        expect(Array.from(dataSource.series.get('a')!.data).map(datum => datum.datum.x)).toEqual([500, 1200])
    })
})

describe('OrdinalDataSource', () => {
    function ordinalData(newPoints: Map<string, Array<OrdinalDatum>>, maxTime: number): OrdinalChartData {
        const stats = defaultOrdinalStats()
        stats.maxDatum.time = ordinalDatumOf(maxTime, 'a', 0)
        newPoints.forEach((_, name) => stats.valueStatsForSeries.set(name, defaultOrdinalValueStats()))
        return {
            seriesNames: new Set(newPoints.keys()),
            stats,
            newPoints,
        } as unknown as OrdinalChartData
    }

    it('adds new points, copies the lifetime stats, and accumulates the windowed stats', () => {
        const {source, generator} = controllableGenerator<OrdinalChartData>()
        const dataSource = new OrdinalDataSource({initialData: [seriesFrom<OrdinalDatum>('a', [])], generator})
        dataSource.start()
        source.next(ordinalData(new Map([['a', [ordinalDatumOf(10, 'a', 4), ordinalDatumOf(20, 'a', 6)]]]), 20))

        expect(dataSource.series.get('a')!.data.length).toBe(2)
        expect(dataSource.stats.maxDatum.time.time).toBe(20)
        const windowed = dataSource.stats.windowedValueStatsForSeries.get('a')!
        expect(windowed.count).toBe(2)
        expect(windowed.mean).toBe(5)
    })

    it('removes dropped data from the windowed stats', () => {
        const {source, generator} = controllableGenerator<OrdinalChartData>()
        const dataSource = new OrdinalDataSource({
            initialData: [seriesFrom<OrdinalDatum>('a', [])],
            generator,
            dropDataAfter: 100,
        })
        dataSource.start()
        source.next(ordinalData(new Map([['a', [ordinalDatumOf(0, 'a', 4)]]]), 0))
        source.next(ordinalData(new Map([['a', [ordinalDatumOf(500, 'a', 8)]]]), 500))

        expect(Array.from(dataSource.series.get('a')!.data).map(datum => datum.time)).toEqual([500])
        const windowed = dataSource.stats.windowedValueStatsForSeries.get('a')!
        expect(windowed.count).toBe(1)
        expect(windowed.mean).toBe(8)
    })
})

describe('IteratesDataSource', () => {
    const iterate = (time: number): IterateDatum => ({time, iterateN: 0, iterateN_1: 0})
    const iterateData = (newPoints: Map<string, Array<IterateDatum>>): IterateChartData => ({
        seriesNames: new Set(newPoints.keys()),
        newPoints,
    } as unknown as IterateChartData)

    it('drops data older than dropDataAfter relative to the chunk\'s current time', () => {
        const {source, generator} = controllableGenerator<IterateChartData>()
        const dataSource = new IteratesDataSource({
            initialData: [seriesFrom<IterateDatum>('a', [iterate(0), iterate(500)]) as IterateSeries],
            generator,
            dropDataAfter: 1000,
        })
        dataSource.start()
        source.next(iterateData(new Map([['a', [iterate(1200)]]])))

        expect(Array.from(dataSource.series.get('a')!.data).map(datum => datum.time)).toEqual([500, 1200])
        expect(dataSource.latestTime()).toBe(1200)
    })

    it('counts the points dropped from each series', () => {
        const {source, generator} = controllableGenerator<IterateChartData>()
        const dataSource = new IteratesDataSource({
            initialData: [
                seriesFrom<IterateDatum>('a', [iterate(0), iterate(500)]) as IterateSeries,
                seriesFrom<IterateDatum>('b', [iterate(900)]) as IterateSeries,
            ],
            generator,
            dropDataAfter: 1000,
        })
        dataSource.start()
        expect(dataSource.droppedCountFor('a')).toBe(0)

        source.next(iterateData(new Map([['a', [iterate(1200)]], ['b', [iterate(1200)]]])))
        expect(dataSource.droppedCountFor('a')).toBe(1)
        expect(dataSource.droppedCountFor('b')).toBe(0)

        source.next(iterateData(new Map([['a', [iterate(2100)]], ['b', [iterate(2100)]]])))
        // (a: 500 dropped too, while 1200 is kept; b: 900 dropped)
        expect(dataSource.droppedCountFor('a')).toBe(2)
        expect(dataSource.droppedCountFor('b')).toBe(1)
        expect(dataSource.droppedCountFor('unknown')).toBe(0)
    })

    it('computes the current time as the latest new point over all series', () => {
        expect(iteratesCurrentTime(iterateData(new Map([['a', [iterate(5)]], ['b', [iterate(9)]], ['c', []]])))).toBe(9)
    })
})
