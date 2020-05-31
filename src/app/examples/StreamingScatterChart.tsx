import {default as React, useRef, useState} from "react";
import {Series} from "../charts/datumSeries";
import ScatterChart from "../charts/ScatterChart";
import {ChartData, randomWeightDataObservable} from "./randomData";
import {Observable, Subscription} from "rxjs";
import {regexFilter} from "../charts/regexFilter";
import Checkbox from "./Checkbox";

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
    plotHeight?: number;
    plotWidth?: number;
}

export function StreamingScatterChart(props: Props): JSX.Element {
    const {seriesList, timeWindow = 100, plotHeight = 20, plotWidth = 500} = props;

    const currentTimeRef = useRef<number>(0);

    const observableRef = useRef<Observable<ChartData>>(randomWeightDataObservable(seriesList.length, 0.1));
    const subscriptionRef = useRef<Subscription>();

    const [filterValue, setFilterValue] = useState<string>('');
    const [filter, setFilter] = useState<RegExp>(new RegExp(''));

    const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
    const [magnification, setMagnification] = useState(5);

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

    return (
        <div>
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
                {visibility.magnifier ?
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
                onSubscribe={subscription => subscriptionRef.current = subscription}
                onUpdateTime={(t: number) => {
                    if(t > 1000) subscriptionRef.current!.unsubscribe()
                }}
                minTime={Math.max(0, currentTimeRef.current - timeWindow)}
                maxTime={Math.max(currentTimeRef.current, timeWindow)}
                timeWindow={timeWindow}
                margin={{top: 30, right: 20, bottom: 30, left: 75}}
                tooltip={{visible: visibility.tooltip}}
                tooltipValueLabel='weight'
                magnifier={{visible: visibility.magnifier, magnification: magnification, radius: 150}}
                tracker={{visible: visibility.tracker}}
                filter={filter}
                // seriesColors={new Map()}
            />
        </div>
    );
}