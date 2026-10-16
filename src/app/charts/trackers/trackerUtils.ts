import type {CanvasContext, DrawHandle} from "../d3types";
import {containerDimensionsFrom, type Dimensions, type Margin} from "../styling/margins";
import {fontStringFor, mouseInPlotAreaFor, textDimensions} from "../utils";
import {canvasLocalPoint} from "../plots/hitTesting";
import {AxisLocation, type ContinuousNumericAxis} from "../axes/axes";
import {type TrackerAxisInfo, type TrackerAxisUpdate} from "./Tracker";

/**
 * The font of the tracker's labels
 */
export interface TrackerLabelFont {
    size: number
    color: string
    family: string
    weight: number
}

/**
 * The default font of the tracker's labels
 */
export const defaultTrackerLabelFont: TrackerLabelFont = {
    size: 12,
    color: '#d2933f',
    weight: 300,
    family: 'sans-serif'
}

/**
 * The style of the tracker's line (and whether it's shown)
 */
export interface TrackerStyle {
    visible: boolean;
    color: string,
    lineWidth: number,
}

/**
 * The default tracker style (hidden)
 */
export const defaultTrackerStyle: TrackerStyle = {
    visible: false,
    color: '#d2933f',
    lineWidth: 1,
}

const TRACKER_ID = "stream-chart-tracker"

/**
 * The location of the tracker label
 * Note: replaces enums to support `erasableSyntaxOnly`
 *  TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
 */
export const TrackerLabelLocation = {
    Nowhere: "Nowhere",
    ByAxis: "ByAxis",
} as const
export type TrackerLabelLocation = (typeof TrackerLabelLocation)[keyof typeof TrackerLabelLocation]

/**
 * A small, fixed corner radius (px) used for the tracker label's background, matching the old
 * SVG version's hard-coded `rx: '5px'`.
 */
const LABEL_BACKGROUND_RADIUS = 5

/**
 * Registers a tracker (a line that follows the mouse, with optional per-axis labels) with the
 * canvas context. Replaces the old `trackerControlInstance`, which created SVG `<line>`/`<text>`/
 * `<rect>` elements and updated them via a namespaced `mousemove` handler on the `<svg>`. The
 * canvas version instead registers a draw function that reads the mouse's last-known position
 * (tracked via its own `mousemove` listener on the canvas) and paints the tracker fresh every
 * redraw.
 * @param cc The canvas context to register the tracker's draw function with
 * @param chartId The ID of the chart
 * @param plotDimensions The dimensions of the plot
 * @param margin The margins around the plot
 * @param style The tracker style
 * @param labelFont The font used for the axis labels
 * @param label A map associating each axis with the function that formats the tracker's label for that axis' value
 * @param labelStyle Where the tracker's labels are shown (by the axes, or nowhere)
 * @param onTrackerUpdate A callback function that accepts the current tracker's axis information
 * @param [axisLocation = AxisLocation.Bottom] The optional location of the axis for which the tracker is to
 * be shown. Default is bottom.
 * @param backgroundColor The background color of the tracker label
 * @return A cleanup function that unregisters the tracker's draw function and removes its
 * `mousemove` listener. Call this when the tracker becomes invisible or unmounts (replaces the
 * old `removeTrackerControl`).
 */
export function trackerControlInstance(
    cc: CanvasContext,
    chartId: number,
    plotDimensions: Dimensions,
    margin: Margin,
    style: TrackerStyle,
    labelFont: TrackerLabelFont,
    label: Map<ContinuousNumericAxis, (x: number) => string>,
    labelStyle: TrackerLabelLocation,
    onTrackerUpdate: (update: TrackerAxisUpdate) => void,
    axisLocation: AxisLocation = AxisLocation.Bottom,
    backgroundColor: string
): () => void {
    switch (axisLocation) {
        case AxisLocation.Bottom:
        case AxisLocation.Top:
            return verticalTrackerControlInstance(cc, chartId, plotDimensions, margin, style, labelFont, label, labelStyle, onTrackerUpdate, backgroundColor)
        case AxisLocation.Left:
        case AxisLocation.Right:
        default:
            return horizontalTrackerControlInstance(cc, chartId, plotDimensions, margin, style, labelFont, label, labelStyle, onTrackerUpdate, backgroundColor)
    }
}

/**
 * Registers a vertical tracker line (for x-axes) with the canvas context: the line follows the
 * mouse across the plot area, with a label by each x-axis showing that axis' value at the mouse
 * (see {@link trackerControlInstance}).
 * @param cc The canvas context to register the tracker's draw function with
 * @param chartId The ID of the chart
 * @param plotDimensions The dimensions of the plot
 * @param margin The margins around the plot
 * @param style The tracker style
 * @param labelFont The font used for the axis labels
 * @param label A map associating each axis with the function that formats the tracker's label for that axis' value
 * @param labelStyle Where the tracker's labels are shown (by the axes, or nowhere)
 * @param onTrackerUpdate A callback function that accepts the current tracker's axis information
 * @param backgroundColor The background color of the tracker label
 * @return A cleanup function that unregisters the tracker's draw function and removes its mouse listeners
 */

