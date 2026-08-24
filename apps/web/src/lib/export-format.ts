function csvCell(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(rows: Array<Record<string, unknown>>) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\r\n");
}

function ascii(value: string) {
  return [...value].map((character) => {
    const code = character.codePointAt(0)!;
    return code >= 32 && code <= 126 ? character : `\\u${code.toString(16).padStart(4, "0")}`;
  }).join("");
}

function pdfEscape(value: string) {
  return ascii(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

// Dependency-free, deterministic PDF for one-record human-readable downloads.
// Non-Latin characters are preserved as visible Unicode escapes so the file is
// portable without relying on deployment-host fonts.
export function toSimplePdf(title: string, value: unknown) {
  const rawLines = [title, "", ...JSON.stringify(value, null, 2).split("\n")];
  const lines = rawLines.flatMap((line) => {
    if (line.length <= 92) return [line];
    const chunks = [];
    for (let index = 0; index < line.length; index += 92) chunks.push(line.slice(index, index + 92));
    return chunks;
  }).slice(0, 62);
  const stream = [
    "BT",
    "/F1 9 Tf",
    "45 752 Td",
    ...lines.flatMap((line, index) => index === 0 ? [`(${pdfEscape(line)}) Tj`] : ["0 -11 Td", `(${pdfEscape(line)}) Tj`]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}
