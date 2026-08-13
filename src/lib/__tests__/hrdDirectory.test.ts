import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const limit = vi.fn();
const order = vi.fn(() => ({ limit }));
const select = vi.fn(() => ({ order }));
const from = vi.fn(() => ({ select }));

vi.mock("@/integrations/laravel/client", () => ({ laravel: { get } }));
vi.mock("@/integrations/laravel/db", () => ({ laravelDb: { from } }));

import { fetchHrdDirectory, fetchHrdPositions } from "@/lib/hrdDirectory";

describe("HRD directory requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({ data: { data: [{ id: "profile-1" }] }, error: null });
    limit.mockResolvedValue({ data: [{ id: "position-1" }], error: null });
  });

  it("loads the employee directory once without a client company override", async () => {
    await expect(fetchHrdDirectory()).resolves.toEqual([{ id: "profile-1" }]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/profiles?per_page=200");
  });

  it("loads only the position fields used by the HRD screen with a hard limit", async () => {
    await expect(fetchHrdPositions()).resolves.toEqual([{ id: "position-1" }]);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("positions");
    expect(select).toHaveBeenCalledWith(
      "id,title,department,competency_profile,psychological_profile",
    );
    expect(order).toHaveBeenCalledWith("title");
    expect(limit).toHaveBeenCalledWith(200);
  });
});