
export interface LensTransformation {
    // transformed location of the x-coordinate
    xPrime: number;
    // the amount by which the spike is magnified at that location
    magnification: number;
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
 * @return {(x: number) => number} A function that takes an x-value and transforms it to the value that
 * would appear under such a bar magnifier lens
 */
export function BarMagnifier(radius: number, power: number, center: number) {
    let k0: number;
    let k1: number;

    /**
     * Transforms the x-value to where it would appear under a bar lens
     * @param {number} x The x-value of the point
     * @return {number} The transformed value
     */
    function barMagnifier(x: number): LensTransformation {
        // calculate the distance from the center of the lens
        const dx = x - center;
        const dd = Math.abs(dx);

        // when the distance is further than the radius, the point is outside of the
        // lens and so there is no magnification
        if (dd >= radius) return {xPrime: x, magnification: 1};

        const magnification = k0 * (1 - Math.exp(-dd * k1)) / dd * .75 + .25;
        return {xPrime: center + dx * magnification, magnification: magnification};
    }

    /**
     * Recalculates the magnification parameters
     * @return {(x: number) => number} A function that takes an x-value and transforms it to the value that
     * would appear under such a bar magnifier lens
     */
    function rescale() {
        k0 = Math.exp(power);
        k0 = k0 / (k0 - 1) * radius;
        k1 = power / radius;
        return barMagnifier;
    }

    /**
     * @return {number} The radius of the lens
     */
    barMagnifier.radius = function() {
        return radius;
    };

    /**
     * @return {number} The optical magnification of the lens
     */
    barMagnifier.power = function () {
        return power;
    };

    /**
     * @return {number} The center of the lens
     */
    barMagnifier.center = function () {
        return center;
    };

    return rescale();
}
