import qrcode from 'qrcode-generator'
import { encodeReferenceTarget, type ReferenceTarget } from './printed-reference'

/** Replace the PNG's physical-resolution chunk without changing its image pixels. */
export function setPngPrintResolution(png: Uint8Array, pixelsPerMetre: number): Uint8Array<ArrayBuffer> {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (!Number.isFinite(pixelsPerMetre) || pixelsPerMetre <= 0 || pixelsPerMetre > 0xffffffff ||
    png.length < 33 || signature.some((byte, index) => png[index] !== byte)) throw new Error('Invalid PNG export')
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const parts: Uint8Array[] = [png.subarray(0, 8)]
  const density = new Uint8Array(21)
  const densityView = new DataView(density.buffer)
  densityView.setUint32(0, 9)
  density.set([112, 72, 89, 115], 4) // pHYs: pixels per metre, equal on both axes
  densityView.setUint32(8, Math.round(pixelsPerMetre))
  densityView.setUint32(12, Math.round(pixelsPerMetre))
  density[16] = 1
  let crc = 0xffffffff
  for (const byte of density.subarray(4, 17)) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  densityView.setUint32(17, (crc ^ 0xffffffff) >>> 0)
  let inserted = false
  for (let offset = 8; offset < png.length;) {
    if (offset + 12 > png.length) throw new Error('Incomplete PNG export')
    const length = view.getUint32(offset)
    const end = offset + length + 12
    if (end > png.length) throw new Error('Incomplete PNG export')
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8))
    if (offset === 8 && (type !== 'IHDR' || length !== 13)) throw new Error('Invalid PNG header')
    // The QR export has no EXIF to retain; drop conflicting embedded DPI values.
    if (type !== 'pHYs' && type !== 'eXIf') parts.push(png.subarray(offset, end))
    if (type === 'IHDR') { parts.push(density); inserted = true }
    offset = end
  }
  if (!inserted) throw new Error('Invalid PNG header')
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let position = 0
  for (const part of parts) { output.set(part, position); position += part.length }
  return output
}

export function createReferencePng(target: ReferenceTarget): Blob {
  const code = qrcode(0, 'M')
  code.addData(encodeReferenceTarget(target))
  code.make()
  const count = code.getModuleCount()
  const cell = 24 // integer pixels keep edges crisp and bound phone memory usage
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = (count + 8) * cell
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Image export is unavailable. Use the SVG print download instead.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#000000'
  for (let row = 0; row < count; row++) {
    for (let column = 0; column < count; column++) {
      if (code.isDark(row, column)) context.fillRect((column + 4) * cell, (row + 4) * cell, cell, cell)
    }
  }
  const encoded = canvas.toDataURL('image/png').split(',')[1]
  if (!encoded) throw new Error('Image export failed. Use the SVG print download instead.')
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
  const image = setPngPrintResolution(bytes, count * cell / (target.sizeMm / 1000))
  return new Blob([image], { type: 'image/png' })
}
