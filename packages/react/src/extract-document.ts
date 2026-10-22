/**
 * Read PDF, Word, Excel, PowerPoint, and similar files as plain text.
 *
 * The agent API accepts images, not these documents, so the text is what
 * gets inlined into the prompt. Scanned pages with no text layer come back empty.
 */

const WIN_1252: Record<number, string> = {
  0x80: "\u20ac",
  0x82: "\u201a",
  0x83: "\u0192",
  0x84: "\u201e",
  0x85: "\u2026",
  0x86: "\u2020",
  0x87: "\u2021",
  0x88: "\u02c6",
  0x89: "\u2030",
  0x8a: "\u0160",
  0x8b: "\u2039",
  0x8c: "\u0152",
  0x8e: "\u017d",
  0x91: "\u2018",
  0x92: "\u2019",
  0x93: "\u201c",
  0x94: "\u201d",
  0x95: "\u2022",
  0x96: "\u2013",
  0x97: "\u2014",
  0x98: "\u02dc",
  0x99: "\u2122",
  0x9a: "\u0161",
  0x9b: "\u203a",
  0x9c: "\u0153",
  0x9e: "\u017e",
  0x9f: "\u0178",
};

export async function extractDocumentText(
  bytes: Uint8Array,
  extension: string,
): Promise<string> {
  const ext = extension.toLowerCase();
  switch (ext) {
    case "pdf":
      return finish(await extractPdf(bytes));
    case "docx":
    case "docm":
      return finish(await extractDocx(bytes));
    case "xlsx":
    case "xlsm":
      return finish(await extractXlsx(bytes));
    case "pptx":
    case "pptm":
      return finish(await extractPptx(bytes));
    case "rtf":
      return finish(extractRtf(bytes));
    case "odt":
    case "ods":
    case "odp":
      return finish(await extractOdf(bytes, ext));
    case "doc":
    case "ppt":
      return finish(extractUtf16Runs(bytes));
    case "xls":
      return finish(await extractXls(bytes));
    default:
      throw new Error("unsupported");
  }
}

function finish(text: string): string {
  const cleaned = cleanText(text);
  if (!cleaned) throw new Error("empty");
  return cleaned;
}

function cleanText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)));
}

function winAnsi(code: number): string {
  if (code === 0x0a || code === 0x0d || code === 0x09) return " ";
  return WIN_1252[code] ?? (code >= 32 && code !== 127 ? String.fromCharCode(code) : "");
}

async function inflate(data: Uint8Array, format: "deflate" | "deflate-raw"): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("unreadable");
  }
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function latin1(bytes: Uint8Array): string {
  let out = "";
  const size = 8192;
  for (let offset = 0; offset < bytes.length; offset += size) {
    out += String.fromCharCode(...bytes.subarray(offset, offset + size));
  }
  return out;
}

async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  if (bytes.length < 22) throw new Error("unreadable");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const earliest = Math.max(0, bytes.length - 22 - 65535);
  for (let index = bytes.length - 22; index >= earliest; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error("unreadable");
  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const files = new Map<string, Uint8Array>();
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) break;
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decodeUtf8(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!name || name.endsWith("/") || localOffset + 30 > bytes.length) continue;
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) files.set(name, compressed);
    else if (method === 8) files.set(name, await inflate(compressed, "deflate-raw"));
  }
  return files;
}

function docxXmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g, (_, text: string) => decodeXml(text))
    .replace(/<[^>]+>/g, "");
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  const files = await unzip(bytes);
  const names = [...files.keys()]
    .filter((name) => /word\/(document|header\d+|footer\d+)\.xml$/.test(name))
    .sort((left, right) => {
      if (left.endsWith("document.xml")) return -1;
      if (right.endsWith("document.xml")) return 1;
      return left.localeCompare(right);
    });
  if (!names.some((name) => name.endsWith("document.xml"))) throw new Error("unreadable");
  return names.map((name) => docxXmlToText(decodeUtf8(files.get(name)!))).join("\n\n");
}

function tagAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:.-]+)="([^"]*)"/g)) {
    attrs[match[1]] = decodeXml(match[2]);
  }
  return attrs;
}

