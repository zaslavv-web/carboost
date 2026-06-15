import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

type Role = "employee" | "manager" | "hrd" | "company_admin" | "superadmin";

const state = {
  rewardsPublic: [
    { id: "rt-1", title: "Звезда", icon: "star", points: 10, description: null },
    { id: "rt-2", title: "Ракета", icon: "rocket", points: 25, description: null },
  ] as any[],
  employeeRewards: [
    { id: "er-1", user_id: "user-1", reward_type_id: "rt-1", awarded_at: "2026-01-10T00:00:00Z", description: null },
    { id: "er-2", user_id: "user-1", reward_type_id: "rt-2", awarded_at: "2026-01-12T00:00:00Z", description: null },
  ] as any[],
  fromCalls: [] as string[],
};

const tablesEmpty: Record<string, any[]> = {
  career_goals: [],
  goal_checklist_items: [],
  employee_career_assignments: [],
  career_track_templates: [],
  career_level_actions: [],
  positions: [],
};

function makeBuilder(table: string) {
  state.fromCalls.push(table);
  const result = (): any => {
    let data: any[] = [];
    if (table === "gamification_rewards_public") data = state.rewardsPublic;
    else if (table === "employee_rewards") data = state.employeeRewards;
    else data = tablesEmpty[table] ?? [];
    return Promise.resolve({ data, error: null, count: null });
  };
  const handler: ProxyHandler<any> = {
    get(_t, prop) {
      if (prop === "then") {
        const p = result();
        return p.then.bind(p);
      }
      return (..._args: any[]) => builder;
    },
  };
  const builder: any = new Proxy(function () {}, handler);
  return builder;
}

vi.mock("@/integrations/laravel/db", () => ({
  laravelDb: { from: (table: string) => makeBuilder(table) },
}));

const mocks = vi.hoisted(() => ({ role: "employee" as Role }));

vi.mock("@/hooks/useEffectiveUser", () => ({
  useEffectiveUserId: () => "user-1",
  useEffectiveUser: () => ({ userId: "user-1", role: mocks.role }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) =>
      opts && typeof opts === "object" && "count" in opts ? `${key}:${opts.count}` : key,
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock("@/components/CareerTrackStepCard", () => ({
  __esModule: true,
  default: () => null,
}));

import CareerTrack from "@/pages/CareerTrack";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CareerTrack />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.fromCalls = [];
  state.rewardsPublic = [
    { id: "rt-1", title: "Звезда", icon: "star", points: 10, description: null },
    { id: "rt-2", title: "Ракета", icon: "rocket", points: 25, description: null },
  ];
  state.employeeRewards = [
    { id: "er-1", user_id: "user-1", reward_type_id: "rt-1", awarded_at: "2026-01-10T00:00:00Z", description: null },
    { id: "er-2", user_id: "user-1", reward_type_id: "rt-2", awarded_at: "2026-01-12T00:00:00Z", description: null },
  ];
});

afterEach(() => cleanup());

const roles: Role[] = ["employee", "manager", "hrd", "company_admin", "superadmin"];

describe("CareerTrack rewards tab", () => {
  it.each(roles)("queries gamification_rewards_public (not the base table) for role %s", async (role) => {
    mocks.role = role;
    renderPage();
    await waitFor(() => {
      expect(state.fromCalls).toContain("gamification_rewards_public");
    });
    expect(state.fromCalls).not.toContain("gamification_reward_types");
  });

  it.each(roles)("renders reward titles, per-reward points and total for role %s", async (role) => {
    mocks.role = role;
    renderPage();

    // total points (10 + 25 = 35) is shown in the header stat block immediately
    await waitFor(() => {
      expect(screen.getAllByText("35").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "careerTrack.tabs.rewards" }));

    await waitFor(() => {
      expect(screen.getByText("Звезда")).toBeInTheDocument();
      expect(screen.getByText("Ракета")).toBeInTheDocument();
    });
    expect(screen.getByText("+10")).toBeInTheDocument();
    expect(screen.getByText("+25")).toBeInTheDocument();
    expect(screen.getByText("careerTrack.totalPoints:35")).toBeInTheDocument();
  });

  it.each(roles)("does not render sensitive reward fields for role %s", async (role) => {
    mocks.role = role;
    // Inject sensitive-looking fields; component should ignore them.
    state.rewardsPublic = state.rewardsPublic.map((r) => ({
      ...r,
      gift_content: "SECRET-GIFT-CODE",
      monetary_amount: 9999,
    }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "careerTrack.tabs.rewards" }));
    await waitFor(() => expect(screen.getByText("Звезда")).toBeInTheDocument());
    expect(screen.queryByText(/SECRET-GIFT-CODE/)).toBeNull();
    expect(screen.queryByText(/9999/)).toBeNull();
  });

  it("shows empty state and zero total when employee has no rewards", async () => {
    mocks.role = "employee";
    state.employeeRewards = [];
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "careerTrack.tabs.rewards" }));
    await waitFor(() => {
      expect(screen.getByText("careerTrack.noRewards")).toBeInTheDocument();
    });
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });
});
