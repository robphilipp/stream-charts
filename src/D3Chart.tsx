import * as React from 'react';
import * as d3 from "d3";
import {useEffect, useRef, useState} from "react";

interface OwnProps {
    data?: number[];
}

function D3Chart(props: OwnProps): JSX.Element {

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
        // [props.data, d3ContainerRef.current, liveData]
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

export default D3Chart;


//     // define time scale
//     var timeScale = d3.scale.linear()
//         .domain([300, 1700])
//         .range([300, 1700])
//         .clamp(true);
//     // define value scale
//     var valueScale = d3.scale.linear()
//         .domain([0, 1])
//         .range([30, 95]);
//     // generate initial data
//     var normal = d3.random.normal(1000, 150);
//     var currMs = new Date().getTime() - 300000 - 4000;
//     var data = d3.range(300).map(function(d, i, arr) {
//         var value = valueScale(Math.random()); // random data
// //var value = Math.round((d % 60) / 60 * 95); // ramp data
//         var interval = Math.round(timeScale(normal()));
//         currMs += interval;
//         var time = new Date(currMs);
//         var obj = { interval: interval, value: value, time: time, ts: currMs }
//         return obj;
//     })
//     // create the real time chart
//     var chart = realTimeChart()
//         .title("Chart Title")
//         .yTitle("Y Scale")
//         .xTitle("X Scale")
//         .border(true)
//         .width(600)
//         .height(290)
//         .barWidth(1)
//         .initialData(data);
//     console.log("Version: ", chart.version);
//     console.dir("Dir++");
//     console.trace();
//     console.warn("warn")
//     // invoke the chart
//     var chartDiv = d3.select("#viewDiv").append("div")
//         .attr("id", "chartDiv")
//         .call(chart);
//     // alternative invocation
//     //chart(chartDiv);
//     // drive data into the chart roughly every second
//     // in a normal use case, real time data would arrive through the network or some other mechanism
//     var d = 0;
//     function dataGenerator() {
//         var timeout = Math.round(timeScale(normal()));
//         setTimeout(function() {
//             // create new data item
//             var now = new Date();
//             var obj = {
//                 value: valueScale(Math.random()), // random data
// //value: Math.round((d++ % 60) / 60 * 95), // ramp data
//                 time: now,
//                 color: "red",
//                 ts: now.getTime(),
//                 interval: timeout
//             };
//             // send the datum to the chart
//             chart.datum(obj);
//             // do forever
//             dataGenerator();
//         }, timeout);
//     }
//     // start the data generator
//     dataGenerator();
