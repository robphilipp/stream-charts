import {
    type AxesFont,
    AxisLocation,
    defaultAxesFont,
    type SeriesStyle,
    addContinuousNumericXAxis,
    addContinuousNumericYAxis,
    removeContinuousXAxis,
    removeContinuousYAxis,
    type ContinuousNumericAxis
} from "./axes";
import {useChart} from "../hooks/useChart";
import {useEffect, useRef} from "react";
import * as d3 from "d3";
import type {ScaleContinuousNumeric} from "d3";
import type {Dimensions, Margin} from "../styling/margins";
import {usePlotDimensions} from "../hooks/usePlotDimensions";
import type {Datum} from "../series/timeSeries";
import {AxisInterval} from "./AxisInterval";
import {ContinuousAxisRange} from "./ContinuousAxisRange";

export interface Props {
    // the unique ID of the axis
    axisId: string
    // the location of the axis. for x-axes, this must be either top or bottom. for
    // y-axes, this mut be either left or right
    location: AxisLocation
    // linear, log, or power scale that defaults to linear scale when not specified
    scale?: ScaleContinuousNumeric<number, number>
    // the min and max values for the axis
    domain: [min: number, max: number]
    // the font for drawing the axis ticks and labels
    font?: Partial<AxesFont>
    // the axis label
    label: string
    // The domain prop holds the axis bounds as a (min, max) tuple. The default
    // behavior is to update the axis bounds when the **values** of the domain
    // prop change, rather than when the object reference changes. This allows
    // a user of the chart to specify a tuple-literal as the ranges, rather than
    // forcing the user of the chart to create a ref and use that ref.
    //
    // This behavior is important when allowing the axes to scroll in time, as
    // is done in the scatter plot or the raster plot. In this case, if the user
    // of the raster chart specifies the axis domain as a tuple-literal, then
    // the bounds will get reset to their original value with each render.
    //
    // For charts that don't scroll, such as the "iterates" chart, we would like
    // the axis bounds to be reset based on a change to the object ref instead.
    // This is because the user may want to change axis-bounds, for example, when
    // for a different "iterates" function is selected. And in such a case, we set
    // this property to false.
    updateAxisBasedOnDomainValues?: boolean
    /**
     * When `true`, the axis' domain grows to fit the data plotted against it: when the data goes
     * above (or below) the domain, the domain grows to include it, but never past `autoScaleMax`
     * (or `autoScaleMin`). The domain only ever grows -- it's restored to the `domain` prop when the
     * plot's data is replaced (e.g. on a reset), or when the `domain` prop changes. When `false`
     * (the default), the domain is exactly the `domain` prop.
     *
     * For y-axes only (an x-axis' domain follows time, and its zooming and panning), in the plots
     * that support it (currently the scatter plot).
     */
    autoScale?: boolean
    /**
     * The smallest value an auto-scaling axis' domain may grow down to. Defaults to `-Infinity`
     * (no limit).
     */
    autoScaleMin?: number
    /**
     * The largest value an auto-scaling axis' domain may grow up to. Defaults to `Infinity` (no
     * limit).
     */
    autoScaleMax?: number
}

/**
 * Represents a continuous numeric axis (x or y) that can be place on the top, bottom,
 * left, or right of the chart. The domain (axis range) can be managed by this axis
 * component or managed externally (i.e. deferred). This component returns null, meaning
 * React won't render it because we are drawing directly onto the chart's shared canvas and
 * don't want React involved, except to call this function if the props change.
 * @param props The properties for the axis
 */
