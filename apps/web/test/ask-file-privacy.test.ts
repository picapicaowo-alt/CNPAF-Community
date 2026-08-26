import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { extractAskFileTextForPrivacy } from "../src/lib/ask-collect";

test("conversation text attachments are available to the server privacy scan", async () => {
  assert.equal(
    await extractAskFileTextForPrivacy("notes.txt", "text/plain", Buffer.from("approved evidence")),
    "approved evidence",
  );
});

test("xlsx cell text is extracted before an attachment can reach OpenAI", async () => {
  const workbook = zipSync({
    "xl/sharedStrings.xml": strToU8("<sst><si><t>Community finding</t></si></sst>"),
    "xl/worksheets/sheet1.xml": strToU8("<worksheet><sheetData><row><c><v>42</v></c></row></sheetData></worksheet>"),
  });
  const extracted = await extractAskFileTextForPrivacy(
    "evidence.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    Buffer.from(workbook),
  );

  assert.match(extracted, /Community finding/);
  assert.match(extracted, /42/);
});

test("legacy Office files fail closed when they cannot be privacy-screened", async () => {
  await assert.rejects(
    () => extractAskFileTextForPrivacy("legacy.doc", "application/msword", Buffer.from("binary")),
    /convert it to \.docx or \.xlsx/,
  );
});
