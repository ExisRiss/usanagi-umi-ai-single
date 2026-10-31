/*
╔══════════════════════════════════════════════╗
║       👑  𝑹𝑰𝑴𝑼𝑹𝑼 𝑴𝑫 〽️                        ║
╚══════════════════════════════════════════════╝

🪽 𝑵𝒐𝒕𝒆 :
Rimuru MD adalah SC hasil rename dari SC Ourin MD.

╭─────────────「 🜲 𝑰𝑵𝑭𝑶 𝑶𝑼𝑹𝑰𝑵 」─────────────╮
│ 👤 Developer : 𝑯𝒚𝒖𝒖 / 𝒁𝒂𝒏𝒏
│ 🎵 TikTok    : https://tiktok.com/@ourinmd
│ 📢 WhatsApp  : https://whatsapp.com/channel/0029VbB37bgBfxoAmAlsgE0t
╰─────────────────────────────────────────────╯

╭────────────「 ✦ 𝑰𝑵𝑭𝑶 𝑹𝑰𝑴𝑼𝑹𝑼 ✦ 」────────────╮
│ 👤 Developer Pihak Ketiga : 𝑨𝒏𝒊𝒕𝒂 𝑷𝒖𝒕𝒓𝒊 𝑨𝒛𝒛𝒂𝒉𝒓𝒂
│ 🎵 TikTok                 : https://tiktok.com/@anita.putri.azzah1
│ 📸 Instagram              : anit_aputriazzahrah
│ 📢 Saluran                : https://whatsapp.com/channel/0029Vb8dmsUElagkVPIw9X2P
│ ▶️ YouTube                : https://youtube.com/@rimurumd
╰─────────────────────────────────────────────╯

        ⚠️ 𝑫𝑶 𝑵𝑶𝑻 𝑹𝑬𝑴𝑶𝑽𝑬 𝑪𝑹𝑬𝑫𝑰𝑻 ⚠️
              ❖ 𝐉𝐚𝐧𝐠𝐚𝐧 𝐡𝐚𝐩𝐮𝐬 𝐜𝐫𝐞𝐝𝐢𝐭 ❖

                 「 👑 𝑹𝑰𝑴𝑼𝑹𝑼 𝑴𝑫 👑 」
*/

export const FEATURE_CREDIT = "Fitur By: Anita Putri Azzahra\nFitur SC Bot Umi Usanagi 👑\nTiktok: https://tiktok.com/@anita.putri.azzah1\nSaluran Resmi: https://whatsapp.com/channel/0029Vb8dmsUElagkVPIw9X2P";


import { generateWAMessageFromContent } from '@rexxhayanasi/elaina-baileys'
import { premiumOwnerContact } from '../../../../lib/premium-mode.js'

/*
 * Task148 — "laporan bug / hubungi owner" tidak boleh mengarah ke nomor kosong
 * atau nomor orang lain.
 *
 * Berkas asli Rimuru memakai `global.nomorown`, `global.linkch`, dan
 * `global.wm` yang TIDAK PERNAH didefinisikan di bot ini, sehingga tombol
 * "Hubungi Owner" berisi nomor kosong. Sekarang nomornya diambil dari
 * resolver yang sama dengan pesan premium (developer/owner utama lebih dulu),
 * dan tautan saluran jatuh ke `global.links.channelUrl`.
 */
function nomorKontak(conn) {
  try {
    return premiumOwnerContact(conn?.botConfig) || ''
  } catch (error) {
    return ''
  }
}

function tautanSaluran() {
  const links = global.links || {}
  const kandidat = [global.linkch, links.channelUrl, global.jadibotPlatform?.channelUrl]
  return kandidat.map((x) => String(x || '').trim()).find(Boolean) || 'https://wa.me/' + (nomorKontak() || '')
}

let handler = async (m, { sock, conn }) => {
  const nomor = nomorKontak(conn || sock || this)
  if (!nomor) {
    return m.reply('Nomor owner belum diatur. Developer bisa menyetelnya dengan *.premium kontak <nomor>*.')
  }
  const msg = generateWAMessageFromContent(
    m.chat,
    {
      interactiveMessage: {
        header: {
          title: 'Owner Bot',
          subtitle: 'Informasi & Kontak'
        },
        body: {
          text: `Hai, jika ada pertanyaan, laporan bug, atau keperluan lainnya silakan hubungi owner melalui tombol di bawah ini.`
        },
        footer: {
          text: String(global.wm || global.namebot || 'Usanagi Umi AI')
        },
        nativeFlowMessage: {
          buttons: [
            {
              name: 'cta_call',
              buttonParamsJson: JSON.stringify({
                display_text: 'Hubungi Owner',
                phone_number: '+' + nomor
              })
            },
            {
              name: 'cta_url',
              buttonParamsJson: JSON.stringify({
                display_text: 'Chat WhatsApp',
                url: `https://wa.me/${nomor}`
              })
            },
            {
              name: 'cta_url',
              buttonParamsJson: JSON.stringify({
                display_text: 'Saluran WhatsApp',
                url: tautanSaluran()
              })
            },
            {
              name: 'cta_copy',
              buttonParamsJson: JSON.stringify({
                display_text: 'Salin Nomor Owner',
                copy_code: nomor
              })
            },
            {
              name: 'single_select',
              buttonParamsJson: JSON.stringify({
                title: 'Navigasi Cepat',
                sections: [
                  {
                    title: 'Menu Bot',
                    rows: [
                      {
                        title: 'Menu Utama',
                        description: 'Buka menu bot',
                        id: '.menu'
                      },
                      {
                        title: 'Cek Status Bot',
                        description: 'Lihat kecepatan respon bot',
                        id: '.ping'
                      }
                    ]
                  }
                ]
              })
            }
          ]
        }
      }
    },
    {
      quoted: m
    }
  )

  await sock.relayMessage(
    m.chat,
    msg.message,
    { messageId: msg.key.id }
  )
}
const pluginConfig = {
  name: 'creator2',
  alias: ['owner2'],
  category: 'main',
  description: 'Varian kontak owner dari Tensura.',
  usage: '.creator2',
  example: '.creator2',
  isOwner: false,
  isPremium: false,
  isGroup: false,
  isPrivate: false,
  cooldown: 5,
  energi: 1,
  isEnabled: true,
};

export { pluginConfig as config, handler };
