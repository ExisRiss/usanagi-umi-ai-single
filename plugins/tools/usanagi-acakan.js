/* By AlzRiss - Usanagi Umi AI — Task206 (port dari Kaguya: asisten/acakan)
 * Roda keputusan, undi pemenang, bagi tim, urutan acak — teks biasa, jalan
 * juga lewat jembatan Telegram. */

const shuffle = (a) => {
  const x = [...a]
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = x[i]
    x[i] = x[j]
    x[j] = t
  }
  return x
}
const items = (s) => String(s || '').split(/[,\n|]/.test(s) ? /[,\n|]/ : /\s+/).map((x) => x.trim()).filter(Boolean)
const dedupe = (a) => [...new Set(a)]

const handler = async (m, { conn, command, text, args, usedPrefix, isGroup }) => {
  const cmd = command === 'roda' ? 'spin' : command
  const p = usedPrefix
  const members = async () => {
    if (!isGroup) return []
    try {
      const meta = await conn.groupMetadata(m.chat).catch(() => null)
      return ((meta && meta.participants) || []).map((x) => x.id || x.jid || '').filter(Boolean)
    } catch {
      return []
    }
  }
  const needMsg = {
    spin: `${p}spin nasi goreng, mie ayam, bakso`,
    undi: `${p}undi 2 Ani, Budi, Citra, Dedi\n_Di grup, ${p}undi 2 memilih dari anggota._`,
    bagitim: `${p}bagitim 3 Ani Budi Citra Dedi Eka Fani\n_Di grup, ${p}bagitim 2 membagi anggota._`,
    urutan: `${p}urutan Ani, Budi, Citra`,
  }

  if (cmd === 'undi' || cmd === 'bagitim') {
    const n = parseInt(args[0], 10)
    if (!(n >= 1)) return m.reply(`☾ *${cmd.toUpperCase()}*\n${needMsg[cmd]}`)
    let list = dedupe(items(args.slice(1).join(' ') || (m.quoted && (m.quoted.text || m.quoted.caption)) || ''))
    if (!list.length && isGroup) list = (await members()).slice(0, 200)
    if (!list.length) return m.reply(`✕ Daftar kosong.\n${needMsg[cmd]}`)
    if (cmd === 'undi') {
      if (n > list.length) return m.reply(`✕ Pemenang (${n}) lebih banyak dari peserta (${list.length}).`)
      const win = shuffle(list).slice(0, Math.min(n, 30))
      return m.reply(`🎉 *HASIL UNDIAN*\nPeserta: ${list.length} • Pemenang: ${win.length}\n\n${win.map((w, i) => `${i + 1}. ${w}`).join('\n')}`)
    }
    if (n < 2 || n > list.length || n > 20) return m.reply(`✕ Jumlah tim harus 2–${Math.min(20, list.length)} (peserta: ${list.length}).`)
    const teams = Array.from({ length: n }, () => [])
    shuffle(list).forEach((x, i) => teams[i % n].push(x))
    return m.reply(
      `🧩 *PEMBAGIAN TIM*\n${list.length} peserta → ${n} tim\n\n` +
      teams.map((t, i) => `*Tim ${i + 1}* (${t.length})\n${t.map((x) => '• ' + x).join('\n')}`).join('\n\n')
    )
  }

  const list = items(text || (m.quoted && (m.quoted.text || m.quoted.caption)) || '')
  if (cmd === 'spin') {
    if (list.length < 2) return m.reply(`☾ *RODA KEPUTUSAN*\n${needMsg.spin}`)
    return m.reply(`🎡 *RODA KEPUTUSAN*\n${list.slice(0, 20).map((x) => '• ' + x).join('\n')}\n\n➤ Hasilnya: *${list[Math.floor(Math.random() * list.length)]}*`)
  }
  if (list.length < 2) return m.reply(`☾ *URUTAN ACAK*\n${needMsg.urutan}`)
  return m.reply(`🔀 *URUTAN ACAK*\n${shuffle(list).slice(0, 40).map((x, i) => `${i + 1}. ${x}`).join('\n')}`)
}

handler.help = ['spin <pilihan…>', 'undi <n> <peserta…>', 'bagitim <n> <peserta…>', 'urutan <daftar…>']
handler.tags = ['tools']
handler.command = ['acakan', 'spin', 'undi', 'bagitim', 'urutan', 'roda']
handler.description = 'Roda keputusan, undi pemenang, bagi tim, dan urutan acak'
handler.limit = false

export default handler
