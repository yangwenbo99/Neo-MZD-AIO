import { cp, readFile, writeFile, mkdir, mkdtemp, rename, rm, lstat, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import xml2js from 'xml2js'
import { readZip, renderImage, renderRotation } from './resources.js'
import { variables, audioOrderFile, formatPlan } from './plan.js'
import { speedometerFiles, metricClass } from './speedometer.js'

const lf = value => value.replace(/\r\n?/g, '\n')
const exists = async name => {
  try { await lstat(name); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error }
}
const write = async (root, name, value) => {
  const target = path.join(root, name)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, value, { mode: 0o644 })
}

async function edit (root, name, transform) {
  const target = path.join(root, name)
  await writeFile(target, transform(lf(await readFile(target, 'utf8'))))
}

function replaceVariable (text, key, value) {
  const pattern = new RegExp(`^var ${key} = .*;`, 'm')
  if (!pattern.test(text)) throw new Error(`bundled speedometer variable not found: ${key}`)
  return text.replace(pattern, () => `var ${key} = ${JSON.stringify(value)};`)
}

async function generate (name, plan, root) {
  const selection = plan.config.tweaks[name]
  const options = selection?.options
  if (name === 'variables') return variables(plan.config)
  if (name === 'audio_source_order') {
    await write(root, 'config/audio_order_AND_no_More_Disclaimer/systemApp.js.audio', audioOrderFile(plan))
  } else if (name === 'speedometer') {
    for (const [target, value] of Object.entries(speedometerFiles(options))) await write(root, target, value)
    const sb = options.statusbar
    const replacements = {
      enableSmallSbSpeedo: sb.enabled, isMPH: options.speed_unit === 'mph', language: options.language.toUpperCase(),
      fuelEffunit_kml: options.fuel_unit === 'km_per_l', black_background_opacity: options.background_opacity,
      original_background_image: options.background === 'original', startAnalog: options.classic_analog,
      barSpeedometerMod: options.start_view === 'bar', speedMod: true, engineSpeedBar: options.rpm_bar,
      hideSpeedBar: options.hide_bar, speedAnimation: options.counter_animation, tempIsF: options.temperature_unit === 'f',
      spdLrgTxt: options.classic_large_text, analogColor: options.analog_color[0].toUpperCase() + options.analog_color.slice(1),
      speedometerTheme: options.bar_theme, sbFuelBar: sb.enabled && sb.fuel_bar !== 'disabled', sbHideInApp: sb.hide_in_app,
      hideSbSpeedoSBN: sb.hide_during_notifications,
      sbfbPos: { disabled: '', below_statusbar: '', above_statusbar: 'topbar', bottom: 'bottombar' }[sb.fuel_bar],
      SbMain: metricClass(sb.main_value), SbVal1: metricClass(sb.rotating_values[0]), SbVal2: metricClass(sb.rotating_values[1]),
      sbInterval: sb.interval_seconds * 1000, fuelGaugeFactor: options.fuel_gauge_unit === 'percent' ? 100 : options.fuel_tank_capacity,
      fuelGaugeValueSuffix: { percent: '%', l: 'L', gal: 'Gal' }[options.fuel_gauge_unit]
    }
    const bounds = { 20: '0to20', 40: '20to40', 60: '40to60', 80: '60to80', 100: '80to100' }
    for (const [bound, value] of Object.entries(options.fuel_bar_colors)) replacements[`fuelBarColor_${bounds[bound]}`] = value
    await edit(root, 'config/speedometer/jci/gui/apps/_speedometer/js/speedometer-startup.js', text => {
      for (const [key, value] of Object.entries(replacements)) text = replaceVariable(text, key, value)
      return text
    })
  } else if (name === 'message_replies' && Object.keys(options.messages).length) {
    const target = 'config/message_replies/jci/settings/configurations/blm_msg-system.xml'
    const data = await xml2js.parseStringPromise(await readFile(path.join(root, target), 'utf8'))
    const messages = data.Node.Node.find(node => node.$.key === 'PresetMessages')
    for (const [language, values] of Object.entries(options.messages)) {
      const languageNode = messages.Node.find(node => node.$.key === language)
      if (!languageNode || languageNode.Node.length !== 15) throw new Error(`bundled message language missing or incomplete: ${language}`)
      values.forEach((value, index) => { languageNode.Node[index].$.value = value })
    }
    await write(root, target, new xml2js.Builder({ headless: true }).buildObject(data) + '\n')
  } else if (name === 'android_auto') {
    const target = 'config/androidauto/data_persist/dev/bin/headunit.json'
    const data = JSON.parse(await readFile(path.join(root, target), 'utf8'))
    Object.assign(data, { carGPS: options.gps_source === 'car', reverseGPS: options.reverse_heading })
    await write(root, target, JSON.stringify(data, null, 2) + '\n')
    await edit(root, 'config/androidauto/data_persist/dev/bin/headunit-wrapper', text => text.replace(/^DEBUG=\d+/m, `DEBUG=${options.debug_logging ? 1 : 0}`))
  } else if (name === 'androidautowifi') {
    await edit(root, 'config/androidautowifi/headunit-wrapper', text => text.replace(/^DEBUG=\d+/m, `DEBUG=${plan.config.tweaks.android_auto.options.debug_logging ? 1 : 0}`))
  }
  return ''
}

