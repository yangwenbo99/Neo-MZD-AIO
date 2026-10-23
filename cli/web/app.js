const $ = id => document.getElementById(id)
const own = (value, key) => value != null && Object.hasOwn(value, key)
const label = value => value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
const element = (tag, text, className) => {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  if (className) node.className = className
  return node
}
const button = (text, handler) => {
  const node = element('button', text)
  node.type = 'button'
  node.addEventListener('click', handler)
  return node
}
const hints = {
  'installer.keep_backups': 'Copy original-file backups to the USB drive.',
  'installer.test_backups': 'Request before/after copies for tweaks that provide them.',
  'installer.skip_confirmation': 'Skip the vehicle-side installation confirmation.',
  'installer.apps_to_resources': 'Place application files on the resources partition.',
  'installer.retrieve_cmu_data': 'Include CMU diagnostic-data retrieval. Requires tweaks.sh.',
  'installer.self_destruct': 'Include the existing installation-file cleanup step.',
  'resources.color_schemes': 'Optional unpacked color pack. Needed for color schemes and theme removal (Red/jci.zip).',
  'tweaks.theme.options': 'Choose either an archive or a custom jci directory.',
  'tweaks.remove_overlays.options': 'Select at least one overlay to remove.',
  'tweaks.speedometer.options.bar_layout': 'Positions are [area, row, position]. Area 0: center [0,0,0] or side [0,1,1–4]. Area 1: bottom rows, positions 1–5. Area 2: hidden. Visible slots must be unique.',
  'tweaks.speedometer.options.bottom_rows': 'Move or hide values assigned to removed rows before reducing this number.',
  'tweaks.speedometer.options.fuel_tank_capacity': 'Required for fuel gauge units l or gal; enter capacity in the selected unit.',
  'tweaks.main_menu.options.small_focus': 'Requires Small coins.',
  'tweaks.android_auto.options.reverse_heading': 'Requires GPS source: car.'
}

let catalog, config, filename, active = 'installer', busy = false, valid = false, revision = 0, timer, fieldID = 0, resourceRevision = -1
let cachedOptions = {}
let browserState

async function api (route, body) {
  const response = await fetch(route, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error || response.statusText)
  return value
}

function fileStatus (message, error = false) {
  $('file-status').textContent = message
  $('file-status').classList.toggle('error', error)
}

async function operate (task) {
  if (busy) return
  busy = true
  $('workspace').inert = true
  updateButtons()
  try { await task() } catch (error) { fileStatus(error.message, true) }
  finally { busy = false; $('workspace').inert = false; updateButtons() }
}

function updateButtons () {
  document.querySelectorAll('[data-operation]').forEach(node => { node.disabled = busy || (['save', 'validate'].includes(node.id) && !valid) })
  $('filename').disabled = busy
}

function changed () {
  revision++
  valid = false
  updateButtons()
  $('plan-panel').hidden = true
  fileStatus('Unsaved changes')
  updateSidebar()
  schedulePreview()
}

function schedulePreview () {
  clearTimeout(timer)
  const current = revision
  $('validation').className = 'validation'
  $('validation').textContent = 'Checking settings…'
  timer = setTimeout(async () => {
    try {
      const result = await api('/api/preview', { config, filename })
      if (current !== revision) return
      $('yaml').value = result.yaml
      valid = !result.error
      $('validation').className = `validation ${valid ? 'valid' : 'invalid'}`
      $('validation').textContent = result.error || (resourceRevision === revision ? 'Configuration and required local resources are valid.' : `Configuration valid · ${Object.keys(config.tweaks).length} selected tweaks. Local resources can be checked below.`)
      updateButtons()
    } catch (error) {
      if (current === revision) { valid = false; $('validation').textContent = error.message; $('validation').className = 'validation invalid'; updateButtons() }
    }
  }, 180)
}

