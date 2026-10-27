/* By AlzRiss - Usanagi Umi AI
 *
 * DATA CEK & KUTIPAN (Task130 — diadaptasi dari Kilua MD by Naren V2)
 *
 * Semua teks diambil dari plugin Kilua (fun/fun-cek*.js dan quotes/quotes*.js),
 * tetapi ISI DI ARSIPNYA TERCAMPUR: satu daftar vonis berisi milik beberapa
 * plugin sekaligus. Contoh nyata: `fun/fun-ceklesbi.js` di Kilua berisi vonis
 * bucin + sadboy, `fun/fun-cekharam.js` berisi dosa + kecerdasan + jodoh, dan
 * `fun/fun-cekbegoo` justru berisi teks bucin.
 *
 * Karena itu daftar panjang tersebut dipotong per 5 baris, lalu tiap potongan
 * dikembalikan ke plugin yang sesuai dengan judulnya. Urutannya juga dirapikan
 * dari "paling ringan" ke "paling ekstrem" supaya skor besar = vonis ekstrem.
 *
 * Yang saya tulis sendiri:
 *   - satu tingkat paling ringan untuk ceksange (di Kilua cuma ada 4 tingkat,
 *     supaya seragam 5 tingkat);
 *   - kelima vonis cekdosa, karena teks aslinya dipakai bersama cekharam;
 *   - seluruh label kategori, karena Kilua hanya punya label untuk 4 plugin.
 *
 * TIDAK ikut diporting: cekbucin, cekjodoh, dan ceksial — ketiganya sudah ada
 * di Umi (`plugins/fun/usanagi-cek*.js`), jadi mendaftarkannya lagi hanya akan
 * menimbulkan perintah kembar.
 *
 * Dipisah dari kode supaya mudah ditambah/diubah tanpa menyentuh logika.
 */

