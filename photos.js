// photos.js — 毎月1回、photo-venues.json の各式場へ写真を perRun 枚ずつ追加する（GBPの「写真」タブ用）。
// 投稿（localPosts）とは別。店側の写真が古いままだと鮮度が落ちるので、手元の最適化済み写真を順に出す。
// 二重実行防止：同じJSTの年月に追加済みの式場はスキップ。1式場の失敗は他に波及させない。
// 版権期限付き（ファイル名に exp<YYYYMMDD>）の写真は使わない。fair・access のテーマも使わない（文字入りバナーや地図があるため）。
import { OAuth2Client } from 'google-auth-library';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const cfg = readJson(path.join(DIR, 'photo-venues.json'));
const { GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN } = process.env;
if (!GBP_CLIENT_ID || !GBP_CLIENT_SECRET || !GBP_REFRESH_TOKEN) { console.error('❌ 認証情報が不足しています。'); process.exit(1); }
const client = new OAuth2Client(GBP_CLIENT_ID, GBP_CLIENT_SECRET);
client.setCredentials({ refresh_token: GBP_REFRESH_TOKEN });
const monthJST = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);
const CATEGORY = { chapel: 'INTERIOR' }; // FOOD_AND_DRINK は結婚式場では使えない（400）ので料理は ADDITIONAL
const ONLY = process.argv[2] || null; // テスト用：式場キーを1つ指定

function listFiles(v) {
  let files = v.files || [];
  if (!files.length) {
    const root = path.join(DIR, 'images', v.key);
    for (const t of cfg.themes) {
      const d = path.join(root, t);
      if (fs.existsSync(d)) files.push(...fs.readdirSync(d).filter((f) => /\.(jpe?g|png)$/i.test(f)).map((f) => `${t}/${f}`));
    }
  }
  return files.filter((f) => cfg.themes.includes(f.split('/')[0]) && !/exp\d{8}/.test(f)).sort();
}

function pick(files, used, n) {
  let rest = files.filter((f) => !used.has(f));
  if (rest.length < n) { used.clear(); rest = files.slice(); } // 一巡したら最初から
  const byTheme = {};
  for (const f of rest) (byTheme[f.split('/')[0]] ||= []).push(f);
  const themes = Object.keys(byTheme);
  const out = [];
  for (let i = 0; out.length < n && themes.length; i++) {
    const t = themes[i % themes.length];
    if (byTheme[t].length) out.push(byTheme[t].shift());
    if (i > 1000) break;
  }
  return out;
}

let fail = 0;
for (const v of cfg.venues) {
  if (ONLY && v.key !== ONLY) continue;
  const hp = path.join(DIR, 'photo-history', `${v.key}.json`);
  const hist = fs.existsSync(hp) ? readJson(hp) : [];
  if (hist.some((h) => h.month === monthJST)) { console.log(`⏭ ${v.name}: ${monthJST} は追加済み`); continue; }
  const used = new Set(hist.map((h) => h.file));
  const chosen = pick(listFiles(v), used, cfg.perRun);
  for (const f of chosen) {
    const [theme, name] = f.split('/');
    const sourceUrl = `${v.imageBase}/${theme}/${encodeURIComponent(name)}`;
    try {
      const { token } = await client.getAccessToken();
      const res = await fetch(`https://mybusiness.googleapis.com/v4/${v.locationParent}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaFormat: 'PHOTO', locationAssociation: { category: CATEGORY[theme] || 'ADDITIONAL' }, sourceUrl }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body).slice(0, 300)}`);
      hist.push({ month: monthJST, file: f, media: body.name || '', at: new Date().toISOString() });
      console.log(`✅ ${v.name}: ${f}`);
    } catch (e) { fail++; console.error(`❌ ${v.name}: ${f} ${e.message}`); }
  }
  fs.mkdirSync(path.dirname(hp), { recursive: true });
  fs.writeFileSync(hp, JSON.stringify(hist, null, 2) + '\n');
}
if (fail) process.exit(1);
