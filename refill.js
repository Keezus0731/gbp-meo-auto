// refill.js — バンクの残りが少なくなった会場に、テンプレート×事実データから投稿を自動生成して補充する。
// 対象：refill/<key>.templates.js と refill/<key>.facts.json がある会場のみ（現状 mirabell）。
// 発火条件：未投稿（scheduled が未来 or 未使用）が MIN_REMAIN 本未満 → ADD_COUNT 本を月木の日付で追加。
// 生成ルール：
//   - 直近 RECENT_WINDOW 本で使ったテンプレは避ける（同じ話題の連続を防ぐ）
//   - プラン系は「今日から見て挙式時期が先のもの」だけ使う（過ぎたプランを案内しない）
//   - 月ごとの季節の一言（facts.seasons）を冒頭に入れる
//   - 生成した投稿は id に "auto-" を付けて人手作成と区別。post.js は区別せず scheduled 順に投稿する
// 実行：node refill.js（DRY_RUN=1 で書き込みなし）。post.yml の投稿ステップの前に実行される。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const cfg = readJson(path.join(DIR, 'venues.json'));

const MIN_REMAIN = Number(process.env.REFILL_MIN_REMAIN || 4);   // 残りがこれ未満で補充
const ADD_COUNT = Number(process.env.REFILL_ADD_COUNT || 8);     // 一度に足す本数（月木×4週）
const RECENT_WINDOW = 6;

const jstDate = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
const todayJST = jstDate(Date.now());

// 直近の月・木の日付を、start より後から n 個列挙
function nextMonThu(startISO, n) {
  const out = [];
  const d = new Date(startISO + 'T00:00:00Z');
  while (out.length < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay(); // 0=Sun
    if (dow === 1 || dow === 4) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// プランの「挙式時期」が今日より先か（ざっくり年月で判定。判定できないものは常に可）
function planStillOpen(p, today) {
  const m = p.for.match(/(\d{4})年(\d{1,2})月(?:・(\d{1,2})月)?/);
  if (!m) return true;
  const y = m[1], mon = String(m[3] || m[2]).padStart(2, '0');
  return `${y}-${mon}-31` >= today;
}

async function refillVenue(v) {
  const tplPath = path.join(DIR, 'refill', `${v.key}.templates.js`);
  const factsPath = path.join(DIR, 'refill', `${v.key}.facts.json`);
  if (!fs.existsSync(tplPath) || !fs.existsSync(factsPath)) return;
  const { templates } = await import(pathToFileURL(tplPath).href);
  const facts = readJson(factsPath);
  const bankPath = path.join(DIR, 'bank', `${v.key}.json`);
  const histPath = path.join(DIR, 'history', `${v.key}.json`);
  const bank = fs.existsSync(bankPath) ? readJson(bankPath) : [];
  const history = fs.existsSync(histPath) ? readJson(histPath) : [];
  const used = new Set(history.map((h) => h.id));

  const remaining = bank.filter((p) => !used.has(p.id));
  console.log(`[${v.key}] 未投稿 ${remaining.length} 本（しきい値 ${MIN_REMAIN}）`);
  if (remaining.length >= MIN_REMAIN) return;

  // 最終予定日（無ければ今日）から次の月木を ADD_COUNT 個
  const lastScheduled = bank.map((p) => p.scheduled || '').sort().pop() || todayJST;
  const start = lastScheduled > todayJST ? lastScheduled : todayJST;
  const dates = nextMonThu(start, ADD_COUNT);

  // 直近に使ったテンプレを避けるための履歴（bank の末尾 + history）
  const recentKeys = [...bank.slice(-RECENT_WINDOW).map((p) => p.tpl), ...history.slice(-RECENT_WINDOW).map((h) => h.tpl)].filter(Boolean);
  const openPlans = facts.plans.filter((p) => planStillOpen(p, todayJST));
  let planIdx = bank.filter((p) => p.tpl === 'plan-season').length; // 既出プラン数でローテ位置を決める

  const added = [];
  let ti = bank.length; // テンプレのローテ開始位置
  for (const date of dates) {
    // テンプレをローテーションで選ぶ。直近と被るものは飛ばす（全部被ったら諦めて採用）
    let chosen = null;
    for (let tries = 0; tries < templates.length; tries++) {
      const t = templates[(ti + tries) % templates.length];
      const lastUse = added.slice(-RECENT_WINDOW).map((a) => a.tpl).concat(recentKeys.slice(-3));
      if (!lastUse.includes(t.key)) { chosen = t; ti = ti + tries + 1; break; }
    }
    if (!chosen) { chosen = templates[ti % templates.length]; ti++; }

    const month = String(Number(date.slice(5, 7)));
    const season = facts.seasons[month] || { line: '' };
    const ctx = { seed: date };
    if (chosen.key === 'plan-season') {
      if (!openPlans.length) { ti++; continue; }
      ctx.plan = openPlans[planIdx % openPlans.length]; planIdx++;
    }
    const built = chosen.build(facts, season, ctx);
    const id = `auto-${date.replace(/-/g, '')}-${chosen.key}${ctx.plan ? '-' + ctx.plan.key : ''}`;
    if (bank.some((p) => p.id === id)) continue;
    added.push({ id, type: chosen.type, theme: chosen.theme, scheduled: date, tpl: chosen.key, title: built.title, body: built.body.trim() });
  }

  if (!added.length) { console.log(`[${v.key}] 追加なし`); return; }
  for (const a of added) console.log(`  + ${a.scheduled} ${a.id}  ${a.title}`);
  if (process.env.DRY_RUN) { console.log(`[${v.key}] 🧪DRY_RUN のため書き込みなし`); return; }
  fs.writeFileSync(bankPath, JSON.stringify([...bank, ...added], null, 1) + '\n');
  console.log(`[${v.key}] ✅ ${added.length} 本を補充（バンク合計 ${bank.length + added.length}）`);
}

for (const v of cfg.venues.filter((v) => v.enabled !== false)) {
  try { await refillVenue(v); } catch (e) { console.error(`[${v.key}] ❌ 補充失敗: ${e.message}`); }
}
