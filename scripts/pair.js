#!/usr/bin/env node
/**
 * Pasang nomor WhatsApp untuk mode single — tanpa API, tanpa website.
 *
 *   npm run pair 628123456789
 *
 * Skrip ini:
 *   1. minta kode pairing ke WhatsApp,
 *   2. mencetak kodenya di terminal,
 *   3. menyimpan sesi ke `sessions/jadibot/<nomor>/` setelah kode diketik,
 *   4. menambahkan nomor itu ke `config/users.json` supaya bot menyalakannya
 *      pada `npm start` berikutnya.
 *
 * Yang diketik di HP: WhatsApp > Perangkat tertaut > Tautkan perangkat >
 * Tautkan dengan nomor telepon → masukkan kode dari terminal.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  makeWASocket,
  useMultiFileAuthState,
  Browsers,
  DisconnectReason,
} from '@rexxhayanasi/elaina-baileys'
import { normalizeUserNumber, readSingleUsers, writeSingleUsers } from '../config/single-mode.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SESSIONS_DIR = path.join(ROOT, 'sessions', 'jadibot')

const raw = process.argv[2]
const number = normalizeUserNumber(raw)

if (!number) {
  console.error('Cara pakai:  npm run pair 628123456789')
  process.exit(1)
}
if (number.length < 8 || number.length > 15) {
  console.error(`Nomor "${raw}" tidak valid. Pakai format kode negara tanpa +, contoh 628123456789.`)
  process.exit(1)
}

const sessionPath = path.join(SESSIONS_DIR, number)
const alreadyPaired = fs.existsSync(path.join(sessionPath, 'creds.json'))

if (alreadyPaired) {
  const { numbers } = readSingleUsers()
  if (!numbers.includes(number)) {
    writeSingleUsers([...numbers, number])
    console.log(`[PAIR] ${number} sudah punya sesi. Nomor ditambahkan ke config/users.json.`)
  } else {
    console.log(`[PAIR] ${number} sudah punya sesi dan sudah terdaftar di config/users.json.`)
  }
  console.log('[PAIR] Tinggal jalankan: npm start')
  process.exit(0)
}

const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
const sock = makeWASocket({
  auth: state,
  printQRInTerminal: false,
  browser: Browsers.ubuntu('Chrome'),
  syncFullHistory: false,
  generateHighQualityLinkPreview: false,
})

sock.ev.on('creds.update', saveCreds)

let codeShown = false
const timeout = setTimeout(() => {
  console.error('[PAIR] Tidak ada jawaban dari WhatsApp dalam 3 menit. Jalankan ulang perintahnya.')
  process.exit(1)
}, 180000)

let codeRequested = false

sock.ev.on('connection.update', async update => {
  const { connection, lastDisconnect } = update

  // requestPairingCode hanya boleh dipanggil setelah socket benar-benar
  // tersambung ke server WhatsApp; kalau dipanggil langsung setelah
  // makeWASocket, Baileys membalas "Connection Closed".
  if (!codeRequested && !sock.authState.creds.registered && (connection === 'connecting' || update.qr)) {
    codeRequested = true
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(number)
        console.log('')
        console.log('═══════════════════════════════════════════')
        console.log(`  KODE PAIRING ${number}:  ${code}`)
        console.log('  WhatsApp > Perangkat tertaut > Tautkan perangkat')
        console.log('  > Tautkan dengan nomor telepon, lalu ketik kode di atas.')
        console.log('  Menunggu kode dimasukkan (maks 3 menit)...')
        console.log('═══════════════════════════════════════════')
      } catch (error) {
        clearTimeout(timeout)
        const message = String(error?.message || error)
        console.error(
          /bad-request/i.test(message)
            ? '[PAIR] WhatsApp menolak nomor ini (bad-request). Pastikan nomor aktif di WhatsApp dan pakai kode negara, contoh 628123456789.'
            : `[PAIR] Gagal meminta kode: ${message}`,
        )
        process.exit(1)
      }
    }, 3000)
  }

  if (connection === 'open') {
    clearTimeout(timeout)
    const { numbers } = readSingleUsers()
    writeSingleUsers([...numbers, number])
    console.log('')
    console.log('═══════════════════════════════════════════')
    console.log(`  ✅ ${number} TERSAMBUNG & tersimpan`)
    console.log('  Nomor sudah masuk config/users.json.')
    console.log('  Sekarang jalankan: npm start')
    console.log('═══════════════════════════════════════════')
    setTimeout(() => process.exit(0), 1500)
    return
  }

  if (connection === 'close') {
    const statusCode = lastDisconnect?.error?.output?.statusCode
    if (statusCode === DisconnectReason.loggedOut) {
      clearTimeout(timeout)
      console.error('[PAIR] Perangkat ditolak/dilogout oleh WhatsApp. Coba ulang.')
      process.exit(1)
    }
  }
})

// Permintaan kode dijalankan dari listener connection.update di atas.
