import * as React from 'react';
import {useEffect, useRef, useState} from 'react';
import {Datum, Series} from "../charts/datumSeries";
import RasterChart from "../charts/RasterChart";
import {ChartData, randomSpikeDataObservable} from "./randomData";
import {Observable, Subscription} from "rxjs";
import {regexFilter} from "../charts/regexFilter";
import ScatterChart from "../charts/ScatterChart";

/**
 * The properties
 */
interface Props {
    timeWindow?: number;
    seriesList: Array<Series>;
    seriesHeight?: number;
    plotWidth?: number;
}

/**
 * The spike-chart data produced by the rxjs observable that is pushed to the `RasterChart`
 */
export interface SpikesChartData {
    maxTime: number;
    spikes: Array<{index: number; spike: Datum}>
}

/**
 * An example wrapper to the `RasterChart` that accepts an rxjs observable stream of data and updates the
 * `RasterChart` with the new data.
 * @param {Props} props The properties passed down from the parent
 * @return {JSX.Element} The streaming raster chart
 * @constructor
 */
function StreamingRasterChart(props: Props): JSX.Element {
    const {seriesList, timeWindow = 100, seriesHeight = 20, plotWidth = 500} = props;

    const [liveData, setLiveData] = useState(seriesList);
    const seriesRef = useRef<Array<Series>>(seriesList);
    const currentTimeRef = useRef<number>(0);

    const observableRef = useRef<Observable<ChartData>>(randomSpikeDataObservable(seriesList.length));
    const subscriptionRef = useRef<Subscription>();

    const [filterValue, setFilterValue] = useState<string>('');
    const [filter, setFilter] = useState<RegExp>(new RegExp(''));

    const [tooltipVisible, setTooltipVisible] = useState(false);
    const [magnifierVisible, setMagnifierVisible] = useState(false);
    const [trackerVisible, setTrackerVisible] = useState(false);

    /**
     * Called when the user changes the regular expression filter
     * @param {string} updatedFilter The updated the filter
     */
    function handleUpdateRegex(updatedFilter: string): void {
        setFilterValue(updatedFilter);
        regexFilter(updatedFilter).ifSome(regex => setFilter(regex));
    }

    return (
        <div>
            <p>
                <label>regex filter <input
                    type="text"
                    value={filterValue}
                    onInput={event => handleUpdateRegex(event.currentTarget.value)}
                /></label>
                <label>tooltip <input type="checkbox" checked={tooltipVisible}
                                      onChange={() => setTooltipVisible(!tooltipVisible)}/></label>&nbsp;&nbsp;
                <label>magnifier <input type="checkbox" checked={magnifierVisible} onChange={() => {
                    setMagnifierVisible(!magnifierVisible);
                    if (trackerVisible) setTrackerVisible(false);
                }}/></label>&nbsp;&nbsp;
                <label>tracker <input type="checkbox" checked={trackerVisible} onChange={() => {
                    setTrackerVisible(!trackerVisible);
                    if (magnifierVisible) setMagnifierVisible(false);
                }}/></label>
            </p>
            <RasterChart
                width={plotWidth}
                height={seriesList.length * seriesHeight + 30 + 30}
                // seriesHeight={seriesHeight}
                seriesList={liveData}
                seriesObservable={observableRef.current}
                onSubscribe={subscription => subscriptionRef.current = subscription}
                onUpdateTime={(t: number) => {
                    if(t > 5000) subscriptionRef.current!.unsubscribe()
                }}
                minTime={Math.max(0, currentTimeRef.current - timeWindow)}
                maxTime={Math.max(currentTimeRef.current, timeWindow)}
                timeWindow={timeWindow}
                margin={{top: 30, right: 20, bottom: 30, left: 75}}
                tooltip={{visible: tooltipVisible}}
                magnifier={{visible: magnifierVisible}}
                tracker={{visible: trackerVisible}}
                filter={filter}
            />
        </div>
    );
}

export default StreamingRasterChart;
