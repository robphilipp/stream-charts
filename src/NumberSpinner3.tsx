import * as React from 'react';
import {useEffect, useRef, useState} from 'react';
import * as d3 from "d3";

interface Datum {
    time: number;
    value: number;
}

interface Props {
    timeWindow?: number;
    data?: Datum[];
}

interface PlotProps {
    width: number;
    height: number;
    timeWindow: number;
    data: Datum[];
}

const defaultData = [
    {time: 1, value: 1},
    {time: 2, value: 2},
    {time: 3, value: 3}
];
// const itemsPerRow = 75;
// const itemWidth = 13;
// const itemHeight = 10;

function NumberSpinnerDriver3(props: Props): JSX.Element {
    const {data = defaultData, timeWindow = 100} = props;

    // const count = useRef<number>(0);
    const intervalRef = useRef<NodeJS.Timeout>();

    const [liveData, setLiveData] = useState(data);
    const dataRef = useRef<Array<Datum>>(data);

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
                    const size = dataRef.current.length;
                    const datum = nextDatum(dataRef.current[size-1].time, 10);
                    while(dataRef.current.length > 0 && dataRef.current[0].time < datum.time - timeWindow) {
                        dataRef.current.shift();
                    }
                    dataRef.current.push(datum);

                    dataRef.current = dataRef.current.slice();
                    setLiveData(dataRef.current);

                    // count.current += 1;
                    if (intervalRef.current && datum.time > 10000) {
                        clearInterval(intervalRef.current);
                    }
                },
                10
            );
        }, [timeWindow]
    );

    return (
        <div>
            <NumberSpinner width={600} height={50} data={liveData} timeWindow={timeWindow}/>
        </div>
    );
}

function NumberSpinner(props: PlotProps): JSX.Element {
    const {data, timeWindow, width, height} = props;

    const d3ContainerRef = useRef(null);

    // called on mount to set up the <g> element into which to render
    useEffect(
        () => {
            if (d3ContainerRef.current) {
                d3
                    .select(d3ContainerRef.current)
                    .append('g')
                ;
            }
        }, [height]
    );

    // called on mount, and also when the liveData state variable is updated
    useEffect(
        () => {
            if (d3ContainerRef.current) {
                // calculate the mapping between the times in the data (domain) and the display
                // location on the screen (range)
                const maxTime = data[data.length - 1].time;
                const x = d3.scaleLinear()
                    .domain([Math.max(0, maxTime - timeWindow), maxTime])
                    .range([0, width]);

                const y = d3.scaleLinear()
                    .domain([0, 1])
                    .range([height, 0]);

                // select the text elements and bind the data to them
                const svg = d3
                    .select(d3ContainerRef.current)
                    .select('g')
                    .selectAll('line')
                    .data(data)
                ;

                // enter new elements
                svg
                    .enter()
                    .append('line')
                    .attr("transform", (d, i) => `translate(0, ${0 * height})`)
                    .attr('x1', (d, i) => x(d.time))
                    .attr('x2', (d, i) => x(d.time))
                    .attr('y1', (d, i) => y(0))
                    .attr('y2', (d, i) => y(1))
                    .attr('stroke', 'red')
                ;

                // update existing elements
                svg
                    .attr("transform", (d, i) => `translate(0, ${0 * height})`)
                    .attr('x1', (d, i) => x(d.time))
                    .attr('x2', (d, i) => x(d.time))
                    .attr('y1', (d, i) => y(0))
                    .attr('y2', (d, i) => y(1))
                    .attr('stroke', 'red')
                ;

                // exit old elements
                svg
                    .exit()
                    .remove()
                ;
            }
        },
        [data, timeWindow, height, width]
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
