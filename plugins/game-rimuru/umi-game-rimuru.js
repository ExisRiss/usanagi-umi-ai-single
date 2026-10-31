/* By AlzRiss - Usanagi Umi AI
 *
 * Game chat dari paket Rimuru MD (Rimuru_MD_Latest_Update.zip → plugins/game).
 * Kredit sumber (FEATURE_CREDIT) tetap ada di dalam tiap berkas.
 *
 * Yang diporting hanya game yang TIDAK membutuhkan database/level Rimuru,
 * supaya jalan apa adanya di UMI tanpa membawa `rimuru-database.js` dkk.
 *
 * Perintah diberi awalan `rim` supaya tidak menabrak game UMI yang sudah ada
 * (`.tebakgambar` UMI tetap yang lama; versi Rimuru jadi `.rimtebakgambar`).
 *
 * Daftar: .rimgames
 */

import * as blackjack from '../../lib/rimuru-games/blackjack.js'
import * as bns from '../../lib/rimuru-games/bns.js'
import * as bom from '../../lib/rimuru-games/bom.js'
import * as cerdascermat from '../../lib/rimuru-games/cerdascermat.js'
import * as checkers from '../../lib/rimuru-games/checkerszerotwo.js'
import * as genshin from '../../lib/rimuru-games/genshinprofile.js'
import * as kuis from '../../lib/rimuru-games/kuis.js'
import * as maths from '../../lib/rimuru-games/maths.js'
import * as mlbb from '../../lib/rimuru-games/mlbb.js'
import * as perangsarung from '../../lib/rimuru-games/perangsarung.js'
import * as tebakan from '../../lib/rimuru-games/tebakan.js'
import * as tebakbola from '../../lib/rimuru-games/tebakbola.js'
import * as tebakff from '../../lib/rimuru-games/tebakff.js'
import * as tebakjkt from '../../lib/rimuru-games/tebakjkt.js'
import * as tebakkartun from '../../lib/rimuru-games/tebakkartun.js'
import * as tebaksurah from '../../lib/rimuru-games/tebaksurah.js'
import * as tebakwarna from '../../lib/rimuru-games/tebakwarna.js'
import * as warAttack from '../../lib/rimuru-games/war-attack.js'

/** Ambil handler + config dari modul (bentuk ekspornya tidak seragam). */
function pick(module) {
  const config = module.config || module.default?.config || {}
  const handler = module.handler || module.default?.handler || (typeof module.default === 'function' ? module.default : null)
  return { config, handler }
}

const REGISTRY = [
  ['blackjack', 'Blackjack', blackjack, ['bj']],
  ['bns', 'Benar atau Salah', bns, ['bata', 'benarsalah']],
  ['bom', 'Bom 9 kotak', bom, ['bomb']],
  ['cerdascermat', 'Cerdas Cermat', cerdascermat, ['cc']],
  ['checkers', 'Checkers (dam)', checkers, ['dam']],
  ['genshin', 'Profil Genshin', genshin, []],
  ['kuis', 'Kuis', kuis, []],
  ['maths', 'Matematika kilat', maths, ['math']],
  ['mlbb', 'Counter / Tier MLBB', mlbb, ['ml']],
  ['perangsarung', 'Perang Sarung', perangsarung, []],
  ['tebakan', 'Tebak-tebakan', tebakan, ['tebaktebakan']],
  ['tebakbola', 'Tebak Bola', tebakbola, []],
  ['tebakff', 'Tebak Free Fire', tebakff, []],
  ['tebakjkt', 'Tebak JKT48', tebakjkt, []],
  ['tebakkartun', 'Tebak Kartun', tebakkartun, []],
  ['tebaksurah', 'Tebak Surah', tebaksurah, []],
  ['tebakwarna', 'Tebak Warna', tebakwarna, []],
  ['warattack', 'War Attack', warAttack, ['attack']],
].map(([key, title, module, aliases]) => ({ key, title, aliases, ...pick(module) }))

const BY_KEY = new Map()
for (const game of REGISTRY) {
  BY_KEY.set(game.key, game)
  for (const alias of game.aliases) if (!BY_KEY.has(alias)) BY_KEY.set(alias, game)
}

const LIST = REGISTRY.map(g => `• \`rim${g.key}\` — ${g.title}`).join('\n')

