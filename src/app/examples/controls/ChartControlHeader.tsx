import type {ControlBarType} from "../../ui/ExpandableControlBar.tsx";
import type {Theme} from "../../ui/Themes.ts";
import type {JSX} from "react";

type Props = {
    type: ControlBarType
    theme: Theme
    // title: string
    children: JSX.Element | Array<JSX.Element>
}

/**
 * The header of a chart's control bar (shown when the bar is collapsed, and above the controls
 * when it's expanded): its children in a row, in the theme's color
 * @param props The control bar's type (unused), the theme, and the children (e.g. the run/reset
 * buttons, and icons showing the chart's settings)
 * @return The header
 */
export function ChartControlsHeader(props: Props): JSX.Element {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            height: 40,
            color: props.theme.color,
            gap: 10
        }}>
            {props.children}
        </div>
    )
}
