import {extentWith, grownDomain} from "./autoScale";

describe('grownDomain', () => {
    it("leaves the domain as it is when there's no data", () => {
        expect(grownDomain([0, 100], undefined, -Infinity, Infinity)).toEqual([0, 100])
    })

    it('leaves the domain as it is when the data is within it', () => {
        expect(grownDomain([0, 100], [10, 90], -Infinity, Infinity)).toEqual([0, 100])
    })

    it('grows the domain to fit data beyond it, on either side', () => {
        expect(grownDomain([0, 100], [10, 150], -Infinity, Infinity)).toEqual([0, 150])
        expect(grownDomain([0, 100], [-20, 90], -Infinity, Infinity)).toEqual([-20, 100])
        expect(grownDomain([0, 100], [-20, 150], -Infinity, Infinity)).toEqual([-20, 150])
    })

    it("doesn't grow past the limits", () => {
        expect(grownDomain([0, 100], [-50, 150], -10, 120)).toEqual([-10, 120])
    })

    it('never shrinks the domain, even when it already reaches past a limit', () => {
        // the domain's own max (100) is past the limit (80), so data beyond it leaves it at 100
        expect(grownDomain([0, 100], [10, 150], -Infinity, 80)).toEqual([0, 100])
        expect(grownDomain([-50, 100], [-80, 90], -20, Infinity)).toEqual([-50, 100])
    })
})

describe('extentWith', () => {
    it('starts an extent', () => {
        expect(extentWith(undefined, 5)).toEqual([5, 5])
    })

    it('extends an extent to include a value', () => {
        expect(extentWith([0, 10], 15)).toEqual([0, 15])
        expect(extentWith([0, 10], -5)).toEqual([-5, 10])
        expect(extentWith([0, 10], 5)).toEqual([0, 10])
    })
})
