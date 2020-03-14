import {default as React, useEffect, useRef} from "react";
import * as d3 from "d3";
import {ScaleBand, ScaleLinear, Selection} from "d3";
import {Datum, Series} from "./RasterChartDriver";

export interface Sides {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

const defaultMargin = {top: 30, right: 20, bottom: 30, left: 50};

const defaultSpikesStyle = {
    margin: 2,
    color: '#c95d15',
    lineWidth: 2,
    highlightColor: '#d2933f',
    highlightWidth: 4
};

const defaultAxesStyle = {color: '#d2933f'};
const defaultAxesLabelFont = {
    size: 12,
    color: '#d2933f',
    weight: 300,
    family: 'sans-serif'
};

const defaultPlotGridLines = {visible: true, color: 'rgba(210,147,63,0.35)'};

interface TooltipStyle {
    visible: boolean;

    fontSize: number;
    fontColor: string;
    fontFamily: string;
    fontWeight: number;

    backgroundColor: string;
    backgroundOpacity: number;

    borderColor: string;
    borderWidth: number;
    borderRadius: number;

    paddingLeft: number;
    paddingRight: number;
    paddingTop: number;
    paddingBottom: number;
}

const defaultTooltipStyle: TooltipStyle = {
    visible: false,

    fontSize: 12,
    fontColor: '#d2933f',
    fontFamily: 'sans-serif',
    fontWeight: 250,
    
    backgroundColor: '#202020',
    backgroundOpacity: 0.8,
    
    borderColor: '#d2933f',
    borderWidth: 1,
    borderRadius: 5,
    
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 5,
    paddingBottom: 10,
};

interface LineMagnifierStyle {
    visible: boolean;
    timeWindow: number;
    magnification: number;
    color: string,
    lineWidth: number,
}

const defaultLineMagnifierStyle: LineMagnifierStyle = {
    visible: false,
    timeWindow: 50,
    magnification: 1,
    color: '#d2933f',
    lineWidth: 2,
};

interface TrackerStyle {
    visible: boolean;
    timeWindow: number;
    magnification: number;
    color: string,
    lineWidth: number,
}

const defaultTrackerStyle: TrackerStyle = {
    visible: false,
    timeWindow: 50,
    magnification: 1,
    color: '#d2933f',
    lineWidth: 2,
};

interface Props {
    width: number;
    height: number;
    margin?: Partial<Sides>;
    spikesStyle?: Partial<{ margin: number, color: string, lineWidth: number, highlightColor: string, highlightWidth: number }>;
    axisLabelFont?: Partial<{ size: number, color: string, family: string, weight: number }>;
    axisStyle?: Partial<{ color: string }>;
    backgroundColor?: string;
    plotGridLines?: Partial<{ visible: boolean, color: string }>;
    tooltip?: Partial<TooltipStyle>;
    magnifier?: Partial<LineMagnifierStyle>;
    tracker?: Partial<TrackerStyle>;

