import { describe, expect, it } from "vitest";
import { findHarnessFindings } from "./findings";
import type { HarnessMcpServer } from "./schema";

function mcp(overrides: Partial<HarnessMcpServer>): HarnessMcpServer {
  return {
    id: "mcp",
    scope: "project",
    transport: "stdio",
    status: "connected",
    category: null,
    ...overrides,
  };
}

describe("findHarnessFindings", () => {
  it("設定が違う重複を divergent として検出する", () => {
    const findings = findHarnessFindings({
      mcpServers: [
        mcp({ id: "notion", scope: "connector", transport: "http", host: "mcp.notion.com", projectLabel: undefined }),
        mcp({
          id: "notion",
          scope: "project",
          transport: "stdio",
          commandSummary: "npx -y @notionhq/notion-mcp-server",
          projectLabel: "board",
        }),
      ],
    } as never);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: "mcp-divergent:notion",
      kind: "divergent",
      title: "notion が2箇所で別々の設定になっています",
      question: "意図的ですか？ 同じ名前で中身が違うと、どちらが使われるか分かりにくくなります。",
    });
  });

  it("設定が同じ重複を redundant として検出する", () => {
    const findings = findHarnessFindings({
      mcpServers: [
        mcp({ id: "analytics-db", scope: "project", transport: "stdio", commandSummary: "npx analytics-db", projectLabel: "project-a" }),
        mcp({ id: "analytics-db", scope: "project", transport: "stdio", commandSummary: "npx analytics-db", projectLabel: "project-b" }),
      ],
    } as never);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: "mcp-redundant:analytics-db",
      kind: "redundant",
      title: "analytics-db が2つのプロジェクトに同じ設定で登録されています",
      question: "意図的ですか？ global スコープにまとめると1つで済みます。",
    });
  });

  it("一部だけ設定が違う場合も divergent になる", () => {
    const findings = findHarnessFindings({
      mcpServers: [
        mcp({ id: "playwright", scope: "project", transport: "stdio", commandSummary: "npx @playwright/mcp --headless", projectLabel: "project-a" }),
        mcp({ id: "playwright", scope: "project", transport: "stdio", commandSummary: "npx @playwright/mcp@latest", projectLabel: "project-b" }),
        mcp({ id: "playwright", scope: "project", transport: "stdio", commandSummary: "npx @playwright/mcp@latest", projectLabel: "project-c" }),
      ],
    } as never);

    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("divergent");
    expect(findings[0].entries).toHaveLength(3);
  });

  it("重複が無ければ空配列を返す", () => {
    const findings = findHarnessFindings({
      mcpServers: [
        mcp({ id: "notion", scope: "connector", transport: "http", host: "mcp.notion.com" }),
        mcp({ id: "playwright", scope: "project", transport: "stdio", commandSummary: "npx @playwright/mcp@latest" }),
      ],
    } as never);

    expect(findings).toEqual([]);
  });

  it("entries に projectLabel が入り、無ければ scope になる", () => {
    const findings = findHarnessFindings({
      mcpServers: [
        mcp({ id: "analytics-db", scope: "project", transport: "stdio", commandSummary: "npx analytics-db", projectLabel: "client-a" }),
        mcp({ id: "analytics-db", scope: "global", transport: "stdio", commandSummary: "npx analytics-db" }),
      ],
    } as never);

    expect(findings[0].entries).toEqual([
      { label: "client-a", detail: "npx analytics-db" },
      { label: "global", detail: "npx analytics-db" },
    ]);
  });

  it("divergent が redundant より前に並ぶ", () => {
    const findings = findHarnessFindings({
      mcpServers: [
        mcp({ id: "analytics-db", scope: "project", transport: "stdio", commandSummary: "npx analytics-db" }),
        mcp({ id: "analytics-db", scope: "project", transport: "stdio", commandSummary: "npx analytics-db" }),
        mcp({ id: "notion", scope: "connector", transport: "http", host: "mcp.notion.com" }),
        mcp({ id: "notion", scope: "project", transport: "stdio", commandSummary: "npx -y @notionhq/notion-mcp-server" }),
      ],
    } as never);

    expect(findings.map((f) => f.kind)).toEqual(["divergent", "redundant"]);
    expect(findings.map((f) => f.id)).toEqual(["mcp-divergent:notion", "mcp-redundant:analytics-db"]);
  });
});
