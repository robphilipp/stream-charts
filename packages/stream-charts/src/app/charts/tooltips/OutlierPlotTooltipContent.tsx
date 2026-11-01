import type {JSX, ReactElement} from "react"
import type {TooltipStyle} from "./tooltipUtils"
import {TooltipContent} from "./TooltipContent"
import type {OutlierBandTooltipMetadata} from "../plots/OutlierPlot"
import type {OutlierDatum} from "../series/outlierSeries"
import {DefaultOutlierTooltipContent} from "./DefaultOutlierTooltipContent"
import {type OutlierTooltipContentFormatters, type OutlierTooltipData, UseOutlierTooltip} from "./useOutlierTooltip"

/**
 * The properties of the {@link OutlierPlotTooltipContent}: its style, its (optional) custom
 * content, and the formatters for the content
 */
export type Props = {
    /**
     * Overrides of the style of the enclosing {@link Tooltip}
     */
    style?: Partial<TooltipStyle>
    /**
     * Custom tooltip content, which gets what the tooltip shows, and the formatters, from
     * {@link useOutlierTooltip}. Defaults to {@link DefaultOutlierTooltipContent}.
     */
    children?: JSX.Element | Array<JSX.Element>
} & OutlierTooltipContentFormatters

/**
 * The tooltip content for an {@link OutlierPlot}: when the mouse is over a band, or an outlier,
 * shows the series' name, the outlier (if any), the band, the probabilities of a point being in
 * and outside the band, and the number of points in the band. Put it inside a {@link Tooltip}.
 *
 * To lay the content out yourself, put your own component inside this one: it gets what the
 * tooltip shows, its style, and the formatters, from {@link useOutlierTooltip}.
 * @param props The style, the formatters, and the (optional) custom content
 * @return The tooltip's box (a portal), or `null` when no band or outlier is hovered
 */
export function OutlierPlotTooltipContent(props: Props): ReactElement | null {
    const {
        style,
        children,
        datumFormatter = (x: number, y: number) => `(${x}, ${y})`,
        bandFormatter = (lower: number, upper: number) => `Band: ${lower} ⭢ ${upper}`,
        measureFormatter = (innerProb: number, outerProb: number) => `Points have a ${(innerProb * 100).toFixed(1)}% probability of being in this band, and a ${(outerProb * 100).toFixed(1)}% probability of being outside this band`,
    } = props

    // (a description given as lines is shown one per line)
    const measureDescription = (innerProb: number, outerProb: number): string | JSX.Element => {
        const description = measureFormatter(innerProb, outerProb)
        return Array.isArray(description) ?
            <>{description.map((line, index) => <div key={index}>{line}</div>)}</> :
            description
    }

    return (
        <TooltipContent<OutlierDatum<readonly number[]>, OutlierBandTooltipMetadata, OutlierTooltipData>
            style={style}
            boxStyle={{lineHeight: 1.6}}
            capture={(seriesName, _time, {metadata}) => ({...metadata, seriesName})}
        >
            {(tooltipContent, tooltipStyle) =>
                <UseOutlierTooltip.Provider
                    value={{tooltipContent, tooltipStyle, datumFormatter, bandFormatter, measureFormatter: measureDescription}}
                >
                    {children ?? <DefaultOutlierTooltipContent/>}
                </UseOutlierTooltip.Provider>
            }
        </TooltipContent>
    )
}
