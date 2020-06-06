/**
 * The time-range contract
 */
export interface TimeRangeType {
    start: number;
    end: number;
    scaleFactor: number;
    matchesOriginal: (start: number, end: number) => boolean;
    scale: (factor: number, time: number) => TimeRangeType;
    translate: (x: number) => TimeRangeType;
}

/**
 * A time-range that can be scaled and transformed, all the while maintaining it original range values.
 * @param {number} _start The start of the time-range
 * @param {number} _end The end of the time-range
 * @return {TimeRangeType} A time-range object that can be scaled and transformed
 */
export function TimeRange(_start: number, _end: number): TimeRangeType {
    // form a closure on the original start and end of the time-range
    const originalStart: number = Math.min(_start, _end);
    const originalEnd: number = Math.max(_start, _end);

    /**
     * Updates the time-range based on the new start and end times
     * @param {number} start The new start of the time-range
     * @param {number} end The new end of the time-range
     * @return {TimeRangeType} The updated time-range type
     */
    function updateTimeRange(start: number, end: number): TimeRangeType {

        // the amount by which the time-range is currently scaled
        const scaleFactor = (end - start) / (originalEnd - originalStart);

        /**
         * Determines whether the specified (start, end) interval matches the original interval
         * @param {number} start The start of the interval
         * @param {number} end The end of the interval
         * @return {boolean} `true` if the specified interval matches the original interval; `false` otherwise
         */
        function matchesOriginal(start: number, end: number): boolean {
            return originalStart === start && originalEnd === end;
        }

        /**
         * Scales the time-range by the specified scale factor from the specified time-location. The equations
         * are written so that the zooming (scaling) occurs at the specified time, and expands/contracts equally
         * from that time.
         * @param {number} factor The scale factor
         * @param {number} time The time from which to scale the interval
         */
        function scale(factor: number, time: number): TimeRangeType {
            const oldScale = scaleFactor;
            const dts = time - start;
            const dte = end - time;
            start = time - dts * factor / oldScale;
            end = time + dte * factor / oldScale;
            return updateTimeRange(start, end);
        }

        /**
         * Translates the time-range by the sepecified amount
         * @param {number} x The amount by which to translate the time-range
         */
        function translate(x: number): TimeRangeType {
            start += x;
            end += x;
            return updateTimeRange(start, end);
        }

        return {
            start: start,
            end: end,
            matchesOriginal: matchesOriginal,
            scaleFactor: scaleFactor,
            scale: scale,
            translate: translate
        }
    }

    return updateTimeRange(originalStart, originalEnd);
}
