import {type JSX, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {type Dimensions, dimensionsNotEqual, type Margin, plotDimensionsFrom} from "../styling/margins";
import {defaultPlotDimensions} from "./defaultPlotDimensions";
import {type PlotDimensionChangeHandler, PlotDimensionsContext} from "./usePlotDimensions";

export type Props = {
    containerDimensions: Dimensions
    margin: Margin
    children: JSX.Element | Array<JSX.Element>
}

/**
 * Provides the plot's dimensions and margins (see {@link usePlotDimensions}): the plot dimensions
 * are the container's dimensions less the margins, and are updated (and the registered change
 * handlers called) when the container's dimensions or the margins change.
 * @param props The properties
 * @return The children wrapped in this provider
 */
export default function PlotDimensionsProvider(props: Props): JSX.Element {
    const {
        containerDimensions,
        margin,
        children
    } = props

    const [dimensions, setDimensions] = useState<Dimensions>(defaultPlotDimensions().plotDimensions)
    // holds the latest committed dimensions so the change handlers can be fired from the effect body
    const dimensionsRef = useRef<Dimensions>(dimensions)
    const plotDimensionChangeHandlersRef = useRef<Map<string, PlotDimensionChangeHandler>>(new Map())

    // update the plot dimensions when the container size or margin change
    useEffect(
        () => {
            const newDimensions = plotDimensionsFrom(containerDimensions.width, containerDimensions.height, margin)
            if (dimensionsNotEqual(dimensionsRef.current, newDimensions)) {
                for (const handler of plotDimensionChangeHandlersRef.current.values()) {
                    handler(dimensionsRef.current, newDimensions)
                }
                dimensionsRef.current = newDimensions
                setDimensions(newDimensions)
            }
        },
        [containerDimensions, margin]
    )

    /**
     * Updates the plot dimensions and fires any registered change handlers. Wrapped in
     * `useCallback` (empty deps -- closes only over refs and the stable `setDimensions` setter) so
     * its identity is stable across renders, which in turn lets the context `value` below be
     * memoized instead of being a fresh object on every render.
     * @param newDimensions The new plot dimensions.
     */
    const updateDimensions = useCallback(
        (newDimensions: Dimensions) => {
            if (dimensionsNotEqual(dimensionsRef.current, newDimensions)) {
                for (const handler of plotDimensionChangeHandlersRef.current.values()) {
                    handler(dimensionsRef.current, newDimensions)
                }
                dimensionsRef.current = newDimensions
                setDimensions(newDimensions)
            }
        },
        []
    )

    /**
     * Registers a plot dimension change handler.
     * @param handler The handler to register.
     * @returns The handler ID.
     */
    const registerPlotDimensionChangeHandler = useCallback(
        (handler: PlotDimensionChangeHandler) => {
            const handlerId = crypto.randomUUID()
            plotDimensionChangeHandlersRef.current.set(handlerId, handler)
            return handlerId
        },
        []
    )

    /**
     * Unregisters a plot dimension change handler.
     * @param handlerId The handler ID.
     * @returns True if the handler was unregistered, false if it was not found.
     */
    const unregisterPlotDimensionChangeHandler = useCallback(
        (handlerId: string): boolean => plotDimensionChangeHandlersRef.current.delete(handlerId),
        []
    )

    // memoized so consumers relying on context value identity (e.g. a useMemo/effect keyed on this
    // context's value) don't re-run on every render of anything above this provider -- previously
    // a fresh object literal every render, which is exactly the same class of bug already
    // documented/worked-around for AxesProvider's context value (see e.g. ScatterPlot.tsx's note
    // on `axesRanges` never being memoized there).
    const value = useMemo(
        () => ({
            plotDimensions: dimensions,
            margin,
            updateDimensions,
            registerPlotDimensionChangeHandler,
            unregisterPlotDimensionChangeHandler
        }),
        [dimensions, margin, updateDimensions, registerPlotDimensionChangeHandler, unregisterPlotDimensionChangeHandler]
    )

    return <PlotDimensionsContext.Provider value={value}>
        {children}
    </PlotDimensionsContext.Provider>
}