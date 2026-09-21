// 全モジュールが共有するパラメータ型と既定値。
// 既定値の出典と根拠は docs/pathfinder-spec.md / docs/ga-spec.md を参照。

/** バイターの経路探索パラメータ。既定値は Factorio の map-settings.example.json 由来。 */
export interface PathParams {
  /** goal_pressure_ratio。f = g + ratio*h。2 は重み付きA*（最短経路とは限らない）。 */
  goalPressureRatio: number;
  /** general_entity_collision_penalty。壁タイルに侵入するコスト加算。 */
  collisionPenalty: number;
  /** general_entity_subsequent_collision_penalty。直前も壁だった場合はこちら。 */
  subsequentCollisionPenalty: number;
  /** extended_collision_penalty。壁に隣接するタイルを通るコスト。既定0の理由は docs 参照。 */
  extendedCollisionPenalty: number;
  /** 斜め移動を許すか。許す場合も角抜け（肩が壁）は禁止。 */
  allowDiagonal: boolean;
  /** short_request_max_steps 相当。0 で無制限。 */
  maxExpansions: number;
}

export const DEFAULT_PATH_PARAMS: PathParams = {
  goalPressureRatio: 2,
  collisionPenalty: 10,
  subsequentCollisionPenalty: 3,
  extendedCollisionPenalty: 0,
  allowDiagonal: true,
  maxExpansions: 0,
};

/** 個体の評価式のパラメータ。 */
export interface FitnessParams {
  /** min と mean のブレンド比。1 で純maximin、0 で純平均。 */
  alpha: number;
  /** 壁を1枚壊されるごとの減点。 */
  breakPenalty: number;
  /**
   * 壁1枚あたりの倹約コスト。同程度の迷路なら壁が少ない方を選ばせるための項で、
   * あくまで同点破りに留める必要がある。空盤に壁を1枚足したときの利得は
   * 影響を受けるレーンが1本だけなので (1-alpha)*0.41/W ≒ 0.01 程度しかなく、
   * これを上回る値にすると「1枚ずつ足す」方向の勾配が常に負になり、
   * GAが空盤から抜け出せなくなる（W が広い盤で実際に崩壊する）。
   */
  wallCost: number;
}

export const DEFAULT_FITNESS_PARAMS: FitnessParams = {
  alpha: 0.5,
  breakPenalty: 30,
  wallCost: 0.02,
};

/** GA のパラメータ。 */
export interface GaParams {
  popSize: number;
  eliteCount: number;
  tournamentSize: number;
  crossoverRate: number;
  /** 1個体あたりの反転ビット数の期待値。内部で per-cell 確率に変換する。 */
  mutationBits: number;
  structuralMutationRate: number;
  immigrantRate: number;
  seed: number;
}

export const DEFAULT_GA_PARAMS: GaParams = {
  popSize: 100,
  eliteCount: 4,
  tournamentSize: 3,
  crossoverRate: 0.9,
  mutationBits: 2,
  structuralMutationRate: 0.2,
  immigrantRate: 0.02,
  seed: 1,
};

/** 1個体の評価結果。worker からはこの4値が Float64Array で返る。 */
export interface GenomeStats {
  fitness: number;
  minScore: number;
  meanScore: number;
  totalBreaks: number;
}
/** worker が 1 個体あたりに返す float の個数。 */
export const STATS_STRIDE = 4;
