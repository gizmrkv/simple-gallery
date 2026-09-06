// 言語コード -> 表示名。ローマ字化言語(ja/zh/ko)には注記を付ける。
export const LANGUAGE_NAMES: Record<string, string> = {
  en: '英語',
  es: 'スペイン語',
  fr: 'フランス語',
  de: 'ドイツ語',
  it: 'イタリア語',
  pt: 'ポルトガル語',
  nl: 'オランダ語',
  sv: 'スウェーデン語',
  no: 'ノルウェー語',
  da: 'デンマーク語',
  fi: 'フィンランド語',
  is: 'アイスランド語',
  pl: 'ポーランド語',
  cs: 'チェコ語',
  sk: 'スロバキア語',
  sl: 'スロベニア語',
  hr: 'クロアチア語',
  hu: 'ハンガリー語',
  ro: 'ルーマニア語',
  tr: 'トルコ語',
  id: 'インドネシア語',
  ms: 'マレー語',
  vi: 'ベトナム語',
  ca: 'カタルーニャ語',
  eu: 'バスク語',
  lt: 'リトアニア語',
  lv: 'ラトビア語',
  ja: '日本語(ローマ字)',
  zh: '中国語(ピンイン)',
  ko: '韓国語(ローマ字)',
  unk: 'どの言語にも該当しない',
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}
