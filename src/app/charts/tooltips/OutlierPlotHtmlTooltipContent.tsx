import React, {type CSSProperties, type JSX, type ReactElement, useEffect, useMemo, useState, useRef} from "react"
import {createPortal} from "react-dom"
import {useChart} from "../hooks/useChart"
import {usePlotDimensions} from "../hooks/usePlotDimensions"
import type {ContinuousNumericAxis, SeriesLineStyle} from "../axes/axes"
import {ContinuousAxisRange} from "../axes/ContinuousAxisRange"
import {defaultTooltipStyle, type TooltipDimensions, type TooltipStyle} from "./tooltipUtils"
import {tooltipAnchorFor, useTooltipPlacement} from "./useTooltipPlacement"
import {withAlpha} from "../styling/canvasStyle"
import type {TooltipData} from "../hooks/useTooltip"
import type {OutlierBandTooltipMetadata} from "../plots/OutlierPlot"
import type {OutlierDatum} from "../series/outlierSeries"
import {DefaultOutlierHtmlTooltipContent} from "./DefaultOutlierHtmlTooltipContent.tsx"
import {
    UseOutlierTooltip,
    type OutlierTooltipContextValue,
    type OutlierTooltipContentFormatters,
    type TooltipContent,
    type TooltipLocation,
    type TooltipSeriesName,
} from "./useOutlierTooltip.tsx"

// Re-export context types so callers only need to import from this file
export type {
    TooltipLocation,
    TooltipSeriesName,
    TooltipContent,
    OutlierTooltipContentFormatters,
    OutlierTooltipContextValue
}

/**
 * The properties of the {@link OutlierPlotHtmlTooltipContent}: its style, its (optional) custom
 * content, and the formatters for the default content
 */
export type Props = {
    /**
     * Style overrides for the tooltip.
     */
    style?: Partial<TooltipStyle>
    /**
     * Custom tooltip content. Receives tooltip data and formatters via {@link useOutlierTooltip}.
     * Defaults to {@link DefaultOutlierHtmlTooltipContent} when not provided.
     */
    children?: JSX.Element | Array<JSX.Element>
} & OutlierTooltipContentFormatters

/**
 * Registers an HTML tooltip content provider for {@link OutlierPlot} bands. When the user hovers
 * over a band, a React portal renders an absolutely-positioned HTML div near the cursor.
 *
 * Provides tooltip data and formatters to children via context ({@link useOutlierTooltip}).
 * When no children are supplied, renders {@link DefaultOutlierHtmlTooltipContent}.
 *
 * Must be rendered as a child of a {@link Tooltip} inside a {@link Chart} that contains an
 * {@link OutlierPlot}. Showing is triggered by the parent {@link Tooltip} via
 * {@link registerTooltipContentProvider}; hiding is triggered by the mouse-leave event.
 * @param props The properties describing the tooltip content
 * @return The tooltip's portal, or `null` when no band is being hovered
 */
