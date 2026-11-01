import {type HTMLAttributes, type JSX} from 'react';
import type {Theme} from "./Themes.ts";

// Extend the native hr attributes to support all standard HTML props
interface Props extends HTMLAttributes<HTMLHRElement> {
    theme: Theme
    thickness?: number | string
    verticalSpacing?: number | string
}

/**
 * A horizontal divider (an `<hr>`) in the theme's disabled background color, spanning its container
 * @param props The theme, the divider's thickness (default 1px), the space above and below it
 * (default 10px), and any other `<hr>` attributes
 * @return The divider
 */
export function Divider(props: Props): JSX.Element {
    const {
        theme,
        thickness = '1px',
        verticalSpacing = '10px',
        style,
        ...hrProps
    } = props;

    const defaultStyle = {
        border: '0',
        height: thickness,
        width: '100%',
        alignSelf: 'stretch',
        flexShrink: 0,
        backgroundColor: theme.disabledBackgroundColor,
        marginTop: verticalSpacing,
        marginBottom: verticalSpacing,
        ...style,
    };

    return <hr style={defaultStyle} {...hrProps} />;
};
