import {defaultUseChartValues} from "./defaultUseChartValues";
import type {BaseAxisRange} from "../axes/BaseAxisRange";
import type {BaseAxis, SeriesStyle} from "../axes/axes";

describe('defaultUseChartValues', () => {
    const values = defaultUseChartValues<unknown, SeriesStyle, unknown, BaseAxisRange, BaseAxis>();

    it('should default chartId to NaN and canvas/canvasContext to null', () => {
        expect(values.chartId).toBeNaN();
        expect(values.canvas).toBeNull();
        expect(values.canvasContext).toBeNull();
    });

    it('should default seriesFilter to a regex matching everything', () => {
        expect(values.seriesFilter.test('anything at all')).toBe(true);
    });

    it('should default seriesStyles to an empty map', () => {
        expect(values.seriesStyles.size).toBe(0);
    });

    it('should compose the axes/mouse/tooltip defaults', () => {
        expect(values.axes.xAxesState.isEmpty()).toBe(true);
        expect(() => values.mouse.mouseOverHandlerFor('id')('series', 0, {series: [], metadata: undefined}, [0, 0])).not.toThrow();
        expect(values.tooltip.visibilityState).toBe(false);
    });
});
