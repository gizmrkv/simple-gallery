# Theme Color — 画像からテーマカラーを抽出

画像をアップロードすると、各ピクセルの色を3次元ベクトル（CIELAB）として解釈してクラスタリングし、「適切な」クラス数を自動選択して、各クラスタの重心（テーマカラー）を表示する静的 Web アプリです。すべてブラウザ内で処理し、サーバには何も送信しません。

## 特長

- 画像をドラッグ＆ドロップ（またはクリック選択）でアップロード
- **CIELAB 空間で k-means++ クラスタリング**（知覚的に自然なテーマカラー）
- **シルエットスコアで適切なクラス数 (k=2..8) を自動選択**。スライダーで手動上書きも可能
- 各テーマカラーの **HEX・構成比** を表示。クリックで HEX をコピー
- 重い計算は **Web Worker** で実行し UI をブロックしない
- 初回表示時にサンプル画像の結果を表示
- 過去のアップロード結果を **localStorage** に保存して一覧表示（クリックで再表示）
- ダークモード対応

## 技術スタック

Vite + React + TypeScript / Vitest

## 開発

```bash
npm install
npm run dev      # 開発サーバ
npm test         # ユニットテスト（color / kmeans / silhouette / clusterImage）
npm run build    # 本番ビルド（型チェック込み）
```

## 仕組み

1. 画像を最大辺 160px に縮小してピクセルを取得
2. 不透明ピクセルから最大 3000 点をランダムサンプリング
3. RGB → CIELAB に変換
4. k=2..8 で k-means++ を実行し、各 k のシルエットスコアを計算
5. スコア最大の k を「適切なクラス数」として自動選択
6. 各クラスタ重心を RGB/HEX に戻し、構成比とともに表示

## デプロイ（GitHub Pages）

`main` への push で [.github/workflows/deploy.yml](.github/workflows/deploy.yml) が
`npm test` → `npm run build` を実行し、`dist` を GitHub Pages に公開します。

**初回のみ手動設定が必要です:** リポジトリの **Settings → Pages → Build and deployment → Source** を
**「GitHub Actions」** に変更してください。

公開 URL はリポジトリ名のサブパス配下になります（例 `https://<user>.github.io/simple-color-clustering/`）。
リポジトリ名を変える場合は [vite.config.ts](vite.config.ts) の `base` も合わせて変更してください。