export function ContinuousAxis(props: Props): null {
    const {
        chartId,
        canvasContext,
        axes,
        color
    } = useChart<Datum, SeriesStyle, unknown, ContinuousAxisRange, ContinuousNumericAxis>()

    const {
        xAxesState,
        yAxesState,
        addXAxis,
        addYAxis,
        axisRangeFor,
        setAxisIntervalFor,
        updateAxisRanges,
        addAxesRangesUpdateHandler,
        removeAxesRangesUpdateHandler,
    } = axes

    const {
        plotDimensions,
        margin
    } = usePlotDimensions()

    const {
        axisId,
        location,
        scale = d3.scaleLinear(),
        domain,
        updateAxisBasedOnDomainValues = true,
        label,
        autoScale = false,
        autoScaleMin = -Infinity,
        autoScaleMax = Infinity,
    } = props

    const axisRef = useRef<ContinuousNumericAxis>(undefined)
    const rangeUpdateHandlerIdRef = useRef<string>(undefined)
    // the axisId this axis was actually created under, so the main effect below can tell "axisId
    // changed since I last ran" apart from "first run" -- see its use for why this matters
    const createdAxisIdRef = useRef<string | undefined>(undefined)

    const axisIdRef = useRef<string>(axisId)
    const marginRef = useRef<Margin>(margin)
    // holds on the domain from the original props so that we can determine whether the props changed
    // or whether the axis changes from resizing, zoom, scrolling, etc
    const domainRef = useRef<AxisInterval>(AxisInterval.as(domain))
    const domainPropRef = useRef<[min: number, max: number]>(domain)
    useEffect(
        () => {
            axisIdRef.current = axisId
            marginRef.current = margin
        },
        [axisId, plotDimensions, margin]
    )

    useEffect(
        () => {
            if (canvasContext) {
                // a changed axisId prop means axisRef.current (and its range-update handler) were
                // created under the OLD id -- the separate unmount-cleanup effect below (also keyed
                // on axisId) already unregistered the OLD id's canvas draw handle by the time this
                // runs (React fires that cleanup, closing over the previous axisId, before this
                // effect re-runs). Without resetting axisRef.current here too, the `else` branch
                // below would run instead of re-creating the axis, silently leaving it undrawn
                // under the new id forever -- this mount-once guard otherwise never resets on its
                // own.
                if (createdAxisIdRef.current !== undefined && createdAxisIdRef.current !== axisId) {
                    if (rangeUpdateHandlerIdRef.current) {
                        removeAxesRangesUpdateHandler(rangeUpdateHandlerIdRef.current)
                        rangeUpdateHandlerIdRef.current = undefined
                    }
                    axisRef.current = undefined
                }

                const font: AxesFont = {...defaultAxesFont(), color, ...props.font}

                const handleRangeUpdates = (updates: Map<string, ContinuousAxisRange>, plotDim: Dimensions): void => {
                    if (rangeUpdateHandlerIdRef.current && axisRef.current) {
                        const range = updates.get(axisId)
                        if (range) {
                            axisRef.current.update(range.current, plotDim, marginRef.current)
                        }
                    }
                }

                if (axisRef.current === undefined) {
                    createdAxisIdRef.current = axisId
                    switch (location) {
                        case AxisLocation.Bottom:
                        case AxisLocation.Top: {
                            axisRef.current = addContinuousNumericXAxis(
                                canvasContext, axisId, plotDimensions, location, scale, domain,
                                font, margin, label, setAxisIntervalFor
                            )
                            // add the x-axis to the chart context
                            const [start, end] = AxisInterval.as(domain).asTuple()
                            addXAxis(axisRef.current, axisId, ContinuousAxisRange.from(start, end))

                            // add an update handler
                            rangeUpdateHandlerIdRef.current = `x-axis-${chartId}-${axisId}-${location.valueOf()}`
                            addAxesRangesUpdateHandler(rangeUpdateHandlerIdRef.current, handleRangeUpdates)

                            break
                        }

                        case AxisLocation.Left:
                        case AxisLocation.Right: {
                            axisRef.current = addContinuousNumericYAxis(
                                canvasContext, axisId, plotDimensions, location, scale, domain,
                                font, margin, label, setAxisIntervalFor
                            )
                            // add the y-axis to the chart context
                            const [start, end] = AxisInterval.as(domain).asTuple()
                            addYAxis(axisRef.current, axisId, ContinuousAxisRange.from(start, end))

                            // add an update handler
                            rangeUpdateHandlerIdRef.current = `y-axis-${chartId}-${axisId}-${location.valueOf()}`
                            addAxesRangesUpdateHandler(rangeUpdateHandlerIdRef.current, handleRangeUpdates)
                        }
                    }
                } else {
                    // calculate the current domain for the axis based on the current interval (range)
                    const currentDomain = axisRangeFor(axisId)
                        .map(range => range.current)
                        .getOrElse(AxisInterval.empty())

                    // convert the domain from the props to an axis interval for easier comparison
                    const propDomain = AxisInterval.as(domain)

                    // select whether to update based on whether we have specified that we update the axis
                    // range when the domain from the props changes. If the conditions of the first if
                    // statement are met, then we do a full update of the axis (we update the current, original
                    // range and make the callback that the range has changed with the updated range map)
                    if (
                        // update axis when the domain from the props has changed
                        (updateAxisBasedOnDomainValues && !domainRef.current.equals(propDomain)) ||
                        // or when the axis range has actually changed, but we don't update from props
                        (!updateAxisBasedOnDomainValues && domainPropRef.current !== domain)
                    ) {
                        domainRef.current = propDomain
                        domainPropRef.current = domain
                        // preserve any existing `.original` tracking (e.g. from an in-progress
                        // zoom) rather than collapsing it to match this new current. A domain-prop
                        // change here reflects the chart's OWN state being round-tripped back in
                        // (e.g. a zoom/auto-scroll notifying `onUpdateAxesBounds`, which a caller
                        // wrote into a store that feeds this same `domain` prop) at least as often
                        // as it reflects a genuine external reset -- and there's no way to tell
                        // those apart from here. Zoom math is now incremental (see
                        // `ContinuousAxisRange.scaledRange`), so preserving `.original` isn't
                        // required for zoom correctness anymore, but it's still the more accurate
                        // value to carry forward on an ordinary round-trip. A genuine external reset
                        // (e.g. the Reset button) already restores the whole axis explicitly
                        // elsewhere, so this doesn't need to special-case it too.
                        const updatedRange = axisRangeFor(axisId)
                            .map(range => range.update(propDomain.start, propDomain.end) as ContinuousAxisRange)
                            .getOrElse(ContinuousAxisRange.from(propDomain.start, propDomain.end))
                        updateAxisRanges(new Map([[axisId, updatedRange]]))
                    }
                    // otherwise, if the domain exists, update the current axis
                    else if (currentDomain.isNotEmpty()) {
                        axisRef.current.update(currentDomain, plotDimensions, margin)
                    }

                    // keep the label/tick color in sync with the chart's color (e.g. on theme change),
                    // without recreating the axis or touching its domain
                    axisRef.current.updateFont(font)
                }

                // the auto-scaling settings, which the plot applies (y-axes only: an x-axis' domain
                // follows time, and its zooming and panning)
                const isYAxis = location === AxisLocation.Left || location === AxisLocation.Right
                const wasAutoScaling = axisRef.current.autoScale !== undefined
                axisRef.current.autoScale = autoScale && isYAxis ?
                    {domain: AxisInterval.as(domain).asTuple(), min: autoScaleMin, max: autoScaleMax} :
                    undefined
                // turning auto-scaling off puts the axis back to its own domain
                if (wasAutoScaling && axisRef.current.autoScale === undefined) {
                    const propDomain = AxisInterval.as(domain)
                    updateAxisRanges(new Map([[axisId, axisRangeFor(axisId)
                        .map(range => range.update(propDomain.start, propDomain.end) as ContinuousAxisRange)
                        .getOrElse(ContinuousAxisRange.from(propDomain.start, propDomain.end))
                    ]]))
                }
            }
        },
        [
            chartId, axisId, label, location, props.font, xAxesState, yAxesState, addXAxis, addYAxis, domain,
            scale, canvasContext, margin, plotDimensions, setAxisIntervalFor,
            axisRangeFor,
            addAxesRangesUpdateHandler,
            removeAxesRangesUpdateHandler,
            updateAxisRanges,
            color, updateAxisBasedOnDomainValues,
            autoScale, autoScaleMin, autoScaleMax
        ]
    )

    // unregister the axes-provider range-update handler on a genuine unmount -- the main effect
    // above only removes it on an axisId *change* (line ~130), never on unmount itself, so
    // without this a component that unmounts and later remounts with the same chartId/axisId/
    // location (hence the same computed handlerId) would try to re-register under an ID that's
    // still occupied and throw ("Handler with ID already exists..."). Mirrors OrdinalAxis.tsx's
    // identical cleanup effect.
    useEffect(
        () => {
            return () => {
                if (rangeUpdateHandlerIdRef.current) {
                    removeAxesRangesUpdateHandler(rangeUpdateHandlerIdRef.current)
                }
            }
        },
        [removeAxesRangesUpdateHandler]
    )

    // unregister the axis' draw function when the axis unmounts (e.g. the chart is torn down, or
    // this axis is swapped out for a different one)
    useEffect(
        () => {
            return () => {
                if (canvasContext) {
                    switch (location) {
                        case AxisLocation.Bottom:
                        case AxisLocation.Top:
                            removeContinuousXAxis(canvasContext, axisId)
                            break
                        case AxisLocation.Left:
                        case AxisLocation.Right:
                            removeContinuousYAxis(canvasContext, axisId)
                    }
                }
            }
        },
        [canvasContext, axisId, location]
    )

    return null
}
