import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TrackerProjectProvider, useTrackerProject } from "@/contexts/TrackerProjectContext";

/**
 * Активный проект трекера хранится в localStorage и переживает удаление
 * проекта, смену компании и выход из аккаунта. «Мёртвый» id опасен тем, что
 * не виден: пикер показывает Inbox, а задачи молча фильтруются по проекту,
 * которого нет. Поэтому проверяем именно сброс, а не отсутствие ошибки.
 */

const mocks = vi.hoisted(() => ({ maybeSingle: vi.fn() }));

vi.mock("@/integrations/laravel/db", () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => mocks.maybeSingle(),
  };
  return { laravelDb: { from: () => chain } };
});
vi.mock("@/hooks/useUserProfile", () => ({ useEffectiveUserId: () => "u1" }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const LS_KEY = "tracker.activeProjectId";
const STALE = "a292fbe8-4bfc-4954-bf9a-a3898eae39dc";

const Probe = () => {
  const { projectId } = useTrackerProject();
  return <span data-testid="pid">{projectId ?? "inbox"}</span>;
};

const renderTracker = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TrackerProjectProvider>
        <Probe />
      </TrackerProjectProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => cleanup());

describe("активный проект трекера", () => {
  it("несуществующий проект сбрасывается на Inbox", async () => {
    localStorage.setItem(LS_KEY, STALE);
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    renderTracker();

    await waitFor(() => expect(screen.getByTestId("pid")).toHaveTextContent("inbox"));
    expect(localStorage.getItem(LS_KEY)).toBeNull();
  });

  it("живой проект остаётся выбранным", async () => {
    localStorage.setItem(LS_KEY, STALE);
    mocks.maybeSingle.mockResolvedValue({ data: { id: STALE, name: "Проект" }, error: null });

    renderTracker();

    await waitFor(() => expect(mocks.maybeSingle).toHaveBeenCalled());
    expect(screen.getByTestId("pid")).toHaveTextContent(STALE);
    expect(localStorage.getItem(LS_KEY)).toBe(STALE);
  });

  it("сетевой сбой не сбрасывает выбор пользователя", async () => {
    localStorage.setItem(LS_KEY, STALE);
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "Failed to fetch", status: 503 } });

    renderTracker();

    await waitFor(() => expect(mocks.maybeSingle).toHaveBeenCalled());
    expect(localStorage.getItem(LS_KEY)).toBe(STALE);
  });
});
