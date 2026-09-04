import { depotProgram } from '../programs/depot';
import type { Scenario } from '../scenario';
import { length, sub } from '../vec2';
import { createBase, createBoid, createResource, createWorld, PHYSICS } from '../world';

const WIDTH = 1600;
const HEIGHT = 1600;
const BOID_COUNT = 20;
const WIN_AMOUNT = 4;
const MAX_TICKS = 60 * 3000; // 初期値。headless実行の結果を見て調整する

const BASE_POS = { x: WIDTH / 2, y: HEIGHT / 2 };
const SPAWN_RADIUS = 40; // frontier.tsと同じ理由（分離力で拡散が始まるための初期条件）

// 資源クラスタは1箇所のみ。距離はfrontier.tsと同じmaxFuel*2前後にし、
// 補給所チェーンなしでは往復不可能な距離を保証する。
function pickClusterCenter(): { x: number; y: number } {
  const angle = Math.random() * Math.PI * 2;
  const dist = PHYSICS.maxFuel * 2 + (Math.random() - 0.5) * 100;
  return { x: BASE_POS.x + Math.cos(angle) * dist, y: BASE_POS.y + Math.sin(angle) * dist };
}

export const depotScenario: Scenario = {
  id: 'depot',
  name: '9. 補給線（燃料補給専用）と拠点搬入',
  description:
    '広域探索(6)から補給所の役割を変更した実験: 補給所(紫)は燃料補給専用で資源を受け付けず、' +
    `資源は必ず拠点(青)まで運ばないといけない。${WIN_AMOUNT}個搬入したら成功。`,
  createWorld: () => {
    const world = createWorld(WIDTH, HEIGHT);
    world.stationAcceptsDrop = false;
    world.bases.push(createBase(BASE_POS));

    const clusterCenter = pickClusterCenter();
    for (let i = 0; i < 6; i++) {
      world.resources.push(
        createResource(
          { x: clusterCenter.x + (Math.random() - 0.5) * 50, y: clusterCenter.y + (Math.random() - 0.5) * 50 },
          6,
        ),
      );
    }

    for (let i = 0; i < BOID_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * SPAWN_RADIUS;
      const boid = createBoid(
        { x: BASE_POS.x + Math.cos(angle) * r, y: BASE_POS.y + Math.sin(angle) * r },
        0,
        PHYSICS.maxFuel,
      );
      world.boids.push(boid);
    }
    return world;
  },
  program: depotProgram,
  checkWin: (world) => {
    const base = world.bases[0];
    const stored = world.stored;
    const farthest = world.stations.reduce((max, s) => Math.max(max, length(sub(s.pos, base.pos))), 0);
    const stats = `station数 ${world.stations.length}, 到達距離 ${farthest.toFixed(0)}`;
    if (stored >= WIN_AMOUNT) return { won: true, detail: `搬入完了: ${stored} (${stats})` };
    if (world.tick >= MAX_TICKS) return { won: false, detail: `時間切れ: ${stored}/${WIN_AMOUNT} (${stats})` };
    return { won: false, detail: `探索中: ${stored}/${WIN_AMOUNT} (${stats}, tick ${world.tick})` };
  },
};
