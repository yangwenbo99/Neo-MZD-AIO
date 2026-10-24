import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, mkdir, rm, readdir, stat, access } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { crc32 } from 'node:zlib'
import vm from 'node:vm'
import sharp from 'sharp'
import xml2js from 'xml2js'
import { registry, audioSources, languages } from '../src/registry.js'
import { loadConfig, normalizeConfig } from '../src/config.js'
import { createPlan, validatePlan, variables } from '../src/plan.js'
import { buildPackage, fragmentText } from '../src/build.js'
import { repoRoot, tweakRoot, readZip } from '../src/resources.js'
import { metrics } from '../src/speedometer.js'

const scratch = process.env.MZD_AIO_TEST_TMP || (await access('/tmp/opencode').then(() => '/tmp/opencode', () => os.tmpdir()))
const temp = async t => {
  const directory = await mkdtemp(path.join(scratch, 'mzd-cli-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}
const input = (tweaks, installer = {}, resources = {}) => ({ schema_version: 1, installer, resources, tweaks })
const install = options => ({ action: 'install', ...(options ? { options } : {}) })
const uninstall = { action: 'uninstall' }
const config = value => normalizeConfig(value, path.join(repoRoot, 'test.yaml'))
const prepare = value => validatePlan(createPlan(config(value)))
const imagePath = path.join(repoRoot, 'background-images/default/default.png')
const offscreenPath = path.join(repoRoot, 'background-images/default/OffScreenBackground.png')
const cli = (args, options = {}) => spawnSync(process.execPath, [path.join(repoRoot, 'cli/bin/mzd-aio.js'), ...args], { encoding: 'utf8', ...options })
const scriptNames = plan => plan.steps.filter(step => step.kind === 'fragment').map(step => path.basename(step.source))

// Small stored ZIP fixture writer, independent of the production ZIP reader.
function zipBytes (files) {
  const local = []
  const directory = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const key = Buffer.from(name)
    const data = Buffer.from(content)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50)
    header.writeUInt16LE(20, 4)
    header.writeUInt32LE(crc32(data), 14)
    header.writeUInt32LE(data.length, 18)
    header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(key.length, 26)
    local.push(header, key, data)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt32LE(crc32(data), 16)
    entry.writeUInt32LE(data.length, 20)
    entry.writeUInt32LE(data.length, 24)
    entry.writeUInt16LE(key.length, 28)
    entry.writeUInt32LE(offset, 42)
    directory.push(entry, key)
    offset += header.length + key.length + data.length
  }
  const central = Buffer.concat(directory)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(central.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, central, end])
}

async function colorPack (directory) {
  for (const color of ['Red', 'Blue', 'Green', 'Silver', 'Pink', 'Purple', 'Orange', 'Yellow', 'carOS']) {
    await mkdir(path.join(directory, color), { recursive: true })
    await writeFile(path.join(directory, color, 'jci.zip'), zipBytes({ 'jci/gui/common/images/marker.png': color }))
  }
  await writeFile(path.join(directory, 'Blue/_skin_jci_bluedemo.zip'), zipBytes({ skin: 'blue' }))
  return { color_schemes: directory }
}