function loadState (result, message) {
  config = result.config
  filename = result.filename
  cachedOptions = {}
  $('filename').value = filename
  $('base-directory').textContent = `Relative assets resolve from: ${filename.replace(/[/\\][^/\\]+$/, '')}`
  revision++
  valid = false
  $('plan-panel').hidden = true
  updateSidebar()
  renderEditor()
  fileStatus(message)
  updateButtons()
  schedulePreview()
}

async function applyFilename () {
  if ($('filename').value === filename) return
  const result = await api('/api/relocate', { config, fromFilename: filename, filename: $('filename').value })
  loadState(result, 'Save path updated · asset paths rebased')
}

function selectAction (name, action) {
  if (config.tweaks[name]?.options) cachedOptions[name] = config.tweaks[name].options
  if (!action) delete config.tweaks[name]
  else config.tweaks[name] = action === 'install' ? { action, ...(cachedOptions[name] ? { options: cachedOptions[name] } : {}) } : { action }
  active = name
  changed()
  renderEditor()
}

function actionSelect (name) {
  const select = element('select')
  select.setAttribute('aria-label', `Action for ${label(name)}`)
  for (const [value, text] of [['', 'Unchanged'], ['install', 'Install'], ...(catalog.tweaks[name].actions.includes('uninstall') ? [['uninstall', 'Uninstall']] : [])]) {
    const option = element('option', text)
    option.value = value
    select.append(option)
  }
  select.value = config.tweaks[name]?.action || ''
  select.addEventListener('change', () => selectAction(name, select.value))
  return select
}

function updateSidebar () {
  if (!catalog) return
  $('selection-count').textContent = `${Object.keys(config.tweaks).length} / ${Object.keys(catalog.tweaks).length}`
  const query = $('search').value.toLowerCase().trim()
  const items = []
  for (const [name, definition] of Object.entries(catalog.tweaks)) {
    if ($('selected-only').checked && !config.tweaks[name]) continue
    if (query && !`${name} ${label(name)} ${definition.description}`.toLowerCase().includes(query)) continue
    const row = element('div', undefined, `tweak-item${active === name ? ' active' : ''}${config.tweaks[name] ? ' chosen' : ''}`)
    const link = button(label(name), () => { active = name; updateSidebar(); renderEditor() })
    link.className = 'tweak-name'
    if (active === name) link.setAttribute('aria-current', 'true')
    row.append(link, actionSelect(name))
    items.push(row)
  }
  const scroll = $('tweak-list').scrollTop
  $('tweak-list').replaceChildren(...items)
  $('tweak-list').scrollTop = scroll
  $('no-results').hidden = items.length > 0
}

function renderFields (schema, get, set, prefix) {
  const fields = element('div', undefined, 'fields')
  for (const [key, field] of Object.entries(schema.fields)) {
    fields.append(renderField(key, field, () => get()?.[key], value => {
      const next = { ...(get() || {}) }
      if (value === undefined) delete next[key]
      else next[key] = value
      set(Object.keys(next).length ? next : undefined)
    }, `${prefix}.${key}`))
  }
  return fields
}

