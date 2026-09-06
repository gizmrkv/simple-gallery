"""文字レベルのトークナイザとPyTorch Datasetクラス、および層化train/val/test分割。

トークナイズ規則(フロントエンドのsrc/tokenize.ts::encode()と完全に一致させる必要がある):
- 小文字化・前後空白除去。
- 語彙は a-z + アポストロフィ(') + ハイフン(-) の28文字。
- id 0 = PAD、語彙外の文字は unk_char_id に割り当てる。
- 固定長 max_len にパディング/切り詰め(右側パディング、右側切り詰め)。

max_len=20は、全実単語+unk合成単語を合わせた長さ分布の99パーセンタイル(19文字)に
基づいて選んだ(training/prepare_data.py実行後の分布を参照)。
"""

from __future__ import annotations

import csv
import random
from collections import defaultdict
from pathlib import Path

import torch
from torch.utils.data import Dataset

from constants import CHAR_TO_ID, LABELS, PAD_ID, UNK_CHAR_ID

MAX_LEN = 20

_LABEL_TO_ID = {label: i for i, label in enumerate(LABELS)}


def encode_word(word: str, max_len: int = MAX_LEN) -> list[int]:
    """1単語を固定長の文字ID列に変換する(フロントエンドのencode()と同じ規則)。"""
    word = word.lower().strip()
    ids = [PAD_ID] * max_len
    for i in range(min(len(word), max_len)):
        ids[i] = CHAR_TO_ID.get(word[i], UNK_CHAR_ID)
    return ids


def load_rows(csv_path: Path) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    with csv_path.open(encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)  # header
        for word, lang in reader:
            rows.append((word, lang))
    return rows


def stratified_split(
    rows: list[tuple[str, str]],
    val_frac: float = 0.1,
    test_frac: float = 0.1,
    seed: int = 42,
) -> tuple[list[tuple[str, str]], list[tuple[str, str]], list[tuple[str, str]]]:
    """各言語クラスごとに80/10/10でtrain/val/testに分割する(層化サンプリング)。"""
    rng = random.Random(seed)
    by_lang: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for row in rows:
        by_lang[row[1]].append(row)

    train, val, test = [], [], []
    for lang, lang_rows in by_lang.items():
        lang_rows = lang_rows[:]
        rng.shuffle(lang_rows)
        n = len(lang_rows)
        n_val = int(n * val_frac)
        n_test = int(n * test_frac)
        val.extend(lang_rows[:n_val])
        test.extend(lang_rows[n_val : n_val + n_test])
        train.extend(lang_rows[n_val + n_test :])

    rng.shuffle(train)
    rng.shuffle(val)
    rng.shuffle(test)
    return train, val, test


class LangIdDataset(Dataset):
    """(単語, 言語)のペアのリストから、文字ID列とラベルIDのテンソルを返すDataset。"""

    def __init__(self, rows: list[tuple[str, str]], max_len: int = MAX_LEN) -> None:
        self.rows = rows
        self.max_len = max_len

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        word, lang = self.rows[idx]
        ids = encode_word(word, self.max_len)
        return torch.tensor(ids, dtype=torch.long), torch.tensor(
            _LABEL_TO_ID[lang], dtype=torch.long
        )
