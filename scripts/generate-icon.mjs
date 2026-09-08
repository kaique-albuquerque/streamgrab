// Script to generate icons for all platforms
// macOS: needs at least 512x512 (we generate 1024x1024)
// Windows: needs at least 256x256
// Linux: needs PNG
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const size = 1024;

// ── Gerar PNG 1024x1024 ──
function createPNG(w, h, r, g, b) {
  const raw = [];
  for (let y = 0; y < h; y++) {
    raw.push(0); // filter: None
    for (let x = 0; x < w; x++) {
      const cx = w / 2, cy = h / 2, radius = w / 2 - 8;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        if (dist > radius - 6) {
          raw.push(30, 60, 120, 255);
        } else {
          const t = dist / radius;
          raw.push(
            Math.round(r * (1 - t * 0.3)),
            Math.round(g * (1 - t * 0.2)),
            Math.round(b * (1 + t * 0.1)),
            255
          );
        }
      } else {
        raw.push(0, 0, 0, 0);
      }
    }
  }

  const deflated = zlib.deflateSync(Buffer.from(raw));

  function crc32(buf) {
    let c = 0xffffffff;
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let v = n;
      for (let k = 0; k < 8; k++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
      table[n] = v;
    }
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeData = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeData));
    return Buffer.concat([len, typeData, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([pngHeader, chunk('IHDR', ihdr), chunk('IDAT', deflated), chunk('IEND', Buffer.alloc(0))]);
}

// ── Gerar ICO com 256x256 ──
function createICO(w, h, pngBuf) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry.writeUInt8(w >= 256 ? 0 : w, 0);
  entry.writeUInt8(h >= 256 ? 0 : h, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(22, 12);

  return Buffer.concat([header, entry, pngBuf]);
}

const png = createPNG(size, size, 59, 130, 246);
const ico = createICO(size, size, png);

const buildDir = path.join(process.cwd(), 'build');
fs.mkdirSync(buildDir, { recursive: true });

fs.writeFileSync(path.join(buildDir, 'icon.png'), png);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
console.log(`Icons created: build/icon.png (${png.length} bytes), build/icon.ico (${ico.length} bytes)`);

