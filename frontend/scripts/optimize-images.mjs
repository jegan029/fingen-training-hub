// Crop, resize and convert home page photos to AVIF + WebP.
// Usage: node scripts/optimize-images.mjs <folder with source JPEGs>
// Sources are large originals from Pexels (see src/assets/images/CREDITS.md) and are not committed.
import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const OUT = path.resolve('src/assets/images')
const WIDTHS = [400, 800, 1200] // cards show at ~400 CSS px, the featured tile at ~650; covers 2x screens
const MAX_BYTES = 200 * 1024

// Crop boxes are in source pixels (sources are 2400px wide). Omitted = centred 16:9.
const PHOTOS = [
  // Keeps the engineer and her reflection; excludes vendor logos on the left-hand racks.
  { name: 'platform', file: 'platform.jpg', crop: { left: 700, top: 180, width: 1700, height: 956 } },
  // Portrait original: both faces and the pointing arm.
  { name: 'support', file: 'support.jpg', crop: { left: 0, top: 820, width: 2400, height: 1350 } },
  { name: 'assessment', file: 'assessment.jpg' },
  { name: 'analytics', file: 'analytics.jpg' },
]

function centred169(width, height) {
  const h = Math.round((width * 9) / 16)
  if (h <= height) return { left: 0, top: Math.round((height - h) / 2), width, height: h }
  const w = Math.round((height * 16) / 9)
  return { left: Math.round((width - w) / 2), top: 0, width: w, height }
}

const srcDir = process.argv[2]
if (!srcDir) {
  console.error('Usage: node scripts/optimize-images.mjs <source folder>')
  process.exit(1)
}
await mkdir(OUT, { recursive: true })

let failed = false
for (const photo of PHOTOS) {
  const input = path.join(srcDir, photo.file)
  const meta = await sharp(input).metadata()
  const crop = photo.crop ?? centred169(meta.width, meta.height)
  for (const width of WIDTHS) {
    const base = sharp(input)
      .extract(crop)
      .resize({ width, height: Math.round((width * 9) / 16), fit: 'cover' })
    const outputs = [
      [`${photo.name}-${width}.avif`, base.clone().avif({ quality: 50, effort: 6 })],
      [`${photo.name}-${width}.webp`, base.clone().webp({ quality: 74 })],
    ]
    for (const [file, pipeline] of outputs) {
      await pipeline.toFile(path.join(OUT, file))
      const { size } = await stat(path.join(OUT, file))
      if (size > MAX_BYTES) failed = true
      console.log(
        `${file.padEnd(24)} ${(size / 1024).toFixed(1).padStart(6)} KB${size > MAX_BYTES ? '  TOO LARGE' : ''}`,
      )
    }
  }
}
if (failed) process.exit(1)
