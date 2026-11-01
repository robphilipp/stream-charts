/**
 * Which of a chart's optional elements are shown
 */
export interface Visibility {
    tooltip: boolean;
    tracker: boolean;
    markers: boolean
    hideMarkersWhileRunning: boolean
    legend: boolean;
    highlightAxes: boolean;
}

/**
 * @return The initial visibility: everything hidden (and markers hidden while running, once shown)
 */
export const createInitialVisibility = (): Visibility => ({
    tooltip: false,
    tracker: false,
    markers: false,
    hideMarkersWhileRunning: true,
    legend: false,
    highlightAxes: false,
})

