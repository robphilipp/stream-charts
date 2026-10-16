// import {initialChartData, seriesFromTuples} from "stream-charts";

import {timeSeriesFromTuples} from "../../charts/series/timeSeries.ts";
import {initialTimeSeriesChartData, type TimeSeriesChartData} from "../../charts/series/timeSeriesChartData.ts";
import {seriesFrom} from "../../charts/series/baseSeries.ts";
import {type OrdinalDatum, ordinalDatumOf} from "../../charts/series/ordinalSeries.ts";
import {barDanceDataObservable} from "./randomOrdinalData.ts";
import {initialRandomSpikeData, randomSpikeDataObservable} from "./randomSpikeData.ts";

describe('when creating random data from an initial series', () => {
    const initialData = [
        timeSeriesFromTuples('test1', [
            [10, 80], [20, 220], [30, 300], [40, 380], [50, 510], [60, 620], [70, 680],
            [80, 1080], [90, 980], [100, 880], [110, 980]
        ]),
        // seriesFromTuples('test2', [
        //     [100, 980], [200, 880], [300, 980], [400, 1080], [500, 680], [600, 620], [700, 510],
        //     [800, 380], [900, 300], [1000, 20], [1100, 180], [1200, 180], [1300, 480],
        // ]),
        timeSeriesFromTuples('test3', [
            [10, 100], [20, 103], [30, 110], [40, 100], [50, 90], [60, 88], [70, 160], [80, 130],
            [90, 100], [100, 120], [110, 100], [120, -250], [130, 120], [150, 180], [170, 280],
        ]),
    ]

    it('should create initial data', () => {
        const data = initialTimeSeriesChartData(initialData)
        expect(data.maxTime).toBe(170)
        expect(data.newPoints.size).toBe(2)
        const p1 = data.newPoints.get('test1')
        const p3 = data.newPoints.get('test3')
        expect(p1).toBeDefined()
        expect(p3).toBeDefined()
        expect(p1?.length).toBe(1)
        expect(p3?.length).toBe(1)
        expect((p1 || [])[0].x).toBe(110)
        expect((p3 || [])[0].x).toBe(170)
        expect((p1 || [])[0].y).toBe(980)
        expect((p3 || [])[0].y).toBe(280)
    })
})

describe('dancing-bar data (barDanceDataObservable)', () => {
    afterEach(() => jest.useRealTimers())

    const existing = [
        seriesFrom<OrdinalDatum>('a', [ordinalDatumOf(0, 'a', 0.1), ordinalDatumOf(1000, 'a', 0.2)]),
        seriesFrom<OrdinalDatum>('b', [ordinalDatumOf(0, 'b', 0.3), ordinalDatumOf(1000, 'b', 0.4)]),
    ]

    it('emits only new data, continuing one update period after the latest existing datum', () => {
        jest.useFakeTimers()
        const emitted: Array<TimeSeriesChartData> = []
        const subscription = barDanceDataObservable(existing, 50).subscribe(data => emitted.push(data))

        // nothing (in particular, not the existing data) until the first tick
        expect(emitted).toHaveLength(0)

        jest.advanceTimersByTime(100)
        subscription.unsubscribe()

        expect(emitted).toHaveLength(2)
        expect(emitted.map(data => data.newPoints.get('a')!.map(datum => datum.x))).toEqual([[1050], [1100]])
        expect(emitted[0].newPoints.get('b')!).toHaveLength(1)
    })

    it("reports each series' max time as the time of its latest point", () => {
        jest.useFakeTimers()
        const emitted: Array<TimeSeriesChartData> = []
        const subscription = barDanceDataObservable(existing, 50).subscribe(data => emitted.push(data))
        jest.advanceTimersByTime(100)
        subscription.unsubscribe()

        emitted.forEach(data => {
            expect(data.maxTimes.get('a')).toBe(data.newPoints.get('a')!.at(-1)!.x)
            expect(data.maxTimes.get('b')).toBe(data.newPoints.get('b')!.at(-1)!.x)
            expect(data.maxTime).toBe(data.newPoints.get('a')!.at(-1)!.x)
        })
    })
})

describe('random spike data', () => {
    afterEach(() => jest.useRealTimers())

    // every value in the chart data's new points
    const valuesOf = (emitted: Array<TimeSeriesChartData>): Array<number> =>
        emitted.flatMap(data => Array.from(data.newPoints.values()).flatMap(points => Array.from(points).map(datum => datum.y)))

    it('creates initial spikes, one in each update period, with values within the spread around the mean', () => {
        const data = initialRandomSpikeData(['n1', 'n2'], 10, 200, 10, 55, 5)
        expect(data.map(series => series.name)).toEqual(['n1', 'n2'])
        data.forEach(series => {
            expect(series.data).toHaveLength(10)
            Array.from(series.data).forEach((spike, index) => {
                // within the index'th update period
                expect(spike.x).toBeGreaterThan(10 + index * 200)
                expect(spike.x).toBeLessThanOrEqual(10 + (index + 1) * 200)
                expect(spike.y).toBeGreaterThanOrEqual(50)
                expect(spike.y).toBeLessThanOrEqual(60)
            })
        })
    })

    it('streams spikes with values within the spread around the mean', () => {
        jest.useFakeTimers()
        const initial = initialRandomSpikeData(['n1', 'n2', 'n3'], 10, 200, 3, 55, 5)
        const emitted: Array<TimeSeriesChartData> = []
        // (a spike probability of 1, so every series spikes on every tick)
        const subscription = randomSpikeDataObservable(initial, 50, 1, 55, 5).subscribe(data => emitted.push(data))
        jest.advanceTimersByTime(1000)
        subscription.unsubscribe()

        const values = valuesOf(emitted)
        expect(values.length).toBe(20 * 3)
        values.forEach(value => {
            expect(value).toBeGreaterThanOrEqual(50)
            expect(value).toBeLessThanOrEqual(60)
        })
    })

    it('streams values between 0 and 1 by default', () => {
        jest.useFakeTimers()
        const initial = initialRandomSpikeData(['n1'], 10, 200, 3)
        const emitted: Array<TimeSeriesChartData> = []
        const subscription = randomSpikeDataObservable(initial, 50, 1).subscribe(data => emitted.push(data))
        jest.advanceTimersByTime(500)
        subscription.unsubscribe()

        valuesOf(emitted).forEach(value => {
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThan(1)
        })
    })
})