function verticalTrackerControlInstance(
    cc: CanvasContext,
    chartId: number,
    plotDimensions: Dimensions,
    margin: Margin,
    style: TrackerStyle,
    labelFont: TrackerLabelFont,
    label: Map<ContinuousNumericAxis, (x: number) => string>,
    labelStyle: TrackerLabelLocation,
    onTrackerUpdate: (update: TrackerAxisUpdate) => void,
    backgroundColor: string
): () => void {
    const drawHandle: DrawHandle = `${TRACKER_ID}-vertical-${chartId}`

    // the mouse's last-known position, in canvas coordinates; null when the mouse is outside the canvas
    let mouseX: number | null = null
    let mouseY: number | null = null

    const draw = (context: CanvasContext) => {
        if (mouseX === null || mouseY === null) return
        const {context2D} = context
        const dimensions = containerDimensionsFrom(plotDimensions, margin)
        const inPlot = mouseInPlotAreaFor(mouseX, mouseY, margin, dimensions)

        context2D.save()
        context2D.globalAlpha = inPlot ? 1 : 0
        context2D.strokeStyle = style.color
        context2D.lineWidth = style.lineWidth
        context2D.beginPath()
        context2D.moveTo(mouseX, margin.top)
        context2D.lineTo(mouseX, plotDimensions.height + margin.top)
        context2D.stroke()
        context2D.restore()

        const updateInfo: Array<[string, TrackerAxisInfo]> = []

        label.forEach((trackerLabel, axis) => {
            if (labelStyle === TrackerLabelLocation.ByAxis) {
                const value = axis.scale.invert(mouseX! - margin.left)
                const text = trackerLabel(value)

                context2D.save()
                context2D.font = fontStringFor(labelFont.size, labelFont.family, labelFont.weight)
                const {width: labelWidth, height: labelHeight} = textDimensions(context2D, text)

                const space = 10
                const labelY = axis.location === AxisLocation.Top ?
                    margin.top + labelFont.size + space :
                    margin.top + plotDimensions.height - space
                const xOffset = 10
                const labelX = Math.min(dimensions.width - margin.right - labelWidth, mouseX! + xOffset)

                // label background
                const padding = 3
                context2D.globalAlpha = inPlot ? 0.8 : 0
                context2D.fillStyle = backgroundColor
                context2D.beginPath()
                context2D.roundRect(
                    labelX - padding,
                    labelY - labelHeight - padding,
                    labelWidth + 2 * padding,
                    labelHeight + 2 * padding,
                    LABEL_BACKGROUND_RADIUS
                )
                context2D.fill()

                // label text
                context2D.globalAlpha = inPlot ? 1 : 0
                context2D.fillStyle = labelFont.color
                context2D.textAlign = 'left'
                context2D.textBaseline = 'alphabetic'
                context2D.fillText(text, labelX, labelY)
                context2D.restore()
            }

            updateInfo.push([axis.axisId, {
                x: axis.scale.invert(mouseX! - margin.left),
                axisLocation: axis.location
            }])
        })

        if (inPlot) {
            onTrackerUpdate(new Map<string, TrackerAxisInfo>(updateInfo))
        }
    }

    cc.register(drawHandle, draw, 20)

    const handleMouseMove = (event: MouseEvent) => {
        const [x, y] = canvasLocalPoint(event, cc.canvas)
        mouseX = x
        mouseY = y
        cc.requestRedraw()
    }
    const handleMouseLeave = () => {
        mouseX = null
        mouseY = null
        cc.requestRedraw()
    }
    cc.canvas.addEventListener('mousemove', handleMouseMove)
    cc.canvas.addEventListener('mouseleave', handleMouseLeave)

    return () => {
        cc.unregister(drawHandle)
        cc.canvas.removeEventListener('mousemove', handleMouseMove)
        cc.canvas.removeEventListener('mouseleave', handleMouseLeave)
    }
}

/**
 * Registers a horizontal tracker line (for y-axes) with the canvas context: the line follows the
 * mouse up and down the plot area, with a label by each y-axis showing that axis' value at the
 * mouse (see {@link trackerControlInstance}).
 * @param cc The canvas context to register the tracker's draw function with
 * @param chartId The ID of the chart
 * @param plotDimensions The dimensions of the plot
 * @param margin The margins around the plot
 * @param style The tracker style
 * @param labelFont The font used for the axis labels
 * @param label A map associating each axis with the function that formats the tracker's label for that axis' value
 * @param labelStyle Where the tracker's labels are shown (by the axes, or nowhere)
 * @param onTrackerUpdate A callback function that accepts the current tracker's axis information
 * @param backgroundColor The background color of the tracker label
 * @return A cleanup function that unregisters the tracker's draw function and removes its mouse listeners
 */

