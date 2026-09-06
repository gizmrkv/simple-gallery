# lang-guess training pipeline

`lang-guess`(文字ベース言語識別のONNXモデル)をゼロから学習するための、
オフラインPyTorchパイプライン。ここで作るのはブラウザ側(`../src/`)が
読み込む `../public/model/lang-id.onnx` と `../public/model/vocab.json` のみで、
フロントエンドのコード自体はこのディレクトリの外(`../src/`, `../index.html`
など)にあり、別途管理されている。

対象は31クラス(ラテン文字表記27言語 + ローマ字化した日本語/中国語/韓国語 +
「どの言語でもない」unkクラス)。データソース・ライセンス・ローマ字化の
簡略化ルールは [DATA.md](DATA.md) を参照。

## セットアップ

```bash
cd training
uv sync
```

## 再現手順

1. データ収集(ダウンロード+パース+ローマ字化。生データは`data/raw/`に
   キャッシュされ、初回のみネットワークアクセスが発生する):

   ```bash
   uv run python prepare_data.py
   ```

   `data/words.csv`(word,lang)と`data/data_summary.json`(言語別件数)が
   生成される。

2. UNKNOWNクラス(合成ネガティブ)を追加:

   ```bash
   uv run python generate_unknown.py
   ```

   `data/words.csv`に`unk`ラベルの行が追記される(再実行しても重複しない)。

3. 学習。まずdebugモードでパイプライン全体の疎通を確認してから、
   本番設定でフル学習する:

   ```bash
   uv run python train.py --config 0000 --debug   # 縮小データで1-2エポックのスモークテスト
   uv run python train.py --config 0000           # フル学習
   ```

   `configs/0000.yml`にハイパーパラメータがある。結果は
   `results/0000/`(debug時は`results/0000_debug/`)に
   `best_model.pt`(ベストチェックポイント)・`metrics.json`・`output.log`・
   使用したconfigのコピーとして出力される。

4. ONNXへのエクスポート(+検証):

   ```bash
   uv run python export_onnx.py --config 0000
   ```

   `../public/model/lang-id.onnx` と `../public/model/vocab.json` を書き出し、
   onnxruntimeで実際に推論して、エクスポート前のPyTorchモデルの出力
   (argmax・確率とも)と一致するかを自動検証する。不一致があれば
   非ゼロ終了コードで失敗する。

## ディレクトリ構成

```
training/
  constants.py       # ラベル順序・文字語彙(フロントエンドの契約と一致させる定数)
  romanize.py         # 日本語(ヘボン式簡略)/韓国語(RR簡略)/中国語(拼音正規化)の変換ロジック
  prepare_data.py     # 生データのダウンロード・パース・ローマ字化 -> data/words.csv
  generate_unknown.py # unkクラス(合成ネガティブ)の生成 -> data/words.csvに追記
  dataset.py          # トークナイザ・PyTorch Dataset・層化train/val/test分割
  model.py            # 文字CNN(CharCNN)
  train.py            # 学習ループ(dataclass Config + tyro + structlog)
  export_onnx.py       # ONNXエクスポート + vocab.json書き出し + 検証
  configs/0000.yml    # ハイパーパラメータ設定例
  data/               # 生成物(.gitignore対象。生データ・データセットCSV)
  results/            # 学習結果(.gitignore対象。チェックポイント・ログ・metrics.json)
```

## 学習結果 (configs/0000.yml, 2026-09-06実行)

- データ件数: 全体1,533,912件(train 1,227,160 / val 153,376 / test 153,376、
  31クラスで層化分割)。各言語とも20,000語以上を確保(最少はハンガリー語の20,197語)。
- テスト全体精度: 50.96%(31クラス分類のランダム基準は約3.2%)。
- 言語別精度が高い例: 中国語(ピンイン)87.6%、日本語(ローマ字)85.7%、
  韓国語(ローマ字)85.5%、フィンランド語64.3%、バスク語63.0%。
- 言語別精度が低い例: デンマーク語13.9%、チェコ語15.7%、インドネシア語17.2%、
  ベトナム語22.1%、スウェーデン語22.0%。特に北欧諸語間は単語単位では
  同根語(cognate)が多く区別が難しい。
- unkクラス: precision 0.948 / recall 0.601(実在単語をunkと誤判定することは
  少ないが、ランダム文字列の約4割は何らかの言語として判定してしまう)。
- ONNXエクスポート後の検証: PyTorch出力との差はsoftmax確率で最大1.79e-07
  (12サンプルすべてargmax一致)。

このように単語単体からの言語推定は本質的に難しく(特に近縁言語間)、
精度に上限がある点はデモの前提として許容している。フロントエンド側は
単一の断定ではなく確率ランキング形式で表示するため、上位に正解が
含まれていれば体験として成立する設計にしている。

## 備考

- `data/raw/`・`data/words.csv`・`results/`・`.venv/` は`training/.gitignore`
  で除外している(生データ・データセットCSV・チェックポイントは
  スクリプトから再生成できるため、リポジトリにはコミットしない想定)。
- GPUが利用可能でも、このモデルは小さくCPUで十分高速なため`train.py`は
  常にCPUを使う(このマシンのGPUはPyPI配布のtorchビルドが対応する
  CUDA compute capabilityより古く、GPU使用時にエラーになるため)。
