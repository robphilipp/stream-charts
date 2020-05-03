import {default as React, useRef, useState} from "react";
import {Series} from "../charts/datumSeries";
import ScatterChart from "../charts/ScatterChart";
import {ChartData, randomWeightDataObservable} from "./randomData";
import {Observable} from "rxjs";

// interface Point {
//     x: number;
//     y: number;
// }
//
// function genData(length: number, delta: number): Array<Point> {
//     return Array
//         .from({length: length}, () => ({x: 0, y: Math.random() * delta}))
//         .map((datum, index, array) =>
//             ({x: index, y: array[Math.max(0, index - 1)].y + datum.y})
//         );
// }


/**
 * The properties
 */
interface Props {
    timeWindow?: number;
    seriesList: Array<Series>;
    plotHeight?: number;
    plotWidth?: number;
}

export function StreamingScatterChart(props: Props): JSX.Element {
    const {seriesList, timeWindow = 100, plotHeight = 20, plotWidth = 500} = props;

    const currentTimeRef = useRef<number>(0);

    const observableRef = useRef<Observable<ChartData>>(randomWeightDataObservable(seriesList.length, 0.1));

    const [filterValue, setFilterValue] = useState<string>('');
    const [filter, setFilter] = useState<RegExp>(new RegExp(''));

    const [tooltipVisible, setTooltipVisible] = useState(false);
    const [magnifierVisible, setMagnifierVisible] = useState(false);
    const [magnification, setMagnification] = useState(5);
    const [trackerVisible, setTrackerVisible] = useState(false);

    // // called on mount to set up the <g> element into which to render
    // useEffect(
    //     () => {
    //         const subscription = observableRef.current.subscribe(data => {
    //             if(data.maxTime > 3000) {
    //                 subscription.unsubscribe();
    //             }
    //             else {
    //                 // updated the current time to be the max of the new data
    //                 currentTimeRef.current = data.maxTime;
    //
    //                 // for each series, add a point if there is a  spike value (i.e. spike value > 0)
    //                 seriesRef.current = seriesRef.current.map((series, i) => {
    //                     const newValue = (series.data.length > 0 ? series.data[series.data.length-1].value : 0) +
    //                         data.newPoints[i].datum.value;
    //
    //                     const newPoint = {time: data.newPoints[i].datum.time, value: newValue};
    //                     series.data.push(newPoint);
    //                     // console.log(newPoint);
    //                     return series;
    //                 });
    //
    //                 // update the data
    //                 setLiveData(seriesRef.current);
    //             }
    //         });
    //
    //         // stop the stream on dismount
    //         return () => subscription.unsubscribe();
    //     }, [timeWindow]
    // );

    /**
     * Called when the user changes the regular expression filter
     * @param {string} updatedFilter The updated the filter
     */
    function handleUpdateRegex(updatedFilter: string): void {
        setFilterValue(updatedFilter);
        let updatedRegex;
        try {updatedRegex = new RegExp(updatedFilter)} catch(error) {}
        if (updatedRegex) {
            setFilter(updatedRegex)
        } else {
            setFilter(filter);
        }
    }

    return (
        <div>
            <p>
                <label>regex filter <input
                    type="text"
                    value={filterValue}
                    onInput={event => handleUpdateRegex(event.currentTarget.value)}
                /></label>
                <label><input
                    type="checkbox" checked={tooltipVisible}
                    onChange={() => {
                        setTooltipVisible(!tooltipVisible)
                        if (trackerVisible) setTrackerVisible(false);
                        if (magnifierVisible) setMagnifierVisible(false);
                    }}
                /> tooltip</label>&nbsp;&nbsp;
                <label><input
                    type="checkbox"
                    checked={trackerVisible} onChange={() => {
                        setTrackerVisible(!trackerVisible);
                        if (magnifierVisible) setMagnifierVisible(false);
                        if (tooltipVisible) setTooltipVisible(false);
                    }}
                /> tracker</label>&nbsp;&nbsp;
                <label><input
                    type="checkbox"
                    checked={magnifierVisible} onChange={() => {
                    setMagnifierVisible(!magnifierVisible);
                    if (trackerVisible) setTrackerVisible(false);
                    if (tooltipVisible) setTooltipVisible(false);
                }}
                /> magnifier</label>&nbsp;&nbsp;
                {magnifierVisible ?
                    (<label><input
                        type="range"
                        value={magnification}
                        min={1}
                        max={10}
                        step={1}
                        onChange={event => setMagnification(parseInt(event.target.value))}
                    /> ({magnification})</label>) :
                    (<span/>)
                }
            </p>
            <ScatterChart
                width={plotWidth}
                height={plotHeight}
                seriesList={seriesList}
                seriesObservable={observableRef.current}
                minTime={Math.max(0, currentTimeRef.current - timeWindow)}
                maxTime={Math.max(currentTimeRef.current, timeWindow)}
                timeWindow={timeWindow}
                margin={{top: 30, right: 20, bottom: 30, left: 75}}
                tooltip={{visible: tooltipVisible}}
                magnifier={{visible: magnifierVisible, magnification: magnification}}
                // tracker={{visible: trackerVisible}}
                filter={filter}
                // seriesColors={new Map()}
            />
        </div>
    );
}