import {initialSvgStyle} from "./svgStyle";

describe('initialSvgStyle', () => {
    it('should default to full width, anchored at (0, 0)', () => {
        expect(initialSvgStyle).toEqual({width: '100%', top: 0, left: 0});
    });
});
