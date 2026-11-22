import * as d3 from "d3"

/**
 * The map projections a {@link GeoPlot} can show by name (see its `projection` property). Any other
 * d3 projection can be handed to the plot directly.
 */
export const GeoProjections = {
    orthographic: d3.geoOrthographic,
    azimuthalEqualArea: d3.geoAzimuthalEqualArea,
    azimuthalEquidistant: d3.geoAzimuthalEquidistant,
    stereographic: d3.geoStereographic,
    equirectangular: d3.geoEquirectangular,
    mercator: d3.geoMercator,
    transverseMercator: d3.geoTransverseMercator,
    naturalEarth1: d3.geoNaturalEarth1,
    equalEarth: d3.geoEqualEarth,
    conicEqualArea: d3.geoConicEqualArea,
    conicEquidistant: d3.geoConicEquidistant,
    // (a composite: the lower 48 states, with Alaska and Hawaii moved in; shown in the "shift" view
    // mode, framing a shape -- e.g. the United States -- see the GeoPlot's `viewMode` and `fitTo`)
    albersUsa: d3.geoAlbersUsa,
} as const

/**
 * The name of a map projection a {@link GeoPlot} can show (see {@link GeoProjections})
 */
export type GeoProjectionName = keyof typeof GeoProjections

/**
 * A {@link GeoPlot}'s view, in a form that can be held outside the plot (e.g. in an application
 * store) and handed back to a later instance of the plot (see its `viewState` and `onViewChange`
 * properties) -- so that turning or zooming the view, navigating away, and navigating back doesn't
 * reset it
 */
export interface GeoPlotViewState {
    /**
     * The projection's rotation `[lambda, phi, gamma]` (degrees): the view is centered on longitude
     * `-lambda` and latitude `-phi`. A flat map only uses `lambda` (a globe uses all three), but the
     * view keeps them all, for when it's shown as a globe again.
     */
    rotate: [lambda: number, phi: number, gamma: number]
    /**
     * The zoom: a factor of the scale that fits the whole sphere into the plot (1 to show it all)
     */
    k: number
    /**
     * How far (px) a flat map is shifted up or down (zoomed in, a flat map pans north and south by
     * shifting, rather than by tilting, which would make it an oblique projection). Not used by a
     * globe. In the "shift" view mode, how far the map is shifted down.
     */
    offsetY: number
    /**
     * In the "shift" view mode (see the GeoPlot's `viewMode`), how far (px) the map is shifted right;
     * not used otherwise (the view turns, rather than shifts, east and west)
     */
    offsetX?: number
}

const DEGREES = 180 / Math.PI

/**
 * @param center The `[longitude, latitude]` (degrees) at the center of the view
 * @return The (un-zoomed) view centered there
 */
export function viewCenteredOn([longitude, latitude]: [number, number]): GeoPlotViewState {
    // (`0 - x` rather than `-x`, so that a 0 stays 0 rather than becoming -0)
    return {rotate: [0 - longitude, 0 - latitude, 0], k: 1, offsetY: 0}
}

/**
 * Whether a projection shows the earth as a globe (an azimuthal projection, like the orthographic):
 * it clips at an angle from its center, hiding the far side. (d3 reports a projection that doesn't
 * clip at an angle as having a clip angle of 0.)
 * @param projection The projection
 * @return `true` when the projection clips at an angle from its center
 */
export function isGlobe(projection: d3.GeoProjection): boolean {
    // (a composite projection, like d3's Albers USA, has no clip angle: it isn't a globe)
    if (typeof projection.clipAngle !== 'function') return false
    const clipAngle = projection.clipAngle()
    return clipAngle !== null && clipAngle !== undefined && clipAngle > 0
}

/**
 * Whether a projection can be turned (rotated): a composite projection -- several projections, each
 * of its own region, put together, like d3's Albers USA -- can't be, so its view shifts instead (see
 * the GeoPlot's `viewMode`)
 * @param projection The projection
 * @return `true` when the projection can be rotated
 */
export const canTurn = (projection: d3.GeoProjection): boolean => typeof projection.rotate === 'function'