function sharedStrings(xml: string): string[] {
  return xml.split(/<si\b[^>]*>/).slice(1).map((item) =>
    [...item.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join("")
  );
}

function columnIndex(cell: string): number {
  const letters = /^[A-Z]+/i.exec(cell)?.[0] ?? "A";
  let index = 0;
  for (const char of letters.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

function cellValue(openTag: string, inner: string, shared: string[]): string {
  const attrs = tagAttrs(openTag);
  if (attrs.t === "s") {
    const value = /<v>([\s\S]*?)<\/v>/.exec(inner);
    return shared[Number(value?.[1] ?? -1)] ?? "";
  }
  if (attrs.t === "inlineStr") {
    return [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((match) => decodeXml(match[1]))
      .join("");
  }
  if (attrs.t === "b") {
    const value = /<v>([\s\S]*?)<\/v>/.exec(inner);
    return value?.[1] === "1" ? "TRUE" : "FALSE";
  }
  const value = /<v>([\s\S]*?)<\/v>/.exec(inner);
  return value ? decodeXml(value[1]) : "";
}

function sheetToText(xml: string, shared: string[]): string {
  const lines: string[] = [];
  for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: { column: number; value: string }[] = [];
    for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = tagAttrs(`<c${cell[1]}>`);
      cells.push({
        column: columnIndex(attrs.r ?? "A"),
        value: cell[2] === undefined ? "" : cellValue(`<c${cell[1]}>`, cell[2], shared),
      });
    }
    if (cells.length === 0) continue;
    const width = Math.max(...cells.map((cell) => cell.column)) + 1;
    const line = Array.from({ length: width }, () => "");
    for (const cell of cells) line[cell.column] = cell.value;
    lines.push(line.join("\t").replace(/\t+$/, ""));
  }
  return lines.filter((line) => line.trim()).join("\n");
}

async function extractXlsx(bytes: Uint8Array): Promise<string> {
  const files = await unzip(bytes);
  const workbook = files.get("xl/workbook.xml");
  if (!workbook) throw new Error("unreadable");
  const workbookXml = decodeUtf8(workbook);
  const relsXml = decodeUtf8(files.get("xl/_rels/workbook.xml.rels") ?? new Uint8Array());
  const rels = new Map<string, string>();
  for (const tag of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const attrs = tagAttrs(tag[0]);
    if (attrs.Id && attrs.Target) rels.set(attrs.Id, attrs.Target.replace(/^\/?xl\//, ""));
  }
  const shared = sharedStrings(decodeUtf8(files.get("xl/sharedStrings.xml") ?? new Uint8Array()));
  const sections: string[] = [];
  for (const tag of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const attrs = tagAttrs(tag[0]);
    const target = rels.get(attrs["r:id"] ?? "");
    if (!target) continue;
    const sheet = files.get(`xl/${target}`) ?? files.get(target);
    if (!sheet) continue;
    const text = sheetToText(decodeUtf8(sheet), shared);
    if (text) sections.push(`## ${attrs.name || "Sheet"}\n${text}`);
  }
  return sections.join("\n\n");
}

async function extractPptx(bytes: Uint8Array): Promise<string> {
  const files = await unzip(bytes);
  const slides = [...files.keys()]
    .filter((name) => /ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => {
      const leftNumber = Number(/slide(\d+)/.exec(left)?.[1] ?? 0);
      const rightNumber = Number(/slide(\d+)/.exec(right)?.[1] ?? 0);
      return leftNumber - rightNumber;
    });
  if (slides.length === 0) throw new Error("unreadable");
  return slides
    .map((name, index) => {
      const xml = decodeUtf8(files.get(name)!);
      const lines = xml
        .split(/<\/a:p>/)
        .map((paragraph) =>
          [...paragraph.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)]
            .map((match) => decodeXml(match[1]))
            .join(""),
        )
        .filter((line) => line.trim());
      return lines.length > 0 ? `## Slide ${index + 1}\n${lines.join("\n")}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

async function extractOdf(bytes: Uint8Array, extension: string): Promise<string> {
  const files = await unzip(bytes);
  const content = files.get("content.xml");
  if (!content) throw new Error("unreadable");
  const xml = decodeUtf8(content);
  if (extension === "ods") {
    const tables: string[] = [];
    for (const table of xml.matchAll(/<table:table\b([^>]*)>([\s\S]*?)<\/table:table>/g)) {
      const name = tagAttrs(table[1])["table:name"] || "Sheet";
      const rows: string[] = [];
      for (const row of table[2].matchAll(/<table:table-row\b[^>]*>([\s\S]*?)<\/table:table-row>/g)) {
        const cells = [...row[1].matchAll(/<table:table-cell\b[^>]*>([\s\S]*?)<\/table:table-cell>/g)]
          .map((cell) =>
            [...cell[1].matchAll(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g)]
              .map((paragraph) => decodeXml(paragraph[1].replace(/<[^>]+>/g, "")))
              .join(" "),
          );
        if (cells.some((cell) => cell.trim())) rows.push(cells.join("\t"));
      }
      if (rows.length > 0) tables.push(`## ${name}\n${rows.join("\n")}`);
    }
    return tables.join("\n\n");
  }
  return [...xml.matchAll(/<text:(?:p|h)\b[^>]*>([\s\S]*?)<\/text:(?:p|h)>/g)]
    .map((match) => decodeXml(match[1].replace(/<[^>]+>/g, "")))
    .join("\n");
}

function extractRtf(bytes: Uint8Array): string {
  const source = latin1(bytes);
  if (!source.startsWith("{\\rtf")) throw new Error("unreadable");
  let output = "";
  let index = 1;
  const skipWords = new Set([
    "fonttbl",
    "colortbl",
    "stylesheet",
    "info",
    "pict",
    "header",
    "footer",
    "headerl",
    "headerr",
    "footerl",
    "footerr",
    "stylesheet",
  ]);
  const readGroup = (skip: boolean) => {
    while (index < source.length) {
      const char = source[index];
      if (char === "{") {
        index += 1;
        readGroup(skip);
        continue;
      }
      if (char === "}") {
        index += 1;
        return;
      }
      if (char === "\\") {
        index += 1;
        const next = source[index];
        if (next === "\\" || next === "{" || next === "}") {
          if (!skip) output += next;
          index += 1;
          continue;
        }
        if (next === "'") {
          const hex = source.slice(index + 1, index + 3);
          index += 3;
          if (!skip) output += winAnsi(parseInt(hex, 16));
          continue;
        }
        if (next === "u") {
          index += 1;
          let sign = 1;
          if (source[index] === "-") {
            sign = -1;
            index += 1;
          }
          let digits = "";
          while (index < source.length && source[index] >= "0" && source[index] <= "9") {
            digits += source[index];
            index += 1;
          }
          if (source[index] === "?" || source[index] === " ") index += 1;
          if (!skip && digits) {
            let code = sign * Number(digits);
            if (code < 0) code += 65536;
            output += String.fromCharCode(code);
          }
          continue;
        }
        if (next === "*") {
          index += 1;
          skip = true;
          continue;
        }
        let word = "";
        while (index < source.length && /[a-zA-Z]/.test(source[index])) {
          word += source[index];
          index += 1;
        }
        if (source[index] === "-") index += 1;
        while (index < source.length && source[index] >= "0" && source[index] <= "9") index += 1;
        if (source[index] === " ") index += 1;
        if (skipWords.has(word)) skip = true;
        else if (!skip && (word === "par" || word === "line")) output += "\n";
        else if (!skip && word === "tab") output += "\t";
        continue;
      }
      if (char !== "\n" && char !== "\r" && !skip) output += char;
      index += 1;
    }
  };
  readGroup(false);
  return output;
}

function extractUtf16Runs(bytes: Uint8Array): string {
  const collect = (start: number): string[] => {
    const runs: string[] = [];
    let current = "";
    for (let index = start; index + 1 < bytes.length; index += 2) {
      const code = bytes[index] | (bytes[index + 1] << 8);
      const printable = code === 9 || code === 10 || code === 13 || (code >= 32 && code < 0xfffe && code !== 127);
      if (printable) current += code === 13 ? "\n" : String.fromCharCode(code);
      else {
        if (current.trim().length >= 8) runs.push(current.trim());
        current = "";
      }
    }
    if (current.trim().length >= 8) runs.push(current.trim());
    return runs;
  };
  const textAt = (start: number) => [...new Set(collect(start))].join("\n");
  const even = textAt(0);
  const odd = textAt(1);
  const score = (text: string) => (text.match(/[A-Za-z0-9]/g) ?? []).length;
  return score(odd) > score(even) ? odd : even;
}

function isOle(bytes: Uint8Array): boolean {
  return bytes.length > 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

function oleStream(bytes: Uint8Array, names: string[]): Uint8Array | null {
  if (bytes.length < 512 || !isOle(bytes)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorSize = 1 << view.getUint16(0x1e, true);
  const directoryStart = view.getUint32(0x30, true);
  const cutoff = view.getUint32(0x38, true);
  const fat: number[] = [];
  for (let index = 0; index < 109; index += 1) {
    const sector = view.getUint32(0x4c + index * 4, true);
    if (sector >= 0xfffffffe) break;
    const offset = (sector + 1) * sectorSize;
    for (let cursor = offset; cursor + 4 <= offset + sectorSize && cursor + 4 <= bytes.length; cursor += 4) {
      fat.push(view.getUint32(cursor, true));
    }
  }
  const readChain = (start: number, size: number): Uint8Array => {
    const parts: Uint8Array[] = [];
    let sector = start;
    const seen = new Set<number>();
    while (sector < 0xfffffffa && !seen.has(sector)) {
      seen.add(sector);
      const offset = (sector + 1) * sectorSize;
      parts.push(bytes.subarray(offset, Math.min(offset + sectorSize, bytes.length)));
      sector = fat[sector] ?? 0xfffffffe;
    }
    return concat(parts).subarray(0, size);
  };
  const directory = readChain(directoryStart, sectorSize * 4);
  const directoryView = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
  let rootStart = 0xfffffffe;
  let rootSize = 0;
  const streams = new Map<string, { start: number; size: number }>();
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const nameLength = directoryView.getUint16(offset + 64, true);
    const type = directory[offset + 66];
    const start = directoryView.getUint32(offset + 116, true);
    const size = directoryView.getUint32(offset + 120, true);
    const name = decodeUtf8(utf16ToBytes(directory.subarray(offset, offset + Math.max(0, nameLength - 2))));
    if (type === 5) {
      rootStart = start;
      rootSize = size;
    } else if (type === 2 && name) {
      streams.set(name, { start, size });
    }
  }
  const wanted = names.map((name) => streams.get(name)).find((stream) => stream);
  if (!wanted) return null;
  if (wanted.size >= cutoff) return readChain(wanted.start, wanted.size);
  const mini = readChain(rootStart, rootSize);
  const miniSize = 1 << view.getUint16(0x20, true);
  const miniFatStart = view.getUint32(0x3c, true);
  const miniFat = readChain(miniFatStart, sectorSize * 8);
  const miniView = new DataView(miniFat.buffer, miniFat.byteOffset, miniFat.byteLength);
  const parts: Uint8Array[] = [];
  let sector = wanted.start;
  const seen = new Set<number>();
  while (sector < 0xfffffffa && !seen.has(sector) && parts.length * miniSize < wanted.size) {
    seen.add(sector);
    parts.push(mini.subarray(sector * miniSize, sector * miniSize + miniSize));
    sector = miniView.getUint32(sector * 4, true);
  }
  return concat(parts).subarray(0, wanted.size);
}

function utf16ToBytes(utf16: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.floor(utf16.length / 2));
  for (let index = 0; index < out.length; index += 1) out[index] = utf16[index * 2];
  return out;
}

async function extractXls(bytes: Uint8Array): Promise<string> {
  const workbook = isOle(bytes) ? oleStream(bytes, ["Workbook", "Book"]) : bytes;
  if (!workbook) throw new Error("unreadable");
  const text = biffText(workbook);
  if (text.trim()) return text;
  return extractUtf16Runs(workbook);
}

function biffText(data: Uint8Array): string {
  const sheetNames: string[] = [];
  const shared: string[] = [];
  const sections: string[] = [];
  let rows = new Map<number, Map<number, string>>();
  let sheetIndex = -1;
  let sstParts: Uint8Array[] | null = null;

  const setCell = (row: number, column: number, value: string) => {
    const line = rows.get(row) ?? new Map<number, string>();
    line.set(column, value);
    rows.set(row, line);
  };
  const flush = () => {
    if (sheetIndex < 0 || rows.size === 0) {
      rows = new Map();
      return;
    }
    const lines = [...rows.keys()]
      .sort((left, right) => left - right)
      .map((row) => {
        const columns = rows.get(row)!;
        const width = Math.max(...columns.keys()) + 1;
        return Array.from({ length: width }, (_, column) => columns.get(column) ?? "")
          .join("\t")
          .replace(/\t+$/, "");
      })
      .filter((line) => line.trim());
    if (lines.length > 0) {
      sections.push(`## ${sheetNames[sheetIndex] || `Sheet ${sheetIndex + 1}`}\n${lines.join("\n")}`);
    }
    rows = new Map();
  };
  const takeSst = () => {
    if (!sstParts) return;
    parseSst(concat(sstParts), shared);
    sstParts = null;
  };

  let offset = 0;
  while (offset + 4 <= data.length) {
    const code = data[offset] | (data[offset + 1] << 8);
    const length = data[offset + 2] | (data[offset + 3] << 8);
    const payload = data.subarray(offset + 4, offset + 4 + length);
    offset += 4 + length;
    if (code === 0x003c && sstParts) {
      sstParts.push(payload);
      continue;
    }
    takeSst();
    if (code === 0x00fc) {
      sstParts = [payload];
    } else if (code === 0x0809 && payload.length >= 4) {
      const kind = payload[2] | (payload[3] << 8);
      if (kind === 0x0010) {
        flush();
        sheetIndex += 1;
      }
    } else if (code === 0x0085 && payload.length >= 8) {
      sheetNames.push(decodeShortString(payload, 6));
    } else if (code === 0x00fd && payload.length >= 10) {
      const row = payload[0] | (payload[1] << 8);
      const column = payload[2] | (payload[3] << 8);
      const index =
        payload[6] | (payload[7] << 8) | (payload[8] << 16) | (payload[9] << 24);
      setCell(row, column, shared[index] ?? "");
    } else if (code === 0x0203 && payload.length >= 14) {
      const row = payload[0] | (payload[1] << 8);
      const column = payload[2] | (payload[3] << 8);
      const value = new DataView(payload.buffer, payload.byteOffset + 6, 8).getFloat64(0, true);
      setCell(row, column, formatNumber(value));
    } else if (code === 0x027e && payload.length >= 10) {
      const row = payload[0] | (payload[1] << 8);
      const column = payload[2] | (payload[3] << 8);
      const rk = new DataView(payload.buffer, payload.byteOffset + 6, 4).getUint32(0, true);
      setCell(row, column, formatNumber(decodeRk(rk)));
    } else if (code === 0x0204 && payload.length >= 8) {
      setCell(
        payload[0] | (payload[1] << 8),
        payload[2] | (payload[3] << 8),
        decodeRichString(payload, 6).text,
      );
    }
  }
  takeSst();
  flush();
  return sections.join("\n\n");
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value * 1e6) / 1e6);
}

function decodeRk(rk: number): number {
  const signed = rk | 0;
  const value = signed & 2 ? signed >> 2 : floatRk(signed & 0xfffffffc);
  return signed & 1 ? value / 100 : value;
}

function floatRk(high: number): number {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setUint32(0, high >>> 0, false);
  return new DataView(buffer).getFloat64(0, false);
}

function decodeShortString(payload: Uint8Array, offset: number): string {
  if (offset + 2 > payload.length) return "";
  const count = payload[offset];
  const high = payload[offset + 1] & 1;
  const start = offset + 2;
  if (high) {
    let text = "";
    for (let index = 0; index < count && start + index * 2 + 1 < payload.length; index += 1) {
      text += String.fromCharCode(payload[start + index * 2] | (payload[start + index * 2 + 1] << 8));
    }
    return text;
  }
  return latin1(payload.subarray(start, start + count));
}

function decodeRichString(payload: Uint8Array, offset: number): { text: string; next: number } {
  if (offset + 3 > payload.length) return { text: "", next: payload.length };
  const count = payload[offset] | (payload[offset + 1] << 8);
  const flags = payload[offset + 2];
  let cursor = offset + 3;
  let runs = 0;
  let extra = 0;
  if (flags & 8) {
    runs = payload[cursor] | (payload[cursor + 1] << 8);
    cursor += 2;
  }
  if (flags & 4) {
    extra =
      payload[cursor] |
      (payload[cursor + 1] << 8) |
      (payload[cursor + 2] << 16) |
      (payload[cursor + 3] << 24);
    cursor += 4;
  }
  let text = "";
  if (flags & 1) {
    for (let index = 0; index < count && cursor + 1 < payload.length; index += 1) {
      text += String.fromCharCode(payload[cursor] | (payload[cursor + 1] << 8));
      cursor += 2;
    }
  } else {
    text = latin1(payload.subarray(cursor, Math.min(payload.length, cursor + count)));
    cursor += count;
  }
  cursor += runs * 4 + extra;
  return { text, next: cursor };
}

function parseSst(payload: Uint8Array, into: string[]) {
  let cursor = 8;
  while (cursor + 3 <= payload.length) {
    const parsed = decodeRichString(payload, cursor);
    if (!parsed.text && parsed.next <= cursor) break;
    into.push(parsed.text);
    if (parsed.next <= cursor) break;
    cursor = parsed.next;
  }
}

interface PdfObject {
  dict: string;
  stream?: Uint8Array;
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  const latin = latin1(bytes);
  if (!latin.includes("%PDF")) throw new Error("unreadable");
  const start = lastStartXref(latin);
  if (start < 0) throw new Error("unreadable");
  const loaded = await loadPdfXrefs(bytes, latin, start);
  if (/\/Encrypt\b/.test(loaded.trailer)) throw new Error("password");
  const pages: { dict: string; resources: string }[] = [];
  const root = objectDict(loaded.objects, firstRef(loaded.trailer, "Root"));
  walkPages(loaded.objects, firstRef(root, "Pages"), "", pages);
  const chunks: string[] = [];
  for (const page of pages) {
    const text = await pageText(loaded.objects, page.dict, page.resources);
    if (text.trim()) chunks.push(text);
  }
  if (chunks.length > 0) return chunks.join("\n\n");
  for (const object of loaded.objects.values()) {
    if (!object.stream || !/Tj|TJ/.test(latin1(object.stream))) continue;
    const text = showPdfText(latin1(object.stream), new Map());
    if (text.trim()) chunks.push(text);
  }
  return chunks.join("\n\n");
}

function lastStartXref(latin: string): number {
  const match = /startxref\s+(\d+)\s*%%EOF\s*$/.exec(latin);
  if (match) return Number(match[1]);
  const loose = [...latin.matchAll(/startxref\s+(\d+)/g)].pop();
  return loose ? Number(loose[1]) : -1;
}

function extractDict(
  source: string,
  from: number,
  until = source.length,
): { dict: string; end: number } | null {
  const start = source.indexOf("<<", from);
  if (start < 0 || start >= until) return null;
  let depth = 0;
  let index = start;
  let inString = false;
  while (index < until) {
    if (inString) {
      if (source[index] === "\\") {
        index += 2;
        continue;
      }
      if (source[index] === ")") inString = false;
      index += 1;
      continue;
    }
    if (source[index] === "(") {
      inString = true;
      index += 1;
      continue;
    }
    if (source.startsWith("<<", index)) {
      depth += 1;
      index += 2;
      continue;
    }
    if (source.startsWith(">>", index)) {
      depth -= 1;
      index += 2;
      if (depth === 0) return { dict: source.slice(start, index), end: index };
      continue;
    }
    index += 1;
  }
  return null;
}

interface RawPdfObject {
  dict: string;
  streamStart?: number;
  length?: number;
  lengthRef?: number;
}

function parseRawObject(latin: string, offset: number): RawPdfObject | null {
  const header = /^\s*\d+\s+\d+\s+obj/.exec(latin.slice(offset, offset + 80));
  if (!header) return null;
  const endObj = latin.indexOf("endobj", offset + header[0].length);
  const limit = endObj < 0 ? latin.length : endObj;
  const dict = extractDict(latin, offset + header[0].length, limit);
  if (!dict) return { dict: latin.slice(offset + header[0].length, limit).trim() };
  const after = latin.slice(dict.end, dict.end + 40);
  const stream = /^\s*stream(?:\r\n|\n|\r)/.exec(after);
  const lengthRef = /\/Length\s+(\d+)\s+0\s+R/.exec(dict.dict);
  const length = /\/Length\s+(\d+)(?!\s+0\s+R)/.exec(dict.dict);
  if (!stream) return { dict: dict.dict };
  return {
    dict: dict.dict,
    streamStart: dict.end + stream[0].length,
    length: length ? Number(length[1]) : undefined,
    lengthRef: lengthRef ? Number(lengthRef[1]) : undefined,
  };
}

async function materialize(
  bytes: Uint8Array,
  raw: RawPdfObject,
  objects: Map<number, PdfObject>,
): Promise<PdfObject> {
  if (raw.streamStart === undefined) return { dict: raw.dict };
  let length = raw.length;
  if (length === undefined && raw.lengthRef !== undefined) {
    const lengthObject = objects.get(raw.lengthRef)?.dict ?? "";
    const numeric = /^\s*(\d+)/.exec(lengthObject.replace(/^<<[\s\S]*>>/, ""));
    const plain = /^\s*\d+\s+\d+\s+obj\s+(\d+)/.exec(lengthObject);
    length = plain ? Number(plain[1]) : numeric ? Number(numeric[1]) : undefined;
  }
  if (length === undefined) return { dict: raw.dict };
  const stream = await decodePdfStream(raw.dict, bytes.subarray(raw.streamStart, raw.streamStart + length));
  return { dict: raw.dict, stream };
}

async function decodePdfStream(dict: string, raw: Uint8Array): Promise<Uint8Array> {
  try {
    // FlateDecode is zlib (a header plus raw deflate), not a zip entry.
    let data = /FlateDecode/.test(dict) ? await inflate(raw, "deflate") : raw;
    const predictor = Number(/\/Predictor\s+(\d+)/.exec(dict)?.[1] ?? 1);
    if (predictor >= 10) {
      const columns = Number(/\/Columns\s+(\d+)/.exec(dict)?.[1] ?? 1);
      data = pngUnpredict(data, columns);
    }
    return data;
  } catch {
    return new Uint8Array();
  }
}

function pngUnpredict(data: Uint8Array, columns: number): Uint8Array {
  const rowLength = columns + 1;
  const rows = Math.floor(data.length / rowLength);
  const out = new Uint8Array(rows * columns);
  const previous = new Uint8Array(columns);
  const current = new Uint8Array(columns);
  for (let row = 0; row < rows; row += 1) {
    const filter = data[row * rowLength];
    for (let column = 0; column < columns; column += 1) {
      const value = data[row * rowLength + 1 + column];
      const left = column > 0 ? current[column - 1] : 0;
      const up = previous[column];
      const upLeft = column > 0 ? previous[column - 1] : 0;
      let decoded = value;
      if (filter === 1) decoded = (value + left) & 255;
      else if (filter === 2) decoded = (value + up) & 255;
      else if (filter === 3) decoded = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) decoded = (value + paeth(left, up, upLeft)) & 255;
      current[column] = decoded;
    }
    out.set(current, row * columns);
    previous.set(current);
  }
  return out;
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

/**
 * Word and other writers put an empty xref at `startxref` and point at the
 * real table with `/Prev` or `/XRefStm`. Follow both, and let the newest
 * section win when an object appears more than once.
 */
async function loadPdfXrefs(
  bytes: Uint8Array,
  latin: string,
  start: number,
  seen = new Set<number>(),
): Promise<{ objects: Map<number, PdfObject>; trailer: string }> {
  if (seen.has(start)) return { objects: new Map(), trailer: "" };
  seen.add(start);
  const head = latin.slice(start, start + 16).trimStart();
  const loaded = head.startsWith("xref")
    ? await loadClassicXref(bytes, latin, start)
    : await loadStreamXref(bytes, latin, start);
  const prev = Number(/\/Prev\s+(\d+)/.exec(loaded.trailer)?.[1] ?? 0);
  const xrefStream = Number(/\/XRefStm\s+(\d+)/.exec(loaded.trailer)?.[1] ?? 0);
  let objects = loaded.objects;
  if (prev > 0) {
    const older = await loadPdfXrefs(bytes, latin, prev, seen);
    objects = mergePdfObjects(older.objects, objects);
  }
  if (xrefStream > 0) {
    const extra = await loadPdfXrefs(bytes, latin, xrefStream, seen);
    objects = mergePdfObjects(objects, extra.objects);
  }
  return { objects, trailer: loaded.trailer };
}

function mergePdfObjects(
  base: Map<number, PdfObject>,
  extra: Map<number, PdfObject>,
): Map<number, PdfObject> {
  const merged = new Map(base);
  for (const [id, object] of extra) merged.set(id, object);
  return merged;
}

async function loadClassicXref(
  bytes: Uint8Array,
  latin: string,
  start: number,
): Promise<{ objects: Map<number, PdfObject>; trailer: string }> {
  let index = start + 4;
  const offsets = new Map<number, number>();
  while (index < latin.length) {
    while (/\s/.test(latin[index] ?? "")) index += 1;
    if (latin.startsWith("trailer", index)) break;
    const range = /^(\d+)\s+(\d+)/.exec(latin.slice(index, index + 40));
    if (!range) break;
    const first = Number(range[1]);
    const count = Number(range[2]);
    index += range[0].length;
    if (latin[index] === "\r") index += 1;
    if (latin[index] === "\n") index += 1;
    for (let entry = 0; entry < count; entry += 1) {
      const line = latin.slice(index, index + 20);
      if (line[17] === "n") offsets.set(first + entry, Number(line.slice(0, 10)));
      index += 20;
    }
  }
  const trailer = extractDict(latin, latin.indexOf("trailer", index))?.dict ?? "";
  const raw = new Map<number, RawPdfObject>();
  for (const [id, offset] of offsets) {
    if (id === 0) continue;
    const parsed = parseRawObject(latin, offset);
    if (parsed) raw.set(id, parsed);
  }
  const objects = new Map<number, PdfObject>();
  for (const [id, object] of raw) {
    if (object.streamStart === undefined) objects.set(id, { dict: object.dict });
  }
  for (const [id, object] of raw) {
    if (object.streamStart !== undefined) objects.set(id, await materialize(bytes, object, objects));
  }
  return { objects, trailer };
}

async function loadStreamXref(
  bytes: Uint8Array,
  latin: string,
  start: number,
): Promise<{ objects: Map<number, PdfObject>; trailer: string }> {
  const raw = parseRawObject(latin, start);
  if (!raw?.streamStart || raw.length === undefined) throw new Error("unreadable");
  const stream = await decodePdfStream(raw.dict, bytes.subarray(raw.streamStart, raw.streamStart + raw.length));
  const widths = /\/W\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(raw.dict);
  if (!widths) throw new Error("unreadable");
  const width = widths.slice(1, 4).map(Number);
  const size = Number(/\/Size\s+(\d+)/.exec(raw.dict)?.[1] ?? 0);
  const indexSpec = /\/Index\s*\[([^\]]+)\]/.exec(raw.dict);
  const pairs = (indexSpec?.[1] ?? `0 ${size}`).trim().split(/\s+/).map(Number);
  const entries: { id: number; type: number; field2: number; field3: number }[] = [];
  let cursor = 0;
  const row = width[0] + width[1] + width[2];
  for (let pair = 0; pair + 1 < pairs.length; pair += 2) {
    const first = pairs[pair];
    const count = pairs[pair + 1];
    for (let entry = 0; entry < count; entry += 1) {
      const at = cursor + entry * row;
      const type = width[0] === 0 ? 1 : readBe(stream, at, width[0]);
      entries.push({
        id: first + entry,
        type,
        field2: readBe(stream, at + width[0], width[1]),
        field3: readBe(stream, at + width[0] + width[1], width[2]),
      });
    }
    cursor += count * row;
  }
  const objects = new Map<number, PdfObject>();
  for (const entry of entries) {
    if (entry.type !== 1 || entry.id === 0) continue;
    const parsed = parseRawObject(latin, entry.field2);
    if (parsed && parsed.streamStart === undefined) objects.set(entry.id, { dict: parsed.dict });
  }
  for (const entry of entries) {
    if (entry.type !== 1 || entry.id === 0) continue;
    const parsed = parseRawObject(latin, entry.field2);
    if (parsed?.streamStart !== undefined) objects.set(entry.id, await materialize(bytes, parsed, objects));
  }
  for (const entry of entries) {
    if (entry.type !== 2) continue;
    const container = objects.get(entry.field2);
    if (!container?.stream) continue;
    const embedded = parseObjectStream(container.dict, latin1(container.stream));
    const object = embedded.get(entry.id);
    if (object) objects.set(entry.id, object);
  }
  return { objects, trailer: raw.dict };
}

