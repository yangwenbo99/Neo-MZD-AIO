import fs from 'node:fs'
import { access, readdir, lstat, mkdir, chmod } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Transform, Writable } from 'node:stream'
import { crc32 } from 'node:zlib'
import yauzl from 'yauzl'
import sharp from 'sharp'

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
export const tweakRoot = path.join(repoRoot, 'app/files/tweaks')

export async function checkPath (source, kind = 'file') {
  try {
    const stat = await lstat(source)
    if (stat.isSymbolicLink() || !(kind === 'directory' ? stat.isDirectory() : stat.isFile())) throw new Error(`expected a regular ${kind}`)
    await access(source, fs.constants.R_OK)
    if (kind === 'directory') {
      const entries = await readdir(source)
      for (const entry of entries) {
        const child = path.join(source, entry)
        const info = await lstat(child)
        await checkPath(child, info.isDirectory() ? 'directory' : 'file')
      }
    }
  } catch (error) {
    throw new Error(`${source}: ${error.message}`)
  }
}

export async function checkThemeDirectory (source) {
  await checkPath(source, 'directory')
  let count = 0
  async function walk (directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) await walk(path.join(directory, entry.name))
      else if (path.extname(entry.name).toLowerCase() === '.png') count++
    }
  }
  await walk(source)
  if (!count) throw new Error(`${source}: theme directory must contain PNG images`)
}

export async function checkImage (source) {
  await checkPath(source)
  try {
    const metadata = await sharp(source).metadata()
    if (!['png', 'jpeg'].includes(metadata.format)) throw new Error('expected PNG or JPEG')
    // Decode as well as inspecting the header, so truncated images fail validation.
    await sharp(source).resize(1, 1).raw().toBuffer()
  } catch (error) { throw new Error(`${source}: ${error.message}`) }
}

// Stream archives (the bundled swapfile expands to 1 GiB). This same reader is
// used by validation and assembly, including CRC and path/type checks.
export async function readZip (source, destination, { jci = false } = {}) {
  await checkPath(source)
  const zip = await new Promise((resolve, reject) => yauzl.open(source, { lazyEntries: true, autoClose: false }, (error, zip) => error ? reject(error) : resolve(zip)))
  const names = new Set()
  let hasJci = false
  try {
    await new Promise((resolve, reject) => {
      zip.on('error', reject)
      zip.on('end', resolve)
      zip.on('entry', entry => {
        ;(async () => {
          const name = entry.fileName
          if (!name || name.includes('\\') || name.includes('\0') || name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').includes('..')) throw new Error(`unsafe ZIP path: ${name}`)
          if (names.has(name)) throw new Error(`duplicate ZIP path: ${name}`)
          names.add(name)
          const type = (entry.externalFileAttributes >>> 16) & 0xf000
          if (type && ![0x4000, 0x8000].includes(type)) throw new Error(`unsupported ZIP entry type: ${name}`)
          const selected = !jci || name.startsWith('jci/')
          if (!name.endsWith('/') && name.startsWith('jci/')) hasJci = true
          const target = destination && selected ? path.join(destination, name) : undefined
          if (name.endsWith('/')) {
            if (target) await mkdir(target, { recursive: true })
          } else {
            const stream = await new Promise((resolve, reject) => zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream)))
            let crc = 0
            const checksum = new Transform({ transform (chunk, encoding, callback) { crc = crc32(chunk, crc); callback(null, chunk) } })
            if (target) await mkdir(path.dirname(target), { recursive: true })
            await pipeline(stream, checksum, target ? fs.createWriteStream(target, { flags: 'wx' }) : new Writable({ write (chunk, encoding, callback) { callback() } }))
            if (crc !== entry.crc32) throw new Error(`CRC mismatch: ${name}`)
            if (target) await chmod(target, 0o644 | ((entry.externalFileAttributes >>> 16) & 0o111))
          }
          zip.readEntry()
        })().catch(reject)
      })
      zip.readEntry()
    })
    if (jci && !hasJci) throw new Error('archive must contain a nonempty jci/ tree')
    return names
  } catch (error) {
    throw new Error(`${source}: ${error.message}`)
  } finally { zip.close() }
}

export async function renderImage (source, target, width, height) {
  await mkdir(path.dirname(target), { recursive: true })
  await sharp(source).rotate().resize(width, height, { fit: 'fill' }).png().toFile(target)
}

export async function renderRotation (images, target) {
  const buffers = await Promise.all(images.map(source => sharp(source).rotate().resize(800, 480, { fit: 'fill' }).png().toBuffer()))
  await mkdir(path.dirname(target), { recursive: true })
  await sharp({ create: { width: 800 * images.length, height: 480, channels: 4, background: '#000000' } }).composite(buffers.map((input, index) => ({ input, left: index * 800, top: 0 }))).png().toFile(target)
}
