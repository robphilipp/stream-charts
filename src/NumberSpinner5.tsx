import * as React from 'react';
import {useEffect, useRef} from 'react';
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
    timeWindow: number;
    seriesList: Array<Series>;
    seriesHeight?: number;
    plotWidth?: number;
    spikesMargin?: number;
}

function calcMaxTime(seriesList: Array<Series>): number {
    return d3.max(seriesList.map(series => series.last().map(datum => datum.time).getOrElse(0))) || 0;
}

function nextDatum(time: number, maxDelta: number): Datum {
    return {
        time: time + Math.ceil(Math.random() * maxDelta),
        value: Math.random()
    };
}

function NumberSpinner5(props: Props): JSX.Element {
    const {seriesList, timeWindow, seriesHeight = 20, plotWidth = 500, spikesMargin = 2} = props;

    const d3ContainerRef = useRef(null);
    const intervalRef = useRef<NodeJS.Timeout>();
    const seriesRef = useRef<Array<Series>>(seriesList);

    // called on mount to set up the <g> elements into which to render
    useEffect(
        () => {
            // set up the svg containers for each series
            const mainG = d3
                .select(d3ContainerRef.current)
                .append('g');

            // create a container for each spike series
            seriesList.forEach((series, index) => {
                mainG
                    .append('g')
                    .attr('class', series.name)
                    // .attr("transform", () => `translate(0, ${index * seriesHeight})`)
                ;
            });

            // on mount, sets the timer that updates the data and sets the live data which causes a state change
            // and so react will call the useEffect with the live data dependency and update d3
            intervalRef.current = setInterval(
                () => {
                    const maxTime = calcMaxTime(seriesRef.current);

                    // update all the series and return the latest times
                    const newTimes = seriesRef.current.map(series => {
                        // create the next data point
                        const datum = nextDatum(maxTime, 10);

                        // drop any values that have fallen out of the beginning of the time window
                        while (series.data.length > 0 && series.data[0].time < datum.time - timeWindow) {
                            series.data.shift();
                        }

                        // add the new data point
                        series.data.push(datum);

                        return datum.time;
                    });

                    // calculate the mapping between the times in the data (domain) and the display
                    // location on the screen (range)
                    const updatedMaxTime = d3.max(newTimes) || 0;
                    const x = d3.scaleLinear()
                        .domain([Math.max(0, maxTime - timeWindow), Math.max(timeWindow, updatedMaxTime)])
                        .range([0, plotWidth]);

                    const y = d3.scaleBand()
                        .domain(seriesList.map(series => series.name))
                        .range([1, seriesHeight * (seriesList.length + 1)]);

                    // select the text elements and bind the data to them
                    const svg = d3.select(d3ContainerRef.current);

                    seriesRef.current.forEach(series => {
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
                            .attr('y1', () => (y(series.name) || 0) + spikesMargin)
                            .attr('y2', () => (y(series.name) || 0) + seriesHeight - spikesMargin)
                            .attr('stroke', 'red')
                        ;

                        // update existing elements
                        container
                            .attr('x1', d => x(d.time))
                            .attr('x2', d => x(d.time))
                            .attr('y1', () => (y(series.name) || 0) + spikesMargin)
                            .attr('y2', () => (y(series.name) || 0) + seriesHeight - spikesMargin)
                            .attr('stroke', 'red')
                        ;

                        // exit old elements
                        container
                            .exit()
                            .remove()
                        ;
                    });

                    // stop running after 10 seconds
                    if (intervalRef.current && maxTime > 5000) {
                        clearInterval(intervalRef.current);
                    }
                },
                25
            );

        }, [timeWindow, seriesHeight, seriesList, plotWidth, spikesMargin]
    );

    return (
        <svg
            className="d3-component"
            width={plotWidth}
            height={seriesList.length * seriesHeight}
            ref={d3ContainerRef}
        />
    );
}

export default NumberSpinner5;
