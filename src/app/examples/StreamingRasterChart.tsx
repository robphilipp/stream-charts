import * as React from 'react';
import {useEffect, useRef, useState} from 'react';
import {Datum, Series} from "../charts/datumSeries";
import RasterChart from "../charts/RasterChart";
import {ChartData} from "../charts/chartData";
import {Observable, Subscription} from "rxjs";
import {regexFilter} from "../charts/regexFilter";
import Checkbox from "./Checkbox";
import {randomSpikeDataObservable} from "./randomData";

interface Visibility {
    tooltip: boolean;
    tracker: boolean;
    magnifier: boolean;
}

const initialVisibility: Visibility = {
    tooltip: false,
    tracker: false,
    magnifier: false
}

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
 * An example wrapper to the {@link RasterChart} that accepts an rxjs observable. The {@link RasterChart} manages
 * the subscription to the observable, but we can control when the {@link RasterChart} subscribes through the
 * `shouldSubscribe` property. Once subscribed, the observable emits a sequence or random chart data. The
 * {@link RasterChart} updates itself with the new data without causing React to re-render the component. In this
 * example, we delay the subscription to the observable by 1 second.
 * after the {@link RasterChart} has mounted.
 * @param {Props} props The properties passed down from the parent
 * @return {Element} The streaming raster chart
 * @constructor
 */
function StreamingRasterChart(props: Props): JSX.Element {
    const {seriesList, timeWindow = 100, seriesHeight = 20, plotWidth = 500} = props;

    const observableRef = useRef<Observable<ChartData>>(randomSpikeDataObservable(seriesList.map(series => series.name)));
    const subscriptionRef = useRef<Subscription>();

    const [filterValue, setFilterValue] = useState<string>('');
    const [filter, setFilter] = useState<RegExp>(new RegExp(''));

    const [visibility, setVisibility] = useState<Visibility>(initialVisibility);

    const [shouldSubscribe, setShouldSubscribe] = useState<boolean>(false);

    /**
     * Called when the user changes the regular expression filter
     * @param {string} updatedFilter The updated the filter
     */
    function handleUpdateRegex(updatedFilter: string): void {
        setFilterValue(updatedFilter);
        regexFilter(updatedFilter).ifSome(regex => setFilter(regex));
    }

    const inputStyle = {
        backgroundColor: '#202020',
        outlineStyle: 'none',
        borderColor: '#d2933f',
        borderStyle: 'solid',
        borderWidth: 1,
        borderRadius: 3,
        color: '#d2933f',
        fontSize: 12,
        padding: 4,
        margin: 6,
        marginRight: 20
    };

    useEffect(
        () => {
            setTimeout(() => setShouldSubscribe(true), 1000);
        },
        []
    );

    return (
        <div style={{color: '#d2933f'}}>
            <p>
                <label>regex filter <input
                    type="text"
                    value={filterValue}
                    onChange={event => handleUpdateRegex(event.currentTarget.value)}
                    style={inputStyle}
                /></label>
                <Checkbox
                    key={1}
                    checked={visibility.tooltip}
                    label="tooltip"
                    onChange={() => setVisibility({tooltip: !visibility.tooltip, tracker: false, magnifier: false})}
                />
                <Checkbox
                    key={2}
                    checked={visibility.tracker}
                    label="tracker"
                    onChange={() => setVisibility({tooltip: false, tracker: !visibility.tracker, magnifier: false})}
                />
                <Checkbox
                    key={3}
                    checked={visibility.magnifier}
                    label="magnifier"
                    onChange={() => setVisibility({tooltip: false, tracker: false, magnifier: !visibility.magnifier})}
                />
            </p>
            <RasterChart
                width={plotWidth}
                height={seriesList.length * seriesHeight}
                seriesList={seriesList}
                seriesObservable={observableRef.current}
                shouldSubscribe={shouldSubscribe}
                onSubscribe={subscription => subscriptionRef.current = subscription}
                onUpdateTime={(t: number) => {
                    if(t > 3000) subscriptionRef.current!.unsubscribe()
                }}
                timeWindow={timeWindow}
                windowingTime={100}
                margin={{top: 30, right: 20, bottom: 30, left: 75}}
                tooltip={{visible: visibility.tooltip}}
                magnifier={{visible: visibility.magnifier, magnification: 5}}
                tracker={{visible: visibility.tracker}}
                filter={filter}
            />
        </div>
    );
}

export default StreamingRasterChart;
