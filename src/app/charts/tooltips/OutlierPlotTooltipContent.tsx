import type {CSSProperties, ReactElement} from "react"
import {useEffect, useMemo, useState, useRef} from "react"
import {createPortal} from "react-dom"
import {useChart} from "../hooks/useChart"
import {usePlotDimensions} from "../hooks/usePlotDimensions"
import type {ContinuousNumericAxis, SeriesLineStyle} from "../axes/axes"
import {ContinuousAxisRange} from "../axes/ContinuousAxisRange"
import {defaultTooltipStyle, type TooltipDimensions, type TooltipStyle} from "./tooltipUtils"
import {tooltipAnchorFor, type TooltipAnchor, useTooltipPlacement} from "./useTooltipPlacement"
import {withAlpha} from "../styling/canvasStyle"
import type {TooltipData} from "../hooks/useTooltip"
import type {OutlierBandTooltipMetadata} from "../plots/OutlierPlot"
import type {OutlierDatum} from "../series/outlierSeries"

/**
 * The properties of the {@link OutlierPlotTooltipContent}
 */
export interface Props {
    /** the style of the tooltip */
    style?: Partial<TooltipStyle>
    /**
     * Formatter for the datum
     * @param x X-coordinate of the datum
     * @param y Y-coordinate of the datum
     * @return a human-readable description of the datum
     */
    datumFormatter?: (x: number, y: number) => string
    /**
     * Formatter for the band (it's handed the band's measures, not its bounds)
     * @param lower The measure of the band's inner edge (the measure of the next tighter band, or
     * 0 for the tightest band)
     * @param upper The measure of the band's outer edge (the hovered band's own measure)
     * @return a human-readable description of the band
     */
    bandFormatter?: (lower: number, upper: number) => string
    /**
     * Formatter for the measure description. Returns one plain string per rendered line (this
     * component's `explanationLines.map((line, index) => <div key={index}>{line}</div>)` below);
     * matches this component's own `datumFormatter`/`bandFormatter` above, both plain `string`
     * (no JSX) since this is the plain-text-flavored tooltip (it was the SVG-flavored one). Contrast with the HTML-flavored sibling
     * {@link useOutlierTooltip}'s own, differently-shaped `measureFormatter`
     * (`(innerProb, outerProb) => string | JSX.Element`, rendered as a single flowing blob) --
     * that's a separate component never composed with this one. The two `measureFormatter`s share
     * a name and concept but intentionally differ in shape to match each tooltip flavor's own
     * rendering strategy; this isn't an oversight to "fix" by unifying the types.
     * @param innerProb Probability of points being within this band where the band is defined by
     * the lower and upper bounds.
     * @param outerProb Probability of points being outside this band (greater than the upper bound)
     * @return a human-readable description of the band, one string per rendered line
     */
    measureFormatter?: (innerProb: number, outerProb: number) => Array<string>
}

/**
 * The data needed to render the tooltip's content, captured at mouse-over time and read back out
 * during render. Replaces the old version's immediate SVG DOM manipulation (which appended and
 * hand-positioned one SVG `<text>` element per line, using `getBBox()` to measure each) -- plain
 * HTML/CSS text flows and sizes itself, so no equivalent per-line measurement is needed here.
 */
interface OutlierTooltipContentState {
    header: string
    datumLine?: string
    bandLine: string
    explanationLines: Array<string>
    countLine: string
    // where the tooltip is anchored (the mouse)
    anchor: TooltipAnchor
}

/**
 * Registers a tooltip content provider for {@link OutlierPlot} bands. When the user hovers over
 * a band, the tooltip shows the measure associated with the band along with the implied outlier
 * probabilities for points inside and outside the band.
 *
 * Must be rendered as a child of a {@link Tooltip} inside a {@link Chart} that contains an
 * {@link OutlierPlot}. On mouse-over, the registered provider just captures the data needed to
 * render (via `setTooltipContent`) and returns off-screen {@link TooltipDimensions} so the parent
 * {@link Tooltip}'s own background element stays invisible -- this component renders its own,
 * independent portal instead (see {@link OutlierPlotHtmlTooltipContent} for the established
 * pattern this follows).
 * @param props The properties describing the tooltip content
 * @return The tooltip's portal, or `null` when no band is being hovered
 */
