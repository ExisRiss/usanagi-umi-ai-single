import {getAfk,removeAfk,persistAfk,formatAfkDuration,normalizeAfkJid} from '../core/awang-afk.js'
import {isOwnOutboundEcho} from './command-response.js'
import {botMessageVerdict} from './bot-filter.js'
const checked=new WeakSet(),seen=new WeakMap()
/* Task178 — anti-spam sesama bot (keluhan owner:5 bot di grup sama semuanya
 * menjawab satu trigger AFK). Dua lapis:
 *   1. botMessageVerdict — pesan dari bot (nomor bot sendiri/sesi jadibot,
 *      daftar pantau .setbotfilter, id Baileys, tipe pesan API) DIABAIKAN:
 *      bot tidak "negur" atau membalas sesama bot.
 *   2. catatUlang — jendela 10 menit per (chat,target): setelah SATU sesi bot
 *      mengirim notif AFK untuk target, sesi lain di proses yang sama
 *      (bot utama + semua jadibot) TIDAK mengulang. Ditandai sebelum
 *      sendMessage supaya tidak kalah balapan antar sesi. */
const notified=new Map(),AFK_COOLDOWN_MS=10*60000
function catatUlang(key){
 const now=Date.now(),last=notified.get(key)
 if(last&&now-last<AFK_COOLDOWN_MS)return false
 notified.set(key,now)
 if(notified.size>4096)for(const[k,at]of notified){if(at<now-AFK_COOLDOWN_MS)notified.delete(k);else break}
 return true
}
const AFK_COMMANDS=new Set(['afk','away','brb','usanagi-afk','usanagi-away','usanagi-brb','umi-afk','umi-group-afk','umi-away','umi-brb'])
const CONTROL=new Set(['protocolMessage','reactionMessage','senderKeyDistributionMessage','messageContextInfo','pollUpdateMessage'])
export function isAfkCommand(text,prefix){const body=String(text||'').trim(),p=String(prefix||'');return Boolean(p&&body.startsWith(p)&&AFK_COMMANDS.has(body.slice(p.length).trim().split(/\s/)[0].toLowerCase()))}
function fresh(m,conn,type){
 if(!m||!normalizeAfkJid(m.sender)||!m.message||m.isBaileys||isOwnOutboundEcho(conn,m)||/broadcast|newsletter/.test(String(m.chat||'')))return false
 if(type&&type!=='notify')return false
 if(CONTROL.has(m.mtype))return false
 return Object.keys(m.message).some(key=>!CONTROL.has(key))
}
function duplicate(m,conn){
 if(checked.has(m))return true
 checked.add(m)
 const id=m.key?.id||m.id;if(!id||!conn)return false
 let rows=seen.get(conn);if(!rows){rows=new Map();seen.set(conn,rows)}
 const key=[m.chat,m.sender,id].join(':'),now=Date.now(),previous=rows.get(key)
 if(previous&&previous>now-600000)return true
 rows.set(key,now)
 for(const [k,at]of rows){if(at<now-600000||rows.size>2048)rows.delete(k);else break}
 return false
}
export async function handleAfkMessage(m,conn,{prefix='/',aliases=[],type,notify=true}={}){
 if(!fresh(m,conn,type)||duplicate(m,conn))return false
 // Re-setting AFK must not announce a return, including imported/namespaced aliases.
 if(isAfkCommand(m.text,prefix))return false
 // Task178 — abaikan pesan dari sesama bot (termasuk notif AFK bot lain yang
 // menandai user AFK) supaya tidak saling membalas/spam di grup.
 const verdict=botMessageVerdict(m,conn,conn?.botConfig)
 if(verdict.skip)return false
 const notices=[],mentions=[],own=getAfk(m.sender,aliases)
 const rawTime=m.messageTimestamp?.toNumber?m.messageTimestamp.toNumber():Number(m.messageTimestamp)
 const stale=Number.isFinite(rawTime)&&rawTime>0&&rawTime*1000+1000<Number(own?.since||0)
 if(own&&!stale){
  // Clear synchronously BEFORE any await/send; concurrent messages and send failures cannot resurrect AFK.
  removeAfk(m.sender,aliases)
  try{await persistAfk()}catch{console.error('[AFK] persistence failed')}
  // Task178 — sapaan "sudah kembali" juga dikali 10 menit (cegah5 bot menyapa sekaligus).
  if(catatUlang(`back:${m.chat}|${own.key}`)){
   notices.push(`👋 @${m.sender.split('@')[0]} sudah kembali. AFK berakhir.\nDurasi AFK: ${formatAfkDuration(Date.now()-own.since)}`);mentions.push(m.sender)
  }
 }
 if(!notify)return false
 const selfKeys=new Set([m.sender,...aliases].map(normalizeAfkJid)),targets=[...new Set([...(m.mentionedJid||[]),m.quoted?.sender].map(normalizeAfkJid).filter(Boolean))]
 const delivered=new Set()
 for(const jid of targets.slice(0,20)){
  if(selfKeys.has(jid))continue
  const entry=getAfk(jid);if(!entry)continue
  // Shared aliases return the same status; warn once per record, not once per spelling.
  const identity=entry.key
  if(delivered.has(identity))continue
  // Task178 — satu notif per (chat,target) tiap 10 menit lintas-sesi.
  if(!catatUlang(`afk:${m.chat}|${identity}`))continue
  delivered.add(identity)
  notices.push(`💤 @${jid.split('@')[0]} sedang AFK.\nAlasan: ${entry.reason||'Tidak ada alasan'}\nSelama ${formatAfkDuration(Date.now()-entry.since)}`);mentions.push(jid)
 }
 if(notices.length){try{await conn.sendMessage(m.chat,{text:notices.join('\n\n'),mentions},{quoted:m.raw||m})}catch{console.error('[AFK] notification failed')}}
 return false
}
