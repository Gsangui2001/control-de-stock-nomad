// Generates PWA icons as PNGs with no external deps (raw PNG encoder).
// Design: ocean-blue rounded tile with a simple white anchor mark.
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "icons");
fs.mkdirSync(OUT, { recursive: true });

const OCEAN = [15, 91, 168]; // #0f5ba8
const TURQ = [38, 178, 178];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, draw) {
  const bpp = 4;
  const raw = Buffer.alloc(size * (size * bpp + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * bpp + 1);
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = draw(x, y);
      const off = rowStart + 1 + x * bpp;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function mix(c1, c2, t) {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

// Simple anchor mask in normalized coords (0..1)
function isAnchor(nx, ny) {
  const cx = 0.5;
  // vertical shank
  if (Math.abs(nx - cx) < 0.035 && ny > 0.22 && ny < 0.82) return true;
  // top ring
  const dr = Math.hypot(nx - cx, ny - 0.2);
  if (dr > 0.055 && dr < 0.11) return true;
  // stock (horizontal bar)
  if (Math.abs(ny - 0.36) < 0.032 && Math.abs(nx - cx) < 0.16) return true;
  // bottom arc (flukes) - approximate with a wide shallow band
  const arcY = 0.72;
  const t = (nx - cx) / 0.30;
  if (Math.abs(t) <= 1) {
    const curve = arcY + 0.12 * (t * t);
    if (Math.abs(ny - curve) < 0.045 && ny > 0.6) return true;
  }
  return false;
}

function makeIcon(size, { maskable = false } = {}) {
  const pad = maskable ? size * 0.12 : 0;
  const radius = maskable ? size * 0.0 : size * 0.22;
  return encodePNG(size, (x, y) => {
    // rounded rect background (skip rounding for maskable -> full bleed)
    const inCorner = (() => {
      if (radius === 0) return true;
      const rx = Math.min(x, size - 1 - x);
      const ry = Math.min(y, size - 1 - y);
      if (rx < radius && ry < radius) {
        const d = Math.hypot(radius - rx, radius - ry);
        return d <= radius;
      }
      return true;
    })();
    if (!inCorner) return [0, 0, 0, 0];
    // gradient background ocean -> turquoise
    const t = y / size;
    const bg = mix(OCEAN, mix(OCEAN, TURQ, 0.5), t);
    const nx = (x - pad) / (size - 2 * pad);
    const ny = (y - pad) / (size - 2 * pad);
    if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1 && isAnchor(nx, ny)) {
      return [...WHITE, 255];
    }
    return [...bg, 255];
  });
}

fs.writeFileSync(path.join(OUT, "icon-192.png"), makeIcon(192));
fs.writeFileSync(path.join(OUT, "icon-512.png"), makeIcon(512));
fs.writeFileSync(path.join(OUT, "maskable-512.png"), makeIcon(512, { maskable: true }));
fs.writeFileSync(path.join(OUT, "apple-touch-icon.png"), makeIcon(180));
console.log("Icons generated in public/icons/");
