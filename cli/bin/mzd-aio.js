#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { registry, autorunSchema } from '../src/registry.js'
import { loadConfig, describeOptions } from '../src/config.js'
import { createPlan, validatePlan, formatPlan } from '../src/plan.js'
import { buildPackage } from '../src/build.js'

const usage = `Usage:
  mzd-aio list [TWEAK|autorun]
  mzd-aio validate CONFIG
  mzd-aio plan CONFIG
  mzd-aio build CONFIG --output DIRECTORY
  mzd-aio configure [CONFIG] [--port PORT] [--no-open]

Build offline USB installation packages from this checkout.
Paths in YAML are relative to CONFIG; output is relative to the current directory.
See docs/CLI.md and docs/CLI-TWEAKS.md for options and dependencies.
`

try {
  const { values, positionals } = parseArgs({ options: { help: { type: 'boolean', short: 'h' }, output: { type: 'string', short: 'o' }, port: { type: 'string' }, 'no-open': { type: 'boolean' } }, allowPositionals: true })
  if (values.help || !positionals.length) console.log(usage)
  else {
    const [command, argument, ...extra] = positionals
    if (extra.length || !['list', 'validate', 'plan', 'build', 'configure'].includes(command)) throw new Error(usage)
    if (command !== 'build' && values.output !== undefined) throw new Error('--output is only valid for build')
    if (command !== 'configure' && (values.port !== undefined || values['no-open'])) throw new Error('--port and --no-open are only valid for configure')
    if (command === 'configure') {
      const { startWebUI, openWebUI } = await import('../src/webui.js')
      const port = values.port === undefined ? 0 : /^\d+$/.test(values.port) ? Number(values.port) : NaN
      const editor = await startWebUI({ filename: argument, port })
      console.log(`Configuration editor: ${editor.url}\nConfig path: ${editor.filename}\nPress Ctrl+C to stop.`)
      if (!values['no-open']) openWebUI(editor.url)
      const stop = () => { editor.server.close(); editor.server.closeAllConnections() }
      process.once('SIGINT', stop)
      process.once('SIGTERM', stop)
    } else if (command === 'list' && argument === 'autorun') {
      console.log('autorun [package] — CMU-autorun installer, ID7 recovery, serial XX, and autorun test packages')
      console.log(describeOptions(autorunSchema).join('\n'))
      console.log('  Use autorun instead of tweaks/installer/resources. See docs/CLI-TWEAKS.md for mode constraints.')
    } else if (command === 'list') {
      const names = argument ? [argument] : Object.keys(registry)
      for (const name of names) {
        if (!Object.hasOwn(registry, name)) throw new Error(`unknown tweak: ${name}`)
        const definition = registry[name]
        console.log(`${name} [${definition.uninstall ? 'install, uninstall' : 'install'}] — ${definition.description}`)
        if (argument) {
          const options = describeOptions(definition.options)
          console.log(options.length ? options.join('\n') : '  No install options.')
          console.log('  See docs/CLI-TWEAKS.md for resource requirements and cross-option constraints.')
        }
      }
      if (!argument) console.log('autorun [package] — CMU-autorun / ID7 recovery, automatic Wi-Fi AP, SSH-over-ADB, serial XX, and autorun tests; use list autorun')
    } else {
      if (!argument) throw new Error(`${command} requires a configuration file`)
      if (command === 'build' && !values.output?.trim()) throw new Error('build requires --output DIRECTORY')
      const config = await loadConfig(argument)
      const plan = await validatePlan(createPlan(config))
      if (command === 'validate') console.log(`Valid: ${argument} (${config.autorun ? `autorun ${config.autorun.mode} package` : `${Object.keys(config.tweaks).length} selected tweaks`})`)
      else if (command === 'plan') console.log(formatPlan(plan))
      else {
        const output = await buildPackage(plan, values.output, { onProgress: message => console.error(message) })
        console.log(`Built installation package: ${output}`)
      }
    }
  }
} catch (error) {
  console.error(`mzd-aio: ${error.message}`)
  process.exitCode = 1
}
