import {failureResult, Result, successResult} from "result-fn";

/**
 * Wraps the creation of the regex in a try/catch and returns the regex, wrapped in an option,
 * when it is valid. This can be used, for example, in a text field where the user types a regex.
 * @param regexString The string representation of the regex
 * @return The regular expression (`RegExp`) wrapped in an option. If the regexp
 * is invalid, then the option is none.
 */
export function regexFilter(regexString: string): Result<RegExp, string> {
    try {
        const regex = new RegExp(regexString)
        return successResult(regex)
    } catch(error) {
        return failureResult(`Unable to compile the regex expression; regex_expression: ${regexString}`)
    }
}