async function copyThemeImages (source, target) {
  await mkdir(target, { recursive: true })
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const input = path.join(source, entry.name)
    const output = path.join(target, entry.name)
    if (entry.isDirectory()) await copyThemeImages(input, output)
    else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.png') await cp(input, output)
  }
}

async function theme (step, root) {
  const target = path.join(root, step.target)
  if (step.directory) await copyThemeImages(step.source, path.join(target, 'jci'))
  else await readZip(step.source, target, { jci: true })
  if (!step.restore) {
    const exclusions = [
      'jci/gui/common/images/no_artwork_icon.png',
      'jci/gui/apps/system/controls/OffScreen/images/OffScreenBackground.png'
    ]
    if (!step.includeBackground) exclusions.push('jci/gui/common/images/background.png')
    for (const exclusion of exclusions) await rm(path.join(target, exclusion), { force: true })
  }
}

export async function fragmentText (step) {
  let text = lf(await readFile(step.source, 'utf8'))
  if (step.transform === 'boot') text = text.replaceAll('TranLogoEndCinema.ivf', 'TranLogoEndCinemma.ivf')
  if (step.transform === 'statusbar') {
    text = text.replaceAll('/SbnBar/css/SbnBarCtrl.css', '/Sbn/css/SbnCtrl.css')
    // Keep support for the older unlabelled CSS block, then scope new blocks.
    text = text.replace(/^(remove_aio_css [^\n]+)$/gm, '$1\n$1 STATUSBAR')
      .replaceAll('/* MZD-AIO-TI CSS */', '/* MZD-AIO-TI STATUSBAR CSS */')
      .replaceAll('/* END AIO CSS */', '/* END AIO STATUSBAR CSS */')
  }
  return text.endsWith('\n') ? text : text + '\n'
}

export async function buildPackage (plan, output, { onProgress = () => {} } = {}) {
  output = path.resolve(output)
  if (await exists(output)) throw new Error(`output directory already exists: ${output}`)
  const parent = path.dirname(output)
  await mkdir(parent, { recursive: true })
  const actualOutput = path.join(await realpath(parent), path.basename(output))
  for (const step of plan.steps.filter(step => step.directory)) {
    const source = await realpath(step.source)
    const relative = path.relative(source, actualOutput)
    if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error(`output must not be inside an input directory: ${step.source}`)
  }
  const stage = await mkdtemp(path.join(parent, `.${path.basename(output)}.mzd-aio-`))
  try {
    const script = []
    for (const step of plan.steps) {
      onProgress(step.label)
      try {
        if (step.kind === 'fragment') {
          if (script.length) script.push(`\n# CLI: ${step.label} (${path.basename(step.source)})\n`)
          script.push(await fragmentText(step))
        } else if (step.kind === 'generate') {
          const text = await generate(step.name, plan, stage)
          if (text) script.push(`\n# CLI: ${step.label}\n${text}`)
        } else if (step.kind === 'copy') {
          await mkdir(path.dirname(path.join(stage, step.target)), { recursive: true })
          await cp(step.source, path.join(stage, step.target), { recursive: step.directory, preserveTimestamps: true })
        } else if (step.kind === 'theme') await theme(step, stage)
        else if (step.kind === 'zip') await readZip(step.source, path.join(stage, step.target))
        else if (step.kind === 'image') await renderImage(step.source, path.join(stage, step.target), step.width, step.height)
        else if (step.kind === 'rotation') await renderRotation(step.sources, path.join(stage, step.target))
      } catch (error) { throw new Error(`${step.label}: ${error.message}`) }
    }
    await writeFile(path.join(stage, plan.config.installer.script_name), script.join(''), { mode: 0o755 })
    await write(stage, 'MZD_LOG.md', '# MZD-AIO CLI compilation log\n\n```text\n' + formatPlan(plan) + '\n```\n')
    if (await exists(output)) throw new Error(`output directory already exists: ${output}`)
    await rename(stage, output)
    return output
  } catch (error) {
    await rm(stage, { recursive: true, force: true })
    throw error
  }
}
