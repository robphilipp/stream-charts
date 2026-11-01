import type {Visibility} from "../../options/visibility.ts";
import type {StateCreator} from "zustand";

/**
 * The visibility state of a chart's optional elements (tooltip, tracker, markers, legend, ...)
 */
export type VisibilityStateSlice = {
    visibility: Visibility
}

/**
 * The actions that change the visibility state: replacing all of it, or changing one element's
 */
export type VisibilityActionSlice = {
    setVisibility: (visibility: Visibility) => void
    setTooltipVisibility: (visibility: boolean) => void
    setTrackerVisibility: (visibility: boolean) => void
    setMarkersVisibility: (visibility: boolean) => void
    setLegendVisibility: (visibility: boolean) => void
}

export type VisibilitySlice = VisibilityStateSlice & VisibilityActionSlice

/**
 * Creates the visibility slice of a store
 * @param initialState The initial visibility
 * @return The slice's state creator (for zustand's `create`)
 */
export function visibilitySliceStateCreator(initialState: VisibilityStateSlice): StateCreator<VisibilitySlice, [], [], VisibilitySlice> {
    return (set, get) => ({
        visibility: initialState.visibility,
        setVisibility: (visibility: Visibility) => set({visibility}),
        setTooltipVisibility: (visibility: boolean) => set({visibility: {...get().visibility, tooltip: visibility}}),
        setTrackerVisibility: (visibility: boolean) => set({visibility: {...get().visibility, tracker: visibility}}),
        setMarkersVisibility: (visibility: boolean) => set({visibility: {...get().visibility, markers: visibility}}),
        setLegendVisibility: (visibility: boolean) => set({visibility: {...get().visibility, legend: visibility}}),
    })
}