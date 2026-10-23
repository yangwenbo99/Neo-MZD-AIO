import path from 'node:path'
import { readFile, readdir, chmod } from 'node:fs/promises'
import { tweakRoot } from './resources.js'

const root = path.join(tweakRoot, 'cmu-autorun')
const recoveryDirectories = ['02-run-tweaks-from-usb', '02-start-sshd-and-open-firewall', '02-update-etc-passwd-if-needed', '02-update-sshd-config-if-needed', '44-recovery-recovery']
const quote = value => `'${value.replaceAll("'", "'\\''")}'`

export function createAutorunPlan (config) {
  const options = config.autorun
  const serial = options.mode === 'serial'
  const prefix = serial ? 'XX/' : ''
  const steps = []
  const copy = (source, target, label, directory = false) => steps.push({ kind: 'copy', source: path.join(root, source), target: prefix + target, directory, omitReadme: true, autorunPermissions: true, label })
  const file = (source, target, transform, label) => steps.push({ kind: 'autorun_file', ...(source ? { source: path.join(root, source) } : {}), target: prefix + target, transform, label })
  if (options.mode === 'dry_run') {
    copy('sdcard/dryrun/run.sh', 'run.sh', 'standalone autorun success-dialog test')
    return { config, steps }
  }
  copy('installer/autorun', 'autorun', 'CMU-autorun boot entry')
  if (!serial) {
    for (const name of ['cmu_dataretrieval.up', 'dataRetrieval_config.txt', 'jci-autoupdate', 'utils.sh']) copy(`installer/${name}`, name, `autorun installer: ${name}`)
    file('installer/tweaks.sh', 'tweaks.sh', 'installer', 'configure CMU-autorun installer prompts')
  }
  if (options.id7_recovery || serial) {
    for (const name of recoveryDirectories) copy(`sdcard/recovery/${name}`, name, `ID7 recovery: ${name}`, true)
  }
  if (options.ssh_over_adb) {
    copy('sdcard/recovery-extra/02-start-adb', '02-start-adb', 'automatic SSH-over-ADB on port 2222', true)
    copy('sdcard/recovery-extra/adb', 'adb', 'bundled vehicle-side ADB executable')
  }
  if (options.wifi_ap.enabled) {
    const directory = '02-start-wifiAP'
    file(`sdcard/recovery-extra/${directory}/jci-wifiap.sh`, `${directory}/jci-wifiap.sh`, 'wifi_ap', 'configure automatic Wi-Fi AP (channel 9, WPA2, 192.168.53.1)')
    file(`sdcard/recovery-extra/${directory}/start-WiFi-AP.autorun`, `${directory}/start-WiFi-AP.autorun`, 'wifi_start', 'Wi-Fi AP boot hook')
    file(null, `${directory}/wifiAP.config`, 'wifi_config', 'generate Wi-Fi AP credentials')
  }
  if (options.include_dry_run && !serial) copy('sdcard/dryrun/run.sh', 'run.sh', 'autorun success-dialog test (run.sh)')
  return { config, steps }
}

export async function autorunFile (step, config) {
  const options = config.autorun
  if (step.transform === 'wifi_config') return `# Generated Wi-Fi access-point configuration\nexport NETWORK_WIFI_SSID=${quote(options.wifi_ap.ssid)}\nexport NETWORK_WIFI_PASSWORD=${quote(options.wifi_ap.password)}\n`
  let text = (await readFile(step.source, 'utf8')).replace(/\r\n?/g, '\n')
  if (step.transform === 'installer' && !options.skip_confirmation) text = text.replace(/^([ \t]*)# confirmation /gm, '$1')
  if (step.transform === 'wifi_ap' || step.transform === 'wifi_start') {
    text = text.replaceAll('. `dirname $0`/wifiAP.config', '. "$(dirname "$0")/wifiAP.config"')
  }
  if (step.transform === 'wifi_ap') {
    // hostapd values must retain spaces, quotes, and glob characters literally.
    text = text.replace("echo 'wpa_passphrase='$NETWORK_WIFI_PASSWORD''", 'printf \'%s\\n\' "wpa_passphrase=$NETWORK_WIFI_PASSWORD"')
      .replace("echo 'ssid='$NETWORK_WIFI_SSID''", 'printf \'%s\\n\' "ssid=$NETWORK_WIFI_SSID"')
  }
  if (step.transform === 'wifi_start') {
    text = text.replace('dos2unix `dirname $0`/wifiAP.config', '# wifiAP.config is generated with LF line endings')
      .replace('[ $NETWORK_WIFI_PASSWORD == "YourSSIDpassword" ]', '[ "$NETWORK_WIFI_PASSWORD" = "YourSSIDpassword" ]')
      .replace('/bin/sh `dirname $0`/jci-wifiap.sh', '/bin/sh "$(dirname "$0")/jci-wifiap.sh"')
  }
  return text.endsWith('\n') ? text : text + '\n'
}

// Git stores the bundled scripts and ADB binaries without executable bits.
// Set them in the package, so it also works on filesystems that retain modes.
export async function autorunPermissions (target, directory) {
  if (directory) {
    for (const entry of await readdir(target, { withFileTypes: true })) await autorunPermissions(path.join(target, entry.name), entry.isDirectory())
  } else if (/\.(sh|autorun)$/.test(target) || ['autorun', 'adb', 'start_fw_in_background'].includes(path.basename(target))) await chmod(target, 0o755)
}
