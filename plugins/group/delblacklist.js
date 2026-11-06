// plugins/owner/delblacklist.js

'use strict'

function cleanJid(jid = '') {
    return String(jid)
        .replace(/:\d+@/, '@')
        .replace(/@lid$/, '@s.whatsapp.net')
        .trim()
}

function getTarget(m, args = []) {
    if (m.quoted && m.quoted.sender) {
        return cleanJid(m.quoted.sender)
    }

    if (m.mentionedJid && m.mentionedJid.length) {
        return cleanJid(m.mentionedJid[0])
    }

    const number = String(args[0] || '').replace(/\D/g, '')

    if (number) {
        return `${number}@s.whatsapp.net`
    }

    return ''
}

const handler = async (m, {
    args,
    isAdmin,
    isOwner,
    usedPrefix,
    command
}) => {
    // Owner tetap boleh menghapus blacklist walau bukan admin grup;
    // selain itu khusus admin grup.
    if (!isAdmin && !isOwner) {
        return m.reply('❌ Khusus admin grup atau owner!')
    }

    global.db.data.blacklistUser =
        global.db.data.blacklistUser || {}

    const target = getTarget(m, args)

    if (!target) {
        return m.reply(
            `❌ Target tidak ditemukan!\n\n` +
            `Contoh:\n` +
            `${usedPrefix + command} 628xxxxxxxxxx\n` +
            `${usedPrefix + command} @user\n` +
            `Reply pesan user lalu ketik ${usedPrefix + command}`
        )
    }

    const number = cleanJid(target).split('@')[0]

    let foundKey = null

    for (const jid of Object.keys(
        global.db.data.blacklistUser
    )) {
        if (
            cleanJid(jid).split('@')[0] === number
        ) {
            foundKey = jid
            break
        }
    }

    if (!foundKey) {
        return m.reply(
            `⚠️ User @${number} tidak ada di blacklist.`,
            null,
            {
                mentions: [target]
            }
        )
    }

    delete global.db.data.blacklistUser[foundKey]

    return m.reply(
        `✅ *BLACKLIST DIHAPUS*\n\n` +
        `👤 User: @${number}\n\n` +
        `User tersebut sudah dikeluarkan dari daftar blacklist.`,
        null,
        {
            mentions: [target]
        }
    )
}

handler.help = ['delblacklist <nomer>', 'delblacklist @user', 'delblacklist (reply pesan)']
handler.tags = ['group']
handler.command = /^delblacklist$/i
handler.group = true
// handler.admin TIDAK dipasang: filter admin dijalankan di dalam handler
// agar owner (bukan admin) tetap bisa memakai perintah ini.
handler.description = 'Hapus user dari blacklist bot — .delblacklist <nomer> / @user / reply pesan'

export default handler