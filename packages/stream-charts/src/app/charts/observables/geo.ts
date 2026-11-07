import type {ChartData} from "./ChartData";
import type {GeoDatum} from "../series/geoSeries";

/**
 * A chunk of sensor events, as a geo chart's data generator emits it
 * @template P The type of the events' payload
 */
export interface GeoChartData<P> extends ChartData {
    /**
     * The new events, by the name of their series (`map(series_name -> array(geo_datum))`), each
     * series' events ordered by time
     */
    newPoints: Map<string, Array<GeoDatum<P>>>
}

/**
 * Creates a chunk of geo chart data from new events, by series
 * @param newPoints The new events, by the name of their series
 * @return The geo chart data (its series names are the keys of the new events)
 * @template P The type of the events' payload
 */
export function geoChartDataOf<P>(newPoints: Map<string, Array<GeoDatum<P>>>): GeoChartData<P> {
    return {seriesNames: new Set(newPoints.keys()), newPoints}
}

/**
 * @param data A chunk of geo chart data
 * @return The time of the chunk's latest event, or `-Infinity` when it has no events
 * @template P The type of the events' payload
 */
export function geoChartDataLatestTime<P>(data: GeoChartData<P>): number {
    let latest = -Infinity
    data.newPoints.forEach(points => points.forEach(point => {
        if (point.time > latest) latest = point.time
    }))
    return latest
}
