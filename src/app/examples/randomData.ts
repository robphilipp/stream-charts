import {interval, Observable, Subscriber} from "rxjs";
import {Datum} from "../charts/datumSeries";
import {map} from "rxjs/operators";

const UPDATE_PERIOD_MS = 25;

/**
 * The spike-chart data produced by the rxjs observable that is pushed to the `RasterChart`
 */
export interface ChartData {
    maxTime: number;
    newPoints: Array<IndexedDatum>
}

interface IndexedDatum {
    index: number;
    datum: Datum;
}

/**
 * Creates random spiking data
 * @param {number} numSeries The number of time-series for which to generate data (i.e. one for each neuron)
 * @param {number} [updatePeriod=25] The time-interval between data points
 * @return {Observable<SpikesChartData>} An observable that produces data.
 */
export function randomDataObservable(numSeries: number, updatePeriod: number = UPDATE_PERIOD_MS): Observable<ChartData> {
    return interval(updatePeriod).pipe(
        map((time, index) => (
            {
                maxTime: time * updatePeriod,
                newPoints: new Array<Datum>(numSeries).fill({} as Datum)
                    .map((_: Datum, i: number) => ({
                        index: i,
                        datum: {
                            time: time * updatePeriod - Math.ceil(Math.random() * updatePeriod),
                            value: Math.random() > 0.2 ? Math.random() : 0
                        }
                    }))
            })),
    );
}
