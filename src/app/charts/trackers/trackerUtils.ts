import {SvgSelection, TrackerSelection} from "../d3types";
import * as d3 from "d3";
import {Selection} from "d3";
import {Datum} from "../series/timeSeries";
import {containerDimensionsFrom, Dimensions, Margin, plotDimensionsFrom} from "../styling/margins";
import {mouseInPlotAreaFor, textWidthOf} from "../utils";
import {AxisLocation, ContinuousNumericAxis} from "../axes/axes";
import {TrackerAxisInfo, TrackerAxisUpdate, TrackerLabelLocation} from "./Tracker";
import React from "react";

export interface TrackerLabelFont {
    size: number
    color: string
    family: string
    weight: number
}

export const defaultTrackerLabelFont: TrackerLabelFont = {
    size: 12,
    color: '#d2933f',
    weight: 300,
    family: 'sans-serif'
}

export interface TrackerStyle {
    visible: boolean;
    color: string,
    lineWidth: number,
}

export const defaultTrackerStyle: TrackerStyle = {
    visible: false,
    color: '#d2933f',
    lineWidth: 1,
};

/**
 * Creates or returns the existing SVG elements for displaying a tracker line
 * @param chartId The ID of the chart
 * @param container The SVG container
 * @param svg The SVG selection
 * @param plotDimensions The dimensions of the plot
 * @param margin The margins around the plot
 * @param style The tracker style
 * @param labelFont The font used for the axis labels
 * @param label A function that returns the tracker label string for a given x-value
 * @param labelStyle The location style for the tracker (i.e. on the axes, next to the mouse, none shown)
 * @param onTrackerUpdate A callback function the accepts the current tracker's axis information
 * @return The tracker selection
 */
export function trackerControlInstance(
    chartId: number,
    container: SVGSVGElement,
    svg: SvgSelection,
    plotDimensions: Dimensions,
    margin: Margin,
    style: TrackerStyle,
    labelFont: TrackerLabelFont,
    label: Map<ContinuousNumericAxis, (x: number) => string>,
    labelStyle: TrackerLabelLocation,
    onTrackerUpdate: (update: TrackerAxisUpdate) => void
): TrackerSelection {
    const trackerLine = svg
        .append<SVGLineElement>('line')
        .attr('id', `stream-chart-tracker-line-${chartId}`)
        .attr('class', 'tracker')
        .attr('y1', margin.top)
        .attr('y2', plotDimensions.height + margin.top - margin.bottom)
        .attr('stroke', style.color)
        .attr('stroke-width', style.lineWidth)
        .attr('opacity', 0) as Selection<SVGLineElement, Datum, null, undefined>


    label.forEach((labelFn, axis) => {
        // create the text element holding the tracker time
        const label = axis.location === AxisLocation.Top ?
            Math.max(0, margin.top - 20) :
            Math.max(0, plotDimensions.height + margin.top - 3)
        svg
            .append<SVGTextElement>('text')
            .attr('id', `stream-chart-tracker-label-${chartId}-${axis.location}`)
            .attr('y', label)
            .attr('fill', labelFont.color)
            .attr('font-family', labelFont.family)
            .attr('font-size', labelFont.size)
            .attr('font-weight', labelFont.weight)
            .attr('opacity', 0)
            .text(() => '')
    })

    const containerDimensions = containerDimensionsFrom(plotDimensions, margin)
    svg.on(
        'mousemove',
        event => handleShowTracker(
            chartId, container, event, margin, containerDimensions, style, labelFont, label, labelStyle, onTrackerUpdate
        )
    )

    return trackerLine
}

/**
 * Removes the tracker control from the chart
 * @param svg The svg selection holding the tracker control
 */
export function removeTrackerControl(svg: SvgSelection) {
    svg.on('mousemove', () => null)
}

/**
 * Callback when the mouse tracker is to be shown
 * @param chartId The ID number of the chart
 * @param container The svg container
 * @param event The mouse-over series event
 * @param margin The plot margins
 * @param dimensions The container dimensions (i.e. the plot dimensions plus its margins)
 * @param trackerStyle The style settings for the tracker line
 * @param labelFont The style settings for the tracker font
 * @param label A function that returns the tracker label string
 * @param labelStyle Where to display the tracker labels (i.e. with-mouse, with-axes, no-where)
 * @param onTrackerUpdate A callback function the accepts the current tracker's axis information
 */
function handleShowTracker(
    chartId: number,
    container: SVGSVGElement,
    // event: MouseEvent,
    event: React.MouseEvent<SVGSVGElement>,
    margin: Margin,
    dimensions: Dimensions,
    trackerStyle: TrackerStyle,
    labelFont: TrackerLabelFont,
    label: Map<ContinuousNumericAxis, (x: number) => string>,
    labelStyle: TrackerLabelLocation,
    onTrackerUpdate: (update: TrackerAxisUpdate) => void
): void {
    // determine whether the mouse is in the plot area
    const [x, y] = d3.pointer(event, container)
    const inPlot = mouseInPlotAreaFor(x, y, margin, dimensions)

    const updateInfo: Array<[string, TrackerAxisInfo]> = Array.from(label.entries())
        .map(([axis, trackerLabel]) => {
            // when the mouse is in the plot area, then set the opacity of the tracker line and label to 1,
            // which means it is fully visible. when the mouse is not in the plot area, set the opacity to 0,
            // which means the tracker line and label are invisible.
            d3.select<SVGLineElement, Datum>(`#stream-chart-tracker-line-${chartId}`)
                .attr('x1', x)
                .attr('x2', x)
                .attr('stroke', trackerStyle.color)
                .attr('stroke-width', trackerStyle.lineWidth)
                .attr('opacity', () => inPlot ? 1 : 0)

            const label = d3.select<SVGTextElement, any>(`#stream-chart-tracker-label-${chartId}-${axis.location}`)
                .attr('fill', labelFont.color)
                .attr('font-family', labelFont.family)
                .attr('font-size', labelFont.size)
                .attr('font-weight', labelFont.weight)
                .attr('opacity', () => inPlot ? 1 : 0)
                .text(() => trackerLabel(x))

            // when the label-style is to be with the mouse
            if (labelStyle === TrackerLabelLocation.WithMouse) {
                // todo the offsets should be based on the font size of the tracker label
                const topOffset = 30
                const offset = axis.location === AxisLocation.Top ? topOffset : 10
                const {height} = plotDimensionsFrom(dimensions.width, dimensions.height, margin)
                const labelY = Math.min(
                    Math.max(margin.top + 15 + topOffset - offset, y - offset),
                    margin.top + height - margin.bottom - offset
                )
                label.attr('y', labelY)
            }

            // adjust the label position when the tracker is at the right-most edges of the plot so that
            // the label remains visible (i.e. doesn't get clipped)
            const xOffset = TrackerLabelLocation.WithMouse ? 10 : 0
            const labelWidth = textWidthOf(label)
            label.attr('x', Math.min(dimensions.width - margin.right - labelWidth, x + xOffset))

            const trackerInfo: TrackerAxisInfo = {
                x: axis.scale.invert(x - margin.left),
                axisLocation: axis.location
            }
            return [axis.axisId, trackerInfo]
        })

    if (inPlot) {
        onTrackerUpdate(new Map(updateInfo))
    }
}

