import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, access, stat } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { normalizeConfig, loadConfig } from '../src/config.js'
import { createPlan, validatePlan, formatPlan } from '../src/plan.js'
import { buildPackage } from '../src/build.js'
import { repoRoot, tweakRoot } from '../src/resources.js'

async function temporary (t) {
  const root = path.join(repoRoot, 'tmp/autorun-tests')
  await mkdir(root, { recursive: true })
  const directory = await mkdtemp(path.join(root, 'test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}
const normalize = autorun => normalizeConfig({ schema_version: 1, autorun }, path.join(repoRoot, 'autorun.yaml'))
const prepare = autorun => validatePlan(createPlan(normalize(autorun)))
async function files (directory, prefix = '') {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name
    if (entry.isDirectory()) result.push(...await files(path.join(directory, entry.name), name + '/'))
    else result.push(name)
  }
  return result.sort()
}
async function syntax (directory) {
  for (const name of await files(directory)) {
    if (!/\.(sh|autorun)$/.test(name) && !name.endsWith('/autorun') && name !== 'autorun') continue
    const result = spawnSync('bash', ['-n', path.join(directory, name)], { encoding: 'utf8' })
    assert.equal(result.status, 0, name + ': ' + result.stderr)
    assert.equal((await stat(path.join(directory, name))).mode & 0o111, 0o111, name)
  }
}

test('autorun modes validate combinations, credentials, defaults and normalization round trips', () => {
  const defaults = normalize({}).autorun
  assert.equal(defaults.mode, 'install')
  assert.equal(defaults.id7_recovery, true)
  assert.equal(defaults.wifi_ap.enabled, false)
  assert.equal(defaults.ssh_over_adb, false)
  for (const mode of ['install', 'serial', 'dry_run']) {
    const value = normalize({ mode })
    assert.deepEqual(normalizeConfig(value, 'round-trip.yaml'), value)
  }
  for (const [input, error] of [
    [null, /autorun.*mapping/], [{ mode: 'unknown' }, /mode/], [{ unknown: true }, /unknown setting/],
    [{ mode: 'serial', id7_recovery: false }, /id7_recovery.*not available/],
    [{ mode: 'serial', include_dry_run: true }, /include_dry_run.*not available/],
    [{ mode: 'serial', skip_confirmation: true }, /skip_confirmation.*not available/],
    [{ mode: 'dry_run', wifi_ap: { enabled: false } }, /wifi_ap.*not available/],
    [{ mode: 'dry_run', ssh_over_adb: true }, /ssh_over_adb.*not available/],
    [{ wifi_ap: { enabled: true } }, /wifi_ap.ssid/],
    [{ wifi_ap: { enabled: true, ssid: 'YourSSID', password: 'a password' } }, /wifi_ap.ssid/],
    [{ wifi_ap: { enabled: true, ssid: 'é'.repeat(17), password: 'a password' } }, /wifi_ap.ssid/],
    [{ wifi_ap: { enabled: true, ssid: 'car\nssid', password: 'a password' } }, /wifi_ap.ssid/],
    [{ wifi_ap: { enabled: true, ssid: 'car', password: 'short' } }, /wifi_ap.password/],
    [{ wifi_ap: { enabled: true, ssid: 'car', password: 'x'.repeat(64) } }, /wifi_ap.password/],
    [{ wifi_ap: { enabled: true, ssid: 'car', password: 'YourSSIDpassword' } }, /wifi_ap.password/],
    [{ wifi_ap: { enabled: true, ssid: 'car', password: '日本語パスワード' } }, /wifi_ap.password/],
    [{ wifi_ap: { enabled: true, ssid: 'car', password: 'has\ttab!' } }, /wifi_ap.password/]
  ]) assert.throws(() => normalize(input), error)
  for (const key of ['tweaks', 'installer', 'resources']) assert.throws(() => normalizeConfig({ schema_version: 1, autorun: {}, [key]: {} }, 'bad.yaml'), /cannot be combined/)
  for (const length of [8, 63]) assert.equal(normalize({ wifi_ap: { enabled: true, ssid: 'é'.repeat(16), password: 'x'.repeat(length) } }).autorun.wifi_ap.password.length, length)
})

test('CMU-autorun installer includes ID7 payloads, original bootstrap, prompts and optional test', async t => {
  const directory = await temporary(t)
  const output = await buildPackage(await prepare({ include_dry_run: true }), path.join(directory, 'package'))
  const manifest = await files(output)
  for (const name of [
    'autorun', 'cmu_dataretrieval.up', 'dataRetrieval_config.txt', 'jci-autoupdate', 'utils.sh', 'tweaks.sh', 'run.sh',
    '02-run-tweaks-from-usb/99-run-tweaks.rules',
    '02-run-tweaks-from-usb/install-udev-handler-if-not-installed.autorun',
    '02-start-sshd-and-open-firewall/start-sshd-and-open-firewall.autorun',
    '02-update-etc-passwd-if-needed/passwd_update.autorun',
    '02-update-sshd-config-if-needed/update-sshd-config-if-needed.autorun',
    '44-recovery-recovery/anti-neutralizeid7.autorun', '44-recovery-recovery/adb'
  ]) assert.ok(manifest.includes(name), name)
  assert.ok(!manifest.some(name => name.startsWith('02-start-adb/') || name.startsWith('02-start-wifiAP/')))
  assert.ok(!manifest.some(name => /README|_readme|autorun\.temp/.test(name)))
  assert.ok(!manifest.includes('adb'))
  assert.deepEqual(await readFile(path.join(output, 'cmu_dataretrieval.up')), await readFile(path.join(tweakRoot, 'cmu-autorun/installer/cmu_dataretrieval.up')))
  const script = await readFile(path.join(output, 'tweaks.sh'), 'utf8')
  assert.match(script, /^\/jci\/tools\/jci-dialog --3-button-dialog/m)
  assert.match(script, /^choice=\$\?/m)
  assert.match(script, /^[ \t]*reboot=\$\?/m)
  assert.doesNotMatch(script, /# confirmation /)
  assert.match(await readFile(path.join(output, 'run.sh'), 'utf8'), /AUTORUN ACTIVATED/)
  assert.equal((await stat(path.join(output, 'tweaks.sh'))).mode & 0o111, 0o111)
  await syntax(output)
})

test('basic autorun, AP-only and ADB-only selections produce independent packages', async t => {
  const directory = await temporary(t)
  const basic = await buildPackage(await prepare({ id7_recovery: false, skip_confirmation: true }), path.join(directory, 'basic'))
  assert.deepEqual(await readdir(basic).then(names => names.sort()), ['MZD_LOG.md', 'autorun', 'cmu_dataretrieval.up', 'dataRetrieval_config.txt', 'jci-autoupdate', 'tweaks.sh', 'utils.sh'])
  assert.match(await readFile(path.join(basic, 'tweaks.sh'), 'utf8'), /^# confirmation choice=\$\?/m)
  const ap = await buildPackage(await prepare({ id7_recovery: false, wifi_ap: { enabled: true, ssid: 'MZD', password: 'test password' } }), path.join(directory, 'ap'))
  await access(path.join(ap, '02-start-wifiAP/wifiAP.config'))
  await assert.rejects(access(path.join(ap, '02-start-adb')))
  await assert.rejects(access(path.join(ap, 'adb')))
  const adb = await buildPackage(await prepare({ id7_recovery: false, ssh_over_adb: true }), path.join(directory, 'adb'))
  assert.deepEqual(await readFile(path.join(adb, 'adb')), await readFile(path.join(tweakRoot, 'cmu-autorun/sdcard/recovery-extra/adb')))
  assert.equal((await stat(path.join(adb, 'adb'))).mode & 0o111, 0o111)
  assert.match(await readFile(path.join(adb, '02-start-adb/ssh-over-adb.sh'), 'utf8'), /adb reverse tcp:2222 tcp:22/)
  await assert.rejects(access(path.join(adb, '02-start-wifiAP')))
  await syntax(ap)
  await syntax(adb)
})

test('serial packages contain XX core files and selected extras without an installer', async t => {
  const directory = await temporary(t)
  const output = await buildPackage(await prepare({ mode: 'serial', ssh_over_adb: true, wifi_ap: { enabled: true, ssid: 'Recovery', password: 'serial password' } }), path.join(directory, 'serial'))
  assert.deepEqual((await readdir(output)).sort(), ['MZD_LOG.md', 'XX'])
  const core = path.join(output, 'XX')
  for (const name of ['autorun', '44-recovery-recovery/adb', '02-start-adb/start-adb-ssh.autorun', 'adb', '02-start-wifiAP/wifiAP.config']) await access(path.join(core, name))
  assert.equal((await stat(path.join(core, '44-recovery-recovery/adb'))).mode & 0o111, 0o111)
  const manifest = await files(core)
  assert.ok(!manifest.some(name => /^(tweaks\.sh|run\.sh|utils\.sh|jci-autoupdate|cmu_dataretrieval\.up|dataRetrieval_config\.txt|autorun\.temp)$/.test(name)))
  assert.match(await readFile(path.join(output, 'MZD_LOG.md'), 'utf8'), /XX\/ \(core files for manual serial installation\)/)
  await syntax(core)
})

test('AP credentials survive shell and hostapd generation literally without entering logs', async t => {
  const directory = await temporary(t)
  const ssid = "MZD ' $(touch injected) *"
  const password = "a ' ; $(touch injected) * \\ end"
  const plan = await prepare({ wifi_ap: { enabled: true, ssid, password } })
  assert.ok(!formatPlan(plan).includes(password))
  const output = await buildPackage(plan, path.join(directory, 'with spaces'))
  const ap = path.join(output, '02-start-wifiAP')
  const script = await readFile(path.join(ap, 'jci-wifiap.sh'), 'utf8')
  const create = script.match(/create_wifi_ap_configuration\(\)\n\{[\s\S]*?\n\}/)[0]
  const hostapd = path.join(directory, 'hostapd.conf')
  const command = `. "$1"\nHOSTAPD_CONF_FILE="$2"\nNETWORK_INTERFACE_NAME=wlan0\nNETWORK_DRIVER_NAME=nl80211\nifconfig() { echo 'wlan0 Link encap:Ethernet HWaddr 01:23:45:67:89:ab'; }\n${create}\ncreate_wifi_ap_configuration\n`
  const result = spawnSync('bash', ['-c', command, 'test', path.join(ap, 'wifiAP.config'), hostapd], { cwd: directory, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const contents = (await readFile(hostapd, 'utf8')).split('\n')
  assert.ok(contents.includes(`ssid=${ssid}`))
  assert.ok(contents.includes(`wpa_passphrase=${password}`))
  assert.ok(contents.includes('channel=9'))
  assert.ok(contents.includes('wpa=2'))
  await assert.rejects(access(path.join(directory, 'injected')))
  assert.ok(!(await readFile(path.join(output, 'MZD_LOG.md'), 'utf8')).includes(password))
  assert.equal((await stat(path.join(ap, 'wifiAP.config'))).mode & 0o777, 0o600)
  await syntax(output)
})

test('dry-run package is a standalone autorun test and missing inputs leave no output', async t => {
  const directory = await temporary(t)
  const output = await buildPackage(await prepare({ mode: 'dry_run' }), path.join(directory, 'test'))
  assert.deepEqual((await readdir(output)).sort(), ['MZD_LOG.md', 'run.sh'])
  assert.deepEqual(await readFile(path.join(output, 'run.sh')), await readFile(path.join(tweakRoot, 'cmu-autorun/sdcard/dryrun/run.sh')))
  await syntax(output)
  const broken = await prepare({})
  broken.steps[0].source = path.join(directory, 'missing-autorun')
  await assert.rejects(validatePlan(broken), /CMU-autorun boot entry.*missing-autorun/)
  await assert.rejects(buildPackage(broken, path.join(directory, 'failed')), /CMU-autorun boot entry/)
  assert.deepEqual(await readdir(directory), ['test'])
})

test('autorun examples validate and build offline through CLI from another directory', async t => {
  const directory = await temporary(t)
  const blocked = path.join(repoRoot, 'cli/test/fixtures/block-network.js')
  const run = args => spawnSync(process.execPath, [path.join(repoRoot, 'cli/bin/mzd-aio.js'), ...args], { cwd: directory, env: { ...process.env, DISPLAY: '', NODE_OPTIONS: `--import=${blocked}` }, encoding: 'utf8' })
  assert.match(run(['list', 'autorun']).stdout, /ssh_over_adb/)
  for (const name of ['autorun', 'serial', 'autorun-test']) {
    const filename = path.join(repoRoot, `examples/${name}.yaml`)
    await loadConfig(filename)
    for (const args of [['validate', filename], ['plan', filename], ['build', filename, '--output', name]]) {
      const result = run(args)
      assert.equal(result.status, 0, result.stderr)
      assert.match(result.stdout, /autorun|Autorun|Built/)
    }
  }
  const existing = run(['build', path.join(repoRoot, 'examples/autorun.yaml'), '--output', 'autorun'])
  assert.notEqual(existing.status, 0)
  assert.match(existing.stderr, /already exists/)
})