function renderField (key, schema, get, set, location) {
  if (schema.type === 'object') {
    const group = element('details', undefined, 'group')
    group.append(element('summary', label(key)))
    if (hints[location]) group.append(element('p', hints[location], 'hint'))
    group.append(renderFields(schema, get, set, location))
    return group
  }
  const container = element('div', undefined, `field ${schema.type}`)
  const heading = element('div', undefined, 'field-label')
  const fieldLabel = element('label', label(key))
  const id = `field-${++fieldID}`
  fieldLabel.htmlFor = id
  const reset = button('Use default', () => { set(undefined); changed(); container.replaceWith(renderField(key, schema, get, set, location)) })
  reset.setAttribute('aria-label', `Use default for ${location}`)
  reset.hidden = schema.noReset || get() === undefined
  heading.append(fieldLabel, reset)
  container.append(heading)
  const current = () => get() === undefined ? structuredClone(schema.default) : get()
  const store = value => { set(value); reset.hidden = schema.noReset || get() === undefined }
  const change = value => { store(value); changed() }
  let control
  if (schema.type === 'record') {
    const render = () => {
      const contents = element('div', undefined, 'fields')
      for (const language of Object.keys(get() || {})) {
        const group = element('details', undefined, 'group')
        group.open = true
        group.append(element('summary', label(language)))
        group.append(renderField('Replies', { ...schema.item, noReset: true }, () => get()?.[language], value => {
          const next = { ...get() }
          if (value === undefined) delete next[language]
          else next[language] = value
          store(next)
        }, `${location}.${language}`))
        group.append(button('Remove language', () => { const next = { ...get() }; delete next[language]; change(Object.keys(next).length ? next : undefined); render() }))
        contents.append(group)
      }
      const actions = element('div', undefined, 'record-actions')
      const select = element('select')
      select.id = id
      select.setAttribute('aria-label', 'Reply language to add')
      for (const language of schema.keys.filter(language => !own(get(), language))) {
        const option = element('option', label(language)); option.value = language; select.append(option)
      }
      const add = button('Add language', () => { if (!select.value) return; change({ ...(get() || {}), [select.value]: structuredClone(schema.presets?.[select.value] || Array(schema.item.min).fill('')) }); render() })
      add.disabled = !select.options.length
      actions.append(select, add)
      contents.append(actions)
      if (control) control.replaceWith(contents)
      else container.append(contents)
      control = contents
    }
    render()
  } else if (schema.type === 'array') {
    const values = () => current() || Array.from({ length: schema.min }, () => schema.item.default ?? '')
    const fixed = schema.min === schema.max
    const render = () => {
      const items = element('div', undefined, 'array-items')
      values().forEach((value, index) => {
        const row = element('div', undefined, 'array-row')
        row.append(renderField(schema.item.type === 'number' && values().length === 3 ? ['Area', 'Row', 'Position'][index] : String(index + 1), { ...schema.item, noReset: true }, () => values()[index], item => { const next = [...values()]; next[index] = item ?? ''; store(next) }, `${location}[${index}]`))
        if (!fixed) {
          const up = button('↑', () => { const next = [...values()]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; change(next); render() })
          up.disabled = index === 0
          up.setAttribute('aria-label', `Move item ${index + 1} up`)
          const remove = button('×', () => { const next = [...values()]; next.splice(index, 1); change(next); render() })
          remove.setAttribute('aria-label', `Remove item ${index + 1}`)
          row.append(up, remove)
        }
        items.append(row)
      })
      if (!fixed) {
        const actions = element('div', undefined, 'array-actions')
        actions.append(button('Add item', () => { change([...values(), schema.item.default ?? '']); render() }))
        items.append(actions)
      }
      if (control) control.replaceWith(items)
      else container.append(items)
      control = items
    }
    render()
    fieldLabel.removeAttribute('for')
  } else {
    control = element(schema.values ? 'select' : 'input')
    control.id = id
    control.dataset.field = location
    if (schema.values) {
      if (!own(schema, 'default')) { const empty = element('option', 'Choose…'); empty.value = ''; control.append(empty) }
      for (const value of schema.values) { const option = element('option', label(value)); option.value = value; control.append(option) }
      control.value = current() ?? ''
    } else if (schema.type === 'boolean') {
      control.type = 'checkbox'
      control.checked = current() ?? false
      fieldLabel.prepend(control)
    } else {
      control.type = schema.type === 'number' ? 'number' : 'text'
      control.value = current() ?? ''
      if (schema.type === 'number') {
        if (Number.isFinite(schema.min)) control.min = schema.min
        if (Number.isFinite(schema.max)) control.max = schema.max
        control.step = schema.integer ? '1' : 'any'
      }
      if (schema.type === 'path') { control.spellcheck = false; control.placeholder = `Local ${schema.kind} path` }
    }
    const update = () => change(schema.type === 'boolean' ? control.checked : schema.type === 'number' ? control.value === '' ? undefined : Number(control.value) : control.value === '' && schema.type === 'path' && !schema.required ? undefined : control.value)
    control.addEventListener(schema.values || schema.type === 'boolean' ? 'change' : 'input', update)
    if (schema.type === 'path') {
      const row = element('div', undefined, 'input-row')
      row.append(control, button('Browse', () => browse(schema.kind, schema.kind === 'directory' ? get() || '.' : (get() || '').replace(/[^/\\]+$/, '') || '.', entry => { control.value = entry.relative; update(); if (schema.kind === 'image') previewImage() })))
      container.append(row)
      let image
      const previewImage = () => {
        if (!image) return
        image.hidden = !get()
        if (get()) image.src = `/api/image?${new URLSearchParams({ filename, path: get() })}`
      }
      if (schema.kind === 'image') {
        image = element('img', undefined, 'image-preview')
        image.alt = 'Selected image preview'
        image.addEventListener('error', () => { image.hidden = true })
        image.addEventListener('load', () => { image.hidden = false })
        container.append(image)
        control.addEventListener('change', previewImage)
        previewImage()
      }
    } else if (schema.type === 'color') {
      const picker = element('input')
      picker.type = 'color'
      picker.value = current() || '#ffffff'
      picker.setAttribute('aria-label', `${label(key)} color picker`)
      picker.addEventListener('input', () => { control.value = picker.value; update() })
      control.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(control.value)) picker.value = control.value })
      const row = element('div', undefined, 'input-row'); row.append(picker, control); container.append(row)
    } else if (schema.type !== 'boolean') container.append(control)
  }
  let hint = hints[location]
  if (!hint && own(schema, 'default') && !['object', 'record', 'array'].includes(schema.type)) hint = `Default: ${schema.default}`
  if (!hint && schema.required) hint = 'Required for installation.'
  if (hint) { const note = element('p', hint, 'hint'); note.id = `${id}-hint`; container.append(note); if (control?.matches('input, select')) control.setAttribute('aria-describedby', note.id) }
  return container
}