test('registry covers the approved catalogue and source defaults', async () => {
  const guide = await readFile(path.join(repoRoot, 'docs/CLI.md'), 'utf8')
  const documented = [...guide.matchAll(/^\| `([a-z_]+)` \| I(?:\/U)? \|/gm)].map(match => match[1])
  assert.equal(documented.length, 40)
  assert.deepEqual(new Set(Object.keys(registry)), new Set(documented))
  assert.equal(config(input({ android_auto: install() })).tweaks.android_auto.options.disable_touchscreen, false)
  const source = {}
  vm.runInNewContext((await readFile(path.join(repoRoot, 'app/assets/js/spdValues.js'), 'utf8')).split('// Push Disable')[0], source)
  const defaults = config(input({ speedometer: install() })).tweaks.speedometer.options
  assert.deepEqual(metrics.map(row => row[1]), Array.from(source.spdValues, row => row.elmnt))
  assert.deepEqual(metrics.map(row => row[2]), Array.from(source.spdValues, row => row.class))
  for (const [index, [key]] of metrics.entries()) assert.deepEqual(defaults.bar_layout[key], Array.from(source.spdValues[index].pos, Number))
  for (const [key, , className] of metrics) {
    const field = source.classicSpeedoTmplt.find(row => row.class === className)
    if (field) assert.equal(defaults.classic_layout[key], field.pos)
  }
  const audio = {}
  vm.runInNewContext(await readFile(path.join(repoRoot, 'app/assets/js/audioSourceList.js'), 'utf8'), audio)
  assert.deepEqual(Object.values(audioSources), Array.from(audio.entertainmentItems, row => [row.menuItem, row.pos]))
  const messages = await xml2js.parseStringPromise(await readFile(path.join(tweakRoot, 'config/message_replies/jci/settings/configurations/blm_msg-system.xml'), 'utf8'))
  assert.deepEqual(new Set(languages), new Set(messages.Node.Node.find(node => node.$.key === 'PresetMessages').Node.map(node => node.$.key)))
})

test('strict configuration errors identify the setting', async t => {
  const cases = [
    [{}, /schema_version/], [input({}), /nonempty/], [input({ casdk: install() }), /unknown or deferred/],
    [input({ enable_wifi: uninstall }), /action/], [input({ main_menu_loop: { ...uninstall, options: {} } }), /uninstall accepts only/],
    [input({ main_menu_loop: install({ unknown: 1 }) }), /unknown setting/],
    [input({ touchscreen: install({ enable_dvd: 'true' }) }), /enable_dvd.*true or false/],
    [input({ statusbar: install({ opacity: 2 }) }), /opacity/], [input({ ui_style: install({ title_color: 'red' }) }), /title_color/],
    [input({ theme: install() }), /exactly one/], [input({ remove_overlays: install() }), /at least one overlay/],
    [input({ background: install() }), /image.*required/], [input({ main_menu: install({ small_focus: true }) }), /small_coins/],
    [input({ date_to_statusbar: install({ version: 'v1' }) }), /version.*v3/],
    [input({ android_auto: install({ gps_source: 'phone', reverse_heading: true }) }), /gps_source/],
    [input({ speedometer: install({ fuel_gauge_unit: 'l' }) }), /fuel_tank_capacity/],
    [input({ speedometer: install({ bottom_rows: 3 }) }), /unavailable visible slot/],
    [input({ speedometer: install({ bar_layout: { gps_speed: [0, 0, 0] } }) }), /duplicate visible slot/],
    [input({ speedometer: install({ controls: { bar: { up: 'toggle_analog' } } }) }), /controls.bar.up/],
    [input({ background: install({ image: imagePath }), background_rotator: install({ images: [imagePath, imagePath] }) }), /cannot both/],
    [input({ theme: install({ archive: 'x.zip', include_background: true }), background: install({ image: imagePath }) }), /include_background conflicts/],
    [input({ theme: uninstall, color_scheme: uninstall }), /mutually exclusive/],
    [input({ main_menu_loop: install() }, { script_name: 'run.sh', retrieve_cmu_data: true }), /normal USB bootstrap/],
    [input({ audio_source_order: install({ positions: { fm: 100 } }) }), /positions.fm/],
    [input({ message_replies: install({ messages: { US_English: ['one'] } }) }), /15 items/],
    [input({ message_replies: install({ messages: { US_English: Array(15).fill('\x01') } }) }), /XML 1.0/]
  ]
  for (const [value, message] of cases) assert.throws(() => config(value), message)
  const directory = await temp(t)
  const yaml = path.join(directory, 'invalid.yaml')
  for (const text of [
    'schema_version: 1\ntweaks: {main_menu_loop: {action: install, action: uninstall}}',
    'schema_version: 1\ntweaks: [',
    'schema_version: 1\ninstaller: &settings {keep_backups: true}\ntweaks: {main_menu_loop: *settings}',
    'schema_version: 1\ntweaks: {main_menu_loop: {action: install}}\n---\nschema_version: 1'
  ]) {
    await writeFile(yaml, text)
    await assert.rejects(loadConfig(yaml))
  }
  await writeFile(yaml, 'schema_version: 1\ntweaks:\n  background:\n    action: install\n    options: {image: "./image with spaces.png"}\n')
  const normalized = await loadConfig(yaml)
  assert.equal(normalized.tweaks.background.options.image, path.join(directory, 'image with spaces.png'))
})

