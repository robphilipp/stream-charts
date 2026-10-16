import {type JSX} from "react";
import {DROP_DATA_AFTER_MS, type DropAfterOptions} from "../options/dropDataAfter.ts";
import type {Theme} from "../../ui/Themes.ts";
import {DropDown, type DropDownOption} from "../../ui/DropDown.tsx";

// the drop-after options, by name (e.g. "10 seconds")
const OPTIONS: Array<DropDownOption<string>> = Array.from(DROP_DATA_AFTER_MS.keys()).map(name => ({value: name, label: name}))

type Props = {
    theme: Theme
    value: DropAfterOptions
    handleDropAfterChange: (millis: number) => void
    disabled: boolean
}

/**
 * Drop-down for how long the chart keeps data (e.g. "Drop after 10 s", or "Keep All")
 * @param props The theme, the selected option, the handler for a new selection (handed the
 * option's time, in ms -- `Infinity` to keep all the data), and whether the drop-down is disabled
 * @return The drop-down
 */
export function DropDataControl(props: Props): JSX.Element {
    const {
        theme,
        value,
        handleDropAfterChange,
        disabled
    } = props

    return (
        <DropDown
            theme={theme}
            name="drop_after"
            options={OPTIONS}
            value={value.description ?? ''}
            onChange={name => handleDropAfterChange(DROP_DATA_AFTER_MS.get(name) || Infinity)}
            disabled={disabled}
        />
    )
}
