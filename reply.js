// reply.js — 自動投稿している全6会場の新着口コミに定型文で自動返信する（マルチ会場）。
// 方針（会場共通）：
//   - 4〜5★               → お礼の定型文で自動返信（positive）
//   - 1〜3★ かつ コメント無し → 中立の定型文で自動返信（neutral）
//   - 1〜3★ かつ コメント有り → 自動返信せず flagged/<key>.json に記録（人が手動対応）
//   - 既に返信済み（reviewReply有）や replied/<key>.json 記録済みはスキップ
// 「新着のみ」モード：導入時点の既存口コミIDは replied/<key>.json にシード済みなので触らない。
// スパム防止のため1会場1回の返信上限（MAX_REPLIES）。1会場の失敗は他会場に波及させない。
import { OAuth2Client } from 'google-auth-library';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const cfg = read(path.join(DIR, 'reply-venues.json'));
const tpl = read(path.join(DIR, 'reply-templates.json'));

const MAX_REPLIES = Number(process.env.MAX_REPLIES || 15); // 1会場あたり1回の返信上限
const STAR = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

const { GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN } = process.env;
if (!GBP_CLIENT_ID || !GBP_CLIENT_SECRET || !GBP_REFRESH_TOKEN) {
  console.error('❌ 認証情報(環境変数)が不足しています。');
  process.exit(1);
}
const client = new OAuth2Client(GBP_CLIENT_ID, GBP_CLIENT_SECRET);
client.setCredentials({ refresh_token: GBP_REFRESH_TOKEN });

async function api(method, url, body) {
  // GBP APIは稀に一時エラー(429/5xx)を返すのでリトライ（指数バックオフ）
  let last;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const { token } = await client.getAccessToken();
    const r = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    if (r.ok) return { ok: true, status: r.status, text };
    last = { ok: false, status: r.status, text };
    if (!(r.status === 429 || r.status >= 500) || attempt === 4) return last;
    await new Promise((res) => setTimeout(res, 2000 * attempt));
  }
  return last;
}

// GBPのレスポンスは本文に生の制御文字が入りJSON.parseが失敗するため空白化してから解析
const CTRL = new RegExp('[\\u0000-\\u001F]', 'g');
const parse = (t) => JSON.parse(t.replace(CTRL, ' '));

// 会場の全口コミを取得（上限なし＝取りこぼしを作らない）。安全弁として20ページ(=1000件)まで。
async function listAllReviews(locationParent) {
  const out = [];
  let pageToken = '';
  let pages = 0;
  do {
    const url = `https://mybusiness.googleapis.com/v4/${locationParent}/reviews?pageSize=50${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const { ok, status, text } = await api('GET', url);
    if (!ok) throw new Error(`reviews.list ${status} ${text.slice(0, 200)}`);
    const d = parse(text);
    (d.reviews || []).forEach((r) => out.push(r));
    pageToken = d.nextPageToken || '';
  } while (pageToken && ++pages < 20);
  return out;
}

const pick = (arr, seed) => arr[Math.abs([...String(seed)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % arr.length];

async function replyForVenue(v) {
  const repliedPath = path.join(DIR, 'replied', `${v.key}.json`);
  const flaggedPath = path.join(DIR, 'flagged', `${v.key}.json`);
  const replied = fs.existsSync(repliedPath) ? read(repliedPath) : [];
  const flagged = fs.existsSync(flaggedPath) ? read(flaggedPath) : [];
  const repliedSet = new Set(replied.map((x) => x.reviewId));

  const reviews = await listAllReviews(v.locationParent);
  reviews.sort((a, b) => (b.createTime || '').localeCompare(a.createTime || '')); // 新しい順

  let replies = 0, flags = 0, skipped = 0;
  for (const rv of reviews) {
    const id = rv.reviewId;
    if (!id || repliedSet.has(id) || rv.reviewReply) { skipped++; continue; }
    const rating = STAR[rv.starRating] || 0;
    const hasComment = !!(rv.comment && rv.comment.trim());

    if (rating <= 3 && hasComment) {
      if (!flagged.find((f) => f.reviewId === id)) {
        flagged.push({ reviewId: id, rating, comment: rv.comment.slice(0, 500), createTime: rv.createTime, reviewer: (rv.reviewer && rv.reviewer.displayName) || '' });
        flags++;
        console.log(`  [要手動] ${v.key} ${rating}star ${(rv.comment || '').slice(0, 36).replace(/\s+/g, ' ')}`);
      }
      continue;
    }

    if (replies >= MAX_REPLIES) continue;

    const bucket = rating >= 4 ? tpl.positive : tpl.neutral;
    const comment = pick(bucket, id).replaceAll('{venue}', v.name);

    if (process.env.DRY_RUN) {
      console.log(`  [DRY ${v.key} ${rating}star ${hasComment ? 'コメ有' : '星のみ'}] ${rating >= 4 ? 'pos' : 'neu'}: ${comment.slice(0, 24)}…`);
      replies++;
      continue;
    }

    const res = await api('PUT', `https://mybusiness.googleapis.com/v4/${v.locationParent}/reviews/${id}/reply`, { comment });
    if (!res.ok) { console.error(`  返信失敗 ${v.key} ${rating}star ${res.status} ${res.text.slice(0, 120)}`); continue; }
    replied.push({ reviewId: id, rating, repliedAt: new Date().toISOString(), template: rating >= 4 ? 'positive' : 'neutral' });
    repliedSet.add(id);
    replies++;
  }

  if (!process.env.DRY_RUN) {
    fs.mkdirSync(path.dirname(repliedPath), { recursive: true });
    fs.mkdirSync(path.dirname(flaggedPath), { recursive: true });
    fs.writeFileSync(repliedPath, JSON.stringify(replied, null, 2) + '\n');
    fs.writeFileSync(flaggedPath, JSON.stringify(flagged, null, 2) + '\n');
  }
  console.log(`[${v.key}] 取得${reviews.length} / 返信${replies} / 要手動${flags} / スキップ${skipped}`);
  return { replies, flags };
}

let totalR = 0, totalF = 0, fail = 0;
for (const v of cfg.venues) {
  try {
    const { replies, flags } = await replyForVenue(v);
    totalR += replies; totalF += flags;
  } catch (e) {
    fail++;
    console.error(`[${v.key}] ❌ 失敗: ${e.message}`);
  }
}
console.log(`\n=== 完了: 自動返信 計${totalR}件 / 要手動 計${totalF}件 / 失敗会場${fail} ===`);
if (totalF > 0) console.log('低評価コメントは flagged/<会場>.json に記録。人が手動で返信してください。');
if (fail > 0) process.exit(1);
