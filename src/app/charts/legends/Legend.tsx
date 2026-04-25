import {BaseAxis, defaultLineStyle, SeriesLineStyle, SeriesStyle} from "../axes/axes";
import {BaseAxisRange} from "../axes/BaseAxisRange";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import {useChart} from "../hooks/useChart";
import {useInitialData} from "../hooks/useInitialData";
import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import * as d3 from "d3";

export enum LegendLocation {
    // noinspection JSUnusedGlobalSymbols
    TOP_LEFT = "top-left",
    TOP_RIGHT = "top-right",
    BOTTOM_LEFT = "bottom-left",
    BOTTOM_RIGHT = "bottom-right",
    EXTERNAL_CONTAINER = "external-container"
}

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
    /** Maximum height of the legend before it starts scrolling (in pixels). If not provided, defaults to the plot height. */
    maxHeight?: number
    /** Duration of the visibility transition in milliseconds */
    transitionDuration: number
}

export const defaultLegendStyle: LegendStyle = {
    fontSize: 12,
    fontFamily: "sans-serif",
    fontColor: "#d2933f",
    backgroundColor: "#202020",
    backgroundOpacity: 0.85,
    borderColor: "#d2933f",
    borderWidth: 1,
    borderOpacity: 0.7,
    borderRadius: 4,
    padding: 8,
    rowGap: 6,
    swatchWidth: 16,
    swatchHeight: 3,
    swatchLabelGap: 6,
    transitionDuration: 350,
}

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
     * external container instead of inside the chart SVG. Position the container
     * however you like — the legend fills it.
     */
    container?: React.RefObject<HTMLElement | null>
}

const LEGEND_CONTAINER_ID_PREFIX = "stream-charts-legend"

