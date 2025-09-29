import {filter, map, scan} from 'rxjs/operators';
import {Observable, range} from 'rxjs';
import {IterateChartData, iteratesObservable as iterateObservable} from '../observables/iterates'
import {TimeSeriesChartData} from "../series/timeSeriesChartData";
import {datumOf} from "../series/timeSeries";


type Point = {
    x: number
    y: number
}

const pointFrom = (x: number, y: number): Point => ({x, y})
const emptyPoint = (): Point => ({x: NaN, y: NaN})
const isEmptyPoint = (point?: Point): boolean => point === undefined || (isNaN(point.x) && isNaN(point.y))
const nonEmptyPoint = (point?: Point): boolean => !isEmptyPoint(point)

type Accumulate = {
    // n-difference, which is the number of points between successive differences
    n: number
    // holds the previous n point (for successive-n differences)
    previous: Array<Point>
    // the current successive-n difference
    difference?: Point
}
const initialAccumulate = (n: number = 1): Accumulate => ({n, previous: []})

/**
 * Source for {@link Point} data that generates `x`-values from a range of 1 to `numPoints` and
 * creates the `y`-values by applying the `valueFn` to those `x`-values.
 * @param numPoints The number of points to generate
 * @param valueFn The function that maps `x` to `y` (i.e. the value function is `f(x)` in `y = f(x)`)
 * @return an observable of {@link Point}
 */
function pointsObservable(numPoints: number = 10, valueFn: (x: number) => number): Observable<Point> {
    return range(1, numPoints).pipe(map(value => pointFrom(value, valueFn(value))))
}

/**
 *
 * @param n The number of points back from which to calculate the `n-difference`
 * @param dataObservable Observable that is the source of the underlying data
 * @param useStartX Whether to use the x-value from the beginning of the interval as the x-value
 * for the difference (default), or whether to use the last x-value in the interval.
 */
function successiveDiffsObservable(
    n: number = 1,
    dataObservable: Observable<Point>,
    useStartX: boolean = true
): Observable<Point> {
    return dataObservable
        .pipe(
            scan(({n, previous,}, current) => {
                // when we have accumulated enough previous values to cover the "n-difference",
                // we can calculate an actual difference
                if (previous.length >= n) {
                    // add the new point, and take the first point from the beginning
                    previous.push(current)
                    const first: Point = previous.shift() || emptyPoint()

                    // calculate the n-difference, using the x-value of the initial point (default)
                    // or the current point (end of current time-range
                    const difference = pointFrom(
                        useStartX ? first.x : current.x,
                        current.y - first.y
                    )

                    return {n, previous, difference}
                }

                // not enough points yet, so just accumulate the current point
                previous.push(current)

                return {n, previous}

            }, initialAccumulate(n)),
            filter(accum => nonEmptyPoint(accum.difference)),
            map(accum => accum.difference === undefined ? emptyPoint() : accum.difference)
        )
}

