# CLAUDE.md

`simple-lead-turret`リポジトリで作業するときのプロジェクト固有の指示。

## このプロジェクトは何か

固定砲台がキーボード操作の目標に偏差射撃する様子を眺めて楽しむ可視化。
人間向けの概要は[README.md](README.md)を参照。

## 重要な設計制約(勝手に変えないこと)

### 速度の単位は「px/tick」、dtは陽に掛けない

`simple-boids-like`と同じ規約。`pos = pos + vel`のみで積分し、`vel *= dt`の
ようなスケーリングは行わない。フレームレート非依存にしたくなっても、この
プロジェクトでは導入しない。

### 目標の移動モードは2つだけ

- `constant`(等速直線運動): 入力があれば`vel = 入力方向 * targetSpeed`。
  入力が無ければ直前の速度を保持して直進を続ける(離したら止まる、ではない)。
- `accelerated`(加速度運動): 入力があれば`vel += 入力方向 * targetAccel`
  (`targetMaxSpeed`でクランプ)。摩擦は無い。

どちらのモードも共通の`predictAimPoint`(不動点反復、[src/intercept.ts](src/intercept.ts))
で狙点を計算する。四次方程式を解く閉形式には変更しない — 反復法の方が
シンプルで、両モードを同じコードで扱える。

### 目標はラップアラウンド、弾はラップしない

目標は画面端で反対側から出てくる。弾は画面外に出たら消滅する(ラップしない)。
これによりラップの瞬間をまたぐ弾は外れる(意図した挙動 — 予測不能な要素として
残す)。

### 命中率は「ジグザグの速さ」に強く依存する

方向転換の周期が弾の飛翔時間(既定のPHYSICS値で約30〜40tick)より短いと、
命中率はほぼ0%まで落ちる。これはバグではなく、砲台が未来の入力を知らない
以上避けられない原理的な限界。パラメータ調整で「もっと当たるようにして」と
言われた場合は、この限界を踏まえた上でPHYSICS定数(targetSpeed / bulletSpeed /
fireIntervalなど)を調整すること。

## 開発サーバーがWSL2で開けない場合

`package.json`の`dev`は`vite --host`にしてある。`--host`を外さないこと
(IPv6ループバックのみバインドになりWindows側から届かなくなる)。

## ブラウザでの動作確認について

自動操作ツール(ヘッドレスchromium等)でタブが非表示(`document.hidden`)に
なると、仕様上`requestAnimationFrame`が完全停止する。[src/main.ts](src/main.ts)には
`import.meta.env.DEV`限定で`window.__sim`(`world`への参照、`tick(n)`で
rAFを介さず同期的にnステップ進める)を生やしてあるので、非表示タブでも
`dispatchEvent(new KeyboardEvent(...))`と`window.__sim.tick(n)`を組み合わせて
動作確認できる。本番ビルドではtree-shakingで消えるので確認すること
(`grep __sim dist/assets/*.js`が空であればOK)。
