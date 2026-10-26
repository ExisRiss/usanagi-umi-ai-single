/* By AlzRiss - Usanagi Umi AI
 *
 * .cuaca <kota> — cuaca terkini + prakiraan 3 hari.
 * Diadaptasi dari plugin "cuaca" bot VanXone Multi Device. Sumbernya API
 * publik Open-Meteo (tanpa kunci): geocoding + forecast.
 */
const KODE_CUACA = code => {
  if (code === 0) return 'Cerah'
  if (code <= 2) return 'Cerah berawan'
  if (code === 3) return 'Berawan'
  if (code === 45 || code === 48) return 'Berkabut'
  if (code >= 51 && code <= 57) return 'Gerimis'
  if (code >= 61 && code <= 67) return 'Hujan'
  if (code >= 71 && code <= 77) return 'Salju'
  if (code >= 80 && code <= 82) return 'Hujan lebat'
  if (code >= 95) return 'Badai petir'
  return 'Tidak diketahui'
}

async function ambil(url, ms = 12000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { 'User-Agent': 'UsanagiUmi/1.0' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const handler = async (m, { text, usedPrefix, command }) => {
  const kota = String(text || '').trim()
  if (!kota) return m.reply(`Contoh:\n${usedPrefix}${command} Makassar`)

  const geo = await ambil(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(kota)}&count=1&language=id&format=json`)
  const tempat = geo?.results?.[0]
  if (!tempat) return m.reply(`Kota *${kota}* tidak ditemukan. Coba nama lain, mis. "Makassar".`)

  const data = await ambil(
    `https://api.open-meteo.com/v1/forecast?latitude=${tempat.latitude}&longitude=${tempat.longitude}` +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=auto&forecast_days=3'
  )
  const kini = data.current || {}
  const harian = data.daily || {}
  const wilayah = [tempat.name, tempat.admin1, tempat.country].filter(Boolean).join(', ')

  const ramalan = (harian.time || []).map((tanggal, i) => {
    const tgl = new Date(`${tanggal}T00:00:00`)
    const nama = tgl.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })
    const kode = harian.weather_code?.[i]
    const maks = harian.temperature_2m_max?.[i]
    const min = harian.temperature_2m_min?.[i]
    const hujan = harian.precipitation_probability_max?.[i]
    return `• ${nama}: ${KODE_CUACA(kode)} ${Math.round(min)}–${Math.round(maks)}°C${hujan !== null && hujan !== undefined ? ` · hujan ${hujan}%` : ''}`
  }).join('\n')

  return m.reply(
    `🌤️ *CUACA ${wilayah.toUpperCase()}*\n\n` +
    `▬ Kondisi : ${KODE_CUACA(kini.weather_code)}\n` +
    `▬ Suhu    : ${Math.round(kini.temperature_2m ?? 0)}°C (terasa ${Math.round(kini.apparent_temperature ?? 0)}°C)\n` +
    `▬ Lembap  : ${Math.round(kini.relative_humidity_2m ?? 0)}%\n` +
    `▬ Angin   : ${Math.round(kini.wind_speed_10m ?? 0)} km/jam\n\n` +
    `*Prakiraan 3 hari*\n${ramalan}\n\n` +
    `_Sumber: Open-Meteo_`
  )
}

handler.help = ['cuaca <kota>']
handler.tags = ['tools']
handler.command = ['cuaca', 'weather']
handler.description = 'Cuaca terkini dan prakiraan 3 hari untuk sebuah kota (Open-Meteo)'

export default handler