function readBe(data: Uint8Array, offset: number, width: number): number {
  let value = 0;
  for (let index = 0; index < width; index += 1) value = value * 256 + (data[offset + index] ?? 0);
  return value;
}

function parseObjectStream(dict: string, source: string): Map<number, PdfObject> {
  const count = Number(/\/N\s+(\d+)/.exec(dict)?.[1] ?? 0);
  const first = Number(/\/First\s+(\d+)/.exec(dict)?.[1] ?? 0);
  const header = source.slice(0, first).trim().split(/\s+/).map(Number);
  const objects = new Map<number, PdfObject>();
  for (let index = 0; index < count; index += 1) {
    const id = header[index * 2];
    const start = first + header[index * 2 + 1];
    const end = index + 1 < count ? first + header[(index + 1) * 2 + 1] : source.length;
    const body = source.slice(start, end).trim();
    const dict = body.startsWith("<<") ? extractDict(body, 0)?.dict ?? body : body;
    objects.set(id, { dict });
  }
  return objects;
}

function firstRef(dict: string, key: string): number {
  return Number(new RegExp(`/${key}\\s+(\\d+)\\s+0\\s+R`).exec(dict)?.[1] ?? 0);
}

function refList(dict: string, key: string): number[] {
  const at = dict.search(new RegExp(`/${key}(?![A-Za-z0-9])`));
  if (at < 0) return [];
  const slice = dict.slice(at, at + 400);
  const array = /^\s*\/[A-Za-z0-9]+\s*\[([^\]]*)\]/.exec(slice);
  if (array) return [...array[1].matchAll(/(\d+)\s+0\s+R/g)].map((match) => Number(match[1]));
  const single = /^\s*\/[A-Za-z0-9]+\s+(\d+)\s+0\s+R/.exec(slice);
  return single ? [Number(single[1])] : [];
}

