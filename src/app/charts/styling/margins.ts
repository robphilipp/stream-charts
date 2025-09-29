/**
 * Margin information
 */
export interface Margin {
    top: number
    right: number
    bottom: number
    left: number
}

export function noMargins(): Margin {
    return {top: 0, bottom: 0, left: 0, right: 0}
}

export interface Dimensions {
    width: number
    height: number
}

/**
 * Given the dimensions of the plot (width, height) based on the container's width and height,
 * and the plots margins. Calculates the dimensions of the actual plot by subtracting the margins.
 * @param containerWidth The overall width of the container (plot and margins)
 * @param containerHeight The overall height of the container (plot and margins)
 * @param plotMargins The margins around the plot (top, bottom, left, right)
 * @return The dimensions of the actual plots adjusted for the margins
 * from the overall dimensions
 * @see containerDimensionsFrom
 */
export const plotDimensionsFrom =
    (containerWidth: number, containerHeight: number, plotMargins: Margin): Dimensions => ({
        width: containerWidth - plotMargins.left - plotMargins.right,
        height: containerHeight - plotMargins.top - plotMargins.bottom
    })

/**
 * Calculates the container's dimensions from the plot dimensions and the plot margin. The container
 * dimensions are the plot dimensions plus the margins.
 * @param plotDimensions The (width, height) of the plot
 * @param plotMargin The margins around the plot
 * @return The container dimensions.
 * @see plotDimensionsFrom
 */
export const containerDimensionsFrom = (plotDimensions: Dimensions, plotMargin: Margin): Dimensions => ({
    width: plotDimensions.width + plotMargin.left + plotMargin.right,
    height: plotDimensions.height + plotMargin.top + plotMargin.bottom
})

