export type EdgeGeometry = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  laneY: number | null;
  canvasWidth?: number;
};

export type NodeBox = { left: number; top: number; right: number; bottom: number };
export const ROW_EPS = 0.5;

export const EDGE_STUB = 24;
export const EDGE_RADIUS = 12;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const r = (v: number) => Math.round(v * 10) / 10;

/** 同じ行のエッジ: 現行 cubicBezierPath と同一の水平3次ベジェ */
function sameRowPath(x1: number, y1: number, x2: number, y2: number): string {
  const off = Math.max(24, Math.min(60, Math.abs(x2 - x1) / 2));
  return `M ${r(x1)} ${r(y1)} C ${r(x1 + off)} ${r(y1)} ${r(x2 - off)} ${r(y2)} ${r(x2)} ${r(y2)}`;
}

/** 行をまたぐエッジ: 直交ルート（角は二次ベジェで丸める） */
function crossRowPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  laneY: number,
  canvasWidth?: number,
): string {
  // 経由点（丸める前の理論値）
  const exitX = canvasWidth === undefined ? x1 + EDGE_STUB : clamp(x1 + EDGE_STUB, 0, canvasWidth);
  const enterX = canvasWidth === undefined ? x2 - EDGE_STUB : clamp(x2 - EDGE_STUB, 0, canvasWidth);
  const p0 = { x: x1, y: y1 };
  const p1 = { x: exitX, y: y1 };
  const p2 = { x: exitX, y: laneY };
  const p3 = { x: enterX, y: laneY };
  const p4 = { x: enterX, y: y2 };
  const p5 = { x: x2, y: y2 };

  const points = [p0, p1, p2, p3, p4, p5];
  const segLen = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(b.x - a.x, b.y - a.y);

  let d = `M ${r(p0.x)} ${r(p0.y)}`;

  // 角は p1, p2, p3, p4 の4箇所（各々、手前の辺と次の辺の間）
  const corners = [1, 2, 3, 4];

  for (const i of corners) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const prevLen = segLen(prev, cur);
    const nextLen = segLen(cur, next);
    const radius = Math.min(EDGE_RADIUS, prevLen / 2, nextLen / 2);

    if (radius <= 0) {
      d += ` L ${r(cur.x)} ${r(cur.y)}`;
      continue;
    }

    // 手前の辺上、角から radius 手前の点まで直線
    const beforeX = cur.x - ((cur.x - prev.x) / prevLen) * radius;
    const beforeY = cur.y - ((cur.y - prev.y) / prevLen) * radius;
    // 次の辺上、角から radius 先の点
    const afterX = cur.x + ((next.x - cur.x) / nextLen) * radius;
    const afterY = cur.y + ((next.y - cur.y) / nextLen) * radius;

    d += ` L ${r(beforeX)} ${r(beforeY)}`;
    d += ` Q ${r(cur.x)} ${r(cur.y)} ${r(afterX)} ${r(afterY)}`;
  }

  d += ` L ${r(p5.x)} ${r(p5.y)}`;
  return d;
}

export function buildEdgePath(g: EdgeGeometry): string {
  const { x1, y1, x2, y2, laneY, canvasWidth } = g;
  if (laneY === null) {
    return sameRowPath(x1, y1, x2, y2);
  }
  return crossRowPath(x1, y1, x2, y2, laneY, canvasWidth);
}

/**
 * ノード矩形の並び（描画順）とキャンバス矩形から、隣接ペアぶんの EdgeGeometry を作る。
 * 要素が取れなかったノードは null を渡す。
 * すべてキャンバス相対座標に変換して返す。戻り値の長さは nodes.length - 1（0以下なら空配列）。
 */
export function buildEdgeGeometries(nodes: Array<NodeBox | null>, canvas: NodeBox): EdgeGeometry[] {
  if (nodes.length <= 1) return [];

  // 非nullノードだけを描画順に走査して行グループを作る（rowTop/rowBottom）。
  // rowOf[i] は nodes[i] が非nullのときだけ、その行のインデックスを持つ。
  const rowOf: Array<number | undefined> = new Array(nodes.length);
  const rowTops: number[] = [];
  const rowBottoms: number[] = [];
  let prevNonNullTop: number | null = null;
  let currentRow = -1;

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n) continue;
    if (prevNonNullTop === null || Math.abs(n.top - prevNonNullTop) > ROW_EPS) {
      currentRow += 1;
      rowTops[currentRow] = n.top;
      rowBottoms[currentRow] = n.bottom;
    } else {
      rowTops[currentRow] = Math.min(rowTops[currentRow], n.top);
      rowBottoms[currentRow] = Math.max(rowBottoms[currentRow], n.bottom);
    }
    rowOf[i] = currentRow;
    prevNonNullTop = n.top;
  }

  const canvasWidth = canvas.right - canvas.left;
  const result: EdgeGeometry[] = [];

  for (let i = 0; i < nodes.length - 1; i++) {
    const prev = nodes[i];
    const cur = nodes[i + 1];
    if (!prev || !cur) {
      result.push({ x1: 0, y1: 0, x2: 0, y2: 0, laneY: null });
      continue;
    }

    const x1 = prev.right - canvas.left;
    const y1 = (prev.top + prev.bottom) / 2 - canvas.top;
    const x2 = cur.left - canvas.left;
    const y2 = (cur.top + cur.bottom) / 2 - canvas.top;

    const prevRow = rowOf[i] as number;
    const curRow = rowOf[i + 1] as number;
    const laneY =
      prevRow === curRow
        ? null
        : (rowBottoms[prevRow] + rowTops[curRow]) / 2 - canvas.top;

    result.push({ x1, y1, x2, y2, laneY, canvasWidth });
  }

  return result;
}