/**
 * A legend component that can be placed inside any `<Chart>` alongside any Plot.
 * It automatically reads the series names from the initial data and their colors
 * from the `seriesStyles` map (falling back to the chart's base `color`).
 * The legend respects the active `seriesFilter`, showing only the matching series.
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

    const {chartId, container, color, seriesStyles, seriesFilter, mouse, hoveredSeriesRef} = useChart<D, S, TM, AR, A>()
    const {margin, plotDimensions} = usePlotDimensions()
    const {initialData} = useInitialData<any, D>()

    // the mouse over series name interferes with scrolling, so we keep track of the
    // scrolling state so the series-name mouse-over can be disabled during scrolling
    const wheelTimeoutRef = useRef<NodeJS.Timeout>(undefined)
    const isWheelingRef = useRef(false)

    const scrollYRef = useRef<number>(0)

    // keep track of whether the mouse is in the legend so that we can restore the legend
    // opacity when the mouse leaves and is not hovering over a series
    const [mouseInLegend, setMouseInLegend] = useState<boolean>(false)

    const legendStyle = useMemo<LegendStyle>(
        () => ({
            ...defaultLegendStyle,
            maxHeight: style?.maxHeight ?? plotDimensions.height - 4 * Math.max(style?.swatchHeight ?? defaultLegendStyle.swatchHeight, style?.fontSize ?? defaultLegendStyle.swatchHeight),
            ...style
        }),
        [style, plotDimensions.height]
    )

    // Refs don't trigger re-renders when populated, so track readiness in state
    const [externalContainerReady, setExternalContainerReady] = useState(false)
    useEffect(() => {
        setExternalContainerReady(!!externalContainer?.current)
    }, [externalContainer])

    // Track the currently hovered series name so legend entries can be highlighted
    const [hoveredSeriesName, setHoveredSeriesName] = useState<string | null>(null)
    useEffect(() => {
        const handlerId = `legend-${chartId}`
        mouse.registerMouseOverHandler(handlerId, seriesName => setHoveredSeriesName(seriesName))
        mouse.registerMouseLeaveHandler(handlerId, () => setHoveredSeriesName(null))
        return () => {
            mouse.unregisterMouseOverHandler(handlerId)
            mouse.unregisterMouseLeaveHandler(handlerId)
        }
    }, [chartId, mouse])

    // Keep a ref so D3 closures in the SVG legend always read current styles
    const seriesStylesRef = useRef<Map<string, S>>(seriesStyles)
    seriesStylesRef.current = seriesStyles

    const highlightSeriesInPlot = useCallback<(name: string) => void>(name => {
        hoveredSeriesRef.current = name
        if (!container) return
        const {
            highlightColor,
            highlightWidth
        } = (seriesStylesRef.current.get(name) as SeriesLineStyle | undefined) || defaultLineStyle()
        d3.select(container)
            .selectAll<SVGPathElement, unknown>(`path[data-series-name="${name}"], line[data-series-name="${name}"]`)
            .attr('stroke', highlightColor)
            .attr('stroke-width', highlightWidth)
    }, [container, hoveredSeriesRef])

    const restoreSeriesInPlot = useCallback<(name: string) => void>(name => {
        hoveredSeriesRef.current = null
        if (!container) return
        const {
            color,
            lineWidth
        } = (seriesStylesRef.current.get(name) as SeriesLineStyle | undefined) || defaultLineStyle()
        d3.select(container)
            .selectAll<SVGPathElement, unknown>(`path[data-series-name="${name}"], line[data-series-name="${name}"]`)
            .attr('stroke', color)
            .attr('stroke-width', lineWidth)
    }, [container, hoveredSeriesRef])

    // Derive the filtered list of series names
    const visibleSeriesNames = useMemo<Array<string>>(
        () => initialData.map(s => s.name).filter(name => seriesFilter.test(name)),
        [initialData, seriesFilter]
    )

    useEffect(
        () => {
            if (!container) return

            const legendId = `${LEGEND_CONTAINER_ID_PREFIX}-${chartId}`
            const svg = d3.select<SVGSVGElement, unknown>(container)
            const {transitionDuration} = legendStyle

            if (externalContainer) {
                svg.select(`#${legendId}`).remove()
                return
            }

            if (!visible || visibleSeriesNames.length === 0) {
                svg.select(`#${legendId}`).remove()
                return
            }

            // Remove any existing legend (before we potentially redraw) or just reuse?
            // Usually, redrawing is safer if we want to ensure everything is in the right place.
            // But if we're transitioning from visible: false to true, the old one might be gone.
            // Let's just remove without transition for redrawing, except when explicitly making it invisible.
            svg.select(`#${legendId}`).remove()

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
            } = legendStyle

            const rowHeight = Math.max(swatchHeight, fontSize)
            const totalRows = visibleSeriesNames.length
            const contentHeight = totalRows * rowHeight + (totalRows - 1) * rowGap
            const totalContentHeight = contentHeight + 2 * padding
            const boxHeight = maxHeight !== undefined ? Math.min(totalContentHeight, maxHeight) : totalContentHeight

            // Use a temporary hidden SVG text element to measure max label width
            const tempText = svg
                .append<SVGTextElement>("text")
                .style("font-size", `${fontSize}px`)
                .style("font-family", fontFamily)
                .style("visibility", "hidden")

            let maxLabelWidth = 0
            visibleSeriesNames.forEach(name => {
                tempText.text(name)
                const w = tempText.node()?.getBBox().width ?? name.length * (fontSize * 0.6)
                if (w > maxLabelWidth) maxLabelWidth = w
            })
            tempText.remove()

            const boxWidth = padding + swatchWidth + swatchLabelGap + maxLabelWidth + padding

            // Determine the (x, y) position of the legend box within the SVG (plot area coordinates)
            const plotLeft = margin.left
            const plotTop = margin.top
            const plotRight = margin.left + plotDimensions.width
            const plotBottom = margin.top + plotDimensions.height

            let boxX: number
            let boxY: number

            switch (location) {
                case LegendLocation.TOP_LEFT:
                    boxX = plotLeft + offset.x
                    boxY = plotTop + offset.y
                    break
                case LegendLocation.TOP_RIGHT:
                    boxX = plotRight - boxWidth - offset.x
                    boxY = plotTop + offset.y
                    break
                case LegendLocation.BOTTOM_LEFT:
                    boxX = plotLeft + offset.x
                    boxY = plotBottom - boxHeight - offset.y
                    break
                case LegendLocation.BOTTOM_RIGHT:
                default:
                    boxX = plotRight - boxWidth - offset.x
                    boxY = plotBottom - boxHeight - offset.y
                    break
            }

            // Create the legend container group
            const legendG = svg
                .append<SVGGElement>("g")
                .attr("id", legendId)
                .attr("transform", `translate(${boxX}, ${boxY})`)
                .style("opacity", 0)
                .on("mouseover", () => {
                    setMouseInLegend(true)
                })
                .on("mouseleave", () => {
                    setMouseInLegend(false)
                })

            // Apply transition for shimmering effect
            legendG
                .style("transition", `opacity ${transitionDuration}ms ease-in-out`)
                .style("opacity", 1)

            // Background box
            legendG
                .append("rect")
                .attr("x", 0)
                .attr("y", 0)
                .attr("width", boxWidth)
                .attr("height", boxHeight)
                .attr("rx", borderRadius)
                .attr("fill", backgroundColor)
                .attr("fill-opacity", backgroundOpacity)
                .attr("stroke", borderColor)
                .attr("stroke-width", borderWidth)
                .attr("stroke-opacity", borderOpacity)

            const innerG = legendG
                .append("g")
                .attr("class", "legend-content")
                .attr("transform", `translate(0, ${-scrollYRef.current})`)

            // If we have a max height and the content is taller, we'd need a scrollbar.
            // In SVG, we can use a clipPath and handle scroll events manually, or use foreignObject.
            // foreignObject is generally better for this if we want real scrollbars.
            const isScrolling = maxHeight !== undefined && totalContentHeight > maxHeight

            if (isScrolling) {
                const clipId = `legend-clip-${chartId}`
                // Remove existing clipPath for this legend to avoid duplicates
                svg.select(`#${clipId}`).remove()
                //
                svg.append("defs")
                    .append("clipPath")
                    .attr("id", clipId)
                    .attr("clipPathUnits", "userSpaceOnUse")
                    .append("rect")
                    .attr("x", 0)
                    .attr("y", 0)
                    .attr("width", boxWidth)
                    .attr("height", boxHeight)

                legendG.attr("clip-path", `url(#${clipId})`)

                // Simple scroll handling via mouse wheel
                legendG.on("wheel", (event: WheelEvent) => {
                    event.preventDefault()
                    // scrollBarVisibleRef.current = true
                    isWheelingRef.current = true
                    const maxScroll = totalContentHeight - boxHeight
                    scrollYRef.current = Math.max(0, Math.min(maxScroll, scrollYRef.current + event.deltaY))
                    innerG.attr("transform", `translate(0, ${-scrollYRef.current})`)

                    // Clear the existing timer if the user is still wheeling
                    clearTimeout(wheelTimeoutRef.current);

                    // Set a new timer to fire after 100-200ms of inactivity
                    wheelTimeoutRef.current = setTimeout(() => {
                        isWheelingRef.current = false
                        // scrollBarVisibleRef.current = false
                        console.log(`Wheel movement has ended. ${isWheelingRef.current ? "Still wheeling." : "No longer wheeling."}`);
                    }, 150);
                }, {passive: false})

                // Visual scrollbar (optional but good for visibility)
                const scrollbarWidth = 4
                const scrollbarHeight = (boxHeight / totalContentHeight) * boxHeight - padding
                const scrollbar = legendG.append("rect")
                    .attr("class", "legend-scrollbar")
                    .attr("x", boxWidth - scrollbarWidth - 2)
                    .attr("y", calculateScrollbarY(totalContentHeight, boxHeight, scrollYRef.current, scrollbarHeight, padding))
                    .attr("width", scrollbarWidth)
                    .attr("height", scrollbarHeight)
                    .attr("rx", scrollbarWidth / 2)
                    .style("fill-opacity", mouseInLegend ? 0.25 : 0)
                    .attr("fill", fontColor)

                legendG.on("wheel.scrollbar", (_: WheelEvent) => {
                    scrollbar.attr("y", calculateScrollbarY(totalContentHeight, boxHeight, scrollYRef.current, scrollbarHeight, padding))
                })
            }

            // Legend rows
            visibleSeriesNames.forEach((name, i) => {
                const seriesColor = seriesStyles.get(name)?.color ?? color
                const rowY = padding + i * (rowHeight + rowGap)
                const swatchMidY = rowY + rowHeight / 2

                const rowG = innerG
                    .append("g")
                    .attr("class", "legend-row")
                    .attr("data-series-name", name)
                    .style("cursor", "default")

                // Color swatch — a short horizontal line to mimic series appearance
                rowG
                    .append("line")
                    .attr("x1", padding)
                    .attr("y1", swatchMidY)
                    .attr("x2", padding + swatchWidth)
                    .attr("y2", swatchMidY)
                    .attr("stroke", seriesColor)
                    .attr("stroke-width", swatchHeight)
                    .attr("stroke-linecap", "round")

                // Series name label
                rowG
                    .append("text")
                    .attr("x", padding + swatchWidth + swatchLabelGap)
                    .attr("y", swatchMidY)
                    .attr("dominant-baseline", "middle")
                    .attr("data-series-name", name)
                    .style("font-size", `${fontSize}px`)
                    .style("font-family", fontFamily)
                    .style("fill", fontColor)
                    .text(name)

                // keep this at the end
                rowG
                    .append("rect")
                    .attr("x", 0)
                    .attr("width", boxWidth)
                    .attr("y", padding + i * (rowHeight + rowGap) - rowGap)
                    .attr("height", rowHeight + rowGap)
                    .style("fill", backgroundColor)
                    .style("fill-opacity", 0)
                .on("mouseover", () => {
                    if (isWheelingRef.current) return
                    setHoveredSeriesName(prevName => {
                        // restore any previous names in case the events
                        // get out of order, this prevents multiple series
                        // being highlighted when the mouse moves quickly
                        if (prevName && prevName !== name) {
                            restoreSeriesInPlot(prevName)
                        }
                        return name
                    })
                    highlightSeriesInPlot(name)
                })
                .on("mouseleave", () => {
                    setHoveredSeriesName(null)
                    restoreSeriesInPlot(name)
                })

            })
        },
        [
            visible, container, externalContainer, chartId, visibleSeriesNames,
            legendStyle, location, offset, margin, plotDimensions, color,
            seriesStyles, highlightSeriesInPlot, restoreSeriesInPlot, mouseInLegend
        ]
    )

    // Update SVG row opacity when the hovered series changes
    useEffect(
        () => {
            if (!container || externalContainer) return
            const legendG = d3.select(container).select(`#${LEGEND_CONTAINER_ID_PREFIX}-${chartId}`)
            if (!legendG.empty()) {
                const FADE_BACK_OPACITY = 0.35
                legendG.selectAll<SVGGElement, unknown>("g.legend-row")
                    .attr("transition", `opacity ${350}ms ease-in-out`)
                    .style("opacity", function (): number {
                        const seriesName = d3.select(this).attr("data-series-name")
                        if (mouseInLegend) {
                            return hoveredSeriesName !== null && seriesName === hoveredSeriesName ? 1 : FADE_BACK_OPACITY
                        } else if (hoveredSeriesName !== null && seriesName !== hoveredSeriesName) {
                            return FADE_BACK_OPACITY
                        } else {
                            return 1
                        }
                    })
                legendG.selectAll<SVGTextElement, unknown>("text[data-series-name]")
                    .style("font-weight", function (): string {
                        const seriesName: string = d3.select(this).attr("data-series-name")
                        return hoveredSeriesName !== null && seriesName === hoveredSeriesName ? "bold" : "normal"
                    })
            }
        },
        [hoveredSeriesName, container, externalContainer, chartId, mouseInLegend]
    )

    // HTML portal legend — rendered outside the SVG into an external container
    if (externalContainerReady && externalContainer?.current && visibleSeriesNames.length > 0) {
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

        const boxStyle: React.CSSProperties = {
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
            externalContainer.current
        )
    }

    return null
}

function calculateScrollbarY(totalContentHeight: number, boxHeight: number, scrollY: number, scrollbarHeight: number, padding: number): number {
    const maxScroll = totalContentHeight - boxHeight
    const scrollPercent = scrollY / maxScroll
    const scrollbarMaxY = boxHeight - scrollbarHeight - 4 - padding
    return Math.max(padding, 2 + scrollPercent * scrollbarMaxY)
}