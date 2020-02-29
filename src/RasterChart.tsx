import {default as React, useEffect, useRef} from "react";
import * as d3 from "d3";
import {Datum, Series} from "./RasterChartDriver";

export interface Sides {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

interface Props {
    width: number;
    height: number;
    margin?: Sides;
    spikesStyle?: {margin: number, color: string, lineWidth: number, highlightColor: string, highlightWidth: number};
    axisLabelFont?: {size: number, color: string, family: string, weight: number};
    axisStyle?: {color: string};
    backgroundColor?: string;
    plotGridLines?: {visible: boolean, color: string}

    timeWindow: number;
    seriesList: Array<Series>;
}

export function calcMaxTime(seriesList: Array<Series>): number {
    return d3.max(seriesList.map(series => series.last().map(datum => datum.time).getOrElse(0))) || 0;
}

function adjustedDimensions(width:  number, height: number, margins: Sides): {width: number, height: number} {
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
        margin = {top: 30, right: 20, bottom: 30, left: 50},
        spikesStyle = {margin: 2, color: '#c95d15', lineWidth: 2, highlightColor: '#d2933f', highlightWidth: 4},
        axisLabelFont = {size: 12, color: '#d2933f', weight: 300, family: 'sans-serif'},
        axisStyle = {color: '#d2933f'},
        backgroundColor = '#202020',
        plotGridLines = {visible: true, color: 'rgba(210,147,63,0.35)'}
    } = props;

    const plotDimensions = adjustedDimensions(width, height, margin);

    const d3ContainerRef = useRef(null);
    const d3AxesRef = useRef<{xAxisElement: any, yAxisElement: any}>();

    function handleMouseOver(d: Datum, seriesName: string, x: d3.ScaleLinear<number, number>, y: d3.ScaleBand<string>, line: SVGLineElement) {
        // Use D3 to select element, change color and size
        // @ts-ignore
        d3.select(line)
            .attr('stroke', spikesStyle.highlightColor)
            .attr('stroke-width', spikesStyle.highlightWidth)
            .attr('stroke-linecap', "round")
        ;

        d3.select(d3ContainerRef.current)
            .append('rect')
            .attr('id', `r${d.time}-${seriesName}`)
            .attr('x', () => x(d.time) - 50)
            .attr('y', () => (y(seriesName) || 0) - 5)
            .attr('rx', 5)
            .attr('width', 200)
            .attr('height', 35)
            .attr('fill', backgroundColor)
            .attr('fill-opacity', 0.8)
            .attr('stroke', axisStyle.color)
        ;

        d3.select(d3ContainerRef.current)
            .append("text")
            .attr('id', `tn${d.time}-${seriesName}`)
            .attr('x', () => x(d.time) - 30)
            .attr('y', () => (y(seriesName) || 0) + 8)
            .attr('fill', axisLabelFont.color)
            .attr('font-family', 'sans-serif')
            .attr('font-size', axisLabelFont.size)
            .attr('font-weight', 100)
            .text(function() {
                return seriesName;  // Value of the text
            });

        d3.select(d3ContainerRef.current)
            .append("text")
            .attr('id', `t${d.time}-${seriesName}`)
            .attr('x', () => x(d.time) - 30)
            .attr('y', () => (y(seriesName) || 0) + 25)
            .attr('fill', axisLabelFont.color)
            .attr('font-family', 'sans-serif')
            .attr('font-size', axisLabelFont.size + 2)
            .attr('font-weight', 350)
            .text(function() {
                return `${d.time} ms, ${d3.format(".2")(d.value)} mV`;  // Value of the text
            });
    }

    function handleMouseleave(d: Datum, seriesName: string, line: SVGLineElement) {
        // Use D3 to select element, change color and size
        d3.select(line)
            .attr('stroke', spikesStyle.color)
            .attr('stroke-width', spikesStyle.lineWidth);

        d3.select(`#t${d.time}-${seriesName}`).remove();
        d3.select(`#tn${d.time}-${seriesName}`).remove();
        d3.select(`#r${d.time}-${seriesName}`).remove();
    }

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
                    .attr('color', axisStyle.color)
                    .append('g')
                ;

