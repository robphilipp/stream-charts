import {TimeRange} from "./timeRange";


test('creates a time-range', () => {
    const timeRange = TimeRange(10, 100);
    expect(timeRange.start === 10);
    expect(timeRange.end === 100);
    expect(timeRange.scaleFactor === 1);
});

test('scaling a time-range', () => {
    const timeRange = TimeRange(0, 100).scale(2, 50);
    expect(timeRange.start === -50);
    expect(timeRange.end === 150);
    expect(timeRange.scaleFactor === 2);

    // the inverse of the scale should return that the original time-range
    const original = timeRange.scale(0.5, 50);
    expect(original.start === 0);
    expect(original.end === 100);
    expect(original.scaleFactor === 1);
    // the original shouldn't be changed
    expect(timeRange.start === -50);
    expect(timeRange.end === 150);
    expect(timeRange.scaleFactor === 2);
});

test('translating a time-range', () => {
    const timeRange = TimeRange(0, 100).translate(50);
    expect(timeRange.start === 50);
    expect(timeRange.end === 150);
    expect(timeRange.scaleFactor === 1);
});

test('scaling and translating', () => {
    const original = TimeRange(0, 100);
    const scaled = original.scale(2, 50);
    const translated = scaled.translate(50);

    expect(translated.start === 0);
    expect(translated.end === 200);
    expect(translated.scaleFactor === 2);

    const rescaled = translated.scale(0.5, 100);
    expect(rescaled.start === 0);
    expect(rescaled.end === 100);
    expect(rescaled.scaleFactor === 1);

    expect(original.matchesOriginal(0, 100));
    expect(scaled.matchesOriginal(0, 100));
    expect(translated.matchesOriginal(0, 100));
    expect(rescaled.matchesOriginal(0, 100));
});