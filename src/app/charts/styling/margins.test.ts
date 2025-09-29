import {plotDimensionsFrom, Margin} from "./margins";

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
})