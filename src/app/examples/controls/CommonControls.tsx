import {type JSX} from "react";

type Props = {
    children: JSX.Element | Array<JSX.Element>
}

/**
 * The controls common to the charts, in a column (shown when the control bar is expanded)
 * @param props The controls
 * @return The controls
 */
export function CommonControls(props: Props): JSX.Element {
    const {children} = props

    return (
        <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            flexDirection: 'column',
            gap: 10,
            padding: 10
        }}>
            {children}
        </div>
    )
}