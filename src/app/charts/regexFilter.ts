import {Option} from "prelude-ts";

/**
 * Wraps the creation of the regex in a try/catch and returns the regex, wrapped in an option,
 * when it is valid. This can be used, for example, in a text field where the user types a regex.
 * @param {string} regexString The string representation of the regex
 * @return {Option<RegExp>} The regular expression (`RegExp`) wrapped in an option. If the regexp
 * is invalid, then the option is none.
 */
export function regexFilter(regexString: string): Option<RegExp> {
    let regex;
    try {regex = new RegExp(regexString)} catch(error) {}
    return regex ? Option.of<RegExp>(regex) : Option.none<RegExp>();
}