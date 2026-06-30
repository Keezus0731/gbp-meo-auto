# gbp-meo-auto

GBP（Googleビジネスプロフィール）5会場へ、**毎週月・木 10:00（JST）**に最新情報投稿を自動投稿する設定駆動マルチ会場システム。
主トリガーは外部スケジューラ cron-job.org（GitHub内蔵cronは不安定なため）。GitHub内蔵cronは保険として併用、二重投稿は post.js のガードで防止。

## 対象会場（venues.json）
プリムローズ岡山 / ヴェルジェくらしき / ノートルダム横浜みなとみらい / アモーレヴォレ サンマルコ / アンジェリカノートルダム
（すべて FIVESTAR WEDDING・同一GBPアカウント accounts/100251145736403740058）

## 構成
- `venues.json` … 会場ごとの {名前・ロケーションID・CTA(top/fair)}
- `bank/<key>.json` … 会場別MEO投稿バンク（被り防止：使い切るまで重複なし）
- `history/<key>.json` … 会場別の投稿履歴（毎回参照→投稿後に自動コミット）
- `images/<key>/<theme>/` … 会場別・テーマ別の写真（IMAGE_BASE_URL設定時に投稿へ自動添付）
- `post.js` … 全会場ループ。各会場1本ずつ投稿（CTAは投稿type=top→TOP, fair→フェアで自動切替）
- `.github/workflows/post.yml` … 保険cron＋手動実行。履歴をコミット

## 認証（GitHub Actions Secrets）
GBP_CLIENT_ID / GBP_CLIENT_SECRET / GBP_REFRESH_TOKEN（全会場共通）

## 運用
- バンク補充：`bank/<key>.json` に追記。
- 画像：`images/<key>/<theme>/` に配置し、リポジトリ Variables に `IMAGE_BASE_URL` を設定（raw配信のため公開リポジトリ化が必要）。
- 手動実行：Actions → Run workflow。
