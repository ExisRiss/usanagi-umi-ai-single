import { botJidAktif } from '../../lib/bot-jid.js'
//~ Ahmad tumbuh kembang
let handler = async (m, { conn, text }) => {
  try {
    const groupJid = m.chat;

    if (!groupJid.endsWith("@g.us")) {
      return m.reply("Command ini hanya untuk grup.");
    }

    const res = await conn.groupParticipantsUpdate(
      groupJid,
      [botJidAktif(conn)],
      "add",
    );

    m.reply(
      "Sukses add Meta AI ke grup ✅"
    );
  } catch (e) {
    console.error(e);
    m.reply(String(e?.stack || e));
  }
};

handler.command = /^(addai)$/i;
export default handler;