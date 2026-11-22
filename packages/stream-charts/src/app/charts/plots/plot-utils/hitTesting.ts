// Canvas has no per-shape mouse events (no SVG `.on("mouseover", ...)` equivalent) -- everything is
// just pixels on a bitmap. So instead of attaching a handler to each `<path>`/`<circle>`, plots
// register their drawn geometry (in canvas/pixel coordinates) here, and a single `mousemove`
// listener on the shared canvas element hit-tests the mouse position against that geometry to
// figure out which series (if any) the mouse is over.

/** A single (x, y) point in canvas drawing coordinates (i.e. already includes the plot's margin offset). */
export type Point = [x: number, y: number]

/** An axis-aligned rectangle, in canvas coordinates. */
export interface Rect {
    x: number
    y: number
    width: number
    height: number
}

/**
 * The screen-space geometry for one series, as last drawn, used for hit-testing on `mousemove`.
 * Points/segments/rects are in the same canvas coordinate space the series was drawn in
 * (margin-offset already applied).
 */
export interface SeriesGeometry {
    /** the points that make up the series, in drawing order (ignored when `segments`/`rects` is set) */
    points: Array<Point>
    /**
     * When set, `points` is hit-tested as a single *connected* polyline (mouse must be within
     * `hitRadius` pixels of a line segment between consecutive points). When unset and
     * `segments`/`rects` is also unset, `points` are hit-tested individually as circles of radius
     * `hitRadius` (e.g. for marker/bar-style plots where there's no connecting line).
     */
    asLine?: boolean
    /**
     * A set of *disjoint* line segments (e.g. one per raster spike) that are hit-tested
     * independently -- unlike `asLine`, consecutive entries are NOT assumed to connect to each
     * other. Takes precedence over `points`/`asLine` when set.
     */
    segments?: Array<[Point, Point]>
    /**
     * A set of axis-aligned rectangles (e.g. bar-chart bars), hit-tested as filled regions (exact
     * containment, not a `hitRadius` proximity test). Takes precedence over `segments`/`points`.
     */
    rects?: Array<Rect>
    /** how close (in pixels) the mouse must be to register a hit (ignored when `rects` is set) */
    hitRadius: number
}

/**
 * Squared distance from a point to a line segment (avoids a sqrt when just comparing distances).
 * @param px The point's x-coordinate
 * @param py The point's y-coordinate
 * @param x1 The x-coordinate of the segment's start
 * @param y1 The y-coordinate of the segment's start
 * @param x2 The x-coordinate of the segment's end
 * @param y2 The y-coordinate of the segment's end
 * @return The squared distance from the point to the nearest point on the segment
 */
function distanceSquaredToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1
    const dy = y2 - y1
    const lengthSquared = dx * dx + dy * dy
    if (lengthSquared === 0) {
        const ddx = px - x1
        const ddy = py - y1
        return ddx * ddx + ddy * ddy
    }
    // project point onto the segment, clamped to the segment's extent
    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared
    t = Math.max(0, Math.min(1, t))
    const closestX = x1 + t * dx
    const closestY = y1 + t * dy
    const ddx = px - closestX
    const ddy = py - closestY
    return ddx * ddx + ddy * ddy
}

/**
 * The result of a hit-test: which series was hit, and the index of the specific point (for
 * point/polyline geometry) or segment (for disjoint-segment geometry) that matched -- so callers
 * can look up the specific datum involved (e.g. for a tooltip) rather than just the series name.
 */
export interface SeriesHit {
    /** the name of the series that was hit */
    name: string
    /**
     * the index of the point (for point or polyline geometry -- for a polyline, whichever end of
     * the hit segment is nearer the mouse), segment, or rect that was hit
     */
    index: number
}

