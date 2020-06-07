import React from 'react';

interface Props {
    label: string;
    checked?: boolean;
    onChange: (checked: boolean) => void;
    width?: number;
    height?: number;
    borderRadius?: number;
    backgroundColor?: string;
    backgroundColorChecked?: string;
    borderColor?: string;
    textSpacing?: number;
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
}

/**
 * Simple checkbox because native html checkbox doesn't allow any style changes
 * @param {Props} props The properties from the parent
 * @return {JSX.Element} The checkbox component
 * @constructor
 */
export default function Checkbox(props: Props): JSX.Element {

    const {
        label,
        onChange,
        checked = false,
        width = 12,
        height = 12,
        borderRadius = 3,
        borderColor = '#d2933f',
        backgroundColor = '#202020',
        backgroundColorChecked = '#202020',
        textSpacing = 6,
        marginTop = 0,
        marginBottom = 0,
        marginLeft = 10,
        marginRight = 10

} = props;

    return (
        <span
            style={{
                marginTop: marginTop,
                marginBottom: marginBottom,
                marginLeft: marginLeft,
                marginRight: marginRight,
                cursor: 'pointer'
            }}
            onClick={() => onChange(!checked)}
        >
            <span
                style={{
                    display: 'inline-block',
                    position: 'relative',
                    top: -1,
                    width: width,
                    height: height,
                    borderRadius: borderRadius,
                    marginTop: -1,
                    verticalAlign:' middle',
                    background: checked ? backgroundColorChecked : backgroundColor,
                    border: '1px solid #ccc',
                    borderColor: borderColor,
                    cursor: 'pointer'
                }}
            >{checked ? <span style={{
                display: 'inline-block',
                position: 'relative',
                top: -5,
                left: 1,
                fontSize: width,
                fontWeight: 800
            }}>&#10003;</span> : <span/>}</span>
            <span style={{marginLeft: textSpacing}}>{label}</span>
        </span>
    );
}