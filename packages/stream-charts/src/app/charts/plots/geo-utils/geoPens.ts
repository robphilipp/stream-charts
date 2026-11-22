import * as d3 from "d3";

/*
    The pens that draw a GeoPlot's map: its shapes, filled and stroked, and the features' bounds and
    middles (for their labels), in the plot area's pixels.

    - The direct pen traces each shape through the projection as it's drawn, which a view that turns
      the earth needs: each view projects the shapes differently.
    - In the shift view mode, though, moving or zooming the view only scales and slides the projected
      map (see `setUpShiftedProjection`), so the shifted pen projects each shape once, at the
      starting view (the reference), into a `Path2D`, and draws that with the view's scale and offset
      (see `shiftOf`). Projecting is most of the cost of drawing a detailed map -- the more so for a
      composite projection, which projects every point once for each of its regions -- and drawing a
      projected path is quick, so the map pans and zooms smoothly however detailed it is.
 */

/**
 * The drawn bounds of a shape: its top-left and bottom-right corners (px)
 */
export type PixelBounds = [[number, number], [number, number]]

/**
 * Draws GeoJSON into a canvas, in the plot area's pixels
 */
export interface GeoPen {
    /**
     * Draws a shape: fills it, and strokes its outline
     * @param context2D The context to draw into
     * @param object The shape
     * @param fill Its fill color (no fill when undefined)
     * @param stroke Its outline's color (no outline when undefined)
     * @param lineWidth The outline's width (px)
     */
    draw: (
        context2D: CanvasRenderingContext2D,
        object: d3.GeoPermissibleObjects,
        fill: string | undefined,
        stroke: string | undefined,
        lineWidth: number,
    ) => void
    /**
     * @param feature A feature
     * @return Its drawn bounds
     */
    bounds: (feature: GeoJSON.Feature) => PixelBounds
    /**
     * @param feature A feature
     * @return Where its middle (its centroid on the sphere, so that it stays put as the view turns)
     * is drawn; `NaN`s when it isn't (e.g. it's on the globe's far side)
     */
    centroid: (feature: GeoJSON.Feature) => [number, number]
}

/**
 * Fills and strokes the context's current path, as asked
 * @param context2D The context
 * @param fill The fill color (no fill when undefined)
 * @param stroke The outline's color (no outline when undefined)
 * @param lineWidth The outline's width
 * @param path The path to fill and stroke (the context's current path when undefined)
 */
function paint(
    context2D: CanvasRenderingContext2D,
    fill: string | undefined,
    stroke: string | undefined,
    lineWidth: number,
    path?: Path2D,
): void {
    if (fill !== undefined) {
        context2D.fillStyle = fill
        if (path !== undefined) context2D.fill(path)
        else context2D.fill()
    }
    if (stroke !== undefined) {
        context2D.strokeStyle = stroke
        context2D.lineWidth = lineWidth
        if (path !== undefined) context2D.stroke(path)
        else context2D.stroke()
    }
}

// the features' middles (see `middleOf`), by geometry: worked out once for each
const middles = new WeakMap<object, GeoJSON.Point>()

/**
 * @param feature A feature
 * @return Its middle, on the sphere, as a point: projecting it gives where the feature's middle is
 * drawn, and `NaN`s when the projection clips it (e.g. on the globe's far side). (A projected
 * shape's own centroid is that of the part of it that's shown, which slides about as the view
 * turns the shape out of sight, or splits it at the map's edge.) A feature in pieces (e.g. a
 * country with islands, or with land far away, like Alaska) has its largest piece's middle.
 */
function middleOf(feature: GeoJSON.Feature): GeoJSON.Point {
    const {geometry} = feature
    if (geometry === null) return {type: 'Point', coordinates: [NaN, NaN]}
    let middle = middles.get(geometry)
    if (middle === undefined) {
        const largest = geometry.type === 'MultiPolygon' ?
            d3.greatest(
                geometry.coordinates.map((coordinates): GeoJSON.Polygon => ({type: 'Polygon', coordinates})),
                d3.geoArea,
            ) :
            undefined
        middle = {type: 'Point', coordinates: d3.geoCentroid(largest ?? geometry)}
        middles.set(geometry, middle)
    }
    return middle
}

