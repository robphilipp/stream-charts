import {type JSX, useId} from "react";
import {lineColorScale} from "../charts/plots/colorizedLine.ts";

/**
 * A chevron pointing right (forward)
 * @param props The icon's color
 * @return The icon
 */
export function ForwardIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="15" height="15" style={{display: 'block', flexShrink: 0}}>
            <path
                d="M6 3 L12 7.5 L6 12"
                stroke={color}
                fill="none"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    )
}

/**
 * A chevron pointing right, with a bar at the right edge (go to the last)
 * @param props The icon's color
 * @return The icon
 */
export function LastIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="15" height="15" style={{display: 'block', flexShrink: 0}}>
            <path
                d="M3 3 L9 7.5 L3 12"
                stroke={color}
                fill="none"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            <line
                x1="12"
                y1="3"
                x2="12"
                y2="12"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    )
}

/**
 * A chevron pointing left (back)
 * @param props The icon's color
 * @return The icon
 */
export function BackIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="15" height="15" style={{display: 'block', flexShrink: 0}}>
            <path
                d="M9 3 L3 7.5 L9 12"
                stroke={color}
                fill="none"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    )
}

/**
 * A chevron pointing left, with a bar at the left edge (go to the first)
 * @param props The icon's color
 * @return The icon
 */
export function FirstIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="15" height="15" style={{display: 'block', flexShrink: 0}}>
            <path
                d="M12 3 L6 7.5 L12 12"
                stroke={color}
                fill="none"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            <line
                x1="3"
                y1="3"
                x2="3"
                y2="12"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    )
}

/**
 * A filled triangle pointing right (run)
 * @param props The icon's color
 * @return The icon
 */
export function PlayIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="16" height="16" style={{display: 'block', flexShrink: 0}}>
            <path
                d="M6 3 L12 7.5 L6 12 L6 3"
                stroke={color}
                fill={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    )
}

/**
 * Two vertical bars (pause)
 * @param props The icon's color
 * @return The icon
 */
export function PauseIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="16" height="16" style={{display: 'block', flexShrink: 0}}>
            <line
                x1="5"
                y1="3"
                x2="5"
                y2="12"
                stroke={color}
                strokeWidth={3}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            <line
                x1="11"
                y1="3"
                x2="11"
                y2="12"
                stroke={color}
                strokeWidth={3}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    )
}

/**
 * A circular arrow (reset)
 * @param props The icon's color
 * @return The icon
 */
export function ResetIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="16" height="16" style={{display: 'block', flexShrink: 0}}>
            <defs>
                <marker id="arrow" viewBox="0 0 12 12" refX="2" refY="5" markerWidth="5" markerHeight="5"
                        orient="auto-start-reverse">
                    <path d="M 0 1 L 9 4 L 0 9 z" fill={color}/>
                </marker>
            </defs>
            <path d="M 15,10 A 5,5 0 1 1 15,5"
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  markerEnd="url(#arrow)"
            />
        </svg>
    )
}


/**
 * Two filled triangles pointing toward each other (shown when the control bar is expanded: clicking it collapses the bar)
 * @param props The icon's color
 * @return The icon
 */
export function ExpandedIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="15" height="15" style={{display: 'block', flexShrink: 0}}>
            <path
                d="M6 3 L10 7.5 L6 12 L6 3"
                stroke={color}
                fill={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                transform={`translate(0, -5) rotate(90, 7.5 7.5)`}
            />
            <path
                d="M6 3 L10 7.5 L6 12 L6 3"
                stroke={color}
                fill={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                transform={`translate(0, 5) rotate(-90, 7.5 7.5)`}
            />
        </svg>
    )
}

/**
 * Two filled triangles pointing away from each other (shown when the control bar is collapsed: clicking it expands the bar)
 * @param props The icon's color
 * @return The icon
 */
export function CollapsedIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="15" height="15" style={{display: 'block', flexShrink: 0}}>
            <path
                d="M6 3 L10 7.5 L6 12 L6 3"
                stroke={color}
                fill={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                transform={`translate(0,4) rotate(90, 7.5 7.5)`}
            />
            <path
                d="M6 3 L10 7.5 L6 12 L6 3"
                stroke={color}
                fill={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                transform={`translate(0, -4) rotate(-90, 7.5 7.5)`}
            />
        </svg>
    )
}

/**
 * A clock face (the update lag)
 * @param props The icon's color, and its fill (default: none)
 * @return The icon
 */
