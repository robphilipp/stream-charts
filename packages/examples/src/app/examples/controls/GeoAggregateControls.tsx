import {type JSX} from "react";
import type {Theme} from "../../ui/Themes.ts";
import {DropDown, type DropDownOption} from "../../ui/DropDown.tsx";

const MODE_OPTIONS: Array<DropDownOption<'points' | 'aggregates'>> = [
    {value: 'points', label: 'Events'},
    {value: 'aggregates', label: 'Aggregates'},
]

type Props = {
    theme: Theme
    mode: 'points' | 'aggregates'
    handleModeChange: (mode: 'points' | 'aggregates') => void
    rollupNames: Array<string>
    rollupName: string
    handleRollupNameChange: (rollupName: string) => void
    measureNames: Array<string>
    colorBy: string
    handleColorByChange: (colorBy: string) => void
}

/**
 * The geo example's controls for what the plot shows: each event, or a roll-up's aggregates (and
 * then, which roll-up, and what colors the aggregates)
 * @param props The theme, and the current choices and their handlers
 * @return The drop-downs, with their labels
 */
export function GeoAggregateControls(props: Props): JSX.Element {
    const {
        theme, mode, handleModeChange, rollupNames, rollupName, handleRollupNameChange,
        measureNames, colorBy, handleColorByChange,
    } = props
    const aggregates = mode === 'aggregates'
    return (
        <>
            <label style={{color: theme.color}}>
                <DropDown theme={theme} name="geo-mode" options={MODE_OPTIONS} value={mode} onChange={handleModeChange}/>
                <span style={{paddingLeft: 10}}>Show</span>
            </label>
            <label style={{color: aggregates ? theme.color : theme.disabledColor}}>
                <DropDown
                    theme={theme}
                    name="geo-rollup"
                    options={rollupNames.map(name => ({value: name, label: name}))}
                    value={rollupName}
                    onChange={handleRollupNameChange}
                    disabled={!aggregates}
                />
                <span style={{paddingLeft: 10}}>Roll-up</span>
            </label>
            <label style={{color: aggregates ? theme.color : theme.disabledColor}}>
                <DropDown
                    theme={theme}
                    name="geo-color-by"
                    options={[{value: 'none', label: 'Nothing'}, {value: 'count', label: 'count'}, ...measureNames.map(name => ({value: name, label: name}))]}
                    value={colorBy}
                    onChange={handleColorByChange}
                    disabled={!aggregates}
                />
                <span style={{paddingLeft: 10}}>Color by</span>
            </label>
        </>
    )
}
