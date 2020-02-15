import * as React from 'react';
import {useEffect, useRef, useState} from 'react';
import * as d3 from "d3";
import {Option} from "prelude-ts";

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

interface PlotProps {
    width: number;
    height: number;
    spikesMargin?: number;
    timeWindow: number;
    seriesList: Array<Series>;
}

const defaultData: Array<Series> = [
    seriesFrom('neuron-1', [{time: 1, value: 1}, {time: 2, value: 2}, {time: 3, value: 3}]),
    seriesFrom('neuron-2', [{time: 1, value: 1}, {time: 2, value: 2}, {time: 3, value: 3}]),
];
// const itemsPerRow = 75;
// const itemWidth = 13;
// const itemHeight = 10;

function calcMaxTime(seriesList: Array<Series>): number {
    return d3.max(seriesList.map(series => series.last().map(datum => datum.time).getOrElse(0))) || 0;
}

function NumberSpinnerDriver3(props: Props): JSX.Element {
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
                    seriesRef.current = seriesRef.current.map(series => {
                        // const size = series.data.length;
                        const datum = nextDatum(maxTime, 10);
                        // const datum = nextDatum(series.data[size - 1].time, 10);
                        while (series.data.length > 0 && series.data[0].time < datum.time - timeWindow) {
                            series.data.shift();
                        }
                        series.data.push(datum);
                        return series;
                    });

                    // dataRef.current = dataRef.current.slice();
                    setLiveData(seriesRef.current);

                    // count.current += 1;
                    // const maxTime = d3.max(Array.from(seriesRef.current.values()).map(series => series.data[series.data.length - 1].time)) || 0;
                    if (intervalRef.current && maxTime > 10000) {
                        clearInterval(intervalRef.current);
                    }
                },
                25
            );
        }, [timeWindow]
    );

    return (
        <div>
            <NumberSpinner width={plotWidth} height={seriesList.length * seriesHeight} seriesList={liveData} timeWindow={timeWindow}/>
        </div>
    );
}

function NumberSpinner(props: PlotProps): JSX.Element {
    const {seriesList, timeWindow, width, height, spikesMargin = 2} = props;

    const d3ContainerRef = useRef(null);

    // called on mount to set up the <g> element into which to render
    useEffect(
        () => {
            if (d3ContainerRef.current) {
                const mainG = d3
                    .select(d3ContainerRef.current)
                    .append('g');

                // create a container for each spike series
                seriesList.forEach((series, index) => {
                    mainG
                        .append('g')
                        .attr('class', series.name)
                        .attr("transform", () => `translate(0, ${index * height / seriesList.length})`)
                    ;
                });
            }
        }, [seriesList, height]
    );

    // called on mount, and also when the liveData state variable is updated
    useEffect(
        () => {
            if (d3ContainerRef.current) {
                // calculate the mapping between the times in the data (domain) and the display
                // location on the screen (range)
                // const maxTime: number = d3.max(seriesList.map(series => series.last().map(datum => datum.time).getOrElse(0))) || 0;
                const maxTime = calcMaxTime(seriesList);
                const x = d3.scaleLinear()
                    .domain([Math.max(0, maxTime - timeWindow), Math.max(timeWindow, maxTime)])
                    .range([0, width]);

                // const y = d3.scaleLinear()
                //     .domain([0, seriesList.length])
                //     .range([height, 0]);

                // select the text elements and bind the data to them
                const svg = d3.select(d3ContainerRef.current);

                seriesList.forEach(series => {
                    const container = svg
                        .select(`g.${series.name}`)
                        .selectAll('line')
                        .data(series.data)
                    ;

                    // enter new elements
                    container
                        .enter()
                        .append('line')
                        .attr('x1', d => x(d.time))
                        .attr('x2', d => x(d.time))
                        .attr('y1', () => spikesMargin)
                        .attr('y2', () => height / seriesList.length - spikesMargin)
                        .attr('stroke', 'red')
                    ;

                    // update existing elements
                    container
                        .attr('x1', d => x(d.time))
                        .attr('x2', d => x(d.time))
                        .attr('y1', () => spikesMargin)
                        .attr('y2', () => height / seriesList.length - spikesMargin)
                        .attr('stroke', 'red')
                    ;

                    // exit old elements
                    container
                        .exit()
                        .remove()
                    ;
                });
           }
        },
        [seriesList, timeWindow, width, height, spikesMargin]
    );

    return (
        <svg
            className="d3-component"
            width={width}
            height={height}
            ref={d3ContainerRef}
        />
    );
}

export default NumberSpinnerDriver3;
