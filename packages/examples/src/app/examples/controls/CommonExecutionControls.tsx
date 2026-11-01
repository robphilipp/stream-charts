import {type JSX} from "react";
import type {Theme} from "../../ui/Themes.ts";
import {Button} from "../../ui/Button.tsx";
import {buttonStyle} from "../../ui/utils.ts";
import type {ControlBarType} from "../../ui/ExpandableControlBar.tsx";
import {PauseIcon, PlayIcon, ResetIcon,} from "../../ui/Icons.tsx";

type Props = {
    type: ControlBarType
    theme: Theme
    isRunning: boolean
    onRunPauseClick: () => void
    onClearClick: () => void
    children: JSX.Element | Array<JSX.Element>
}

/**
 * The run/pause and reset buttons (the reset button is disabled while the chart is running),
 * followed by the children
 * @param props The control bar's type (unused), the theme, whether the chart is running, the
 * handlers for the run/pause and reset buttons, and the children
 * @return The buttons, and the children
 */
export function CommonExecutionControls(props: Props): JSX.Element {
    const {
        theme,
        isRunning,
        onRunPauseClick,
        onClearClick,
    } = props

    return (<>
        <div style={{display: 'flex', alignItems: 'center', gap: 5}}>
            <Button
                style={{...buttonStyle(theme), width: 70}}
                onClick={onRunPauseClick}
                icon={color => isRunning ? <PauseIcon color={color}/> : <PlayIcon color={color}/>}
            >
                {isRunning ? "Pause" : "Run"}
            </Button>
            <Button
                style={{...buttonStyle(theme), width: 70}}
                onClick={onClearClick}
                icon={color => <ResetIcon color={color}/>}
                disabled={isRunning}
            >
                Reset
            </Button>
            {props.children}
        </div>
    </>)
}