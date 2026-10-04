// Convierte un PDF en renglones de texto con pdf.js. pdf.js se carga solo al
// importar un PDF para no engordar el resto de la app.

export interface PositionedText {
  str: string;
  /** Matriz de pdf.js: [4] = x, [5] = y (desde abajo). */
  transform: number[];
}

/** Agrupa los fragmentos de una página en renglones, de arriba a abajo y de izquierda a derecha. */
export function textItemsToLines(items: PositionedText[], tolerance = 2): string[] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.transform[5] - a.transform[5]);
  const rows: PositionedText[][] = [];
  for (const item of sorted) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0].transform[5] - item.transform[5]) <= tolerance) row.push(item);
    else rows.push([item]);
  }
  return rows.map((row) =>
    row
      .sort((a, b) => a.transform[4] - b.transform[4])
      .map((i) => i.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export class PdfPasswordError extends Error {
  constructor(readonly incorrect: boolean) {
    super(incorrect ? "La contraseña del PDF no es correcta" : "El PDF está protegido con contraseña");
  }
}

export async function pdfToLines(data: ArrayBuffer, password?: string): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  }
  const task = pdfjs.getDocument({ data, password });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    await task.destroy();
    if ((err as Error).name === "PasswordException") {
      throw new PdfPasswordError((err as { code?: number }).code === pdfjs.PasswordResponses.INCORRECT_PASSWORD);
    }
    throw err;
  }
  try {
    const lines: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      lines.push(...textItemsToLines(content.items.flatMap((i) => ("str" in i ? [i] : []))));
    }
    return lines;
  } finally {
    await task.destroy();
  }
}
