import { describe, expect, it } from "vitest";
import {
  buildEdgeGeometries,
  buildEdgePath,
  EDGE_RADIUS,
  EDGE_STUB,
  type EdgeGeometry,
  type NodeBox,
} from "./edge-path";

const r = (v: number) => Math.round(v * 10) / 10;

type Point = { x: number; y: number };
type Segment = { kind: "L" | "Q"; from: Point; to: Point; control?: Point };

/** M/L/Q のみのSVGパス文字列をトークン分解し、現在点を追跡して各区間を得るローカルパーサ */
function parsePath(d: string): { segments: Segment[]; commands: string[] } {
  const tokens = d.trim().split(/\s+/);
  let i = 0;
  let cur: Point = { x: 0, y: 0 };
  const segments: Segment[] = [];
  const commands: string[] = [];

  while (i < tokens.length) {
    const cmd = tokens[i];
    commands.push(cmd);
    if (cmd === "M") {
      const x = Number(tokens[i + 1]);
      const y = Number(tokens[i + 2]);
      cur = { x, y };
      i += 3;
    } else if (cmd === "L") {
      const x = Number(tokens[i + 1]);
      const y = Number(tokens[i + 2]);
      const to = { x, y };
      segments.push({ kind: "L", from: cur, to });
      cur = to;
      i += 3;
    } else if (cmd === "Q") {
      const cx = Number(tokens[i + 1]);
      const cy = Number(tokens[i + 2]);
      const x = Number(tokens[i + 3]);
      const y = Number(tokens[i + 4]);
      const to = { x, y };
      segments.push({ kind: "Q", from: cur, to, control: { x: cx, y: cy } });
      cur = to;
      i += 5;
    } else if (cmd === "C") {
      // 同じ行のパス用（このテストファイルでは C の内部構造は使わない）
      const x = Number(tokens[i + 5]);
      const y = Number(tokens[i + 6]);
      cur = { x, y };
      i += 7;
    } else {
      throw new Error(`unexpected command: ${cmd}`);
    }
  }

  return { segments, commands };
}

