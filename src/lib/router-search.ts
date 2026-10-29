import { parseSearchWith, stringifySearchWith } from '@tanstack/react-router'

const stringifySearchDefault = stringifySearchWith(JSON.stringify)

/** Decodes characters that are safe in query values, so URLs stay readable. */
function makeSearchPretty(searchString: string): string {
  return searchString
    .replaceAll('%22', '"')
    .replaceAll('%2C', ',')
    .replaceAll('%27', "'")
    .replaceAll('%28', '(')
    .replaceAll('%29', ')')
    .replaceAll('%3A', ':')
    .replaceAll('%3B', ';')
    .replaceAll('%5B', '[')
    .replaceAll('%5D', ']')
    .replaceAll('%7B', '{')
    .replaceAll('%7D', '}')
    .replaceAll('%2F', '/')
}

export const routerSearch = {
  parse: parseSearchWith(JSON.parse),
  stringify: (search: Record<string, unknown>) => makeSearchPretty(stringifySearchDefault(search)),
}
