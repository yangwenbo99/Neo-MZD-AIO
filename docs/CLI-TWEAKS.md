# Complete CLI option reference

This reference accompanies the [user guide and 40-entry catalogue](CLI.md).
Names and defaults are grounded in the existing builder, option forms, and payloads.

## Reading this reference

Ordinary tweak options belong under `tweaks.NAME.options`, except the shared
`resources` setting. The separate [autorun package fields](#autorun-and-recovery-packages)
belong under `autorun`. For ordinary tweaks, `action` is required and follows the
guide's action column.
An unselected tweak has no effect merely because its options have defaults.
Uninstall entries accept only `action`; required uninstall resources are supplied
through `resources` or bundled files. Omitted install options use the defaults here.

- Booleans are `true` or `false`; colors are quoted `"#rrggbb"` strings.
- Opacities are numbers from `0` to `1`. Paths refer to existing local files or
  directories and are resolved relative to the YAML file.
- Nested option mappings override defaults by field. Named layout, position,
  binding, and palette mappings override only the named entries. Lists replace
  their entire default list. Unknown fields or names are errors.
- The catalogue concerns build support. Vehicle-side firmware checks and existing
  storage-dependent adjustments remain part of the generated installer.

## Operations without install options

`no_disclaimer`, `reverse_camera_warning`, `transparent_parking_sensors`,
`main_menu_loop`, `list_loop`, `shorter_delay`, `no_list_beeps`, `no_system_beeps`,
`pause_on_mute`, `diagnostic_menu`, `castscreen_receiver`, `media_order_flac`,
`mzd_meter`, `enable_wifi`, and `sd_cid` have no `options` fields.

`no_disclaimer` removes the disclaimer completely. Its old half-second alternative
is accounted for under deferred features below.

## System and backup options

| Tweak | Option | Type / allowed values | Default |
| --- | --- | --- | --- |
| `touchscreen` | `keep_speed_restriction` | Boolean; retain the speed restriction used by the cluster-compass workaround. | `false` |
| `touchscreen` | `enable_dvd` | Boolean; enable the DVD speed-restriction override. | `false` |
| `backup_jci` | `zip` | Boolean; archive the vehicle-side JCI backup. | `false` |
| `ssh_bringback` | `force` | Boolean; force replacement of the existing SSH settings. | `false` |

`backup_jci` is a full-directory backup operation, separate from
`installer.keep_backups` and `installer.test_backups` for individual modified files.
The Wi-Fi and SSH patches have no existing uninstall operation.

`ssh_bringback` is needed for v.56 to access ssh.  You might want to replace `authorized_keys`

## Audio and message options

### audio_source_order

`positions` is a mapping from source name to integer position `0`–`99`. It defaults
to the complete mapping below, translated from `audioSourceList.js`. Override only
the sources whose positions should change. Equal positions retain this default
source order as the tie-breaker.

```yaml
positions:
  usb_a: 1
  usb_b: 2
  aux: 3
  bluetooth: 4
  fm: 5
  am: 6
  xm_radio: 7
  aha: 8
  pandora: 9
  stitcher: 10
  cd: 11
  dvd: 12
  tv: 13
  dab: 14
  android_auto: 15
  carplay: 16
  xm_audio: 17
```

These positions do not add unavailable sources to a vehicle or region. The GUI's
v70 checkbox only reveals extra editor fields; firmware-specific script selection
already happens on the vehicle, so it is not a CLI option.

### message_replies

`messages` defaults to `{}`. It maps an existing language key to a list of exactly
15 strings. Overrides update the bundled `blm_msg-system.xml`; other language
entries retain the bundled values. The standard suffix-removal installation still
runs when `messages` is empty. The existing factory-reset ending is retained.

Allowed language keys are:

```text
UK_English, US_English, AU_English, ADR_English, NA_Spanish,
Castilian_Spanish, CN_French, EU_French, Arabic, Bulgarian, Czech, Danish,
German, Greek, Estonian, Finnish, Hebrew, Croatian, Hungarian, Indonesian,
Italian, Japanese, Lithuanian, Latvian, Malaysian, Malay, Dutch, Norwegian,
Polish, EU_Portuguese, BR_Portuguese, Romanian, Russian, Slovakian, Serbian,
Swedish, Thai, Turkish, Chinese_Simplified, Chinese_Traditional,
Chinese_Mandarin, Chinese_Cantonese, Korean, HK_Cantonese, TW_Mandarin,
Ukrainian
```

### usb_audio_mod

`gracenote_text` is a single-line string, default `"Powered By Gracenote®"`.
The existing installer checks the firmware compatibility of USB Audio Mod.

## Images, rotation, colors, and themes

### background, offscreen_background, blank_album_art

Each install requires `image`, a PNG or JPEG path with no default. The generated
images are PNGs, sized to 800 × 480 for backgrounds and 146 × 146 for blank artwork.
Uninstall uses bundled defaults for the two backgrounds and the existing restore
fragment/fallback payload for blank artwork.

### background_rotator

| Option | Type / allowed values | Default |
| --- | --- | --- |
| `images` | Ordered list of at least two PNG/JPEG paths. | Required |
| `seconds_per_image` | Positive integer seconds. | `60` |

The builder resizes each image to 800 × 480 and joins them horizontally. It emits
the existing `BG_STEPS`, `BG_SEC_EACH`, `BG_SECONDS`, and `BG_WIDTH` variables and
the background-install fragment. Uninstall removes rotation CSS; select
`background` separately to replace the current image as well.

### color_scheme

| Option | Type / allowed values | Default |
| --- | --- | --- |
| `name` | `blue`, `green`, `silver`, `pink`, `purple`, `orange`, `yellow`, `car_os`. | `blue` |
| `include_background` | Boolean; include the color pack's background image. | `false` |

The [external resource pack guide](CLI.md#external-resource-packs) includes the
maintainer's color-pack download link and setup instructions.

Set `resources.color_schemes` to the optional unpacked pack's root. Directory
names are `Blue`, `Green`, `Silver`, `Pink`, `Purple`, `Orange`, `Yellow`, and
`carOS`, respectively; each contains `jci.zip`. A Blue install also requires
`Blue/_skin_jci_bluedemo.zip`. Only the selected archives are required.

Uninstall requires `Red/jci.zip` in the same resource root. Red is selected through
`action: uninstall`, rather than as an install color. The builder excludes blank
artwork and off-screen background replacements from color packs, matching the
existing behavior.

### theme

| Option | Type / allowed values | Default |
| --- | --- | --- |
| `archive` | Local theme ZIP containing a `jci/` image tree. | Exactly one source required |
| `jci_directory` | Local custom `jci` image directory; PNG files are copied. | Exactly one source required |
| `include_background` | Boolean; include the theme's background image. | `false` |

Choose exactly one of `archive` and `jci_directory`. The currently bundled ZIPs
under `app/files/tweaks/config/themes/` are `Floating`, `Mazda`, `Mountains`,
`Poker`, `SmoothAzure`, `SmoothRed`, `SmoothRedv1`, `SmoothViolet`, `StormTroopers`,
and `X-Men`. Paths to these ZIPs work without the external color pack. `carOS`
is an external color-pack choice in this checkout, not a bundled theme ZIP.

Blank artwork and off-screen background images are excluded from theme sources;
select their dedicated tweaks to customize them. `include_background: false`
also excludes the main background image.

Theme uninstall runs the existing Red restoration and requires
`resources.color_schemes` containing `Red/jci.zip`. This restores the default
appearance rather than reconstructing whichever custom theme preceded it.

## Menu, styling, and statusbar

### main_menu

| Option | Type / allowed values | Default |
| --- | --- | --- |
| `layout` | `default`, `star_points`, `star_points_b`, `inverted`, `flat_line`. | `default` |
| `label_style` | `default`, `three_d`, `hidden`, `colored`. | `default` |
| `label_color` | Color; used for `colored` labels. | `"#ffffff"` |
| `hide_ellipse` | Boolean. | `false` |
| `small_coins` | Boolean. | `false` |
| `small_focus` | Boolean; requires `small_coins: true`. | `false` |
| `hide_glow` | Boolean. | `false` |

### ui_style

| Option | Type | Default |
| --- | --- | --- |
| `body_color` | Color. | `"#ffffff"` |
| `list_color` | Color. | `"#ffffff"` |
| `disabled_color` | Color. | `"#929497"` |
| `title_color` | Color. | `"#ffffff"` |
| `radio_color` | Color. | `"#ffffff"` |
| `text_shadow` | Boolean. | `false` |

### bigger_album_art

`hide_artwork` and `full_width_titles` are booleans, both defaulting to `false`.

### remove_overlays

`buttons`, `now_playing`, `list_view`, `in_call`, and `text_messages` are booleans,
all defaulting to `false`. Set at least one to `true` for installation. A selected
installation replaces that tweak's previous overlay-removal CSS with the requested
set.

### statusbar

| Option | Type | Default |
| --- | --- | --- |
| `app_color` | Color. | `"#ffffff"` |
| `clock_color` | Color. | `"#ffffff"` |
| `notification_color` | Color. | `"#ffffff"` |
| `opacity` | Number, `0`–`1`. | `0` |
| `hide_background_image` | Boolean. | `false` |

### date_to_statusbar

| Option | Type / allowed values | Default |
| --- | --- | --- |
| `version` | `v3`; selects the bundled `20_date-iv3.3.txt` fragment. | `v3` |
| `format` | `localized`, `dd_mm`, `mm_dd`; the latter two display `dd.mm.` and `mm/dd`. | `mm_dd` |

The legacy `v1` option is deferred because its required `StatusBarCtrl.v1.css`
payload is missing from this checkout. Statusbar styling and date display are
separate selections; their CSS removal is scoped to their respective markers.

### boot_animation

The install options are `loop`, `transition`, and `ending`, each defaulting to
`mazda_still`. Their complete choices are below. Values select existing IVF files;
the builder checks the selected file before building.

| Choice | `loop` | `transition` | `ending` |
| --- | --- | --- | --- |
| `mazda_still` | `LoopLogo.ivf` | `LoopLogo.ivf` | `LoopLogo.ivf` |
| `matrix` | `LoopLogoMatrix.ivf` | `LoopLogoMatrix.ivf` | `LoopLogoMatrix.ivf` |
| `large_mazda` | `TranLogoRace.ivf` | `TranLogoRace.ivf` | — |
| `fiat` | `LoopLogoFiat.ivf` | — | — |
| `spider_124` | — | `TranLogo124Spider.ivf` | — |
| `mazda_z` | `LoopLogoZ.ivf` | `LoopLogoZ.ivf` | `LoopLogoZ.ivf` |
| `cinema` | `LoopLogoCinema.ivf` | `LoopLogoCinema.ivf` | `TranLogoEndCinemma.ivf` |
| `criss_cross` | `TranLogoCrissCross.ivf` | `TranLogoCrissCross.ivf` | `TranLogoEndCrissCross.ivf` |
| `race` | `LoopLogoRace.ivf` | `LoopLogoRace.ivf` | `TranLogoEndRace.ivf` |
| `car_flash` | — | — | `TranLogoCarFlash.ivf` |
| `space` | — | — | `TranLogoEndSpace.ivf` |
| `race_large` | — | — | `TranRace.ivf` |
| `title_slam` | — | — | `TranIntroM.ivf` |
| `original` | — | `TranLogo.ivf` | `TranLogoEnd.ivf` |

The ending choices labelled Large Mazda and Race in the GUI both select
`TranLogoEndRace.ivf`, so the CLI has one `race` choice. The existing vehicle script
selects the applicable resource paths and stages for the detected firmware.

## Application and swapfile options

### video_player

| Option | Type / allowed values | Default |
| --- | --- | --- |
| `shuffle` | Boolean. | `true` |
| `repeat` | `none`, `one`, `all`. | `all` |
| `fullscreen` | `windowed`, `keep_aspect_ratio`, `full`. | `full` |
| `v4l_sink` | Boolean. | `true` |

### swapfile

`mount_on_boot` is a boolean, default `true`. Installation expands the bundled
`config/swapfile/swapfile.zip` into the generated package. With boot mounting
enabled, the installer provisions it through the existing USB-swap fragment;
otherwise the generated swapfile is placed at the package root. The existing
swapfile-associated cleanup step is included and reported by `plan` even when
`installer.self_destruct` is `false`. Custom swap sizes and resources-partition
swap are outside this interface.

### fuel_consumption

`unit` accepts `km_per_l`, `mpg`, or `l_per_100km`; default `km_per_l`.

### android_auto

| Option | Type / allowed values | Default |
| --- | --- | --- |
| `wifi` | Boolean. | `false` |
| `debug_logging` | Boolean. | `false` |
| `gps_source` | `car`, `phone`. | `car` |
| `reverse_heading` | Boolean; requires `gps_source: car`. | `false` |

**Note:** the following things are known to interfere with wireless Android Auto on my car:
- Bluetooth: it must be disabled, otherwise the connection quality is too poor to establish AA connection
- Wifi Power Saving: it slightly affects stability.  Disable it using shell: `iw dev wlan0 set power_save off`
- Wifi AP from car infotainment system: must be disabled.  Otherwise Wifi connection will fail.

### aio_app

`screen_off_on_boot` is a boolean, default `false`.

### speedometer

Defaults are explicit and locale-independent. The following table covers scalar
options; the following subsections define every structured option.

| Option | Type / allowed values | Default |
| --- | --- | --- |
| `language` | `en`, `de`, `es`, `pl`, `sk`, `tr`, `fr`, `it`, `nl`. | `en` |
| `speed_unit` | `kmh`, `mph`. | `kmh` |
| `fuel_unit` | `km_per_l`, `l_per_100km`. | `km_per_l` |
| `temperature_unit` | `c`, `f`. | `c` |
| `start_view` | `bar`, `classic`. | `bar` |
| `classic_analog` | Boolean. | `true` |
| `classic_large_text` | Boolean. | `false` |
| `analog_color` | `red`, `blue`, `green`, `purple`, `yellow`, `orange`, `pink`, `silver`. | `red` |
| `background` | `infotainment`, `original`. | `infotainment` |
| `background_opacity` | Number, `0`–`1`; applies to `infotainment`. | `0` |
| `bottom_rows` | Integer, `1`–`4`. | `4` |
| `bar_theme` | Integer, `0`–`5`; `0` selects the bundled default. | `0` |
| `rpm_bar` | Boolean. | `false` |
| `hide_bar` | Boolean. | `false` |
| `counter_animation` | Boolean. | `false` |
| `fuel_gauge_unit` | `percent`, `l`, `gal`. | `percent` |
| `fuel_tank_capacity` | Positive number in the selected unit; required for `l` or `gal`. | None; percent mode uses factor `100` |

#### Speedometer statusbar

`statusbar` is a mapping with these fields. It is independent of the top-level
`statusbar` and `date_to_statusbar` tweaks.

| Field | Type / allowed values | Default |
| --- | --- | --- |
| `enabled` | Boolean. | `false` |
| `main_value` | Metric name from the layout table below, or `none`. | `gps_speed` |
| `rotating_values` | Exactly two metric names or `none` entries. | `[gps_heading, gps_altitude]` |
| `interval_seconds` | Number, at least `1`. | `2` |
| `fuel_bar` | `disabled`, `below_statusbar`, `above_statusbar`, `bottom`. | `disabled` |
| `digital_clock` | Boolean. | `false` |
| `hide_in_reverse` | Boolean. | `false` |
| `hide_in_app` | Boolean. | `true` |
| `hide_during_notifications` | Boolean. | `true` |

#### Speedometer layouts

`bar_layout` maps metric names to `[area, row, position]` integer triples. Area `0`
is the main/side column: `[0, 0, 0]` is center; `[0, 1, 1..4]` are side slots.
Area `1` is a bottom row, with rows `1..bottom_rows` and positions `1..5`. Area `2`
hides a value; its remaining two coordinates are ignored. Visible slots must be
unique after merging overrides with defaults.

`classic_layout` maps supported metric names to integer positions `0`–`99`.
Equal positions stack in the bundled order. A dash means the metric has no classic
layout field. Both mappings default to this complete table:

| Metric | Bar position | Classic position |
| --- | --- | --- |
| `vehicle_speed` | `[0, 0, 0]` | — |
| `top_speed` | `[0, 1, 1]` | `1` |
| `average_speed` | `[0, 1, 2]` | `3` |
| `gps_speed` | `[0, 1, 3]` | — |
| `engine_rpm` | `[0, 1, 4]` | — |
| `trip_time` | `[1, 1, 1]` | `8` |
| `idle_time` | `[1, 1, 2]` | `9` |
| `trip_distance` | `[1, 1, 3]` | `2` |
| `fuel_level` | `[1, 1, 4]` | — |
| `outside_temperature` | `[1, 1, 5]` | `12` |
| `gps_heading` | `[1, 2, 1]` | — |
| `gps_altitude` | `[1, 2, 2]` | `4` |
| `gps_altitude_min_max` | `[1, 2, 3]` | `5` |
| `trip_fuel_economy` | `[1, 2, 4]` | `11` |
| `intake_temperature` | `[1, 2, 5]` | `13` |
| `gear_position` | `[1, 3, 1]` | `15` |
| `transmission_lever` | `[1, 3, 2]` | `16` |
| `top_engine_rpm` | `[1, 3, 3]` | — |
| `average_fuel_economy` | `[1, 3, 4]` | — |
| `coolant_temperature` | `[1, 3, 5]` | `14` |
| `engine_load` | `[2, 4, 0]` | — |
| `gps_latitude` | `[1, 4, 2]` | `6` |
| `gps_longitude` | `[1, 4, 3]` | `7` |
| `total_fuel_economy` | `[1, 4, 4]` | — |
| `engine_idle_time` | `[1, 4, 5]` | `10` |
| `battery_charge` | `[1, 4, 1]` | `17` |

Reducing `bottom_rows` requires moving or hiding values assigned to removed rows.
For example, a field override has this shape under speedometer `options`:

```yaml
bar_layout:
  engine_load: [2, 0, 0]
classic_layout:
  top_speed: 2
  trip_distance: 1
```

#### Speedometer controls

`controls.bar` and `controls.classic` map each binding in the first column to a
named action. The table supplies all default bindings and the allowed actions for
each view. `none` disables a binding. `toggle_statusbar` is also allowed in either
view and has no default binding.

| Binding | Bar default/action | Classic default/action |
| --- | --- | --- |
| `select` | `next_row` | `toggle_analog` |
| `up` | `toggle_speed_unit` | `toggle_speed_unit` |
| `down` | `toggle_rpm_bar` | `toggle_large_text` |
| `right` | `toggle_temperature_fuel_unit` | `toggle_temperature_fuel_unit` |
| `left` | `toggle_background` | `toggle_background` |
| `hold_select` | `reset_layout` | `rotate_top_value` |
| `hold_up` | `switch_view` | `switch_view` |
| `hold_down` | `toggle_bar` | `toggle_basic_speedometer` |
| `hold_right` | `reset_trip` | `reset_trip` |
| `hold_left` | `next_theme` | `next_theme` |

#### Speedometer palettes

`bar_themes` maps string keys `"1"`–`"5"` to mappings of `primary`, `secondary`,
and `border` colors. These are the complete defaults:

| Theme key | Primary | Secondary | Border |
| --- | --- | --- | --- |
| `"1"` | `"#7fffd4"` | `"#64bfff"` | `"#0000ff"` |
| `"2"` | `"#3fff17"` | `"#ff8181"` | `"#ffca00"` |
| `"3"` | `"#ed4bff"` | `"#52ff5a"` | `"#e4c300"` |
| `"4"` | `"#a680ff"` | `"#e644ff"` | `"#1484b8"` |
| `"5"` | `"#ff0000"` | `"#00ff00"` | `"#0000ff"` |

`fuel_bar_colors` maps string upper-bound keys `"20"`, `"40"`, `"60"`, `"80"`,
and `"100"` to colors. Their defaults are `"#ff0096"`, `"#ff9600"`, `"#9600ff"`,
`"#0096ff"`, and `"#00ff96"`, respectively. For example:

```yaml
bar_themes:
  "1":
    primary: "#ffffff"
fuel_bar_colors:
  "20": "#ff0000"
controls:
  bar:
    hold_left: toggle_statusbar
```

## Dependency, ordering, and conflict rules

- Application install/removal includes the shared helpers and registration files
  actually referenced by its scripts. Existing compatibility patches are included
  when required; `plan` reports these operations.
- Installing `media_order_flac` also selects the existing Wi-Fi and SSH bringback
  setup. An implicit SSH selection uses `force: false` unless explicitly configured.
- `no_disclaimer` and `audio_source_order` share versioned system-app payloads and
  must preserve the other tweak's installed marker as their existing scripts do.
- `usb_audio_mod` installation precedes `bigger_album_art`; swapfile installation
  is last among tweak installations, before cleanup and the ending fragment.
- `color_scheme` and `theme` cannot both be selected in one request, including
  mixed install/removal requests; they share the same restoration machinery.
- `background` and `background_rotator` cannot both be installed in one request.
  Removing rotation while installing a single background is supported.
- A theme or color install with `include_background: true` conflicts with a
  simultaneous background or background-rotator install.
- Date display and statusbar styling have separate actions. Their assembly and
  marker-scoped removal must preserve the independent selection.
- Omitting a component requests no direct operation. Shared-file changes remain
  visible in `plan`; the builder does not inspect the vehicle's installed state.

## Autorun and recovery packages

These use the top-level `autorun` mapping and cannot be combined with `tweaks`,
`installer`, or `resources`. The WebUI's **Package type** selector opens the same
options under **Autorun / Recovery**. `mzd-aio list autorun` also lists the fields.

| Field | Type / allowed values | Default / applicability |
| --- | --- | --- |
| `mode` | `install`, `serial`, `dry_run`. | `install` |
| `id7_recovery` | Boolean; include the bundled ID7 recovery pack. | `true`; install mode only. Serial mode always includes ID7. |
| `wifi_ap.enabled` | Boolean; include automatic Wi-Fi AP startup. | `false`; install and serial modes. |
| `wifi_ap.ssid` | SSID of 1–32 UTF-8 bytes, without control characters. The `YourSSID` placeholder is rejected. | Required when AP is enabled. |
| `wifi_ap.password` | WPA2 passphrase of 8–63 printable ASCII characters. The `YourSSIDpassword` placeholder is rejected. | Required when AP is enabled. |
| `ssh_over_adb` | Boolean; include the ADB executable and SSH-over-ADB boot scripts. | `false`; install and serial modes. |
| `include_dry_run` | Boolean; add the bundled success-dialog `run.sh` test. | `false`; install mode only. |
| `skip_confirmation` | Boolean; skip the original install/uninstall and reboot prompts. | `false`; install mode only. |

Fields outside their applicable modes are rejected, including explicitly supplied
false values. In `dry_run` mode, `mode` is the only accepted field. Untouched
defaults are omitted by the WebUI.

### Installer and ID7 recovery

`mode: install` copies the original CMU-autorun USB bootstrap, `autorun`, and
`utils.sh`, and generates `tweaks.sh` from the bundled installer. With
`skip_confirmation: false`, its original vehicle-side selection and reboot
prompts are enabled. With `true`, it follows the original automatic install and
reboot path. The installer replaces existing autorun/recovery script directories.

The ID7 pack includes `02-run-tweaks-from-usb`, SSH/firewall startup, password and
SSH-configuration recovery, and `44-recovery-recovery`. `id7_recovery: false`
creates a basic autorun installer, optionally with AP and/or ADB scripts. The
bundled payloads live under `app/files/tweaks/cmu-autorun/`.

### Automatic Wi-Fi access point and SSH-over-ADB

Automatic AP setup adds `02-start-wifiAP/` containing the boot hook, hostapd/DHCP
script, and generated `wifiAP.config`. The bundled defaults are channel 9,
802.11g, WPA2/AES, car IP `192.168.53.1`, and DHCP range
`192.168.53.20`–`192.168.53.254`. This hosts a network rather than joining a phone
hotspot; it is separate from the ordinary `enable_wifi` tweak and Android Auto's
`wifi` transport option.

```yaml
schema_version: 1
autorun:
  mode: install
  wifi_ap:
    enabled: true
    ssid: MyCarNetwork
    password: replace-with-your-password
```

Credentials are shell-quoted in `wifiAP.config`; hostapd generation retains spaces
and special characters literally. They are stored in the YAML and generated AP
configuration, and omitted from plan/progress messages and the compilation log.

`ssh_over_adb: true` adds `02-start-adb/` and the top-level vehicle-side `adb`
binary. Its boot script runs the bundled bridge, which uses
`adb reverse tcp:2222 tcp:22`. An Android device with USB debugging enabled can
connect an SSH client to `localhost:2222`. The car must have SSH running; enabling
ID7 recovery includes its SSH-startup scripts.

### Serial-access XX and autorun tests

`mode: serial` puts `autorun`, ID7 recovery, and optional AP/ADB payloads in `XX/`.
It omits `tweaks.sh`, `run.sh`, `utils.sh`, and the USB bootstrap. Copy the `XX`
folder to the USB root and follow the project's
[serial-access instructions](https://mazdatweaks.com/serial/) and
[firmware-specific ID7 instructions](https://mazdatweaks.com/id7/).

`mode: dry_run` produces only the bundled `run.sh` success-dialog test and a build
log. It requires an existing autorun setup to execute. `include_dry_run: true` in
install mode adds the same test at the package root; it can be moved to a separate
USB drive or SD card for testing after installation. It is a runtime check of
autorun, not a simulation of changes on the car.

See [the user guide](CLI.md#autorun-and-recovery-packages) and the examples
[autorun.yaml](../examples/autorun.yaml), [serial.yaml](../examples/serial.yaml),
and [autorun-test.yaml](../examples/autorun-test.yaml).

## Removed, dormant, and deferred features

These account for features present in labels, option forms, or leftover payloads
that do not become extra supported actions in the initial catalogue.

| Feature | Source / disposition |
| --- | --- |
| Speed-camera patch (old T23) | Removed from the active primary list; the controller explicitly prevents compilation. Old download/editor remnants do not establish a working installer. Unsupported. |
| Half-second disclaimer mode | Listed in language data, but its option form is commented out and the active builder does not use `disclaimOps`. Deferred; `no_disclaimer` supports full removal. |
| Date-to-statusbar v1 | Its shell fragment references missing `config/date-to-statusbar_mod/jci/gui/common/controls/StatusBar/css/StatusBarCtrl.v1.css`. Deferred; `date_to_statusbar` supports v3. |
| Resources-partition swapfile | The form sets `swapOps.resources`, but the active builder ignores it. The alternate `18_swapfile2-i.txt` fragment is not selected. Deferred. |
| Standalone multi-controller remapping | The builder branch for `00_multicontroller-i.txt` is commented out. Deferred. Speedometer-specific controls above are included. |
| Standalone Gracenote disabling | `config/disable_gracenote/` exists without an active tweak selection. Deferred; the USB Audio Mod's text setting is included. |
| Standalone Node/CASDK support fragments | Legacy `00__node-i.txt` and related support fragments are not independent ordinary-tweak selections. Included only when a supported operation actually needs them; no standalone action. |
| CASDK and CASDK applications | Separate installer branch. Deferred, including NA/EU selection, install/remove, apps-only mode, SD-card option, and the app selections listed below. |
| Autorun/recovery package generation | Implemented through the separate top-level `autorun` mapping documented above. Existing autorun users can also request `installer.script_name: run.sh` for ordinary tweaks. |
| Full system restore | Separate `00___fullRestore.sh` workflow, including its delete-backups option. Deferred. |
| GUI utilities and preferences | Translator, visual previews, image-joiner window, tours, automatic updates, USB discovery/copy dialogs, saved UI state, display sorting, and random-color buttons are outside the build configuration. Image conversion/rotation assembly and explicit colors are included above. |

The CASDK application switches in the existing builder are `simpledashboard`,
`gpsspeed`, `multidash`, `vdd`, `devtools`, `terminal`, `background`, `tetris`,
`snake`, `breakout`, `clock`, and `simplespeedo`. The controller additionally has
`aio`, `speedometer`, and `multicontroller` switches that the CASDK builder does
not currently serialize. All remain part of the deferred CASDK workflow rather
than ordinary `tweaks` entries.

## Source audit and implementation notes

Coverage was checked against `app/lang/english.aio.json` (`tweakOps`, `mainOps`,
and option labels), `app/controllers/home.js` (defaults and modes),
`app/assets/js/build-tweaks.js` (selection and generation), the forms under
`app/opts/`, `audioSourceList.js`, `messages-settings.js`, `spdValues.js`, and
the actual fragments and payloads under `app/files/tweaks/`.

The CLI handles the following source inconsistencies while assembling the
affected selections:

- The Slovak speedometer branch refers to missing `19_speedo-slovic.txt`. The CLI
  writes the explicit startup language (`SK`) directly into its copied payload.
- The builder refers to missing `19_set_sb_values.txt`, while the bundled
  `19_speedo-i2.txt` already applies the statusbar value variables. The CLI uses
  that completion fragment and explicit generated startup settings. This also
  sets the rotation interval in the startup file, where the bundled variable is
  actually defined.
- The cinema ending fragment names `TranLogoEndCinema.ivf`; the actual bundled
  filename is `TranLogoEndCinemma.ivf`. The CLI corrects the assembled reference.
- The statusbar style fragments call the general CSS-removal helper without a
  marker argument; the removal fragment also names `SbnBar` while installation
  targets `Sbn`. The CLI corrects the removal path and labels new styling blocks
  `STATUSBAR`; removal preserves date CSS and also recognizes legacy unlabelled
  styling blocks.
- MZD Meter selection uses a separate flag while some legacy dependency checks
  look for numeric T28; the CLI resolves dependencies from the named selection.

The guide's `resources.color_schemes` field is added because an uninstall accepts
no tweak-specific options but can still require the external Red restoration pack.
No resource pack is fetched automatically or discovered through GUI user data.
