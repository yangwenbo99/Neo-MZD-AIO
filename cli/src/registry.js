import { metrics, classicFields, bindings, actions, palettes, fuelColors } from './speedometer.js'

export const bool = value => ({ type: 'boolean', default: value })
export const choice = (values, value) => ({ type: 'string', values, ...(value === undefined ? {} : { default: value }) })
export const number = (min, max, value, integer = false) => ({ type: 'number', min, max, integer, ...(value === undefined ? {} : { default: value }) })
export const object = fields => ({ type: 'object', fields, default: {} })
const color = (value = '#ffffff') => ({ type: 'color', default: value })
const file = (kind = 'file') => ({ type: 'path', kind })
const list = (item, min, max) => ({ type: 'array', item, min, max })
const string = { type: 'string', xml: true }
const image = file('image')
const flags = (...keys) => Object.fromEntries(keys.map(key => [key, bool(false)]))

export const audioSources = {
  usb_a: ['UsbAudioAPos', 1], usb_b: ['UsbAudioBPos', 2], aux: ['AuxInPos', 3],
  bluetooth: ['BluetoothPos', 4], android_auto: ['aaAudioPos', 15], carplay: ['cpAudioPos', 16],
  fm: ['FmRadioPos', 5], am: ['AmRadioPos', 6], xm_radio: ['SdarsRadioPos', 7],
  xm_audio: ['xmRadioPos', 17], dab: ['DabRadioPos', 14], aha: ['AhaRadioPos', 8],
  pandora: ['PandoraPos', 9], stitcher: ['StitcherItemPos', 10], cd: ['CdPlayerPos', 11],
  dvd: ['DVDItemPos', 12], tv: ['TVItemPos', 13]
}
export const languages = ['UK_English', 'US_English', 'AU_English', 'ADR_English', 'NA_Spanish', 'Castilian_Spanish', 'CN_French', 'EU_French', 'Arabic', 'Bulgarian', 'Czech', 'Danish', 'German', 'Greek', 'Estonian', 'Finnish', 'Hebrew', 'Croatian', 'Hungarian', 'Indonesian', 'Italian', 'Japanese', 'Lithuanian', 'Latvian', 'Malaysian', 'Malay', 'Dutch', 'Norwegian', 'Polish', 'EU_Portuguese', 'BR_Portuguese', 'Romanian', 'Russian', 'Slovakian', 'Serbian', 'Swedish', 'Thai', 'Turkish', 'Chinese_Simplified', 'Chinese_Traditional', 'Chinese_Mandarin', 'Chinese_Cantonese', 'Korean', 'HK_Cantonese', 'TW_Mandarin', 'Ukrainian']
export const colors = { blue: 'Blue', green: 'Green', silver: 'Silver', pink: 'Pink', purple: 'Purple', orange: 'Orange', yellow: 'Yellow', car_os: 'carOS' }
export const boots = {
  loop: {
    mazda_still: [0, 'LoopLogo.ivf'], matrix: [1, 'LoopLogoMatrix.ivf'], large_mazda: [2, 'TranLogoRace.ivf'],
    fiat: [3, 'LoopLogoFiat.ivf'], mazda_z: [4, 'LoopLogoZ.ivf'], cinema: [5, 'LoopLogoCinema.ivf'],
    criss_cross: [6, 'TranLogoCrissCross.ivf'], race: [7, 'LoopLogoRace.ivf']
  },
  transition: {
    mazda_still: [0, 'LoopLogo.ivf'], matrix: [1, 'LoopLogoMatrix.ivf'], large_mazda: [2, 'TranLogoRace.ivf'],
    spider_124: [3, 'TranLogo124Spider.ivf'], mazda_z: [4, 'LoopLogoZ.ivf'], cinema: [5, 'LoopLogoCinema.ivf'],
    criss_cross: [6, 'TranLogoCrissCross.ivf'], race: [7, 'LoopLogoRace.ivf'], original: [8, 'TranLogo.ivf']
  },
  ending: {
    mazda_still: [0, 'LoopLogo.ivf'], matrix: [1, 'LoopLogoMatrix.ivf'], race: [2, 'TranLogoEndRace.ivf'],
    car_flash: [3, 'TranLogoCarFlash.ivf'], mazda_z: [4, 'LoopLogoZ.ivf'], cinema: [5, 'TranLogoEndCinemma.ivf'],
    criss_cross: [6, 'TranLogoEndCrissCross.ivf'], space: [8, 'TranLogoEndSpace.ivf'],
    race_large: [9, 'TranRace.ivf'], title_slam: [10, 'TranIntroM.ivf'], original: [11, 'TranLogoEnd.ivf']
  }
}

