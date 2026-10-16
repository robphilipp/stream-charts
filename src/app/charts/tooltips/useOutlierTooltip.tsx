import {type JSX, createContext, useContext} from "react"
import type {OutlierBandTooltipMetadata} from "../plots/OutlierPlot"
import type {TooltipStyle} from "./tooltipUtils"
import type {TooltipAnchor} from "./useTooltipPlacement"

// where the tooltip is anchored (the mouse); the tooltip itself is placed next to it once rendered
export type TooltipLocation = {anchor: TooltipAnchor}
// the name of the series under the mouse
export type TooltipSeriesName = {seriesName: string}
/**
 * What the outlier tooltip shows: the series, the band (and datum) under the mouse, and where the
 * tooltip is anchored
 */
export type TooltipContent<M extends readonly number[] = readonly number[]> = TooltipSeriesName & OutlierBandTooltipMetadata<M> & TooltipLocation

/**
 * The (optional) formatters for the outlier tooltip's content
 */
export type OutlierTooltipContentFormatters = {
    /**
     * Formatter for the datum
     * @param x X-coordinate of the datum
     * @param y Y-coordinate of the datum
     * @return a human-readable description of the datum
     */
    datumFormatter?: (x: number, y: number) => string | JSX.Element
    /**
     * Formatter for the band (it's handed the band's measures, not its bounds)
     * @param lower The measure of the band's inner edge (the measure of the next tighter band, or
     * 0 for the tightest band)
     * @param upper The measure of the band's outer edge (the hovered band's own measure)
     * @return a human-readable description of the band
     */
    bandFormatter?: (lower: number, upper: number) => string | JSX.Element
    /**
     * Formatter for the measure description. Renders as a single JSX/text blob (this is the
     * HTML-flavored tooltip, which supports arbitrary JSX -- see `datumFormatter`/`bandFormatter`
     * above, both `string | JSX.Element` too). Contrast with {@link OutlierPlotTooltipContent}'s
     * own, differently-shaped `measureFormatter` (`(innerProb, outerProb) => Array<string>`,
     * rendered as one `<div>` per array element) -- that's the plain-string, multi-line
     * SVG-flavored sibling tooltip, a separate component never composed with this one. The two
     * `measureFormatter`s share a name and concept but intentionally differ in shape to match
     * each tooltip flavor's own rendering strategy; this isn't an oversight to "fix" by unifying
     * the types.
     * @param innerProb Probability of points being within this band
     * @param outerProb Probability of points being outside this band
     * @return a human-readable description of the band
     */
    measureFormatter?: (innerProb: number, outerProb: number) => string | JSX.Element
}

/**
 * The outlier tooltip's context: its content (`null` when there's no tooltip), style, and formatters
 */
export type OutlierTooltipContextValue = {
    tooltipContent: TooltipContent | null
    tooltipStyle: TooltipStyle
    datumFormatter: (x: number, y: number) => string | JSX.Element
    bandFormatter: (lower: number, upper: number) => string | JSX.Element
    measureFormatter: (innerProb: number, outerProb: number) => string | JSX.Element
}

export const UseOutlierTooltip = createContext<OutlierTooltipContextValue | null>(null)

/**
 * Hook for consuming the outlier tooltip context inside a child of
 * {@link OutlierPlotHtmlTooltipContent}.
 * @return The tooltip's content, style, and formatters
 * @throws Error when used outside an `<OutlierPlotHtmlTooltipContent>`
 */
export function useOutlierTooltip(): OutlierTooltipContextValue {
    const context = useContext(UseOutlierTooltip)
    if (context === null) {
        throw new Error('useOutlierTooltip must be used inside OutlierPlotHtmlTooltipContent')
    }
    return context
}
