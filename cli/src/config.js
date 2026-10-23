import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseDocument } from 'yaml'
import { registry, installerSchema, object } from './registry.js'

const own = (value, key) => Object.hasOwn(value, key)
const mapping = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const fail = (location, message) => { throw new Error(`${location}: ${message}`) }

// One descriptor tree drives validation, defaults, and `list TWEAK` output.
export function normalize (schema, input, location, base) {
  if (input === undefined) {
    if (own(schema, 'default')) input = structuredClone(schema.default)
    else if (schema.required) fail(location, 'is required')
    else return undefined
  }
  if (schema.type === 'object' || schema.type === 'record') {
    if (!mapping(input)) fail(location, 'expected a mapping')
    for (const key of Object.keys(input)) {
      if (!(schema.type === 'object' ? own(schema.fields, key) : schema.keys.includes(key))) fail(`${location}.${key}`, 'unknown setting')
    }
    const entries = schema.type === 'object' ? Object.entries(schema.fields) : Object.keys(input).map(key => [key, schema.item])
    return Object.fromEntries(entries.map(([key, field]) => [key, normalize(field, own(input, key) ? input[key] : undefined, `${location}.${key}`, base)]).filter(([, value]) => value !== undefined))
  }
  if (schema.type === 'array') {
    if (!Array.isArray(input) || input.length < schema.min || input.length > schema.max) fail(location, `expected a list of ${schema.min === schema.max ? schema.min : `at least ${schema.min}`} items`)
    return input.map((value, index) => normalize(schema.item, value, `${location}[${index}]`, base))
  }
  if (schema.type === 'boolean') {
    if (typeof input !== 'boolean') fail(location, 'expected true or false')
  } else if (schema.type === 'number') {
    if (typeof input !== 'number' || !Number.isFinite(input) || input < schema.min || input > schema.max || (schema.integer && !Number.isSafeInteger(input))) {
      fail(location, `expected ${schema.integer ? 'an integer' : 'a number'} between ${schema.min} and ${schema.max}`)
    }
  } else {
    if (typeof input !== 'string' || input.includes('\0')) fail(location, 'expected a string without NUL characters')
    if (schema.values && !schema.values.includes(input)) fail(location, `expected one of: ${schema.values.join(', ')}`)
    if (schema.singleLine && /[\r\n]/.test(input)) fail(location, 'expected a single-line string')
    if (schema.xml && (!input.isWellFormed() || /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/u.test(input))) fail(location, 'contains a character unsupported by XML 1.0')
    if (schema.type === 'color') {
      if (!/^#[0-9a-f]{6}$/i.test(input)) fail(location, 'expected a quoted "#rrggbb" color')
      return input.toLowerCase()
    }
    if (schema.type === 'path') {
      if (!input.trim()) fail(location, 'expected a nonempty local path')
      return path.resolve(base, input)
    }
  }
  return input
}

export function normalizeConfig (input, filename) {
  const base = path.dirname(path.resolve(filename))
  if (!mapping(input)) fail('configuration', 'expected a mapping')
  for (const key of Object.keys(input)) if (!['schema_version', 'installer', 'resources', 'tweaks'].includes(key)) fail(key, 'unknown top-level setting')
  if (input.schema_version !== 1) fail('schema_version', 'must be 1')
  if (!mapping(input.tweaks) || !Object.keys(input.tweaks).length) fail('tweaks', 'expected a nonempty mapping')
  const installer = normalize(installerSchema, input.installer, 'installer', base)
  const resources = normalize(object({ color_schemes: { type: 'path', kind: 'directory' } }), input.resources, 'resources', base)
  if (installer.script_name === 'run.sh' && installer.retrieve_cmu_data) fail('installer.retrieve_cmu_data', 'requires script_name: tweaks.sh; data retrieval uses the normal USB bootstrap')
  const tweaks = {}
  for (const [name, selection] of Object.entries(input.tweaks)) {
    const location = `tweaks.${name}`
    if (!own(registry, name)) fail(location, 'unknown or deferred tweak; use list for supported names')
    if (!mapping(selection)) fail(location, 'expected an action/options mapping')
    const definition = registry[name]
    const allowed = definition.uninstall ? ['install', 'uninstall'] : ['install']
    if (!allowed.includes(selection.action)) fail(`${location}.action`, `expected ${allowed.join(' or ')}`)
    for (const key of Object.keys(selection)) if (!['action', 'options'].includes(key)) fail(`${location}.${key}`, 'unknown setting')
    if (selection.action === 'uninstall') {
      if (own(selection, 'options')) fail(`${location}.options`, 'uninstall accepts only action')
      tweaks[name] = { action: 'uninstall' }
      continue
    }
    const options = normalize(definition.options, selection.options, `${location}.options`, base)
    tweaks[name] = { action: 'install', options }
    const error = message => fail(`${location}.options`, message)
    if (name === 'theme' && Boolean(options.archive) === Boolean(options.jci_directory)) error('supply exactly one of archive and jci_directory')
    if (name === 'remove_overlays' && !Object.values(options).some(Boolean)) error('select at least one overlay')
    if (name === 'main_menu' && options.small_focus && !options.small_coins) error('small_focus requires small_coins: true')
    if (name === 'android_auto' && options.reverse_heading && options.gps_source !== 'car') error('reverse_heading requires gps_source: car')
    if (name === 'speedometer') {
      if (options.fuel_gauge_unit !== 'percent' && !options.fuel_tank_capacity) error('fuel_tank_capacity is required for l or gal')
      const slots = new Set()
      for (const [metric, position] of Object.entries(options.bar_layout)) {
        const [area, row, column] = position
        if (area === 2) continue
        if (!(area === 0 ? ((row === 0 && column === 0) || (row === 1 && column >= 1 && column <= 4)) : area === 1 && row >= 1 && row <= options.bottom_rows && column >= 1 && column <= 5)) error(`bar_layout.${metric}: invalid or unavailable visible slot`)
        const slot = position.join(',')
        if (slots.has(slot)) error(`bar_layout.${metric}: duplicate visible slot [${slot}]`)
        slots.add(slot)
      }
    }
  }
  const installs = name => tweaks[name]?.action === 'install'
  if (tweaks.color_scheme && tweaks.theme) fail('tweaks', 'color_scheme and theme are mutually exclusive')
  if (installs('background') && installs('background_rotator')) fail('tweaks', 'background and background_rotator cannot both be installed')
  if ((installs('theme') || installs('color_scheme')) && (tweaks.theme || tweaks.color_scheme).options.include_background && (installs('background') || installs('background_rotator'))) fail('tweaks', 'include_background conflicts with a background/background_rotator install')
  return { schema_version: 1, installer, resources, tweaks }
}

export function parseConfig (text, filename = 'configuration') {
  const document = parseDocument(text, { version: '1.2', uniqueKeys: true, merge: false })
  if (document.errors.length) throw new Error(`${filename}: ${document.errors.map(error => error.message).join('\n')}`)
  if (document.warnings.length) throw new Error(`${filename}: ${document.warnings.map(warning => warning.message).join('\n')}`)
  // No alias expansion is needed for this small, explicit configuration format.
  return document.toJS({ maxAliasCount: 0 })
}

export async function loadConfig (filename) {
  return normalizeConfig(parseConfig(await readFile(filename, 'utf8'), filename), filename)
}

export function describeOptions (schema, prefix = '') {
  const lines = []
  for (const [name, field] of Object.entries(schema.fields || {})) {
    const key = prefix + name
    if (field.type === 'object') lines.push(...describeOptions(field, `${key}.`))
    else {
      const type = field.values ? field.values.join(' | ') : field.type === 'path' ? `local ${field.kind} path` : field.type === 'array' ? `list (${field.min}–${field.max} items)` : field.type === 'record' ? `mapping (${field.keys.join(', ')})` : field.type === 'number' ? `${field.integer ? 'integer' : 'number'} ${field.min}–${field.max}` : field.type
      const fallback = own(field, 'default') ? `; default ${JSON.stringify(field.default)}` : field.required ? '; required' : '; optional'
      lines.push(`  ${key}: ${type}${fallback}`)
    }
  }
  return lines
}