test('all supported actions resolve local resources and assemble complete packages', async t => {
  const directory = await temp(t)
  const resources = await colorPack(path.join(directory, 'color pack'))
  const overrides = {
    blank_album_art: { image: imagePath }, offscreen_background: { image: offscreenPath },
    background_rotator: { images: [imagePath, offscreenPath], seconds_per_image: 7 },
    remove_overlays: { buttons: true }, theme: { archive: path.join(tweakRoot, 'config/themes/Mazda.zip') },
    boot_animation: { loop: 'matrix', transition: 'original', ending: 'cinema' },
    speedometer: { language: 'sk', speed_unit: 'mph', temperature_unit: 'f', fuel_gauge_unit: 'l', fuel_tank_capacity: 50, statusbar: { enabled: true, digital_clock: true, hide_in_reverse: true }, controls: { bar: { hold_left: 'toggle_statusbar' } } },
    android_auto: { wifi: true, debug_logging: true, gps_source: 'phone', disable_touchscreen: true },
    aio_app: { screen_off_on_boot: true }, message_replies: { messages: { US_English: Array.from({ length: 15 }, (_, i) => `Reply ${i + 1} <&> "'`) } }
  }
  // Cover every ordinary install in one package, with exclusive choices tested below.
  const selections = Object.fromEntries(Object.keys(registry).filter(name => !['theme', 'background', 'swapfile'].includes(name)).map(name => [name, install(overrides[name])]))
  const plan = await prepare(input(selections, { retrieve_cmu_data: true }, resources))
  const output = await buildPackage(plan, path.join(directory, 'all-install'))
  const script = await readFile(path.join(output, 'tweaks.sh'), 'utf8')
  assert.equal(spawnSync('bash', ['-n', path.join(output, 'tweaks.sh')]).status, 0)
  assert.ok(!script.includes('\r'))
  assert.ok(script.startsWith('#!/bin/sh\n'))
  assert.ok(script.indexOf('# CLI: install usb_audio_mod') < script.indexOf('# CLI: install bigger_album_art'))
  assert.ok(script.endsWith('exit 0\n') || script.endsWith('exit\n'))
  assert.match(script, /TranLogoEndCinemma\.ivf/)
  assert.doesNotMatch(script, /19_set_sb_values|slovic|TranLogoEndCinema\.ivf/)
  assert.match(script, /MZD-AIO-TI STATUSBAR CSS/)
  for (const target of ['config/jci/opera/opera_dir/userjs/additionalApps.js', 'config/jci/gui/addon-common/websocketd', 'config/bin/node', 'config/mzdmeter/paa', 'config/bootanimation/jci/resources/TranLogoEndCinemma.ivf']) await access(path.join(output, target))
  const headunit = JSON.parse(await readFile(path.join(output, 'config/androidauto/data_persist/dev/bin/headunit.json'), 'utf8'))
  assert.equal(headunit.carGPS, false)
  assert.equal(headunit.disableTouchscreen, true)
  for (const target of ['config/androidauto/data_persist/dev/bin/headunit-wrapper', 'config/androidautowifi/headunit-wrapper']) assert.match(await readFile(path.join(output, target), 'utf8'), /^DEBUG=1/m)
  const startup = await readFile(path.join(output, 'config/speedometer/jci/gui/apps/_speedometer/js/speedometer-startup.js'), 'utf8')
  new vm.Script(startup)
  assert.match(startup, /var language = "SK";/)
  assert.match(startup, /var sbInterval = 2000;/)
  assert.match(startup, /var fuelGaugeFactor = 50;/)
  const controls = {}
  vm.runInNewContext(await readFile(path.join(output, 'config/speedometer/speedometer-controls.js'), 'utf8'), controls)
  assert.equal(controls.spdBtn.bar.hold.left, '10')
  const speed = {}
  vm.runInNewContext(await readFile(path.join(output, 'config/speedometer/speedometer-config.js'), 'utf8'), speed)
  assert.deepEqual(Array.from(speed.spdTbl.engLoad), [1, 1, 0])
  const messages = await xml2js.parseStringPromise(await readFile(path.join(output, 'config/message_replies/jci/settings/configurations/blm_msg-system.xml'), 'utf8'))
  assert.equal(messages.Node.Node.find(node => node.$.key === 'PresetMessages').Node.find(node => node.$.key === 'US_English').Node[0].$.value, 'Reply 1 <&> "\'')
  const rotation = await sharp(path.join(output, 'config/background.png')).metadata()
  assert.deepEqual([rotation.width, rotation.height], [1600, 480])
  assert.ok((await stat(path.join(output, 'tweaks.sh'))).mode & 0o111)
  assert.equal(await readFile(path.join(output, 'dataRetrieval_config.txt'), 'utf8'), await readFile(path.join(tweakRoot, 'root/data/dataRetrieval_config.txt'), 'utf8'))

  const removals = Object.fromEntries(Object.keys(registry).filter(name => registry[name].uninstall && name !== 'theme').map(name => [name, uninstall]))
  const removalPlan = await prepare(input(removals, {}, resources))
  const removalOutput = await buildPackage(removalPlan, path.join(directory, 'all-uninstall'))
  assert.equal(spawnSync('bash', ['-n', path.join(removalOutput, 'tweaks.sh')]).status, 0)
  assert.match(await readFile(path.join(removalOutput, 'tweaks.sh'), 'utf8'), /remove_aio_css \/jci\/gui\/common\/controls\/Sbn\/css\/SbnCtrl.css STATUSBAR/)
  await access(path.join(removalOutput, 'config/color-schemes/Red/jci/gui/common/images/marker.png'))
})

