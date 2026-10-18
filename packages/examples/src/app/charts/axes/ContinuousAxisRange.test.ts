import {ContinuousAxisRange} from "./ContinuousAxisRange";

// Note: `.scale(factor, value)`'s `factor` is *incremental* -- relative to `.current`, not
// `.original` -- matching what a single d3-zoom event needs (d3-zoom's own `transform.k` is
// cumulative, so callers must convert it to an incremental factor before calling this; see
// `BaseAxisRange.scaledRange`).

test('creates a time-range', () => {
    const timeRange = ContinuousAxisRange.from(10, 100);
    expect(timeRange.current).toEqual({start: 10, end: 100});
    expect(timeRange.original).toEqual({start: 10, end: 100});
});

test('scaling a time-range scales relative to current, not original', () => {
    const timeRange = ContinuousAxisRange.from(0, 100).scale(2, 50);
    // the midpoint must remain at 50, so the new range will be 50 - 2 * (50 - 0) to
    // 50 + 2 * (100 - 50) => (-50, 150)
    expect(timeRange.current).toEqual({start: -50, end: 150});

    // scaling again by a factor of 1 is a no-op -- 1 is the *incremental* factor (relative to the
    // range's current width), not a target scale relative to `.original`
    const unchanged = timeRange.scale(1, 50);
    expect(unchanged.current).toEqual({start: -50, end: 150});

    // scaling by 0.5 from the current (-50, 150), pivoting at 50, halves the distance from the
    // pivot on each side, recovering the original (0, 100)
    const halved = timeRange.scale(0.5, 50);
    expect(halved.current).toEqual({start: 0, end: 100});

    // the original range never changes, no matter how `.current` is scaled
    expect(timeRange.matchesOriginal(0, 100)).toBe(true);
    expect(halved.matchesOriginal(0, 100)).toBe(true);

    // scaling is immutable -- the range it was called on is untouched
    expect(timeRange.current).toEqual({start: -50, end: 150});
});

test('successive scales compound multiplicatively', () => {
    // scaling twice by 2 (each relative to the then-current width) quadruples the distance from
    // the pivot -- exactly like two sequential d3-zoom wheel notches, each doubling the view
    const original = ContinuousAxisRange.from(0, 100);
    const scaledOnce = original.scale(2, 50);
    const scaledTwice = scaledOnce.scale(2, 50);
    expect(scaledTwice.current).toEqual({start: -150, end: 250});
    expect(scaledTwice.matchesOriginal(0, 100)).toBe(true);
});

test('translating a time-range', () => {
    const timeRange = ContinuousAxisRange.from(0, 100).translate(50);
    expect(timeRange.current).toEqual({start: 50, end: 150});
    expect(timeRange.matchesOriginal(0, 100)).toBe(true);
});

// `constrainedScale` deliberately clamps *inward* -- the opposite direction from
// `OrdinalAxisRange.constrainedScale`, which widens outward (see its own tests). These two tests
// pin down the continuous side of that intentional divergence so it isn't "fixed" into matching
// the ordinal side by mistake -- see the cross-referencing doc comments on both methods.
test('constrainedScale clamps a scaled range that exceeds the constraint back inside it', () => {
    const original = ContinuousAxisRange.from(0, 100);
    // scaling by 2 from the midpoint would produce {start: -50, end: 150} (see the plain `.scale`
    // test above) -- well outside the [0, 100] constraint, so the clamp narrows it back to fit
    const clamped = original.constrainedScale(2, 50, [0, 100]);
    expect(clamped.current).toEqual({start: 0, end: 100});
});

test('constrainedScale does not widen a scaled range that is already narrower than the constraint', () => {
    const original = ContinuousAxisRange.from(0, 100);
    // scaling by 0.5 from the midpoint produces {start: 25, end: 75} -- already inside the
    // [0, 100] constraint, so it must be left as-is, not widened out to fill the constraint
    // (that widening behavior belongs only to `OrdinalAxisRange.constrainedScale`)
    const unwidened = original.constrainedScale(0.5, 50, [0, 100]);
    expect(unwidened.current).toEqual({start: 25, end: 75});
});

test('scaling and translating', () => {
    const original = ContinuousAxisRange.from(0, 100);
    const scaled = original.scale(2, 50);
    const translated = scaled.translate(50);

    expect(translated.current).toEqual({start: 0, end: 200});

    // scaling again is relative to the translated range's own current width, and pivots around
    // the new value
    const rescaled = translated.scale(0.5, 100);
    expect(rescaled.current).toEqual({start: 50, end: 150});

    // the original interval, maintained by each new time-range, should never change
    expect(original.matchesOriginal(0, 100)).toEqual(true);
    expect(scaled.matchesOriginal(0, 100)).toEqual(true);
    expect(translated.matchesOriginal(0, 100)).toEqual(true);
    expect(rescaled.matchesOriginal(0, 100)).toEqual(true);
});
