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
        expect(magnifier.power === 1);
        expect(magnifier.radius === 10);
        expect(magnifier.center === 0);
    });

    test('x value should remain unchanged when in magnifier', () => {
        expect(magnifier.magnify(3).xPrime === 3)
        expect(magnifier.magnify(3).magnification === 1)
        expect(magnifier.magnify(0).xPrime === 0)
    })

    test('x value should remain unchanged when outside of magnifier', () => {
        expect(magnifier.magnify(13).xPrime === 13)
        expect(magnifier.magnify(13).magnification === 1)
    })
})

test('bar magnifier identity function should always return the specified values', () => {
    const magnifier = barMagnifierWith(100, 10, 0);
    expect(magnifier.magnify(54).xPrime === 54);
    expect(magnifier.magnify(54).magnification === 1);
})

describe('bar magnifier with power greater than 1 should fisheye', () => {
    const magnifier = barMagnifierWith(100, 5, 0);

    test('points on the radius should be unchanged', () => {
        expect(magnifier.magnify(100).xPrime === 100);
        expect(magnifier.magnify(100).magnification === 1);
        expect(magnifier.magnify(-100).xPrime === -100);
        expect(magnifier.magnify(-100).magnification === 1);
    });

    test('the center points should be unchanged', () => {
        expect(magnifier.magnify(0).xPrime === 0);
        expect(magnifier.magnify(0).magnification === 1);
    });

    test('points within the radius should be magnified', () => {
        expect(magnifier.magnify(5).xPrime > 5);
        expect(magnifier.magnify(5).magnification > 1);
        expect(magnifier.magnify(50).xPrime > 50);
        expect(magnifier.magnify(50).magnification > 1);
        expect(magnifier.magnify(99).xPrime > 99);
        expect(magnifier.magnify(99).xPrime < 100);
        expect(magnifier.magnify(99).magnification > 1);

        expect(magnifier.magnify(-5).xPrime < -5);
        expect(magnifier.magnify(-5).magnification > 1);
        expect(magnifier.magnify(-50).xPrime < -50);
        expect(magnifier.magnify(-50).magnification > 1);
        expect(magnifier.magnify(-99).xPrime < -99);
        expect(magnifier.magnify(-99).xPrime > -100);
        expect(magnifier.magnify(-99).magnification > 1);
    });

    test('points closer to the center should be more spread out', () => {
        const xp5 = magnifier.magnify(5).xPrime;
        const xp10 = magnifier.magnify(10).xPrime;
        expect(xp5 > xp10 - xp5);
        expect(xp10 - xp5 > 5);
    })

    test('points closer to the edge should be more bunched up', () => {
        const xp49 = magnifier.magnify(49).xPrime;
        const xp98 = magnifier.magnify(98).xPrime;
        expect( xp49 > xp98 - xp49);
        expect(xp98 - xp49 < 49);
    })
})