test('mixed-action fixture preserves order, fallback payloads, and literal text escaping', async t => {
  const directory = await temp(t)
  const fixture = JSON.parse(await readFile(new URL('./fixtures/mixed-package.json', import.meta.url), 'utf8'))
  const text = `A "quote" / slash & ampersand 'single' \\ $(touch NEVER) $HOME`
  const plan = await prepare(input({ bigger_album_art: install(), usb_audio_mod: install({ gracenote_text: text }), pause_on_mute: uninstall, main_menu_loop: install(), speedometer: uninstall, transparent_parking_sensors: uninstall }))
  assert.deepEqual(scriptNames(plan), fixture.fragments)
  const output = await buildPackage(plan, path.join(directory, 'mixed'))
  for (const file of fixture.files) await access(path.join(output, file))
  await assert.rejects(access(path.join(output, 'config/jci')))
  const script = await readFile(path.join(output, 'tweaks.sh'), 'utf8')
  assert.equal(spawnSync('bash', ['-n', path.join(output, 'tweaks.sh')]).status, 0)
  const target = path.join(directory, 'usbaudioApp.js')
  await writeFile(target, await readFile(path.join(output, 'config/USBAudioMod/usbaudioApp.js')))
  const command = variables(plan.config) + `\nsed -i "s/GRACENOTETEXT/\${GRACENOTE}/g" "$1"\n`
  const escaped = spawnSync('sh', ['-c', command, 'test', target], { encoding: 'utf8' })
  assert.equal(escaped.status, 0, escaped.stderr)
  const js = await readFile(target, 'utf8')
  new vm.Script(js)
  const value = js.match(/this.AIO_gracenoteText = ("(?:\\.|[^"\\])*");/)[1]
  assert.equal(JSON.parse(value), text)
  assert.ok(!script.includes('\r'))
})