describe('should be able to calculate successive differences', () => {

    test('should be able to calc successive-diffs for x^2 where x is in 1..10', done => {
        let results: Array<Point> = []
        successiveDiffsObservable(1, pointsObservable(10, x => x * x), true).subscribe(point => results.push(point))
        done()
        expect(results).toHaveLength(9)
        expect(results).toEqual([
            {x: 1, y: 3},
            {x: 2, y: 5},
            {x: 3, y: 7},
            {x: 4, y: 9},
            {x: 5, y: 11},
            {x: 6, y: 13},
            {x: 7, y: 15},
            {x: 8, y: 17},
            {x: 9, y: 19},
        ])
    });

    test('should be able to calc successive-diffs for x^2 where x is in 1..10 using interval end', done => {
        let results: Array<Point> = []
        successiveDiffsObservable(1, pointsObservable(10, x => x * x), false).subscribe(point => results.push(point))
        done()
        expect(results).toHaveLength(9)
        expect(results).toEqual([
            {x: 2, y: 3},
            {x: 3, y: 5},
            {x: 4, y: 7},
            {x: 5, y: 9},
            {x: 6, y: 11},
            {x: 7, y: 13},
            {x: 8, y: 15},
            {x: 9, y: 17},
            {x: 10, y: 19},
        ])
    });

    test('should be able to calc 3-diffs for x^2 where x is in 1..10', done => {
        let results: Array<Point> = []
        successiveDiffsObservable(3, pointsObservable(10, x => x * x), true).subscribe(point => results.push(point))
        done()
        expect(results).toHaveLength(7)
        expect(results).toEqual([
            {x: 1, y: 15},
            {x: 2, y: 21},
            {x: 3, y: 27},
            {x: 4, y: 33},
            {x: 5, y: 39},
            {x: 6, y: 45},
            {x: 7, y: 51},
        ])
    });

    test('should be able to calc 3-diffs for x^2 where x is in 1..10 using interval end', done => {
        let results: Array<Point> = []
        successiveDiffsObservable(3, pointsObservable(10, x => x * x), false).subscribe(point => results.push(point))
        done()
        expect(results).toHaveLength(7)
        expect(results).toEqual([
            {x: 4, y: 15},
            {x: 5, y: 21},
            {x: 6, y: 27},
            {x: 7, y: 33},
            {x: 8, y: 39},
            {x: 9, y: 45},
            {x: 10, y: 51},
        ])
    });
})

/**
 * Observable that converts data points into iterates for poincare plots where one plots x(j+n) vs x(j)
 * @param n The n-th iterate for plotting x(j+n) vs x(j)
 * @param dataObservable The observable with the point data
 * @return an observable of a stream of {@link Point}s
 */
function iteratesObservable(n: number = 1, dataObservable: Observable<Point>): Observable<Point> {
    return dataObservable
        .pipe(
            scan(({n, previous,}, current) => {
                // when we have accumulated enough previous values to cover the "n-iterate",
                // we can grab the y-value from the n-th point back
                if (previous.length >= n) {
                    // add the new point, and take the first point from the beginning
                    previous.push(pointFrom(previous[previous.length - 1].y, current.y))
                    const first: Point = previous.shift() || emptyPoint()

                    // calculate the n-difference, using the x-value of the initial point (default)
                    // or the current point (end of current time-range
                    const iterate = pointFrom(first.y, current.y)

                    return {n, previous, difference: iterate}
                }

                // not enough points yet, so just accumulate the current point
                previous.push(current)

                return {n, previous}

            }, initialAccumulate(n)),
            filter(accum => nonEmptyPoint(accum.difference)),
            map(accum => accum.difference === undefined ? emptyPoint() : accum.difference)
        )
}

function tentFn(x: number, mu: number = 1): number {
    return x < 0.5 ? mu * x : mu * (1 - x)
}

describe('should be able to calculate iterates', () => {

    test('should be able to calc 1-iterates for x^2 where x is in 1..10', done => {
        let results: Array<Point> = []
        iteratesObservable(1, pointsObservable(10, x => 2 * x)).subscribe(point => results.push(point))
        done()
        expect(results).toHaveLength(9)
        expect(results).toEqual([
            {x: 2, y: 4},
            {x: 4, y: 6},
            {x: 6, y: 8},
            {x: 8, y: 10},
            {x: 10, y: 12},
            {x: 12, y: 14},
            {x: 14, y: 16},
            {x: 16, y: 18},
            {x: 18, y: 20}
        ])
    });

    test('should be able to calc 3-iterates for x^2 where x is in 1..10', done => {
        let results: Array<Point> = []
        iteratesObservable(3, pointsObservable(10, x => 2 * x)).subscribe(point => results.push(point))
        done()
        expect(results).toHaveLength(7)
        expect(results).toEqual([
            {x: 2, y: 8},
            {x: 4, y: 10},
            {x: 6, y: 12},
            {x: 8, y: 14},
            {x: 10, y: 16},
            {x: 12, y: 18},
            {x: 14, y: 20}
        ])
    });


    test('tent map should converge to (0, 0) for mu < 1', done => {
        const numPoints = 100000
        let lastPoint = emptyPoint()

        iteratesObservable(1, range(0, numPoints).pipe(map(x => pointFrom(x, tentFn(x / numPoints, 0.15)))))
            .subscribe(point => lastPoint = point)

        done()
        expect(lastPoint.y).toBeLessThan(1e-5)
        expect(lastPoint.x).toBeLessThan(1e-5)
    })
})

