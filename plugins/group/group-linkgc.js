/* By AlzRiss - Usanagi Umi AI
 *
 * Link grup.
 *
 * Bug 25-10-2026: `.linkgc` melempar "not-authorized" (401 dari WhatsApp)
 * sehingga pengguna hanya melihat laporan error. Penyebabnya bukan kode
 * plugin, tapi bot memang tidak berwenang mengambil kode undangan — biasanya
 * karena bot bukan admin, grup memakai "persetujuan admin", atau batas kirim
 * ulang link grup sedang aktif.
 *
 * Sekarang setiap kegagalan diterjemahkan menjadi pesan yang bisa ditindak,
 * dan kode undangan tidak pernah dicetak ke log.
 */

const REASONS = [
  {
    test: /not-authorized|not_authorized/i,
    text: [
      '❌ Bot tidak diizinkan mengambil link grup ini.',
      '',
      'Biasanya karena:',
      '• bot bukan admin grup — jadikan admin lalu coba lagi,',
      '• grup memakai *Setelan > Kirim ulang link grup > Hanya admin*,',
      '• akun bot baru bergabung (tunggu beberapa menit).',
    ].join('\n'),
  },
  {
    test: /forbidden|not in group|not-a-member/i,
    text: '❌ Bot bukan anggota grup ini. Tambahkan bot lalu ulangi .linkgc.',
  },
  {
    test: /rate|429|too many/i,
    text: '⏳ Terlalu sering meminta link grup. Tunggu satu menit lalu coba lagi.',
  },
]

let handler = async function (m, extra = {}) {
  const conn = extra.conn || this
  try {
    const code = await conn.groupInviteCode(m.chat)
    if (!code) throw new Error('not-authorized')
    return m.reply(`https://chat.whatsapp.com/${code}`)
  } catch (error) {
    const raw = String(error?.message || error || '')
    const match = REASONS.find(item => item.test.test(raw))
    console.error('[LINKGC] gagal:', raw.slice(0, 120))
    return m.reply(match ? match.text : `❌ Gagal mengambil link grup: ${raw.slice(0, 120)}`)
  }
}

handler.help = ['linkgc']
handler.tags = ['group']
handler.command = /^linkgc$/i
handler.group = true
handler.admin = true
handler.botAdmin = true
handler.description = 'Ambil link undangan grup (bot harus admin)'

export default handler