function objectDict(objects: Map<number, PdfObject>, id: number): string {
  return objects.get(id)?.dict ?? "";
}

function walkPages(
  objects: Map<number, PdfObject>,
  id: number,
  inherited: string,
  into: { dict: string; resources: string }[],
) {
  const dict = objectDict(objects, id);
  if (!dict) return;
  const resources = /\/Resources(?![A-Za-z0-9])/.test(dict) ? dict : inherited;
  if (/\/Type\s*\/Page(?!s)/.test(dict)) {
    into.push({ dict, resources });
    return;
  }
  for (const kid of refList(dict, "Kids")) walkPages(objects, kid, resources, into);
}

async function pageText(
  objects: Map<number, PdfObject>,
  pageDict: string,
  resourceSource: string,
): Promise<string> {
  const fonts = await fontMaps(objects, resourceSource);
  const parts: string[] = [];
  for (const id of refList(pageDict, "Contents")) {
    const stream = objects.get(id)?.stream;
    if (stream) parts.push(showPdfText(latin1(stream), fonts));
  }
  return parts.join("\n");
}

interface CMap {
  width: number;
  map: Map<number, string>;
}

async function fontMaps(objects: Map<number, PdfObject>, resourceSource: string): Promise<Map<string, CMap | null>> {
  const fonts = new Map<string, CMap | null>();
  const resources = resourceBody(objects, resourceSource);
  const fontDict = balancedAfter(resources, "Font");
  if (!fontDict) return fonts;
  for (const match of fontDict.matchAll(/\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+0\s+R/g)) {
    const font = objectDict(objects, Number(match[2]));
    const unicodeId = firstRef(font, "ToUnicode");
    const stream = objects.get(unicodeId)?.stream;
    fonts.set(match[1], stream ? parseCMap(latin1(stream)) : null);
  }
  return fonts;
}

