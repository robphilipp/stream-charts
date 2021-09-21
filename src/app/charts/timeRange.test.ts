import {continuousAxisRangeFor} from "./continuousAxisRangeFor";


test('creates a time-range', () => {
    const timeRange = continuousAxisRangeFor(10, 100);
    expect(timeRange.start).toBe(10);
    expect(timeRange.end).toBe(100);
    expect(timeRange.scaleFactor).toBe(1);
});

test('scaling a time-range', () => {
    const timeRange = continuousAxisRangeFor(0, 100).scale(2, 50);
    // the midpoint must remain at 50, so the new range will be 50 - 2 * (50 - 0) to
    // 50 + 2 * (100 - 50) => (-50, 150)
    expect(timeRange.start).toBe(-50);
    expect(timeRange.end).toBe(150);
    expect(timeRange.scaleFactor).toBe(2);

    // setting the scale factor back to 1, from its current value of 2, should
    // return the original time-range (this may be a bit unintuitive, because it
    // may seem like we should pass in a factor of 0.5 to shrink the scale back, but
    // that would mean the new interval is has a scale factor 4 times smaller.)
    // this behaviour is implemented so that zooming in at out from a point seems
    // natural to the user.
    const original = timeRange.scale(1, 50);
    expect(original.start).toBe(0);
    expect(original.end).toBe(100);
    expect(original.scaleFactor).toBe(1);
    // the original shouldn't be changed
    expect(timeRange.start).toBe(-50);
    expect(timeRange.end).toBe(150);
    expect(timeRange.scaleFactor).toBe(2);
});

test('translating a time-range', () => {
    const timeRange = continuousAxisRangeFor(0, 100).translate(50);
    expect(timeRange.start).toBe(50);
    expect(timeRange.end).toBe(150);
    expect(timeRange.scaleFactor).toBe(1);
});

test('scaling and translating', () => {
    const original = continuousAxisRangeFor(0, 100);
    const scaled = original.scale(2, 50);
    const translated = scaled.translate(50);

    expect(translated.start).toBe(0);
    expect(translated.end).toBe(200);
    expect(translated.scaleFactor).toBe(2);

    // after the translation, the time-range should shrink around the new time
    const rescaled = translated.scale(1, 100);
    expect(rescaled.start).toBe(50);
    expect(rescaled.end).toBe(150);
    expect(rescaled.scaleFactor).toBe(1);

    // the original interval, maintained by each new time-range, should not change
    expect(original.matchesOriginal(0, 100)).toEqual(true);
    expect(scaled.matchesOriginal(0, 100)).toEqual(true);
    expect(translated.matchesOriginal(0, 100)).toEqual(true);
    expect(rescaled.matchesOriginal(0, 100)).toEqual(true);
});