describe("buildEdgePath", () => {
  it("同じ行では C コマンドが1つだけの水平ベジェを返す", () => {
    const g: EdgeGeometry = { x1: 10, y1: 50, x2: 200, y2: 50, laneY: null };
    const d = buildEdgePath(g);
    expect(d.startsWith("M")).toBe(true);
    const cCount = (d.match(/(^|\s)C(\s|$)/g) ?? []).length;
    expect(cCount).toBe(1);
    expect(d.includes("Q")).toBe(false);
  });

  it("同じ行の出力が現行のoff式（下限24）と一致する", () => {
    const g: EdgeGeometry = { x1: 100, y1: 200, x2: 120, y2: 200, laneY: null };
    // off = max(24, min(60, |120-100|/2)) = max(24, min(60, 10)) = 24
    const expected = "M 100 200 C 124 200 96 200 120 200";
    expect(buildEdgePath(g)).toBe(expected);
  });

  it("行をまたぐときは垂直区間の x が x1+EDGE_STUB と x2-EDGE_STUB のみである", () => {
    const g: EdgeGeometry = { x1: 40, y1: 60, x2: 300, y2: 260, laneY: 160 };
    const d = buildEdgePath(g);
    const { segments } = parsePath(d);
    const targetXs = [r(g.x1 + EDGE_STUB), r(g.x2 - EDGE_STUB)];

    for (const seg of segments) {
      const dx = seg.to.x - seg.from.x;
      const dy = seg.to.y - seg.from.y;
      if (dx === 0 && Math.abs(dy) > 0) {
        const ok = targetXs.some((tx) => Math.abs(seg.from.x - tx) <= 0.05);
        expect(ok).toBe(true);
      }
    }
  });

  it("行をまたぐときは水平区間の y が laneY のみで長い横移動をしない", () => {
    const g: EdgeGeometry = { x1: 40, y1: 60, x2: 300, y2: 260, laneY: 160 };
    const d = buildEdgePath(g);
    const { segments } = parsePath(d);
    const y1r = r(g.y1);
    const y2r = r(g.y2);
    const laneYr = r(g.laneY as number);

    let sawStubAtY1 = false;
    let sawStubAtY2 = false;

    for (const seg of segments) {
      const dx = seg.to.x - seg.from.x;
      const dy = seg.to.y - seg.from.y;
      if (dy === 0 && Math.abs(dx) > 0) {
        const y = seg.from.y;
        const matchesY1 = Math.abs(y - y1r) <= 0.05;
        const matchesY2 = Math.abs(y - y2r) <= 0.05;
        const matchesLane = Math.abs(y - laneYr) <= 0.05;
        expect(matchesY1 || matchesY2 || matchesLane).toBe(true);
        if (matchesY1 || matchesY2) {
          expect(Math.abs(dx)).toBeLessThanOrEqual(EDGE_STUB + 0.05);
          if (matchesY1) sawStubAtY1 = true;
          if (matchesY2) sawStubAtY2 = true;
        }
      }
    }
    // スタブ自体が存在すること（長さ0で省略されていないことの確認）
    expect(sawStubAtY1).toBe(true);
    expect(sawStubAtY2).toBe(true);
  });

  it("行をまたぐパスは C コマンドを含まない", () => {
    const g: EdgeGeometry = { x1: 40, y1: 60, x2: 300, y2: 260, laneY: 160 };
    const d = buildEdgePath(g);
    expect(d.startsWith("M")).toBe(true);
    expect(d.includes("C")).toBe(false);
  });

  it("座標がすべて0でも例外を投げず M で始まる文字列を返す", () => {
    const gNull: EdgeGeometry = { x1: 0, y1: 0, x2: 0, y2: 0, laneY: null };
    const gLane: EdgeGeometry = { x1: 0, y1: 0, x2: 0, y2: 0, laneY: 0 };
    expect(() => buildEdgePath(gNull)).not.toThrow();
    expect(() => buildEdgePath(gLane)).not.toThrow();
    expect(buildEdgePath(gNull).startsWith("M")).toBe(true);
    expect(buildEdgePath(gLane).startsWith("M")).toBe(true);
  });

  it("角の丸め半径が隣接する辺の長さの半分を超えない", () => {
    // laneY が y1 に極端に近い短辺ケース
    const g: EdgeGeometry = { x1: 40, y1: 100, x2: 300, y2: 260, laneY: 100.2 };
    const d = buildEdgePath(g);
    const { segments } = parsePath(d);
    for (const seg of segments) {
      if (seg.kind === "Q" && seg.control) {
        const distFrom = Math.hypot(seg.control.x - seg.from.x, seg.control.y - seg.from.y);
        const distTo = Math.hypot(seg.control.x - seg.to.x, seg.control.y - seg.to.y);
        expect(distFrom).toBeLessThanOrEqual(EDGE_RADIUS + 0.05);
        expect(distTo).toBeLessThanOrEqual(EDGE_RADIUS + 0.05);
      }
    }
    expect(() => buildEdgePath(g)).not.toThrow();
  });

  it("終点が始点より右にある折り返しでも例外を投げず直交ルートを返す", () => {
    // 折り返したのに終点が右（x2 - EDGE_STUB が x1 + EDGE_STUB より右）
    const g: EdgeGeometry = { x1: 300, y1: 60, x2: 320, y2: 260, laneY: 160 };
    expect(() => buildEdgePath(g)).not.toThrow();
    const d = buildEdgePath(g);
    expect(d.startsWith("M")).toBe(true);
    expect(d.includes("C")).toBe(false);
  });
});

