import {Observable, Subscriber} from "rxjs";
import {Datum} from "../charts/datumSeries";

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
    return new Observable<ChartData>(function subscribe(subscriber: Subscriber<ChartData>) {
        let time = 0;

        // on mount, sets the timer that updates the data and sets the live data which causes a state change
        // and so react will call the useEffect with the live data dependency and update d3
        const intervalId = setInterval(() => {
                time = time + UPDATE_PERIOD_MS;

                // create next set of points
                const updates = new Array<Datum>(numSeries).fill({} as Datum)
                    .map((_: Datum, i: number) => ({
                        index: i,
                        datum: {
                            time: time - Math.ceil(Math.random() * UPDATE_PERIOD_MS),
                            value: Math.random() > 0.2 ? Math.random() : 0
                        }
                    }))
                ;
                subscriber.next({maxTime: time, newPoints: updates});
            },
            UPDATE_PERIOD_MS
        );

        return function unsubscribe() {
            clearInterval(intervalId);
        }
    });
}