function horizontalTrackerControlInstance(
    cc: CanvasContext,
    chartId: number,
    plotDimensions: Dimensions,
    margin: Margin,
    style: TrackerStyle,
    labelFont: TrackerLabelFont,
    label: Map<ContinuousNumericAxis, (x: number) => string>,
    labelStyle: TrackerLabelLocation,
    onTrackerUpdate: (update: TrackerAxisUpdate) => void,
    backgroundColor: string
): () => void {
    const drawHandle: DrawHandle = `${TRACKER_ID}-horizontal-${chartId}`

    let mouseX: number | null = null
    let mouseY: number | null = null

    const draw = (context: CanvasContext) => {
        if (mouseX === null || mouseY === null) return
        const {context2D} = context
        const dimensions = containerDimensionsFrom(plotDimensions, margin)
        const inPlot = mouseInPlotAreaFor(mouseX, mouseY, margin, dimensions)

        context2D.save()
        context2D.globalAlpha = inPlot ? 1 : 0
        context2D.strokeStyle = style.color
        context2D.lineWidth = style.lineWidth
        context2D.beginPath()
        context2D.moveTo(margin.left, mouseY)
        context2D.lineTo(plotDimensions.width + margin.left, mouseY)
        context2D.stroke()
        context2D.restore()

        type AxisAndLabelInfo = {
            axis: ContinuousNumericAxis
            text: string
            labelWidth: number
            labelHeight: number
        }

        // need to calculate each axis-label position separately, because at the plot edges, the axis-label
        // positions depend on each other. For example, at the left edge, the left-axis label needs to move
        // to the right of the mouse to remain in the plot area. Therefore, the right-axis label needs
        // to move as well but needs to know the width of the left-axis label to do so.
        //
        // measure all the labels first, then position them (mirrors the old two-phase SVG approach,
        // where text had to be set before `getBBox()` would return a meaningful size)
        context2D.font = fontStringFor(labelFont.size, labelFont.family, labelFont.weight)
        const boundingBoxes: Map<AxisLocation, AxisAndLabelInfo> = new Map(Array.from(label.entries())
            .map(([axis, trackerLabel]) => {
                const text = trackerLabel(axis.scale.invert(mouseY! - margin.top))
                const {width: labelWidth, height: labelHeight} = textDimensions(context2D, text)
                return [axis.location, {axis, text, labelWidth, labelHeight}]
            }))

        // place the labels so that they remain in the plot area
        const space = 10
        const rightLabelWidth = (boundingBoxes.get(AxisLocation.Right)?.labelWidth || -space) + space

        const updateInfo: Array<[string, TrackerAxisInfo]> = Array.from(boundingBoxes.entries())
            .map(([location, {axis, text, labelWidth, labelHeight}]) => {
                if (labelStyle === TrackerLabelLocation.ByAxis) {
                    const labelX = location === AxisLocation.Left ?
                        margin.left + space :
                        margin.left + plotDimensions.width - rightLabelWidth - space

                    const yOffset = space
                    const labelY = Math.max(mouseY! - yOffset, margin.top + yOffset + labelHeight)

                    // label background
                    const padding = 5
                    context2D.save()
                    context2D.globalAlpha = inPlot ? 0.8 : 0
                    context2D.fillStyle = backgroundColor
                    context2D.beginPath()
                    context2D.roundRect(
                        labelX - padding,
                        labelY - labelHeight - 1,
                        labelWidth + 2 * padding,
                        labelHeight + 2 * padding,
                        LABEL_BACKGROUND_RADIUS
                    )
                    context2D.fill()

                    // label text
                    context2D.globalAlpha = inPlot ? 1 : 0
                    context2D.fillStyle = labelFont.color
                    context2D.textAlign = 'left'
                    context2D.textBaseline = 'alphabetic'
                    context2D.fillText(text, labelX, labelY)
                    context2D.restore()
                }

                const trackerInfo: TrackerAxisInfo = {
                    x: axis.scale.invert(mouseY! - margin.top + margin.bottom),
                    axisLocation: axis.location
                }
                return [axis.axisId, trackerInfo]
            })

        if (inPlot) {
            onTrackerUpdate(new Map<string, TrackerAxisInfo>(updateInfo))
        }
    }

    cc.register(drawHandle, draw, 20)

    const handleMouseMove = (event: MouseEvent) => {
        const [x, y] = canvasLocalPoint(event, cc.canvas)
        mouseX = x
        mouseY = y
        cc.requestRedraw()
    }
    const handleMouseLeave = () => {
        mouseX = null
        mouseY = null
        cc.requestRedraw()
    }
    cc.canvas.addEventListener('mousemove', handleMouseMove)
    cc.canvas.addEventListener('mouseleave', handleMouseLeave)

    return () => {
        cc.unregister(drawHandle)
        cc.canvas.removeEventListener('mousemove', handleMouseMove)
        cc.canvas.removeEventListener('mouseleave', handleMouseLeave)
    }
}