/**
 * Sets the projection up to show a view in the "shift" view mode: fitted to the base shape (in the
 * plot area, less the padding), and then zoomed (about the area's middle) and shifted as the view
 * says -- the projection's rotation (if it has one) left as it is. For the projections that can't
 * be rotated (composites, like d3's Albers USA), and for any other whose view should only shift and
 * zoom, like a picture.
 * @param projection The projection (changed in place)
 * @param base The shape the view frames before it's zoomed or shifted (e.g. the United States)
 * @param view The view (its zoom, `k`, and its shifts, `offsetX` and `offsetY`)
 * @param width The width (px) of the plot area
 * @param height The height (px) of the plot area
 * @param padding The space (px) to leave around the base shape
 */
export function setUpShiftedProjection(
    projection: d3.GeoProjection,
    base: d3.GeoPermissibleObjects,
    view: GeoPlotViewState,
    width: number,
    height: number,
    padding: number = 0,
): void {
    const inset = width > 2 * padding && height > 2 * padding ? padding : 0
    projection.fitExtent([[inset, inset], [width - inset, height - inset]], base)
    const [x, y] = projection.translate()
    const middleX = width / 2, middleY = height / 2
    projection.scale(projection.scale() * view.k)
    projection.translate([
        middleX + (x - middleX) * view.k + (view.offsetX ?? 0),
        middleY + (y - middleY) * view.k + view.offsetY,
    ])
}

/**
 * The view in the "shift" view mode that the others are shifts of: the base shape, unzoomed and
 * unshifted
 */
export const SHIFT_REFERENCE_VIEW: GeoPlotViewState = {rotate: [0, 0, 0], k: 1, offsetX: 0, offsetY: 0}

/**
 * In the "shift" view mode, a view only scales and slides the map projected at the reference view
 * (see `setUpShiftedProjection`): this is that scale and slide, so that the map projected once can
 * be drawn at any view
 * @param view A view in the "shift" view mode
 * @param width The width (px) of the plot area
 * @param height The height (px) of the plot area
 * @return The scale, `k`, and offsets, `x0` and `y0`, that take a point projected at the reference
 * view, `(x, y)`, to the view: `(k x + x0, k y + y0)`
 */
export function shiftOf(view: GeoPlotViewState, width: number, height: number): {k: number, x0: number, y0: number} {
    return {
        k: view.k,
        x0: width / 2 * (1 - view.k) + (view.offsetX ?? 0),
        y0: height / 2 * (1 - view.k) + view.offsetY,
    }
}

/**
 * @param view A view in the "shift" view mode
 * @param dx The horizontal distance (px) dragged
 * @param dy The vertical distance (px) dragged
 * @return The view, shifted as far as it was dragged
 */
export const shiftView = (view: GeoPlotViewState, dx: number, dy: number): GeoPlotViewState =>
    ({...view, offsetX: (view.offsetX ?? 0) + dx, offsetY: view.offsetY + dy})

/**
 * The view, in the "shift" view mode, after zooming it to a new zoom about a point of the plot area:
 * the place under the point stays under it
 * @param view The view before zooming
 * @param k The new zoom
 * @param point The `[x, y]` (px) of the point in the plot area to zoom about
 * @param width The width (px) of the plot area
 * @param height The height (px) of the plot area
 * @return The new view
 */
export function zoomShiftedViewAbout(
    view: GeoPlotViewState,
    k: number,
    [x, y]: [x: number, y: number],
    width: number,
    height: number,
): GeoPlotViewState {
    // a point of the fitted map, u, is drawn at middle + (u - middle) * k + offset: the one drawn at
    // the point now is kept there at the new zoom
    const middleX = width / 2, middleY = height / 2
    const ux = middleX + (x - middleX - (view.offsetX ?? 0)) / view.k
    const uy = middleY + (y - middleY - view.offsetY) / view.k
    return {
        ...view,
        k,
        offsetX: x - middleX - (ux - middleX) * k,
        offsetY: y - middleY - (uy - middleY) * k,
    }
}

/**
 * Sets the projection up to show a view in a plot area: its rotation (a flat map only takes the
 * east-west rotation), the scale and translation that fit the whole sphere into the area, the zoom
 * (about the area's center), and, for a flat map, its vertical shift -- clamped so that a map
 * taller than the area always covers it, and a map that fits stays centered
 * @param projection The projection (changed in place)
 * @param view The view
 * @param width The width (px) of the plot area
 * @param height The height (px) of the plot area
 * @return The vertical shift (px) actually applied (0 for a globe)
 */