function resourceBody(objects: Map<number, PdfObject>, source: string): string {
  const ref = /\/Resources\s+(\d+)\s+0\s+R/.exec(source);
  if (ref) return objectDict(objects, Number(ref[1]));
  return balancedAfter(source, "Resources") ?? source;
}

function balancedAfter(source: string, name: string): string | null {
  const at = source.search(new RegExp(`/${name}(?![A-Za-z0-9])`));
  if (at < 0) return null;
  const dictAt = source.indexOf("<<", at);
  if (dictAt < 0 || dictAt > at + name.length + 8) return null;
  return extractDict(source, dictAt)?.dict ?? null;
}

function parseCMap(source: string): CMap {
  const map = new Map<number, string>();
  let width = 1;
  const add = (sourceHex: string, destHex: string) => {
    width = Math.max(width, Math.ceil(sourceHex.length / 2));
    map.set(parseInt(sourceHex, 16), utf16be(destHex));
  };
  for (const block of source.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g)) {
    const range = /<([0-9A-Fa-f]+)>/.exec(block[1]);
    if (range) width = Math.max(width, Math.ceil(range[1].length / 2));
  }
  for (const block of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) add(pair[1], pair[2]);
  }
  for (const block of source.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const ranges = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g;
    for (const range of block[1].matchAll(ranges)) {
      const from = parseInt(range[1], 16);
      const to = parseInt(range[2], 16);
      if (range[3]) {
        let dest = parseInt(range[3], 16);
        for (let code = from; code <= to; code += 1) {
          add(
            code.toString(16).padStart(range[1].length, "0"),
            dest.toString(16).padStart(range[3].length, "0"),
          );
          dest += 1;
        }
        continue;
      }
      const dests = [...(range[4] ?? "").matchAll(/<([0-9A-Fa-f]+)>/g)].map((match) => match[1]);
      dests.forEach((dest, index) => {
        if (from + index <= to) {
          add((from + index).toString(16).padStart(range[1].length, "0"), dest);
        }
      });
    }
  }
  return { width, map };
}

