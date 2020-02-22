import * as React from 'react';
import {useEffect, useRef, useState} from 'react';
import {Option} from "prelude-ts";
import RasterChart, {calcMaxTime} from "./RasterChart";

export interface Datum {
    readonly time: number;
    readonly value: number;
}

export interface Series {
    readonly name: string;
    data: Datum[];
    readonly last: () => Option<Datum>;
    readonly length: () => number;
}

export function seriesFrom(name: string, data: Datum[]): Series {
    return {
        name: name,
        data: data,
        last: () => data ? (data.length > 0 ? Option.of(data[data.length - 1]) : Option.none()) : Option.none(),
        length: () => data ? data.length : 0
    }
}

interface Props {
    timeWindow?: number;
    seriesList?: Array<Series>;
    seriesHeight?: number;
    plotWidth?: number;
}

const defaultData: Array<Series> = [
    seriesFrom('neuron-1', [{time: 1, value: 1}, {time: 2, value: 2}, {time: 3, value: 3}]),
    seriesFrom('neuron-2', [{time: 1, value: 1}, {time: 2, value: 2}, {time: 3, value: 3}]),
];

function RasterChartDriver(props: Props): JSX.Element {
    const {seriesList = defaultData, timeWindow = 100, seriesHeight = 20, plotWidth = 500} = props;

    // const count = useRef<number>(0);
    const intervalRef = useRef<NodeJS.Timeout>();

    const [liveData, setLiveData] = useState(seriesList);
    const seriesRef = useRef<Array<Series>>(seriesList);

    function nextDatum(time: number, maxDelta: number): Datum {
        return {
            time: time + Math.ceil(Math.random() * maxDelta),
            value: Math.random()
        };
    }

    // called on mount to set up the <g> element into which to render
    useEffect(
        () => {
            // on mount, sets the timer that updates the data and sets the live data which causes a state change
            // and so react will call the useEffect with the live data dependency and update d3
            intervalRef.current = setInterval(
                () => {
                    const maxTime = calcMaxTime(seriesRef.current);

                    // update all the series
                    seriesRef.current = seriesRef.current.map(series => {
                        // create the next data point
                        const datum = nextDatum(maxTime, 10);

                        // drop any values that have fallen out of the beginning of the time window
                        while (series.data.length > 0 && series.data[0].time <= datum.time - timeWindow) {
                            series.data.shift();
                        }

                        // add the new data point
                        series.data.push(datum);

                        return series;
                    });

                    // dataRef.current = dataRef.current.slice();
                    setLiveData(seriesRef.current);

                    if (intervalRef.current && maxTime > 5000) {
                        clearInterval(intervalRef.current);
                    }
                },
                25
            );
        }, [timeWindow]
    );

    return (
        <div>
            <RasterChart
                width={plotWidth}
                height={seriesList.length * seriesHeight + 30 + 30}
                seriesList={liveData}
                timeWindow={timeWindow}
                plotMargins={{top: 30, right: 20, bottom: 30, left: 75}}
            />
        </div>
    );
}


export default RasterChartDriver;
