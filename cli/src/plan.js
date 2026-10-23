import path from 'node:path'
import { registry, audioSources, colors, boots } from './registry.js'
import { metricClass } from './speedometer.js'
import { repoRoot, tweakRoot, checkPath, checkImage, checkThemeDirectory, readZip } from './resources.js'

const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`
const bit = value => value ? 1 : 0
const title = value => value[0].toUpperCase() + value.slice(1)

export function variables (config) {
  const { installer, tweaks } = config
  const options = name => tweaks[name]?.action === 'install' ? tweaks[name].options : undefined
  const vars = {
    KEEPBKUPS: bit(installer.keep_backups), TESTBKUPS: bit(installer.test_backups), SKIPCONFIRM: bit(installer.skip_confirmation),
    APPS2RESOURCES: bit(installer.apps_to_resources), ZIPBACKUP: bit(options('backup_jci')?.zip), FORCESSH: bit(options('ssh_bringback')?.force)
  }
  let o
  if ((o = options('touchscreen'))) Object.assign(vars, { KEEP_SPEED_RESTRICT: bit(o.keep_speed_restriction), ENABLE_DVD: bit(o.enable_dvd) })
  if ((o = options('boot_animation'))) ['loop', 'transition', 'ending'].forEach((key, index) => { vars[`BOOTLOGO${index + 1}`] = boots[key][o[key]][0] })
  if (tweaks.theme || tweaks.color_scheme) vars.COLORTHEME = options('color_scheme') ? colors[options('color_scheme').name] : tweaks.theme?.action === 'install' ? 'Custom' : 'Red'
  if ((o = options('main_menu'))) Object.assign(vars, {
    UI_STYLE_ELLIPSE: bit(o.hide_ellipse), UI_STYLE_MINICOINS: bit(o.small_coins), UI_STYLE_MINIFOCUS: bit(o.small_focus), UI_STYLE_NOGLOW: bit(o.hide_glow),
    UI_STYLE_ALTLAYOUT: ['default', 'star_points', 'star_points_b', 'inverted', 'flat_line'].indexOf(o.layout),
    UI_STYLE_MAIN3D: ['default', 'three_d', 'hidden', 'colored'].indexOf(o.label_style), UI_STYLE_LABELCOLOR: o.label_color
  })
  if ((o = options('ui_style'))) Object.assign(vars, { UI_STYLE_BODY: o.body_color, UI_STYLE_LIST: o.list_color, UI_STYLE_DISABLED: o.disabled_color, UI_STYLE_TITLE: o.title_color, UI_STYLE_RADIO: o.radio_color, UI_STYLE_SHADOW: o.text_shadow ? 'text-shadow: 2px 2px .5px #000;' : '' })
  if ((o = options('bigger_album_art'))) Object.assign(vars, { NOALBM: bit(o.hide_artwork), FULLTITLES: bit(o.full_width_titles) })
  if ((o = options('remove_overlays'))) Object.assign(vars, { NO_BTN_BG: bit(o.buttons), NO_NP_BG: bit(o.now_playing), NO_LIST_BG: bit(o.list_view), NO_CALL_BG: bit(o.in_call), NO_TEXT_BG: bit(o.text_messages) })
  if ((o = options('statusbar'))) Object.assign(vars, {
    STATUS_BAR_APP: o.app_color, STATUS_BAR_CLOCK: o.clock_color, STATUS_BAR_NOTIF: o.notification_color, STATUS_BAR_OPACITY: o.opacity,
    STATUS_BAR_CTRL: o.hide_background_image ? 'background-image: none;' : "background-image: url('../images/StatusBarBg.png');",
    SBN_CTRL: o.hide_background_image ? 'background-image: none;' : ''
  })
  if ((o = options('date_to_statusbar'))) vars.DATE_FORMAT = ['localized', 'dd_mm', 'mm_dd'].indexOf(o.format)
  if ((o = options('fuel_consumption'))) vars.FUEL_CONS_UNIT = ['km_per_l', 'mpg', 'l_per_100km'].indexOf(o.unit)
  if ((o = options('video_player'))) Object.assign(vars, { VP_SHUFFLE: String(o.shuffle), VP_REPEAT: ['none', 'one', 'all'].indexOf(o.repeat), VP_FULLSCRN: ['windowed', 'keep_aspect_ratio', 'full'].indexOf(o.fullscreen), VP_V4LSINK: String(o.v4l_sink) })
  if ((o = options('background_rotator'))) Object.assign(vars, { BG_STEPS: o.images.length, BG_SEC_EACH: o.seconds_per_image, BG_SECONDS: o.images.length * o.seconds_per_image, BG_WIDTH: o.images.length * 800 })
  if ((o = options('usb_audio_mod'))) {
    // Shell quoting, sed replacement escaping, and JavaScript string escaping
    // are distinct layers. The existing fragment inserts this inside JS quotes.
    vars.GRACENOTE = JSON.stringify(o.gracenote_text).slice(1, -1).replace(/[\u2028\u2029]/g, ch => `\\u${ch.charCodeAt(0).toString(16)}`).replace(/[\\/&]/g, '\\$&')
  }
  if ((o = options('speedometer'))) {
    const sb = o.statusbar
    Object.assign(vars, {
      OPACITY: o.background === 'infotainment' ? o.background_opacity : 0, SPEEDCOLOR: title(o.analog_color),
      SPD_BAR_RPM: bit(o.rpm_bar), SPD_BAR_HIDE: bit(o.hide_bar), SPD_COUNTER: bit(o.counter_animation), HIDE_SPEEDO_SBN: bit(sb.hide_during_notifications),
      SPD_XTRA_FUEL_SUFF: { percent: '%', l: 'L', gal: 'Gal' }[o.fuel_gauge_unit], SPD_XTRA_FUEL_FACT: o.fuel_gauge_unit === 'percent' ? 100 : o.fuel_tank_capacity,
      SBMAIN: metricClass(sb.main_value), SBVAL1: metricClass(sb.rotating_values[0]), SBVAL2: metricClass(sb.rotating_values[1]),
      SBFBPOS: { disabled: 'disable', below_statusbar: 'default', above_statusbar: 'topbar', bottom: 'bottombar' }[sb.fuel_bar], SBUNIT: 'speedUnit', BTSTART: o.bar_theme, SBINT: sb.interval_seconds * 1000
    })
    for (const [key, value] of Object.entries(o.fuel_bar_colors)) vars[`FBC${key}`] = value
  }
  return Object.entries(vars).map(([key, value]) => `${key}=${typeof value === 'number' ? value : quote(value)}`).join('\n') + '\n'
}

// Runtime order follows build-tweaks.js, with removals consistently before installs.
const uninstallOrder = ['touchscreen', 'no_disclaimer', 'reverse_camera_warning', 'transparent_parking_sensors', 'main_menu_loop', 'list_loop', 'shorter_delay', 'no_list_beeps', 'no_system_beeps', 'audio_source_order', 'pause_on_mute', 'message_replies', 'diagnostic_menu', 'boot_animation', 'bigger_album_art', 'remove_overlays', 'blank_album_art', 'swapfile', 'fuel_consumption', 'media_order_flac', 'usb_audio_mod', 'background_rotator', 'castscreen_receiver', 'video_player', 'speedometer', 'android_auto', 'aio_app', 'mzd_meter', 'color_scheme', 'theme', 'date_to_statusbar', 'statusbar', 'ui_style', 'main_menu', 'offscreen_background', 'background']
const installOrder = ['color_scheme', 'theme', 'touchscreen', 'no_disclaimer', 'reverse_camera_warning', 'transparent_parking_sensors', 'main_menu_loop', 'list_loop', 'shorter_delay', 'no_list_beeps', 'no_system_beeps', 'audio_source_order', 'pause_on_mute', 'speedometer', 'media_order_flac', 'castscreen_receiver', 'message_replies', 'boot_animation', 'usb_audio_mod', 'bigger_album_art', 'remove_overlays', 'video_player', 'aio_app', 'mzd_meter', 'fuel_consumption', 'android_auto', 'date_to_statusbar', 'statusbar', 'ui_style', 'main_menu', 'blank_album_art', 'diagnostic_menu', 'offscreen_background', 'background_rotator', 'background', 'sd_cid']

export function createPlan (config) {
  const steps = []
  const { tweaks } = config
  const selected = name => Boolean(tweaks[name])
  const installing = name => tweaks[name]?.action === 'install'
  const options = name => tweaks[name]?.options
  const fragment = (name, label = name, transform) => steps.push({ kind: 'fragment', source: path.join(tweakRoot, name), label, transform })
  const copy = (source, target, label, directory = false) => {
    if (!steps.some(step => step.kind === 'copy' && step.source === source && step.target === target)) steps.push({ kind: 'copy', source, target, label, directory })
  }
  const payload = (name, original = false) => {
    const location = `${original ? 'config_org' : 'config'}/${name}`
    copy(path.join(tweakRoot, location), location, `${original ? 'restore fallback' : 'payload'}: ${name}`, true)
  }
  const generated = (name, label) => steps.push({ kind: 'generate', name, label })
  const image = (source, target, width, height) => steps.push({ kind: 'image', source, target, width, height, label: `image: ${target}` })
  const scheme = (name, selection) => {
    const pack = config.resources.color_schemes
    if (!pack) throw new Error(`resources.color_schemes: required by ${name} ${selection.action}`)
    const color = selection.action === 'uninstall' ? 'Red' : colors[selection.options.name]
    steps.push({ kind: 'theme', source: path.join(pack, color, 'jci.zip'), target: `config/color-schemes/${color}`, includeBackground: selection.action === 'uninstall' || selection.options.include_background, restore: selection.action === 'uninstall', label: `local color pack: ${color}` })
    if (color === 'Blue') copy(path.join(pack, 'Blue/_skin_jci_bluedemo.zip'), 'config/color-schemes/Blue/_skin_jci_bluedemo.zip', 'Blue navigation skin')
  }

  fragment('00_intro.txt', 'installer header')
  generated('variables', 'installer and selected-tweak variables')
  fragment('00_start.txt', 'common installer setup and compatibility checks')
  // These are preparatory system operations, preceding ordinary tweak changes.
  if (installing('backup_jci')) fragment('00_backup.txt', 'install backup_jci')
  if (installing('enable_wifi') || installing('media_order_flac')) fragment('00_wifi.txt', installing('enable_wifi') ? 'install enable_wifi' : 'dependency: media_order_flac → enable_wifi')
  if (installing('ssh_bringback') || installing('media_order_flac')) {
    fragment('00_sshbringback.txt', installing('ssh_bringback') ? 'install ssh_bringback' : 'dependency: media_order_flac → ssh_bringback')
    payload('ssh_bringback')
  }

  for (const action of ['uninstall', 'install']) {
    for (const name of action === 'install' ? installOrder : uninstallOrder) {
      if (tweaks[name]?.action !== action) continue
      const definition = registry[name]
      const o = options(name)
      if (name === 'theme' && action === 'install') {
        steps.push({ kind: 'theme', source: o.archive || o.jci_directory, directory: Boolean(o.jci_directory), target: 'config/color-schemes/theme', includeBackground: o.include_background, label: 'local theme images' })
      } else if (name === 'color_scheme' || (name === 'theme' && action === 'uninstall')) scheme(name, tweaks[name])
      if (action === 'install' && definition.payload) payload(definition.payload)
      if (action === 'uninstall' && definition.fallback) payload(definition.fallback, true)
      if (name === 'boot_animation' && action === 'install') {
        for (const stage of ['loop', 'transition', 'ending']) {
          const file = boots[stage][o[stage]][1]
          const location = `config/bootanimation/jci/resources/${file}`
          copy(path.join(tweakRoot, location), location, `boot ${stage}: ${o[stage]}`)
        }
      }
      if (name === 'background' || name === 'offscreen_background' || name === 'blank_album_art') {
        if (action === 'install' || name !== 'blank_album_art') {
          const source = action === 'install' ? o.image : path.join(repoRoot, `background-images/default/${name === 'background' ? 'default.png' : 'OffScreenBackground.png'}`)
          const target = name === 'blank_album_art' ? 'config/blank-album-art-frame/jci/gui/common/images/no_artwork_icon.png' : `config/${name === 'background' ? 'background.png' : 'OffScreenBackground.png'}`
          image(source, target, name === 'blank_album_art' ? 146 : 800, name === 'blank_album_art' ? 146 : 480)
        }
      }
      if (name === 'background_rotator' && action === 'install') steps.push({ kind: 'rotation', sources: o.images, target: 'config/background.png', label: `join ${o.images.length} rotating background images` })
      if (action === 'install' && ['speedometer', 'message_replies', 'android_auto'].includes(name)) generated(name, `generate ${name} configuration`)
      if (name === 'date_to_statusbar' && action === 'install') fragment('20_date-iv3.3.txt', 'install date_to_statusbar')
      else for (const file of definition[action]) fragment(file, `${action} ${name}`, name === 'boot_animation' && action === 'install' ? 'boot' : name === 'statusbar' ? 'statusbar' : undefined)
      if (name === 'speedometer' && action === 'install') {
        if (o.statusbar.digital_clock) fragment('19_speedo-digiclock.txt', 'speedometer: digital clock')
        if (o.statusbar.hide_in_reverse) fragment('19_speedo-sbhiderev.txt', 'speedometer: hide in reverse')
        fragment('19_speedo-i2.txt', 'speedometer: complete configuration')
      }
      if (name === 'android_auto' && action === 'install' && o.wifi) {
        payload('androidautowifi')
        generated('androidautowifi', 'configure Wi-Fi headunit wrapper')
        fragment('25_androidautowifi-i.txt', 'android_auto: Wi-Fi transport')
      }
      if (name === 'aio_app' && action === 'install' && o.screen_off_on_boot) fragment('27_aioapp-screenoff.txt', 'aio_app: screen off on boot')
      if (name === 'background_rotator' && action === 'install') fragment('00_background.txt', 'install rotating background strip')
    }
  }
  if (['no_disclaimer', 'audio_source_order'].some(selected)) {
    payload('audio_order_AND_no_More_Disclaimer')
    generated('audio_source_order', 'generate audio-source positions and preserve shared disclaimer payloads')
  }
  const applications = Object.keys(registry).filter(name => registry[name].application && selected(name))
  if (applications.length) payload('bin')
  if (applications.some(installing)) {
    payload('jci')
    if (!installing('no_disclaimer') && !installing('audio_source_order')) fragment('00_59patch.txt', 'dependency: application registration compatibility patch')
  }
  if (installing('aio_app') || installing('video_player')) fragment('00_storage-i.txt', 'dependency: persistent application storage')
  if (Object.values(tweaks).some(selection => selection.action === 'uninstall')) payload('v70', true)
  if (installing('swapfile')) {
    const mount = options('swapfile').mount_on_boot
    steps.push({ kind: 'zip', source: path.join(tweakRoot, 'config/swapfile/swapfile.zip'), target: mount ? 'config/swapfile' : '.', label: 'expand bundled 1 GiB swapfile' })
    if (mount) fragment('18_swapfile-i.txt', 'install swapfile (last tweak installation)')
  }
  if (config.installer.self_destruct || installing('swapfile')) fragment('99_self-destruct.txt', 'installer cleanup' + (installing('swapfile') ? ' (required by swapfile)' : ''))
  for (const name of ['cmu_dataretrieval.up', 'dataRetrieval_config.txt', 'jci-autoupdate']) {
    if (config.installer.script_name !== 'run.sh') copy(path.join(tweakRoot, 'root', name), name, `USB bootstrap: ${name}`)
  }
  if (config.installer.retrieve_cmu_data && config.installer.script_name !== 'run.sh') copy(path.join(tweakRoot, 'root/data/dataRetrieval_config.txt'), 'dataRetrieval_config.txt', 'CMU data retrieval configuration')
  fragment(installing('message_replies') ? '00_factory-reset-end.txt' : '00_end.txt', 'installer ending')
  return { config, steps }
}

export async function validatePlan (plan) {
  const checked = new Set()
  for (const step of plan.steps) {
    try {
      const key = JSON.stringify([step.kind, step.source])
      if (step.source && checked.has(key)) continue
      if (step.kind === 'image') await checkImage(step.source)
      else if (step.kind === 'rotation') for (const source of step.sources) await checkImage(source)
      else if (step.kind === 'theme' && step.directory) await checkThemeDirectory(step.source)
      else if (step.kind === 'zip' || (step.kind === 'theme' && !step.directory)) await readZip(step.source, undefined, { jci: step.kind === 'theme' })
      else if (step.source) await checkPath(step.source, step.directory ? 'directory' : 'file')
      if (step.source) checked.add(key)
    } catch (error) { throw new Error(`${step.label}: ${error.message}`) }
  }
  return plan
}

export function formatPlan (plan) {
  const lines = [`Output script: ${plan.config.installer.script_name}`, 'Package operations (script fragments execute in this order):']
  plan.steps.forEach((step, index) => {
    const detail = step.kind === 'fragment' ? path.basename(step.source) : step.target
    lines.push(`${String(index + 1).padStart(3)}. ${step.label}${detail ? ` [${detail}]` : ''}`)
  })
  return lines.join('\n')
}

export function audioOrderFile (plan) {
  const positions = plan.config.tweaks.audio_source_order?.options?.positions
  return Object.entries(audioSources).map(([key, [variable, fallback]]) => `var ${variable} = ${positions?.[key] ?? fallback};`).join('\n') + '\n'
}
