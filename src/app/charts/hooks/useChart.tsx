import {createContext, type SetStateAction, type Dispatch, useContext} from "react";
import type {CanvasContext} from "../d3types";
import type {BaseAxis, SeriesStyle} from "../axes/axes";
import {type UseAxesValues} from "./useAxes";
import {type UseMouseValues} from "./useMouse";
import {type UseTooltipValues} from "./useTooltip";
import type {SvgStyle} from "../styling/svgStyle";
import {BaseAxisRange} from "../axes/BaseAxisRange";
import {defaultUseChartValues} from "./defaultUseChartValues";

export type NoTooltipMetadata = object

/**
 * The values exposed through the {@link useChart} react hook
 * @param chartId The unique ID for the chart
 * @param canvasContext The canvas drawing context and redraw-registration API for the chart
 * @param canvas The `<canvas>` element which is the container for this chart
 * @template D The type of the series' datum
 * @template S The type of the series style
 * @template TM The type of the tooltip's metadata (data about the series data)
 * @template AR The type of the axis range
 * @template A The type of the axis
 */
export interface UseChartValues<D, S extends SeriesStyle, TM, AR extends BaseAxisRange, A extends BaseAxis> {
    /**
     * Unique ID for the chart
     */
    chartId: number
    /**
     * The canvas drawing context and redraw-registration API for the chart. Axes, plots, and the
     * tracker register a draw function here (via `canvasContext.register(id, drawFn, zIndex)`)
     * instead of creating/updating SVG elements. Replaces the old `mainG`.
     */
    canvasContext: CanvasContext | null
    /**
     * The `<canvas>` element which is the container for this chart. Replaces the old `container`
     * (root `<svg>` element).
     */
    canvas: HTMLCanvasElement | null
    /**
     * Base color
     */
    color: string
    /**
     * The base/default background color. This can be overridden by the {@link Props.svgStyle} property.
     */
    backgroundColor: string
    /**
     * Overrides for the chart container's CSS style
     */
    svgStyle: Partial<SvgStyle>
    /**
     * A `map(series_name -> series_line_style)`
     */
    seriesStyles: Map<string, S>

    /*
     | AXES
     */
    axes: UseAxesValues<AR, A>

    /*
     | DATA PROCESSING
     */
    /**
     * A regular expression used against the series names to determine which series to show in the chart
     */
    seriesFilter: RegExp

    /*
     | INTERNAL INTERACTION EVENT HANDLERS
     */
    mouse: UseMouseValues<D, TM>
    tooltip: UseTooltipValues<D, TM>
    /**
     * Holds the series name that is currently highlighted
     */
    hoveredSeriesName: string | null
    /**
     * Sets the name of the series that is highlighted, allowing other components to share this
     * highlight state
     */
    setHoveredSeriesName:  Dispatch<SetStateAction<string | null>>
}

// the context is generic over the same type parameters as `UseChartValues`, but a context
// object can't itself carry unbound generics -- `useChart` below casts it back to the caller's
// concrete types, which is safe because `<ChartProvider/>` is what actually supplies the value
//
// IMPORTANT: this is NOT statically enforced across the component tree. `<Chart<CD, D, S, TM, AR,
// A>>`'s AR/A are never referenced by its own Props type, so they can't even be inferred from
// JSX; and every descendant (each axis component) calls `useChart<...>()` with its OWN hardcoded
// generic arguments, entirely independent of whatever the ancestor `<Chart<...>>` was
// instantiated with. Nothing at the type level stops e.g. a `<Chart<..., ContinuousAxisRange,
// ContinuousNumericAxis>>` from having an `<OrdinalAxis>` child that casts this same context to
// `UseChartValues<..., OrdinalAxisRange, OrdinalStringAxis>` internally -- a real mismatch here
// only fails at runtime (a bad cast surfacing as a confusing error deeper in axis/plot code), not
// at compile time. Making this a real compile-time guarantee would need a per-instantiation-typed
// context (e.g. a context factory called once per concrete AR/A pairing) -- a broader refactor
// than the type parameters alone might suggest, and not something to casually "fix" locally.
export const ChartContext = createContext<unknown>(defaultUseChartValues())

/**
 * React hook for the chart's values: its ID, canvas, colors, styles, axes, mouse and tooltip
 * handlers, and highlighted series. Must be used within a {@link ChartProvider} (i.e. within a
 * `<Chart>`).
 * @return The {@link UseChartValues} held in the React context.
 * @throws Error when used outside a `<ChartProvider>`
 * @template D The type of the series' datum
 * @template S The type of the series style
 * @template TM The type of the tooltip's metadata (data about the series data)
 * @template AR The type of the axis range
 * @template A The type of the axis
 */
export function useChart<D, S extends SeriesStyle, TM, AR extends BaseAxisRange, A extends BaseAxis>(): UseChartValues<D, S, TM, AR, A> {
    const context = useContext(ChartContext) as UseChartValues<D, S, TM, AR, A>
    const {chartId} = context
    if (isNaN(chartId)) {
        throw new Error("useChart can only be used when the parent is a <ChartProvider/>")
    }
    return context
}
