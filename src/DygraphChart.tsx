import React, {useEffect, useRef} from 'react';
import Dygraph from 'dygraphs';

// todo multiple series on the same plot (connectSeparatedPoints: true) not ideal, and difficult to do for spikes
// todo legend?
const DygraphChart: React.FC = () => {

    const chartDivRef = useRef(null);

    const timeRef = useRef<number>(1);
    const dataRef = useRef<Array<[number, number]>>(fakeData(10, timeRef.current));
    const chartRef = useRef<Dygraph>();

    useEffect(
        () => {
            chartRef.current = new Dygraph(
                chartDivRef.current || '',
                lastNPoints(dataRef.current, 200),
                {
                    height: 500,
                    width: 1000,
                    drawGrid: false,
                    strokeWidth: 0,
                    drawPoints: true,
                    showRoller: true,
                    valueRange: [0.0, 1.2],
                    labels: ['Time', 'Random']
                }
            );
            setInterval(
                () => {
                    const numPoints = 1;
                    dataRef.current = dataRef.current.concat(fakeData(numPoints, timeRef.current));
                    timeRef.current = timeRef.current + numPoints;
                    chartRef.current?.updateOptions({'file': lastNPoints(dataRef.current, 200)})
                },
                50
            );
        },
        []
    );

    return (
        <div ref={chartDivRef}/>
    )
};

function fakeData(numPoints: number, start: number): Array<[number, number]> {
    let points: Array<[number, number]> = [];
    for (let i = 0; i < numPoints; ++i) {
        points.push([start + i, Math.random()]);
    }
    return points;
}

function lastNPoints(data: Array<[number, number]>, lastN: number): Array<[number, number]> {
    if (lastN > 0 && data.length > lastN) {
        return data.slice(data.length - lastN);
    }
    return data;
}

// function toCsv(data: Array<[number, number]>, lastN: number): string {
//     return lastNPoints(data, lastN)
//         .map(point => `${point[0]},${point[1]}\n`)
//         .reduce((a, b) => `${a}${b}`, '');
// }

export default DygraphChart;