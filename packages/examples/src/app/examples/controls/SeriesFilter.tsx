import {type CSSProperties, type JSX} from "react";
import type {Theme} from "../../ui/Themes.ts";

/**
 * The style of the text field: the theme's colors
 * @param theme The theme
 * @return The text field's style
 */
const inputStyle = (theme: Theme): CSSProperties => ({
    backgroundColor: theme.backgroundColor,
    outlineStyle: 'none',
    borderColor: theme.color,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 3,
    color: theme.color,
    fontSize: 12,
    padding: 4,
    height: 20,
})

type Props = {
    theme: Theme
    filterValue: string
    handleFilterUpdate: (value: string) => void
}

/**
 * Text field for the regular expression that filters which series the chart shows
 * @param props The theme, the filter's text, and the handler for new text
 * @return The text field
 */
export function SeriesFilter(props: Props): JSX.Element {
    const {theme, filterValue, handleFilterUpdate} = props;
    return (
        <label style={{color: theme.color}}>
            <input
                type="text"
                value={filterValue}
                onChange={event => handleFilterUpdate(event.currentTarget.value)}
                style={inputStyle(theme)}
                placeholder="RegEx filter"
            />
        </label>

    )
}