export function OutlierPlotHtmlTooltipContent(props: Props): React.ReactElement | null {
    const {
        style,
        children,
        datumFormatter = (x: number, y: number) => `(${x}, ${y})`,
        bandFormatter = (lower: number, upper: number) => `Band: ${lower} \u2B62 ${upper}`,
        measureFormatter = (innerProb: number, outerProb: number) => `Points have a ${(innerProb * 100).toFixed(1)}% probability of being in this band, and a ${(outerProb * 100).toFixed(1)}% probability of being outside this band`,
    } = props

    const {
        chartId,
        canvas,
        tooltip,
        mouse,
    } = useChart<OutlierDatum<readonly number[]>, SeriesLineStyle, OutlierBandTooltipMetadata, ContinuousAxisRange, ContinuousNumericAxis>()

    const {
        registerTooltipContentProvider
    } = tooltip

    const {
        registerMouseLeaveHandler,
        unregisterMouseLeaveHandler
    } = mouse

    const {
        margin,
        plotDimensions
    } = usePlotDimensions()

    const tooltipStyle = useMemo<TooltipStyle>(
        () => ({...defaultTooltipStyle, ...style}),
        [style]
    )

    const [tooltipContent, setTooltipContent] = useState<TooltipContent | null>(null)
    // the tooltip (its portal), which is placed next to the mouse once rendered
    const tooltipRef = useRef<HTMLDivElement>(null)

    // Register the content provider — called by <Tooltip> on mouse-over to show the portal
    useEffect(
        () => {
            if (canvas) {
                // if (keepOpen && tooltip != null) return
                registerTooltipContentProvider(
                    (
                        seriesName: string,
                        _: number,
                        tooltipData: TooltipData<OutlierDatum<readonly number[]>, OutlierBandTooltipMetadata>,
                        mouseCoords: [x: number, y: number]
                    ) => buildTooltipContent(
                        seriesName, tooltipData.metadata, mouseCoords,
                        canvas,
                        setTooltipContent
                    )
                )
            }
        },
        [chartId, canvas, margin, plotDimensions, registerTooltipContentProvider, tooltip, tooltipContent, tooltipStyle]
    )

    // Register a mouse-leave handler to unmount the portal — <Tooltip> handles its own background
    // cleanup (removeTooltip) while we handle ours (clearing the portal state)
    useEffect(
        () => {
            const handlerId = `html-tooltip-leave-${chartId}`
            registerMouseLeaveHandler(handlerId, () => setTooltipContent(null))
            return () => unregisterMouseLeaveHandler(handlerId)
        },
        [chartId, registerMouseLeaveHandler, unregisterMouseLeaveHandler]
    )

    // positions the tooltip next to the mouse, based on its rendered size
    useTooltipPlacement(tooltipRef, tooltipContent?.anchor ?? null, plotDimensions, margin, tooltipStyle)

    if (tooltipContent === null) return null

    const divStyle: CSSProperties = {
        position: 'fixed',
        // (placed next to the mouse, based on its rendered size, by `useTooltipPlacement`, before
        // it's painted)
        left: 0,
        top: 0,
        backgroundColor: withAlpha(tooltipStyle.backgroundColor, tooltipStyle.backgroundOpacity),
        border: `${tooltipStyle.borderWidth}px solid ${withAlpha(tooltipStyle.borderColor, tooltipStyle.borderOpacity)}`,
        borderRadius: tooltipStyle.borderRadius,
        padding: `${tooltipStyle.paddingTop}px ${tooltipStyle.paddingRight}px ${tooltipStyle.paddingBottom}px ${tooltipStyle.paddingLeft}px`,
        fontFamily: tooltipStyle.fontFamily,
        fontSize: tooltipStyle.fontSize,
        color: tooltipStyle.fontColor,
        lineHeight: 1.6,
        pointerEvents: 'none',
        zIndex: 9999,
    }

    // Tooltip.cloneElement always injects the original <OutlierPlotHtmlTooltipContent> element
    // (including the user's actual children inside it) as our `children` prop. Unwrap one level.
    const content = (children as ReactElement<Props> | undefined)?.props.children

    return createPortal(
        <UseOutlierTooltip.Provider
            value={{tooltipContent, tooltipStyle, datumFormatter, bandFormatter, measureFormatter}}>
            <div ref={tooltipRef} style={divStyle}>
                {content ?? <DefaultOutlierHtmlTooltipContent/>}
            </div>
        </UseOutlierTooltip.Provider>,
        document.body
    )
}

/**
 * Captures the data needed to render the tooltip content, and where it's anchored (the mouse --
 * the tooltip is placed next to it once it's rendered, see {@link useTooltipPlacement})
 * @param seriesName The name of the series
 * @param metadata The band metadata
 * @param mouseCoords The coordinates of the mouse when the event was fired, in canvas-local coordinates
 * @param canvas The chart's canvas element
 * @param setTooltipContent Setter that stashes the captured content for the component to render
 * @return Off-screen {@link TooltipDimensions}, so the parent <Tooltip>'s own background stays invisible
 */
function buildTooltipContent(
    seriesName: string,
    metadata: OutlierBandTooltipMetadata,
    mouseCoords: [x: number, y: number],
    canvas: HTMLCanvasElement,
    setTooltipContent: (content: TooltipContent) => void,
): TooltipDimensions {
    const {
        datum,
        upperMeasure = 1,
        lowerMeasure = 0,
        pointsInBand,
    } = metadata

    // (the tooltip is positioned against the *plot*, from its rendered size, by `useTooltipPlacement`)
    const anchor = tooltipAnchorFor(mouseCoords, canvas)

    setTooltipContent({bandIndex: 0, seriesName, datum, upperMeasure, lowerMeasure, pointsInBand, anchor})

    // Return off-screen coordinates so the Tooltip parent's background div is invisible
    return {x: -99999, y: -99999, contentWidth: 0, contentHeight: 0}
}
