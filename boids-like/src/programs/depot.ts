import type { Program } from '../perception';
import { add, length, normalize, scale, zero } from '../vec2';
import { PHYSICS } from '../world';
import { closest, isLocalMax, toAction } from './util';

const BUILD_MARGIN = 0.75; // frontier.tsと同じ値・同じ理由
const INTENT_SLOT = 2; // memory[2]: 建設意思表示（frontier.tsと同じ）
const FUEL_RETURN_RATIO = 0.5; // frontier.tsと同じ値

/**
 * frontier.tsの派生版。唯一の本質的な違いは、dead reckoning(memory[0..1])の
 * リセット条件を「拠点/補給所どちらでも触れたら」から「拠点(Base)に触れた
 * ときだけ」に変えたこと。これは補給所(Station)がdrop(資源搬入)を受け付けず
 * 燃料補給専用になった（`world.stationAcceptsDrop = false`、simulate.ts参照）
 * このシナリオに合わせた変更——補給所で毎回リセットしていると、その先どちらへ
 * 進めば拠点なのかが分からなくなってしまう。
 *
 * 【なぜ追加のメモリスロットが要らないか】
 * simulate.tsの`applyDeadReckoning`は物理適用後の実際のheading変化・実際の
 * 移動量から回転補正付きで積算するため（詳細はsimulate.tsのdocコメント
 * 参照）、経路がどれだけ迂回しても「今の推定変位」は常に厳密に正しい。
 * つまりリセットのタイミングをプログラム側がいつ選ぼうと精度は落ちない。
 * frontier.tsが最寄りアンカーでリセットしていたのは「補給所ならどこでも
 * drop可能」という設計に合わせてそこを新しい基準点にしていただけで、
 * このシナリオのように「拠点でしかdropできない」なら、拠点でのみリセット
 * すればmemory[0..1]は常に「拠点からの推定変位」を表し続け、そのまま
 * 復路の目標ベクトルとしても、往路の建設判断（後述）の距離としても使える。
 *
 * 【建設ゲートには別の指標が必要】
 * 当初、frontier.tsの`estDist`（dead reckoningの大きさ）をそのまま「拠点からの
 * 直線距離」に読み替えて建設ゲートに流用しようとしたが、これは意味的に
 * frontier.tsの設計（最後に触れたアンカーからの距離、アンカーに触れるたびに
 * リセット）とは別物になってしまう——拠点から一定以上離れた状態が続く限り
 * 値が常に閾値を超え続けるため、実質的なゲートは`nearVisibleAnchor`
 * （視界内にアンカーが見えているか）だけになり、経路上のどこでも視界から
 * 外れるたびに建設したがる。代わりに、既存の「拠点/補給所どちらでも
 * interactRadius内にいる間は燃料が全回復する」という仕組み（simulate.ts）を
 * 流用する。`PHYSICS.maxFuel - self.fuel`は「最後にどこかのアンカーに触れて
 * からの移動距離」そのものであり、frontier.tsのestDistと同じ役割を新しい
 * メモリスロットを増やさずに果たせる（fuelは既にエンジンが厳密に管理して
 * いる値なので、dead reckoningのような近似ですらない）。
 * ただし、headless比較の結果、station数自体はfrontier.ts（既存の広域探索
 * シナリオ、20体・同じ分離則ベースの探索）でも到達距離1000前後で
 * 150〜250個規模になっており、この量は今回の変更固有の問題ではなく、
 * 中央調整なしに20体が独立に建設判断をするこのアルゴリズム自体が持つ
 * 特性だと分かった（`nearVisibleAnchor`は同tick内の重複だけを防ぎ、
 * 総数に上限を設ける仕組みではないため）。depot.tsの到達距離・往復tick数が
 * frontier.tsより長い分、station数もやや多くなる。
 *
 * 【まだ試していないこと】
 * 復路は常にdead reckoningの直線方向へ進むだけで、地形や他boidによる迂回で
 * 実際の経路が往路に建てた補給所群から外れても補給所を探しには行かない
 * （低燃料時のみ視界内のアンカーへ迂回する）。障害物のあるフィールドで
 * この直線復路が破綻するケースが出てくれば、そこがフェロモン的な誘導
 * （docs/memo.md参照）を検討する動機になる、というのが今回の狙い。
 *
 * それ以外（探索時の分離則による自己組織化的な拡散、資源探知・harvest、
 * 低燃料緊急帰還、建設の重複回避＝リーダー選出パターン）はfrontier.tsと
 * 同一のロジック。詳細な設計意図・過去に見つかった不具合の経緯は
 * frontier.tsのdocコメントを参照。
 */
export const depotProgram: Program = (self, neighbors) => {
  const wasIntending = self.memory[INTENT_SLOT] === 1;

  const bases = neighbors.filter((n) => n.kind === 'base');
  const anchors = neighbors.filter((n) => n.kind === 'base' || n.kind === 'station');
  const atBase = bases.length > 0 && length(closest(bases).relPos) < PHYSICS.interactRadius;
  if (atBase) {
    self.memory[0] = 0;
    self.memory[1] = 0;
  }

  const homeVec = { x: -self.memory[0], y: -self.memory[1] };
  const homeDir = length(homeVec) > 0 ? normalize(homeVec) : zero();
  const lowFuel = self.fuel < PHYSICS.maxFuel * FUEL_RETURN_RATIO;

  let steer = zero();
  let harvest = false;
  let drop = false;

  if (self.cargo > 0) {
    if (atBase) {
      drop = true;
      steer = homeDir;
    } else if (lowFuel && anchors.length > 0) {
      steer = normalize(closest(anchors).relPos);
    } else {
      steer = homeDir;
    }
  } else {
    const resources = neighbors.filter((n) => n.kind === 'resource' && (n.amount ?? 0) > 0);
    if (resources.length > 0) {
      const res = closest(resources);
      steer = normalize(res.relPos);
      harvest = length(res.relPos) < PHYSICS.interactRadius;
    } else if (lowFuel) {
      steer = anchors.length > 0 ? normalize(closest(anchors).relPos) : homeDir;
    } else {
      const peers = neighbors.filter((n) => n.kind === 'boid');
      let repel = zero();
      for (const peer of peers) {
        const d = length(peer.relPos);
        if (d < 1e-6) continue;
        repel = add(repel, scale(normalize(scale(peer.relPos, -1)), 1 / d));
      }
      if (length(repel) > 0) {
        steer = normalize(repel);
      } else if (self.speed > PHYSICS.maxSpeed * 0.1) {
        steer = { x: 1, y: 0 };
      } else {
        steer = { x: Math.cos(self.id), y: Math.sin(self.id) };
      }
    }
  }

  const nearVisibleAnchor = anchors.some((a) => length(a.relPos) < PHYSICS.maxLineLength);
  const distSinceAnchor = PHYSICS.maxFuel - self.fuel;
  const wantsToBuild = self.cargo === 0 && !nearVisibleAnchor && distSinceAnchor > PHYSICS.maxLineLength * BUILD_MARGIN;
  self.memory[INTENT_SLOT] = wantsToBuild ? 1 : 0;

  const intendingPeers = neighbors.filter((n) => n.kind === 'boid' && n.memory?.[INTENT_SLOT] === 1);
  const build = wantsToBuild && wasIntending && isLocalMax(self.id, intendingPeers);

  const action = toAction(steer);

  return { ...action, harvest, drop, build };
};