test('example commands work offline from another directory and repeated builds are independent', async t => {
  const directory = await temp(t)
  const blocked = path.join(repoRoot, 'cli/test/fixtures/block-network.js')
  const run = args => cli(args, { cwd: directory, env: { ...process.env, LANG: 'tr_TR.UTF-8', DISPLAY: '', NODE_OPTIONS: `--import=${blocked}` } })
  assert.equal(run(['list']).status, 0)
  assert.equal(run(['validate', path.join(repoRoot, 'examples/tweaks.yaml')]).status, 0)
  assert.equal(run(['plan', path.join(repoRoot, 'examples/tweaks.yaml')]).status, 0)
  const result = run(['build', path.join(repoRoot, 'examples/tweaks.yaml'), '--output', 'example'])
  assert.equal(result.status, 0, result.stderr)
  const output = path.join(directory, 'example')
  const metadata = await sharp(path.join(output, 'config/background.png')).metadata()
  assert.deepEqual([metadata.width, metadata.height], [800, 480])
  await assert.rejects(access(path.join(output, 'config/bin')))
  const first = await readFile(path.join(output, 'tweaks.sh'))
  const repeat = run(['build', path.join(repoRoot, 'examples/tweaks.yaml'), '--output', 'repeat'])
  assert.equal(repeat.status, 0, repeat.stderr)
  assert.deepEqual(await readFile(path.join(directory, 'repeat/tweaks.sh')), first)
  const existing = run(['build', path.join(repoRoot, 'examples/tweaks.yaml'), '--output', 'example'])
  assert.notEqual(existing.status, 0)
  assert.match(existing.stderr, /already exists/)
  const autorun = await buildPackage(await prepare(input({ main_menu_loop: install() }, { script_name: 'run.sh' })), path.join(directory, 'autorun'))
  await access(path.join(autorun, 'run.sh'))
  await assert.rejects(access(path.join(autorun, 'jci-autoupdate')))
  assert.notEqual(cli(['build', 'missing.yaml']).status, 0)
  assert.notEqual(cli(['list', '--unknown']).status, 0)
  assert.notEqual(cli(['validate']).status, 0)
})

test('themes, color packs, CRC errors, missing resources, and build cleanup', async t => {
  const directory = await temp(t)
  const source = path.join(directory, 'theme.zip')
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer()
  await writeFile(source, zipBytes({
    'jci/gui/common/images/background.png': png, 'jci/gui/common/images/no_artwork_icon.png': png,
    'jci/gui/apps/system/controls/OffScreen/images/OffScreenBackground.png': png,
    'jci/gui/common/images/keep.png': png
  }))
  const plan = await prepare(input({ theme: install({ archive: source }) }))
  const output = await buildPackage(plan, path.join(directory, 'theme-out'))
  const themeRoot = path.join(output, 'config/color-schemes/theme/jci')
  await access(path.join(themeRoot, 'gui/common/images/keep.png'))
  for (const name of ['background.png', 'no_artwork_icon.png']) await assert.rejects(access(path.join(themeRoot, 'gui/common/images', name)))
  await assert.rejects(access(path.join(themeRoot, 'gui/apps/system/controls/OffScreen/images/OffScreenBackground.png')))
  const custom = await buildPackage(await prepare(input({ theme: install({ jci_directory: themeRoot }) })), path.join(directory, 'custom'))
  await access(path.join(custom, 'config/color-schemes/theme/jci/gui/common/images/keep.png'))
  const resources = await colorPack(path.join(directory, 'colors'))
  const restored = await buildPackage(await prepare(input({ theme: uninstall }, {}, resources)), path.join(directory, 'red'))
  await access(path.join(restored, 'config/color-schemes/Red/jci/gui/common/images/marker.png'))
  assert.throws(() => createPlan(config(input({ theme: uninstall }))), /resources.color_schemes/)
  await assert.rejects(prepare(input({ background: install({ image: path.join(directory, 'missing.png') }) })), /image.*missing.png/)
  await writeFile(path.join(directory, 'invalid.png'), 'not a PNG')
  await assert.rejects(prepare(input({ background: install({ image: path.join(directory, 'invalid.png') }) })), /unsupported image format/i)
  const bad = path.join(directory, 'bad.zip')
  const bytes = zipBytes({ 'jci/test.png': 'test' })
  bytes[30 + 'jci/test.png'.length] ^= 1
  await writeFile(bad, bytes)
  await assert.rejects(readZip(bad), /CRC mismatch/)
  await writeFile(bad, zipBytes({ '../escape': 'bad' }))
  await assert.rejects(readZip(bad), /invalid relative path|unsafe ZIP path/)
  const copyFailure = { ...plan, steps: [...plan.steps, { kind: 'copy', source: path.join(directory, 'missing'), target: 'missing', label: 'injected copy failure' }] }
  await assert.rejects(buildPackage(copyFailure, path.join(directory, 'failed')), /injected copy failure/)
  await assert.rejects(access(path.join(directory, 'failed')))
  assert.ok(!(await readdir(directory)).some(name => name.includes('.mzd-aio-')))
  const writeFailure = { ...plan, steps: [...plan.steps, { kind: 'copy', source, target: 'tweaks.sh', label: 'injected conflicting directory', directory: true }] }
  // A directory at the script path produces a real write failure after copying.
  writeFailure.steps[writeFailure.steps.length - 1].source = themeRoot
  await assert.rejects(buildPackage(writeFailure, path.join(directory, 'write-failed')), /EISDIR/)
  await assert.rejects(access(path.join(directory, 'write-failed')))
  assert.ok(!(await readdir(directory)).some(name => name.includes('.mzd-aio-')))
})

