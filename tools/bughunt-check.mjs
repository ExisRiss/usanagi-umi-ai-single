#!/usr/bin/env node
/**
 * BUGHUNT — pemindai bug statis tambahan utk repo umi (Task203).
 * Berjalan bersama `npm run bughunt` (eslint --quiet duluan):
 *  1. node --check tiap file .js (sintaks rusak).
 *  2. deteksi pola berbahaya:
 *     - `if (x = y)` (assignment sbg kondisi, tanpa &/&=).
 *     - require/import dinamis dari string interpolasi.
 *     - `process.exit` di dalam handler request.
 *  3. ringkasan ke stdout; exit1 kalau ada temuan sintaks.
 */
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const SKIP = new Set(['node_modules', '.git', 'bin', 'dist', 'build', '.next', '__pycache__'])
const files = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const full = path.join(dir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) walk(full)
    else if (name.endsWith('.js') || name.endsWith('.mjs')) files.push(full)
  }
}
walk(process.cwd())

let gagal = 0
// 1) sintaks
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' })
  } catch (e) {
    gagal++
    console.error(`[SINTAKS] ${path.relative(process.cwd(), f)}: ${(e.stderr || '').toString().split('\n')[0].slice(0, 160)}`)
  }
}

// 2) pola berbahaya
const pola = [
  { re: /\bif\s*\(\s*[A-Za-z_$][\w.$[\]'"]*\s*=\s*[^=<>!]/g, nama: 'assignment-dalam-kondisi-if' },
  { re: /\b(?:require|import)\s*\(\s*[`'"]?\s*\$\{/g, nama: 'import-dinamis-interpolasi' },
  { re: /process\.exit\s*\(/g, nama: 'process-exit' },
]
let temuan = 0
for (const f of files) {
  const rel = path.relative(process.cwd(), f)
  if (rel.startsWith('tools/bughunt')) continue
  let txt
  try { txt = readFileSync(f, 'utf8') } catch { continue }
  const baris = txt.split('\n')
  for (const { re, nama } of pola) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(txt)) !== null) {
      // hitung baris
      const sebelum = txt.slice(0, m.index).split('\n').length
      const konteks = (baris[sebelum - 1] || '').trim()
      if (konteks.startsWith('//') || konteks.startsWith('*') || konteks.startsWith('/*')) continue
      if (nama === 'process-exit' && rel.startsWith('scripts/')) continue
      temuan++
      console.log(`[POLA ${nama}] ${rel}:${sebelum} ${konteks.slice(0, 100)}`)
    }
  }
}

console.log(`bughunt: ${files.length} file | sintaks gagal: ${gagal} | pola berbahaya: ${temuan}`)
process.exit(gagal > 0 ? 1 : 0)
