import {type JSX} from "react";
import {formatTime} from "stream-charts";
import type {Theme} from "../../ui/Themes.ts";

type Props = {
    theme: Theme
    lag: number
}

/**
 * Shows the update lag: how far (ms) the chart's time is behind the data's time (never less than 0)
 * @param props The theme, and the lag (ms)
 * @return The lag display
 */
export function LagDisplay(props: Props): JSX.Element {
    const {theme, lag} = props;
    return (
        <div style={{color: theme.color}}>
            Update Lag: {formatTime(Math.max(0, lag))} ms
        </div>
    )
}