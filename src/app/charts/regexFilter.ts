import {Option} from "prelude-ts";

export function regexFilter(regexString: string): Option<RegExp> {
    let regex;
    try {regex = new RegExp(regexString)} catch(error) {}
    return regex ? Option.of<RegExp>(regex) : Option.none<RegExp>();
}