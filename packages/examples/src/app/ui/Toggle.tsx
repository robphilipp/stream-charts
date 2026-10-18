import {useState, type JSX} from "react";
import {noop} from "../charts";
import {ToggleStatus} from "./toggleUtils.ts";

export {ToggleStatus} from "./toggleUtils.ts";

interface Props {
    leftLabel?: string
    rightLabel?: string
    labelFontColor?: string
    toggleOnBackgroundColor?: string
    toggleOffBackgroundColor?: string
    toggleOnColor?: string
    toggleOffColor?: string
    toggleBorderColor?: string
    labelSpacing?: number
    toggleWidth?: number
    toggleHeight?: number
    toggleOffset?: number
    onToggle?: (status: ToggleStatus) => void

    disabled?: boolean
    disabledBackgroundColor?: string
    disabledColor?: string
    disabledBorderColor?: string
}

/**
 * A toggle switch between two labels (by default "On" and "Off"), which starts out off, and calls
 * `onToggle` with the new status each time it's clicked
 * @param props The labels, the colors (on, off, and disabled), the switch's size, the handler for
 * a new status, and whether the switch is disabled
 * @return The toggle switch
 */
export function Toggle(props: Props): JSX.Element {
    const {
        leftLabel = "On",
        rightLabel = "Off",
        labelFontColor = "#202020",
        toggleOffColor = "#202020",
        toggleOffBackgroundColor = "#d2933f",
        toggleOnColor = "#d2933f",
        toggleOnBackgroundColor = "#202020",
        toggleBorderColor = "#d2933f",
        labelSpacing = 5,
        toggleWidth = 35,
        toggleHeight = 20,
        toggleOffset = 1,
        onToggle = noop,

        disabled = false,
        disabledBackgroundColor = "#d2933f",
        disabledColor = "#202020",
        disabledBorderColor = "#d2933f"
    } = props

    const [toggleStatus, setToggleStatus] = useState<ToggleStatus>(ToggleStatus.OFF)

    const toggleLocation = (status: ToggleStatus): number => status === ToggleStatus.OFF ?
        toggleOffset :
        toggleWidth - Math.min(toggleWidth, toggleHeight) + toggleOffset

    const toggle = (status: ToggleStatus): ToggleStatus => status === ToggleStatus.OFF ?
        ToggleStatus.ON :
        ToggleStatus.OFF

    function toggleColor(status: ToggleStatus): string {
        if (disabled) {
            return disabledColor
        }
        if (status === ToggleStatus.ON) {
            return toggleOnColor
        }
        return toggleOffColor
    }

    function toggleBackgroundColor(status: ToggleStatus): string {
        if (disabled) {
            return disabledBackgroundColor
        }
        if (status === ToggleStatus.OFF) {
            return toggleOffBackgroundColor
        }
        return toggleOnBackgroundColor
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: labelSpacing,
            color: disabled ? labelFontColor : disabledColor,
            transition: "0.4s",
        }}>
            <span style={{
                marginLeft: labelSpacing,
                position: "relative",
                top: toggleOffset,
                color: disabled ? disabledColor : labelFontColor,
                transition: "0.3s",
            }}>{leftLabel}</span>
            <label
                style={{
                    position: "relative",
                    display: "inline-block",
                    width: toggleWidth,
                    height: toggleHeight,
                    backgroundColor: toggleBackgroundColor(toggleStatus),
                    borderRadius: Math.min(toggleHeight, toggleWidth),
                    border: "solid",
                    borderWidth: 1,
                    borderColor: disabled ? disabledBorderColor : toggleBorderColor,
                    transition: "0.3s",
                }}>
                <input
                    type="checkbox"
                    style={{opacity: 0, width: 0, height: 0}}
                    onClick={() => {
                        const status = toggle(toggleStatus)
                        setToggleStatus(status)
                        onToggle(status)
                    }}
                />
                <span style={{
                    position: "absolute",
                    cursor: "pointer",
                    height: Math.min(toggleWidth, toggleHeight) - 2 * toggleOffset,
                    width: Math.min(toggleWidth, toggleHeight) - 2 * toggleOffset,
                    top: toggleOffset,
                    left: toggleLocation(toggleStatus),
                    right: toggleOffset,
                    bottom: toggleOffset,
                    backgroundColor: toggleColor(toggleStatus),
                    transition: "0.3s",
                    borderRadius: Math.min(toggleHeight, toggleWidth)
                }}/>
            </label>
            <span style={{
                marginLeft: labelSpacing,
                position: "relative",
                top: toggleOffset,
                color: disabled ? disabledColor : labelFontColor,
                transition: "0.3s",
            }}>{rightLabel}</span>
        </div>
    )
}