import {default as React, useEffect, useRef, useState} from "react";
import {Datum, Series} from "../charts/datumSeries";
import {Option} from "prelude-ts";
import ScatterChart from "../charts/ScatterChart";
import {ChartData} from "./randomData";
import {interval, Observable} from "rxjs";
import {map} from "rxjs/operators";

// interface Point {
//     x: number;
//     y: number;
// }
//
// function genData(length: number, delta: number): Array<Point> {
//     return Array
//         .from({length: length}, () => ({x: 0, y: Math.random() * delta}))
//         .map((datum, index, array) =>
//             ({x: index, y: array[Math.max(0, index - 1)].y + datum.y})
//         );
// }


/**
 * Creates random set of time-series data
 * @param {number} numSeries The number of time-series for which to generate data (i.e. one for each neuron)
 * @param {number} delta The max change in weight
 * @param {number} [updatePeriod=25] The time-interval between the generation of subsequent data points
 * @return {Observable<SpikesChartData>} An observable that produces data.
 */
export function randomWeightDataObservable(numSeries: number, delta: number, updatePeriod: number = 25): Observable<ChartData> {
    return interval(updatePeriod).pipe(
        // convert the number sequence to a time
        map(sequence => (sequence + 1) * updatePeriod),
        // from the time, create a random set of new data points
        map((time, index) => ({
                maxTime: time,
                newPoints: Array
                    .from({length: numSeries}, () => ({time: 0, value: Math.random() * delta}))
                    .map((_: Datum, i: number) => ({
                        index: i,
                        datum: {
                            time: time - Math.ceil(Math.random() * updatePeriod),
                            value: (Math.random() - 0.5) * 2 * delta
                        }
                    }))
            })
        )
    );
}

/**
 * The properties
 */
interface Props {
    timeWindow?: number;
    seriesList: Array<Series>;
    plotHeight?: number;
    plotWidth?: number;
}

export function StreamingScatterChart(props: Props): JSX.Element {
    const {seriesList, timeWindow = 100, plotHeight = 20, plotWidth = 500} = props;

    const [liveData, setLiveData] = useState(seriesList);
    const seriesRef = useRef<Array<Series>>(seriesList);
    const currentTimeRef = useRef<number>(0);

    const observableRef = useRef(randomWeightDataObservable(seriesList.length, 0.1));

    const [tooltipVisible, setTooltipVisible] = useState(false);
    const [magnifierVisible, setMagnifierVisible] = useState(false);
    const [trackerVisible, setTrackerVisible] = useState(false);

    // called on mount to set up the <g> element into which to render
    useEffect(
        () => {
            const subscription = observableRef.current.subscribe(data => {
                if(data.maxTime > 30000) {
                    subscription.unsubscribe();
                }
                else {
                    // updated the current time to be the max of the new data
                    currentTimeRef.current = data.maxTime;

                    // for each series, add a point if there is a  spike value (i.e. spike value > 0)
                    seriesRef.current = seriesRef.current.map((series, i) => {
                        const newValue = (series.data.length > 0 ? series.data[series.data.length-1].value : 0) +
                            data.newPoints[i].datum.value;

                        const newPoint = {time: data.newPoints[i].datum.time, value: newValue};
                        series.data.push(newPoint);
                        console.log(newPoint);
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
                                      onChange={() => setTooltipVisible(!tooltipVisible)}/>
                </label>&nbsp;&nbsp;
                <label>magnifier <input type="checkbox" checked={magnifierVisible} onChange={() => {
                    setMagnifierVisible(!magnifierVisible);
                    if (trackerVisible) setTrackerVisible(false);
                }}/></label>&nbsp;&nbsp;
                <label>tracker <input type="checkbox" checked={trackerVisible} onChange={() => {
                    setTrackerVisible(!trackerVisible);
                    if (magnifierVisible) setMagnifierVisible(false);
                }}/></label>
            </p>
            <ScatterChart
                width={plotWidth}
                height={plotHeight}
                seriesList={liveData}
                minTime={Math.max(0, currentTimeRef.current - timeWindow)}
                maxTime={Math.max(currentTimeRef.current, timeWindow)}
                margin={{top: 30, right: 20, bottom: 30, left: 75}}
                // tooltip={{visible: tooltipVisible}}
                // magnifier={{visible: magnifierVisible}}
                // tracker={{visible: trackerVisible}}
            />
        </div>
    );
}