export function OutlierPlotTooltipContent(props: Props): ReactElement | null {
    const {
        style,
        datumFormatter = (x: number, y: number) => `(${x}, ${y})`,
        bandFormatter = (lower: number, upper: number) => `Band: ${lower} \u2B62 ${upper}`,
        measureFormatter = (innerProb: number, outerProb: number) => [
            `Points have a ${(innerProb * 100).toFixed(1)}% probability of being in this band,`,
            `and a ${(outerProb * 100).toFixed(1)}% probability of being outside this band.`
        ],
    } = props

    const {
        chartId,
        canvas,
        tooltip,
        mouse
    } = useChart<OutlierDatum<readonly number[]>, SeriesLineStyle, OutlierBandTooltipMetadata, ContinuousAxisRange, ContinuousNumericAxis>()

    const {registerTooltipContentProvider} = tooltip
    const {registerMouseLeaveHandler, unregisterMouseLeaveHandler} = mouse

    const {
        margin,
        plotDimensions
    } = usePlotDimensions()

    const tooltipStyle = useMemo(
        () => ({
            ...defaultTooltipStyle,
            ...style
        }),
        [style]
    )

    const [tooltipContent, setTooltipContent] = useState<OutlierTooltipContentState | null>(null)
    // the tooltip (its portal), which is placed next to the mouse once rendered
    const tooltipRef = useRef<HTMLDivElement>(null)

    // register the tooltip content provider, which when called on mouse-over-band events
    // captures the data needed to render the tooltip; the actual rendering happens declaratively
    // below, via the portal.
    useEffect(
        () => {
            if (canvas) {
                registerTooltipContentProvider(
                    (
                        seriesName: string,
                        _time: number,
                        tooltipData: TooltipData<OutlierDatum<readonly number[]>, OutlierBandTooltipMetadata>,
                        mouseCoords: [x: number, y: number]
                    ) => captureTooltipContent(
                        seriesName, tooltipData.metadata, mouseCoords,
                        canvas,
                        datumFormatter, bandFormatter, measureFormatter,
                        setTooltipContent
                    )
                )
            }
        },
        [
            bandFormatter, chartId, canvas, datumFormatter, margin, measureFormatter,
            plotDimensions, registerTooltipContentProvider, tooltipStyle
        ]
    )

    // clears the captured content (and so unmounts the portal) when the mouse leaves the band
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
        pointerEvents: 'none',
        zIndex: 9999,
    }

    return createPortal(
        <div ref={tooltipRef} style={divStyle}>
            <div style={{fontWeight: tooltipStyle.fontWeight + 500, fontSize: tooltipStyle.fontSize + 2}}>
                {tooltipContent.header}
            </div>
            {tooltipContent.datumLine && <div style={{marginTop: 6}}>{tooltipContent.datumLine}</div>}
            <div style={{marginTop: 6}}>{tooltipContent.bandLine}</div>
            <div style={{marginTop: 6}}>
                {tooltipContent.explanationLines.map((line, index) => <div key={index}>{line}</div>)}
            </div>
            <div style={{marginTop: 6}}>{tooltipContent.countLine}</div>
        </div>,
        document.body
    )
}

/**
 * Captures the data needed to render the tooltip content, and where it's anchored (the mouse --
 * the tooltip is placed next to it once it's rendered, see {@link useTooltipPlacement}). Replaces the old version, which appended and hand-positioned one SVG `<text>` element
 * per line via `getBBox()`.
 * @param seriesName The name of the series
 * @param metadata The band metadata
 * @param mouseCoords The coordinates of the mouse when the event was fired, in canvas-local coordinates
 * @param canvas The chart's canvas element
 * @param datumFormatter Formatter for the hovered datum
 * @param bandFormatter Formatter for the band (its measures)
 * @param measureFormatter Formatter for the band's inside/outside probabilities
 * @param setTooltipContent Setter that stashes the captured content for the component to render
 * @return Off-screen {@link TooltipDimensions}, so the parent <Tooltip>'s own background stays invisible
 */
function captureTooltipContent(
    seriesName: string,
    metadata: OutlierBandTooltipMetadata,
    mouseCoords: [x: number, y: number],
    canvas: HTMLCanvasElement,
    datumFormatter: (x: number, y: number) => string,
    bandFormatter: (lower: number, upper: number) => string,
    measureFormatter: (innerProb: number, outerProb: number) => Array<string>,
    setTooltipContent: (content: OutlierTooltipContentState) => void,
): TooltipDimensions {
    const {
        datum,
        upperMeasure = 1,
        lowerMeasure = 0,
        pointsInBand,
    } = metadata
    const outerProb = 1 - upperMeasure
    const innerProb = upperMeasure - lowerMeasure

    setTooltipContent({
        header: `Series: ${seriesName}`,
        datumLine: datum ? datumFormatter(datum.datum.x, datum.datum.y) : undefined,
        bandLine: bandFormatter(lowerMeasure, upperMeasure),
        explanationLines: measureFormatter(innerProb, outerProb),
        countLine: `Points in band: ${pointsInBand}`,
        anchor: tooltipAnchorFor(mouseCoords, canvas),
    })

    // return off-screen coordinates so the Tooltip parent's background div is invisible
    return {x: -99999, y: -99999, contentWidth: 0, contentHeight: 0}
}
