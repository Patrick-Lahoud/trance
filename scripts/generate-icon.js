// Generates public/icon.ico — a multi-size (16→256px) Trance app icon.
// The design is drawn per-pixel at 4x supersampling and box-downsampled,
// so every size is anti-aliased and crisp (vector-like) in the tray/taskbar.
//
// Design: rounded blue-gradient square + white orbit ring with a satellite
// dot drifting at the bottom-right — the "Trance" focus motif.
//
// Usage: node scripts/generate-icon.js
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------- PNG encoder (zlib + manual chunks, no deps) ----------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// rgba: Buffer of size*size*4 (straight alpha, row-major)
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // scanlines with filter byte 0
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Icon renderer ----------
const SS = 4; // supersample factor

const C_BG = [0x0a, 0x0a, 0x0a]; // near-black monochrome background

// Signed distance to a rounded rectangle centered at origin, half-extent hw/hh, radius r
function sdRoundRect(x, y, hw, hh, r) {
  const qx = Math.abs(x) - hw + r;
  const qy = Math.abs(y) - hh + r;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

// Render one size → Buffer (RGBA straight alpha)
function render(size) {
  const S = size * SS;
  const rgba = Buffer.alloc(S * S * 4);

  const cx = S / 2;
  const cy = S / 2;
  const hw = S / 2;
  const hh = S / 2;
  const corner = S * 0.225;

  // Orbit ring geometry
  const ringR = S * 0.30;
  const ringStroke = S * 0.095;
  const ringCy = S * 0.53;
  // Satellite dot drifting at ~45° down-right on the ring
  const dotR = S * 0.105;
  const dotAngle = Math.PI / 4; // 45°
  const dotX = cx + ringR * Math.cos(dotAngle);
  const dotY = ringCy + ringR * Math.sin(dotAngle);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = x + 0.5 - cx;
      const py = y + 0.5 - cy;

      const dRect = sdRoundRect(px, py, hw, hh, corner);
      if (dRect > 0) continue; // outside the rounded square — transparent

      // Background: solid monochrome
      let r = C_BG[0];
      let g = C_BG[1];
      let b = C_BG[2];

      // White orbit ring
      const dRing = Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - ringCy) - ringR);
      if (dRing <= ringStroke / 2) {
        r = 255; g = 255; b = 255;
      }

      // White satellite dot (drawn over the ring)
      const dDot = Math.hypot(x + 0.5 - dotX, y + 0.5 - dotY);
      if (dDot <= dotR) {
        r = 255; g = 255; b = 255;
      }

      const o = (y * S + x) * 4;
      rgba[o] = Math.round(r);
      rgba[o + 1] = Math.round(g);
      rgba[o + 2] = Math.round(b);
      rgba[o + 3] = 255;
    }
  }

  // Box-downsample SS → 1
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sr = 0, sg = 0, sb = 0, sa = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const o = ((y * SS + dy) * S + (x * SS + dx)) * 4;
          sr += rgba[o];
          sg += rgba[o + 1];
          sb += rgba[o + 2];
          sa += rgba[o + 3];
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      out[o] = Math.round(sr / n);
      out[o + 1] = Math.round(sg / n);
      out[o + 2] = Math.round(sb / n);
      out[o + 3] = Math.round(sa / n);
    }
  }
  return out;
}

// ---------- ICO writer (PNG-compressed entries, Vista+ compatible) ----------
function writeIco(file, sizes) {
  const images = sizes.map((s) => ({ size: s, png: encodePng(s, render(s)) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + 16 * images.length;
  images.forEach((img, i) => {
    const e = i * 16;
    dir[e] = img.size === 256 ? 0 : img.size; // width (0 = 256)
    dir[e + 1] = img.size === 256 ? 0 : img.size; // height
    dir[e + 2] = 0; // color count
    dir[e + 3] = 0; // reserved
    dir.writeUInt16LE(1, e + 4); // planes
    dir.writeUInt16LE(32, e + 6); // bpp
    dir.writeUInt32LE(img.png.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += img.png.length;
  });

  fs.writeFileSync(file, Buffer.concat([header, dir, ...images.map((i) => i.png)]));
  console.log(`Wrote ${file} with ${images.length} sizes: ${sizes.join(', ')}px`);
}

// ---------- Main ----------
if (require.main === module) {
  const outFile = path.join(__dirname, '..', 'public', 'icon.ico');
  writeIco(outFile, [16, 24, 32, 48, 64, 128, 256]);
}

module.exports = { render, encodePng, writeIco };
