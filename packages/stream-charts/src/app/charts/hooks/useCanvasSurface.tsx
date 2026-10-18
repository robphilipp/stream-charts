import {createContext, useContext} from "react";
import type {CanvasContext} from "../d3types";

/**
 * The values exposed through the {@link useCanvasSurface} react hook.
 */
export type UseCanvasSurfaceValues = {
    /**
     * The `<canvas>` element backing the chart.
     */
    canvas: HTMLCanvasElement | null
    /**
     * The canvas drawing context and redraw-registration API for the chart.
     */
    canvasContext: CanvasContext | null
}

const defaultCanvasSurfaceValues: UseCanvasSurfaceValues = {
    canvas: null,
    canvasContext: null,
}

export const CanvasSurfaceContext = createContext<UseCanvasSurfaceValues>(defaultCanvasSurfaceValues)

/**
 * React hook that reads the canvas element and canvas drawing context from context. This is set
 * up by {@link CanvasSurfaceProvider}, which sizes the canvas from {@link usePlotDimensions} (the
 * single source of truth for the chart's dimensions) rather than from static width/height props,
 * so that the canvas stays correctly sized even if dimensions change via
 * `usePlotDimensions().updateDimensions(...)` independent of any prop.
 * @return The {@link UseCanvasSurfaceValues} held in the React context.
 */
export function useCanvasSurface(): UseCanvasSurfaceValues {
    return useContext(CanvasSurfaceContext)
}
