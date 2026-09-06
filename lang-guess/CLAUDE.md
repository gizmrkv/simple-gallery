# CLAUDE.md

`simple-lang-guess`で作業するときのプロジェクト固有の指示。人間向けの概要は
[README.md](README.md)を参照。

## 重要な設計制約(勝手に変えないこと)

### `training/`と`src/`は`public/model/vocab.json`の形だけで繋がっている

学習パイプライン(`training/`、Python/uv管理、Viteのビルド対象外)と
フロントエンド(`src/`、TypeScript)は別々に管理されているが、次の契約で
一致していなければならない:

- ONNXモデルの入力: 名前`"input"`、dtype`int64`、shape`[1, max_len]`
  (文字ID列、`vocab.json`の`pad_id`でパディング)。
- ONNXモデルの出力: 名前`"logits"`、dtype`float32`、shape`[1, クラス数]`
  (クラス数は`training/constants.py`の`LABELS`の長さ、softmax前の生logits。
  softmaxはフロントエンド側[src/inference.ts](src/inference.ts)で行う)。
  固定値ではなく`vocab.json`の`labels`の長さから決まる。
- `public/model/vocab.json`: `char_to_id`(文字→ID)・`pad_id`・`unk_char_id`・
  `max_len`・`labels`(出力インデックス順の言語コード一覧)を持つ。
  [src/tokenize.ts](src/tokenize.ts)はこのJSONの値をそのまま使ってエンコードするので、
  文字ID体系やラベル順を固定値としてハードコードしていない
  (学習側の`training/constants.py`が変わっても、`vocab.json`さえ再生成されれば
  フロントエンドは自動的に追従する)。

`training/`側でラベル追加・文字集合変更・`max_len`変更などを行った場合は、
`export_onnx.py`を再実行して`public/model/lang-id.onnx`と`vocab.json`を
両方書き出し直すこと。片方だけ更新すると学習/推論のスキューが起きる。

### 文字ごとの根拠表示はleave-one-out occlusion(勾配は使わない)

[src/attribution.ts](src/attribution.ts)は各文字位置をUNK文字IDに置き換えて
再推論し、対象クラスの確率低下量を寄与度とする方式。ONNX Runtime Webの
forward推論だけで完結する(勾配計算や外部のSHAP実装は使っていない)。
単語長nに対しn+1回の推論が走るが、モデルが小さく単語も短いため許容範囲。