    // timeWindow: number;         // the width of the time-range in ms
    minTime: number;
    maxTime: number;
    seriesList: Array<Series>;
}

// the axis-element type return when calling the ".call(axis)" function
type AxisElementSelection = Selection<SVGGElement, unknown, null, undefined>;

/**
 * Renders a raster chart
 * @param {Props} props The properties from the parent
 * @return {JSX.Element} The raster chart
 * @constructor
 */
function RasterChart(props: Props): JSX.Element {
    const {
        seriesList,
        // timeWindow,
        minTime, maxTime,
        width,
        height,
        backgroundColor = '#202020',
    } = props;

    // override the defaults with the parent's properties, leaving any unset values as the default value
    const margin = {...defaultMargin, ...props.margin};
    const spikesStyle = {...defaultSpikesStyle, ...props.spikesStyle};
    const axisStyle = {...defaultAxesStyle, ...props.axisStyle};
    const axisLabelFont = {...defaultAxesLabelFont, ...props.axisLabelFont};
    const plotGridLines = {...defaultPlotGridLines, ...props.plotGridLines};
    const tooltip: TooltipStyle = {...defaultTooltipStyle, ...props.tooltip};
    const magnifier = {...defaultLineMagnifierStyle, ...props.magnifier};
    const tracker = {...defaultTrackerStyle, ...props.tracker};

    // grab the dimensions of the actual plot after removing the margins from the specified width and height
    const plotDimensions = adjustedDimensions(width, height, margin);

    // the container that holds the d3 svg element
    const containerRef = useRef<SVGSVGElement>(null);
    const mainGRef = useRef<Selection<SVGGElement, unknown, null, undefined>>();
    const magnifierRef = useRef<Selection<SVGRectElement, Datum, null, undefined>>();
    const trackerRef = useRef<Selection<SVGLineElement, Datum, null, undefined>>();

    const mouseCoordsRef = useRef<number>(0);

    // reference to the axes for the plot
    const axesRef = useRef<{ xAxisElement: AxisElementSelection, yAxisElement: AxisElementSelection }>();

    // the scaling that converts the x-values (time in ms) of the datum into the pixel coordinates.
    const xScalingRef = useRef<ScaleLinear<number, number>>(d3.scaleLinear());
    // the scaling that converts the y-values (neuron IDs) into pixel coordinates.
    const yScalingRef = useRef<ScaleBand<string>>(d3.scaleBand());

    // unlike the magnifier, the handler forms a closure on the tooltip properties, and so if they change in this
    // component, the closed properties are unchanged. using a ref allows the properties to which the reference
    // points to change.
    const tooltipRef = useRef(tooltip);

    /**
     * Renders a tooltip showing the neuron, spike time, and the spike strength when the mouse hovers over a spike.
     * @param {Datum} datum The spike datum (t ms, s mV)
     * @param {string} seriesName The name of the series (i.e. the neuron ID)
     * @param {SVGLineElement} spike The SVG line element representing the spike, over which the mouse is hovering.
     */
    function handleShowTooltip(datum: Datum, seriesName: string, spike: SVGLineElement): void {
        if(!tooltipRef.current.visible) {
            return;
        }

        // Use D3 to select element, change color and size
        d3.select(spike)
            .attr('stroke', spikesStyle.highlightColor)
            .attr('stroke-width', spikesStyle.highlightWidth)
            .attr('stroke-linecap', "round")
        ;

        if (tooltipRef.current.visible) {
            // create the rounded rectangle for the tooltip's background
            const rect = d3.select(containerRef.current)
                .append('rect')
                .attr('id', `r${datum.time}-${seriesName}`)
                .attr('class', 'tooltip')
                .attr('rx', tooltipRef.current.borderRadius)
                .attr('fill', tooltipRef.current.backgroundColor)
                .attr('fill-opacity', tooltipRef.current.backgroundOpacity)
                .attr('stroke', tooltipRef.current.borderColor)
                .attr('stroke-width', tooltipRef.current.borderWidth)
            ;

            // display the neuron ID in the tooltip
            const header = d3.select(containerRef.current)
                .append("text")
                .attr('id', `tn${datum.time}-${seriesName}`)
                .attr('class', 'tooltip')
                .attr('fill', tooltipRef.current.fontColor)
                .attr('font-family', 'sans-serif')
                .attr('font-size', tooltipRef.current.fontSize)
                .attr('font-weight', tooltipRef.current.fontWeight)
                .text(() => seriesName)
            ;

            // display the time (ms) and spike strength (mV) in the tooltip
            const text = d3.select(containerRef.current)
                .append("text")
                .attr('id', `t${datum.time}-${seriesName}`)
                .attr('class', 'tooltip')
                .attr('fill', tooltipRef.current.fontColor)
                .attr('font-family', 'sans-serif')
                .attr('font-size', tooltipRef.current.fontSize + 2)
                .attr('font-weight', tooltipRef.current.fontWeight + 150)
                .text(() => `${datum.time} ms, ${d3.format(".2")(datum.value)} mV`)
            ;

            // calculate the max width and height of the text
            const tooltipWidth = Math.max(header.node()?.getBBox()?.width || 0, text.node()?.getBBox()?.width || 0);
            const headerTextHeight = header.node()?.getBBox()?.height || 0;
            const idHeight = text.node()?.getBBox()?.height || 0;
            const textHeight = headerTextHeight + idHeight;

            // set the header text location
            header
                .attr('x', () => tooltipX(datum.time, tooltipWidth) + tooltipRef.current.paddingLeft)
                .attr('y', () => tooltipY(seriesName, textHeight) - idHeight + textHeight + tooltipRef.current.paddingTop)
            ;

            // set the tooltip text (i.e. neuron ID) location
            text
                .attr('x', () => tooltipX(datum.time, tooltipWidth) + tooltipRef.current.paddingLeft)
                .attr('y', () => tooltipY(seriesName, textHeight) + textHeight + tooltipRef.current.paddingTop)
            ;

            // set the position, width, and height of the tooltip rect based on the text height and width and the padding
            rect.attr('x', () => tooltipX(datum.time, tooltipWidth))
                .attr('y', () => tooltipY(seriesName, textHeight))
                .attr('width', tooltipWidth + tooltipRef.current.paddingLeft + tooltipRef.current.paddingRight)
                .attr('height', textHeight + tooltipRef.current.paddingTop + tooltipRef.current.paddingBottom)
            ;

        }
    }

    /**
     * Calculates the x-coordinate of the lower left-hand side of the tooltip rectangle (obviously without
     * "rounded corners"). Adjusts the x-coordinate so that tooltip is visible on the edges of the plot.
     * @param {number} time The spike time
     * @param {number} textWidth The width of the tooltip text
     * @return {number} The x-coordinate of the lower left-hand side of the tooltip rectangle
     */
    function tooltipX(time: number, textWidth: number): number {
        return Math
            .min(
                Math.max(
                    xScalingRef.current(time),
                    textWidth / 2
                ),
                plotDimensions.width - textWidth / 2
            ) + margin.left - textWidth / 2 - tooltip.paddingLeft;
    }

    /**
     * Calculates the y-coordinate of the lower-left-hand corner of the tooltip rectangle. Adjusts the y-coordinate
     * so that the tooltip is visible on the upper edge of the plot
     * @param {string} seriesName The name of the series
     * @param {number} textHeight The height of the header and neuron ID text
     * @return {number} The y-coordinate of the lower-left-hand corner of the tooltip rectangle
     */
    function tooltipY(seriesName: string, textHeight: number): number {
        const y = (yScalingRef.current(seriesName) || 0) + margin.top - tooltip.paddingBottom - textHeight - tooltip.paddingTop;
        return y > 0 ? y : y + tooltip.paddingBottom + textHeight + tooltip.paddingTop + spikeLineHeight();
    }

    /**
     * @return {number} The height of the spikes line
     */
    function spikeLineHeight(): number {
        return plotDimensions.height / seriesList.length;
    }

    /**
     * Removes the tooltip when the mouse has moved away from the spike
     * @param {Datum} datum The spike datum (t ms, s mV)
     * @param {string} seriesName The name of the series (i.e. the neuron ID)
     * @param {SVGLineElement} spike The SVG line element representing the spike, over which the mouse is hovering.
     */
    function handleHideTooltip(datum: Datum, seriesName: string, spike: SVGLineElement) {
        // Use D3 to select element, change color and size
        d3.select<SVGLineElement, Datum>(spike)
            .attr('stroke', spikesStyle.color)
            .attr('stroke-width', spikesStyle.lineWidth);

        if(tooltipRef.current.visible) {
            d3.selectAll('.tooltip').remove();
        }
    }

    /**
     *
     * @param {Selection<SVGRectElement, unknown, null, undefined> | undefined} path
     */
    function handleShowMagnify(path: Selection<SVGRectElement, Datum, null, undefined> | undefined) {

        function inMagnifier(datum: Datum, x: number, offsets: number): boolean {
            const mouseTime = xScalingRef.current.invert(x - margin.left);
            return datum.time > mouseTime - offsets && datum.time < mouseTime + offsets;
        }

        function xFrom(datum: Datum): number {
            return xScalingRef.current(datum.time);
        }

        if(containerRef.current && path) {
            const [x, y] = d3.mouse(containerRef.current);
            const xPrev = mouseCoordsRef.current;
            if(Math.abs(x - xPrev) < 5) {
                return;
            }
            mouseCoordsRef.current = x;

            const isMouseInPlot = mouseInPlotArea(x, y);
            const deltaTime = 50;
            const deltaX = Math.abs(xScalingRef.current(deltaTime) - xScalingRef.current(0));
            path
                .attr('x', x - deltaX)
                .attr('width', 2 * deltaX)
                .attr('opacity', () => isMouseInPlot ? 1 : 0)
            ;

            if(isMouseInPlot) {
                const barMagnifierF = barMagnifier(deltaX, 3, x - margin.left);
                d3.select<SVGSVGElement, Datum>(containerRef.current)
                    .selectAll<SVGSVGElement, Datum>('.spikes-lines')
                    .filter(datum => inMagnifier(datum , x, 4 * deltaTime))
                    // .attr('x1', datum => xFrom(datum as Datum) + (inMagnifier(datum as Datum, x, deltaTime) ? 10 : 0))
                    // .attr('x2', datum => xFrom(datum as Datum) + (inMagnifier(datum as Datum, x, deltaTime) ? -10 : 0))
                    .attr('x1', datum => barMagnifierF(xFrom(datum)))
                    .attr('x2', datum => barMagnifierF(xFrom(datum)))
                ;
            }
            else {
                d3.select<SVGSVGElement, Datum>(containerRef.current)
                    .selectAll<SVGSVGElement, Datum>('.spikes-lines')
                    .attr('x1', datum => xFrom(datum))
                    .attr('x2', datum => xFrom(datum))
            }
        }
    }

    function handleShowTracker(path: d3.Selection<SVGLineElement, Datum, null, undefined> | undefined) {
        if(containerRef.current && path) {
            const [x, y] = d3.mouse(containerRef.current);
            path
                .attr('x1', x)
                .attr('x2', x)
                .attr('opacity', () => mouseInPlotArea(x, y) ? 1 : 0)
            ;
        }
    }

    function mouseInPlotArea(x: number, y: number): boolean {
        return  x > margin.left && x < width - margin.right &&
            y > margin.top && y < height - margin.bottom;
    }


    // called when:
    // 1. component mounts to set up the main <g> element and a <g> element for each series
    //    into which d3 renders the series
    // 2. series data changes
    // 3. time-window changes
    // 4. plot attributes change
    useEffect(
        () => {
            tooltipRef.current = tooltip;

            if (containerRef.current) {
                // select the text elements and bind the data to them
                const svg = d3.select<SVGSVGElement, any>(containerRef.current);

                // set up the main <g> container for svg and translate it based on the margins, but do it only
                // once
                if(mainGRef.current === undefined) {
                    mainGRef.current = svg
                        .attr('width', width)
                        .attr('height', height)
                        .attr('color', axisStyle.color)
                        .append<SVGGElement>('g')
                    ;
                }

                // set up the magnifier once
                if(magnifier.visible && magnifierRef.current === undefined) {
                    const linearGradient = svg
                        .append<SVGDefsElement>('defs')
                        .append<SVGLinearGradientElement>('linearGradient')
                        .attr('id', 'magnifier-gradient')
                        .attr('x1', '0%')
                        .attr('x2', '100%')
                        .attr('y1', '0%')
                        .attr('y2', '0%')
                    ;

                    const borderColor = d3.rgb(tooltip.backgroundColor).brighter(3.5).hex();
                    linearGradient
                        .append<SVGStopElement>('stop')
                        .attr('offset', '0%')
                        .attr('stop-color', borderColor)
                    ;

                    linearGradient
                        .append<SVGStopElement>('stop')
                        .attr('offset', '30%')
                        .attr('stop-color', tooltip.backgroundColor)
                        .attr('stop-opacity', 0)
                    ;

                    linearGradient
                        .append<SVGStopElement>('stop')
                        .attr('offset', '70%')
                        .attr('stop-color', tooltip.backgroundColor)
                        .attr('stop-opacity', 0)
                    ;

                    linearGradient
                        .append<SVGStopElement>('stop')
                        .attr('offset', '100%')
                        .attr('stop-color', borderColor)
                    ;

                    magnifierRef.current = svg
                        .append<SVGRectElement>('rect')
                        .attr('class', 'magnifier')
                        .attr('y', margin.top)
                        .attr('height', plotDimensions.height - margin.top)
                        .attr('stroke', tooltip.borderColor)
                        .attr('stroke-width', tooltip.borderWidth)
                        // .attr('opacity', 0)
                        .style('fill', 'url(#magnifier-gradient')
                    ;

                    svg.on('mousemove', () => handleShowMagnify(magnifierRef.current));
                }
                // if the magnifier was defined, and is now no longer defined (i.e. props changed, then remove the magnifier)
                else if(!magnifier.visible && magnifierRef.current) {
                    magnifierRef.current = undefined;
                }

                // set up the tracker-line once
                if(tracker.visible && trackerRef.current === undefined) {
                    trackerRef.current = svg
                        .append<SVGLineElement>('line')
                        .attr('class', 'tracker')
                        .attr('y1', margin.top)
                        .attr('y2', plotDimensions.height)
                        .attr('stroke', tooltip.borderColor)
                        .attr('stroke-width', tooltip.borderWidth)
                        .attr('opacity', 0) as Selection<SVGLineElement, Datum, null, undefined>
                    ;

                    svg.on('mousemove', () => handleShowTracker(trackerRef.current));
                }
                // if the magnifier was defined, and is now no longer defined (i.e. props changed, then remove the magnifier)
                else if(!tracker.visible && trackerRef.current) {
                    trackerRef.current = undefined;
                }


                // create a container for each spike series
                seriesList.forEach(series => mainGRef.current!
                    .append<SVGGElement>('g')
                    .attr('class', series.name)
                    .attr('transform', `translate(${margin.left}, ${margin.top})`)
                );

                // calculate the mapping between the times in the data (domain) and the display
                // location on the screen (range)
                // const maxTime = calcMaxTime(seriesList);
                xScalingRef.current = d3.scaleLinear()
                    // .domain([Math.max(0, maxTime - timeWindow), Math.max(timeWindow, maxTime)])
                    .domain([minTime, maxTime])
                    .range([0, plotDimensions.width]);

                // const lineHeight = height / seriesList.length;
                const lineHeight = spikeLineHeight();
                yScalingRef.current = d3.scaleBand()
                    .domain(seriesList.map(series => series.name))
                    .range([0, lineHeight * seriesList.length - margin.top]);

                // create and add the axes, grid-lines, and mouse-over functions
                if (!axesRef.current) {
                    const xAxis = d3.axisBottom(xScalingRef.current);
                    const yAxis = d3.axisLeft(yScalingRef.current);
                    const xAxisElem = svg
                        .append<SVGGElement>('g')
                        .attr('class', 'x-axis')
                        .attr('transform', `translate(${margin.left}, ${plotDimensions.height})`)
                        .call(xAxis);

                    const yAxisElem = svg
                        .append<SVGGElement>('g')
                        .attr('class', 'y-axis')
                        .attr('transform', `translate(${margin.left}, ${margin.top})`)
                        .call(yAxis);

                    axesRef.current = {
                        xAxisElement: xAxisElem,
                        yAxisElement: yAxisElem
                    };

                    svg
                        .append<SVGTextElement>('text')
                        .attr('text-anchor', 'middle')
                        .attr('font-size', axisLabelFont.size)
                        .attr('fill', axisLabelFont.color)
                        .attr('font-family', axisLabelFont.family)
                        .attr('font-weight', axisLabelFont.weight)
                        .attr('transform', `translate(${margin.left + plotDimensions.width / 2}, ${plotDimensions.height + margin.top + (margin.bottom / 3)})`)
                        .text("t (ms)");

                    if (plotGridLines.visible) {
                        const gridLines = svg
                            .select<SVGGElement>('g')
                            .selectAll('grid-line')
                            .data(seriesList.map(series => series.name));

                        gridLines
                            .enter()
                            .append<SVGLineElement>('line')
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
                    axesRef.current.xAxisElement.call(d3.axisBottom(xScalingRef.current));
                    axesRef.current.yAxisElement.call(d3.axisLeft(yScalingRef.current));
                }

                seriesList.forEach(series => {
                    const container = svg
                        .select<SVGGElement>(`g.${series.name}`)
                        .selectAll<SVGLineElement, Datum>('line')
                        .data(series.data)
                    ;

                    // enter new elements
                    container
                        .enter()
                        .append<SVGLineElement>('line')
                        .attr('class', 'spikes-lines')
                        .attr('x1', d => xScalingRef.current(d.time))
                        .attr('x2', d => xScalingRef.current(d.time))
                        .attr('y1', () => (yScalingRef.current(series.name) || 0) + spikesStyle.margin)
                        .attr('y2', () => (yScalingRef.current(series.name) || 0) + lineHeight - spikesStyle.margin)
                        .attr('stroke', spikesStyle.color)
                        .attr('stroke-width', spikesStyle.lineWidth)
                        .attr('stroke-linecap', "round")
                        // even though the tooltip is may not be set to show up on the mouseover, we want to attach the handler
                        // so that when the use enables tooltips the handlers will show the the tooltip
                        .on("mouseover", (d, i, group) => handleShowTooltip(d, series.name, group[i]))
                        .on("mouseleave", (d, i, group) => handleHideTooltip(d, series.name, group[i]))
                    ;

                    // update existing elements
                    container
                        .filter(datum => datum.time >= minTime)
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
        }
    );

    return (
        <svg
            className="d3-component"
            width={width}
            height={height * seriesList.length}
            style={{backgroundColor: backgroundColor}}
            ref={containerRef}
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
function adjustedDimensions(width: number, height: number, margins: Sides): { width: number, height: number } {
    return {
        width: width - margins.left - margins.right,
        height: height - margins.top - margins.top
    };
}

function barMagnifier(radius: number, power: number, center: number) {
    let k0: number, k1: number;

    function barMagnifier(d: number): number {
        const dx = d - center;
        const dd = Math.abs(dx);
        if (dd >= radius) return d;
        const k = k0 * (1 - Math.exp(-dd * k1)) / dd * .75 + .25;
        return center + dx * k;
    }

    function rescale() {
        k0 = Math.exp(power);
        k0 = k0 / (k0 - 1) * radius;
        k1 = power / radius;
        return barMagnifier;
    }

    barMagnifier.radius = function (_: number) {
        if (!arguments.length) return radius;
        radius = +_;
        return rescale();
    };

    barMagnifier.power = function (_: number) {
        if (!arguments.length) return power;
        power = +_;
        return rescale();
    };

    barMagnifier.center = function (_: number) {
        if (!arguments.length) return center;
        center = _;
        return barMagnifier;
    };

    return rescale();
}

export default RasterChart;