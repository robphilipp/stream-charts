/**
 * The lens transformation information
 */
export interface LensTransformation2d {
    // transformed location of the x-coordinate
    xPrime: number;

    // transformed location of the x-coordinate
    yPrime: number;

    // the amount by which the spike is magnified at that location
    magnification: number;
}

/**
 * Circle magnifier contract.
 */
export interface RadialMagnifier {
    /**
     * Function to transform the (x, y)-coordinates to simulate magnification depending on the power and where in the
     * lens the point is.
     * @param {number} x The x-coordinate of the point to be transformed
     * @param {number} y The y-coordinate of the point to be transformed
     * @return {LensTransformation} The transformed x-coordinate and the amount by which is has been magnified
     */
    magnify: (x: number, y: number) => LensTransformation2d;

    /**
     * Function to transform the (x, y)-coordinates to itself as the identity
     * @param {number} x The x-coordinate of the point to be transformed
     * @param {number} y The y-coordinate of the point to be transformed
     * @return {LensTransformation} The original x-coordinate and a magnification of 1
     */
    identity: (x: number, y: number) => LensTransformation2d;

    // the radius of the lens
    radius: number;

    // the magnification power of the lens
    power: number;

    // the center of the lens
    center: [number, number];
}

/**
 * Vertical bar magnifier transformation function generator. For example, given a 2-dimensional
 * Cartesian coordinate system, transforms the x-values as if a vertical bar lens were placed over
 * the data. The lens, in this example, would sit on the x-y plane with its center value at x = center,
 * and its outer edges at x = center ± radius.
 * <p>
 * Modified for bar lens from the <a href="https://github.com/d3/d3-plugins/blob/master/fisheye/fisheye.js">d3 fisheye plugin</a>,
 * which also references <a href="http://dl.acm.org/citation.cfm?id=142763">Based on Sarkar and Brown’s Graphical
 * Fisheye Views of Graphs (CHI '92)</a>.
 * @param {number} radius The radius of the lens.
 * @param {number} power The optical magnification of the lens (i.e. ratio of magnified size to "true" size) and must
 * be greater than 1.
 * @param {[number, number]} center The center of the lens
 * @return {RadialMagnifier} A bar-magnifier type for transforming the x-coordinates to make it appear as though
 * the x-coord has been magnified by a bar magnifier
 */
export function radialMagnifierWith(radius: number, power: number, center: [number, number]): RadialMagnifier {

    if (power < 1) {
        throw Error('radial magnifier power must be greater than or equal to 1');
    }

    if (radius <= 0) {
        throw Error('radial magnifier radius must be greater than or equal to 0');
    }

    /**
     * Recalculates the magnification parameters
     * @return {(x: number) => number} A function that takes an x-value and transforms it to the value that
     * would appear under such a bar magnifier lens
     */
    function rescale(): RadialMagnifier {
        const expPower = Math.exp(Math.max(1, power));
        const k0 = radius * expPower / (expPower - 1);
        const k1 = power / radius;

        /**
         * Transforms the x-value to where it would appear under a bar lens
         * @param {number} x The x-value of the point
         * @param {number} y The y-value of the point
         * @return {number} The transformed value with the point's magnification
         */
        function magnifier(x: number, y: number): LensTransformation2d {
            const [cx, cy] = center;

            // calculate the distance from the center of the lens
            const dx = x - cx;
            const dy = y - cy;
            const dd = Math.sqrt(dx * dx + dy * dy);

            // when the distance is further than the radius, the point is outside of the
            // lens and so there is no magnification
            if (dd >= radius) return {
                xPrime: x,
                yPrime: y,
                magnification: 1
            };

            if (dd < 1e-6) return {
                xPrime: x,
                yPrime: y,
                // set the magnification to the value in the limit as dd -> 0
                magnification: 0.25 + 0.75 * expPower / (expPower - 1)
            };

            const magnification = 0.25 + 0.75 * k0 * (1 - Math.exp(-dd * k1)) / dd;
            return {
                xPrime: cx + dx * magnification,
                yPrime: cy + dy * magnification,
                magnification: magnification
            };
        }

        /**
         * An identity magnification
         * @param {number} x The x-value of the point
         * @param {number} y The y-value of the point
         * @return {LensTransformation2d} The original value with a magnification of 1
         */
        function identity(x: number, y: number): LensTransformation2d {
            return {xPrime: x, yPrime: y, magnification: 1};
        }

        return {
            magnify: magnifier,
            identity: identity,
            radius: radius,
            power: Math.max(1, power),
            center: center
        }
    }

    return rescale();
}
