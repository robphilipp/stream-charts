import {default as React, useEffect, useRef} from "react";
import * as d3 from "d3";
import {Series} from "./RasterChartDriver";

export interface Margins {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

interface Props {
    width: number;
    height: number;
    plotMargins?: Margins;
    spikesMargin?: number;
    timeWindow: number;
    seriesList: Array<Series>;
}

export function calcMaxTime(seriesList: Array<Series>): number {
    return d3.max(seriesList.map(series => series.last().map(datum => datum.time).getOrElse(0))) || 0;
}

function adjustedDimensions(width:  number, height: number, margins: Margins): {width: number, height: number} {
    return {
        width: width - margins.left - margins.right,
        height: height - margins.top - margins.top
    };
}

function RasterChart(props: Props): JSX.Element {
    const {
        seriesList,
        timeWindow,
        width,
        height,
        plotMargins = {top: 30, right: 20, bottom: 30, left: 50},
        spikesMargin = 2
    } = props;

    const plotDimensions = adjustedDimensions(width, height, plotMargins);

    const d3ContainerRef = useRef(null);
    const d3AxesRef = useRef<{x: d3.Axis<number>, y: d3.Axis<string>, xAxisElement: any, yAxisElement: any}>();

    // called when:
    // 1. component mounts to set up the main <g> element and a <g> element for each series
    //    into which d3 renders the series
    // 2. series data changes
    // 3. time-window changes
    // 4. plot attributes change
    useEffect(
        () => {
            if (d3ContainerRef.current) {

                // create or grab the main <g> container for svg and translate it based on the margins
                const mainG = d3.select(d3ContainerRef.current)
                    .attr('width', width)
                    .attr('height', height)
                    .append('g')
                    // .attr('transform', `translate(${plotMargins.left}, ${plotMargins.top})`)
                ;

                // create a container for each spike series
                seriesList.forEach(series => mainG
                    .append('g')
                    .attr('class', series.name)
                    .attr('transform', `translate(${plotMargins.left}, 0)`)
                );

                // calculate the mapping between the times in the data (domain) and the display
                // location on the screen (range)
                // const maxTime: number = d3.max(seriesList.map(series => series.last().map(datum => datum.time).getOrElse(0))) || 0;
                const maxTime = calcMaxTime(seriesList);
                const x = d3.scaleLinear()
                    .domain([Math.max(0, maxTime - timeWindow), Math.max(timeWindow, maxTime)])
                    .range([0, plotDimensions.width]);
                    // .range([0, width]);

                // const lineHeight = height / seriesList.length;
                const lineHeight = plotDimensions.height / seriesList.length;
                const y = d3.scaleBand()
                    .domain(seriesList.map(series => series.name))
                    .range([0, lineHeight * (seriesList.length)]);

                // select the text elements and bind the data to them
                const svg = d3.select(d3ContainerRef.current);

                // the axes
                if(!d3AxesRef.current) {
                    const xAxis = d3.axisBottom(x) as d3.Axis<number>;
                    const yAxis = d3.axisLeft(y);
                    const xAxisElem = svg
                        .append('g')
                        .attr('class', 'x-axis')
                        .attr('transform', `translate(${plotMargins.left}, ${plotDimensions.height})`)
                        .call(xAxis);

                    const yAxisElem = svg
                        .append('g')
                        .attr('class', 'y-axis')
                        .attr('transform', `translate(${plotMargins.left}, 0)`)
                        .call(yAxis);

                    d3AxesRef.current = {
                        x: xAxis,
                        y: yAxis,
                        xAxisElement: xAxisElem,
                        yAxisElement: yAxisElem
                    };
                }
                else {
                    // d3AxesRef.current = {x: d3.axisBottom(x), y: d3.axisLeft(y), ...d3AxesRef.current};
                    d3AxesRef.current.xAxisElement.call(d3.axisBottom(x));
                    d3AxesRef.current.yAxisElement.call(d3.axisLeft(y));
                }

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
                        .attr('y1', () => (y(series.name) || 0) + spikesMargin)
                        .attr('y2', () => (y(series.name) || 0) + lineHeight - spikesMargin)
                        .attr('stroke', 'red')
                    ;

                    // update existing elements
                    container
                        .attr('x1', d => x(d.time))
                        .attr('x2', d => x(d.time))
                        .attr('y1', () => (y(series.name) || 0) + spikesMargin)
                        .attr('y2', () => (y(series.name) || 0) + lineHeight - spikesMargin)
                        .attr('stroke', 'red')
                    ;

                    // exit old elements
                    container
                        .exit()
                        .remove()
                    ;
                });

                // if(d3AxesRef.current) {
                //     d3AxesRef.current.xAxisElement.call(d3AxesRef.current.x);
                //     d3AxesRef.current.yAxisElement.call(d3AxesRef.current.y);
                // }

                    // const xAxisElem = svg
                //     .append('g')
                //     .attr('class', 'x-axis');
                //
                //     xAxisElem//.enter()
                //     .attr('transform', `translate(0, ${plotDimensions.height})`)
                //     // @ts-ignore
                //     .call(xAxis);
                //
                // const yAxisElem = svg
                //     .select('g.y-axis')
                //     // .attr('class', 'y-axis')
                //     // @ts-ignore
                //     .call(yAxis);
                // const xAxisElem = svg
                //     .append('g')
                //     .attr('class', 'x-axis')
                //     .attr('transform', `translate(0, ${plotDimensions.height})`)
                //     .call(xAxis);
                //
                // const yAxisElem = svg
                //     .append('g')
                //     .attr('class', 'y-axis')
                //     .call(yAxis);


                // const xAxisElement = svg.select('g.xAxis');
                //
                // xAxisElement
                //     .enter()
                //     // .append('g')
                //     // .attr('class', 'x-axis')
                //     .attr('transform', `translate(0, ${plotDimensions.height})`)
                //     .call(xAxis);
                //
                // xAxisElement.call(xAxis);
                //
                // xAxisElement.exit().remove();
                //
                // svg.append('g').attr('class', 'y-axis').call(yAxis);
            }
        },
        [seriesList, timeWindow, width, height, spikesMargin]
    );

    return (
        <svg
            className="d3-component"
            width={width}
            height={height * seriesList.length}
            ref={d3ContainerRef}
        />
    );
}

export default RasterChart;