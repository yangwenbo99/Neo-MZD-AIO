# YAML CLI user guide

The standalone CLI supports the 40-entry ordinary-tweak catalogue below and
CMU-autorun, ID7 recovery, serial-access, and autorun-test packages.

Build a USB installation package from a YAML file using the scripts and payloads
in this checkout. Settings come from the configuration and documented defaults,
independently of saved GUI settings or system locale.

## Quick start

Requirement: Node.js 22.2 or newer. From the repository root, install the
CLI's dependencies separately:

```sh
npm ci --prefix cli
```

Inspect the available tweaks, validate the example, preview its operations, and
build into a new directory:

```sh
node cli/bin/mzd-aio.js list
node cli/bin/mzd-aio.js validate examples/tweaks.yaml
node cli/bin/mzd-aio.js plan examples/tweaks.yaml
node cli/bin/mzd-aio.js build examples/tweaks.yaml --output ./installation
```

The [complete example configuration](../examples/tweaks.yaml) specifies every
installer-wide setting and every option for its selected configurable tweaks.
It combines installation and removal and uses images and a theme already present
in this repository. Edit its selections to suit your installation.

Dependencies and optional asset packs are obtained beforehand. CLI commands run
offline and check only the resources required by the selected tweaks.

## Web configuration editor

Launch the local WebUI to create a configuration, or open an existing file:

```sh
node cli/bin/mzd-aio.js configure
node cli/bin/mzd-aio.js configure examples/tweaks.yaml
```

The command prints a local URL and opens your browser. It chooses an available
port on `127.0.0.1`. To select a port and open the URL yourself:

```sh
node cli/bin/mzd-aio.js configure --port 9040 --no-open
```

Keep the command running while editing; press **Ctrl+C** in the terminal to stop.
The editor runs offline using the CLI's existing dependencies and option registry.

1. Choose a **Package type**: ordinary tweaks, CMU-autorun installer, serial access
   (`XX`), or autorun test. Set the **Configuration file** path. **Open YAML** loads
   an existing local file; **Use example** fills a draft for the selected package
   type at the current save path.
2. Search the catalogue and select **Unchanged**, **Install**, or **Uninstall**.
   Choose a tweak's name to edit it. Installer settings and resource packs have
   their own tabs. Nested option groups expand to show layouts, bindings, palettes,
   audio positions, and message replies. Adding a reply language starts with its
   15 bundled messages.
3. Select assets with **Browse**, or enter their paths. The file browser accesses
   the computer running `mzd-aio`; selected images have previews. Paths are relative
   to the configuration file. **Set path** rebases relative asset references when
   changing the save location; **Save YAML** also applies a pending path change.
4. Review the live YAML and validation messages. Untouched defaults are omitted;
   **Use default** removes an explicit override. Uninstall entries contain only
   their action. Explicit settings in loaded configurations are preserved.
5. **Check local resources** runs the CLI's full validation and displays the build
   plan. **Save YAML** checks configuration settings and writes the selected path,
   replacing an existing configuration there. This lets you save configurations
   before all optional local assets have been obtained.

Saving reformats the YAML; comments and original formatting are not retained.
Use **Copy** to copy the preview instead. After saving, build the package using
the `build` command above.

## Autorun and recovery packages

In the WebUI, choose **CMU-autorun installer** under **Package type** to open the
**Autorun / Recovery** section. It provides ID7 recovery, automatic Wi-Fi AP,
SSH-over-ADB, an optional autorun test script, and the original installer prompts.
The ID7 pack is enabled by default; the AP and ADB options are opt-in.

The same `validate`, `plan`, and `build` commands handle these package types:

```sh
node cli/bin/mzd-aio.js list autorun
node cli/bin/mzd-aio.js configure examples/autorun.yaml
node cli/bin/mzd-aio.js validate examples/autorun.yaml
node cli/bin/mzd-aio.js plan examples/autorun.yaml
node cli/bin/mzd-aio.js build examples/autorun.yaml --output ./autorun-installation
```

