/* By AlzRiss - Usanagi Umi AI
 *
 * Registry menu — SATU sumber data untuk semua daftar fitur.
 *
 * Sumbernya `pluginStore` di core/awang-loader.js, yaitu Map yang benar-benar
 * dipakai handler.js untuk menjalankan perintah. Jadi angka yang tampil di menu
 * = jumlah perintah yang benar-benar bisa dipanggil, bukan hitungan berkas.
 */

import { pluginStore } from '../../core/awang-loader.js'

/** Nama perintah dari sebuah regex/string/help, tanpa alias. */
function declaredNames(handler) {
  const names = new Set()
  const push = value => {
    if (typeof value !== 'string') return
    const clean = value.trim().toLowerCase().split(/\s+/)[0]
    if (clean) names.add(clean)
  }

  if (typeof handler.command === 'string') push(handler.command)
  if (handler.command instanceof RegExp) {
    const source = String(handler.command.source)
      .replace(/^\^/, '')
      .replace(/\$$/, '')
      .replace(/^\(\?:/, '')
      .replace(/\)$/, '')
      .replace(/[()]/g, '')
    // Hanya pecah pola sederhana "a|b|c" — pola kompleks tidak ditebak.
    if (/^[a-z0-9_|.-]+$/i.test(source)) {
      for (const part of source.split('|')) push(part)
    }
  }
  for (const value of [].concat(handler.help || [])) push(value)
  for (const value of [].concat(handler.menuHelp || [])) push(value)
  return [...names]
}

/** Nama kanonik: elemen pertama yang terdaftar (biasanya dari `help`). */
function canonicalName(handler, names) {
  const help = [].concat(handler.help || []).find(value => typeof value === 'string')
  if (help) {
    const first = String(help).trim().toLowerCase().split(/\s+/)[0]
    if (first) return first
  }
  if (typeof handler.command === 'string') return handler.command.toLowerCase()
  return names[0] || ''
}

function pluginKey(handler, fallback) {
  const file = String(handler.filePath || '')
  const parts = file.split(/[\\/]/)
  const index = parts.lastIndexOf('plugins')
  if (index >= 0 && parts[index + 1]) return parts.slice(index + 1).join('/')
  return handler.name || fallback
}

function humanCategory(value) {
  return String(value || 'umum')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

const META_NOISE = new Set(['dan', 'yang', 'untuk', 'dengan', 'dari', 'perintah', 'command', 'bot'])

function firstSentence(text, max = 90) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  if (!value) return ''
  const cut = value.split(/(?<=[.!?])\s/)[0]
  return cut.length > max ? cut.slice(0, max - 1) + '…' : cut
}

function isOwnerOnly(handler) {
  return Boolean(handler.rowner || handler.owner || handler.ownerOnly || handler.mods)
}

function flagsFor(handler) {
  const flags = []
  if (isOwnerOnly(handler)) flags.push('owner')
  if (handler.admin) flags.push('admin')
  if (handler.botAdmin) flags.push('botAdmin')
  if (handler.group || handler.groupOnly) flags.push('grup')
  if (handler.private || handler.privateOnly) flags.push('pribadi')
  if (handler.premium || handler.premiumOnly) flags.push('premium')
  if (handler.register) flags.push('daftar')
  return flags
}

/**
 * Bangun katalog dari pluginStore.
 *
 * @param {object} options
 * @param {boolean} options.includeDisabled ikutkan plugin yang dimatikan
 * @returns {{ categories: Array, commands: Array, stats: object, duplicates: Array }}
 */
export function buildCatalogue(options = {}) {
  const includeDisabled = options.includeDisabled === true
  const commands = []
  const duplicates = []
  const seen = new Map()

  for (const [key, handler] of pluginStore.entries()) {
    if (typeof handler !== 'function') continue
    if (!includeDisabled && handler.disabled === true) continue

    const names = declaredNames(handler)
    if (!names.length) continue

    const canonical = canonicalName(handler, names) || names[0]
    const aliases = names.filter(name => name !== canonical)

    if (seen.has(canonical)) {
      duplicates.push({ command: canonical, kept: seen.get(canonical), skipped: pluginKey(handler, key) })
      // Perintah sudah dimiliki plugin lain → alias-nya tetap dicatat pada
      // entri pertama agar tidak hilang dari daftar.
      const first = seen.get(canonical)
      const target = commands.find(item => item.command === canonical)
      if (target) for (const alias of aliases) if (!target.aliases.includes(alias)) target.aliases.push(alias)
      void first
      continue
    }
    seen.set(canonical, pluginKey(handler, key))

    commands.push({
      command: canonical,
      aliases: [...new Set(aliases)],
      category: String(handler.category || 'umum').toLowerCase(),
      label: humanCategory(handler.category || 'umum'),
      description: firstSentence(handler.description || ''),
      flags: flagsFor(handler),
      ownerOnly: isOwnerOnly(handler),
      hidden: handler.hiddenFromCategory === true,
      source: pluginKey(handler, key),
    })
  }

  commands.sort((a, b) => a.command.localeCompare(b.command))

  const categories = new Map()
  for (const entry of commands) {
    if (entry.hidden) continue
    const bucket = categories.get(entry.category) || {
      key: entry.category,
      label: entry.label,
      commands: [],
    }
    bucket.commands.push(entry)
    categories.set(entry.category, bucket)
  }

  /*
   * Urutan kategori di menu: kategori yang paling sering dipakai tampil dulu,
   * sisanya mengikuti jumlah perintah. Tanpa ini, halaman pertama dipenuhi
   * kategori "pelengkap" (1.000+ perintah impor) yang jarang dicari.
   */
  const PRIORITY = ['main', 'owner', 'group', 'game', 'tools', 'download', 'downloader', 'sticker', 'maker', 'ai', 'info', 'store', 'fun']
  const rank = key => {
    const index = PRIORITY.indexOf(String(key).toLowerCase())
    return index === -1 ? PRIORITY.length + 1 : index
  }
  const list = [...categories.values()].sort((a, b) => {
    const byRank = rank(a.key) - rank(b.key)
    if (byRank !== 0) return byRank
    const diff = b.commands.length - a.commands.length
    return diff !== 0 ? diff : a.label.localeCompare(b.label)
  })
  for (const category of list) category.commands.sort((a, b) => a.command.localeCompare(b.command))

  const aliasTotal = commands.reduce((sum, entry) => sum + entry.aliases.length, 0)

  return {
    commands,
    categories: list,
    duplicates,
    stats: {
      commands: commands.length,
      aliases: aliasTotal,
      categories: list.length,
      plugins: pluginStore.size,
      ownerCommands: commands.filter(entry => entry.ownerOnly).length,
      groupCommands: commands.filter(entry => entry.flags.includes('grup')).length,
    },
  }
}

/** Ambil perintah milik satu kategori (mis. 'game', 'tools', 'owner'). */
export function commandsOfCategory(catalogue, category) {
  const key = String(category || '').toLowerCase()
  return catalogue.commands.filter(entry => entry.category === key)
}

/** Perintah owner = plugin bertanda owner/rowner DAN kategori owner. */
export function ownerCommands(catalogue) {
  return catalogue.commands.filter(entry => entry.ownerOnly || entry.category === 'owner')
}

/** Perintah grup = plugin yang butuh konteks grup atau berkategori group. */
export function groupCommands(catalogue) {
  return catalogue.commands.filter(entry => entry.flags.includes('grup') || entry.category === 'group')
}

export { humanCategory, firstSentence, declaredNames, canonicalName }
export default { buildCatalogue, commandsOfCategory, ownerCommands, groupCommands }
