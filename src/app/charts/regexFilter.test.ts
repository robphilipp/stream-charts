import {regexFilter} from "./regexFilter";

test('option should contain a valid regex', () => {
    expect(regexFilter("^[0-9]+$").isSome()).toEqual(true);
});

test('should allow progression of building regex', () => {
    let filter = regexFilter("^[0-9").map(regex => '100a200'.match(regex)!.map(t => t)).getOrUndefined();
    expect(filter).toBeUndefined();

    filter = regexFilter("^[0-9]+").map(regex => '100a200'.match(regex)!.map(t => t)).getOrUndefined();
    expect(filter).toEqual(['100']);
});