/**
 * Finds the series (and specific point/segment within it) hit by the given mouse position.
 * Entries are checked in *reverse* insertion order -- i.e. most-recently-added first -- and the
 * first entry with any qualifying match wins, matching normal DOM/SVG hit-testing (the topmost
 * element captures the pointer) rather than picking whichever entry happens to report the smallest
 * geometric distance across all entries.
 *
 * This distinction matters whenever two entries visually overlap: e.g. a bar-chart's value-line
 * segment is drawn on top of (and can extend slightly beyond) its min/max bar's rect. A rect is a
 * containment test -- any point inside it is unambiguously "hit," with no notion of "how close" --
 * so comparing it against a segment's proximity-based distance would let the rect win everywhere
 * the two overlap, even dead-center on the line, since 0 distance beats any nonzero one. Since
 * plots insert geometry in the same order they draw it, checking entries topmost-first resolves
 * this the way it looks on screen: whichever shape is drawn last (visually on top) claims the
 * pointer first, and only falls through to earlier (lower) entries where it doesn't match at all.
 *
 * Within a single entry (e.g. Scatter's many polyline segments, or Raster's many disjoint spikes)
 * the closest qualifying point/segment still wins, since there's no z-order to speak of among
 * pieces of the same drawn shape.
 * @param mouseX The mouse's x-coordinate, in the same canvas coordinate space the geometry was recorded in
 * @param mouseY The mouse's y-coordinate, in the same canvas coordinate space the geometry was recorded in
 * @param geometry A `map(series_name -> SeriesGeometry)` as last drawn, in draw order
 * @return The hit series and matched index, or `undefined` if the mouse isn't over any series
 */
export function seriesAt(mouseX: number, mouseY: number, geometry: Map<string, SeriesGeometry>): SeriesHit | undefined {
    const entries = Array.from(geometry.entries()).reverse()

    for (const [name, {points, asLine, segments, rects, hitRadius}] of entries) {
        const hitRadiusSquared = hitRadius * hitRadius

        if (rects !== undefined) {
            const index = rects.findIndex(rect =>
                mouseX >= rect.x && mouseX <= rect.x + rect.width &&
                mouseY >= rect.y && mouseY <= rect.y + rect.height
            )
            if (index >= 0) return {name, index}
            continue
        }

        if (segments !== undefined) {
            let bestIndex = -1
            let bestDistanceSquared = Infinity
            segments.forEach(([[x1, y1], [x2, y2]], index) => {
                const distanceSquared = distanceSquaredToSegment(mouseX, mouseY, x1, y1, x2, y2)
                if (distanceSquared <= hitRadiusSquared && distanceSquared < bestDistanceSquared) {
                    bestDistanceSquared = distanceSquared
                    bestIndex = index
                }
            })
            if (bestIndex >= 0) return {name, index: bestIndex}
            continue
        }

        if (points.length === 0) continue

        if (asLine) {
            let bestIndex = -1
            let bestDistanceSquared = Infinity
            for (let i = 0; i < points.length - 1; i++) {
                const [x1, y1] = points[i]
                const [x2, y2] = points[i + 1]
                const distanceSquared = distanceSquaredToSegment(mouseX, mouseY, x1, y1, x2, y2)
                if (distanceSquared <= hitRadiusSquared && distanceSquared < bestDistanceSquared) {
                    bestDistanceSquared = distanceSquared
                    // attribute the hit to whichever endpoint of the segment is nearer
                    const toStart = (mouseX - x1) ** 2 + (mouseY - y1) ** 2
                    const toEnd = (mouseX - x2) ** 2 + (mouseY - y2) ** 2
                    bestIndex = toStart <= toEnd ? i : i + 1
                }
            }
            if (bestIndex >= 0) return {name, index: bestIndex}
            continue
        }

        let bestIndex = -1
        let bestDistanceSquared = Infinity
        points.forEach(([x, y], index) => {
            const distanceSquared = (mouseX - x) ** 2 + (mouseY - y) ** 2
            if (distanceSquared <= hitRadiusSquared && distanceSquared < bestDistanceSquared) {
                bestDistanceSquared = distanceSquared
                bestIndex = index
            }
        })
        if (bestIndex >= 0) return {name, index: bestIndex}
    }

    return undefined
}

/**
 * Converts a `MouseEvent` (as received by a `canvas.addEventListener('mousemove', ...)` handler)
 * into canvas-local coordinates, accounting for the canvas's on-page position and any CSS scaling
 * between the canvas's backing-store size and its displayed size.
 * @param event The mouse event
 * @param canvas The canvas element the event was dispatched to
 * @return The `[x, y]` position of the event, in the canvas's own CSS-pixel coordinate space
 * (i.e. the same space `ctx` drawing calls use once the devicePixelRatio transform is applied)
 */
export function canvasLocalPoint(event: MouseEvent, canvas: HTMLCanvasElement): Point {
    const rect = canvas.getBoundingClientRect()
    const scaleX = rect.width > 0 ? canvas.clientWidth / rect.width : 1
    const scaleY = rect.height > 0 ? canvas.clientHeight / rect.height : 1
    return [
        (event.clientX - rect.left) * scaleX,
        (event.clientY - rect.top) * scaleY
    ]
}