function renderEditor () {
  $('installer-tab').classList.toggle('active', active === 'installer')
  $('resources-tab').classList.toggle('active', active === 'resources')
  const area = $('editor-content')
  if (active === 'installer' || active === 'resources') {
    const isInstaller = active === 'installer'
    area.replaceChildren(element('p', 'PACKAGE SETTINGS', 'eyebrow'), element('h1', isInstaller ? 'Installer settings' : 'Resource packs'), element('p', isInstaller ? 'Configure the vehicle-side installer. Untouched fields use the defaults shown.' : 'Point to optional resource packs already available on this computer. Individual images and theme archives are selected within their tweaks.', 'description'), renderFields(catalog[active], () => config[active], value => { if (value === undefined) delete config[active]; else config[active] = value }, active))
    return
  }
  const definition = catalog.tweaks[active]
  area.replaceChildren(element('p', active, 'eyebrow'), element('h1', label(active)), element('p', definition.description, 'description'))
  const row = element('div', undefined, 'selection-row')
  row.append(element('label', 'Requested action'), actionSelect(active))
  area.append(row)
  if (config.tweaks[active]?.action === 'install') {
    if (hints[`tweaks.${active}.options`]) area.append(element('p', hints[`tweaks.${active}.options`], 'description'))
    if (Object.keys(definition.options.fields).length) {
      const name = active
      area.append(renderFields(definition.options, () => config.tweaks[name].options, value => { if (value === undefined) delete config.tweaks[name].options; else config.tweaks[name].options = value }, `tweaks.${name}.options`))
    } else area.append(element('p', 'This installation has no additional options.', 'description'))
  } else area.append(element('p', config.tweaks[active]?.action === 'uninstall' ? 'Removal uses the existing installer restore operation and accepts no additional options.' : 'Choose Install or Uninstall to include this tweak. Unchanged tweaks are omitted from the configuration.', 'description'))
}