/** kunci → { judul, vonis[], kategori[], warna } — vonis[0] paling ringan. */
export const CEK = {
 "cekgay": {
  "judul": "🌈 CEK TINGKAT GAY",
  "vonis": [
   "Lurus setegak tiang bendera, normal 100%! 🛡️",
   "Kadang suka muji temen cowok doang sih~ 😅",
   "Mulai mencurigakan, tatapannya agak beda... 👀",
   "Sering genit dan nempel-nempel sama cowok lain! 🙈",
   "GAY LEVEL MAKSIMAL, BURUAN TAUBAT MAS! 🌈💥"
  ],
  "kategori": [
   "Lurus 🛡️",
   "Mulai Fleksibel 😅",
   "Agak Curiga 👀",
   "Suka Genit 🙈",
   "Gay Maksimal 🌈"
  ],
  "warna": "#ff4794"
 },
 "cekbego": {
  "judul": "🤪 CEK TINGKAT BEGO",
  "vonis": [
   "Aman, masih waras dan punya akal sehat! 😇",
   "Bego dikit-dikit pas disuruh mikir logika~ 🙈",
   "Sering loading lama kalo diajak ngobrol! 🤦‍♂️",
   "Bego stadium 3, jangan biarin bikin keputusan! 😭",
   "BEGO TANPA BATAS, OTAKNYA HILANG KETINGGALAN DI RUMAH! 💀"
  ],
  "kategori": [
   "Jenius 🧠",
   "Sedikit Lupa 😅",
   "Agak Bingung 😐",
   "Butuh Belajar 📖",
   "Bego Akut 🤪"
  ],
  "warna": "#ffb800"
 },
 "cekdosa": {
  "judul": "😈 DETEKTOR DOSA KECIL",
  "vonis": [
   "Bersih tanpa dosa kecil, niat baik terus dijaga. 🕊️",
   "Sesekali ikut ghibah dikit pas ngumpul bareng teman. 🤭",
   "Suka bohong kecil biar gak kena marah, tapi masih sadar. 😅",
   "Dosa kecil numpuk: telat, bolos, dan suka nunda kerjaan. 😈",
   "DOSA KECIL JADI BESAR, SUDAH SAATNYA ISTIGHFAR! 🔥"
  ],
  "kategori": [
   "Suci 🕊️",
   "Dosa Mini 🤭",
   "Sering Bohong Kecil 😅",
   "Numpuk 😈",
   "Saatnya Tobat 🔥"
  ],
  "warna": "#7b2ff7"
 },
 "cekharam": {
  "judul": "☠️ CEK KADAR HARAM",
  "vonis": [
   "Suci bersih bagaikan bayi baru lahir! 🕊️",
   "Dosa kecil dikit pas ghibahin tetangga doang~ 🤭",
   "Kelakuan agak haram, sering bolos dan rebahan! 😈",
   "Pikiran dan tingkahnya kotor banget astaga! 🙈",
   "HARAM BIANG KELADI, SETAN AJA SUJUD SUNGKEM! 👹🔥"
  ],
  "kategori": [
   "Suci 🕊️",
   "Masih Aman 🤭",
   "Mulai Haram 😈",
   "Kotor 🙈",
   "Haram Biang Keladi 👹"
  ],
  "warna": "#e63946"
 },
 "ceklesbi": {
  "judul": "👭 CEK TINGKAT LESBI",
  "vonis": [
   "Normal sejati, sukanya cowok tulen! 💖",
   "Cuma sebatas bestie peluk-pelukan wajar kok~",
   "Agak salfok kalo liat cewek bening lewat! 🙈",
   "Curiga nih, lebih nyaman sama cewek daripada cowok! 👀",
   "LESBI LEVEL MAKSIMAL, AURA YURI TERLALU PEKAT! 🌺✨"
  ],
  "kategori": [
   "Normal Sejati 💖",
   "Bestie Wajar 🤗",
   "Agak Salfok 🙈",
   "Curiga 👀",
   "Lesbi Maksimal 🌺"
  ],
  "warna": "#d63384"
 },
 "ceksadboy": {
  "judul": "🥀 CEK KADAR SADBOY",
  "vonis": [
   "Hatinya bahagia tanpa trauma cinta! ☀️",
   "Kadang melow kalo denger lagu galau pas hujan~ 🌧️",
   "Sering stalking sosmed mantan tengah malem! 📱",
   "Spesialis korban ghosting dan cinta bertepuk sebelah tangan! 🥀",
   "SADBOY SEJATI, AIR MATANYA BISA BIKIN BANJIR IBU KOTA! 😭💔"
  ],
  "kategori": [
   "Bahagia ☀️",
   "Sedikit Melow ☁️",
   "Baper Sendiri 🌧️",
   "Sadboy Sejati 🥀",
   "Akut 💔"
  ],
  "warna": "#4a4e69"
 },
 "ceksange": {
  "judul": "🌶️ CEK TINGKAT SANGE",
  "vonis": [
   "Bersih, gak ada pikiran aneh sama sekali. 😇",
   "Pikiran suci murni, hatinya sebersih kain kafan!",
   "Normal, masih punya rasa malu dan iman.",
   "Sering mikir ngeres pas lagi ngelamun sendirian.",
   "Pikiran kotor 24/7! Liat knalpot motor aja ngeres!"
  ],
  "kategori": [
   "Bersih 😇",
   "Normal 🙂",
   "Sering Ngeres 😅",
   "Pikiran Kotor 🔥",
   "Sange Maksimal 🌶️"
  ],
  "warna": "#e8590c"
 },
 "cekstres": {
  "judul": "🤯 CEK TINGKAT STRES",
  "vonis": [
   "Santai tanpa beban, hidup damai sejahtera! 🧘",
   "Agak pusing tugas/pekerjaan dikit, masih wajar~ ☕",
   "Mulai sering ngelamun dan overthinking tiap malem! 🌙",
   "Stres berat butuh liburan ke Bali sekarang juga! 🏖️",
   "STRES MAKSIMAL MAU GILA, BURUAN REFRESHING SEBELUM RUSAK! 💥🚨"
  ],
  "kategori": [
   "Santai 🧘",
   "Agak Pusing ☕",
   "Overthinking 🌙",
   "Stres Berat 🏖️",
   "Mau Gila 💥"
  ],
  "warna": "#9d0208"
 },
 "cektolol": {
  "judul": "🤡 CEK KETOLOLAN",
  "vonis": [
   "Pinter dan teliti, jauh dari kata tolol! ✨",
   "Kadang tolol pas panik doang sih~ 😅",
   "Tingkahnya sering bikin geleng-geleng kepala! 🗿",
   "Ketololannya sudah di luar nalar manusia normal! 🤯",
   "RAJA TOLOL SEALAM DUNIA, KELAKUANNYA BIKIN EMOSI! 🎭"
  ],
  "kategori": [
   "Pinter ✨",
   "Kadang Tolol 😅",
   "Bikin Geleng Kepala 🗿",
   "Di Luar Nalar 🤯",
   "Raja Tolol 🎭"
  ],
  "warna": "#f77f00"
 },
 "cekwatak": {
  "judul": "🧠 ANALISIS WATAK ASLI",
  "vonis": [
   "Manusia normal, gak pernah nonton anime! 🚶",
   "Cuma tau Naruto sama One Piece doang~ 🍙",
   "Suka dengerin lagu jepang dan koleksi waifu! 🎧",
   "Bau bawang akut, tiap hari halu sama karakter anime! 🧅",
   "WIBU SEJATI NOMOR SATU, IKZUUU SASAGEYO ONII-CHAN! 🎌✨"
  ],
  "kategori": [
   "Normie 🚶",
   "Tahu Anime 🍙",
   "Suka Budaya Jepang 🎧",
   "Wibu Berat 🧅",
   "Wibu Sejati 🎌"
  ],
  "warna": "#3a86ff"
 },
 "cekalim": {
  "judul": "📿 CEK TINGKAT ALIM",
  "vonis": [
   "Jarang ibadah, hayo buruan taubat sebelum terlambat! 🥺",
   "Alim pas ada maunya atau pas kepepet doang~ 😅",
   "Rajin ibadah, calon menantu idaman mertua! 🤲",
   "Hafal juz amma dan selalu jaga pandangan, masyaAllah! 📖✨",
   "ALIM TINGKAT TINGGI, AURA KESALEHAN BERSINAR TERANG! 🌟🕋"
  ],
  "kategori": [
   "Jarang Ibadah 🥺",
   "Alim Kalau Perlu 😅",
   "Rajin Ibadah 🤲",
   "Calon Menantu 📖",
   "Alim Tingkat Tinggi 🌟"
  ],
  "warna": "#2d6a4f"
 }
}

