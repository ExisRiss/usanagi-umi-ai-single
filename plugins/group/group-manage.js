/* Task200 — tangani `rate-overlimit` dari WhatsApp: retry dengan jeda
 * sebelum menyerah, dan balas dengan pesan manusiawi (bukan error mentah). */
const TUNGGU = (ms) => new Promise((r) => setTimeout(r, ms));
async function jalankanAksi(conn, chat, target, aksi) {
 let terakhir = null;
 for (let percobaan = 0; percobaan < 3; percobaan++) {
  try {
   return await conn.groupParticipantsUpdate(chat, [target], aksi);
  } catch (error) {
   terakhir = error;
   const teks = String(error?.message || error);
   if (/rate[- ]?overlimit|rate.?limit/i.test(teks) && percobaan < 2) {
    await TUNGGU(4000 * (percobaan + 1)); // 4s lalu 8s — beri jeda WA
    continue;
   }
   throw error;
  }
 }
 throw terakhir;
}
function pesanGagalAksi(error) {
 const teks = String(error?.message || error);
 if (/rate[- ]?overlimit|rate.?limit/i.test(teks)) {
  return '⛔ WhatsApp membatasi aksi grup ini (*rate limit*).\nTunggu ±1 menit lalu coba lagi — jangan diulang terus-menerus.';
 }
 return `❌ Gagal memproses anggota grup: ${teks.slice(0, 160)}`;
}

const handler = async (m, { conn, text, participants, groupMetadata, command }) => {
 const target = m.quoted ? m.quoted.sender : m.mentionedJid && m.mentionedJid[0] ? m.mentionedJid[0] : text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null;

 const cmd = ['add', 'kick', 'promote', 'demote'];

 if (cmd.includes(command) && !target) return m.reply('Reply/tag siapa yang ingin di proses.');

 const inGc = participants.some((v) => v.jid == target || v.id === target || v.phoneNumber === target);

 switch (command) {
  case 'add':
   {
    if (inGc) return m.reply('User sudah ada didalam grup!');
    let response;
    try {
     response = await jalankanAksi(conn, m.chat, target, 'add');
    } catch (error) {
     return m.reply(pesanGagalAksi(error));
    }
    let jpegThumbnail = '';
    try { jpegThumbnail = await conn.profilePictureUrl(m.chat, 'image'); } catch { /* tanpa foto */ }

    for (const participant of response) {
     const jid = participant.content.attrs.phone_number || participant.content.attrs.jid;
     const status = participant.status;

     if (status === '408') {
      m.reply(`Tidak dapat menambahkan @${jid.split('@')[0]}!\nMungkin @${jid.split('@')[0]} baru keluar dari grup ini atau dikick`);
     } else if (status === '403') {
      const inviteCode = participant.content.content[0].attrs.code;
      const inviteExp = participant.content.content[0].attrs.expiration;
      await m.reply(`Mengundang @${jid.split('@')[0]} menggunakan invite...`);

      await conn.sendGroupV4Invite(m.chat, jid, inviteCode, inviteExp, groupMetadata.subject, 'Undangan untuk bergabung ke grup WhatsApp saya', jpegThumbnail);
     }
    }
   }
   break;

  case 'kick':
   if (!inGc) return m.reply('User tidak ada dalam grup.');
   try {
    await jalankanAksi(conn, m.chat, target, 'remove');
   } catch (error) {
    return m.reply(pesanGagalAksi(error));
   }
   m.reply(`Berhasil kick: @${target.split('@')[0]}`);
   break;

  case 'promote':
   if (!inGc) return m.reply('User tidak berada dalam grup!');
   try {
    await jalankanAksi(conn, m.chat, target, 'promote');
   } catch (error) {
    return m.reply(pesanGagalAksi(error));
   }
   m.reply(`Promote: @${target.split('@')[0]}`);
   break;

  case 'demote':
   if (!inGc) return m.reply('User tidak berada dalam grup!');
   try {
    await jalankanAksi(conn, m.chat, target, 'demote');
   } catch (error) {
    return m.reply(pesanGagalAksi(error));
   }
   m.reply(`Demote: @${target.split('@')[0]}`);
   break;

  // ✅ FIXED SECTION
  case 'opengc':
   await conn.groupSettingUpdate(m.chat, 'not_announcement');
   m.reply('Grup berhasil dibuka (semua member bisa chat).');
   break;

  case 'closegc':
   await conn.groupSettingUpdate(m.chat, 'announcement');
   m.reply('Grup berhasil ditutup (hanya admin yang bisa chat).');
   break;

  default:
   return m.reply('Perintah tidak dikenal.');
 }
};

handler.help = ['add', 'kick', 'promote', 'demote', 'opengc', 'closegc'];
handler.tags = ['group'];
handler.command = /^(add|kick|promote|demote|opengc|closegc)$/i;
handler.admin = true;

handler.group = true;
handler.botAdmin = true;

export default handler;