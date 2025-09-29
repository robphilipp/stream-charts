import {Dimensions, Margin} from "../styling/margins";
import * as d3 from "d3";
import {GSelection, SvgSelection} from "../d3types";

export type Series<D> = Array<D>

/**
 * Creates the main SVG for holding the plot.
 * @param chartId A unique value identifying the chart.
 * @param container The SVG element interface
 * @param plotDimensions The dimensions of the plot
 * @param color The SVG `color` attribute used for the axis
 */
export function createPlotContainer(
    chartId: number,
    container: SVGSVGElement,
    plotDimensions: Dimensions,
    color: string
): GSelection {
    const {width, height} = plotDimensions
    return d3.select<SVGSVGElement, any>(container)
        .attr('width', Math.max(0, width))
        .attr('height', Math.max(0, height))
        .attr('color', color)
        .append<SVGGElement>('g')
        .attr('id', `main-container-${chartId}`)
}

/**
 * Adds a clip area for the chart to the specified SVG element. The clip-area is given
 * an `id` of `clip-series-<chart_id>`, which because the chart ID should be unique, makes
 * this unique as well
 * @param chartId The ID of the chart to which the clip area is to be added
 * @param svg The SVG element to which the clip area is to be added
 * @param plotDimensions The dimensions of the plot
 * @param margin The margins around the plot
 * @return The ID of the clip-path
 */
export function setClipPath(chartId: number, svg: SvgSelection, plotDimensions: Dimensions, margin: Margin): string {
    const clipPathId = `chart-clip-path-${chartId}`

    // remove the old clipping region and add a new one with the updated plot dimensions
    svg.select('defs').remove();
    svg
        .append('defs')
        .append("clipPath")
        .attr("id", clipPathId)
        .append("rect")
        .attr("width", Math.max(0, plotDimensions.width))
        .attr("height", Math.max(margin.bottom, plotDimensions.height - margin.bottom))

    return clipPathId
}

/**
 * Represents the assignment of an x-axis and y-axis to a series. This is used
 * by the plots (see, for example, {@link ScatterPlot} and {@link RasterPlot})
 * to manage the assignment of axes to series
 */
export interface AxesAssignment {
    xAxis: string
    yAxis: string
}

/**
 * Factory function for the assignment of axes to series
 * @param xAxis The ID of the x-axis
 * @param yAxis The ID of the y-axis
 * @return An {@link AxesAssignment}
 */
export const assignAxes = (xAxis: string, yAxis: string): AxesAssignment => ({xAxis, yAxis})