/** kunci → daftar kutipan (diambil apa adanya dari Kilua) */
export const KUTIPAN = {
 "bijak": [
  "Keyakinan merupakan suatu pengetahuan di dalam hati, jauh tak terjangkau oleh bukti.",
  "Rasa bahagia dan tak bahagia bukan berasal dari apa yang kamu miliki, tapi berasal dari pikiran kamu.",
  "Sakit dalam perjuangan itu hanya sementara. Namun jika menyerah, rasa sakit itu akan terasa selamanya.",
  "Hanya seseorang yang takut yang bisa bertindak berani. Tanpa rasa takut itu tidak ada keberanian.",
  "Jadilah diri kamu sendiri. Siapa lagi yang bisa melakukannya lebih baik ketimbang diri kamu sendiri?",
  "Kesempatan kamu untuk sukses selalu dapat diukur oleh seberapa besar kepercayaan kamu pada diri sendiri.",
  "Kebanggaan kita yang terbesar adalah bukan tidak pernah gagal, tetapi bangkit kembali setiap kali kita jatuh.",
  "Suatu pekerjaan yang paling tak kunjung bisa diselesaikan adalah pekerjaan yang tak kunjung pernah dimulai.",
  "Pikiran kamu bagaikan api yang perlu dinyalakan, bukan bejana yang menanti untuk diisi.",
  "Kejujuran adalah batu penjuru dari segala kesuksesan. Pengakuan adalah motivasi terkuat.",
  "Segala sesuatu memiliki kesudahan, yang sudah berakhir biarlah berlalu dan yakinlah semua akan baik-baik saja.",
  "Setiap detik sangatlah berharga karena waktu mengetahui banyak hal, termasuk rahasia hati.",
  "Jika kamu tak menemukan buku yang kamu cari di rak, maka tulislah sendiri.",
  "Jika hatimu banyak merasakan sakit, maka belajarlah untuk tidak memberikan rasa sakit pada orang lain.",
  "Hidup tak selamanya tentang pacar.",
  "Rumah bukan hanya sebuah tempat, tetapi itu adalah perasaan.",
  "Pilih mana: Orang yang memimpikan kesuksesan atau orang yang membuatnya menjadi kenyataan?",
  "Bukan bahagia yang menjadikan kita bersyukur, tetapi dengan bersyukurlah yang akan menjadikan hidup kita bahagia.",
  "Aku memang diam. Tapi aku tidak buta.",
  "Kamu tidak bisa menyiram bunga yang layu, tapi kamu bisa menanam bunga yang baru dengan harapan yang lebih baik.",
  "Jangan pernah menyesali sehari pun dalam hidupmu. Hari baik memberimu kebahagiaan, hari buruk memberimu pengalaman.",
  "Kesabaran bukanlah kemampuan untuk menunggu, melainkan bagaimana kita bersikap saat sedang menunggu.",
  "Orang yang kuat bukanlah orang yang tidak pernah menangis, melainkan orang yang tetap tegar meski air matanya mengalir.",
  "Kebaikan yang kamu tanam hari ini mungkin tidak berbuah esok hari, tapi pasti akan berbuah pada waktunya.",
  "Waktu adalah pedang; jika kamu tidak memanfaatkannya dengan bijak, ia yang akan menebasmu.",
  "Memaafkan bukan berarti melupakan, tetapi melepaskan beban di hati agar bisa melangkah lebih ringan.",
  "Kekayaan sejati bukanlah tentang seberapa banyak yang kamu miliki, melainkan seberapa sedikit kebutuhanmu untuk merasa cukup.",
  "Kadang kita harus tersesat terlebih dahulu untuk menemukan jalan terbaik yang belum pernah terpikirkan.",
  "Belajarlah merendah sampai tidak ada seorang pun yang bisa merendahkanmu.",
  "Diam adalah jawaban terbaik untuk orang yang tidak menghargai perkataanmu.",
  "Kelemahan terbesar kita adalah mudah menyerah. Cara paling pasti untuk sukses adalah selalu mencoba satu kali lagi.",
  "Jangan membandingkan prosesmu dengan orang lain, karena pelangi dan bintang bersinar pada waktu yang berbeda."
 ],
 "bucin": [
  "Aku memilih untuk sendiri, bukan karena menunggu yang sempurna, tetapi butuh yang tak pernah menyerah.",
  "Seorang yang single diciptakan bersama pasangan yang belum ditemukannya.",
  "Jomblo. Mungkin itu cara Tuhan untuk menyelamatkanmu dari orang yang salah.",
  "Kasih sayang yang tulus tidak akan pernah pudar meski waktu terus berganti.",
  "Cinta itu bukan tentang seberapa lama kamu mengenal seseorang, tapi tentang seberapa tulus kamu mencintainya.",
  "Aku tidak butuh orang yang sempurna, aku hanya butuh seseorang yang bisa membuatku merasa cukup.",
  "Jika mencintaimu adalah kesalahan, maka aku tidak pernah ingin menjadi benar.",
  "Bersamamu, bahkan diam pun terasa begitu nyaman dan menenangkan.",
  "Bukan karena kamu yang terbaik, tapi karena kamu yang membuat hatiku berhenti mencari.",
  "Rindu ini seperti ombak di lautan, tak pernah berhenti mendekat ke tepian hatimu.",
  "Aku ingin menjadi alasan di balik senyum pertamamu setiap pagi.",
  "Cinta sejati tidak butuh alasan, karena cinta adalah alasan itu sendiri.",
  "Mungkin aku bukan yang pertama di hatimu, tapi biarkan aku menjadi yang terakhir.",
  "Setiap detak jantungku selalu berbisik namamu pelan-pelan.",
  "Hujan di luar mungkin dingin, tapi mengingat senyummu selalu menghangatkan jiwaku.",
  "Dunia ini terlalu luas untuk dijelajahi sendiri, maukah kamu menemaniku sampai akhir?",
  "Jika satu detik bersamamu adalah keabadian, maka aku ingin hidup di detik itu selamanya.",
  "Aku tidak pernah takut jatuh cinta, asalkan yang menyambut jatuhku adalah kamu.",
  "Kamu adalah bait puisi terindah yang pernah dituliskan takdir dalam hidupku.",
  "Terkadang aku cemburu pada bayanganmu, karena dia selalu mengikutimu kemanapun kamu melangkah.",
  "Jarak itu hanya angka, selama namamu masih tersimpan rapi di dalam doa-doaku.",
  "Cintaku padamu bagaikan lingkaran, tidak memiliki titik awal dan tidak akan pernah berujung.",
  "Melihatmu bahagia sudah cukup, tapi menjadi alasan di balik bahagiamu adalah impian terbesarku.",
  "Aku mencintaimu bukan karena siapa dirimu, melainkan siapa diriku saat bersamamu.",
  "Senyummu adalah pemandangan favoritku, dan tawamu adalah melodi paling merdu yang pernah kudengar.",
  "Di antara miliaran manusia di bumi, hatiku hanya memilihmu untuk menetap.",
  "Cinta bukan tentang mencari seseorang yang bisa hidup bersamamu, tapi tentang menemukan seseorang yang tanpanya kamu tak bisa hidup.",
  "Terima kasih sudah hadir dan mengubah hal-hal biasa menjadi luar biasa indah.",
  "Kalau cinta itu luka, biarkan aku terluka asalkan itu karenamu."
 ],
 "galau": [
  "Gak salah kalo aku lebih berharap sama orang yang lebih pasti tanpa khianati janji-janji.",
  "Kalau aku memang tidak sayang sama kamu ngapain aku mikirin kamu. Tapi semuanya kamu yang ngganggap aku gak sayang sama kamu.",
  "Mungkin kamu tak pernah sadar, betapa seringnya aku menatap layar hanya untuk menunggu satu pesan darimu.",
  "Hal paling menyakitkan adalah berpura-pura bahagia ketika hati sedang hancur lebur.",
  "Aku lelah mengejar seseorang yang langkahnya selalu menjauh dari arahku.",
  "Terkadang, melepaskan bukan berarti berhenti mencintai, melainkan menyadari bahwa dia lebih bahagia tanpamu.",
  "Kita pernah sedekat nadi, sebelum akhirnya menjadi sejauh matahari.",
  "Bagian terberat dari perpisahan bukanlah kepergiannya, tapi kenangan yang tertinggal di setiap sudut ingatan.",
  "Aku rindu kita yang dulu, sebelum rasa ego dan keheningan menghancurkan segalanya.",
  "Tersenyum di depan semua orang itu mudah, yang sulit adalah menahan air mata saat sendirian di kamar.",
  "Mungkin aku yang terlalu berharap pada seseorang yang hanya menganggapku persinggahan sementara.",
  "Sudah terbiasa diabaikan, sampai-sampai perhatian kecil terasa seperti keajaiban.",
  "Bukan jarak yang memisahkan kita, melainkan rasa yang perlahan memudar tanpa kita sadari.",
  "Menunggu kabar darimu seperti menunggu hujan di tengah teriknya gurun pasir.",
  "Ternyata, rasa sakit terdalam berasal dari orang yang pernah berjanji tidak akan pernah melukai kita.",
  "Aku tetap bertahan bukan karena bodoh, tapi karena hatiku belum siap menerima kenyataan bahwa kamu sudah pergi.",
  "Kehilangan seseorang yang kita cintai itu berat, tapi kehilangan diri sendiri demi mempertahankan seseorang jauh lebih menyakitkan.",
  "Hati ini seperti cangkir retak; tetap bisa menampung air, tapi perlahan-lahan menetes habis.",
  "Selamat malam untuk kamu yang tak lagi bisa kusapa, semoga mimpimu selalu indah meski tanpaku.",
  "Terima kasih telah mengajarkanku bahwa tidak semua ketulusan akan berbuah kebersamaan.",
  "Rasanya aneh ketika seseorang yang dulu tahu segalanya tentangmu kini bertingkah seperti orang asing.",
  "Luka ini tak berdarah, tapi rasa perihnya menembus hingga ke dasar jiwa.",
  "Aku berhenti mencarimu, bukan karena tak peduli, tapi karena sadar kehadiranku tak lagi dinanti.",
  "Mencintai dalam diam itu menyakitkan, tapi melihatnya mencintai orang lain di depan mata jauh lebih menghancurkan."
 ],
 "gombal": [
  "Hal yang paling aku suka yaitu ngemil, namun tau gak ngemil apa yang paling aku suka? ngemilikin kamu sepenuhnya.",
  "Seandainya sekarang adalah tanggal 28 oktober 1928, aku akan ubah naskah sumpah pemuda menjadi sumpah setia padamu.",
  "Kamu tau gak bedanya kamu sama modem? Kalau modem connect-nya ke internet, kalau kamu connect-nya langsung ke hatiku.",
  "Aku gak sedih kok kalo besok hari senin, asalkan seninnya dilewati bareng kamu.",
  "Muka kamu jangan dimanis-manisin gitu napa, ntar aku kena diabetes liat kamu terus.",
  "Kamu punya peta gak? Soalnya aku tersesat di dalam matamu yang indah.",
  "Bapak kamu tukang las ya? Soalnya tatapan matamu menyengat dan bikin meleleh hatiku.",
  "Cita-citaku dulu pengen jadi pilot, tapi sekarang berubah pengen jadi pendamping hidupmu aja.",
  "Kamu tau gak apa bedanya garuda sama kamu? Kalau garuda di dadaku, kalau kamu di hatiku.",
  "Rumah sakit jiwa dimana ya? Soalnya aku udah gila banget sama pesonamu.",
  "Jangan jalan-jalan terus di pikiranku dong, capek tau mikirin kamu seharian.",
  "Kamu itu kayak garam di lautan, gak keliatan tapi selalu memberi rasa di hidupku.",
  "Kalau kamu jadi senar gitar, aku gak mau jadi pemetiknya. Aku takut mutusin kamu.",
  "Kopi apa yang paling manis? Kopi-kirkan kamu setiap malam sebelum tidur.",
  "Kamu punya spidol gak? Aku mau coret nama mantanku dan tulis namamu di hatiku.",
  "Meskipun tanggal merah banyak, rasa rinduku padamu gak pernah libur barang sedetik pun.",
  "Kamu tau gak persamaan kamu sama matematika? Sama-sama bikin pusing, tapi kamu bikin pusing saking cantiknya.",
  "Aku gak butuh bintang di langit, karena senyumanmu udah cukup menerangi duniaku yang gelap.",
  "Tahu gak kenapa aku suka hujan? Karena setiap tetesnya mengingatkanku pada sejuknya senyumanmu.",
  "Kalau ada lomba mencintaimu, aku yakin pasti kalah, karena aku mencintaimu tanpa batas dan aturan.",
  "Kamu itu seperti wifi berbayar, susah didapetin tapi worth it banget bikin bahagia.",
  "Kucing apa yang paling romantis? Kucing-ta kamu selamanya tanpa ragu.",
  "Kamu tau gak kenapa menara pisa miring? Soalnya ketarik sama gravitasi kecantikanmu.",
  "Napas aku sesak nih, kayaknya gara-gara oksigen di ruangan ini habis diserap sama pesonamu."
 ],
 "motivasi": [
  "ᴊᴀɴɢᴀɴ ʙɪᴄᴀʀᴀ, ʙᴇʀᴛɪɴᴅᴀᴋ ꜱᴀᴊᴀ. ᴊᴀɴɢᴀɴ ᴋᴀᴛᴀᴋᴀɴ, ᴛᴜɴᴊᴜᴋᴋᴀɴ ꜱᴀᴊᴀ. ᴊᴀɴɢᴀɴ ᴊᴀɴᴊɪ, ʙᴜᴋᴛɪᴋᴀɴ ꜱᴀᴊᴀ.",
  "ᴊᴀɴɢᴀɴ ᴘᴇʀɴᴀʜ ʙᴇʀʜᴇɴᴛɪ ᴍᴇʟᴀᴋᴜᴋᴀɴ ʏᴀɴɢ ᴛᴇʀʙᴀɪᴋ ʜᴀɴʏᴀ ᴋᴀʀᴇɴᴀ ꜱᴇꜱᴇᴏʀᴀɴɢ ᴛɪᴅᴀᴋ ᴍᴇᴍʙᴇʀɪ ᴀɴᴅᴀ ᴘᴇɴɢʜᴀʀɢᴀᴀɴ.",
  "ʙᴇᴋᴇʀᴊᴀ ꜱᴀᴀᴛ ᴍᴇʀᴇᴋᴀ ᴛɪᴅᴜʀ. ʙᴇʟᴀᴊᴀʀ ꜱᴀᴀᴛ ᴍᴇʀᴇᴋᴀ ʙᴇʀᴘᴇꜱᴛᴀ. ʜᴇᴍᴀᴛ ꜱᴇᴍᴇɴᴛᴀʀᴀ ᴍᴇʀᴇᴋᴀ ᴍᴇɴɢʜᴀʙɪꜱᴋᴀɴ. ʜɪᴅᴜᴘʟᴀʜ ꜱᴇᴘᴇʀᴛɪ ᴍɪᴍᴘɪ ᴍᴇʀᴇᴋᴀ.",
  "ᴋᴜɴᴄɪ ᴋᴇꜱᴜᴋꜱᴇꜱᴀɴ ᴀᴅᴀʟᴀʜ ᴍᴇᴍᴜꜱᴀᴛᴋᴀɴ ᴘɪᴋɪʀᴀɴ ꜱᴀᴅᴀʀ ᴋɪᴛᴀ ᴘᴀᴅᴀ ʜᴀʟ-ʜᴀʟ ʏᴀɴɢ ᴋɪᴛᴀ ɪɴɢɪɴᴋᴀɴ, ʙᴜᴋᴀɴ ʜᴀʟ-ʜᴀʟ ʏᴀɴɢ ᴋɪᴛᴀ ᴛᴀᴋᴜᴛɪ.",
  "ᴊᴀɴɢᴀɴ ᴛᴀᴋᴜᴛ ɢᴀɢᴀʟ. ᴛᴀᴋᴜᴛʟᴀʜ ʙᴇʀᴀᴅᴀ ᴅɪ ᴛᴇᴍᴘᴀᴛ ʏᴀɴɢ ꜱᴀᴍᴀ ᴛᴀʜᴜɴ ᴅᴇᴘᴀɴ ꜱᴇᴘᴇʀᴛɪ ꜱᴇᴋᴀʀᴀɴɢ.",
  "ꜱᴇᴛɪᴀᴘ ʜᴀʀɪ ᴀᴅᴀʟᴀʜ ᴋᴇꜱᴇᴍᴘᴀᴛᴀɴ ʙᴀʀᴜ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴠᴇʀꜱɪ ᴛᴇʀʙᴀɪᴋ ᴅᴀʀɪ ᴅɪʀɪᴍᴜ.",
  "ᴅɪꜱɪᴘʟɪɴ ᴀᴅᴀʟᴀʜ ᴊᴇᴍʙᴀᴛᴀɴ ᴀɴᴛᴀʀᴀ ᴛᴜᴊᴜᴀɴ ᴅᴀɴ ᴘᴇɴᴄᴀᴘᴀɪᴀɴ.",
  "ᴋᴇꜱᴜᴋꜱᴇꜱᴀɴ ᴛɪᴅᴀᴋ ᴅᴀᴛᴀɴɢ ᴋᴇᴘᴀᴅᴀ ᴍᴇʀᴇᴋᴀ ʏᴀɴɢ ᴍᴇɴᴜɴɢɢᴜ, ᴛᴇᴛᴀᴘɪ ᴋᴇᴘᴀᴅᴀ ᴍᴇʀᴇᴋᴀ ʏᴀɴɢ ʙᴇʀᴊᴜᴀɴɢ.",
  "ʀᴀꜱᴀ ꜱᴀᴋɪᴛ ᴋᴀʀᴇɴᴀ ᴅɪꜱɪᴘʟɪɴ ᴊᴀᴜʜ ʟᴇʙɪʜ ʀɪɴɢᴀɴ ᴅᴀʀɪᴘᴀᴅᴀ ʀᴀꜱᴀ ꜱᴀᴋɪᴛ ᴋᴀʀᴇɴᴀ ᴘᴇɴʏᴇꜱᴀʟᴀɴ.",
  "ᴊɪᴋᴀ ᴋᴀᴍᴜ ᴛɪᴅᴀᴋ ᴍᴇᴍʙᴀɴɢᴜɴ ᴍɪᴍᴘɪᴍᴜ, ᴏʀᴀɴɢ ʟᴀɪɴ ᴀᴋᴀɴ ᴍᴇɴʏᴇᴡᴀᴍᴜ ᴜɴᴛᴜᴋ ᴍᴇᴍʙᴀɴɢᴜɴ ᴍɪᴍᴘɪ ᴍᴇʀᴇᴋᴀ.",
  "Keringat yang kamu keluarkan hari ini adalah bukti perjuangan untuk masa depan yang lebih cerah.",
  "Jangan biarkan hari kemarin menghabiskan terlalu banyak waktu hari ini.",
  "Masa depan dimiliki oleh mereka yang percaya pada keindahan mimpi-mimpi mereka.",
  "Satu-satunya batasan untuk meraih mimpi kita adalah keragu-raguan kita hari ini.",
  "Jatuh tujuh kali, bangkit delapan kali. Pantang menyerah sebelum tujuan tercapai.",
  "Ketika kamu merasa ingin menyerah, ingatlah kembali alasan mengapa kamu memulainya.",
  "Fokuslah pada kemajuan, sekecil apapun itu, bukan pada kesempurnaan.",
  "Keberanian bukanlah ketiadaan rasa takut, melainkan kemampuan untuk terus melangkah meski takut.",
  "Kerja keras mengalahkan bakat ketika bakat tidak mau bekerja keras.",
  "Impian besar tidak pernah terwujud dari zona nyaman yang sempit.",
  "Setiap ahli dulunya adalah seorang pemula yang tidak pernah berhenti berlatih.",
  "Batu karang yang kokoh terbentuk dari deburan ombak yang tak henti-hentinya.",
  "Jangan takut berjalan lambat, takutlah jika kamu hanya berdiam diri.",
  "Waktu terbaik untuk menanam pohon adalah 20 tahun yang lalu. Waktu terbaik kedua adalah sekarang.",
  "Kesuksesan berawal dari langkah pertama yang berani dan konsistensi yang terjaga.",
  "Kegagalan hanyalah kesempatan untuk memulai lagi dengan lebih cerdas.",
  "Tantangan adalah apa yang membuat hidup menarik, dan mengatasinya adalah apa yang membuat hidup bermakna.",
  "Masa sulit tidak bertahan selamanya, tetapi orang yang tangguh akan selalu bertahan.",
  "Percayalah pada prosesmu; mutiara berharga butuh waktu dan tekanan untuk tercipta indah."
 ],
 "bacot": [
  "Kamu suka kopi nggak? Aku sih suka. Tau kenapa alesannya? Kopi itu ibarat kamu, pahit sih tapi bikin candu jadi pingin terus.",
  "Gajian itu kayak mantan ya? Bisanya cuman lewat sebentar saja.",
  "Kata pak haji, cowok yang gak sholat jumat disuruh pake rok mini aja.",
  "Boro-boro mau beli masa depan, beli seblak aja masih mikir nambah ceker apa nggak.",
  "Muka lo kayak uang kembalian permen, ga diharapkan tapi tetep diterima.",
  "Jangan kepedean disapa ramah, kang parkir juga ramah ke semua orang.",
  "Lo itu ibarat sinyal di pelosok, kadang hilang kadang bikin emosi.",
  "Kalau ngomong jangan tinggi-tinggi, nanti ketabrak pesawat garuda.",
  "Gue kira lo tulus, ternyata lo cuma modus biar dapet tebengan gratis.",
  "Duit tinggal goceng, gaya selangit kayak sultan minyak dari Dubai.",
  "Jangan bangga dibilang manis, gula aren juga manis tapi bikin semutan.",
  "Kamera sekarang makin canggih, sayang nggak bisa dipake buat scan otak lo.",
  "Kalo gak suka ya bilang depan muka, jangan ngomong di belakang kayak knalpot bocor.",
  "Pacaran kok kayak kredit motor, kalo gak dibayar ditarik dealer.",
  "Tampang pas-pasan, selera selangit, maunya jalan-jalan ke Mars gratis.",
  "Jangan suka ngumbar janji, janji itu hutang, mending lunasin hutang kopi lo dulu.",
  "Hidup lo kebanyakan drama, pantesan ratingnya anjlok di mata orang.",
  "Gak usah sok keras, kena gerimis dikit aja langsung bikin status galau.",
  "Omonganmu kayak wifi gratisan, gampang nyambung tapi lemot dan banyak gangguan.",
  "Sahabat itu saling bantu, bukan pas butuh baru nyari kayak nyari sinyal di goa.",
  "Gak usah sok sibuk, dichat balesnya tiga abad kemudian kayak prasasti kuno.",
  "Otak lo jangan disimpen terus buat museum, dipake sesekali biar gak karatan.",
  "Cinta itu buta, tapi untung tetangga lo gak buta liat kelakuan lo.",
  "Penampilan boleh keren, tapi saldo rekening jangan kayak nilai ulangan fisika.",
  "Muka dua aja sombong, kalau mau beli bedak kan bayarnya dobel.",
  "Janji manis lo itu kayak sirup basi, manis diawal tapi bikin mules di akhir.",
  "Gaya lo udah kayak CEO ternama, giliran patungan makan langsung pura-pura ke toilet.",
  "Sok jual mahal, padahal kalo diskon 90% juga gak ada yang mau nawar.",
  "Kalau gak bisa bikin bangga, minimal jangan bikin polusi emosi orang lain."
 ],
 "heker": [
  "Dear kamu yang tertulis di halaman defacementku, Kapan jadi pacarku?",
  "y yg setiap saat bisa mendinginkan ku.",
  "Gak usah nyari celah xss deh, karena ketika kamu ngeklik hatiku udah muncul pop up namamu.",
  "berharap setelah aku berhasil login di hati kamu ga akan ada tombol logout, dan sessionku ga bakal pernah expired.",
  "Masa aku harus pake teknik symlink bypass buat buka-buka folder hatimu yg open_basedir enabled.",
  "Diriku dan Dirimu itu ibarat PHP dan MySQL yang belum terkoneksi.",
  "Jangan cuma bisa inject hatinya, tapi harus bisa patchnya juga. Biar tidak selingkuh sama hacker lain.",
  "Aku memang programmer PHP, tapi aku nggak akan php-in kamu kok.",
  "Eneeeng. | Apache? | Km wanita yg paling Unix yg pernah aku kenal.",
  "Sayang, capslock kamu nyala ya? | ngga, kenapa emangnya? | soalnya nama kamu ketulis gede bgt di hati aku.",
  "Aku deketin kamu cuma untuk redirect ke hati temenmu.",
  "Domain aja bisa parkir, masa cintaku ga bisa parkir dihatimu?",
  "Aku boleh jadi pacarmu? | 400 (Bad Request) | Aku cium boleh? | 401 (Authorization Required).",
  "kamu tau ga bedanya kamu sama sintax PHP, kalo sintax PHP itu susah dihafalin kalo kamu itu susah dilupain.",
  "Menjaring hatimu lewat komputerku adalah keahlian utamaku.",
  "Jika cinta itu Array, maka cintaku padamu tak pernah empty jika di unset().",
  "SQLI ( Structured Query Love Injection ) sedang berjalan di hatimu.",
  "aku ingin kamu rm -rf kan semua mantan di otak mu, akulah root hati kamu.",
  "Senyumu bagaikan cooler yang menyejukan hatiku ketika sedang overclock.",
  "kamu adalah terminalku, dimana aku menghabiskan waktuku untuk mengetikan beribu baris kode cinta untukmu.",
  "hatiku ibarat vps hanya untukmu saja bukan shared hosting yg bisa tumpuk berbagai domain cinta.",
  "Jangan men-dualboot-kan hatiku kepadamu.",
  "cintaku kan ku Ctrl+A lalu kan ku Ctrl+C dan kan ku Ctrl+V tepat di folder system hatimu.",
  "Cintamu bagaikan TeamViewer yang selalu mengendalikan hatiku.",
  "cinta kita tak akan bisa dipisahkan walau setebal apapun itu firewall...!!",
  "while (alive) { love(you); } // Infinite loop cinta yang tidak akan pernah berhenti.",
  "final love",
  "Jangan pernah git reset --hard kenangan indah yang sudah pernah kita branch bersama.",
  "Cintaku padamu seperti kernel Linux, selalu open source, stabil, dan siap running 24/7."
 ]
}

export default { CEK, KUTIPAN }
