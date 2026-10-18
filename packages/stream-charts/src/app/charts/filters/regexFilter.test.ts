import {isSafeRegex, literalFilter, regexFilter} from "./regexFilter";

test('option should contain a valid regex', () => {
    expect(regexFilter("^[0-9]+$").succeeded).toEqual(true);
});

test('should allow progression of building regex', () => {
    let filter = regexFilter("^[0-9").map(regex => '100a200'.match(regex)!.map(t => t)).getOrUndefined();
    expect(filter).toBeUndefined();

    filter = regexFilter("^[0-9]+").map(regex => '100a200'.match(regex)!.map(t => t)).getOrUndefined();
    expect(filter).toEqual(['100']);
});

test('literalFilter should match text containing regex metacharacters literally', () => {
    const matched = literalFilter("a.b*c(1+2)").map(regex => regex.test("a.b*c(1+2)")).getOrElse(false);
    expect(matched).toEqual(true);

    // without escaping, "." and "*" would match unintended text -- confirm that does NOT happen
    const shouldNotMatch = literalFilter("a.b*c(1+2)").map(regex => regex.test("aXbbbbc(1+2)")).getOrElse(true);
    expect(shouldNotMatch).toEqual(false);
});

test('literalFilter should still succeed on plain text with no metacharacters', () => {
    expect(literalFilter("series-1").succeeded).toEqual(true);
});

// guards against a regression of H11: every plot tests `seriesFilter` against every series name
// on every redraw frame, so an unvetted catastrophic-backtracking pattern would freeze the whole
// render loop, not just one call -- see Chart.tsx's `safeSeriesFilter` for the other half of this
// fix (rejecting a pattern that bypasses `regexFilter` entirely, e.g. one built by hand and passed
// directly as the `seriesFilter` prop).
test('isSafeRegex should flag a classic catastrophic-backtracking pattern', () => {
    expect(isSafeRegex(/(a+)+$/)).toEqual(false);
});

test('isSafeRegex should accept an ordinary, non-catastrophic pattern', () => {
    expect(isSafeRegex(/^HC \d+$/)).toEqual(true);
});

test('regexFilter should reject a pattern that compiles fine but risks catastrophic backtracking', () => {
    const result = regexFilter("(a+)+$");
    expect(result.succeeded).toEqual(false);
});

test('regexFilter should still succeed for an ordinary pattern', () => {
    expect(regexFilter("^HC \\d+$").succeeded).toEqual(true);
});