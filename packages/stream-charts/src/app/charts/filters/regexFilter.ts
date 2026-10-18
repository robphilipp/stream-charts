import {failureResult, type Result, successResult} from "result-fn";
import safeRegex from "safe-regex";

/**
 * Checks whether a regex is reasonably safe from catastrophic (exponential-time) backtracking --
 * e.g. `/(a+)+$/`, the classic case that freezes on a long non-matching input. Every plot
 * component tests a compiled `seriesFilter` regex against every series name on every redraw
 * frame (not just once), so an unvetted pattern from a free-text filter field can hang the whole
 * render loop, not just one call. Delegates to the `safe-regex` package, which walks the regex's
 * actual parsed structure (via `regexp-tree`) rather than pattern-matching its source string, so
 * it catches more than a hand-rolled "look for nested quantifiers" check would.
 * @param pattern The regex (or its string source) to check
 * @return `true` if the pattern is reasonably safe to run against arbitrary input; `false` if it
 * risks catastrophic backtracking
 */
export function isSafeRegex(pattern: RegExp | string): boolean {
    return safeRegex(pattern)
}

/**
 * Wraps the creation of the regex in a try/catch and returns the regex, wrapped in a `Result`,
 * when it is valid. This can be used, for example, in a text field where the user types a regex.
 * Also rejects a pattern that compiles fine but risks catastrophic backtracking (see
 * {@link isSafeRegex}) -- a syntax error and an exponential-time pattern are both "can't use this"
 * outcomes from the caller's point of view, so both are reported the same way.
 * @param regexString The string representation of the regex
 * @return The regular expression (`RegExp`) wrapped in a successful `Result`. If the regex is
 * invalid, or is unsafe, then a failed `Result` holding a message that says why.
 */
export function regexFilter(regexString: string): Result<RegExp, string> {
    try {
        const regex = new RegExp(regexString)
        if (!isSafeRegex(regex)) {
            return failureResult(
                `Refusing to use a regex that risks catastrophic backtracking; regex_expression: ${regexString}`
            )
        }
        return successResult(regex)
    } catch(error) {
        return failureResult(
            `Unable to compile the regex expression; regex_expression: ${regexString}; error: ${error}`
        )
    }
}

/**
 * Builds a regex that matches `text` literally, for callers (e.g. a series-name filter input)
 * who want to search for plain text without regex metacharacters (`.`, `*`, `+`, `(`, etc.) in it
 * being given unintended regex semantics. Escapes those metacharacters before handing the result
 * to {@link regexFilter}, so it shares the same `Result`-wrapped, never-throws contract.
 * @param text The literal text to match
 * @return The regular expression (`RegExp`) matching `text` literally, wrapped in a `Result` (see
 * {@link regexFilter})
 */
export function literalFilter(text: string): Result<RegExp, string> {
    return regexFilter(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
}
