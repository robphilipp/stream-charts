import {defaultMargin, defaultPlotDimensions} from "./defaultPlotDimensions";

describe('defaultPlotDimensions', () => {
    it('should default plotDimensions to (0, 0)', () => {
        expect(defaultPlotDimensions().plotDimensions).toEqual({width: 0, height: 0});
    });

    it('should default margin to defaultMargin', () => {
        expect(defaultPlotDimensions().margin).toEqual(defaultMargin);
    });

    it('should return an empty handler id from registerPlotDimensionChangeHandler', () => {
        expect(defaultPlotDimensions().registerPlotDimensionChangeHandler(() => {})).toBe('');
    });

    it('should not throw when updating dimensions or unregistering a handler', () => {
        const values = defaultPlotDimensions();
        expect(() => values.updateDimensions({width: 1, height: 1})).not.toThrow();
        expect(() => values.unregisterPlotDimensionChangeHandler('id')).not.toThrow();
    });
});

describe('defaultMargin', () => {
    it('should have non-zero margins on all sides', () => {
        expect(defaultMargin).toEqual({top: 30, right: 20, bottom: 30, left: 50});
    });
});
