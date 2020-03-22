/**
 * Manages the time-range and provides a scaled view of the time-range
 */
export class TimeRange {
    private _start: number;
    private _end: number;
    private readonly originalStart: number;
    private readonly originalEnd: number;
    private readonly  midpoint: number;

    /**
     * Constructs a time-range instance with the (start, end) interval. The specified values will
     * be maintained as the origin interval.
     * @param {number} _start The start time of the time range
     * @param {number} _end The end time of the time range.
     * @constructor
     */
    private constructor(_start: number, _end: number) {
        this._start = Math.min(_start, _end);
        this._end = Math.max(_start, _end);
        this.originalStart = this._start;
        this.originalEnd = this._end;
        this.midpoint = (this.originalStart + this.originalEnd) / 2;

    }

    /**
     * Constructs a time-range instance with the (start, end) interval. The specified values will
     * be maintained as the origin interval.
     * @param {number} _start The start time of the time range
     * @param {number} _end The end time of the time range.
     * @return {TimeRange} The time-range object
     */
    static of(_start: number, _end: number) {
        return new TimeRange(_start, _end);
    }

    /**
     * @return {number} The current (scaled) start value of the time-range
     */
    get start() {
        return this._start;
    }

    /**
     * @return {number} The current (scaled) end value of the time-range
     */
    get end() {
        return this._end;
    }

    /**
     * @return {number} The current (scaled) length of the time-range
     */
    get length() {
        return Math.abs(this._end - this._start);
    };

    /**
     * Tests whether the specified (start, end) match the origin interval
     * @param {number} start The start value of the time-range
     * @param {number} end The end value of the time-range
     * @return {boolean} `true` if the (start, end) match the original (start, end); `false` otherwise
     */
    matchesOriginal(start: number, end: number) {
        return this.originalStart === start && this.originalEnd === end;
    }

    /**
     * @return {number} The current scale factor
     */
    get scaleFactor() {
        return (this._end - this._start) / (this.originalEnd - this.originalStart);
    }

    /**
     * Scales the time-range by the specified scale factor from the specified time-location
     * @param {number} factor The scale factor
     * @param {number} time The time from which to scale the interval
     */
    scale(factor: number, time: number): void {
        const oldScale = this.scaleFactor;
        const dts = time - this._start;
        const dte = this._end - time;
        this._start = time - dts * factor / oldScale;
        this._end = time + dte * factor / oldScale;
    };
}