/**
 * @param path A path generator, drawing into the context the pen is used with
 * @return A pen that traces each shape through the path generator's projection as it's drawn
 */
export function directPen(path: d3.GeoPath): GeoPen {
    return {
        draw: (context2D, object, fill, stroke, lineWidth): void => {
            if (fill === undefined && stroke === undefined) return
            context2D.beginPath()
            path(object)
            paint(context2D, fill, stroke, lineWidth)
        },
        bounds: feature => path.bounds(feature),
        centroid: feature => path.centroid(middleOf(feature)),
    }
}

/**
 * The scale and offset that take the reference's pixels (the starting view's) to a view's:
 * `x' = k x + x0`, and `y' = k y + y0`
 */
export interface Shift {
    readonly k: number
    readonly x0: number
    readonly y0: number
}

/**
 * The shapes projected at the reference view (see `shiftedPen`): each projected (once) when first
 * drawn, and kept for as long as the shape is (they're held weakly, by the shape)
 */
export class ReferenceShapes {
    private readonly paths = new WeakMap<object, Path2D>()
    private readonly boundsByFeature = new WeakMap<object, PixelBounds>()
    private readonly centroids = new WeakMap<object, [number, number]>()

    /**
     * @param withReference Calls the function handed it with a path generator for the reference
     * view (with no context), and returns what it returns -- e.g. setting up the projection for the
     * reference, and back, around the call
     * @param newPath Creates an empty path (a `Path2D`, outside of tests)
     */
    private readonly withReference: <T>(project: (path: d3.GeoPath) => T) => T
    private readonly newPath: () => Path2D

    constructor(
        withReference: <T>(project: (path: d3.GeoPath) => T) => T,
        newPath: () => Path2D = () => new Path2D(),
    ) {
        this.withReference = withReference
        this.newPath = newPath
    }

    /**
     * @param object A shape
     * @return The shape, projected at the reference view
     */
    pathOf(object: d3.GeoPermissibleObjects): Path2D {
        let path = this.paths.get(object)
        if (path === undefined) {
            const projected = this.newPath()
            this.withReference(reference => reference.context(projected as unknown as CanvasRenderingContext2D)(object))
            path = projected
            this.paths.set(object, path)
        }
        return path
    }

    /**
     * @param feature A feature
     * @return Its bounds at the reference view
     */
    boundsOf(feature: GeoJSON.Feature): PixelBounds {
        let bounds = this.boundsByFeature.get(feature)
        if (bounds === undefined) {
            bounds = this.withReference(reference => reference.bounds(feature))
            this.boundsByFeature.set(feature, bounds)
        }
        return bounds
    }

    /**
     * @param feature A feature
     * @return Its middle at the reference view
     */
    centroidOf(feature: GeoJSON.Feature): [number, number] {
        let centroid = this.centroids.get(feature)
        if (centroid === undefined) {
            centroid = this.withReference(reference => reference.centroid(middleOf(feature)))
            this.centroids.set(feature, centroid)
        }
        return centroid
    }
}

/**
 * @param shapes The shapes projected at the reference view
 * @param shift The scale and offset from the reference view to the view drawn
 * @return A pen that draws the shapes as projected at the reference view, scaled and offset to the
 * view (each outline's width kept, whatever the scale)
 */
export function shiftedPen(shapes: ReferenceShapes, shift: Shift): GeoPen {
    const {k, x0, y0} = shift
    return {
        draw: (context2D, object, fill, stroke, lineWidth): void => {
            if (fill === undefined && stroke === undefined) return
            const path = shapes.pathOf(object)
            context2D.save()
            context2D.transform(k, 0, 0, k, x0, y0)
            paint(context2D, fill, stroke, lineWidth / k, path)
            context2D.restore()
        },
        bounds: (feature): PixelBounds => {
            const [[left, top], [right, bottom]] = shapes.boundsOf(feature)
            return [[k * left + x0, k * top + y0], [k * right + x0, k * bottom + y0]]
        },
        centroid: (feature): [number, number] => {
            const [x, y] = shapes.centroidOf(feature)
            return [k * x + x0, k * y + y0]
        },
    }
}
