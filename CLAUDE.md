# CLAUDE.md

`simple-gallery`リポジトリで作業するときのプロジェクト固有の指示。

## このリポジトリは何か

`simple-*`シリーズの小さなデモをサブディレクトリとして集め、1つのGitHub
Pagesサイト(https://gizmrkv.github.io/simple-gallery/ )としてまとめて公開する
ためのモノレポ。人間向けの概要・設計・構成は[README.md](README.md)を参照。

各プロジェクトの**開発**は元の個別リポジトリ(`simple-lead-turret`など)で行う。
このリポジトリはあくまで公開用の集約先であり、機能追加やバグ修正の作業場ではない。

## 変更してよい範囲

- 新しいプロジェクトの追加(下記手順を参照)。
- ルートの[index.html](index.html)(ランディングページ)の見た目・リンク一覧。
- [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)のビルド・デプロイ設定。
- 各プロジェクトディレクトリ内の`vite.config.ts`の`base`設定。

## 勝手に変えてはいけないもの

- 各プロジェクトディレクトリ内の`src/`など、ロジック本体。ここを直したい場合は
  元の個別リポジトリ側で直してから、このリポジトリに再度コピーする。
  このリポジトリ側だけを直すと、次回コピー時に上書きされて消える。
- 各プロジェクトの依存関係・Vite/TypeScriptのバージョン。プロジェクトごとに
  異なっていてよく、統一する必要はない。1つのプロジェクトの依存を上げるために
  他のプロジェクトの`package.json`を触らないこと。

## 新しいプロダクトを追加する手順

1. 元プロジェクトのファイル一式(`.git`・`.github`・`node_modules`・`dist`を除く)を、
   このリポジトリ直下に新しいディレクトリとしてコピーする。
2. `vite.config.ts`の`base`を`/simple-gallery/<ディレクトリ名>/`に変更する
   (`base: "./"`で相対パス出力にしているプロジェクトは変更不要)。
3. `cd <ディレクトリ名> && npm install && npm run build`でローカルビルドを確認し、
   `dist/index.html`のアセットパス(`<script src>`・`<link href>`)が
   `/simple-gallery/<ディレクトリ名>/...`になっていることを`grep`などで確認する。
   ビルド確認後の`dist/`・`node_modules/`はコミットしない(ルートの
   [.gitignore](.gitignore)で除外済み)。
4. ルートの[index.html](index.html)に、そのプロジェクトへのリンクカードを追加する。
   既存のカードの構造(`<li><a class="card" href="./<dir>/">...`)に合わせる。
5. [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)を編集する。
   - `build`ジョブの`strategy.matrix.project`にディレクトリ名を追加。
   - `deploy`ジョブの「Assemble site」ステップの`for project in ...`ループに
     同じディレクトリ名を追加。
   - Vite+TypeScript以外の技術(Godot Web exportなど)を追加する場合は、
     `npm ci` / `npm run build`を前提にしたこの`build`ジョブでは対応できないので、
     ビルドコマンドが異なる専用のジョブを書き足す。最終的に
     `dist-<project>`という名前のartifactとして成果物をアップロードする
     形式(`actions/upload-artifact@v4`)に合わせれば、`deploy`ジョブ側は
     変更不要。
6. [README.md](README.md)の「収録プロジェクト」表に行を追加する。
7. ローカルで`git status`を確認し、意図した差分だけが含まれることを確認してから
   コミットする。
