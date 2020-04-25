/**
 * The lens transformation information
 */
export interface LensTransformation {
    // transformed location of the x-coordinate
    xPrime: number;

    // the amount by which the spike is magnified at that location
    magnification: number;
}

/**
 * Bar magnifier contract.
 */
export interface BarMagnifierType {
    /**
     * Function to transform the x-coordinate to simulate magnification depending on the power and where in the
     * lens the x-coordinate is.
     * @param {number} x The x-coordinate to be transformed
     * @return {LensTransformation} The transformed x-coordinate and the amount by which is has been magnified
     */
    magnify: (x: number) => LensTransformation;

    identify: (x: number) => LensTransformation;

    // the radius of the lens
    radius: number;

    // the magnification power of the lens
    power: number;

    // the center of the lens
    center: number;
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
 * @param {number} power The optical magnification of the lens (i.e. ratio of magnified size to "true" size)
 * @param {number} center The center of the lens
 * @return {BarMagnifierType} A bar-magnifier type for transforming the x-coordinates to make it appear as though
 * the x-coord has been magnified by a bar magnifier
 */
export function BarMagnifier(radius: number, power: number, center: number): BarMagnifierType {

    /**
     * Recalculates the magnification parameters
     * @return {(x: number) => number} A function that takes an x-value and transforms it to the value that
     * would appear under such a bar magnifier lens
     */
    function rescale(): BarMagnifierType {
        const expPower = Math.exp(power);
        const k0 = expPower / (expPower - 1) * radius;
        const k1 = power / radius;

        /**
         * Transforms the x-value to where it would appear under a bar lens
         * @param {number} x The x-value of the point
         * @return {number} The transformed value
         */
        function magnifier(x: number): LensTransformation {
            // calculate the distance from the center of the lens
            const dx = x - center;
            const dd = Math.abs(dx);

            // when the distance is further than the radius, the point is outside of the
            // lens and so there is no magnification
            if (dd >= radius) return {xPrime: x, magnification: 1};

            const magnification = k0 * (1 - Math.exp(-dd * k1)) / dd * .75 + .25;
            return {xPrime: center + dx * magnification, magnification: magnification};
        }

        function identity(x: number): LensTransformation {
            return {xPrime: x, magnification: 1};
        }

        return {
            magnify: magnifier,
            identify: identity,
            radius: radius,
            power: power,
            center: center
        }
    }

    return rescale();
}
