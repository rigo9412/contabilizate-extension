// Detecta de qué banco es un estado de cuenta y lo pasa al lector que
// corresponde. Cada lector recibe los renglones de texto de pdf-text.ts.
import { isBbvaStatement, parseBbvaStatement } from "./bbva-statement";
import { isNuStatement, parseNuStatement } from "./nu-statement";
import type { StatementParseResult } from "./statement-common";

const PARSERS = [
  { detect: isBbvaStatement, parse: parseBbvaStatement },
  { detect: isNuStatement, parse: parseNuStatement },
];

export function parseStatement(lines: string[]): StatementParseResult {
  const parser = PARSERS.find((p) => p.detect(lines));
  if (!parser) {
    throw new Error("No reconocemos este PDF. Por ahora se pueden importar estados de cuenta de tarjeta BBVA y Nu");
  }
  return parser.parse(lines);
}
