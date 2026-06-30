// post.js — 月木に、venues.json の全会場へ1本ずつMEO投稿を自動投稿する（設定駆動マルチ会場）。
// 認証はGitHub Actions Secretsの環境変数:
//   GBP_CLIENT_ID / GBP_CLIENT_SECRET / GBP_REFRESH_TOKEN（全会場同一アカウントの共通トークン）
// 画像は IMAGE_BASE_URL が設定され images/<key>/<theme>/ に画像があれば付与。なければテキストのみ。
// 二重投稿防止：会場ごとに「同一JST日付の投稿が既にあればスキップ」。1会場の失敗は他会場に波及させない。
import { OAuth2Client } from 'google-auth-library';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const cfg = readJson(path.join(DIR, 'venues.json'));

const { GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN } = process.env;
if (!GBP_CLIENT_ID || !GBP_CLIENT_SECRET || !GBP_REFRESH_TOKEN) {
  console.error('❌ 認証情報(GBP_CLIENT_ID / GBP_CLIENT_SECRET / GBP_REFRESH_TOKEN)が不足しています。');
  process.exit(1);
}
const client = new OAuth2Client(GBP_CLIENT_ID, GBP_CLIENT_SECRET);
client.setCredentials({ refresh_token: GBP_REFRESH_TOKEN });

const jstDate = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
const todayJST = jstDate(Date.now());

function pickImageUrl(key, theme, history) {
  const base = process.env.IMAGE_BASE_URL;
  if (!base) return null;
  const dir = path.join(DIR, 'images', key, theme);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  if (!files.length) return null;
  const lastImg = history.length ? history[history.length - 1].image : null;
  const cands = files.length > 1 && lastImg ? files.filter((f) => `${theme}/${f}` !== lastImg) : files;
  const chosen = cands[Math.floor(((history.length * 2654435761) >>> 0) % cands.length)];
  return { rel: `${theme}/${chosen}`, url: `${base.replace(/\/$/, '')}/images/${key}/${theme}/${encodeURIComponent(chosen)}` };
}

async function postForVenue(v) {
  const bankPath = path.join(DIR, 'bank', `${v.key}.json`);
  const histPath = path.join(DIR, 'history', `${v.key}.json`);
  if (!fs.existsSync(bankPath)) { console.warn(`[${v.key}] bankが無いためスキップ`); return; }
  const bank = readJson(bankPath);
  const history = fs.existsSync(histPath) ? readJson(histPath) : [];

  if (history.some((h) => jstDate(new Date(h.postedAt).getTime()) === todayJST)) {
    console.log(`[${v.key}] 本日(${todayJST})は投稿済み → スキップ`);
    return;
  }

  const used = new Set(history.map((h) => h.id));
  let pick = bank.find((p) => !used.has(p.id));
  let recycled = false;
  if (!pick) {
    recycled = true;
    const last = {};
    for (const h of history) last[h.id] = h.postedAt;
    pick = [...bank].sort((a, b) => (last[a.id] || '').localeCompare(last[b.id] || ''))[0];
    console.warn(`[${v.key}] ⚠️ バンクを使い切り。最古ネタを再利用。補充推奨。`);
  }

  const img = pickImageUrl(v.key, pick.theme, history);
  const summary = `${pick.title}\n\n${pick.body}`.slice(0, 1490);
  const ctaUrl = pick.type === 'fair' ? v.cta.fair : v.cta.top;
  const post = {
    languageCode: cfg.languageCode || 'ja',
    summary,
    topicType: 'STANDARD',
    callToAction: { actionType: 'LEARN_MORE', url: ctaUrl },
  };
  if (img) post.media = [{ mediaFormat: 'PHOTO', sourceUrl: img.url }];

  const { token } = await client.getAccessToken();
  const url = `https://mybusiness.googleapis.com/v4/${v.locationParent}/localPosts`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(post),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);

  history.push({ id: pick.id, postedAt: new Date().toISOString(), theme: pick.theme, type: pick.type, image: img ? img.rel : null, recycled });
  fs.writeFileSync(histPath, JSON.stringify(history, null, 2) + '\n');
  const remaining = bank.length - new Set(history.map((h) => h.id)).size;
  console.log(`[${v.key}] ✅ 投稿成功 [${pick.id}] 画像=${img ? img.rel : 'なし'} 残=${remaining}/${bank.length}`);
}

let ok = 0, fail = 0, skip = 0;
for (const v of cfg.venues) {
  try {
    const before = process.exitCode;
    await postForVenue(v);
    ok++;
  } catch (e) {
    fail++;
    console.error(`[${v.key}] ❌ 失敗: ${e.message}`);
  }
}
console.log(`\n=== 完了: 成功${ok} / 失敗${fail}（会場数${cfg.venues.length}）===`);
if (fail > 0) process.exit(1);
