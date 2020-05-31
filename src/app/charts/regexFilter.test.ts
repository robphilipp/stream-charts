import {regexFilter} from "./regexFilter";

test('option should contain a valid regex', () => {
    expect(regexFilter("^[0-9]+$").isSome());
});

test('should allow progression of building regex', () => {
    expect(
        regexFilter("^[0-9").map(regex => '100a200'.match(regex)!.map(t => t)).getOrUndefined() === undefined
    );
    expect(
        regexFilter("^[0-9]+").map(regex => '100a200'.match(regex)!.map(t => t)).getOrUndefined() === ['100']
    );
});