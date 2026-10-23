import http from 'node:http'
import path from 'node:path'
import { readFile, readdir, mkdir, writeFile, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { stringify } from 'yaml'
import sharp from 'sharp'
import xml2js from 'xml2js'
import { registry, installerSchema, object } from './registry.js'
import { normalizeConfig, parseConfig } from './config.js'
import { createPlan, validatePlan, formatPlan } from './plan.js'
import { repoRoot, tweakRoot } from './resources.js'

const webRoot = new URL('../web/', import.meta.url)
const resourceSchema = object({ color_schemes: { type: 'path', kind: 'directory' } })
const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] }
const encode = config => stringify(config, { lineWidth: 100, aliasDuplicateObjects: false })

function filenameAt (filename, cwd) {
  if (typeof filename !== 'string' || !filename.trim() || filename.includes('\0')) throw new Error('Specify a YAML configuration path')
  if (!/\.ya?ml$/i.test(filename)) throw new Error('The configuration path must end in .yaml or .yml')
  return path.resolve(cwd, filename)
}

// Rewrite only known path fields, preserving omissions, relative paths, and all
// explicit values. Incomplete drafts can be relocated before they are valid.
export function relocateConfig (config, fromFilename, toFilename) {
  function visit (schema, value) {
    if (value === undefined) return value
    if (schema.type === 'path' && typeof value === 'string' && value && !path.isAbsolute(value)) {
      return (path.relative(path.dirname(toFilename), path.resolve(path.dirname(fromFilename), value)) || '.').split(path.sep).join('/')
    }
    if (schema.type === 'array' && Array.isArray(value)) return value.map(item => visit(schema.item, item))
    if (schema.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, Object.hasOwn(schema.fields, key) ? visit(schema.fields[key], item) : item]))
    }
    return value
  }
  const result = structuredClone(config)
  if (result?.resources) result.resources = visit(resourceSchema, result.resources)
  for (const [name, selection] of Object.entries(result?.tweaks || {})) {
    if (Object.hasOwn(registry, name) && selection?.options) selection.options = visit(registry[name].options, selection.options)
  }
  return result
}

async function loadDraft (filename) {
  const config = parseConfig(await readFile(filename, 'utf8'), filename)
  normalizeConfig(config, filename)
  return { config, filename }
}

async function saveDraft (filename, config) {
  normalizeConfig(config, filename)
  const yaml = encode(config)
  await mkdir(path.dirname(filename), { recursive: true })
  const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, yaml, { flag: 'wx', mode: 0o644 })
    await rename(temporary, filename)
  } finally { await rm(temporary, { force: true }) }
  return { filename, yaml }
}

