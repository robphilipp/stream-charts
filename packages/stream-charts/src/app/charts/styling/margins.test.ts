import {
    containerDimensionsFrom,
    dimensionsEqual,
    dimensionsNotEqual,
    type Dimensions,
    type Margin,
    noMargins,
    plotDimensionsFrom,
} from "./margins";

describe('adjusted dimension should correct for margins', () => {
    const margins: Margin = {top: 11, bottom: 12, left: 13, right: 14};
    const width = 100;
    const height = 200;
    const dimensions = plotDimensionsFrom(width, height, margins);

    test('adjusted width should have the left and right margins removed', () => {
        expect(dimensions.width).toBe(width - margins.right - margins.left);
    });

    test('adjusted height should have the top and bottom margins removed', () => {
        expect(dimensions.height).toBe(height - margins.top - margins.bottom);
    });

    test('should be able to get back the container dimensions after calculate the plot dimensions', () => {
        const {width: containerWidth, height: containerHeight} = containerDimensionsFrom(plotDimensionsFrom(width, height, margins), margins);
        expect(containerWidth).toBe(width);
        expect(containerHeight).toBe(height);
    })
})

describe('plot dimensions should never go negative', () => {
    test('should floor width at zero when margins exceed the container width', () => {
        const margins: Margin = {top: 0, bottom: 0, left: 60, right: 60};
        const dimensions = plotDimensionsFrom(100, 200, margins);
        expect(dimensions.width).toBe(0);
    });

    test('should floor height at zero when margins exceed the container height', () => {
        const margins: Margin = {top: 60, bottom: 60, left: 0, right: 0};
        const dimensions = plotDimensionsFrom(100, 100, margins);
        expect(dimensions.height).toBe(0);
    });
})

describe('noMargins', () => {
    test('should return all-zero margins', () => {
        expect(noMargins()).toEqual({top: 0, bottom: 0, left: 0, right: 0});
    });

    test('should return a fresh object each call', () => {
        expect(noMargins()).not.toBe(noMargins());
    });
})

describe('dimensionsEqual', () => {
    test('should return true when width and height both match', () => {
        const a: Dimensions = {width: 100, height: 200};
        const b: Dimensions = {width: 100, height: 200};
        expect(dimensionsEqual(a, b)).toBe(true);
    });

    test('should return true when compared to itself', () => {
        const a: Dimensions = {width: 100, height: 200};
        expect(dimensionsEqual(a, a)).toBe(true);
    });

    test('should return false when only the width differs', () => {
        expect(dimensionsEqual({width: 100, height: 200}, {width: 101, height: 200})).toBe(false);
    });

    test('should return false when only the height differs', () => {
        expect(dimensionsEqual({width: 100, height: 200}, {width: 100, height: 201})).toBe(false);
    });

    test('should return false when both width and height differ', () => {
        expect(dimensionsEqual({width: 100, height: 200}, {width: 1, height: 2})).toBe(false);
    });
})

describe('dimensionsNotEqual', () => {
    test('should be the exact negation of dimensionsEqual for equal dimensions', () => {
        const a: Dimensions = {width: 100, height: 200};
        const b: Dimensions = {width: 100, height: 200};
        expect(dimensionsNotEqual(a, b)).toBe(false);
    });

    test('should be the exact negation of dimensionsEqual for differing dimensions', () => {
        const a: Dimensions = {width: 100, height: 200};
        const b: Dimensions = {width: 100, height: 201};
        expect(dimensionsNotEqual(a, b)).toBe(true);
    });
})