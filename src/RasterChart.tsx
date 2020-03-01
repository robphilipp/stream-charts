import {default as React, useEffect, useRef} from "react";
import * as d3 from "d3";
import {ScaleBand, ScaleLinear, Axis} from "d3";
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

/**
 * Renders a raster chart
 * @param {Props} props The properties from the parent
 * @return {JSX.Element} The raster chart
 * @constructor
 */
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

    // the scaling that converts the x-values (time in ms) of the datum into the pixel coordinates.
    const xScalingRef = useRef<ScaleLinear<number, number>>(d3.scaleLinear());
    // the scaling that converts the y-values (neuron IDs) into pixel coordinates.
    const yScalingRef = useRef<ScaleBand<string>>(d3.scaleBand());

    /**
     * Renders a tooltip showing the neuron, spike time, and the spike strength when the mouse hovers over a spike.
     * @param {Datum} datum The spike datum (t ms, s mV)
     * @param {string} seriesName The name of the series (i.e. the neuron ID)
     * @param {SVGLineElement} spike The SVG line element representing the spike, over which the mouse is hovering.
     */
    function handleMouseOver(datum: Datum, seriesName: string, spike: SVGLineElement) {
        // Use D3 to select element, change color and size
        d3.select(spike)
            .attr('stroke', spikesStyle.highlightColor)
            .attr('stroke-width', spikesStyle.highlightWidth)
            .attr('stroke-linecap', "round")
        ;

        // create the rounded rectangle for the tooltip's background
        d3.select(d3ContainerRef.current)
            .append('rect')
            .attr('id', `r${datum.time}-${seriesName}`)
            .attr('class', 'tooltip')
            .attr('x', () => xScalingRef.current(datum.time) - 50)
            .attr('y', () => (yScalingRef.current(seriesName) || 0) - 5)
            .attr('rx', 5)
            .attr('width', 200)
            .attr('height', 35)
            .attr('fill', backgroundColor)
            .attr('fill-opacity', 0.8)
            .attr('stroke', axisStyle.color)
        ;

        // display the neuron ID in the tooltip
        d3.select(d3ContainerRef.current)
            .append("text")
            .attr('id', `tn${datum.time}-${seriesName}`)
            .attr('class', 'tooltip')
            .attr('x', () => xScalingRef.current(datum.time) - 30)
            .attr('y', () => (yScalingRef.current(seriesName) || 0) + 8)
            .attr('fill', axisLabelFont.color)
            .attr('font-family', 'sans-serif')
            .attr('font-size', axisLabelFont.size)
            .attr('font-weight', 100)
            .text(() => seriesName)
        ;

        // display the time (ms) and spike strength (mV) in the tooltip
        d3.select(d3ContainerRef.current)
            .append("text")
            .attr('id', `t${datum.time}-${seriesName}`)
            .attr('class', 'tooltip')
            .attr('x', () => xScalingRef.current(datum.time) - 30)
            .attr('y', () => (yScalingRef.current(seriesName) || 0) + 25)
            .attr('fill', axisLabelFont.color)
            .attr('font-family', 'sans-serif')
            .attr('font-size', axisLabelFont.size + 2)
            .attr('font-weight', 350)
            .text(() => `${datum.time} ms, ${d3.format(".2")(datum.value)} mV`)
        ;
    }

    /**
     * Removes the tooltip when the mouse has moved away from the spike
     * @param {Datum} datum The spike datum (t ms, s mV)
     * @param {string} seriesName The name of the series (i.e. the neuron ID)
     * @param {SVGLineElement} spike The SVG line element representing the spike, over which the mouse is hovering.
     */
    function handleMouseleave(datum: Datum, seriesName: string, spike: SVGLineElement) {
        // Use D3 to select element, change color and size
        d3.select(spike)
            .attr('stroke', spikesStyle.color)
            .attr('stroke-width', spikesStyle.lineWidth);

        d3.selectAll('.tooltip').remove();
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
                xScalingRef.current = d3.scaleLinear()
                    .domain([Math.max(0, maxTime - timeWindow), Math.max(timeWindow, maxTime)])
                    .range([0, plotDimensions.width]);

                // const lineHeight = height / seriesList.length;
                const lineHeight = plotDimensions.height / seriesList.length;
                yScalingRef.current = d3.scaleBand()
                    .domain(seriesList.map(series => series.name))
                    .range([0, lineHeight * seriesList.length - margin.top]);

                // select the text elements and bind the data to them
                const svg = d3.select(d3ContainerRef.current);

                // create and add the axes, grid-lines, and mouse-over functions
                if(!d3AxesRef.current) {
                    const xAxis: Axis<number | {valueOf: () => number}> = d3.axisBottom(xScalingRef.current);
                    const yAxis = d3.axisLeft(yScalingRef.current) as Axis<string>;
                    const xAxisElem: d3.Selection<SVGGElement, unknown, null, undefined> = svg
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
                            .attr('y1', d => (yScalingRef.current(d) || 0) + margin.top + lineHeight / 2)
                            .attr('y2', d => (yScalingRef.current(d) || 0) + margin.top + lineHeight / 2)
                            .attr('stroke', plotGridLines.color)
                        ;
                    }

                }
                // update the scales
                else {
                    d3AxesRef.current.xAxisElement.call(d3.axisBottom(xScalingRef.current));
                    d3AxesRef.current.yAxisElement.call(d3.axisLeft(yScalingRef.current));
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
                        .attr('x1', d => xScalingRef.current(d.time))
                        .attr('x2', d => xScalingRef.current(d.time))
                        .attr('y1', () => (yScalingRef.current(series.name) || 0) + spikesStyle.margin)
                        .attr('y2', () => (yScalingRef.current(series.name) || 0) + lineHeight - spikesStyle.margin)
                        .attr('stroke', spikesStyle.color)
                        .attr('stroke-width', spikesStyle.lineWidth)
                        .attr('stroke-linecap', "round")
                        .on("mouseover", (d, i, group) => handleMouseOver(d, series.name, group[i]))
                        .on("mouseleave", (d, i, group) => handleMouseleave(d, series.name, group[i]))
                    ;

                    // update existing elements
                    container
                        .attr('x1', d => xScalingRef.current(d.time))
                        .attr('x2', d => xScalingRef.current(d.time))
                        .attr('y1', () => (yScalingRef.current(series.name) || 0) + spikesStyle.margin)
                        .attr('y2', () => (yScalingRef.current(series.name) || 0) + lineHeight - spikesStyle.margin)
                        .attr('stroke', spikesStyle.color)
                        .attr('stroke-width', spikesStyle.lineWidth)
                        .attr('stroke-linecap', "round")
                    ;

                    // exit old elements
                    container.exit().remove()
                    ;
                });
            }
        },
        // [seriesList, timeWindow, width, height, spikesStyle, axisLabelFont, axisStyle, margin, plotDimensions, plotGridLines]
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

/**
 * Calculates the maximum time found in the specified list of time-series
 * @param {Array<Series>} seriesList An array of time-series
 * @return {number} The maximum time
 */
export function calcMaxTime(seriesList: Array<Series>): number {
    return d3.max(seriesList.map(series => series.last().map(datum => datum.time).getOrElse(0))) || 0;
}

/**
 * Given the overall dimensions of the plot (width, height) and the margins, calculates the dimensions
 * of the actual plot by subtracting the margins.
 * @param {number} width The overall width (plot and margins)
 * @param {number} height The overall height (plot and margins)
 * @param {Sides} margins The margins around the plot (top, bottom, left, right)
 * @return {{width: number, height: number}} The dimensions of the actual plots adjusted for the margins
 * from the overall dimensions
 */
function adjustedDimensions(width:  number, height: number, margins: Sides): {width: number, height: number} {
    return {
        width: width - margins.left - margins.right,
        height: height - margins.top - margins.top
    };
}

export default RasterChart;