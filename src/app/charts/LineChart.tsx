import {default as React, useEffect, useRef} from "react";
import * as d3 from "d3";

interface Point {
    x: number;
    y: number;
}

function genData(length: number, delta: number): Array<Point> {
    return Array
        .from({length: length}, () => ({x: 0, y: Math.random() * delta}))
        .map((datum, index, array) =>
            ({x: index, y: array[Math.max(0, index - 1)].y + datum.y})
        );
}

const margin = {
    bottom: 40,
    top: 40,
    left: 40,
    right: 10
}

interface Props {

}

export default function LineChart(props: Props) {

    const width = 900;
    const height = 400;
    const dataPoints = 40;
    const data: [number, number][] = genData(dataPoints, 1).map(p => [p.x, p.y]);

    const containerRef = useRef<SVGSVGElement>(null);

    useEffect(
        () => {
            updatePlot();
        },
        []
    )

    function updatePlot() {
        const svg = d3.select(containerRef.current);

        const xScale = d3.scaleLinear()
            //@ts-ignore
            .domain(d3.extent(data, d => d[0])).nice()
            .range([margin.left, width - margin.right])
        ;

        const yScale = d3.scaleLinear()
            // .domain([d3.min(data,d => d[1]) || 0, d3.max(data,d => d[1]) || 100]).nice()
            .domain([0, 2])
            .range([height - margin.bottom, margin.top])
        ;

        const xAxis = d3.axisBottom(xScale);
        const yAxis = d3.axisLeft(yScale);

        svg.append("g")
            .attr("transform", `translate(0,${height - margin.bottom})`)
            .call(xAxis);

        svg.append("g")
            .attr("transform", `translate(${margin.left}, 0)`)
            .call(yAxis);

        svg.append("path")
            .datum(data)
            .attr("fill", "none")
            .attr("stroke", "steelblue")
            .attr("d", d3.line()
                // .defined(d => !isNaN(d.y))
                .x(d => xScale(d[0]))
                .y(d => yScale(d[1]))
            );
    }

    return (
        <svg
            className="streaming-scatter-chart-d3"
            width={width}
            height={height}
            style={{backgroundColor: "white"}}
            ref={containerRef}
        />
    );

}