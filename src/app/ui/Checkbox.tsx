import {type JSX, useState} from 'react';
import {interpolateColor} from "./utils";

interface Props {
    label: string
    labelColor?: string
    checked?: boolean;
    width?: number;
    height?: number;
    borderRadius?: number;
    backgroundColor?: string;
    backgroundColorChecked?: string;
    borderColor?: string;
    textSpacing?: number;
    marginTop?: number;
    onChange: (checked: boolean) => void;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    disabled?: boolean;
}

/**
 * Simple checkbox because native HTML checkbox doesn't allow any style changes
 * @param props The properties from the parent
 * @return The checkbox component
 */
export default function Checkbox(props: Props): JSX.Element {

    const {
        label,
        labelColor = '#d2933f',
        onChange,
        checked = false,
        width = 12,
        height = 12,
        borderRadius = 3,
        borderColor = '#d2933f',
        backgroundColor = '#202020',
        backgroundColorChecked = interpolateColor(backgroundColor, borderColor, 15),
        textSpacing = 6,
        marginTop = 0,
        marginBottom = 0,
        marginLeft = 0,
        marginRight = 0,
        disabled = false,
    } = props;

    const [hovered, setHovered] = useState<boolean>(false)

    return (
        <span
            style={{
                marginTop: marginTop,
                marginBottom: marginBottom,
                marginLeft: marginLeft,
                marginRight: marginRight,
                cursor: disabled ? 'not-allowed' : 'pointer'
            }}
            onClick={() => disabled ? undefined : onChange(!checked)}
            onMouseOver={() => setHovered(true)}
            onMouseOut={() => setHovered(false)}
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
                    verticalAlign: ' middle',
                    background: checked || (hovered && !disabled) ? backgroundColorChecked : backgroundColor,
                    border: '1px solid #ccc',
                    borderColor: disabled ? interpolateColor(borderColor, backgroundColor, 60): borderColor,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                }}
            >{checked ?
                <span style={{
                    display: 'inline-block',
                    position: 'relative',
                    top: -5,
                    left: 1,
                    fontSize: width,
                    fontWeight: 800,
                    color: disabled ? interpolateColor(borderColor, backgroundColor, 30): borderColor,
                }}>&#10003;</span> :
                <span/>
            }</span>
            <span style={{
                marginLeft: textSpacing,
                color: disabled ? interpolateColor(labelColor, backgroundColor, 50): labelColor
            }}>
                {label}
            </span>
        </span>
    );
}