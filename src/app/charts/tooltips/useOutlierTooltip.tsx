import {type JSX, createContext, useContext} from "react"
import type {OutlierBandTooltipMetadata} from "../plots/OutlierPlot"
import type {TooltipStyle} from "./tooltipUtils"

/**
 * What the outlier tooltip shows: the name of the series, and the band (and, for an outlier, the
 * datum) under the mouse
 */
export type OutlierTooltipData<M extends readonly number[] = readonly number[]> =
    {seriesName: string} & OutlierBandTooltipMetadata<M>

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
     * Formatter for the description of the band's measure: the probabilities of a point being in,
     * and outside, the band
     * @param innerProb Probability of points being within this band
     * @param outerProb Probability of points being outside this band
     * @return a human-readable description of the band: text, JSX, or an array of lines (shown
     * one per line)
     */
    measureFormatter?: (innerProb: number, outerProb: number) => string | JSX.Element | Array<string>
}

/**
 * The outlier tooltip's context: what it shows, its style, and its formatters (the
 * `measureFormatter`'s lines, when it returns an array of them, already laid out one per line)
 */
export type OutlierTooltipContextValue = {
    tooltipContent: OutlierTooltipData
    tooltipStyle: TooltipStyle
    datumFormatter: (x: number, y: number) => string | JSX.Element
    bandFormatter: (lower: number, upper: number) => string | JSX.Element
    measureFormatter: (innerProb: number, outerProb: number) => string | JSX.Element
}

export const UseOutlierTooltip = createContext<OutlierTooltipContextValue | null>(null)

/**
 * Hook for consuming the outlier tooltip context inside a child of
 * {@link OutlierPlotTooltipContent} (for writing your own content for the outlier tooltip)
 * @return What the tooltip shows, its style, and its formatters
 * @throws Error when used outside an `<OutlierPlotTooltipContent>`
 */
export function useOutlierTooltip(): OutlierTooltipContextValue {
    const context = useContext(UseOutlierTooltip)
    if (context === null) {
        throw new Error('useOutlierTooltip must be used inside OutlierPlotTooltipContent')
    }
    return context
}