test('swapfile is complete at return, runs last, and includes required cleanup', async t => {
  const directory = await temp(t)
  for (const mount of [true, false]) {
    const plan = await prepare(input({ swapfile: install({ mount_on_boot: mount }), main_menu_loop: install() }))
    const fragments = scriptNames(plan)
    assert.deepEqual(fragments.slice(-3), mount ? ['18_swapfile-i.txt', '99_self-destruct.txt', '00_end.txt'] : ['05_mainloop-i.txt', '99_self-destruct.txt', '00_end.txt'])
    const output = await buildPackage(plan, path.join(directory, `swap-${mount}`))
    assert.equal((await stat(path.join(output, mount ? 'config/swapfile/swapfile' : 'swapfile'))).size, 1073741824)
    await rm(output, { recursive: true })
  }
})

test('statusbar removal preserves independently installed date CSS', async () => {
  const plan = createPlan(config(input({ statusbar: uninstall })))
  const step = plan.steps.find(step => step.transform === 'statusbar')
  const text = await fragmentText(step)
  assert.match(text, /Sbn\/css\/SbnCtrl.css/)
  assert.doesNotMatch(text, /SbnBar/)
  // Test the actual bundled removal helper against representative CSS markers.
  const source = await readFile(path.join(tweakRoot, '00_start.txt'), 'utf8')
  const helper = source.slice(source.indexOf('remove_aio_css()'), source.indexOf('remove_aio_js()'))
  const directory = await mkdtemp(path.join(scratch, 'mzd-css-test-'))
  try {
    const css = path.join(directory, 'style.css')
    await writeFile(css, 'base\n/* MZD-AIO-TI D2SB CSS */\ndate\n/* END AIO D2SB CSS */\n/* MZD-AIO-TI CSS */\nlegacy\n/* END AIO CSS */\n/* MZD-AIO-TI STATUSBAR CSS */\nstyle\n/* END AIO STATUSBAR CSS */\n')
    const result = spawnSync('bash', ['-c', `log_message() { :; }\n${helper}\nremove_aio_css "$1"\nremove_aio_css "$1" STATUSBAR`, 'test', css], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(await readFile(css, 'utf8'), 'base\n/* MZD-AIO-TI D2SB CSS */\ndate\n/* END AIO D2SB CSS */\n')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