                // create a container for each spike series
                seriesList.forEach(series => mainG
                    .append('g')
                    .attr('class', series.name)
                    .attr('transform', `translate(${margin.left}, ${margin.top})`)
                );

                // calculate the mapping between the times in the data (domain) and the display
                // location on the screen (range)
                const maxTime = calcMaxTime(seriesList);
                const x: d3.ScaleLinear<number, number> = d3.scaleLinear()
                    .domain([Math.max(0, maxTime - timeWindow), Math.max(timeWindow, maxTime)])
                    .range([0, plotDimensions.width]);

                // const lineHeight = height / seriesList.length;
                const lineHeight = plotDimensions.height / seriesList.length;
                const y: d3.ScaleBand<string> = d3.scaleBand()
                    .domain(seriesList.map(series => series.name))
                    .range([0, lineHeight * seriesList.length - margin.top]);

                // select the text elements and bind the data to them
                const svg = d3.select(d3ContainerRef.current);

                // create and add the axes, grid-lines, and mouse-over functions
                if(!d3AxesRef.current) {
                    const xAxis = d3.axisBottom(x) as d3.Axis<number>;
                    const yAxis = d3.axisLeft(y);
                    const xAxisElem = svg
                        .append('g')
                        .attr('class', 'x-axis')
                        .attr('transform', `translate(${margin.left}, ${plotDimensions.height})`)
                        .call(xAxis);

                    const yAxisElem = svg
                        .append('g')
                        .attr('class', 'y-axis')
                        .attr('transform', `translate(${margin.left}, ${margin.top})`)
                        .call(yAxis);

                    d3AxesRef.current = {
                        xAxisElement: xAxisElem,
                        yAxisElement: yAxisElem
                    };

                    svg.append('text')
                        .attr('text-anchor', 'middle')
                        .attr('font-size', axisLabelFont.size)
                        .attr('fill', axisLabelFont.color)
                        .attr('font-family', axisLabelFont.family)
                        .attr('font-weight', axisLabelFont.weight)
                        .attr('transform', `translate(${margin.left + plotDimensions.width / 2}, ${plotDimensions.height + margin.top + (margin.bottom / 3)})`)
                        .text("t (ms)");

                    if(plotGridLines.visible) {
                        const gridLines = svg
                            .select('g')
                            .selectAll('grid-line')
                            .data(seriesList.map(series => series.name));

                        gridLines
                            .enter()
                            .append('line')
                            .attr('x1', margin.left)
                            .attr('x2', margin.left + plotDimensions.width)
                            .attr('y1', d => (y(d) || 0) + margin.top + lineHeight / 2)
                            .attr('y2', d => (y(d) || 0) + margin.top + lineHeight / 2)
                            .attr('stroke', plotGridLines.color)
                        ;
                    }

                }
                // update the scales
                else {
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
                        .attr('y1', () => (y(series.name) || 0) + spikesStyle.margin)
                        .attr('y2', () => (y(series.name) || 0) + lineHeight - spikesStyle.margin)
                        .attr('stroke', spikesStyle.color)
                        .attr('stroke-width', spikesStyle.lineWidth)
                        .attr('stroke-linecap', "round")
                        .on("mouseover", (d, i, group) => handleMouseOver(d, series.name, x, y, group[i]))
                        .on("mouseleave", (d, i, group) => handleMouseleave(d, series.name, group[i]))
                    ;

                    // update existing elements
                    container
                        .attr('x1', d => x(d.time))
                        .attr('x2', d => x(d.time))
                        .attr('y1', () => (y(series.name) || 0) + spikesStyle.margin)
                        .attr('y2', () => (y(series.name) || 0) + lineHeight - spikesStyle.margin)
                        .attr('stroke', spikesStyle.color)
                        .attr('stroke-width', spikesStyle.lineWidth)
                        .attr('stroke-linecap', "round")
                    ;

                    // exit old elements
                    container
                        .exit()
                        .remove()
                    ;
                });
            }
        },
        [seriesList, timeWindow, width, height, spikesStyle]
    );

    return (
        <svg
            className="d3-component"
            width={width}
            height={height * seriesList.length}
            style={{backgroundColor: backgroundColor}}
            ref={d3ContainerRef}
        />
    );
}

export default RasterChart;