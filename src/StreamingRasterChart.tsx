import * as React from 'react';
import {useEffect, useRef, useState} from 'react';
import {Option} from "prelude-ts";
import RasterChart, {Datum, Series} from "./RasterChart";
import {Observable} from 'rxjs'

/**
 * Creates a series from the name and the optional array of `Datum`.
 * @param {string} name The name of the series (i.e. neuron)
 * @param {Datum[]} data The array of (time, value) pairs, where the value is the spike value (in mV)
 * @return {Series} A `Series` for object that can be used by the `RasterChart`
 */
export function seriesFrom(name: string, data: Datum[] = []): Series {
    return {
        name: name,
        data: data,
        last: () => data ? (data.length > 0 ? Option.of(data[data.length - 1]) : Option.none()) : Option.none(),
        length: () => data ? data.length : 0
    }
}

const UPDATE_PERIOD_MS = 25;

/**
 * Creates random spiking data
 * @param {number} numSeries The number of time-series for which to generate data (i.e. one for each neuron)
 * @return {Observable<SpikesChartData>} An observable that produces data.
 */
function randomDataObservable(numSeries: number): Observable<SpikesChartData> {
    return new Observable(function subscribe(subscriber) {
        let time = 0;

        // on mount, sets the timer that updates the data and sets the live data which causes a state change
        // and so react will call the useEffect with the live data dependency and update d3
        const intervalId = setInterval(() => {
                time = time + UPDATE_PERIOD_MS;

                // create next set of points
                const updates = new Array<Datum>(numSeries).fill({} as Datum)
                    .map((_: Datum, i: number) => ({
                        index: i,
                        spike: {
                            time: time - Math.ceil(Math.random() * UPDATE_PERIOD_MS),
                            value: Math.random() > 0.2 ? Math.random() : 0
                        }
                    }))
                ;
                subscriber.next({maxTime: time, spikes: updates});
            },
            UPDATE_PERIOD_MS
        );

        return function unsubscribe() {
            clearInterval(intervalId);
        }
    });
}

/**
 * The properties
 */
interface Props {
    timeWindow?: number;
    seriesList: Array<Series>;
    seriesHeight?: number;
    plotWidth?: number;
}

/**
 * The spike-chart data produced by the rxjs observable that is pushed to the `RasterChart`
 */
export interface SpikesChartData {
    maxTime: number;
    spikes: Array<{index: number; spike: Datum}>
}

/**
 * An example wrapper to the `RasterChart` that accepts an rxjs observable stream of data and updates the
 * `RasterChart` with the new data.
 * @param {Props} props The properties passed down from the parent
 * @return {JSX.Element} The streaming raster chart
 * @constructor
 */
function StreamingRasterChart(props: Props): JSX.Element {
    const {seriesList, timeWindow = 100, seriesHeight = 20, plotWidth = 500} = props;

    const [liveData, setLiveData] = useState(seriesList);
    const seriesRef = useRef<Array<Series>>(seriesList);
    const currentTimeRef = useRef<number>(0);

    const observableRef = useRef(randomDataObservable(seriesList.length));

    const [tooltipVisible, setTooltipVisible] = useState(false);
    const [magnifierVisible, setMagnifierVisible] = useState(false);
    const [trackerVisible, setTrackerVisible] = useState(false);

    // called on mount to set up the <g> element into which to render
    useEffect(
        () => {
            const subscription = observableRef.current.subscribe(data => {
                if(data.maxTime > 3000) {
                    subscription.unsubscribe();
                }
                else {
                    // updated the current time to be the max of the new data
                    currentTimeRef.current = data.maxTime;

                    // for each series, add a point if there is a  spike value (i.e. spike value > 0)
                    seriesRef.current = seriesRef.current.map((series, i) => {
                        if(data.spikes[i].spike.value > 0) {
                            series.data.push(data.spikes[i].spike);
                        }
                        return series;
                    });

                    // update the data
                    setLiveData(seriesRef.current);
                }
            });

            // stop the stream on dismount
            return () => subscription.unsubscribe();
        }, [timeWindow]
    );

    return (
        <div>
            <p>
                <label>tooltip <input type="checkbox" checked={tooltipVisible}
                                      onChange={() => setTooltipVisible(!tooltipVisible)}/></label>&nbsp;&nbsp;
                <label>magnifier <input type="checkbox" checked={magnifierVisible} onChange={() => {
                    setMagnifierVisible(!magnifierVisible);
                    if (trackerVisible) setTrackerVisible(false);
                }}/></label>&nbsp;&nbsp;
                <label>tracker <input type="checkbox" checked={trackerVisible} onChange={() => {
                    setTrackerVisible(!trackerVisible);
                    if (magnifierVisible) setMagnifierVisible(false);
                }}/></label>
            </p>
            <RasterChart
                width={plotWidth}
                height={seriesList.length * seriesHeight + 30 + 30}
                seriesList={liveData}
                minTime={Math.max(0, currentTimeRef.current - timeWindow)}
                maxTime={Math.max(currentTimeRef.current, timeWindow)}
                margin={{top: 30, right: 20, bottom: 30, left: 75}}
                tooltip={{visible: tooltipVisible}}
                magnifier={{visible: magnifierVisible}}
                tracker={{visible: trackerVisible}}
            />
        </div>
    );
}

export default StreamingRasterChart;
