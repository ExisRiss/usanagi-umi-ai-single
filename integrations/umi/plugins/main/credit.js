const pluginConfig = {
    name: 'credit',
    alias: [],
    category: 'main',
    description: 'Menampilkan credit Umi Usanagi.',
    usage: '.credit',
    example: '.credit',
    isOwner: false,
    isPremium: false,
    isGroup: false,
    isPrivate: false,
    cooldown: 5,
    energi: 0,
    isEnabled: true,
}

async function handler(m, { sock }) {
    const text = `╔══════════════════════════════════════════════╗
║       👑 𝑼𝑴𝑰 𝑼𝑺𝑨𝑵𝑮𝑰 〽️                        ║
╚══════════════════════════════════════════════╝

🪽 𝑵𝒐𝒕𝒆 :
Bot WhatsApp dengan fitur AI, tools, downloader, maker, dan game.

╭─────────────「 🜲 𝑰𝑵𝑭𝑶 𝑫𝑬𝑽 𝑶𝑹𝑰𝑮𝑰𝑵𝑨𝑳 」─────────────╮
│ 👤 Developer : 𝑯𝒚𝒖𝒖 / 𝒁𝒂𝒏𝒏
│ 🎵 TikTok    : https://tiktok.com/@ourinmd
│ 📢 WhatsApp  : https://whatsapp.com/channel/0029VbB37bgBfxoAmAlsgE0t
╰─────────────────────────────────────────────╯

╭────────────「 ✦ 𝑰𝑵𝑭𝑶 𝑷𝑬𝑵𝑮𝑬𝑴𝑩𝑨𝑵𝑮 」────────────╮
│ 👤 Developer Pihak Ketiga : 𝑨𝒏𝒊𝒕𝒂 𝑷𝒖𝒕𝒓𝒊 𝑨𝒛𝒛𝒂𝒉𝒓𝒂
│ 🎵 TikTok                 : https://tiktok.com/@anita.putri.azzah1
│ 📸 Instagram              : anit_aputriazzahrah
│ 📢 Saluran                : https://whatsapp.com/channel/0029Vb8dmsUElagkVPIw9X2P
│ ▶️ YouTube                : https://youtube.com/@rimurumd
╰─────────────────────────────────────────────╯

        ⚠️ 𝑫𝑶 𝑵𝑶𝑻 𝑹𝑬𝑴𝑶𝑽𝑬 𝑪𝑹𝑬𝑫𝑰𝑻 ⚠️
              ❖ 𝐉𝐚𝐧𝐠𝐚𝐧 𝐡𝐚𝐩𝐮𝐬 𝐜𝐫𝐞𝐝𝐢𝐭 ❖

                 「 👑 𝑼𝑴𝑰 𝑼𝑺𝑨𝑵𝑮𝑰 👑 」`

    await m.reply(text)
}

export { pluginConfig as config, handler }
