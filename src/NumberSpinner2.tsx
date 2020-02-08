import * as React from 'react';
import {useEffect, useRef, useState} from 'react';
import * as d3 from "d3";

interface OwnProps {
    data: number[];
}

const itemsPerRow = 75;
const itemWidth = 13;
const itemHeight = 10;

function NumberSpinnerDriver(props: OwnProps): JSX.Element {
    const count = useRef<number>(0);
    const intervalRef = useRef<NodeJS.Timeout>();

    const [liveData, setLiveData] = useState(props.data || [1, 2, 3]);
    const dataRef = useRef(props.data || [1, 2, 3]);

    // called on mount to set up the <g> element into which to render
    useEffect(
        () => {
            // on mount, sets the timer that updates the data and sets the live data which causes a state change
            // and so react will call the useEffect with the live data dependency and update d3
            intervalRef.current = setInterval(
                () => {
                    const size = dataRef.current.length;
                    dataRef.current.push((dataRef.current[size - 2] + dataRef.current[size - 1]) % 10);
                    dataRef.current = dataRef.current.slice(1);
                    setLiveData(dataRef.current);

                    count.current += 1;
                    if (intervalRef.current && count.current > 1000) {
                        clearInterval(intervalRef.current);
                    }
                },
                25
            );
        }, []
    );

    return (
        <div>
            <NumberSpinner2 data={liveData}/>
        </div>
    );
}

function NumberSpinner2(props: OwnProps): JSX.Element {
    const {data} = props;

    const d3ContainerRef = useRef(null);

    // called on mount to set up the <g> element into which to render
    useEffect(
        () => {
            if (d3ContainerRef.current) {
                d3
                    .select(d3ContainerRef.current)
                    .append('g')
                    .selectAll('text')
                ;
            }
        }, []
    );

    // called on mount, and also when the liveData state variable is updated
    useEffect(
        () => {
            if (d3ContainerRef.current) {
                // select the text elements and bind the data to them
                const svg = d3
                    .select(d3ContainerRef.current)
                    .select('g')
                    .selectAll('text')
                    .data(data)
                ;

                // enter new elements
                svg
                    .enter()
                    .append('text')
                    .attr('x', (d, i) => (i % itemsPerRow + 1) * itemWidth)
                    .attr('y', (d, i) => Math.ceil((i + 0.0001) / itemsPerRow) * itemHeight + d)
                    .style('font-family', "mono")
                    .style('font-size', 12)
                    .style('fill', 'red')
                    .text((d: number) => d > 7 ? '|' : ' ')
                ;

                // update existing elements
                svg
                    .attr('x', (d, i) => (i % itemsPerRow + 1) * itemWidth)
                    .attr('y', (d, i) => Math.ceil((i + 0.0001) / itemsPerRow) * itemHeight + d)
                    .text((d: number) => d > 7 ? '|' : ' ')
                ;

                // exit old elements
                svg
                    .exit()
                    .remove()
                ;
            }
        },
        [data]
    );

    return (
        <svg
            className="d3-component"
            width={1000}
            height={1000}
            ref={d3ContainerRef}
        />
    );
}

export default NumberSpinnerDriver;