export function LagIcon(props: { color: string, fill: string }): JSX.Element {
    const {color, fill = "none"} = props
    return (
        <svg width="15" height="15" style={{display: 'block', flexShrink: 0}}>
            <circle cx="7.5" cy="7.5" r="6" fill={fill} stroke={color} strokeWidth={2}/>
            <line x1={7.5} y1={7.5} x2={14} y2={7.5} stroke={color} strokeWidth={1}/>
            <line x1={7.5} y1={7.5} x2={7.5} y2={3} stroke={color} strokeWidth={1}/>
        </svg>
    )
}

/**
 * A filled funnel (the series filter)
 * @param props The icon's color
 * @return The icon
 */
export function FilterIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="15" height="15" style={{display: 'block', flexShrink: 0}}>
            <path
                d="M0 0 L14 0 L8 8 L8 15 L6 15 L6 8 L0 0"
                stroke={color}
                fill={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    )
}

/**
 * A box with lines of text, and a mouse pointer (the tooltip)
 * @param props The icon's color
 * @return The icon
 */
export function TooltipIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="15" height="15" style={{display: 'block', flexShrink: 0}}>
            <rect width="15" height="10" rx={3} ry={3} strokeWidth={1} stroke={color} fill="none"/>
            <path
                d="M0 6 L4 0 L8 6 L5 5 L5 12 L3 12 L3 5 L0 6"
                stroke={color}
                fill={color}
                strokeWidth={1}
                strokeLinejoin="round"
                strokeLinecap="round"
                transform={`translate(5, 3) rotate(-30, 7.5 7.5)`}
            />
            <line
                x1={3}
                y1={3}
                x2={12}
                y2={3}
                stroke={color}
                strokeWidth={1}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            <line
                x1={3}
                y1={6}
                x2={12}
                y2={6}
                stroke={color}
                strokeWidth={1}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    )
}

/**
 * A vertical line, and a mouse pointer (the tracker)
 * @param props The icon's color
 * @return The icon
 */
export function TrackerIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="15" height="15" style={{display: 'block', flexShrink: 0}}>
            <path
                d="M0 6 L4 0 L8 6 L5 5 L5 12 L3 12 L3 5 L0 6"
                stroke={color}
                fill={color}
                strokeWidth={1}
                strokeLinejoin="round"
                strokeLinecap="round"
                transform={`translate(5, 2) rotate(-30, 7.5 7.5)`}
            />
            <line
                x1={5}
                y1={0}
                x2={5}
                y2={15}
                stroke={color}
                strokeWidth={1}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    )
}

/**
 * A line with a filled circle on it (the data-point markers)
 * @param props The icon's color
 * @return The icon
 */
export function MarkersIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="15" height="15" style={{display: 'block', flexShrink: 0}}>
            <polyline points="0,15 1,12 3,10 12,4 14,2 15,0" fill="none" stroke={color} strokeWidth={2}/>
            <circle cx={7.5} cy={7} r={3} fill={color} stroke={color}/>
        </svg>
    )
}

/**
 * A line between two filled circles (the interpolation between points)
 * @param props The icon's color
 * @return The icon
 */
export function InterpolationIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="16" height="16" style={{display: 'block', flexShrink: 0}}>
            <polyline points="4,12 12,4" fill="none" stroke={color} strokeWidth={2}/>
            <circle cx={4} cy={12} r={3} stroke={color} fill={color}/>
            <circle cx={12} cy={4} r={3} stroke={color} fill={color}/>
        </svg>
    )
}

/**
 * A tent (the tent map)
 * @param props The icon's color
 * @return The icon
 */
export function TentMapIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="15" height="15" style={{display: 'block', flexShrink: 0}}>
            <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
            <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
            <g id="SVGRepo_iconCarrier" transform="scale(0.03125)">
                <path
                    fill={color}
                    d="M361.155 91.245l-18 .193.42 38.98c-45.773 13.285-108.533 19.738-166.474 23.573 35.097 96.284 99.357 173.77 157.845 257.13 20.718-19.655 51.11-31.983 83.46-36.01-20.8-18.109-36.634-27.966-58.833-70.438 31.27 37.085 52.579 48.467 77.623 62.006 3.263-13.094 8.938-24.638 18.721-32.674 8.667-7.12 20.026-10.654 33.53-10.344-46.874-59.763-101.67-117.054-127.83-189.435l-.462-42.98zM163.25 102.92l-17.998.244s.25 18.34.56 36.97c.156 9.316.325 18.703.489 25.929.06 2.636.117 4.58.174 6.542-34.378 83.733-69.154 160.993-123.92 233.442 33.635-1.387 66.326-1.203 98.552-.041 22.263-62.617 23.346-134.855 35.627-202.006 11.417 68.562 10.566 139.445 33.483 205.83 42.962 3.082 85.69 7.198 129.35 10.926-55.67-79.151-118.213-155.037-155.118-249.365-.05-1.782-.1-3.396-.152-5.737-.162-7.156-.333-16.523-.488-25.82-.31-18.594-.559-36.914-.559-36.914z"
                />
            </g>
        </svg>
    )
}