export const installerSchema = object({
  script_name: choice(['tweaks.sh', 'run.sh'], 'tweaks.sh'), keep_backups: bool(true), test_backups: bool(true),
  skip_confirmation: bool(false), apps_to_resources: bool(false), retrieve_cmu_data: bool(false), self_destruct: bool(false)
})

export const autorunSchema = object({
  mode: choice(['install', 'serial', 'dry_run'], 'install'),
  id7_recovery: { ...bool(true), modes: ['install'] },
  wifi_ap: { ...object({
    enabled: bool(false),
    ssid: { type: 'string', singleLine: true },
    password: { type: 'string', singleLine: true, secret: true }
  }), modes: ['install', 'serial'] },
  ssh_over_adb: { ...bool(false), modes: ['install', 'serial'] },
  include_dry_run: { ...bool(false), modes: ['install'] },
  skip_confirmation: { ...bool(false), modes: ['install'] }
})

const metric = choice([...metrics.map(row => row[0]), 'none'])
const controls = view => object(Object.fromEntries(bindings.map((key, index) => [key, choice(actions[view], actions[view][index])])))
const speedometer = {
  language: choice(['en', 'de', 'es', 'pl', 'sk', 'tr', 'fr', 'it', 'nl'], 'en'),
  speed_unit: choice(['kmh', 'mph'], 'kmh'), fuel_unit: choice(['km_per_l', 'l_per_100km'], 'km_per_l'),
  temperature_unit: choice(['c', 'f'], 'c'), start_view: choice(['bar', 'classic'], 'bar'),
  classic_analog: bool(true), classic_large_text: bool(false),
  analog_color: choice(['red', 'blue', 'green', 'purple', 'yellow', 'orange', 'pink', 'silver'], 'red'),
  background: choice(['infotainment', 'original'], 'infotainment'), background_opacity: number(0, 1, 0),
  bottom_rows: number(1, 4, 4, true), bar_theme: number(0, 5, 0, true),
  rpm_bar: bool(false), hide_bar: bool(false), counter_animation: bool(false),
  fuel_gauge_unit: choice(['percent', 'l', 'gal'], 'percent'), fuel_tank_capacity: number(Number.MIN_VALUE, Infinity),
  statusbar: object({
    enabled: bool(false), main_value: { ...metric, default: 'gps_speed' },
    rotating_values: { ...list(metric, 2, 2), default: ['gps_heading', 'gps_altitude'] },
    interval_seconds: number(1, Infinity, 2),
    fuel_bar: choice(['disabled', 'below_statusbar', 'above_statusbar', 'bottom'], 'disabled'),
    digital_clock: bool(false), hide_in_reverse: bool(false), hide_in_app: bool(true), hide_during_notifications: bool(true)
  }),
  bar_layout: object(Object.fromEntries(metrics.map(([key, , , position]) => [key, { ...list(number(-Infinity, Infinity, undefined, true), 3, 3), default: position }]))),
  classic_layout: object(Object.fromEntries(classicFields.map(([key], index) => [key, number(0, 99, index + 1, true)]))),
  controls: object({ bar: controls('bar'), classic: controls('classic') }),
  bar_themes: object(Object.fromEntries(palettes.map((values, index) => [String(index + 1), object(Object.fromEntries(['primary', 'secondary', 'border'].map((key, i) => [key, color(values[i])])))]))),
  fuel_bar_colors: object(Object.fromEntries(fuelColors.map((value, index) => [String((index + 1) * 20), color(value)])))
}

