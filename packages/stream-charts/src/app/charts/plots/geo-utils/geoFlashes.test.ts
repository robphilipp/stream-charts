import {
    flashGroupsOf,
    flashRingOf,
    resolvedFlashes,
} from "./geoFlashes";

describe('flashes', () => {
    it('grows a ring outward, quickly at first, fading as it grows', () => {
        const start = flashRingOf(0, 1000, 20)!
        const middle = flashRingOf(500, 1000, 20)!
        const late = flashRingOf(900, 1000, 20)!
        expect(start).toEqual({radius: 2, opacity: 1})
        // (three quarters of the way out at half time)
        expect(middle.radius).toBeCloseTo(15.5, 9)
        expect(middle.opacity).toBeCloseTo(0.5, 9)
        expect(late.radius).toBeGreaterThan(middle.radius)
        expect(late.radius).toBeLessThan(20)
        expect(late.opacity).toBeCloseTo(0.1, 9)
    })

    it('flashes an event once, at its place, as the plot\'s settings say -- or not at all', () => {
        const datum = {latitude: 51.5, longitude: -0.1}
        const defaults = {radius: 20, duration: 1500}
        expect(resolvedFlashes(true, datum, defaults)).toEqual([{latitude: 51.5, longitude: -0.1, radius: 20, duration: 1500, color: undefined}])
        expect(resolvedFlashes(false, datum, defaults)).toEqual([])
        expect(resolvedFlashes([], datum, defaults)).toEqual([])
    })

    it('flashes an event as many times as it says, each where, as large, as long, and in the color it says', () => {
        const flashes = resolvedFlashes(
            [{}, {latitude: 51.51, longitude: -0.12, radius: 8, duration: 600, color: '#ffb300'}],
            {latitude: 51.5, longitude: -0.1},
            {radius: 20, duration: 1500},
        )
        expect(flashes).toEqual([
            {latitude: 51.5, longitude: -0.1, radius: 20, duration: 1500, color: undefined},
            {latitude: 51.51, longitude: -0.12, radius: 8, duration: 600, color: '#ffb300'},
        ])
    })

    it('leaves out a flash with no place, or no time to show', () => {
        expect(resolvedFlashes([{latitude: NaN}, {duration: 0}], {latitude: 51.5, longitude: -0.1}, {radius: 20, duration: 1500})).toEqual([])
    })

    it('has no ring before the flash starts, or once it\'s over', () => {
        expect(flashRingOf(-1, 1000, 20)).toBeUndefined()
        expect(flashRingOf(1000, 1000, 20)).toBeUndefined()
        expect(flashRingOf(NaN, 1000, 20)).toBeUndefined()
    })
})

describe('merging flashes', () => {
    const flash = (x: number, y: number, start: number, color: string = 'magenta', duration: number = 1500): {x: number, y: number, start: number, duration: number, color: string} =>
        ({x, y, start, duration, color})

    it('groups the flashes of a color that start within a flash\'s length of each other, close together', () => {
        const groups = flashGroupsOf([flash(100, 100, 1600), flash(104, 103, 2900), flash(130, 100, 1600), flash(101, 101, 1600, 'orange')], 12)
        expect(groups.map(group => group.length).sort()).toEqual([1, 1, 2])
    })

    it('keeps flashes apart that start in different stretches of a flash\'s length, or last different lengths', () => {
        expect(flashGroupsOf([flash(100, 100, 1000), flash(100, 100, 1600)], 12).length).toBe(2)
        expect(flashGroupsOf([flash(100, 100, 1600), flash(100, 100, 1600, 'magenta', 600)], 12).length).toBe(2)
    })

    it('doesn\'t group flashes when the distance is 0', () => {
        expect(flashGroupsOf([flash(100, 100, 1000), flash(100, 100, 1000)], 0).length).toBe(2)
    })
})

