"""UNKNOWN(unk)クラス用の合成ネガティブサンプルを生成し、data/words.csvに追記する。

3種類の生成器をそれぞれ概ね1/3ずつ用いる:
1. 一様ランダム: 実単語全体の長さ分布からサンプルした長さで、各文字をa-zから一様サンプル。
2. 文字bigramマルコフ連鎖: 実単語全体から学習したbigram遷移表から生成する
   「発音はできそうだが実在しない」ハードネガティブ。
3. 実単語のシャッフル: 実単語をランダムに選び文字を並べ替える
   (シャッフル後に既存の実単語と一致した場合は棄却する)。

目標件数は最大の言語クラスと同程度(オーダーが合えばよい)。

実行:
    uv run python training/generate_unknown.py
"""

from __future__ import annotations

import csv
import random
from collections import Counter, defaultdict
from pathlib import Path

import structlog

TRAINING_DIR = Path(__file__).resolve().parent
WORDS_CSV = TRAINING_DIR / "data" / "words.csv"

UNK_LABEL = "unk"
SEED = 42
_AZ = "abcdefghijklmnopqrstuvwxyz"
_START = "^"  # bigramテーブルにおける「単語の先頭」を表す仮想状態

log = structlog.get_logger()


def load_real_words(path: Path) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    with path.open(encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)  # header
        for word, lang in reader:
            rows.append((word, lang))
    return rows


def length_distribution(words: list[str]) -> list[int]:
    """全実単語の長さのリストをそのまま返す(ここからrandom.choiceでサンプルする)。"""
    return [len(w) for w in words]


def build_bigram_table(words: list[str]) -> dict[str, Counter]:
    """a-zのみを対象にした文字bigram遷移表を構築する(アポストロフィ/ハイフンは無視)。

    各実単語について、a-z以外の文字(アポストロフィ・ハイフンなど)を取り除いてから
    連続する文字ペアをカウントする。単語の先頭文字の分布は仮想状態 `_START` からの
    遷移として扱う。
    """
    table: dict[str, Counter] = defaultdict(Counter)
    for word in words:
        filtered = [ch for ch in word if ch in _AZ]
        if not filtered:
            continue
        prev = _START
        for ch in filtered:
            table[prev][ch] += 1
            prev = ch
    return table


def sample_uniform_random(rng: random.Random, lengths: list[int], n: int) -> list[str]:
    out = []
    for _ in range(n):
        length = rng.choice(lengths)
        out.append("".join(rng.choice(_AZ) for _ in range(length)))
    return out


def sample_markov(
    rng: random.Random, table: dict[str, Counter], lengths: list[int], n: int
) -> list[str]:
    out = []
    for _ in range(n):
        length = max(1, rng.choice(lengths))
        chars = []
        prev = _START
        for _ in range(length):
            counter = table.get(prev)
            if not counter:
                # 遷移が存在しない場合(通常起きないはずだが安全策)はa-zから一様サンプル
                ch = rng.choice(_AZ)
            else:
                population = list(counter.keys())
                weights = list(counter.values())
                ch = rng.choices(population, weights=weights, k=1)[0]
            chars.append(ch)
            prev = ch
        out.append("".join(chars))
    return out


def sample_shuffled(
    rng: random.Random, real_words: list[str], real_word_set: set[str], n: int
) -> list[str]:
    out = []
    max_attempts_per_sample = 10
    attempts = 0
    while len(out) < n and attempts < n * max_attempts_per_sample:
        attempts += 1
        word = rng.choice(real_words)
        chars = list(word)
        rng.shuffle(chars)
        shuffled = "".join(chars)
        if shuffled != word and shuffled not in real_word_set:
            out.append(shuffled)
    return out


def main() -> None:
    rng = random.Random(SEED)
    rows = load_real_words(WORDS_CSV)
    real_words = [w for w, lang in rows if lang != UNK_LABEL]
    real_word_set = set(real_words)

    lang_counts = Counter(lang for _, lang in rows if lang != UNK_LABEL)
    largest_class_size = max(lang_counts.values())
    target_total = largest_class_size
    n_each = target_total // 3

    log.info(
        "generating unk samples",
        largest_class=lang_counts.most_common(1),
        target_total=target_total,
        n_each=n_each,
        seed=SEED,
    )

    lengths = length_distribution(real_words)
    bigram_table = build_bigram_table(real_words)

    uniform_words = sample_uniform_random(rng, lengths, n_each)
    markov_words = sample_markov(rng, bigram_table, lengths, n_each)
    shuffled_words = sample_shuffled(rng, real_words, real_word_set, n_each)

    log.info(
        "generated raw counts",
        uniform=len(uniform_words),
        markov=len(markov_words),
        shuffled=len(shuffled_words),
    )

    # 実単語と衝突する合成サンプル(uniform/markovが偶然本物の単語と一致した場合)は
    # ラベル矛盾(同じ文字列が実言語ラベルとunkの両方で出現する)を避けるため除外する。
    # generator3(shuffle)はサンプリング時点で既に除外済み。
    candidates = uniform_words + markov_words + shuffled_words
    unk_words: set[str] = set()
    n_collided = 0
    for w in candidates:
        if w in real_word_set:
            n_collided += 1
            continue
        unk_words.add(w)

    log.info("final unk set", n_unique=len(unk_words), n_collided_with_real_words=n_collided)

    # 再実行してもunk行が重複しないよう、非unk行 + 新しく生成したunk行で全体を書き直す
    # (単純追記だと再実行のたびにunk行が増えてしまう)。
    with WORDS_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["word", "lang"])
        for word, lang in rows:
            if lang != UNK_LABEL:
                writer.writerow([word, lang])
        for word in sorted(unk_words):
            writer.writerow([word, UNK_LABEL])

    log.info("wrote words.csv with unk rows", path=str(WORDS_CSV))


if __name__ == "__main__":
    main()
