import * as d3 from "d3";
import type {CurveFactory} from "d3";

/**
 * The default color of a colorized line's start (its oldest point): a blue
 */
export const DEFAULT_LINE_START_COLOR = '#2f6cf6'
/**
 * The default color of a colorized line's end (its newest point): a red
 */
export const DEFAULT_LINE_END_COLOR = '#e8423f'

// the number of distinct colors a colorized line is drawn with -- consecutive pieces of the line
// that get the same color are stroked together, so a line of thousands of points costs at most
// about this many strokes
const COLOR_BANDS = 64

// a piece of a line, as d3's line generator traced it: where it starts and ends, and how to draw
// it (from its start) onto a canvas path
type LinePiece = {
    start: [x: number, y: number]
    end: [x: number, y: number]
    draw: (context: CanvasPath) => void
}

/**
 * Records the pieces of the line that d3's line generator traces (one per drawing command:
 * `lineTo`, `bezierCurveTo`, ...), rather than drawing them, so that each piece can be stroked in
 * its own color while keeping the curve's exact shape
 */
class LineRecorder {
    readonly pieces: Array<LinePiece> = []
    private current: [x: number, y: number] = [0, 0]
    private subpathStart: [x: number, y: number] = [0, 0]

    moveTo(x: number, y: number): void {
        this.current = [x, y]
        this.subpathStart = [x, y]
    }

    lineTo(x: number, y: number): void {
        this.add([x, y], context => context.lineTo(x, y))
    }

    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void {
        this.add([x, y], context => context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y))
    }

    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
        this.add([x, y], context => context.quadraticCurveTo(cpx, cpy, x, y))
    }

    arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {
        this.add([x2, y2], context => context.arcTo(x1, y1, x2, y2, radius))
    }

    arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void {
        const end: [number, number] = [x + radius * Math.cos(endAngle), y + radius * Math.sin(endAngle)]
        this.add(end, context => context.arc(x, y, radius, startAngle, endAngle, counterclockwise))
    }

    closePath(): void {
        const [x, y] = this.subpathStart
        this.add([x, y], context => context.lineTo(x, y))
    }

    rect(x: number, y: number, width: number, height: number): void {
        this.moveTo(x, y)
        this.lineTo(x + width, y)
        this.lineTo(x + width, y + height)
        this.lineTo(x, y + height)
        this.closePath()
    }

    private add(end: [x: number, y: number], draw: (context: CanvasPath) => void): void {
        this.pieces.push({start: this.current, end, draw})
        this.current = end
    }
}

/**
 * Creates the function that gives the color at a fraction of the way along a colorized line:
 * from the start color (at 0) to the end color (at 1), sweeping the long way around the hue
 * circle, so that the line passes through the colors of the spectrum in between (e.g. from blue,
 * through cyan, green, and yellow, to red)
 * @param startColor The color at the line's start
 * @param endColor The color at the line's end
 * @return The color at a fraction (from 0 to 1) of the way along the line
 */
export function lineColorScale(startColor: string, endColor: string): (fraction: number) => string {
    return d3.interpolateHslLong(startColor, endColor)
}

/**
 * Strokes a line through the specified points, with the specified curve, whose color changes
 * along it: each piece of the line, as the curve traces it (e.g. the segment between two points),
 * gets the color at its position along the line, from the first piece (0) to the last (1). The
 * curve's shape is exactly the same as stroking the whole line at once. The context's current
 * line width (and other stroke settings) are used.
 * @param context The canvas 2D context to stroke onto
 * @param points The points, in order
 * @param x The x-coordinate (in the context's space) of a point
 * @param y The y-coordinate (in the context's space) of a point
 * @param curve The curve (interpolation) between the points
 * @param colorAt The color at a fraction (from 0 to 1) of the way along the line (see
 * {@link lineColorScale})
 * @template P The type of the points
 */
export function strokeColorizedLine<P>(
    context: CanvasRenderingContext2D,
    points: Array<P>,
    x: (point: P) => number,
    y: (point: P) => number,
    curve: CurveFactory,
    colorAt: (fraction: number) => string
): void {
    // (with a single point, there's no line to draw -- d3 would close the path back on itself)
    if (points.length < 2) return

    const recorder = new LineRecorder()
    d3.line<P>().x(x).y(y).curve(curve).context(recorder as unknown as CanvasRenderingContext2D)(points)
    const {pieces} = recorder
    if (pieces.length === 0) return

    const bandOf = (index: number) => pieces.length === 1 ?
        0 :
        Math.round(index / (pieces.length - 1) * (COLOR_BANDS - 1))
    const sameSpot = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1]

    context.save()
    // (round joins and caps, so that consecutive runs of different colors meet without a notch)
    context.lineJoin = 'round'
    context.lineCap = 'round'
    let band = -1
    let previousEnd: [number, number] | undefined = undefined
    pieces.forEach((piece, index) => {
        const pieceBand = bandOf(index)
        if (pieceBand !== band) {
            // a new color: stroke the run so far, and start a new one at this piece
            if (band >= 0) context.stroke()
            band = pieceBand
            context.strokeStyle = colorAt(band / (COLOR_BANDS - 1))
            context.beginPath()
            context.moveTo(piece.start[0], piece.start[1])
        } else if (previousEnd === undefined || !sameSpot(previousEnd, piece.start)) {
            // (a gap in the line, e.g. a new subpath)
            context.moveTo(piece.start[0], piece.start[1])
        }
        piece.draw(context)
        previousEnd = piece.end
    })
    context.stroke()
    context.restore()
}
