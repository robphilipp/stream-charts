import {barMagnifierWith} from "./barMagnifier";

describe('should not be able to set invalid power or radius', () => {
    test('invalid radius and power should throw error for power', () => {
        expect(() => {
            barMagnifierWith(0, 0, 0)
        }).toThrow('bar magnifier power must be greater than or equal to 1');

        expect(() => {
            barMagnifierWith(0, 1, 0)
        }).toThrow('bar magnifier radius (width) must be greater than or equal to 0');
    })
})

describe('bar magnifier with power 1 should not magnify', () => {
    const magnifier = barMagnifierWith(10, 1, 0);

    test('magnifier should have the input settings', () => {
        expect(magnifier.power).toBe(1);
        expect(magnifier.radius).toBe(10);
        expect(magnifier.center).toBe(0);
    });

    test('x value should not change when in magnifier', () => {
        expect(magnifier.magnify(3).xPrime).toBeCloseTo(3.8251465, 6);
        expect(magnifier.magnify(3).magnification).toBeCloseTo(1.2750488443161716, 6);
        expect(magnifier.magnify(0).xPrime).toBe(0);
        expect(magnifier.magnify(0).magnification).toBe(1);
    })

    test('x value should remain unchanged when outside of magnifier', () => {
        expect(magnifier.magnify(13).xPrime).toBe(13);
        expect(magnifier.magnify(13).magnification).toBe(1);
    })
})

test('bar magnifier identity function should always return the specified values', () => {
    const magnifier = barMagnifierWith(100, 10, 0);
    expect(magnifier.identity(54).xPrime).toBe(54);
    expect(magnifier.identity(54).magnification).toBe(1);
})

describe('bar magnifier with power greater than 1 should fisheye', () => {
    const magnifier = barMagnifierWith(100, 5, 0);

    test('points on the radius should be unchanged', () => {
        expect(magnifier.magnify(100).xPrime).toBe(100);
        expect(magnifier.magnify(100).magnification).toBe(1);
        expect(magnifier.magnify(-100).xPrime).toBe(-100);
        expect(magnifier.magnify(-100).magnification).toBe(1);
    });

    test('the center points should be unchanged', () => {
        expect(magnifier.magnify(0).xPrime).toBe(0);
        expect(magnifier.magnify(0).magnification).toBe(5);
    });

    test('points within the radius should be magnified', () => {
        expect(magnifier.magnify(5).xPrime).toBeGreaterThan(5);
        expect(magnifier.magnify(5).magnification).toBeGreaterThan(1);
        expect(magnifier.magnify(50).xPrime).toBeGreaterThan(50);
        expect(magnifier.magnify(50).magnification).toBeGreaterThan(1);
        expect(magnifier.magnify(99).xPrime).toBeGreaterThan(99);
        expect(magnifier.magnify(99).xPrime).toBeLessThan(100);
        expect(magnifier.magnify(99).magnification).toBeGreaterThan(1);

        expect(magnifier.magnify(-5).xPrime).toBeLessThan(-5);
        expect(magnifier.magnify(-5).magnification).toBeGreaterThan(1);
        expect(magnifier.magnify(-50).xPrime).toBeLessThan(-50);
        expect(magnifier.magnify(-50).magnification).toBeGreaterThan(1);
        expect(magnifier.magnify(-99).xPrime).toBeLessThan(-99);
        expect(magnifier.magnify(-99).xPrime).toBeGreaterThan(-100);
        expect(magnifier.magnify(-99).magnification).toBeGreaterThan(1);
    });

    test('points closer to the center should be more spread out', () => {
        const xp5 = magnifier.magnify(5).xPrime;
        const xp10 = magnifier.magnify(10).xPrime;
        expect(xp5).toBeGreaterThan(xp10 - xp5);
        expect(xp10 - xp5).toBeGreaterThan(5);
    })

    test('points closer to the edge should be more bunched up', () => {
        const xp49 = magnifier.magnify(49).xPrime;
        const xp98 = magnifier.magnify(98).xPrime;
        expect( xp49).toBeGreaterThan(xp98 - xp49);
        expect(xp98 - xp49).toBeLessThan(49);
    })
})

