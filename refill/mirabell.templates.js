// refill/mirabell.templates.js — ネオス・ミラベルのGBP投稿テンプレート（事実データ mirabell.facts.json から本文を組み立てる）
// 方針：公式サイトに載っている事実だけで書く。式場の運用・実績・返信時間・「増えています」等は入れない。
// 各テンプレは { type, theme, title, body } を返す。type は CTA の出し分け（venues.json の cta キー）、theme は画像フォルダ。

export const templates = [
  {
    key: 'chapel-award',
    type: 'chapel', theme: 'chapel',
    build: (f, s, ctx = {}) => ({
      title: `【${pick(f.area, ctx.seed)}の結婚式場】日本の美しいチャペル100選の大聖堂`,
      body: `${s.line}\n「${f.chapel.award.split('（')[0]}」に、山梨県で唯一選ばれたのがネオス・ミラベルの大聖堂「${f.chapel.name}」です。\n${f.chapel.ceiling}、${f.chapel.glass}。ドーム型の天井に輝くアンティークのシャンデリアが、花嫁の姿を照らします。\n${f.chapel.styles.join('、')}に対応しています。ブライダルフェアでは、この大聖堂で模擬挙式を体験できます。`,
    }),
  },
  {
    key: 'cuisine',
    type: 'fair', theme: 'food',
    build: (f, s, ctx = {}) => ({
      title: `【${pick(f.area, ctx.seed)}の結婚式】山梨県産食材のフレンチを無料試食`,
      body: `${s.line}\n山梨県産の食材を使った本格フレンチが、ネオス・ミラベルの披露宴料理です。\n監修は、${f.cuisine.chef}。旬の素材を活かしたコースで、メインは${f.cuisine.main}。\n${f.cuisine.kids}もご用意します。\nブライダルフェアでは、このコースを無料で試食できます（${f.cuisine.tasting.replace('の無料試食', '')}）。`,
    }),
  },
  {
    key: 'dress',
    type: 'fair', theme: 'dress',
    build: (f, s, ctx = {}) => ({
      title: `【${pick(f.area, ctx.seed)}の結婚式場】${f.dress.salon}で試着体験`,
      body: `${s.line}\nネオス・ミラベルには、${f.dress.salon}があります。\n${f.dress.lineup}まで揃っています。${f.dress.disney}もあります。\nブライダルフェアでは試着体験ができます。写真を撮って、ご家族に見せてから決める方もいらっしゃいます。`,
    }),
  },
  {
    key: 'plan-season',
    type: 'plan', theme: 'venue',
    build: (f, s, ctx) => {
      const p = ctx.plan;
      return {
        title: `【${pick(f.area, ctx.seed)}の結婚式】${p.for}の${p.name}`,
        body: `${s.line}\n${p.for}をお考えの方へ。ネオス・ミラベルの${p.name}は、${p.price}。${p.note ? p.note + '。' : ''}\n大聖堂での挙式、貸切邸宅での披露宴、${f.cuisine.main}のフレンチコースはどのプランでも変わりません。\n空き日程はLINEでもお答えしています。`,
      };
    },
  },
  {
    key: 'small',
    type: 'plan', theme: 'small',
    build: (f, s) => {
      const a = f.plans.find((p) => p.key === 'small-meal'), b = f.plans.find((p) => p.key === 'small-party');
      return {
        title: `【${pick(f.area, ctx.seed)}の少人数結婚式】親族だけの挙式とお食事会`,
        body: `${s.line}\n「親族だけで、こぢんまりと結婚式をしたい」。そんなご希望にも、ネオス・ミラベルは対応しています。\n${a.name}は${a.price}から、${b.name}は${b.price}から。\n本格的な大聖堂で挙式をして、その後は貸切の邸宅でゆっくり食事を楽しむ。人数が少ないからこそ、一人ひとりのゲストと話す時間が取れます。\n料理はフルコースと同じシェフが作ります。`,
      };
    },
  },
  {
    key: 'access',
    type: 'access', theme: 'access',
    build: (f, s, ctx = {}) => ({
      title: `【石和温泉駅から10分】県外ゲストにもやさしいアクセス`,
      body: `${s.line}\nネオス・ミラベルは、${f.access.station}。${f.access.ic}です。\n${f.access.parking}。首都圏や静岡、長野からお車でお越しのゲストにも安心です。\n遠方のゲストが多いおふたりには、ご成約特典としてゲストの送迎サービスや提携ホテルの宿泊優待があります（条件はプランページをご確認ください）。\n実家が山梨で、今は県外にお住まいの方にも選びやすい式場です。`,
    }),
  },
  {
    key: 'photo',
    type: 'photo', theme: 'photo',
    build: (f, s, ctx = {}) => ({
      title: `【山梨のフォトウエディング】大聖堂と貸切ガーデンで撮る`,
      body: `${s.line}\n山梨でフォトウエディングをお考えの方へ。撮影場所は、${f.photo.places}。\n${f.photo.options.join('、')}もできます。\n結婚式は挙げないけれど写真は残したい、家族と一緒に撮りたい、という方にも選ばれています。`,
    }),
  },
  {
    key: 'bestrate',
    type: 'bestrate', theme: 'venue',
    build: (f, s, ctx = {}) => ({
      title: `【${pick(f.area, ctx.seed)}の結婚式場】公式サイト予約が一番お得な理由`,
      body: `${s.line}\n${f.bestrate}。\nさらに${f.fair.benefits}などの特典が付きます。\n迷ったら、まず公式サイトのフェア一覧をご覧ください。`,
    }),
  },
  {
    key: 'wed-fair',
    type: 'fair', theme: 'venue',
    build: (f, s, ctx = {}) => ({
      title: `【${pick(f.area, ctx.seed)}】平日ゆったり見学の水曜PREMIUMフェア`,
      body: `${s.line}\n平日にゆっくり式場を見たい方には、水曜日のフェアがおすすめです。\n${f.fair.wed}。\n平日の結婚式をお考えの方には、${f.plans.find((p) => p.key === 'weekday').name}（${f.plans.find((p) => p.key === 'weekday').price}）もご用意しています。`,
    }),
  },
  {
    key: 'line',
    type: 'line', theme: 'hospitality',
    build: (f, s, ctx = {}) => ({
      title: `【山梨の結婚式場】来館前にLINEで概算予算・空き日程を相談`,
      body: `${s.line}\n「まだ式場を見に行く前だけど、だいたいの予算と空き日程だけ知りたい」。\nそんな方のために、ネオス・ミラベルでは${f.line}。\n希望の人数と時期を送っていただければ、概算のお見積りと空き日程をお返しします。まずは友だち追加から。`,
    }),
  },
];

// 決定的に選ぶ（同じ seed なら同じ結果）。ランダム性を持たせつつ再現可能にする。
export function pick(arr, seed = 0) {
  return arr[Math.abs(hash(String(seed) + arr.length)) % arr.length];
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h | 0;
}
