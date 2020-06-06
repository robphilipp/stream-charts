import {radialMagnifierWith} from './radialMagnifier';

describe('should not be able to create a magnifier with invalid parameters', () => {
    test('invalid radius and power should throw error for power', () => {
        expect(() => {
            radialMagnifierWith(0, 0, [0, 0])
        }).toThrow('radial magnifier power must be greater than or equal to 1');

        expect(() => {
            radialMagnifierWith(0, 1, [0, 0])
        }).toThrow('radial magnifier radius must be greater than or equal to 0');
    })
})

describe('radial magnifier with power 1 should not magnify', () => {
    const magnifier = radialMagnifierWith(10, 1, [0, 0]);

    test('magnifier should have the input settings', () => {
        expect(magnifier.power === 1);
        expect(magnifier.radius === 10);
        expect(magnifier.center === [0, 0]);
    });

    test('x value should remain unchanged when in magnifier', () => {
        let magnified = magnifier.magnify(3, 3);
        expect(magnified.xPrime === 3)
        expect(magnified.yPrime === 3)
        expect(magnified.magnification === 1)

        magnified = magnifier.magnify(13, 13);
        expect(magnified.xPrime === 1)
        expect(magnified.yPrime === 1)
        expect(magnified.magnification === 1)
    })

    test('x value should remain unchanged when outside of magnifier', () => {
        expect(magnifier.magnify(13, 13).xPrime === 13)
        expect(magnifier.magnify(13, 13).magnification === 1)
    })
})

test('bar magnifier identity function should always return the specified values', () => {
    const magnifier = radialMagnifierWith(100, 10, [0, 0]);
    const magnified = magnifier.magnify(54, 54);
    expect(magnified.xPrime === 54);
    expect(magnified.yPrime === 54);
    expect(magnified.magnification === 1);
})

describe('bar magnifier with power greater than 1 should fisheye', () => {
    const magnifier = radialMagnifierWith(100, 5, [0, 0]);

    test('points on the radius should be unchanged', () => {
        let magnified = magnifier.magnify(100, 0);
        expect(magnified.xPrime === 100);
        expect(magnified.yPrime === 0);
        expect(magnified.magnification === 1);

        magnified = magnifier.magnify(-100, 0);
        expect(magnified.xPrime === -100);
        expect(magnified.yPrime === 0);
        expect(magnified.magnification === 1);

        for(let i = 0; i < 360; ++i) {
            const radians = 2 * i * Math.PI / 360;
            magnified = magnifier.magnify(100 * Math.cos(radians), 100 * Math.sin(radians));
            expect(magnified.xPrime === 100);
            expect(magnified.yPrime === 100);
            expect(magnified.magnification === 1);
        }
    });

    test('the center points should be unchanged', () => {
        let magnified = magnifier.magnify(0, 0);
        expect(magnified.xPrime === 0);
        expect(magnified.yPrime === 0);
        expect(magnified.magnification === 1);
    });

    test('points within the radius should be magnified', () => {
        for(let i = 0; i < 360; i += 3) {
            const radians = 2 * i * Math.PI / 360;
            const xHat = Math.cos(radians);
            const yHat = Math.sin(radians);

            const point = (length: number): [number, number] => [length * xHat, length * yHat];

            let [x, y] = point(5);
            let magnified = magnifier.magnify(x, y);
            expect(magnified.xPrime > x);
            expect(magnified.yPrime > y);
            expect(magnified.magnification > 1);
            expect(magnified.magnification < 5);

            [x, y] = point(50);
            magnified = magnifier.magnify(x, y);
            expect(magnified.xPrime > x);
            expect(magnified.yPrime > y);
            expect(magnified.magnification > 1);
            expect(magnified.magnification < 5);

            [x, y] = point(99);
            magnified = magnifier.magnify(x, y);
            expect(magnified.xPrime > x);
            expect(magnified.yPrime > y);
            expect(magnified.xPrime < 100);
            expect(magnified.magnification > 1);
            expect(magnified.magnification < 5);
        }
    });

    test('points closer to the center should be more spread out', () => {
        for(let i = 0; i < 360; i += 3) {
            const radians = 2 * i * Math.PI / 360;
            const xHat = Math.cos(radians);
            const yHat = Math.sin(radians);

            const point = (length: number): [number, number] => [length * xHat, length * yHat];
            const length = (x: number, y: number): number => Math.sqrt(x * x + y * y);

            const [x5, y5] = point(5);
            const magnified5 = magnifier.magnify(x5, y5);

            const [x10, y10] = point(10);
            const magnified10 = magnifier.magnify(x10, y10);

            const {xPrime: xm5, yPrime: ym5} = magnified5;
            const {xPrime: xm10, yPrime: ym10} = magnified10;
            expect(length(xm5, xm5) > length(xm10, ym10) - length(xm5, ym5));
            expect(length(xm10, ym10) - length(xm5, ym5) > 5);
        }
    })

    test('points closer to the edge should be more bunched up', () => {
        for(let i = 0; i < 360; i += 3) {
            const radians = 2 * i * Math.PI / 360;
            const xHat = Math.cos(radians);
            const yHat = Math.sin(radians);

            const point = (length: number): [number, number] => [length * xHat, length * yHat];
            const length = (x: number, y: number): number => Math.sqrt(x * x + y * y);

            const [x49, y49] = point(49);
            const magnified49 = magnifier.magnify(x49, y49);

            const [x98, y98] = point(98);
            const magnified98 = magnifier.magnify(x98, y98);

            const {xPrime: xm49, yPrime: ym49} = magnified49;
            const {xPrime: xm98, yPrime: ym98} = magnified98;
            expect(length(xm49, xm49) > length(xm98, ym98) - length(xm49, ym49));
            expect(length(xm98, ym98) - length(xm49, ym49) < 49);
        }

    })
})

