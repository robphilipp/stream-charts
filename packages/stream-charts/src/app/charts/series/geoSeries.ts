import {type BaseSeries, DEFAULT_COMPACTING_SIZE, seriesFrom} from "./baseSeries";
import type {FastShiftArray} from "fast-shift-array";

/**
 * A sensor event at a place on the earth: which sensor reported it, where, when, and what it
 * reported (its payload)
 * @template P The type of the payload (whatever the sensor reports, e.g. `{magnitude: number, status: string}`)
 */
export interface GeoDatum<P> {
    /**
     * The ID of the sensor that reported the event
     */
    readonly sensorId: string
    /**
     * The latitude (degrees, -90 to 90) of the event
     */
    readonly latitude: number
    /**
     * The longitude (degrees, -180 to 180) of the event
     */
    readonly longitude: number
    /**
     * The time of the event (ms, on the same clock as the rest of the chart's data)
     */
    readonly time: number
    /**
     * Everything else the sensor reported about the event
     */
    readonly payload: P
}

/**
 * Creates a geo datum
 * @param sensorId The ID of the sensor that reported the event
 * @param latitude The latitude (degrees, -90 to 90)
 * @param longitude The longitude (degrees, -180 to 180)
 * @param time The time of the event (ms)
 * @param payload Everything else the sensor reported about the event
 * @return The geo datum
 * @template P The type of the payload
 */
export function geoDatumOf<P>(sensorId: string, latitude: number, longitude: number, time: number, payload: P): GeoDatum<P> {
    return {sensorId, latitude, longitude, time, payload}
}

/**
 * A series of sensor events, ordered by time. A series is a group of sensors (e.g. "seismic" or
 * "weather"), which shares a style and a legend entry; each event's `sensorId` says which sensor in
 * the group reported it.
 * @template P The type of the events' payload
 */
export type GeoSeries<P> = BaseSeries<GeoDatum<P>>

/**
 * Creates a series of sensor events
 * @param name The name of the series (unique within a chart)
 * @param data The series' events, ordered by time
 * @param compactingSize How many events may be dropped from the front before the backing array is
 * compacted (see {@link seriesFrom})
 * @return The series
 * @template P The type of the events' payload
 */
export function geoSeriesFrom<P>(
    name: string,
    data: Array<GeoDatum<P>> | FastShiftArray<GeoDatum<P>> = [],
    compactingSize: number = DEFAULT_COMPACTING_SIZE
): GeoSeries<P> {
    return seriesFrom<GeoDatum<P>>(name, data, compactingSize)
}