/** ToUnicode destinations are UTF-16BE, so a quote is `<201C>`, not two bytes. */
function utf16be(hex: string): string {
  const padded = hex.length % 4 === 0 ? hex : hex.padStart(Math.ceil(hex.length / 4) * 4, "0");
  let text = "";
  for (let index = 0; index < padded.length; index += 4) {
    text += String.fromCharCode(parseInt(padded.slice(index, index + 4), 16));
  }
  return text;
}

function showPdfText(source: string, fonts: Map<string, CMap | null>): string {
  let font = "";
  let output = "";
  let x = 0;
  let y = 0;
  let positioned = false;
  const operands: PdfToken[] = [];
  const place = (nextX: number, nextY: number) => {
    if (positioned && Math.abs(nextY - y) > 1.5 && !output.endsWith("\n")) output += "\n";
    x = nextX;
    y = nextY;
    positioned = true;
  };
  for (const token of tokenizePdf(source)) {
    if (token.kind !== "op") {
      operands.push(token);
      continue;
    }
    const numbers = operands.filter((item) => item.kind === "number");
    if (token.value === "Tf") {
      const name = [...operands].reverse().find((item) => item.kind === "name");
      font = name?.value ?? font;
    } else if (token.value === "Tm" && numbers.length >= 2) {
      place(Number(numbers[numbers.length - 2].value), Number(numbers[numbers.length - 1].value));
    } else if ((token.value === "Td" || token.value === "TD") && numbers.length >= 2) {
      place(x + Number(numbers[numbers.length - 2].value), y + Number(numbers[numbers.length - 1].value));
    } else if (token.value === "T*") {
      place(x, y - 14);
    } else if (token.value === "Tj" || token.value === "'" || token.value === '"') {
      if (token.value === "'") place(x, y - 14);
      const text = [...operands].reverse().find((item) => item.kind === "string");
      if (text) output += decodePdfString(text.value, fonts.get(font) ?? null);
    } else if (token.value === "TJ") {
      const array = [...operands].reverse().find((item) => item.kind === "array");
      if (array) output += decodePdfArray(array.value, fonts.get(font) ?? null);
    }
    operands.length = 0;
  }
  return output;
}

