/* Ported from Umi upstream — kredit penulis asli ada di CREDITS.md. */
import { runImportedFeature } from '../../../../lib/imported-compat.js'
const metadata = {"name": "faketag", "category": "tools", "aliasMap": {"umi-tools-faketag": "faketag", "umi-faketag": "faketag", "umi-ftag": "ftag", "umi-fake": "fake", "faketag": "faketag", "ftag": "ftag", "fake": "fake"}, "description": "Fake tag ala Umi — .fake dana <nominal> untuk fake saldo DANA", "usage": ".faketag @user|pesan tag|pesan", "example": ".faketag 628xxx|Darling...|Kamu dimana? 💕", "cooldown": 5}
/* Rute `.fake dana <nominal>` → fitur fakedana (Task185). Sebelumnya teks
 * "dana …" jatuh ke pemeriksaan format faketag dan membalas "Format salah". */
const handler = async (m, extra) => {
  const teks = String(extra?.text || '').trim()
  if (/^dana\b/i.test(teks)) {
    const nominal = teks.replace(/^dana\b/i, '').trim()
    const { default: fakedana } = await import('../../../maker/usanagi-fakedana.js')
    return fakedana(m, { ...extra, text: nominal, args: nominal ? nominal.split(/\s+/) : [], command: 'fakedana' })
  }
  if (!m.isGroup) {
    const p = extra?.usedPrefix || '.'
    return m.reply(`🔒 Fake tag khusus grup.\nFake saldo DANA bisa dipakai di chat mana pun:\n${p}fakedana <nominal>\n${p}fake dana <nominal>`)
  }
  return runImportedFeature("umi", "plugins/tools/faketag.js", metadata, m, extra)
}
handler.help = ["umi-tools-faketag @user|pesan tag|pesan", "fake dana <nominal>"]
handler.command = ["umi-tools-faketag", "umi-faketag", "umi-ftag", "umi-fake", "faketag", "ftag", "fake"]
handler.tags = ["tools"]
handler.description = "Fake tag ala Umi"
handler.importSource = "umi"
handler.importConfig = {"name": "faketag", "alias": ["ftag", "fake"], "category": "tools", "description": "Fake tag ala Umi", "usage": ".faketag @user|pesan tag|pesan", "example": ".faketag 628xxx|Darling...|Kamu dimana? 💕", "cooldown": 5, "isGroup": true}
handler.owner = false
handler.rowner = false
handler.premium = false
handler.group = false // rute .fake dana harus jalan di chat mana pun; gate grup utk faketag manual di handler (Task185)
handler.private = false
handler.admin = false
handler.botAdmin = false
handler.level = 0
handler.limit = 0
handler.importAliasMap = {"umi-tools-faketag": "faketag", "umi-faketag": "faketag", "umi-ftag": "ftag", "umi-fake": "fake", "faketag": "faketag", "ftag": "ftag", "fake": "fake"}
export default handler
