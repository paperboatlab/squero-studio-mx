// Figure export: the rendered page is captured as one image (the plots are canvases), then
// written as PNG, SVG, EPS or PDF. The vector formats embed the capture; the figure model is
// not re-drawn, so what you see is what the file holds.

export type FigureFormat = "png" | "svg" | "eps" | "pdf";

export const FIGURE_FORMATS: FigureFormat[] = ["png", "svg", "eps", "pdf"];

const MIME: Record<FigureFormat, string> = {
  png: "image/png",
  svg: "image/svg+xml",
  eps: "application/postscript",
  pdf: "application/pdf",
};

/** Composite every canvas in the figure page, in place, on the page's own background. */
export function captureFigure(host: HTMLElement, scale = 2): HTMLCanvasElement | null {
  const root = host.querySelector<HTMLElement>(".figure-grid");
  if (!root) return null;
  const box = root.getBoundingClientRect();
  if (box.width < 2 || box.height < 2) return null;
  const s = Math.min(scale, 4096 / Math.max(box.width, box.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(box.width * s));
  canvas.height = Math.max(1, Math.round(box.height * s));
  const g = canvas.getContext("2d");
  if (!g) return null;

  const opaque = (colour: string) => colour !== "" && colour !== "transparent" && !/^rgba\(.*,\s*0\)$/.test(colour);
  const rootBg = getComputedStyle(root).backgroundColor;
  g.fillStyle = opaque(rootBg) ? rootBg : "#ffffff";
  g.fillRect(0, 0, canvas.width, canvas.height);

  for (const tile of root.querySelectorAll<HTMLElement>(".figure-tile")) {
    const r = tile.getBoundingClientRect();
    const bg = getComputedStyle(tile).backgroundColor;
    if (!opaque(bg)) continue;
    g.fillStyle = bg;
    g.fillRect((r.left - box.left) * s, (r.top - box.top) * s, r.width * s, r.height * s);
  }
  for (const source of root.querySelectorAll<HTMLCanvasElement>("canvas")) {
    const r = source.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    try {
      g.drawImage(source, (r.left - box.left) * s, (r.top - box.top) * s, r.width * s, r.height * s);
    } catch {
      // A disposed WebGL canvas; the tile background still travels.
    }
  }
  return canvas;
}

const bytesOf = (dataUrl: string) => {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const encodeText = (text: string) => new TextEncoder().encode(text);

/** Blob wants ArrayBuffer-backed views; copy the exact slice so TS can prove it. */
const bufferOf = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const pdfNumber = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3));

