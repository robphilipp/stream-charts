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

            intervalRef.current = setInterval(
                () => {
                    const size = dataRef.current.length;
                    dataRef.current.push((dataRef.current[size - 2] + dataRef.current[size - 1]) % 10);
                    // dataRef.current.push(dataRef.current[0]);
                    dataRef.current = dataRef.current.slice(1);
                    setLiveData(dataRef.current);
                    // console.log(dataRef.current);

                    count.current += 1;
                    if (intervalRef.current && count.current > 1000) {
                        clearInterval(intervalRef.current);
                        console.log('done');
                    }
                },
                10
            );
        }, []
    );

    useEffect(
        () => {
            // if (props.data && d3ContainerRef.current) {
            if (d3ContainerRef.current) {
                // enter new elements
                const svg = d3
                    .select(d3ContainerRef.current)
                    .select('g')
                    .selectAll('text')
                    .data(liveData)
                ;
                svg
                    // .select(d3ContainerRef.current)
                    .enter()
                    .append('text')
                    .attr('x', (d, i) => i * 37)
                    .attr('y', 40)
                    .style('font-size', 36)
                    .style('fill', 'red')
                    .text((d: number) => d)
                ;

                // update existing elements
                svg
                    .attr('x', (d, i) => i * 37)
                    .text((d: number) => d)
                ;

                // exit old elements
                svg
                    .exit()
                    .remove()
                ;

                setLiveData(dataRef.current);
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