/**
 * A bell curve over a baseline (the Gauss map)
 * @param props The icon's color
 * @return The icon
 */
export function GaussMapIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="16" height="16" style={{display: 'block', flexShrink: 0}}>
            <path
                d="M 3 13 L3.75 12.4 L4.5 11.5 L5.25 6.45 L6 4 L6.75 3.25 L7.5 3.1 L8.25 3.25 L9 4 L9.75 6.45 L10.5 11.5 L11.25 12.4 12 13"
                stroke={color}
                fill="none"
            />
            <line x1={0} y1={15} x2={250} y2={15} stroke={color} strokeWidth={1}/>
        </svg>
    )
}

/**
 * A parabola over a baseline (the logistic map)
 * @param props The icon's color
 * @return The icon
 */
export function LogisticMapIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="16" height="16" style={{display: 'block', flexShrink: 0}}>
            <g transform=" rotate(180, 8 8)">
                <path
                    d="M 3 3 A 4 8 0 0 0 13 3 "
                    stroke={color}
                    fill="none"
                    strokeWidth={1}
                />
            </g>
            <line x1={0} y1={15} x2={250} y2={15} stroke={color} strokeWidth={1}/>
        </svg>
    )
}

/**
 * The math symbol x (the current value)
 * @param props The icon's color
 * @return The icon
 */
export function ValueIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <div color={color}>
            <math>
                <mover>
                    <mi style={{color}}>x</mi>
                </mover>
            </math>
        </div>
    )
}

/**
 * The math symbol x with a "min" subscript (the min/max bars)
 * @param props The icon's color
 * @return The icon
 */
export function MinValueIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <div color={color}>
            <math>
                <msub>
                    <mi style={{color}}>x</mi>
                    <mtext style={{color}}>min</mtext>
                </msub>
            </math>
        </div>
    )
}

/**
 * The math symbol x-bar (the mean value)
 * @param props The icon's color
 * @return The icon
 */
export function MeanIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <div color={color}>
            <math>
                <mover>
                    <mi style={{color}}>x</mi>
                    <mo style={{color}}>&#x00AF;</mo>
                </mover>
            </math>
        </div>
    )
}

/**
 * The math symbol x with a "win, min" subscript (the windowed min/max bars)
 * @param props The icon's color
 * @return The icon
 */
export function WindowedMinValueIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <div color={color}>
            <math>
                <msub>
                    <mi style={{color}}>x</mi>
                    <mtext style={{color}}>win, min</mtext>
                </msub>
            </math>
        </div>
    )
}

/**
 * The math symbol x-bar with a "win" subscript (the windowed mean value)
 * @param props The icon's color
 * @return The icon
 */
export function WindowedMeanIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <div color={color}>
            <math>
                <msub>
                    <mover>
                        <mi style={{color}}>x</mi>
                        <mo style={{color}}>&#x00AF;</mo>
                    </mover>
                    <mtext style={{color}}>win</mtext>
                </msub>
            </math>
        </div>
    )
}

/**
 * A filled triangle pointing up, shown on a drop-down whose list is open
 * @param props The icon's color (fill and stroke)
 * @return The icon
 */
export function DropDownOpenIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="10" height="10" viewBox="0 0 10 10" style={{display: 'block', flexShrink: 0}}>
            <path
                d="M1.5 7 L8.5 7 L5 2.5 Z"
                stroke={color}
                fill={color}
                strokeWidth={1}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    )
}

/**
 * A filled triangle pointing down, shown on a drop-down whose list is closed
 * @param props The icon's color (fill and stroke)
 * @return The icon
 */
export function DropDownClosedIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="10" height="10" viewBox="0 0 10 10" style={{display: 'block', flexShrink: 0}}>
            <path
                d="M1.5 3 L8.5 3 L5 7.5 Z"
                stroke={color}
                fill={color}
                strokeWidth={1}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    )
}

/**
 * The lines of a table of contents (three bulleted lines), shared by the table-of-contents icons
 * @param props The icon's color
 * @return The lines
 */
function TableOfContentsLines(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <>
            {[3, 7.5, 12].map(y => (
                <g key={y}>
                    <circle cx={2} cy={y} r={1.3} fill={color}/>
                    <line x1={5} y1={y} x2={13} y2={y} stroke={color} strokeWidth={1.8} strokeLinecap="round"/>
                </g>
            ))}
        </>
    )
}

/**
 * A table of contents with a small triangle pointing down: clicking it opens the table of contents
 * @param props The icon's color (fill and stroke)
 * @return The icon
 */
