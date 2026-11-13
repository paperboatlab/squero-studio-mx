// Figure downloads. The bytes are SqueroPlot's stored artifacts (vector SVG/PDF/EPS/HTML, PNG);
// nothing is captured from the screen. Several files go out as one store-only ZIP.

/** Export sizes offered when exporting; `script` uses each figure's scripted dimensions. */
export type SizePreset = { id: string; label: string; width?: number; height?: number };
export const SIZE_PRESETS: SizePreset[] = [
  { id: "script", label: "as scripted" },
  { id: "4:3", label: "4:3 · 800 × 600", width: 800, height: 600 },
  { id: "16:9", label: "16:9 · 1280 × 720", width: 1280, height: 720 },
  { id: "1:1", label: "1:1 · 800 × 800", width: 800, height: 800 },
  { id: "a4-landscape", label: "A4 landscape · 1123 × 794", width: 1123, height: 794 },
  { id: "a4-portrait", label: "A4 portrait · 794 × 1123", width: 794, height: 1123 },
  { id: "custom", label: "custom" },
];

const encodeText = (text: string) => new TextEncoder().encode(text);

/** Blob wants ArrayBuffer-backed views; copy the exact slice so TS can prove it. */
export const bufferOf = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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
