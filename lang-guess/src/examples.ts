export interface ExamplesData {
  [lang: string]: string[];
}

export async function loadExamples(url: string): Promise<ExamplesData> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`examples.jsonの読み込みに失敗しました (status: ${res.status})`);
  }
  return (await res.json()) as ExamplesData;
}

// examplesは既に頻度順(training/DATA.md参照)なので、先頭から見つかった順に
// limit件返せばそのまま「頻度が高い実例」になる。
export function findExamples(
  examples: ExamplesData,
  lang: string,
  substring: string,
  limit: number,
  exclude: string,
): string[] {
  const list = examples[lang] ?? [];
  const results: string[] = [];
  for (const word of list) {
    if (word === exclude) continue;
    if (word.includes(substring)) {
      results.push(word);
      if (results.length >= limit) break;
    }
  }
  return results;
}
