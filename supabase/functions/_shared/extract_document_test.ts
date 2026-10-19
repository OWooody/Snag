import { assertEquals, assertRejects, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractDocumentText } from "../../../packages/react/src/extract-document.ts";

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function zip(entries: { name: string; data: Uint8Array; method?: number; raw?: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const method = entry.method ?? 0;
    const stored = entry.raw ?? entry.data;
    const local = new Uint8Array(30 + name.length + stored.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(8, method, true);
    view.setUint32(18, stored.length, true);
    view.setUint32(22, entry.data.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(stored, 30 + name.length);
    locals.push(local);
    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(20, stored.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }
  const directory = concat(centrals);
  const eocd = new Uint8Array(22);
  const end = new DataView(eocd.buffer);
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, directory.length, true);
  end.setUint32(16, offset, true);
  return concat([...locals, directory, eocd]);
}

async function deflateZlib(data: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const stream = new Blob([copy]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const stream = new Blob([copy]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function pdf(content: Uint8Array, streamDict = ""): Uint8Array {
  const encoder = new TextEncoder();
  const header = encoder.encode("%PDF-1.4\n");
  const objects = [
    encoder.encode("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"),
    encoder.encode("2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n"),
    encoder.encode(
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    ),
    concat([
      encoder.encode(`4 0 obj\n<< ${streamDict}/Length ${content.length} >>\nstream\n`),
      content,
      encoder.encode("\nendstream\nendobj\n"),
    ]),
    encoder.encode("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"),
  ];
  const starts: number[] = [];
  let cursor = header.length;
  for (const object of objects) {
    starts.push(cursor);
    cursor += object.length;
  }
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (const start of starts) xref += `${String(start).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`;
  return concat([header, ...objects, encoder.encode(xref)]);
}

function record(code: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + payload.length);
  const view = new DataView(out.buffer);
  view.setUint16(0, code, true);
  view.setUint16(2, payload.length, true);
  out.set(payload, 4);
  return out;
}

Deno.test("pdf text is extracted from a page content stream", async () => {
  const content = new TextEncoder().encode("BT /F1 12 Tf 72 100 Td (Hello from PDF) Tj ET");
  const text = await extractDocumentText(pdf(content), "pdf");
  assertEquals(text, "Hello from PDF");
});

Deno.test("pdf flate streams and unicode maps are decoded", async () => {
  const content = new TextEncoder().encode("BT /F1 12 Tf 72 80 Td <4869> Tj ET");
  const compressed = await deflateZlib(content);
  const cmap = new TextEncoder().encode("1 beginbfchar\n<48> <0048>\n<69> <0069>\nendbfchar");
  const bytes = pdfWithCmap(compressed, cmap);
  assertEquals(await extractDocumentText(bytes, "pdf"), "Hi");
});

Deno.test("pdfs that point at an earlier xref still yield their text", async () => {
  const content = new TextEncoder().encode("BT /F1 12 Tf 72 100 Td (Hello from PDF) Tj ET");
  const original = pdf(content);
  const latin = new TextDecoder("latin1").decode(original);
  const start = Number(/startxref\s+(\d+)/.exec(latin)?.[1]);
  const extra = new TextEncoder().encode(
    `xref\n0 0\ntrailer\n<< /Size 6 /Root 1 0 R /Prev ${start} >>\nstartxref\n${original.length}\n%%EOF\n`,
  );
  const wrapped = new Uint8Array(original.length + extra.length);
  wrapped.set(original, 0);
  wrapped.set(extra, original.length);
  assertEquals(await extractDocumentText(wrapped, "pdf"), "Hello from PDF");
});

Deno.test("password protected pdfs are rejected", async () => {
  const content = new TextEncoder().encode("BT (Secret) Tj ET");
  const bytes = pdf(content).slice();
  const marker = new TextEncoder().encode("/Root 1 0 R");
  const replacement = new TextEncoder().encode("/Root 1 0 R /Encrypt 9 0 R");
  const index = new TextDecoder("latin1").decode(bytes).indexOf("/Root 1 0 R");
  const next = new Uint8Array(bytes.length - marker.length + replacement.length);
  next.set(bytes.subarray(0, index), 0);
  next.set(replacement, index);
  next.set(bytes.subarray(index + marker.length), index + replacement.length);
  await assertRejects(() => extractDocumentText(next, "pdf"), Error, "password");
});

Deno.test("docx, xlsx, pptx, rtf, and odt text is extracted", async () => {
  const encoder = new TextEncoder();
  const docx = zip([{
    name: "word/document.xml",
    data: encoder.encode(
      `<w:document><w:body><w:p><w:r><w:t>Hello from Word</w:t></w:r></w:p><w:p><w:r><w:t>Second line</w:t></w:r></w:p></w:body></w:document>`,
    ),
  }]);
  assertEquals(await extractDocumentText(docx, "docx"), "Hello from Word\nSecond line");

  const xml = encoder.encode(
    `<w:document><w:body><w:p><w:t>Compressed</w:t></w:p></w:body></w:document>`,
  );
  const compressedDocx = zip([{
    name: "word/document.xml",
    data: xml,
    method: 8,
    raw: await deflateRaw(xml),
  }]);
  assertEquals(await extractDocumentText(compressedDocx, "docx"), "Compressed");

  const workbook = encoder.encode(
    `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  const rels = encoder.encode(
    `<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  );
  const shared = encoder.encode(`<sst><si><t>Item</t></si><si><t>Cost</t></si></sst>`);
  const sheet = encoder.encode(
    `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Paper</t></is></c><c r="B2"><v>12.5</v></c></row></sheetData></worksheet>`,
  );
  const xlsx = zip([
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: rels },
    { name: "xl/sharedStrings.xml", data: shared },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
  ]);
  assertEquals(await extractDocumentText(xlsx, "xlsx"), "## Budget\nItem\tCost\nPaper\t12.5");

  const slide = encoder.encode(`<p:sld><a:p><a:t>Title here</a:t></a:p><a:p><a:t>Body line</a:t></a:p></p:sld>`);
  const pptx = zip([{ name: "ppt/slides/slide1.xml", data: slide }]);
  assertEquals(await extractDocumentText(pptx, "pptx"), "## Slide 1\nTitle here\nBody line");

  assertEquals(
    await extractDocumentText(encoder.encode("{\\rtf1\\ansi Hello\\par World}"), "rtf"),
    "Hello\nWorld",
  );
  const odt = zip([{
    name: "content.xml",
    data: encoder.encode(`<office:document><text:p>Open line</text:p></office:document>`),
  }]);
  assertEquals(await extractDocumentText(odt, "odt"), "Open line");
});

Deno.test("legacy excel cells are extracted from a BIFF workbook", async () => {
  const bof = (kind: number) => {
    const payload = new Uint8Array(16);
    const view = new DataView(payload.buffer);
    view.setUint16(0, 0x0600, true);
    view.setUint16(2, kind, true);
    return record(0x0809, payload);
  };
  const bounds = new Uint8Array(8 + 5);
  bounds[6] = 5;
  bounds.set(new TextEncoder().encode("Sheet"), 8);
  const sst = new Uint8Array(8 + 3 + 5);
  const sstView = new DataView(sst.buffer);
  sstView.setUint32(0, 1, true);
  sstView.setUint32(4, 1, true);
  sstView.setUint16(8, 5, true);
  sst.set(new TextEncoder().encode("Hello"), 11);
  const label = new Uint8Array(10);
  const number = new Uint8Array(14);
  const numberView = new DataView(number.buffer);
  numberView.setUint16(2, 1, true);
  numberView.setFloat64(6, 12.5, true);
  const bytes = concat([
    bof(0x0005),
    record(0x0085, bounds),
    record(0x00fc, sst),
    record(0x000a, new Uint8Array()),
    bof(0x0010),
    record(0x00fd, label),
    record(0x0203, number),
    record(0x000a, new Uint8Array()),
  ]);
  assertStringIncludes(await extractDocumentText(bytes, "xls"), "Hello");
  assertStringIncludes(await extractDocumentText(bytes, "xls"), "12.5");
});

Deno.test("legacy word text is recovered from utf-16", async () => {
  const phrase = "Project brief for the homepage";
  const bytes = new Uint8Array(phrase.length * 2);
  for (let index = 0; index < phrase.length; index += 1) bytes[index * 2] = phrase.charCodeAt(index);
  assertEquals(await extractDocumentText(bytes, "doc"), phrase);
});

function pdfWithCmap(content: Uint8Array, cmap: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const header = encoder.encode("%PDF-1.4\n");
  const objects = [
    encoder.encode("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"),
    encoder.encode("2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n"),
    encoder.encode(
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    ),
    concat([
      encoder.encode(
        `4 0 obj\n<< /Filter /FlateDecode /Length ${content.length} >>\nstream\n`,
      ),
      content,
      encoder.encode("\nendstream\nendobj\n"),
    ]),
    encoder.encode("5 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /Helvetica /ToUnicode 6 0 R >>\nendobj\n"),
    concat([
      encoder.encode(`6 0 obj\n<< /Length ${cmap.length} >>\nstream\n`),
      cmap,
      encoder.encode("\nendstream\nendobj\n"),
    ]),
  ];
  const starts: number[] = [];
  let cursor = header.length;
  for (const object of objects) {
    starts.push(cursor);
    cursor += object.length;
  }
  let xref = "xref\n0 7\n0000000000 65535 f \n";
  for (const start of starts) xref += `${String(start).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`;
  return concat([header, ...objects, encoder.encode(xref)]);
}