describe('when calculating tent-map iterates with one new data point for each event', () => {

    test('should be able to calc 1-iterates for tent-map chart data, when 1 point is added at a time', done => {
        const numPoints = 10
        let results: Array<IterateChartData> = []
        iterateObservable(
            range(0, numPoints).pipe(
                map(x => ({
                    maxTime: x,
                    maxTimes: new Map([['test1', x]]),
                    newPoints: new Map([['test1', [datumOf(x, tentFn(x / numPoints, 0.15))]]])
                } as TimeSeriesChartData))
            )).subscribe(point => results.push(point));
        done()
        expect(results).toHaveLength(9)

        //
        // check the first iterate datum
        expect(results[0].minIterate.iterateN).toEqual(0)
        expect(results[0].minIterate.iterateN_1).toEqual(0.015)
        expect(results[0].maxIterate.iterateN).toEqual(0)
        expect(results[0].maxIterate.iterateN_1).toEqual(0.015)

        expect(results[0].minIterates.has("test1")).toBe(true)
        expect(results[0].minIterates.size).toEqual(1)
        expect(results[0].minIterates.get("test1")!.time).toEqual(0)
        expect(results[0].minIterates.get("test1")!.iterateN).toEqual(0)
        expect(results[0].minIterates.get("test1")!.iterateN_1).toEqual(0.015)

        expect(results[0].maxIterates.has("test1")).toBe(true)
        expect(results[0].maxIterates.size).toEqual(1)
        expect(results[0].maxIterates.get("test1")!.time).toEqual(0)
        expect(results[0].maxIterates.get("test1")!.iterateN).toBeCloseTo(0, 4)
        expect(results[0].maxIterates.get("test1")!.iterateN_1).toBeCloseTo(0.015, 4)

        // check that the accumulator "newPoints" holds the previous "newPoints" for the iterate
        expect(results[0].newPoints.has("test1")).toBe(true)
        expect(results[0].newPoints.get("test1")).toHaveLength(1)
        expect(results[0].newPoints.get("test1")![0].time).toEqual(0)
        expect(results[0].newPoints.get("test1")![0].iterateN).toEqual(0)
        expect(results[0].newPoints.get("test1")![0].iterateN_1).toBeCloseTo(0.015, 4)

        //
        // check the last iterate datum
        expect(results[8].minIterate.time).toEqual(8)
        expect(results[8].minIterate.iterateN).toEqual(0)
        expect(results[8].minIterate.iterateN_1).toBeCloseTo(0.015, 4)

        expect(results[8].maxIterate.time).toEqual(5)
        expect(results[8].maxIterate.iterateN).toBeCloseTo(0.075, 4)
        expect(results[8].maxIterate.iterateN_1).toBeCloseTo(0.075, 4)

        expect(results[8].minIterates.has("test1")).toBe(true)
        expect(results[8].minIterates.size).toEqual(1)
        expect(results[8].minIterates.get("test1")!.time).toEqual(8)
        expect(results[8].minIterates.get("test1")!.iterateN).toEqual(0)
        expect(results[8].minIterates.get("test1")!.iterateN_1).toBeCloseTo(0.015, 4)

        expect(results[8].maxIterates.has("test1")).toBe(true)
        expect(results[8].maxIterates.size).toEqual(1)
        expect(results[8].maxIterates.get("test1")!.time).toEqual(5)
        expect(results[8].maxIterates.get("test1")!.iterateN).toBeCloseTo(0.075, 4)
        expect(results[8].maxIterates.get("test1")!.iterateN_1).toBeCloseTo(0.075, 4)

        // check that the accumulator "newPoints" holds the previous "newPoints" for the iterate
        expect(results[8].newPoints.has("test1")).toBe(true)
        expect(results[8].newPoints.get("test1")).toHaveLength(1)
        expect(results[8].newPoints.get("test1")![0].time).toEqual(8)
        expect(results[8].newPoints.get("test1")![0].iterateN).toBeCloseTo(0.03, 4)
        expect(results[8].newPoints.get("test1")![0].iterateN_1).toBeCloseTo(0.015, 4)
    });
})

