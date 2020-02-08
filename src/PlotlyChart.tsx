import React, {useEffect, useRef} from 'react';
import * as Plotly from 'plotly.js/lib/core';
import {Layout} from "plotly.js/lib/core";

const PlotlyChart: React.FC = () => {

    const chartDivRef = useRef(null);

    const timeRef = useRef<number>(1);
    const dataRef = useRef<{ x: number[], y: number[] }>(fakeData(100, timeRef.current));
    // const chartRef = useRef<Plotly.PlotlyHTMLElement>();

    useEffect(
        () => {
            timeRef.current = 100;
            const data = lastNPoints(dataRef.current, 100);
            Plotly.newPlot(
                chartDivRef.current || '', [
                    // {x: data.x, y: data.y}
                    // {x: [], y: []}
                    // data
                    {
                        x: data.x,
                        y: data.y,
                        name: 'in-1',
                        type: 'scattergl',
                        mode: 'markers',
                        marker: {
                            symbol: 'line-ns-open',
                            size: 8,
                            line: {width: 1},
                            color: 'blue'
                        }
                    }
                ],
                {
                    title: 'neuron spikes',
                    margin: {t: 0},
                    xaxis: {
                        title: 't (ms)',
                        type: 'linear',
                        range: [0, 500]
                    },
                    yaxis: {
                        range: [-0.5, 1.5],
                        nticks: 1,
                        // zerolinecolor: plotStyles.gridLineColor,
                        // gridcolor: plotStyles.gridLineColor,
                        dtick: 1,
                        tickvals: [1],
                        ticktext: ['in-1'],
                        title: 'Neurons',
                        // titlefont: plotStyles.tickFont,
                        // linecolor: plotStyles.axisLineColor,
                        // tickfont: plotStyles.tickFont,
                        automargin: true
                    }
                }
            ).then(plot => {
                // chartRef.current = plot;

                const numPoints = 1;
                const intervalId = setInterval(() => {
                    const data = fakeData(numPoints, timeRef.current);
                    // dataRef.current.x = dataRef.current.x.concat(data.x);
                    // dataRef.current.y = dataRef.current.x.concat(data.y);

                    timeRef.current = timeRef.current + numPoints;
                    const timeRange: Partial<Layout> = {
                        xaxis: {
                            range: [Math.max(0, timeRef.current-500), Math.max(500, timeRef.current)]
                        }
                    };
                    Plotly.relayout(chartDivRef.current || '', timeRange);
                    Plotly.extendTraces(
                        chartDivRef.current || '',
                        {x: [data.x], y: [data.y]},
                        [0]
                    );
                    if(timeRef.current > 1000) {
                        clearInterval(intervalId);
                    }
                }, 20);
            });
        },
        []
    );

    return (
        <div ref={chartDivRef}/>
    )
};

function fakeData(numPoints: number, start: number): { x: number[], y: number[] } {
    let x: Array<number> = [];
    let y: Array<number> = [];
    for (let i = 0; i < numPoints; ++i) {
        x.push(start + i);
        y.push(Math.random());
    }
    return {x, y};
}

function lastNPoints(data: { x: number[], y: number[] }, lastN: number): { x: number[], y: number[] } {
    if (lastN > 0 && data.x.length > lastN) {
        const x = data.x.slice(data.x.length - lastN);
        const y = data.x.slice(data.x.length - lastN);
        return {x, y};
    }
    return data;
}

// function toCsv(data: Array<[number, number]>, lastN: number): string {
//     return lastNPoints(data, lastN)
//         .map(point => `${point[0]},${point[1]}\n`)
//         .reduce((a, b) => `${a}${b}`, '');
// }

export default PlotlyChart;