/** A one-page PDF with the capture as a JPEG XObject (DCTDecode). */
function pdfOf(jpeg: Uint8Array, imageW: number, imageH: number, pageW: number, pageH: number, title: string): Blob {
  const parts: Uint8Array[] = [];
  let offset = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encodeText(part) : part;
    parts.push(bytes);
    offset += bytes.length;
  };
  const offsets: number[] = [];
  const object = (id: number, body: () => void) => {
    offsets[id] = offset;
    push(`${id} 0 obj\n`);
    body();
    push("endobj\n");
  };

  push("%PDF-1.4\n");
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  object(1, () => push("<< /Type /Catalog /Pages 2 0 R >>\n"));
  object(2, () => push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n"));
  object(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNumber(pageW)} ${pdfNumber(pageH)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\n`));
  object(4, () => {
    push(`<< /Type /XObject /Subtype /Image /Width ${imageW} /Height ${imageH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    push(jpeg);
    push("\nendstream\n");
  });
  const content = `q\n${pdfNumber(pageW)} 0 0 ${pdfNumber(pageH)} 0 0 cm\n/Im0 Do\nQ\n`;
  object(5, () => push(`<< /Length ${encodeText(content).length} >>\nstream\n${content}endstream\n`));

  const xref = offset;
  const pad = (n: number) => String(n).padStart(10, "0");
  push(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${pad(n)} 00000 n \n`).join("")}`);
  push(`trailer\n<< /Size 6 /Root 1 0 R /Info << /Title (${title.replace(/[()\\]/g, " ")}) >> >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts.map(bufferOf), { type: MIME.pdf });
}

/** EPS with the capture as a JPEG image (DCTDecode); Ghostscript and Illustrator read it. */
function epsOf(jpeg: Uint8Array, imageW: number, imageH: number, pageW: number, pageH: number, title: string): Blob {
  const head = [
    "%!PS-Adobe-3.0 EPSF-3.0",
    `%%BoundingBox: 0 0 ${Math.ceil(pageW)} ${Math.ceil(pageH)}`,
    `%%HiResBoundingBox: 0 0 ${pageW} ${pageH}`,
    "%%Creator: Squero Studio MX",
    `%%Title: ${title.replace(/[\r\n()]/g, " ")}`,
    `%%CreationDate: ${new Date().toISOString()}`,
    "%%LanguageLevel: 3",
    "%%EndComments",
    "%%BeginProlog",
    "/DeviceRGB setcolorspace",
    "%%EndProlog",
    "gsave",
    `0 0 ${Math.ceil(pageW)} ${Math.ceil(pageH)} rectclip`,
    `${pageW / imageW} ${pageH / imageH} scale`,
    `<< /ImageType 1 /Width ${imageW} /Height ${imageH} /BitsPerComponent 8`,
    "   /Decode [0 1 0 1 0 1] /ImageMatrix [1 0 0 -1 0 " + imageH + "]",
    "   /DataSource currentfile /Filter /DCTDecode",
    ">> image",
    "",
  ].join("\n");
  return new Blob([bufferOf(encodeText(head)), bufferOf(jpeg), bufferOf(encodeText("\ngrestore\nshowpage\n%%EOF\n"))], { type: MIME.eps });
}

/** SVG with the capture as a data URI, sized in CSS pixels. */
function svgOf(png: string, width: number, height: number, title: string): Blob {
  const safe = title.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<title>${safe}</title>
<image width="${width}" height="${height}" href="${png}"/>
</svg>
`;
  return new Blob([body], { type: MIME.svg });
}

export function encodeFigure(canvas: HTMLCanvasElement, format: FigureFormat, title: string): Blob {
  const width = Math.max(1, Math.round(canvas.width / 2));
  const height = Math.max(1, Math.round(canvas.height / 2));
  if (format === "png") return new Blob([bufferOf(bytesOf(canvas.toDataURL("image/png")))], { type: MIME.png });
  if (format === "svg") return svgOf(canvas.toDataURL("image/png"), width, height, title);
  const jpeg = bytesOf(canvas.toDataURL("image/jpeg", 0.95));
  // 96 CSS px = 72 pt.
  const pageW = width * 0.75;
  const pageH = height * 0.75;
  if (format === "pdf") return pdfOf(jpeg, canvas.width, canvas.height, pageW, pageH, title);
  return epsOf(jpeg, canvas.width, canvas.height, pageW, pageH, title);
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function figureFileBase(source: string, index: number, total: number): string {
  const base = (source.split("/").pop() ?? "figure").replace(/\.jl$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-") || "figure";
  return total > 1 ? `${base}-${index + 1}` : base;
}

// A store-only ZIP, so one download carries every selected figure.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const DOS_TIME = (date: Date) => (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
const DOS_DATE = (date: Date) => ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

export async function zipFiles(files: readonly { name: string; blob: Blob }[]): Promise<Blob> {
  const now = new Date();
  const time = DOS_TIME(now);
  const date = DOS_DATE(now);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const { name, blob } of files) {
    const data = new Uint8Array(await blob.arrayBuffer());
    const nameBytes = encodeText(name);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    locals.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const centralSize = centrals.reduce((n, part) => n + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...locals, ...centrals, end].map(bufferOf), { type: "application/zip" });
}