type PdfToken =
  | { kind: "op" | "name" | "number" | "string"; value: string }
  | { kind: "array"; value: string };

function tokenizePdf(source: string): PdfToken[] {
  const tokens: PdfToken[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "%") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (char === "(") {
      const literal = readLiteral(source, index);
      tokens.push({ kind: "string", value: literal.value });
      index = literal.next;
      continue;
    }
    if (char === "<" && source[index + 1] === "<") {
      const dict = extractDict(source, index);
      index = dict?.end ?? index + 2;
      continue;
    }
    if (char === "<") {
      const end = source.indexOf(">", index + 1);
      tokens.push({ kind: "string", value: hexBytes(source.slice(index + 1, end < 0 ? source.length : end)) });
      index = end < 0 ? source.length : end + 1;
      continue;
    }
    if (char === "[") {
      const end = matchingBracket(source, index);
      tokens.push({ kind: "array", value: source.slice(index + 1, end) });
      index = end + 1;
      continue;
    }
    if (char === "/") {
      const name = /^\/([^\s\[\]<>(){}/%]+)/.exec(source.slice(index));
      tokens.push({ kind: "name", value: name?.[1] ?? "" });
      index += name?.[0].length ?? 1;
      continue;
    }
    const number = /^[+-]?(?:\d+\.\d*|\.\d+|\d+)/.exec(source.slice(index));
    if (number) {
      tokens.push({ kind: "number", value: number[0] });
      index += number[0].length;
      continue;
    }
    const op = /^[A-Za-z*'"]+/.exec(source.slice(index));
    if (op) {
      tokens.push({ kind: "op", value: op[0] });
      index += op[0].length;
      continue;
    }
    index += 1;
  }
  return tokens;
}

