import {createContext, type Dispatch, type SetStateAction, useContext} from "react";

/**
 * The series the mouse is over (in a plot, or in the legend), which the plots and the legend
 * highlight
 */
export interface HoveredSeriesValues {
    /**
     * The name of the hovered series, or `null` when no series is hovered
     */
    hoveredSeriesName: string | null
    /**
     * Sets (or, with `null`, clears) the hovered series -- e.g. when the mouse is over the series'
     * entry in the legend. (A plot's own mouse-over and mouse-leave set it, through the chart's
     * mouse handlers -- see `useMouse`.)
     */
    setHoveredSeriesName: Dispatch<SetStateAction<string | null>>
}

export const HoveredSeriesContext = createContext<HoveredSeriesValues>({
    hoveredSeriesName: null,
    setHoveredSeriesName: () => {
    },
})

/**
 * React hook for the series the mouse is over. Kept apart from {@link useChart}, so that only the
 * components that show the hover (the plots and the legend) re-render when it changes.
 * @return The hovered series' name, and its setter
 */
export function useHoveredSeries(): HoveredSeriesValues {
    return useContext(HoveredSeriesContext)
}
