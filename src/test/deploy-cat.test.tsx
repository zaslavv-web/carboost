import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DeployCheckCat from "@/components/landing/DeployCheckCat";

describe("маркер проверки доставки", () => {
  it("рисует котика и показывает версию из version.json", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: "abc1234", built_at: "2026-08-28T12:00:00Z" }),
    })));

    render(<DeployCheckCat />);
    expect(screen.getByRole("img", { name: /Котик/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("abc1234")).toBeInTheDocument());
  });

  it("не падает, если version.json недоступен", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));

    render(<DeployCheckCat />);
    await waitFor(() => expect(screen.getByText(/version.json недоступен/i)).toBeInTheDocument());
  });
});