function matchingBracket(source: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let index = start; index < source.length; index += 1) {
    if (inString) {
      if (source[index] === "\\") {
        index += 1;
        continue;
      }
      if (source[index] === ")") inString = false;
      continue;
    }
    if (source[index] === "(") inString = true;
    else if (source[index] === "[") depth += 1;
    else if (source[index] === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return source.length - 1;
}

function readLiteral(source: string, start: number): { value: string; next: number } {
  let value = "";
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      const next = source[index + 1] ?? "";
      const escaped: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
      if (escaped[next] !== undefined) {
        value += escaped[next];
        index += 2;
        continue;
      }
      const octal = /^[0-7]{1,3}/.exec(source.slice(index + 1));
      if (octal) {
        value += String.fromCharCode(parseInt(octal[0], 8));
        index += 1 + octal[0].length;
        continue;
      }
      index += 2;
      continue;
    }
    if (char === ")") return { value, next: index + 1 };
    value += char;
    index += 1;
  }
  return { value, next: index };
}

function hexBytes(hex: string): string {
  const digits = hex.replace(/\s+/g, "");
  let value = "";
  for (let index = 0; index + 1 < digits.length; index += 2) {
    value += String.fromCharCode(parseInt(digits.slice(index, index + 2), 16));
  }
  return value;
}

function decodePdfString(value: string, cmap: CMap | null): string {
  const bytes = [...value].map((char) => char.charCodeAt(0) & 255);
  if (!cmap || cmap.map.size === 0) return bytes.map(winAnsi).join("");
  let text = "";
  for (let index = 0; index + cmap.width <= bytes.length; index += cmap.width) {
    let code = 0;
    for (let byte = 0; byte < cmap.width; byte += 1) code = (code << 8) | bytes[index + byte];
    text += cmap.map.get(code) ?? (cmap.width === 1 ? winAnsi(code) : "");
  }
  return text;
}

function decodePdfArray(source: string, cmap: CMap | null): string {
  let text = "";
  const tokens = tokenizePdf(source);
  for (const token of tokens) {
    if (token.kind === "string") text += decodePdfString(token.value, cmap);
    else if (token.kind === "number" && Number(token.value) < -150) text += " ";
  }
  return text;
}
