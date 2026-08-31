/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryView } from "./HistoryView";

afterEach(() => cleanup());

describe("HistoryView", () => {
  it("onRefresh は引数なしで呼ばれる", () => {
    const onRefresh = vi.fn();
    render(
      <HistoryView
        snapshots={[]}
        loading={false}
        error={null}
        onRefresh={onRefresh}
        onDelete={vi.fn()}
        onCompare={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "↻ 履歴を更新" }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledWith();
  });
});
