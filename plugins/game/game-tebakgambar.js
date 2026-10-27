import fs from 'fs'

let timeout = 60000
let poin = 40

let handler = async (m, { conn }) => {

conn.game = conn.game ? conn.game : {}

let id = 'tebakgambar-' + m.chat

if (id in conn.game)
return conn.reply(
m.chat,
'❀ Masih ada game yang belum selesai',
m
)

let src = JSON.parse(fs.readFileSync('./json/tebakgambar.json'))
let json = src[Math.floor(Math.random() * src.length)]

const susunCaption = () => `
🖼 「 *TEBAK GAMBAR* 」

${json.deskripsi}

Waktu : ${timeout/1000} detik
Bonus : ${poin} XP
`.trim()

/* Task133 — dulu satu gambar yang gagal diunduh (fetch failed dari server)
 * membuat seluruh perintah error dan tercatat di laporan error. Sekarang
 * gambar diganti sampai 3 kali; kalau tetap gagal, beri tahu pelapor tanpa
 * mendaftarkan game yang tidak punya gambar. */
let pesanSoal = null
for (let coba = 0; coba < 3 && !pesanSoal; coba++) {
try {
pesanSoal = await conn.sendMessage(
m.chat,
{
image:{ url: json.img },
caption: susunCaption()
},
{ quoted:m }
)
} catch (error) {
console.warn(`[TEBAKGAMBAR] gambar gagal dimuat (percobaan ${coba + 1}):`, error?.message || error)
json = src[Math.floor(Math.random() * src.length)]
}
}

if (!pesanSoal) {
return conn.reply(
m.chat,
'❌ Gambar soal gagal dimuat dari server gambar. Coba lagi sebentar lagi.',
m
)
}

conn.game[id] = [
pesanSoal,
json,
poin,
setTimeout(()=>{
if(conn.game[id]){

/* Task132 — jangan kutip hasil sendMessage (proto mentah): getter `.chat`
 * pada objek itu tidak punya conn dan mematikan proses. Kutip `m` saja. */
conn.reply(
m.chat,
`❀ Waktu habis!

🖼 Game : Tebak Gambar

Jawaban :
${json.jawaban}`,
m
)

delete conn.game[id]

}
},timeout)
]

}

handler.help = ['tebakgambar']
handler.tags = ['game']
handler.command = /^tebakgambar$/i

handler.game = true


handler.all = async function (m){

if(!this.game) return

let id = 'tebakgambar-' + m.chat
if(!(id in this.game)) return
if(!m.text) return

let room = this.game[id]
let json = room[1]

let teks = m.text.toLowerCase().trim()

if (teks === 'nyerah') {

clearTimeout(room[3])

await this.reply(
m.chat,
`🏳️ Menyerah!

🖼 Game : Tebak Gambar

Jawaban :
${json.jawaban}`,
m
)

delete this.game[id]
return
}

if (teks.replace(/\s/g,'') === json.jawaban.toLowerCase().replace(/\s/g,'')) {

clearTimeout(room[3])

let user = global.db.data.users[m.sender]
if(!user.exp) user.exp = 0

let exp = room[2]
user.exp += exp

await this.reply(
m.chat,
`✨ Benar!

🖼 Game : Tebak Gambar

+${exp} XP`,
m
)

delete this.game[id]

}

}

export default handler