export function setUpProjection(projection: d3.GeoProjection, view: GeoPlotViewState, width: number, height: number): number {
    const globe = isGlobe(projection)
    const [lambda, phi, gamma] = view.rotate
    projection.rotate(globe ? [lambda, phi, gamma] : [lambda, 0, 0])
    projection.fitExtent([[0, 0], [width, height]], {type: 'Sphere'})
    projection.scale(projection.scale() * view.k)
    if (globe) return 0

    const [[, top], [, bottom]] = d3.geoPath(projection).bounds({type: 'Sphere'})
    const offsetY = bottom - top <= height ?
        height / 2 - (top + bottom) / 2 :
        Math.min(-top, Math.max(height - bottom, view.offsetY))
    const [x, y] = projection.translate()
    projection.translate([x, y + offsetY])
    return offsetY
}

/**
 * The view that frames a shape (e.g. a country, or a state): centered on its centroid, and zoomed in
 * until its bounds fill the plot area, less the padding, in one direction or the other. A globe turns
 * to face the shape; a flat map turns east or west to it, and shifts it to the middle, north or south,
 * as far as the map allows.
 * @param projection The projection (left set up for the view)
 * @param shape The shape, as GeoJSON
 * @param width The width (px) of the plot area
 * @param height The height (px) of the plot area
 * @param padding The space (px) to leave between the shape and the plot area's edges
 * @return The view; the whole sphere, centered on the shape, when the shape (or the area) has no size
 */
export function viewFitting(
    projection: d3.GeoProjection,
    shape: d3.GeoPermissibleObjects,
    width: number,
    height: number,
    padding: number = 20,
): GeoPlotViewState {
    const [longitude, latitude] = d3.geoCentroid(shape as d3.ExtendedFeature)
    let center: [number, number] = [Number.isFinite(longitude) ? longitude : 0, Number.isFinite(latitude) ? latitude : 0]
    const centered = viewCenteredOn(center)
    if (!(width > 2 * padding && height > 2 * padding)) return centered

    // the zoom that fits the shape's bounds, centered: zooming scales the shape about the plot area's
    // middle, so the view turns until the middle of the shape's (drawn) bounds is there -- which the
    // shape's centroid isn't quite (e.g. a globe draws a box's northern edge shorter than its
    // southern) -- a few steps converge
    const globe = isGlobe(projection)
    let view: GeoPlotViewState = centered
    for (let step = 0; step < 4; step++) {
        const unzoomed = viewCenteredOn(center)
        setUpProjection(projection, unzoomed, width, height)
        const [[x0, y0], [x1, y1]] = d3.geoPath(projection).bounds(shape)
        const k = Math.min((width - 2 * padding) / (x1 - x0), (height - 2 * padding) / (y1 - y0))
        if (!Number.isFinite(k) || k <= 0) return centered
        view = {...unzoomed, k: Math.max(1, k)}
        setUpProjection(projection, view, width, height)
        const [[zx0, zy0], [zx1, zy1]] = d3.geoPath(projection).bounds(shape)
        const middle = placeUnder(projection, [(zx0 + zx1) / 2, (zy0 + zy1) / 2])
        if (middle === undefined) break
        // (a flat map only turns east and west: it's shifted north and south below)
        const next: [number, number] = globe ? middle : [middle[0], center[1]]
        if (Math.abs(next[0] - center[0]) < 1e-6 && Math.abs(next[1] - center[1]) < 1e-6) break
        center = next
    }
    if (globe) {
        setUpProjection(projection, view, width, height)
        return view
    }

    // a flat map only turns east and west: shift the shape's middle to the plot area's, north or south
    // (as far as the map allows, see `setUpProjection`)
    const applied = setUpProjection(projection, view, width, height)
    const [[, top], [, bottom]] = d3.geoPath(projection).bounds(shape)
    view = {...view, offsetY: applied + height / 2 - (top + bottom) / 2}
    return {...view, offsetY: setUpProjection(projection, view, width, height)}
}

/**
 * The view after dragging it: a globe turns under the mouse, in every direction; a flat map shifts
 * east and west (by turning), and north and south (by shifting, when zoomed in)
 * @param projection The projection (left set up for the new view)
 * @param view The view before the drag step
 * @param dx The horizontal distance (px) dragged
 * @param dy The vertical distance (px) dragged
 * @param width The width (px) of the plot area
 * @param height The height (px) of the plot area
 * @return The new view
 */
