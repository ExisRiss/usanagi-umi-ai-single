/* By AlzRiss - Usanagi Umi AI */

import axios from 'axios';
import {
    react,
    sendImage,
    trimText
} from '../../lib/awang-anime.js';

const UA = 'Usanagi Umi AI (https://awangofc.my.id)';

const sources = [
    async () => {
        const { data } = await axios.get('https://nekos.best/api/v2/neko?amount=1', {
            timeout: 12000,
            headers: {
                'User-Agent': UA,
                'Accept': 'application/json'
            }
        });
        const item = Array.isArray(data?.results) ? data.results[0] : null;
        if (!item?.url) throw new Error('NO_NEKO');
        return {
            url: item.url,
            name: item.artist_name || 'NekosBest',
            source: item.source_url || ''
        };
    },
    async () => {
        const { data } = await axios.get('https://nekos.best/api/v2/waifu?amount=1', {
            timeout: 12000,
            headers: {
                'User-Agent': UA,
                'Accept': 'application/json'
            }
        });
        const item = Array.isArray(data?.results) ? data.results[0] : null;
        if (!item?.url) throw new Error('NO_WAIFU');
        return {
            url: item.url,
            name: item.artist_name || 'NekosBest',
            source: item.source_url || ''
        };
    },
    // Task204: waifu.im DNS MATI — sumber pengganti teruji dari datacenter.
    async () => {
        const { data } = await axios.get('https://my.izuka-api.xyz/api/anime/top-anime', {
            timeout: 12000,
            headers: {
                'User-Agent': UA,
                'Accept': 'application/json'
            }
        });
        const list = data?.result?.result || data?.result || [];
        if (!Array.isArray(list) || !list.length) throw new Error('NO_IZUKA');
        const item = list[Math.floor(Math.random() * list.length)];
        if (!item?.image) throw new Error('NO_IZUKA_IMG');
        return {
            url: item.image,
            name: item.name || 'Izuka Anime',
            source: item.url || ''
        };
    },
    // Task204: cadangan terakhir — daftar karakter Blue Archive (dotgg, 200 OK).
    async () => {
        const { data } = await axios.get('https://api.dotgg.gg/bluearchive/characters', {
            timeout: 12000,
            headers: {
                'User-Agent': UA,
                'Accept': 'application/json'
            }
        });
        if (!Array.isArray(data) || !data.length) throw new Error('NO_DOTGG');
        const item = data[Math.floor(Math.random() * data.length)];
        if (!item?.img) throw new Error('NO_DOTGG_IMG');
        const base = 'https://api.dotgg.gg/';
        return {
            url: base + String(item.img).replace(/^\//, ''),
            name: item.name || 'Blue Archive',
            source: ''
        };
    }
];

const handler = async function (m, { conn } = {}) {
    m.conn = conn || m.conn;
    await react(m, '⏳');
    try {
        let result = null;
        for (const source of sources) {
            try {
                result = await source();
                if (result?.url) break;
            } catch {}
        }
        if (!result?.url) throw new Error('EMPTY');
        const caption = `╭─〔 ANIME IMAGE 〕
│ Source : ${trimText(result.name, 56)}
${result.source ? `│ Source URL : ${trimText(result.source, 88)}\n` : ''}╰──────────────`;
        await sendImage(m, result.url, caption);
        await react(m, '✅');
    } catch {
        await react(m, '❌');
        await m.reply('Gambar anime belum tersedia saat ini. Coba lagi sebentar.');
    }
};

handler.command = /^animeimage$/i;
handler.help = ['animeimage'];
handler.tags = ['anime'];

export default handler
