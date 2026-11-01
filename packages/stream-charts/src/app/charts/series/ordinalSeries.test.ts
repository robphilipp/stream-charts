import {calculateOrdinalStats, ordinateSeriesFromTuples} from "./ordinalSeries";

describe('calculateOrdinalStats', () => {
    // guards against a regression of M9: minTimeDatum/maxTimeDatum compared datum.value instead
    // of datum.time (apparently copy-pasted from the value reducers just above) -- and because the
    // reducers seed from initialMinTimeDatum()/initialMaxTimeDatum(), whose `value` field is NaN,
    // every `.value` comparison against that seed was `x < NaN`/`x > NaN`, which is always false in
    // JS, so the accumulator never updated at all: minDatum.time/maxDatum.time were permanently
    // frozen at the initial sentinel regardless of the actual data passed in
    describe('min/max time datum', () => {
        it('picks the datum with the earliest and latest time across a single series, not the extreme-value one', () => {
            const series = [
                ordinateSeriesFromTuples('s1', [
                    [5, 'a', 100],   // largest value, but not the earliest/latest time
                    [1, 'a', 20],    // earliest time
                    [9, 'a', 3],     // latest time, smallest value
                ]),
            ]
            const stats = calculateOrdinalStats(series)

            expect(stats.minDatum.time.time).toBe(1)
            expect(stats.minDatum.time.value).toBe(20)
            expect(stats.maxDatum.time.time).toBe(9)
            expect(stats.maxDatum.time.value).toBe(3)
        })

        it('picks the earliest/latest time across multiple series', () => {
            const series = [
                ordinateSeriesFromTuples('s1', [[10, 'a', 1], [20, 'a', 2]]),
                ordinateSeriesFromTuples('s2', [[-5, 'b', 3], [15, 'b', 4]]),
            ]
            const stats = calculateOrdinalStats(series)

            expect(stats.minDatum.time.time).toBe(-5)
            expect(stats.minDatum.time.ordinal).toBe('b')
            expect(stats.maxDatum.time.time).toBe(20)
            expect(stats.maxDatum.time.ordinal).toBe('a')
        })

        it('still reports the correct min/max value datum alongside the min/max time datum', () => {
            const series = [
                ordinateSeriesFromTuples('s1', [[5, 'a', 100], [1, 'a', 20], [9, 'a', 3]]),
            ]
            const stats = calculateOrdinalStats(series)

            expect(stats.minDatum.value.value).toBe(3)
            expect(stats.maxDatum.value.value).toBe(100)
        })

        it('returns the frozen initial sentinel when there is no data at all', () => {
            const stats = calculateOrdinalStats([])

            expect(stats.minDatum.time.time).toBe(Infinity)
            expect(stats.maxDatum.time.time).toBe(-Infinity)
        })
    })

    describe('per-series value stats', () => {
        it('computes count, sum, mean, min, and max for each series', () => {
            const series = [
                ordinateSeriesFromTuples('s1', [[1, 'a', 10], [2, 'a', 20], [3, 'a', 30]]),
            ]
            const stats = calculateOrdinalStats(series)
            const s1Stats = stats.valueStatsForSeries.get('s1')

            expect(s1Stats?.count).toBe(3)
            expect(s1Stats?.sum).toBe(60)
            expect(s1Stats?.mean).toBe(20)
            expect(s1Stats?.min.value).toBe(10)
            expect(s1Stats?.max.value).toBe(30)
        })
    })
})
