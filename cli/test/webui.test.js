import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { startWebUI, relocateConfig } from '../src/webui.js'
import { normalizeConfig, loadConfig, parseConfig } from '../src/config.js'
import { registry } from '../src/registry.js'
import { repoRoot } from '../src/resources.js'

async function setup (t, options = {}) {
  const root = path.join(repoRoot, 'tmp/webui-tests')
  await mkdir(root, { recursive: true })
  const directory = await mkdtemp(path.join(root, 'test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const editor = await startWebUI({ cwd: directory, ...options })
  t.after(() => { editor.server.closeAllConnections(); return new Promise(resolve => editor.server.close(resolve)) })
  const request = async (route, body, headers = {}) => {
    const response = await fetch(editor.url + route, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
    return { response, value: await response.json() }
  }
  return { ...editor, directory, request }
}

test('WebUI serves the CLI catalogue, defaults, local assets and complete option forms', async t => {
  const editor = await setup(t)
  const { response, value } = await editor.request('/api/catalog')
  assert.equal(response.status, 200)
  assert.deepEqual(Object.keys(value.tweaks), Object.keys(registry))
  assert.equal(value.installer.fields.keep_backups.default, true)
  assert.equal(value.tweaks.speedometer.options.fields.speed_unit.default, 'kmh')
  assert.equal(value.tweaks.speedometer.options.fields.fuel_tank_capacity.max, undefined)
  assert.equal(value.tweaks.message_replies.options.fields.messages.presets.US_English.length, 15)
  assert.deepEqual(value.initial.config, { schema_version: 1, tweaks: {} })
  assert.equal(value.initial.filename, path.join(editor.directory, 'tweaks.yaml'))
  for (const asset of ['/', '/app.js', '/style.css', '/reference']) {
    const resource = await fetch(editor.url + asset)
    assert.equal(resource.status, 200)
    assert.ok(resource.headers.get('content-type'))
    const content = await resource.text()
    if (asset === '/') { assert.match(content, /YAML preview/); assert.doesNotMatch(content, /https?:\/\//) }
  }
  const blocked = await editor.request('/api/save', { filename: 'blocked.yaml', config: {} }, { Origin: 'https://example.com' })
  assert.equal(blocked.response.status, 403)
  assert.deepEqual(await readdir(editor.directory), [])
  assert.equal((await fetch(editor.url + '/missing')).status, 404)
})

test('WebUI preserves explicit settings, omissions, and relative paths through save/load', async t => {
  const editor = await setup(t)
  const filename = path.join(editor.directory, 'draft.yaml')
  const config = {
    schema_version: 1,
    installer: { keep_backups: false },
    tweaks: {
      main_menu_loop: { action: 'install' }, pause_on_mute: { action: 'uninstall' },
      background: { action: 'install', options: { image: '../../assets/a picture.png' } },
      speedometer: { action: 'install', options: { controls: { bar: { hold_left: 'none' } }, fuel_bar_colors: { 20: '#123abc' } } },
      usb_audio_mod: { action: 'install', options: { gracenote_text: '' } },
      message_replies: { action: 'install', options: { messages: { US_English: Array(15).fill('日本語 & "quoted"') } } }
    }
  }
  const preview = await editor.request('/api/preview', { filename, config })
  assert.equal(preview.value.error, null)
  assert.deepEqual(parseConfig(preview.value.yaml), config)
  assert.equal(preview.value.baseDirectory, editor.directory)
  const saved = await editor.request('/api/save', { filename, config })
  assert.equal(saved.response.status, 200)
  assert.deepEqual(parseConfig(await readFile(filename, 'utf8')), config)
  const loaded = await editor.request('/api/load', { filename })
  assert.deepEqual(loaded.value.config, config)
  assert.deepEqual(await loadConfig(filename), normalizeConfig(config, filename))
  const relocated = await editor.request('/api/relocate', { config, fromFilename: filename, filename: path.join(editor.directory, 'nested/copy.yml') })
  assert.equal(relocated.response.status, 200)
  assert.equal(relocated.value.config.tweaks.background.options.image, '../../../assets/a picture.png')
  assert.deepEqual(normalizeConfig(relocated.value.config, relocated.value.filename), normalizeConfig(config, filename))
  assert.equal(config.tweaks.background.options.image, '../../assets/a picture.png')
  assert.deepEqual((await editor.request('/api/save', relocated.value)).response.status, 200)
  const invalid = structuredClone(config)
  invalid.tweaks.speedometer.options.unknown = true
  assert.equal((await editor.request('/api/save', { filename, config: invalid })).response.status, 400)
  assert.deepEqual(parseConfig(await readFile(filename, 'utf8')), config)
})

test('WebUI rebases path lists and resource packs while leaving strings and absolute paths intact', () => {
  const from = path.join(repoRoot, 'examples/original.yaml')
  const to = path.join(repoRoot, 'tmp/nested/copy.yaml')
  const absolute = path.join(repoRoot, 'background-images/default/default.png')
  const input = {
    schema_version: 1, resources: { color_schemes: '../packs' }, tweaks: {
      background_rotator: { action: 'install', options: { images: ['../images/a.png', absolute] } },
      theme: { action: 'install', options: { jci_directory: '../custom/jci' } },
      usb_audio_mod: { action: 'install', options: { gracenote_text: '../leave/this/string' } }
    }
  }
  const output = relocateConfig(input, from, to)
  assert.equal(output.resources.color_schemes, '../../packs')
  assert.deepEqual(output.tweaks.background_rotator.options.images, ['../../images/a.png', absolute])
  assert.equal(output.tweaks.theme.options.jci_directory, '../../custom/jci')
  assert.equal(output.tweaks.usb_audio_mod.options.gracenote_text, '../leave/this/string')
  assert.deepEqual(relocateConfig({ schema_version: 1, tweaks: { background: { action: 'install' } } }, from, to), { schema_version: 1, tweaks: { background: { action: 'install' } } })
})

test('example generation, resource checks, file browsing and image preview share the CLI path base', async t => {
  const editor = await setup(t)
  const filename = path.join(editor.directory, 'example.yaml')
  const example = await editor.request('/api/example', { filename })
  assert.equal(example.response.status, 200)
  const expected = await loadConfig(path.join(repoRoot, 'examples/tweaks.yaml'))
  assert.deepEqual(normalizeConfig(example.value.config, filename), expected)
  const validation = await editor.request('/api/validate', example.value)
  assert.equal(validation.response.status, 200)
  assert.match(validation.value.plan, /install main_menu_loop/)
  const invalid = structuredClone(example.value)
  invalid.config.tweaks.background.options.image = 'missing.png'
  const failure = await editor.request('/api/validate', invalid)
  assert.equal(failure.response.status, 400)
  assert.match(failure.value.error, /missing.png/)
  await editor.request('/api/save', example.value)
  const browse = await editor.request('/api/browse?' + new URLSearchParams({ path: editor.directory, kind: 'config', filename }))
  assert.equal(browse.response.status, 200)
  assert.deepEqual(browse.value.entries.map(entry => entry.name), ['example.yaml'])
  assert.equal(browse.value.entries[0].relative, 'example.yaml')
  const images = await editor.request('/api/browse?' + new URLSearchParams({ path: path.join(repoRoot, 'background-images/default'), kind: 'image', filename }))
  assert.ok(images.value.entries.some(entry => entry.name === 'default.png' && entry.relative.includes('background-images/default/default.png')))
  const preview = await fetch(editor.url + '/api/image?' + new URLSearchParams({ filename, path: example.value.config.tweaks.background.options.image }))
  assert.equal(preview.status, 200)
  assert.equal(preview.headers.get('content-type'), 'image/png')
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  assert.deepEqual(await readdir(editor.directory), ['example.yaml'])
})

test('invalid YAML, conflicting selections and bad save paths are reported without changing files', async t => {
  const editor = await setup(t)
  await writeFile(path.join(editor.directory, 'invalid.yaml'), 'schema_version: 1\ntweaks: {main_menu_loop: {action: install, action: uninstall}}\n')
  const loaded = await editor.request('/api/load', { filename: 'invalid.yaml' })
  assert.equal(loaded.response.status, 400)
  assert.match(loaded.value.error, /unique|duplicate/i)
  const config = { schema_version: 1, tweaks: { theme: { action: 'uninstall' }, color_scheme: { action: 'uninstall' } } }
  const preview = await editor.request('/api/preview', { config, filename: 'bad.yaml' })
  assert.match(preview.value.error, /mutually exclusive/)
  assert.equal((await editor.request('/api/save', { config, filename: 'bad.yaml' })).response.status, 400)
  assert.equal((await editor.request('/api/save', { config: { schema_version: 1, tweaks: { main_menu_loop: { action: 'install' } } }, filename: 'not-yaml.js' })).response.status, 400)
  assert.deepEqual(await readdir(editor.directory), ['invalid.yaml'])
})

test('configure command starts with an existing YAML and stops cleanly', async t => {
  const root = path.join(repoRoot, 'tmp/webui-tests')
  await mkdir(root, { recursive: true })
  const directory = await mkdtemp(path.join(root, 'cli-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const filename = path.join(directory, 'settings.yaml')
  await writeFile(filename, 'schema_version: 1\ntweaks:\n  main_menu_loop:\n    action: install\n')
  const child = spawn(process.execPath, [path.join(repoRoot, 'cli/bin/mzd-aio.js'), 'configure', filename, '--no-open', '--port', '0'], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] })
  const exited = once(child, 'exit')
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM') })
  const url = await new Promise((resolve, reject) => {
    let stdout = '', stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk; const match = stdout.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0]) })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.once('error', reject)
    child.once('exit', () => reject(new Error(stderr || stdout)))
  })
  const metadata = await (await fetch(url + '/api/catalog')).json()
  assert.equal(metadata.initial.config.tweaks.main_menu_loop.action, 'install')
  child.kill('SIGTERM')
  assert.deepEqual(await exited, [0, null])
})
