import * as React from 'react';
import * as d3 from "d3";
import {useEffect, useRef, useState} from "react";

interface OwnProps {
    data?: number[];
}

function NumberSpinner(props: OwnProps): JSX.Element {

    const d3ContainerRef = useRef(null);

    const count = useRef<number>(0);
    const intervalRef = useRef<NodeJS.Timeout>();

    const [liveData, setLiveData] = useState(props.data || [1, 2, 3]);
    const dataRef = useRef(props.data || [1, 2, 3]);

    // called on mount to set up the <g> element into which to render
    useEffect(
        () => {
            if (d3ContainerRef.current) {
                d3
                    .select(d3ContainerRef.current)
                    .append('g')
                    .selectAll('text')
                    .data(dataRef.current)
                ;
            }

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
                10
            );
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
                    .data(liveData)
                ;

                // enter new elements
                svg
                    .enter()
                    .append('text')
                    .attr('x', (d, i) => i * 37)
                    .attr('y', (d, i) => 40 + d)
                    .style('font-size', 36)
                    .style('fill', 'red')
                    .text((d: number) => d)
                ;

                // update existing elements
                svg
                    .attr('x', (d, i) => i * 37)
                    .attr('y', (d, i) => 40 + d)
                    .text((d: number) => d)
                ;

                // exit old elements
                svg
                    .exit()
                    .remove()
                ;
            }
        },
        [liveData]
    );

    return (
        <svg
            className="d3-component"
            width={400}
            height={200}
            ref={d3ContainerRef}
        />
    );
}

export default NumberSpinner;