export function panView(
    projection: d3.GeoProjection,
    view: GeoPlotViewState,
    dx: number,
    dy: number,
    width: number,
    height: number,
): GeoPlotViewState {
    setUpProjection(projection, view, width, height)
    // a pixel at the view's center spans (1 / scale) radians of the sphere
    const degreesPerPixel = DEGREES / projection.scale()
    const [lambda, phi, gamma] = view.rotate
    if (isGlobe(projection)) {
        return {
            ...view,
            rotate: [lambda + dx * degreesPerPixel, Math.max(-90, Math.min(90, phi - dy * degreesPerPixel)), gamma],
        }
    }
    const moved = {...view, rotate: [lambda + dx * degreesPerPixel, phi, gamma] as [number, number, number], offsetY: view.offsetY + dy}
    return {...moved, offsetY: setUpProjection(projection, moved, width, height)}
}

/**
 * @param degrees An angle (degrees)
 * @return The same angle, between -180 and 180
 */
const normalized = (degrees: number): number => ((degrees % 360) + 540) % 360 - 180

/**
 * The place under a point of the plot area, when the point is on the map. (d3's `invert` doesn't
 * say when a point is off the map -- e.g. beyond a globe's edge, it still answers with a place --
 * so the place only counts when projecting it lands back on the point.)
 * @param projection The projection, set up for the view
 * @param point The `[x, y]` (px) of the point
 * @return The `[longitude, latitude]` under the point, or `undefined` when the point is off the map
 */
export function placeUnder(projection: d3.GeoProjection, point: [x: number, y: number]): [number, number] | undefined {
    const place = projection.invert?.(point)
    if (place === null || place === undefined || !Number.isFinite(place[0]) || !Number.isFinite(place[1])) return undefined
    const back = projection(place)
    if (back === null || Math.hypot(back[0] - point[0], back[1] - point[1]) > 1) return undefined
    if (isGlobe(projection)) {
        const [lambda, phi] = projection.rotate()
        if (d3.geoDistance(place, [-lambda, -phi]) > (projection.clipAngle() ?? 0) / DEGREES) return undefined
    }
    return place
}

/**
 * The view after zooming it to a new scale about a point of the plot area: the place under the
 * point stays under it (as far as the projection allows). When the point is off the map (e.g.
 * beyond the globe's edge), zooms about the center.
 * @param projection The projection (left set up for the new view)
 * @param view The view before zooming
 * @param k The new zoom (a factor of the scale that fits the whole sphere)
 * @param point The `[x, y]` (px) of the point in the plot area to zoom about
 * @param width The width (px) of the plot area
 * @param height The height (px) of the plot area
 * @return The new view
 */
export function zoomViewAbout(
    projection: d3.GeoProjection,
    view: GeoPlotViewState,
    k: number,
    point: [x: number, y: number],
    width: number,
    height: number,
): GeoPlotViewState {
    setUpProjection(projection, view, width, height)
    const place = placeUnder(projection, point)
    let zoomed: GeoPlotViewState = {...view, k}
    if (place === undefined) {
        zoomed = {...zoomed, offsetY: setUpProjection(projection, zoomed, width, height)}
        return zoomed
    }

    // turn (and, for a flat map, shift) the view until the place is back under the point: a few
    // steps converge, since each step's error is small (a zoom step changes the scale a little)
    const globe = isGlobe(projection)
    for (let step = 0; step < 4; step++) {
        zoomed = {...zoomed, offsetY: setUpProjection(projection, zoomed, width, height)}
        const under = placeUnder(projection, point)
        if (under === undefined) break
        // (a place east of the one under the point is to its right: turn the view west, and so on)
        const dLongitude = Math.max(-30, Math.min(30, normalized(place[0] - under[0])))
        const dLatitude = place[1] - under[1]
        const [lambda, phi, gamma] = zoomed.rotate
        if (globe) {
            zoomed = {...zoomed, rotate: [lambda - dLongitude, Math.max(-90, Math.min(90, phi - dLatitude)), gamma]}
        } else {
            zoomed = {...zoomed, rotate: [lambda - dLongitude, phi, gamma]}
            zoomed = {...zoomed, offsetY: setUpProjection(projection, zoomed, width, height)}
            const projected = projection(place)
            if (projected !== null) zoomed = {...zoomed, offsetY: zoomed.offsetY + point[1] - projected[1]}
        }
        if (Math.abs(dLongitude) < 1e-4 && Math.abs(dLatitude) < 1e-4) break
    }
    return {...zoomed, offsetY: setUpProjection(projection, zoomed, width, height)}
}