async function readBody (request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new Error('Expected application/json')
  let size = 0
  const chunks = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > 2 * 1024 * 1024) throw new Error('Configuration exceeds 2 MiB')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export async function startWebUI ({ filename, port = 0, cwd = process.cwd() } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('port must be an integer between 0 and 65535')
  cwd = path.resolve(cwd)
  const initial = filename ? await loadDraft(filenameAt(filename, cwd)) : { filename: path.join(cwd, 'tweaks.yaml'), config: { schema_version: 1, tweaks: {} } }
  const definitions = Object.fromEntries(Object.entries(registry).map(([name, entry]) => [name, {
    description: entry.description, actions: entry.uninstall ? ['install', 'uninstall'] : ['install'], options: structuredClone(entry.options)
  }]))
  const messages = await xml2js.parseStringPromise(await readFile(path.join(tweakRoot, 'config/message_replies/jci/settings/configurations/blm_msg-system.xml'), 'utf8'))
  definitions.message_replies.options.fields.messages.presets = Object.fromEntries(messages.Node.Node.find(node => node.$.key === 'PresetMessages').Node.map(node => [node.$.key, node.Node.map(message => message.$.value)]))
  let origin
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
    const json = (value, status = 200) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(value, (key, item) => typeof item === 'number' && !Number.isFinite(item) ? undefined : item))
    }
    try {
      if (request.headers.host !== new URL(origin).host || (request.headers.origin && request.headers.origin !== origin)) return json({ error: 'This editor accepts requests from its local address only' }, 403)
      const url = new URL(request.url, origin)
      if (request.method === 'GET' && Object.hasOwn(files, url.pathname)) {
        const [name, type] = files[url.pathname]
        const content = await readFile(new URL(name, webRoot))
        response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` })
        return response.end(content)
      }
      if (request.method === 'GET' && url.pathname === '/reference') {
        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        return response.end(await readFile(path.join(repoRoot, 'docs/CLI-TWEAKS.md')))
      }
      if (request.method === 'GET' && url.pathname === '/api/catalog') return json({ initial, cwd, installer: installerSchema, resources: resourceSchema, tweaks: definitions })
      if (request.method === 'GET' && url.pathname === '/api/browse') {
        const directory = path.resolve(cwd, url.searchParams.get('path') || cwd)
        const base = path.dirname(filenameAt(url.searchParams.get('filename') || initial.filename, cwd))
        const relative = source => (path.relative(base, source) || '.').split(path.sep).join('/')
        const kind = url.searchParams.get('kind')
        const suffix = { image: /\.(png|jpe?g)$/i, zip: /\.zip$/i, config: /\.ya?ml$/i }[kind]
        const entries = (await readdir(directory, { withFileTypes: true }))
          .filter(entry => !entry.isSymbolicLink() && (entry.isDirectory() || (kind !== 'directory' && entry.isFile() && (!suffix || suffix.test(entry.name)))))
          .map(entry => ({ name: entry.name, directory: entry.isDirectory(), path: path.join(directory, entry.name), relative: relative(path.join(directory, entry.name)) }))
          .sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name))
        return json({ directory, parent: path.dirname(directory), relative: relative(directory), entries })
      }
      if (request.method === 'GET' && url.pathname === '/api/image') {
        const configPath = filenameAt(url.searchParams.get('filename'), cwd)
        const source = path.resolve(path.dirname(configPath), url.searchParams.get('path') || '')
        const image = sharp(source)
        const metadata = await image.metadata()
        if (!['png', 'jpeg'].includes(metadata.format)) throw new Error('Preview requires a PNG or JPEG image')
        const content = await image.rotate().resize({ width: 400, height: 240, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
        response.writeHead(200, { 'Content-Type': 'image/png' })
        return response.end(content)
      }
      if (request.method !== 'POST' || !['/api/load', '/api/example', '/api/relocate', '/api/preview', '/api/validate', '/api/save'].includes(url.pathname)) return json({ error: 'Not found' }, 404)
      const body = await readBody(request)
      const target = filenameAt(body.filename, cwd)
      if (url.pathname === '/api/load') return json(await loadDraft(target))
      if (url.pathname === '/api/example') {
        const example = await loadDraft(path.join(repoRoot, 'examples/tweaks.yaml'))
        return json({ filename: target, config: relocateConfig(example.config, example.filename, target) })
      }
      if (url.pathname === '/api/relocate') return json({ filename: target, config: relocateConfig(body.config, filenameAt(body.fromFilename, cwd), target) })
      if (url.pathname === '/api/preview') {
        let error = null
        try { normalizeConfig(body.config, target) } catch (issue) { error = issue.message }
        return json({ yaml: encode(body.config), error, filename: target, baseDirectory: path.dirname(target) })
      }
      if (url.pathname === '/api/validate') {
        const plan = await validatePlan(createPlan(normalizeConfig(body.config, target)))
        return json({ plan: formatPlan(plan) })
      }
      return json(await saveDraft(target, body.config))
    } catch (error) {
      if (!response.headersSent) json({ error: error.message }, 400)
      else response.end()
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      origin = `http://127.0.0.1:${server.address().port}`
      server.removeListener('error', reject)
      resolve()
    })
  })
  return { server, url: origin, filename: initial.filename }
}

export function openWebUI (url) {
  const [command, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]]
  const child = spawn(command, args, { detached: true, stdio: 'ignore' })
  child.on('error', () => console.error(`Open ${url} in your browser.`))
  child.unref()
}
