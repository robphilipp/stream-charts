import {type BaseAxis, type SeriesStyle} from "../axes/axes";
import {useHoveredSeries} from "../hooks/useHoveredSeries";
import {useInitialData} from "../hooks/useDataSource";
import {BaseAxisRange} from "../axes/BaseAxisRange";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import {useChart} from "../hooks/useChart";
import React, {useCallback, useEffect, useMemo, useRef} from "react";
import {createPortal} from "react-dom";
import * as d3 from "d3";
import {defaultLegendStyle, LegendLocation} from "./constants";

/**
 * The style of the legend's box and entries
 */
export interface LegendStyle {
    /** Font size for the legend labels */
    fontSize: number
    /** Font family for the legend labels */
    fontFamily: string
    /** Font color for the legend labels */
    fontColor: string
    /** Background fill color for the legend box */
    backgroundColor: string
    /** Background opacity for the legend box */
    backgroundOpacity: number
    /** Border/stroke color for the legend box */
    borderColor: string
    /** Border width for the legend box */
    borderWidth: number
    /** Border opacity for the legend box */
    borderOpacity: number
    /** Corner radius of the legend box */
    borderRadius: number
    /** Padding inside the legend box (in pixels) */
    padding: number
    /** Vertical space between legend entries */
    rowGap: number
    /** Width of the color swatch next to each label */
    swatchWidth: number
    /** Height of the color swatch next to each label */
    swatchHeight: number
    /** Gap between the swatch and the label text */
    swatchLabelGap: number
    /** Maximum height of the legend before it starts scrolling (in pixels). If not provided, defaults to a little less than the plot height. */
    maxHeight?: number
    /** Duration of the visibility transition in milliseconds */
    transitionDuration: number
}

/**
 * The properties of the {@link Legend}
 */
export interface Props {
    /** Whether the legend is visible */
    visible: boolean
    /**
     * Where to anchor the legend within the plot area.
     * Ignored when `container` is provided.
     * @default LegendLocation.TOP_RIGHT
     */
    location?: LegendLocation
    /** Style overrides for the legend */
    style?: Partial<LegendStyle>
    /**
     * Optional offset in pixels from the chosen corner, applied after the margin.
     * Ignored when `container` is provided.
     * @default { x: 10, y: 10 }
     */
    offset?: { x: number; y: number }
    /**
     * When provided, the legend renders as an HTML element portal into this
     * external container instead of as an overlay on the chart canvas. Position the
     * container however you like — the legend fills it.
     */
    container?: React.RefObject<HTMLElement | null>
}

/**
 * A legend component that can be placed inside any `<Chart>` alongside any Plot.
 * It automatically reads the series names from the initial data and their colors
 * from the `seriesStyles` map (falling back to the chart's base `color`).
 * The legend respects the active `seriesFilter`, showing only the matching series.
 *
 * Renders as an HTML overlay (a React portal) rather than as SVG elements -- either into the
 * `container` prop, when supplied, or (the default) into the chart's own canvas overlay wrapper
 * (the `position: relative` `<div>` that {@link Chart} wraps the `<canvas>` in), absolutely
 * positioned against the plot area using `location`/`offset`. This replaces the old version's two
 * separate rendering paths (an SVG-internal legend with a hand-rolled scrollbar/clip-path/wheel
 * handler, and an HTML-portal legend for the external-container case) with one: the SVG path's
 * custom scrolling machinery existed only because SVG has no native scrolling or text
 * auto-sizing -- an HTML `<div>` with `overflowY: 'auto'` gets both for free, which is exactly
 * what the already-existing external-container path relied on.
 *
 * Hovering over an entry highlights its series (through the chart's shared hovered-series state),
 * and hovering over a series in the plot highlights its entry.
 * @param props The properties of the legend
 * @return The legend (rendered into a portal), or `null` when it isn't visible, there are no
 * series to show, or there's nowhere (yet) to render it into
 * @template D The type of the series' datum
 * @template S The type of the series style
 * @template TM The type of the tooltip metadata
 * @template AR The type of the axis range
 * @template A The type of the axis
 *
 * @example
 * ```tsx
 * <Chart ...>
 *   <ContinuousAxis ... />
 *   <ScatterPlot ... />
 *   <Legend visible={true} location={LegendLocation.TOP_RIGHT} />
 * </Chart>
 * ```
 */