const entry = (description, install, uninstall, payload, fallback, options = {}, extra = {}) => ({
  description, install: install ? [install] : [], uninstall: uninstall ? [uninstall] : undefined,
  payload, fallback, options: object(options), ...extra
})
export const registry = {
  touchscreen: entry('Touchscreen while moving and optional DVD playback', '01_touchscreen-i.txt', '01_touchscreen-u.txt', null, null, flags('keep_speed_restriction', 'enable_dvd')),
  no_disclaimer: entry('Remove startup disclaimer', '02_disclaimer-i.txt', '02_disclaimer-u.txt'),
  reverse_camera_warning: entry('Remove reverse-camera warning', '03_warning-i.txt', '03_warning-u.txt', 'safety-warning-reverse-camera', 'safety-warning-reverse-camera'),
  transparent_parking_sensors: entry('Semi-transparent parking sensors', '04_sensor-i.txt', '04_sensor-u.txt', 'transparent-parking-sensor', 'transparent-parking-sensor'),
  main_menu_loop: entry('Wrap around main menu', '05_mainloop-i.txt', '05_mainloop-u.txt', 'main-menu-loop'),
  list_loop: entry('Wrap around lists', '06_listloop-i.txt', '06_listloop-u.txt', 'list-loop'),
  shorter_delay: entry('Shorter multi-controller delay', '07_shorterdelay-i.txt', '07_shorterdelay-u.txt'),
  no_list_beeps: entry('Remove long-press list beep', '07_listbeep-i.txt', '07_listbeep-u.txt'),
  no_system_beeps: entry('Remove system beeps', '08_sysbeep-i.txt', '08_sysbeep-u.txt'),
  audio_source_order: entry('Audio-source positions', '09_audioorder-i.txt', '09_audioorder-u.txt', null, null, {
    positions: object(Object.fromEntries(Object.entries(audioSources).map(([key, [, value]]) => [key, number(0, 99, value, true)])))
  }),
  pause_on_mute: entry('Pause media when muted', '10_pausemute-i.txt', '10_pausemute-u.txt'),
  message_replies: entry('Remove Mazda suffix and customize preset replies', '11_msgreplies-i.txt', '11_msgreplies-u.txt', 'message_replies', null, {
    messages: { type: 'record', keys: languages, item: list(string, 15, 15), default: {} }
  }),
  diagnostic_menu: entry('Diagnostic menu on clock press', '12_diag-i.txt', '12_diag-u.txt', 'test_mode'),
  boot_animation: entry('Bundled boot-animation stages', '13_boot-i.txt', '13_boot-u.txt', null, 'bootanimation',
    Object.fromEntries(Object.entries(boots).map(([key, values]) => [key, choice(Object.keys(values), 'mazda_still')]))),
  bigger_album_art: entry('Larger album art and full-width titles', '14_bgart-i.txt', '14_bgart-u.txt', 'bigger-album-art', 'bigger-album-art', flags('hide_artwork', 'full_width_titles')),
  remove_overlays: entry('Remove selected background overlays', '15_btnbackground-i.txt', '15_btnbackground-u.txt', 'NoButtons', 'NoButtons', flags('buttons', 'now_playing', 'list_view', 'in_call', 'text_messages')),
  blank_album_art: entry('Custom missing-artwork image', '16_blnkframe-i.txt', '16_blnkframe-u.txt', null, 'blank-album-art-frame', { image: { ...image, required: true } }),
  video_player: entry('Video player', '17_videoplayer-i.txt', '17_videoplayer-u.txt', 'videoplayer', null, {
    shuffle: bool(true), repeat: choice(['none', 'one', 'all'], 'all'), fullscreen: choice(['windowed', 'keep_aspect_ratio', 'full'], 'full'), v4l_sink: bool(true)
  }, { application: true }),
  swapfile: entry('USB swapfile', null, '18_swapfile-u.txt', null, null, { mount_on_boot: bool(true) }),
  speedometer: entry('Speedometer layouts, controls, units and statusbar', '19_speedo-i1.txt', '19_speedo-u.txt', 'speedometer', null, speedometer, { application: true }),
  statusbar: entry('Statusbar text colors and opacity', '20_statusbar_tweaks-i.txt', '20_statusbar_tweaks-u.txt', null, null, {
    app_color: color(), clock_color: color(), notification_color: color(), opacity: number(0, 1, 0), hide_background_image: bool(false)
  }),
  date_to_statusbar: entry('Date in statusbar', null, '20_date2status-u.txt', 'date-to-statusbar_mod', 'date-to-statusbar_mod', {
    version: choice(['v3'], 'v3'), format: choice(['localized', 'dd_mm', 'mm_dd'], 'mm_dd')
  }),
  media_order_flac: entry('Media ordering and FLAC support', '08_orderflac-i.txt', '08_orderflac-u.txt', 'media-order-patching', 'media-order-patching'),
  fuel_consumption: entry('Fuel-consumption display', '22_fuel-i.txt', '22_fuel-u.txt', 'FuelConsumptionTweak', 'FuelConsumptionTweak', { unit: choice(['km_per_l', 'mpg', 'l_per_100km'], 'km_per_l') }),
  castscreen_receiver: entry('Castscreen receiver', '24_castscreen-i.txt', '24_castscreen-u.txt', 'castscreen-receiver'),
  android_auto: entry('Bundled headunit application', '25_androidauto-i.txt', '25_androidauto-u.txt', 'androidauto', null, {
    wifi: bool(false), debug_logging: bool(false), gps_source: choice(['car', 'phone'], 'car'), reverse_heading: bool(false), disable_touchscreen: bool(false)
  }, { application: true }),
  usb_audio_mod: entry('USB Audio Mod', '26_usbaudiomod-i.txt', '26_usbaudiomod-u.txt', 'USBAudioMod', 'USBAudioMod', { gracenote_text: { type: 'string', singleLine: true, default: 'Powered By Gracenote®' } }),
  aio_app: entry('AIO Tweaks App', '27_aioapp-i.txt', '27_aioapp-u.txt', 'aio-app', null, { screen_off_on_boot: bool(false) }, { application: true }),
  mzd_meter: entry('Legacy MZD Meter', '28_mzdmeter-i.txt', '28_mzdmeter-u.txt', 'mzdmeter', null, {}, { application: true }),
  enable_wifi: entry('Enable Wi-Fi', '00_wifi.txt'),
  backup_jci: entry('Back up JCI directory', '00_backup.txt', null, null, null, { zip: bool(false) }),
  background: entry('Main background image', '00_background.txt', '00_background.txt', null, null, { image: { ...image, required: true } }),
  color_scheme: entry('External color scheme', '21_colors-i.txt', '21_colors-u.txt', null, null, { name: choice(Object.keys(colors), 'blue'), include_background: bool(false) }),
  theme: entry('Theme ZIP or custom jci image directory', '21_theme-i.txt', '21_colors-u.txt', null, null, { archive: file('zip'), jci_directory: file('directory'), include_background: bool(false) }),
  ssh_bringback: entry('SSH bringback configuration', '00_sshbringback.txt', null, 'ssh_bringback', null, { force: bool(false) }),
  sd_cid: entry('Retrieve SD card CID', '00_sd-cid.txt', null, 'get_sd_cid'),
  background_rotator: entry('Rotate local background images', '00_bgrotator-i.txt', '00_bgrotator-u.txt', null, 'BackgroundRotator', {
    images: { ...list(image, 2, Infinity), required: true }, seconds_per_image: number(1, Infinity, 60, true)
  }),
  main_menu: entry('Main menu layout and labels', '20_mainmenu-i.txt', '20_mainmenu-u.txt', 'MainMenuTweaks', null, {
    layout: choice(['default', 'star_points', 'star_points_b', 'inverted', 'flat_line'], 'default'),
    label_style: choice(['default', 'three_d', 'hidden', 'colored'], 'default'), label_color: color(),
    ...flags('hide_ellipse', 'small_coins', 'small_focus', 'hide_glow')
  }),
  ui_style: entry('Text colors and shadows', '20_uistyle-i.txt', '20_uistyle-u.txt', null, null, {
    body_color: color(), list_color: color(), disabled_color: color('#929497'), title_color: color(), radio_color: color(), text_shadow: bool(false)
  }),
  offscreen_background: entry('Display-off background', '00_offbackground-i.txt', '00_offbackground-u.txt', null, null, { image: { ...image, required: true } })
}
