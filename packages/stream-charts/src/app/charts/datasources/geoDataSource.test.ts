import {Subject} from "rxjs";
import {GeoDataSource} from "./geoDataSource";
import {type GeoChartData, geoChartDataLatestTime, geoChartDataOf} from "../observables/geo";
import {type GeoDatum, geoDatumOf, geoSeriesFrom} from "../series/geoSeries";

type Reading = { magnitude: number }

const event = (sensorId: string, time: number, magnitude: number = 1): GeoDatum<Reading> =>
    geoDatumOf(sensorId, 10, 20, time, {magnitude})

/**
 * A started geo data source whose generator's emissions the test controls
 * @param dropDataAfter The data source's `dropDataAfter`
 * @param onUpdateData The data source's `onUpdateData`
 * @return The data source, and the subject to emit chunks of events through
 */
function startedSource(
    dropDataAfter?: number,
    onUpdateData?: (seriesName: string, data: Array<GeoDatum<Reading>>) => void
): {dataSource: GeoDataSource<Reading>, emit: (data: GeoChartData<Reading>) => void} {
    const subject = new Subject<GeoChartData<Reading>>()
    const dataSource = new GeoDataSource<Reading>({
        initialData: [geoSeriesFrom<Reading>('seismic', [])],
        generator: () => subject.asObservable(),
        dropDataAfter,
        onUpdateData,
    })
    dataSource.start()
    return {dataSource, emit: data => subject.next(data)}
}

describe('geo chart data', () => {
    it('names its series after its new events\' keys', () => {
        const data = geoChartDataOf(new Map([['a', [event('s1', 1)]], ['b', []]]))
        expect(data.seriesNames).toEqual(new Set(['a', 'b']))
    })

    it('gives the time of its latest event, or -Infinity when it has none', () => {
        expect(geoChartDataLatestTime(geoChartDataOf(new Map([
            ['a', [event('s1', 5), event('s1', 30)]],
            ['b', [event('s2', 12)]],
        ])))).toBe(30)
        expect(geoChartDataLatestTime(geoChartDataOf<Reading>(new Map()))).toBe(-Infinity)
    })
})

describe('GeoDataSource', () => {
    it('adds new events to their series, keeping the sensor id and payload', () => {
        const {dataSource, emit} = startedSource()
        emit(geoChartDataOf(new Map([['seismic', [event('s1', 10, 3.2), event('s2', 20, 4.1)]]])))

        const data = Array.from(dataSource.series.get('seismic')!.data)
        expect(data.map(datum => [datum.sensorId, datum.time, datum.payload.magnitude])).toEqual([
            ['s1', 10, 3.2],
            ['s2', 20, 4.1],
        ])
    })

    it('registers a series the first time it shows up', () => {
        const {dataSource, emit} = startedSource()
        emit(geoChartDataOf(new Map([['weather', [event('w1', 10)]]])))

        expect(dataSource.seriesList().map(series => series.name)).toEqual(['seismic', 'weather'])
        expect(dataSource.series.get('weather')!.length()).toBe(1)
    })

    it('reports the time of its latest event, or -Infinity when it has none', () => {
        const {dataSource, emit} = startedSource()
        expect(dataSource.latestTime()).toBe(-Infinity)

        emit(geoChartDataOf(new Map([['seismic', [event('s1', 10)]], ['weather', [event('w1', 25)]]])))
        expect(dataSource.latestTime()).toBe(25)
    })

    it('drops events older than dropDataAfter from every series, including quiet ones', () => {
        const {dataSource, emit} = startedSource(100)
        emit(geoChartDataOf(new Map([['seismic', [event('s1', 0), event('s1', 50)]], ['weather', [event('w1', 10)]]])))
        // only the weather series gets new events, but the seismic series ages out too
        emit(geoChartDataOf(new Map([['weather', [event('w1', 140)]]])))

        expect(Array.from(dataSource.series.get('seismic')!.data).map(datum => datum.time)).toEqual([50])
        expect(Array.from(dataSource.series.get('weather')!.data).map(datum => datum.time)).toEqual([140])
    })

    it('keeps everything when dropDataAfter is not set', () => {
        const {dataSource, emit} = startedSource()
        emit(geoChartDataOf(new Map([['seismic', [event('s1', 0)]]])))
        emit(geoChartDataOf(new Map([['seismic', [event('s1', 1_000_000)]]])))
        expect(dataSource.series.get('seismic')!.length()).toBe(2)
    })

    it('applies a changed dropDataAfter as the next events arrive', () => {
        const {dataSource, emit} = startedSource(1000)
        emit(geoChartDataOf(new Map([['seismic', [event('s1', 0), event('s1', 500)]]])))
        dataSource.setDropDataAfter(100)
        emit(geoChartDataOf(new Map([['seismic', [event('s1', 550)]]])))
        expect(Array.from(dataSource.series.get('seismic')!.data).map(datum => datum.time)).toEqual([500, 550])
    })

    it('hands each series\' new events to onUpdateData', () => {
        const updates: Array<[string, number]> = []
        const {emit} = startedSource(undefined, (name, data) => updates.push([name, data.length]))
        emit(geoChartDataOf(new Map([['seismic', [event('s1', 1), event('s1', 2)]], ['weather', [event('w1', 3)]]])))
        expect(updates).toEqual([['seismic', 2], ['weather', 1]])
    })
})
