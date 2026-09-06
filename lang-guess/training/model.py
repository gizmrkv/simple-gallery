"""文字レベルCNNによる言語識別モデル。

Embedding -> 並列Conv1d(kernel 3/4/5) -> ReLU -> グローバルmax-pool -> 結合
-> Linear -> Dropout -> Linear(num_classes)。ブラウザ上でONNX Runtime Web(WASM)
により高速に動く必要があるため小さく保つ。出力はsoftmax前の生logits
(softmaxはJS側で行う)。
"""

from __future__ import annotations

import torch
import torch.nn as nn

from constants import PAD_ID, VOCAB_SIZE

KERNEL_SIZES = (3, 4, 5)


class CharCNN(nn.Module):
    def __init__(
        self,
        num_classes: int,
        embed_dim: int = 32,
        num_filters: int = 64,
        dropout: float = 0.3,
        vocab_size: int = VOCAB_SIZE,
        pad_id: int = PAD_ID,
    ) -> None:
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embed_dim, padding_idx=pad_id)
        self.convs = nn.ModuleList(
            [
                nn.Conv1d(embed_dim, num_filters, kernel_size=k, padding=k // 2)
                for k in KERNEL_SIZES
            ]
        )
        self.relu = nn.ReLU()
        concat_dim = num_filters * len(KERNEL_SIZES)
        self.fc1 = nn.Linear(concat_dim, concat_dim // 2)
        self.dropout = nn.Dropout(dropout)
        self.fc2 = nn.Linear(concat_dim // 2, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: [batch, seq_len] (int64 character ids)
        embedded = self.embedding(x)  # [batch, seq_len, embed_dim]
        embedded = embedded.transpose(1, 2)  # [batch, embed_dim, seq_len]

        pooled = []
        for conv in self.convs:
            feat = self.relu(conv(embedded))  # [batch, num_filters, seq_len']
            pooled.append(torch.max(feat, dim=2).values)  # [batch, num_filters]

        concat = torch.cat(pooled, dim=1)  # [batch, num_filters * len(KERNEL_SIZES)]
        hidden = self.relu(self.fc1(concat))
        hidden = self.dropout(hidden)
        logits = self.fc2(hidden)  # [batch, num_classes] raw logits
        return logits
