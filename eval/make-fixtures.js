// Generates tiny synthetic PNG fixtures (no external images, no dependencies). Run: node eval/make-fixtures.js
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 128
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, tail])
}

function encodePng(pixels) {
  const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1))
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * (SIZE * 3 + 1)] = 0
    pixels.copy(raw, y * (SIZE * 3 + 1) + 1, y * SIZE * 3, (y + 1) * SIZE * 3)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

const canvas = (bg) => {
  const px = Buffer.alloc(SIZE * SIZE * 3)
  for (let i = 0; i < SIZE * SIZE; i += 1) px.set(bg, i * 3)
  return px
}
const put = (px, x, y, color) => {
  if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) px.set(color, (y * SIZE + x) * 3)
}
const rect = (px, x0, y0, x1, y1, color) => {
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) put(px, x, y, color)
}
const ellipse = (px, cx, cy, rx, ry, color) => {
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(px, x, y, color)
    }
  }
}
const triangle = (px, [ax, ay], [bx, by], [cx, cy], color) => {
  const area = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3)
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const d1 = area(x, y, ax, ay, bx, by)
      const d2 = area(x, y, bx, by, cx, cy)
      const d3 = area(x, y, cx, cy, ax, ay)
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) put(px, x, y, color)
    }
  }
}

// Box blur, repeated, to simulate an out-of-focus photo.
function blur(px, radius, passes) {
  let src = Buffer.from(px)
  for (let p = 0; p < passes; p += 1) {
    const dst = Buffer.alloc(src.length)
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const sum = [0, 0, 0]
        let n = 0
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            const xx = Math.min(SIZE - 1, Math.max(0, x + dx))
            const yy = Math.min(SIZE - 1, Math.max(0, y + dy))
            for (let c = 0; c < 3; c += 1) sum[c] += src[(yy * SIZE + xx) * 3 + c]
            n += 1
          }
        }
        for (let c = 0; c < 3; c += 1) dst[(y * SIZE + x) * 3 + c] = Math.round(sum[c] / n)
      }
    }
    src = dst
  }
  return src
}

const BG = [236, 232, 222]
const glassJar = () => {
  const px = canvas(BG)
  rect(px, 40, 40, 88, 100, [170, 215, 225])
  ellipse(px, 64, 100, 24, 6, [170, 215, 225])
  rect(px, 44, 28, 84, 40, [150, 150, 155])
  rect(px, 48, 60, 80, 84, [235, 245, 247])
  return px
}
const plasticBottle = () => {
  const px = canvas(BG)
  rect(px, 46, 50, 82, 112, [90, 160, 220])
  rect(px, 56, 30, 72, 50, [90, 160, 220])
  rect(px, 55, 22, 73, 30, [230, 230, 230])
  rect(px, 46, 70, 82, 90, [250, 250, 250])
  return px
}
const ambiguousMaterial = () => {
  const px = canvas(BG)
  rect(px, 30, 44, 98, 90, [200, 190, 175])
  for (let i = 0; i < 6; i += 1) rect(px, 30, 50 + i * 7, 98, 53 + i * 7, [150, 140, 130])
  ellipse(px, 64, 67, 14, 10, [120, 120, 120])
  return px
}
const brokenGlass = () => {
  const px = canvas([205, 200, 195])
  const glass = [160, 210, 225]
  triangle(px, [20, 100], [50, 50], [64, 104], glass)
  triangle(px, [60, 108], [84, 40], [100, 100], [190, 225, 235])
  triangle(px, [90, 96], [112, 70], [116, 112], glass)
  triangle(px, [34, 112], [44, 96], [52, 114], [140, 190, 205])
  return px
}
const battery = () => {
  const px = canvas(BG)
  rect(px, 34, 48, 90, 84, [60, 60, 60])
  rect(px, 90, 58, 98, 74, [190, 190, 190])
  rect(px, 34, 48, 62, 84, [230, 180, 40])
  rect(px, 66, 60, 74, 72, [240, 240, 240])
  rect(px, 68, 56, 72, 76, [240, 240, 240])
  return px
}
const chemical = () => {
  const px = canvas(BG)
  rect(px, 40, 44, 88, 108, [230, 230, 235])
  rect(px, 52, 28, 76, 44, [200, 60, 50])
  triangle(px, [64, 50], [50, 78], [78, 78], [235, 60, 40])
  rect(px, 62, 58, 66, 70, [255, 255, 255])
  rect(px, 62, 72, 66, 76, [255, 255, 255])
  return px
}
// A bright banner stripe stands in for "a sign with instructions". The fixture contains no readable text:
// injection wording for these cases is carried in the note, and the limitation is documented in eval/README.md.
const signBanner = () => {
  const px = glassJar()
  rect(px, 0, 4, SIZE, 24, [250, 240, 80])
  for (let x = 6; x < SIZE - 6; x += 10) rect(px, x, 10, x + 6, 18, [30, 30, 30])
  return px
}

const FIXTURES = {
  'glass-jar.png': glassJar(),
  'plastic-bottle.png': plasticBottle(),
  'mixed-material.png': ambiguousMaterial(),
  'blurry-object.png': blur(glassJar(), 6, 4),
  'broken-glass.png': brokenGlass(),
  'battery.png': battery(),
  'chemical-bottle.png': chemical(),
  'injection-sign.png': signBanner(),
}

mkdirSync(OUT, { recursive: true })
for (const [name, pixels] of Object.entries(FIXTURES)) {
  writeFileSync(join(OUT, name), encodePng(pixels))
  console.log(`wrote eval/fixtures/${name}`)
}