// noinspection JSUnusedGlobalSymbols
export function Legend<D, S extends SeriesStyle, TM, AR extends BaseAxisRange, A extends BaseAxis>(
    props: Props
): React.ReactElement | null {
    const {
        visible,
        location = LegendLocation.TOP_RIGHT,
        offset = {x: 10, y: 10},
        style,
        container: externalContainer
    } = props

    const {
        canvas,
        color,
        seriesStyles,
        seriesFilter,
    } = useChart<D, S, TM, AR, A>()
    const {hoveredSeriesName, setHoveredSeriesName} = useHoveredSeries()
    const {margin, plotDimensions} = usePlotDimensions()
    const {initialData} = useInitialData<D>()

    const legendStyle = useMemo<LegendStyle>(
        () => ({
            ...defaultLegendStyle,
            maxHeight: style?.maxHeight ?? plotDimensions.height - 4 * Math.max(style?.swatchHeight ?? defaultLegendStyle.swatchHeight, style?.fontSize ?? defaultLegendStyle.swatchHeight),
            ...style
        }),
        [style, plotDimensions.height]
    )

    const highlightSeriesInPlot = useCallback<(name: string) => void>(
        name => {
            setHoveredSeriesName(name)
            if (!canvas) return
        },
        [canvas, setHoveredSeriesName]
    )

    const restoreSeriesInPlot = useCallback<(name: string) => void>(
        () => {
            if (!canvas) return
        },
        [canvas]
    )

    // Derive the filtered list of series names
    const visibleSeriesNames = useMemo<Array<string>>(
        () => initialData.map(s => s.name).filter(name => seriesFilter.test(name)),
        [initialData, seriesFilter]
    )

    // A `container` prop that never resolves to a mounted element is a caller-attributable
    // misconfiguration (unlike a not-yet-attached `canvas`, which is normal/transient on first
    // mount) -- surface it once, rather than silently rendering nothing forever with no clue why.
    // Gated on `visible && visibleSeriesNames.length > 0` -- i.e. only when we'd actually attempt
    // to render -- since a container legitimately un-mounted alongside `visible: false` (a common
    // pattern: hide the legend and its container together) is not a misconfiguration and shouldn't
    // warn. Depending on `canvas` too (not just `externalContainer`, whose identity is otherwise
    // stable across renders) gives this a few extra chances to reassess as the chart's own canvas
    // surface settles, before concluding the ref is genuinely never going to attach.
    const hasWarnedMissingContainerRef = useRef(false)
    useEffect(
        () => {
            if (
                visible &&
                visibleSeriesNames.length > 0 &&
                externalContainer &&
                externalContainer.current === null &&
                !hasWarnedMissingContainerRef.current
            ) {
                console.warn(
                    'Legend: the "container" prop was provided, but its .current is null, so the legend has ' +
                    'nothing to render into and will render nothing. Make sure the ref is attached to an ' +
                    'element that actually mounts.'
                )
                hasWarnedMissingContainerRef.current = true
            }
        },
        [externalContainer, canvas, visible, visibleSeriesNames.length]
    )

    if (!visible || visibleSeriesNames.length === 0) return null

    // the portal target: the caller-supplied external container, or (by default) the chart's own
    // canvas overlay wrapper -- the `position: relative` div Chart.tsx wraps the <canvas> in
    const portalTarget = externalContainer?.current ?? canvas?.parentElement ?? null
    if (portalTarget === null) return null

    const {
        fontSize,
        fontFamily,
        fontColor,
        backgroundColor,
        backgroundOpacity,
        borderColor,
        borderWidth,
        borderOpacity,
        borderRadius,
        padding,
        rowGap,
        swatchWidth,
        swatchHeight,
        swatchLabelGap,
        maxHeight,
        transitionDuration,
    } = legendStyle

    const bg = d3.color(backgroundColor) as d3.RGBColor | undefined
    const bgWithOpacity = bg
        ? `rgba(${bg.r},${bg.g},${bg.b},${backgroundOpacity})`
        : backgroundColor
    const bd = d3.color(borderColor) as d3.RGBColor | undefined
    const bdWithOpacity = bd
        ? `rgba(${bd.r},${bd.g},${bd.b},${borderOpacity})`
        : borderColor

    // when rendering into our own overlay (no external container), anchor the box to the
    // corresponding corner of the *plot area* (inside the margins), matching the old SVG
    // version's positioning intent -- but via CSS `top`/`right`/`bottom`/`left` instead of a
    // manually-computed pixel (x, y), since we don't need to know the box's own width/height
    // ahead of time the way the old version's manual layout math did
    const anchorStyle: React.CSSProperties = externalContainer ? {} : (() => {
        switch (location) {
            case LegendLocation.TOP_LEFT:
                return {position: 'absolute', top: margin.top + offset.y, left: margin.left + offset.x}
            case LegendLocation.TOP_RIGHT:
                return {position: 'absolute', top: margin.top + offset.y, right: margin.right + offset.x}
            case LegendLocation.BOTTOM_LEFT:
                return {position: 'absolute', bottom: margin.bottom + offset.y, left: margin.left + offset.x}
            case LegendLocation.BOTTOM_RIGHT:
            case LegendLocation.EXTERNAL_CONTAINER:
            default:
                return {position: 'absolute', bottom: margin.bottom + offset.y, right: margin.right + offset.x}
        }
    })()

    const boxStyle: React.CSSProperties = {
        ...anchorStyle,
        display: "inline-flex",
        flexDirection: "column",
        backgroundColor: bgWithOpacity,
        border: `${borderWidth}px solid ${bdWithOpacity}`,
        borderRadius,
        padding,
        maxHeight,
        overflowY: "auto",
        fontFamily,
        fontSize,
        color: fontColor,
        boxSizing: "border-box",
        opacity: visible ? 1 : 0,
        transition: visible ? `opacity ${transitionDuration}ms ease-in-out` : "none",
        pointerEvents: visible ? "auto" : "none",
        whiteSpace: "nowrap",
        zIndex: 10,
    }

    const anyHovered = hoveredSeriesName !== null
    return createPortal(
        <div style={boxStyle}>
            {visibleSeriesNames.map(name => {
                const seriesColor = seriesStyles.get(name)?.color ?? color
                const isHovered = name === hoveredSeriesName
                const rowStyle: React.CSSProperties = {
                    display: "flex",
                    alignItems: "center",
                    gap: swatchLabelGap,
                    opacity: anyHovered && !isHovered ? 0.35 : 1,
                    fontWeight: isHovered ? "bold" : "normal",
                    transition: "opacity 0.15s, font-weight 0s",
                    height: rowGap + fontSize,
                }
                return (
                    <div
                        key={name}
                        style={{...rowStyle, cursor: "default"}}
                        onMouseEnter={() => {
                            setHoveredSeriesName(name)
                            highlightSeriesInPlot(name)
                        }}
                        onMouseLeave={() => {
                            setHoveredSeriesName(null)
                            restoreSeriesInPlot(name)
                        }}
                    >
                        <span style={{
                            display: "inline-block",
                            width: swatchWidth,
                            height: swatchHeight,
                            backgroundColor: seriesColor,
                            borderRadius: swatchHeight / 2,
                            flexShrink: 0,
                        }}/>
                        <span style={{
                            height: rowGap + fontSize,
                            alignItems: "center",
                            display: "inline-flex"
                        }}>{name}</span>
                    </div>
                )
            })}
        </div>,
        portalTarget
    )
}