async function browse (kind, start, choose) {
  browserState = { kind, choose }
  $('browser-title').textContent = kind === 'config' ? 'Open a YAML configuration' : kind === 'directory' ? 'Choose a local directory' : 'Choose a local file'
  $('choose-directory').hidden = kind !== 'directory'
  $('browser').showModal()
  await browseTo(start, true)
}

async function browseTo (directory, fallback = false) {
  try {
    // Relative navigation begins at the configuration directory, not the shell.
    const base = filename.replace(/[/\\][^/\\]+$/, '')
    const absolute = /^(?:[/\\]|[a-z]:)/i.test(directory) ? directory : `${base}/${directory}`
    const result = await api(`/api/browse?${new URLSearchParams({ path: absolute, kind: browserState.kind, filename })}`)
    browserState.directory = result
    $('browse-path').value = result.directory
    $('browse-error').textContent = ''
    const entries = result.entries.map(entry => button(`${entry.directory ? '▸  ' : '   '}${entry.name}`, () => {
      if (entry.directory) browseTo(entry.path)
      else { $('browser').close(); browserState.choose(entry) }
    }))
    $('browse-entries').replaceChildren(...(entries.length ? entries : [element('p', 'No matching files in this directory.', 'muted')]))
  } catch (error) {
    if (fallback) return browseTo(catalog.cwd)
    $('browse-error').textContent = error.message
  }
}

$('search').addEventListener('input', updateSidebar)
$('selected-only').addEventListener('change', updateSidebar)
$('installer-tab').addEventListener('click', () => { active = 'installer'; updateSidebar(); renderEditor() })
$('resources-tab').addEventListener('click', () => { active = 'resources'; updateSidebar(); renderEditor() })
$('set-path').addEventListener('click', () => operate(applyFilename))
$('filename').addEventListener('keydown', event => { if (event.key === 'Enter') operate(applyFilename) })
$('open').addEventListener('click', () => browse('config', '.', entry => operate(async () => loadState(await api('/api/load', { filename: entry.path }), 'Configuration loaded'))))
$('example').addEventListener('click', () => operate(async () => { await applyFilename(); loadState(await api('/api/example', { filename }), 'Example loaded · unsaved changes') }))
$('save').addEventListener('click', () => operate(async () => { await applyFilename(); const result = await api('/api/save', { config, filename }); $('yaml').value = result.yaml; fileStatus(`Saved ${result.filename}`) }))
$('validate').addEventListener('click', () => operate(async () => {
  await applyFilename()
  fileStatus('Checking local resources…')
  const result = await api('/api/validate', { config, filename })
  resourceRevision = revision
  $('plan').textContent = result.plan
  $('plan-panel').hidden = false
  $('validation').textContent = 'Configuration and required local resources are valid.'
  fileStatus('Local resources checked')
}))
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('yaml').value); fileStatus('YAML copied') }
  catch { $('yaml').select(); fileStatus('Select the YAML and copy it with Ctrl+C / Cmd+C') }
})
$('close-browser').addEventListener('click', () => $('browser').close())
$('browse-form').addEventListener('submit', event => { event.preventDefault(); browseTo($('browse-path').value) })
$('browse-up').addEventListener('click', () => { if (browserState.directory) browseTo(browserState.directory.parent) })
$('choose-directory').addEventListener('click', () => { if (!browserState.directory) return; $('browser').close(); browserState.choose({ path: browserState.directory.directory, relative: browserState.directory.relative }) })

try {
  catalog = await api('/api/catalog')
  loadState(catalog.initial, 'Ready · choose tweaks or open an existing YAML file')
} catch (error) {
  fileStatus(error.message, true)
  $('validation').textContent = 'Unable to load the local editor. Check the terminal running mzd-aio.'
}