describe('when calculating tent-map 1-iterates with two new data points for each event', () => {

    test('should be able to calc iterates for tent-map chart data, when 2 points are added at a time', done => {
        const numPoints = 5
        let results: Array<IterateChartData> = []
        iterateObservable(
            range(0, numPoints)
                .pipe(
                    map(x => ({
                        maxTime: 2 * x,
                        maxTimes: new Map([['test1', 2 * x]]),
                        newPoints: new Map([
                            ['test1', [datumOf(2 * x, tentFn(2 * x / (2 * numPoints), 0.15)), datumOf(2 * x + 1, tentFn((2 * x + 1) / (2 * numPoints), 0.15))]],
                        ])
                    } as TimeSeriesChartData))
                ))
            .subscribe(result => results.push(result));
        done()
        expect(results).toHaveLength(5)
        expect(results.reduce((count, result) => result.newPoints.get("test1")!.length + count, 0)).toEqual(9)

        //
        // check the first iterate datum
        expect(results[0].minIterate.iterateN).toBeCloseTo(0, 4)
        expect(results[0].minIterate.iterateN_1).toBeCloseTo(0.015, 4)
        expect(results[0].maxIterate.iterateN).toBeCloseTo(0, 4)
        expect(results[0].maxIterate.iterateN_1).toBeCloseTo(0.015, 4)

        expect(results[0].minIterates.has("test1")).toBe(true)
        expect(results[0].minIterates.size).toEqual(1)
        expect(results[0].minIterates.get("test1")!.time).toBeCloseTo(0, 4)
        expect(results[0].minIterates.get("test1")!.iterateN).toBeCloseTo(0, 4)
        expect(results[0].minIterates.get("test1")!.iterateN_1).toBeCloseTo(0.015, 4)

        expect(results[0].maxIterates.has("test1")).toBe(true)
        expect(results[0].maxIterates.size).toEqual(1)
        expect(results[0].maxIterates.get("test1")!.time).toEqual(0)
        expect(results[0].maxIterates.get("test1")!.iterateN).toBeCloseTo(0, 4)
        expect(results[0].maxIterates.get("test1")!.iterateN_1).toBeCloseTo(0.015, 4)

        // check that the accumulator "newPoints" holds the previous "newPoints" for the iterate
        expect(results[0].newPoints.has("test1")).toBe(true)
        expect(results[0].newPoints.get("test1")).toHaveLength(1)
        expect(results[0].newPoints.get("test1")![0].time).toEqual(0)
        expect(results[0].newPoints.get("test1")![0].iterateN).toEqual(0)
        expect(results[0].newPoints.get("test1")![0].iterateN_1).toBeCloseTo(0.015, 4)

        //
        // check the last iterate datum
        expect(results[4].minIterate.time).toEqual(8)
        expect(results[4].minIterate.iterateN).toEqual(0)
        expect(results[4].minIterate.iterateN_1).toBeCloseTo(0.015, 4)

        expect(results[4].maxIterate.time).toEqual(5)
        expect(results[4].maxIterate.iterateN).toBeCloseTo(0.075, 4)
        expect(results[4].maxIterate.iterateN_1).toBeCloseTo(0.075, 4)

        expect(results[4].minIterates.size).toEqual(1)
        expect(results[4].minIterates.has("test1")).toBe(true)
        expect(results[4].minIterates.get("test1")!.time).toEqual(8)
        expect(results[4].minIterates.get("test1")!.iterateN).toEqual(0)
        expect(results[4].minIterates.get("test1")!.iterateN_1).toBeCloseTo(0.015, 4)

        expect(results[4].maxIterates.size).toEqual(1)
        expect(results[4].maxIterates.has("test1")).toBe(true)
        expect(results[4].maxIterates.get("test1")!.time).toEqual(5)
        expect(results[4].maxIterates.get("test1")!.iterateN).toBeCloseTo(0.075, 4)
        expect(results[4].maxIterates.get("test1")!.iterateN_1).toBeCloseTo(0.075, 4)

        // check that the accumulator "newPoints" holds the previous "newPoints" for the iterate
        expect(results[4].newPoints.has("test1")).toBe(true)
        expect(results[4].newPoints.get("test1")).toHaveLength(2)
        expect(results[4].newPoints.get("test1")![1].time).toEqual(8)
        expect(results[4].newPoints.get("test1")![1].iterateN).toBeCloseTo(0.03, 4)
        expect(results[4].newPoints.get("test1")![1].iterateN_1).toBeCloseTo(0.015, 4)
    });

    test('should be able to calc iterates for tent-map chart data, when 2 points are added at a time, with 2 series', done => {
        const numPoints = 5
        let results: Array<IterateChartData> = []
        iterateObservable(
            range(0, numPoints)
                .pipe(
                    map(x => ({
                        maxTime: 2 * x,
                        maxTimes: new Map([['test1', 2 * x]]),
                        newPoints: new Map([
                            ['test1', [datumOf(2 * x, tentFn(2 * x / (2 * numPoints), 0.15)), datumOf(2 * x + 1, tentFn((2 * x + 1) / (2 * numPoints), 0.15))]],
                            ['test2', [datumOf(2 * x, tentFn(2 * x / (2 * numPoints), 0.35)), datumOf(2 * x + 1, tentFn((2 * x + 1) / (2 * numPoints), 0.35))]],
                        ])
                    } as TimeSeriesChartData))
                ))
            .subscribe(result => results.push(result));
        done()
        expect(results).toHaveLength(5)
        expect(results.reduce((count, result) => result.newPoints.get("test1")!.length + count, 0)).toEqual(9)

        //
        // check the first iterate datum
        expect(results[0].minIterate.iterateN).toBeCloseTo(0, 4)
        expect(results[0].minIterate.iterateN_1).toBeCloseTo(0.015, 4)
        expect(results[0].maxIterate.iterateN).toBeCloseTo(0, 4)
        expect(results[0].maxIterate.iterateN_1).toBeCloseTo(0.035, 4)

        expect(results[0].minIterates.size).toEqual(2)
        expect(results[0].minIterates.has("test1")).toBe(true)
        expect(results[0].minIterates.get("test1")!.time).toBeCloseTo(0, 4)
        expect(results[0].minIterates.get("test1")!.iterateN).toBeCloseTo(0, 4)
        expect(results[0].minIterates.get("test1")!.iterateN_1).toBeCloseTo(0.015, 4)

        expect(results[0].minIterates.has("test2")).toBe(true)
        expect(results[0].minIterates.get("test2")!.time).toBeCloseTo(0, 4)
        expect(results[0].minIterates.get("test2")!.iterateN).toBeCloseTo(0, 4)
        expect(results[0].minIterates.get("test2")!.iterateN_1).toBeCloseTo(0.035, 4)

        expect(results[0].maxIterates.size).toEqual(2)
        expect(results[0].maxIterates.has("test1")).toBe(true)
        expect(results[0].maxIterates.get("test1")!.time).toEqual(0)
        expect(results[0].maxIterates.get("test1")!.iterateN).toBeCloseTo(0, 4)
        expect(results[0].maxIterates.get("test1")!.iterateN_1).toBeCloseTo(0.015, 4)

        expect(results[0].maxIterates.has("test2")).toBe(true)
        expect(results[0].maxIterates.get("test2")!.time).toEqual(0)
        expect(results[0].maxIterates.get("test2")!.iterateN).toBeCloseTo(0, 4)
        expect(results[0].maxIterates.get("test2")!.iterateN_1).toBeCloseTo(0.035, 4)

        // check that the accumulator "newPoints" holds the previous "newPoints" for the iterate
        expect(results[0].newPoints.has("test1")).toBe(true)
        expect(results[0].newPoints.get("test1")).toHaveLength(1)
        expect(results[0].newPoints.get("test1")![0].time).toEqual(0)
        expect(results[0].newPoints.get("test1")![0].iterateN).toEqual(0)
        expect(results[0].newPoints.get("test1")![0].iterateN_1).toBeCloseTo(0.015, 4)

        expect(results[0].newPoints.has("test2")).toBe(true)
        expect(results[0].newPoints.get("test2")).toHaveLength(1)
        expect(results[0].newPoints.get("test2")![0].time).toEqual(0)
        expect(results[0].newPoints.get("test2")![0].iterateN).toEqual(0)
        expect(results[0].newPoints.get("test2")![0].iterateN_1).toBeCloseTo(0.035, 4)

        //
        // check the last iterate datum
        expect(results[4].minIterate.time).toEqual(8)
        expect(results[4].minIterate.iterateN).toEqual(0)
        expect(results[4].minIterate.iterateN_1).toBeCloseTo(0.015, 4)

        expect(results[4].maxIterate.time).toEqual(5)
        expect(results[4].maxIterate.iterateN).toBeCloseTo(0.175, 4)
        expect(results[4].maxIterate.iterateN_1).toBeCloseTo(0.175, 4)

        expect(results[4].minIterates.size).toEqual(2)
        expect(results[4].minIterates.has("test1")).toBe(true)
        expect(results[4].minIterates.get("test1")!.time).toEqual(8)
        expect(results[4].minIterates.get("test1")!.iterateN).toEqual(0)
        expect(results[4].minIterates.get("test1")!.iterateN_1).toBeCloseTo(0.015, 4)

        expect(results[4].minIterates.has("test2")).toBe(true)
        expect(results[4].minIterates.get("test2")!.time).toEqual(8)
        expect(results[4].minIterates.get("test2")!.iterateN).toEqual(0)
        expect(results[4].minIterates.get("test2")!.iterateN_1).toBeCloseTo(0.035, 4)

        expect(results[4].maxIterates.size).toEqual(2)
        expect(results[4].maxIterates.has("test1")).toBe(true)
        expect(results[4].maxIterates.get("test1")!.time).toEqual(5)
        expect(results[4].maxIterates.get("test1")!.iterateN).toBeCloseTo(0.075, 4)
        expect(results[4].maxIterates.get("test1")!.iterateN_1).toBeCloseTo(0.075, 4)

        expect(results[4].maxIterates.has("test2")).toBe(true)
        expect(results[4].maxIterates.get("test2")!.time).toEqual(5)
        expect(results[4].maxIterates.get("test2")!.iterateN).toBeCloseTo(0.175, 4)
        expect(results[4].maxIterates.get("test2")!.iterateN_1).toBeCloseTo(0.175, 4)

        // check that the accumulator "newPoints" holds the previous "newPoints" for the iterate
        expect(results[4].newPoints.has("test1")).toBe(true)
        expect(results[4].newPoints.get("test1")).toHaveLength(2)
        expect(results[4].newPoints.get("test1")![1].time).toEqual(8)
        expect(results[4].newPoints.get("test1")![1].iterateN).toBeCloseTo(0.03, 4)
        expect(results[4].newPoints.get("test1")![1].iterateN_1).toBeCloseTo(0.015, 4)

        expect(results[4].newPoints.has("test2")).toBe(true)
        expect(results[4].newPoints.get("test2")).toHaveLength(2)
        expect(results[4].newPoints.get("test2")![1].time).toEqual(8)
        expect(results[4].newPoints.get("test2")![1].iterateN).toBeCloseTo(0.07, 4)
        expect(results[4].newPoints.get("test2")![1].iterateN_1).toBeCloseTo(0.035, 4)
    });
})