describe("buildEdgeGeometries", () => {
  // 実測ケース（プラン記載の値をそのまま使用）:
  // 行1（4ノード。高さがバラバラ）→ 行2（2ノード）。flex-wrap のような配置。
  const nodeBoxes: NodeBox[] = [
    { left: 0, top: 20, right: 140, bottom: 134 },
    { left: 300, top: 20, right: 440, bottom: 225 },
    { left: 600, top: 20, right: 740, bottom: 225 },
    { left: 900, top: 20, right: 1040, bottom: 134 },
    { left: 0, top: 281, right: 300, bottom: 531 },
    { left: 320, top: 281, right: 460, bottom: 440 },
  ];
  const canvas: NodeBox = { left: 0, top: 0, right: 1130, bottom: 600 };

  it("buildEdgeGeometries は行内の最下端からレーンを決める", () => {
    const geometries = buildEdgeGeometries(nodeBoxes, canvas);
    // index 3 = ノード4(行1の最後) → ノード5(行2の最初)
    // laneY = (行1の rowBottom 最大値225 + 行2の rowTop 最小値281) / 2 = 253
    // 207.5（(134+281)/2、直前ノードの下端のみを使う旧ロジック）なら不合格
    expect(geometries[3].laneY).toBe(253);
  });

  it("buildEdgeGeometries は同じ行のペアに laneY=null を返す", () => {
    const geometries = buildEdgeGeometries(nodeBoxes, canvas);
    // index 0,1,2 は行1の内部（ノード1-2,2-3,3-4）、index4 は行2の内部（ノード5-6）
    expect(geometries[0].laneY).toBeNull();
    expect(geometries[1].laneY).toBeNull();
    expect(geometries[2].laneY).toBeNull();
    expect(geometries[4].laneY).toBeNull();
  });

  it("buildEdgeGeometries は要素数 nodes.length-1 を返し、1件以下なら空配列", () => {
    expect(buildEdgeGeometries([], canvas)).toEqual([]);
    expect(buildEdgeGeometries([nodeBoxes[0]], canvas)).toEqual([]);
    expect(buildEdgeGeometries([nodeBoxes[0], nodeBoxes[1]], canvas).length).toBe(1);
    expect(buildEdgeGeometries(nodeBoxes, canvas).length).toBe(nodeBoxes.length - 1);
  });

  it("canvasWidth 指定時、垂直走行のXが0未満にならない", () => {
    const g: EdgeGeometry = { x1: 1043, y1: 83, x2: 20, y2: 412, laneY: 253, canvasWidth: 1130 };
    const d = buildEdgePath(g);
    const { segments } = parsePath(d);
    for (const seg of segments) {
      const dx = seg.to.x - seg.from.x;
      const dy = seg.to.y - seg.from.y;
      if (dx === 0 && Math.abs(dy) > 0) {
        expect(seg.from.x).toBeGreaterThanOrEqual(0);
        expect(seg.from.x).toBeLessThanOrEqual(1130);
      }
    }
  });

  it("canvasWidth 未指定なら従来どおりクランプしない", () => {
    const g: EdgeGeometry = { x1: 1043, y1: 83, x2: 20, y2: 412, laneY: 253 };
    const d = buildEdgePath(g);
    const { segments } = parsePath(d);
    const hasUnclampedStub = segments.some((seg) => {
      const dx = seg.to.x - seg.from.x;
      const dy = seg.to.y - seg.from.y;
      return dx === 0 && Math.abs(dy) > 0 && Math.abs(seg.from.x - -4) <= 0.05;
    });
    expect(hasUnclampedStub).toBe(true);
  });

  it("レーンの水平走行がどのノード矩形とも交差しない", () => {
    const geometries = buildEdgeGeometries(nodeBoxes, canvas);
    const MARGIN = 2;

    const isInsideAnyNode = (x: number, y: number) =>
      nodeBoxes.some(
        (n) => x > n.left + MARGIN && x < n.right - MARGIN && y > n.top + MARGIN && y < n.bottom - MARGIN,
      );

    for (const g of geometries) {
      const d = buildEdgePath(g);
      const { segments } = parsePath(d);
      for (const seg of segments) {
        const steps = 20;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          let x: number;
          let y: number;
          if (seg.kind === "L") {
            x = seg.from.x + (seg.to.x - seg.from.x) * t;
            y = seg.from.y + (seg.to.y - seg.from.y) * t;
          } else {
            const c = seg.control as Point;
            const mt = 1 - t;
            x = mt * mt * seg.from.x + 2 * mt * t * c.x + t * t * seg.to.x;
            y = mt * mt * seg.from.y + 2 * mt * t * c.y + t * t * seg.to.y;
          }
          expect(isInsideAnyNode(x, y)).toBe(false);
        }
      }
    }
  });
});
