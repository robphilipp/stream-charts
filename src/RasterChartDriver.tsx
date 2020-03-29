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

const UPDATE_PERIOD_MS = 25;

function RasterChartDriver(props: Props): JSX.Element {
    const {seriesList = defaultData, timeWindow = 100, seriesHeight = 20, plotWidth = 500} = props;

    const intervalRef = useRef<NodeJS.Timeout>();

    const [liveData, setLiveData] = useState(seriesList);
    const seriesRef = useRef<Array<Series>>(seriesList);
    const currentTimeRef = useRef<number>(0);

    const [tooltipVisible, setTooltipVisible] = useState(false);
    const [magnifierVisible, setMagnifierVisible] = useState(false);
    const [trackerVisible, setTrackerVisible] = useState(false);

    // called on mount to set up the <g> element into which to render
    useEffect(
        () => {
            // on mount, sets the timer that updates the data and sets the live data which causes a state change
            // and so react will call the useEffect with the live data dependency and update d3
            intervalRef.current = setInterval(
                () => {
                    currentTimeRef.current += UPDATE_PERIOD_MS;

                    // update all the series
                    seriesRef.current = seriesRef.current.map(series => {
                        // add the new data point
                        series.data.push(nextDatum(currentTimeRef.current, UPDATE_PERIOD_MS));
                        return series;
                    });

                    setLiveData(seriesRef.current);

                    if (intervalRef.current && currentTimeRef.current > 3000) {
                        clearInterval(intervalRef.current);
                    }
                },
                UPDATE_PERIOD_MS
            );
        }, [timeWindow]
    );

    return (
        <div>
            <p>
                <label>tooltip <input type="checkbox" checked={tooltipVisible} onChange={() => setTooltipVisible(!tooltipVisible)}/></label>&nbsp;&nbsp;
                <label>magnifier <input type="checkbox" checked={magnifierVisible} onChange={() => {
                    setMagnifierVisible(!magnifierVisible);
                    if(trackerVisible) setTrackerVisible(false);
                }}/></label>&nbsp;&nbsp;
                <label>tracker <input type="checkbox" checked={trackerVisible} onChange={() => {
                    setTrackerVisible(!trackerVisible);
                    if(magnifierVisible) setMagnifierVisible(false);
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

function nextDatum(time: number, maxDelta: number): Datum {
    return {
        time: time - Math.ceil(Math.random() * maxDelta),
        value: Math.random()
    };
}

export default RasterChartDriver;