export function TableOfContentsExpandIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="20" height="15" viewBox="0 0 20 15" style={{display: 'block', flexShrink: 0}}>
            <TableOfContentsLines color={color}/>
            <path d="M15 6 L19 6 L17 9 Z" fill={color} stroke={color} strokeWidth={1} strokeLinejoin="round"/>
        </svg>
    )
}

/**
 * A table of contents with a small triangle pointing up: clicking it closes the table of contents
 * @param props The icon's color (fill and stroke)
 * @return The icon
 */
export function TableOfContentsCollapseIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="20" height="15" viewBox="0 0 20 15" style={{display: 'block', flexShrink: 0}}>
            <TableOfContentsLines color={color}/>
            <path d="M15 9 L19 9 L17 6 Z" fill={color} stroke={color} strokeWidth={1} strokeLinejoin="round"/>
        </svg>
    )
}

/**
 * Bold axes (the left and bottom ones) with a thin data line between them: the axes a series is
 * plotted against are highlighted
 * @param props The icon's color
 * @return The icon
 */
export function HighlightAxesIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="15" height="15" style={{display: 'block', flexShrink: 0}}>
            <polyline
                points="1.5,1 1.5,13.5 14,13.5"
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            <polyline
                points="4.5,10 7.5,6 10,8.5 13.5,3"
                fill="none"
                stroke={color}
                strokeWidth={1}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    )
}

/**
 * A y-axis with a double-headed arrow beside it: the y-axes stretch (up and down) to fit the data
 * @param props The icon's color
 * @return The icon
 */
export function AutoScaleIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="15" height="15" style={{display: 'block', flexShrink: 0}}>
            <line x1={2} y1={1} x2={2} y2={14} stroke={color} strokeWidth={1.5} strokeLinecap="round"/>
            <line x1={2} y1={4} x2={4} y2={4} stroke={color} strokeWidth={1} strokeLinecap="round"/>
            <line x1={2} y1={11} x2={4} y2={11} stroke={color} strokeWidth={1} strokeLinecap="round"/>
            <line x1={10} y1={3.5} x2={10} y2={11.5} stroke={color} strokeWidth={1.5}/>
            <path d="M7 4.5 L10 0.5 L13 4.5 Z" fill={color} stroke={color} strokeWidth={0.5} strokeLinejoin="round"/>
            <path d="M7 10.5 L10 14.5 L13 10.5 Z" fill={color} stroke={color} strokeWidth={0.5} strokeLinejoin="round"/>
        </svg>
    )
}

/**
 * A zigzag line: the lines connecting a chart's points are colorized. When the start and end
 * colors are given, the line is drawn with them, sweeping the spectrum in between (as the
 * colorized lines are, see `lineColorScale`); otherwise, in the icon's color.
 * @param props The icon's color, and (optionally) the colorized lines' start and end colors
 * @return The icon
 */
export function ColorizedLinesIcon(props: { color: string, startColor?: string, endColor?: string }): JSX.Element {
    const {color, startColor, endColor} = props
    // (a gradient's ID must be unique on the page)
    const gradientId = `colorized-lines-${useId()}`
    const colorAt = startColor !== undefined && endColor !== undefined ?
        lineColorScale(startColor, endColor) :
        undefined
    return (
        <svg width="15" height="15" style={{display: 'block', flexShrink: 0}}>
            {colorAt !== undefined &&
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                        {[0, 0.25, 0.5, 0.75, 1].map(offset => (
                            <stop key={offset} offset={offset} stopColor={colorAt(offset)}/>
                        ))}
                    </linearGradient>
                </defs>
            }
            <polyline
                points="1.5,12 5,4 8.5,11 12,3 14,6"
                fill="none"
                stroke={colorAt !== undefined ? `url(#${gradientId})` : color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    )
}

/**
 * Two overlapping pages (copy)
 * @param props The icon's color
 * @return The icon
 */
export function CopyIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="15" height="15" style={{display: 'block', flexShrink: 0}}>
            <rect x="5" y="5" width="8" height="8.5" rx="1.5" stroke={color} fill="none" strokeWidth={1.5}/>
            <path
                d="M10 2.5 L3.5 2.5 Q2 2.5 2 4 L2 10.5"
                stroke={color}
                fill="none"
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    )
}

/**
 * A check mark (done)
 * @param props The icon's color
 * @return The icon
 */
export function CheckIcon(props: { color: string }): JSX.Element {
    const {color} = props
    return (
        <svg width="15" height="15" style={{display: 'block', flexShrink: 0}}>
            <path
                d="M2.5 8 L6 11.5 L12.5 4"
                stroke={color}
                fill="none"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    )
}
