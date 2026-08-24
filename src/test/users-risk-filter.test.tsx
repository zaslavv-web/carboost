import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * Регрессия на drill-down из Risk Analytics: /users?risk=high
 * должен показать только сотрудников с высоким риском.
 */
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  profiles: [
    { id: "p1", user_id: "u-high", full_name: "Высокий Риск", position: "Dev", department: "IT", company_id: "c1", is_verified: true, roles: ["employee"] },
    { id: "p2", user_id: "u-low", full_name: "Низкий Риск", position: "Dev", department: "IT", company_id: "c1", is_verified: true, roles: ["employee"] },
  ],
  risks: [
    { user_id: "u-high", risk_level: "high" },
    { user_id: "u-low", risk_level: "low" },
  ],
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => mocks.navigate,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "hrd-1", email: "hrd@example.com", roles: ["hrd"] }, signOut: vi.fn() }),
}));

vi.mock("@/contexts/ImpersonationContext", () => ({
  useImpersonation: () => ({ startImpersonation: vi.fn() }),
}));

vi.mock("@/hooks/useUserProfile", () => ({
  usePrimaryRole: () => "hrd",
  useRealPrimaryRole: () => "hrd",
  useUserProfile: () => ({ data: { id: "p-hrd", user_id: "hrd-1", full_name: "HRD", company_id: "c1", is_verified: true }, isLoading: false }),
}));

vi.mock("@/integrations/laravel/db", () => ({
  laravelDb: {
    from: (table: string) => ({
      select: vi.fn(async () => {
        if (table === "employee_risk_scores") return { data: mocks.risks, error: null };
        if (table === "profiles") return { data: mocks.profiles, error: null };
        return { data: [], error: null };
      }),
    }),
  },
}));

vi.mock("@/integrations/laravel/rpc", () => ({ laravelRpc: vi.fn(async () => ({ data: null, error: null })) }));
vi.mock("@/integrations/laravel/auth", () => ({ laravelAuthApi: { adminCreateUser: vi.fn() } }));
vi.mock("@/integrations/laravel/client", () => ({
  laravel: {
    get: vi.fn(async (url: string) =>
      String(url).startsWith("/profiles")
        ? { data: { data: mocks.profiles }, error: null }
        : { data: null, error: null },
    ),
    put: vi.fn(),
    post: vi.fn(),
  },
}));

describe("drill-down фильтров в списке сотрудников", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("?risk=high оставляет только сотрудников с высоким риском", async () => {
    const UsersManagement = (await import("@/pages/UsersManagement")).default;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/users?risk=high"]}>
          <UsersManagement />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Высокий Риск")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Низкий Риск")).not.toBeInTheDocument());
  });
});