| Configuration | Package contents / use |
| --- | --- |
| [autorun.yaml](../examples/autorun.yaml) | USB installer for CMU-autorun, ID7 recovery, and SSH-over-ADB, plus a `run.sh` test. The example leaves automatic Wi-Fi AP disabled. |
| [serial.yaml](../examples/serial.yaml) | `XX/` containing autorun and ID7 recovery core files for manual installation through a serial connection. Optional AP and ADB payloads also go inside `XX/`. |
| [autorun-test.yaml](../examples/autorun-test.yaml) | Standalone `run.sh` that displays an **AUTORUN ACTIVATED** dialog when executed by an existing autorun setup. |

An autorun configuration uses the top-level `autorun` mapping instead of
`tweaks`, `installer`, and `resources`. Ordinary tweaks and recovery packages are
separate build requests. For example:

```yaml
schema_version: 1
autorun:
  mode: install
  id7_recovery: true
  ssh_over_adb: false
  include_dry_run: true
  skip_confirmation: false
  wifi_ap:
    enabled: false
```

The installer replaces the existing autorun/recovery script directories with the
selected payloads. Use the original vehicle-side **Install** choice to install
them. Serial mode supplies core files for the project's
[serial-access procedure](https://mazdatweaks.com/serial/); it generates no USB
installer or bootstrap. Firmware-specific instructions are also linked from the
project's [ID7 recovery guide](https://mazdatweaks.com/id7/).

To enable an automatic AP, set `autorun.wifi_ap.enabled: true` and supply `ssid`
and `password` in that mapping. It starts the car's access point and DHCP server
on boot, using channel 9, WPA2/AES, and `192.168.53.1`. Hosting this AP changes the
Wi-Fi role from joining another network to providing one; leave it disabled for
normal Wi-Fi client use. Credentials are stored in the YAML and generated
`02-start-wifiAP/wifiAP.config`; the build plan and compilation log omit them.

SSH-over-ADB uses the bundled vehicle-side ADB executable and reverses Android
port `2222` to the car's SSH port `22`. It requires an Android device with USB
debugging enabled and an available SSH service on the car; the ID7 pack includes
the SSH-startup scripts. Connect from the Android SSH client to `localhost:2222`.

The dry-run package tests autorun execution; it is not an installation simulation.
Copy its `run.sh` to the root of a USB drive or SD card used by the existing
autorun setup. `include_dry_run` adds the same test alongside an installer for use
after installation. Full field defaults and mode constraints are in the
[autorun option reference](CLI-TWEAKS.md#autorun-and-recovery-packages).

## Commands

The executable name is `mzd-aio`; the commands above invoke it directly
with Node.js from the checkout.

| Command | Behavior |
| --- | --- |
| `list [NAME]` | List tweaks and package support; with a tweak name or `autorun`, show its options, allowed values, and defaults. |
| `validate CONFIG` | Check YAML, settings, selections, and required local resources. |
| `plan CONFIG` | Validate and show requested actions, shared dependencies, and script execution order. |
| `build CONFIG --output DIRECTORY` | Validate and assemble a complete installation package. The output directory must not already exist. |
| `configure [CONFIG] [--port PORT] [--no-open]` | Start the local WebUI to create or edit YAML configurations. |

`validate` and `plan` only read inputs. `build` uses a staging directory and
publishes the result after all writes and copies complete. Successful commands
exit with status `0`; invalid input or a failed build returns a nonzero status
with a diagnostic identifying the setting or resource involved. `--help` shows
usage.

## Configuration

Every configuration requires `schema_version: 1` and either a nonempty `tweaks`
mapping or an `autorun` mapping. Ordinary tweak configurations can also contain
`installer` and `resources`; autorun configurations cannot contain those fields.
Installer settings are optional and use the defaults below. `resources` is
optional unless the selected tweaks require an external resource pack.

Each tweak has a required action from the catalogue below. Configurable
installs can include an `options` mapping; uninstall entries contain only `action`.
Omitting a tweak requests no operation for that tweak. Shared dependencies and
common installer setup are included automatically and shown by `plan`.

Mapping order in YAML does not control execution order. The builder preserves the
installer's ordering rules, including removals before installations.

### Installer settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `script_name` | `tweaks.sh` | `tweaks.sh` for the normal USB installer; `run.sh` for an existing autorun setup. |
| `keep_backups` | `true` | Request copying original-file backups onto the USB drive. |
| `test_backups` | `true` | Request before/after copies for tweaks that provide them. |
| `skip_confirmation` | `false` | Skip the vehicle-side installation confirmation. |
| `apps_to_resources` | `false` | Request installation of application files on the resources partition. |
| `retrieve_cmu_data` | `false` | Include the existing CMU diagnostic-data retrieval payload; requires `script_name: tweaks.sh`. |
| `self_destruct` | `false` | Include the existing installation-file cleanup step. |

These settings configure the bundled installer scripts; those scripts retain
their existing runtime compatibility checks and storage-dependent adjustments.
Wi-Fi and SSH tweaks are selected explicitly rather than enabled as GUI defaults.

### Complete tweak catalogue

These **40 entries** account for all 26 primary tweaks, the sidebar
operations, and the supplementary list-beep and MZD Meter controls in this checkout.
Every entry is opt-in. `I/U` means `install` and `uninstall`; `I` means `install`
only. For backup and SD CID retrieval, `install` schedules that operation when the
package runs on the vehicle.

The source column identifies the existing primary tweak ID (`T`) or sidebar ID
(`M`); these IDs are for traceability and are not YAML values. Sidebar `M7` is
represented by installer settings above.

| YAML name | Actions | Purpose | Source |
| --- | --- | --- | --- |
| `touchscreen` | I/U | Touchscreen restrictions and optional DVD playback. | T1 |
| `no_disclaimer` | I/U | Remove or restore the startup disclaimer. | T2 |
| `reverse_camera_warning` | I/U | Remove or restore the reverse-camera warning graphic. | T3 |
| `transparent_parking_sensors` | I/U | Semi-transparent parking sensor graphics. | T4 |
| `main_menu_loop` | I/U | Wrap around the main menu. | T5 |
| `list_loop` | I/U | Wrap around lists. | T6 |
| `shorter_delay` | I/U | Reduce multi-controller page-switch delay. | T7 |
| `no_list_beeps` | I/U | Remove the long-press list beep. | Extra: `user.listbeep` |
| `no_system_beeps` | I/U | Remove system beeps. | T8 |
| `audio_source_order` | I/U | Set audio-source positions. | T9 |
| `pause_on_mute` | I/U | Pause media when muted. | T10 |
| `message_replies` | I/U | Remove the Mazda reply suffix and optionally customize preset replies. | T11 |
| `diagnostic_menu` | I/U | Open the diagnostic menu with a one-second clock press. | T12 |
| `boot_animation` | I/U | Choose the three bundled boot-animation stages. | T13 |
| `bigger_album_art` | I/U | Larger artwork, full-width titles, or hidden artwork. | T14 |
| `remove_overlays` | I/U | Remove selected background overlays. | T15 |
| `blank_album_art` | I/U | Replace the missing-artwork image. | T16 |
| `video_player` | I/U | Video player and playback defaults. | T17 |
| `swapfile` | I/U | Provision the bundled USB swapfile and optional boot mounting. | T18 |
| `speedometer` | I/U | Speedometer, units, layouts, controls, themes, and statusbar display. | T19 |
| `statusbar` | I/U | Statusbar colors, background image, and opacity. | T20 |
| `date_to_statusbar` | I/U | Date display and date format, selected independently of statusbar styling. | T20 |
| `media_order_flac` | I/U | Media ordering patch and FLAC support. | T21 |
| `fuel_consumption` | I/U | Additional fuel-consumption display and units. | T22 |
| `castscreen_receiver` | I/U | Castscreen receiver application. | T24 |
| `android_auto` | I/U | Bundled headunit application and its Wi-Fi, logging, GPS, and touchscreen options. | T25 |
| `usb_audio_mod` | I/U | USB Audio Mod and Gracenote label. | T26 |
| `aio_app` | I/U | AIO Tweaks App and optional screen-off-on-boot behavior. | T27 |
| `mzd_meter` | I/U | Legacy MZD Meter application. | Extra: `user.mzdmeter` |
| `enable_wifi` | I | Enable Wi-Fi through the existing regional patch. | M0 |
| `backup_jci` | I | Back up the JCI directory, optionally as an archive. | M1 |
| `background` | I/U | Set an image or restore the bundled default background. | M2 |
| `color_scheme` | I/U | Apply a local color pack or restore Red. | M3 |
| `theme` | I/U | Apply a theme ZIP or custom `jci` image directory; removal restores Red. | M3 |
| `ssh_bringback` | I | Restore SSH support, optionally forcing configuration replacement. | M4 |
| `sd_cid` | I | Retrieve the navigation SD card CID. | M5 |
| `background_rotator` | I/U | Assemble and install a rotating background from local images. | M6 |
| `main_menu` | I/U | Layout, labels, ellipse, coins, focus, and glow. | M8 |
| `ui_style` | I/U | Text colors and shadows. | M9 |
| `offscreen_background` | I/U | Set the display-off/shutdown image or restore its bundled default. | M10 |

The [complete option reference](CLI-TWEAKS.md) defines every supported option,
allowed value, default, resource requirement, dependency, and conflict. It also
accounts for removed, dormant, and deferred features. The example YAML remains a
single build request selecting twelve entries from this catalogue.

### External resource packs

Download the optional [color-schemes.zip pack](https://github.com/Trevelopment/cmu-autorun/releases/download/1/color-schemes.zip)
(approximately 103 MiB). The original maintainer provided this replacement link
in [MZD-AIO issue #111](https://github.com/Trevelopment/MZD-AIO/issues/111#issuecomment-835883854)
after the old download link broke. Extract it locally, keeping the per-color
`jci.zip` archives intact.

`resources.color_schemes` is a local directory containing the unpacked optional
color pack, for example `Red/jci.zip` and `Blue/jci.zip`. It has no default search
location. Set it when selecting `color_scheme`, or when uninstalling `theme`:

```yaml
resources:
  color_schemes: ./assets/color-schemes
```

Theme installation using a bundled ZIP does not need this pack. Color and theme
removal use `Red/jci.zip` to restore the default appearance. Details and the Blue
navigation archive requirement are in the option reference.

In the WebUI, set this directory under **Resource packs**. Creating and saving
YAML does not require the pack; resource checks and builds require it when the
selected operations use it.

### Local resources and validation

- Paths inside YAML are relative to the configuration file's directory. An
  `--output` path is relative to the shell's current directory. Absolute paths are
  also accepted. Paths identify local files, not URLs.
- Background and off-screen images become 800 × 480 PNGs; blank album art becomes
  a 146 × 146 PNG. Input formats are PNG and JPEG; images are resized to fill these
  dimensions.
- Theme resources are supplied locally. Only a selection that needs an external
  color pack requires that pack to be present.
- Quote hexadecimal colors, use YAML booleans `true`/`false`, and use one entry per
  tweak. Unknown keys, duplicate keys, unsupported actions/options, invalid values,
  conflicting selections, or missing required resources are errors.
- Options omitted from a selected install use that tweak's documented defaults.
  Use `list TWEAK` to inspect them.

## Output and USB use

For a normal USB build, the output contains `tweaks.sh`, the existing bootstrap
files, selected payloads under `config/`, removal payloads under `config_org/` when
needed, and `MZD_LOG.md`, a compilation log with the build plan. The assembled
installer uses LF line endings. A `run.sh` build uses
the existing autorun-style package layout. The separate `autorun` package types
and their output layouts are described above.

Copy the **contents** of the output directory to the root of a FAT32 USB drive.
The build command prepares files on the computer; the installation runs on the
vehicle using the project's existing installation procedure and prerequisites.

For another build, choose a new output directory or remove the previous generated
directory yourself. `plan` provides a preview without creating an installation
package.

## Verification

Run the standalone tests without installing or launching Electron:

```sh
npm test --prefix cli
```

The suite uses Node's built-in test runner and Bash for generated-script checks.
It covers the catalogue, representative install/removal/mixed packages, offline
commands, local asset handling, generated settings, and failed-build cleanup.
Swapfile tests temporarily need slightly over 1 GiB of free space. Set
`MZD_AIO_TEST_TMP` to choose their temporary directory.

The optional browser smoke test uses an installed Chromium browser, with its
profile and temporary files under this checkout's `tmp/`:

```sh
npm run test:webui --prefix cli
```

Set `CHROMIUM` if the browser executable has a different name or path. Screenshots
are saved to `tmp/webui-desktop.png`, `tmp/webui-mobile.png`, and
`tmp/webui-autorun.png`.