/**
 * Penyesuai socket: modul Rimuru memanggil `sock.reply(chat, teks, m)` dan
 * menempelkan status permainan di objek socket (`conn.bomb = {...}`).
 * Objek UMI `conn` tidak punya `.reply`, jadi dibungkus Proxy: properti yang
 * ditulis game tetap tersimpan, dan metode yang tidak ada dipetakan ke API UMI.
 */
function sockAdapter(conn) {
  const extra = {}
  return new Proxy(
    {},
    {
      get(_target, key) {
        if (key in extra) return extra[key]
        if (key === 'reply') {
          return async (jid, text, quoted) => conn.reply(jid, String(text), quoted || null)
        }
        if (key === 'sendFile') {
          if (typeof conn.sendFile === 'function') return conn.sendFile.bind(conn)
          return async (jid, media, name, caption) => {
            const isImage = /\.(jpe?g|png|webp)$/i.test(String(name || '')) || /image/i.test(String(media?.mime || ''))
            const payload = Buffer.isBuffer(media)
              ? (isImage ? { image: media, caption } : { document: media, fileName: name, caption })
              : { text: String(caption || media || '') }
            return conn.sendMessage(jid, payload)
          }
        }
        if (key === 'sendPresenceUpdate') {
          return typeof conn.sendPresenceUpdate === 'function' ? conn.sendPresenceUpdate.bind(conn) : async () => {}
        }
        if (key === 'relayMessage') {
          if (typeof conn.relayMessage === 'function') return conn.relayMessage.bind(conn)
          return async () => { throw new Error('Perangkat ini tidak mendukung pesan relay.') }
        }
        const value = conn[key]
        return typeof value === 'function' ? value.bind(conn) : value
      },
      set(_target, key, value) {
        extra[key] = value
        return true
      },
      has(_target, key) {
        return key in extra || key in conn
      },
    },
  )
}

let handler = async (m, { conn, command, text, usedPrefix }) => {
  const cmd = String(command || '').toLowerCase()
  const raw = String(text || '').trim()

  if (cmd === 'rimgames' || cmd === 'rimgame' || cmd === 'rimlist') {
    return m.reply(
      `🎮 *GAME UMI USANAGI* (${REGISTRY.length})\n\n${LIST}\n\n` +
      `Pakai: \`${usedPrefix || '.'}rimbom\`, \`${usedPrefix || '.'}rimblackjack\`, ...\n` +
      `Game bertanda sama dengan UMI tetap memakai versi UMI tanpa awalan \`rim\`.`,
    )
  }

  let game = null
  if (cmd === 'rim') {
    const key = raw.split(/\s+/)[0]?.toLowerCase()
    game = BY_KEY.get(key) || null
    if (!game) return m.reply(`Game "${key || '-'}" tidak ada.\n\n${LIST}`)
    m.text = raw.split(/\s+/).slice(1).join(' ')
  } else {
    game = BY_KEY.get(cmd.replace(/^rim/, '')) || null
  }
  if (!game) return m.reply(`Game tidak dikenali. Lihat \`.rimgames\`.`)
  if (typeof game.handler !== 'function') {
    return m.reply(`❌ Game *${game.title}* tidak punya handler yang bisa dipakai.`)
  }

  // Beberapa game membaca m.text / m.prefix / m.args langsung dari objek pesan.
  m.text = cmd === 'rim' ? m.text : raw
  m.prefix = usedPrefix || '.'
  m.args = String(raw).split(/\s+/).filter(Boolean)

  try {
    const shim = sockAdapter(conn)
    return await game.handler(m, {
      sock: shim,
      conn: shim,
      text: m.text,
      args: m.args,
      command: cmd.replace(/^rim/, ''),
      usedPrefix,
    })
  } catch (error) {
    return m.reply(`❌ *${game.title}* gagal: ${String(error?.message || error).slice(0, 200)}`)
  }
}

handler.help = ['rimgames', 'rim<game>', 'rim <game>']
handler.tags = ['game']
handler.command = /^(rimgames|rimgame|rimlist|rim|rim[a-z0-9]+)$/i
handler.description = `Game chat Umi Usanagi — ${REGISTRY.length} permainan`
handler.cooldown = 3

export default handler
