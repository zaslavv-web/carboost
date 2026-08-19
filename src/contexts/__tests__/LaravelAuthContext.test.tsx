import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LaravelAuthProvider, useLaravelAuth } from "../LaravelAuthContext";
import { laravelAuth } from "@/integrations/laravel/client";

// LaravelAuthProvider использует useQueryClient (сброс кеша при выходе/логине),
// поэтому в тестах его нужно оборачивать в QueryClientProvider.
const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

function mockJson(body: any, status = 200) {
  (globalThis.fetch as any).mockResolvedValueOnce({
    ok: status < 300,
    status,
    statusText: "OK",
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
  });
}

const Probe = () => {
  const { user, loading, signInWithPassword, signOut } = useLaravelAuth();
  return (
    <div>
      <span data-testid="loading">{loading ? "1" : "0"}</span>
      <span data-testid="email">{user?.email ?? "-"}</span>
      <button onClick={() => signInWithPassword("a@b.c", "secret123")}>login</button>
      <button onClick={() => signOut()}>logout</button>
    </div>
  );
};

describe("LaravelAuthProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn() as any;
    Object.defineProperty(window, "location", {
      value: { origin: "https://app.local", pathname: "/", search: "", hash: "" },
      writable: true,
    });
    window.history.replaceState = vi.fn() as any;
  });
  afterEach(() => vi.restoreAllMocks());

  it("starts loading, then null user when no token", async () => {
    renderWithProviders(<LaravelAuthProvider><Probe /></LaravelAuthProvider>);
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("0"));
    expect(screen.getByTestId("email").textContent).toBe("-");
  });

  it("hydrates from existing token via /auth/me", async () => {
    // Токен должен выглядеть как Sanctum-токен (`id|hash`), иначе провайдер
    // считает сессию повреждённой и не идёт в /auth/me.
    laravelAuth.setToken("12|abcdefghijklmnopqrstuvwxyz0123456789ABCD");
    mockJson({ id: "u1", email: "me@x.io" });
    renderWithProviders(<LaravelAuthProvider><Probe /></LaravelAuthProvider>);
    await waitFor(() => expect(screen.getByTestId("email").textContent).toBe("me@x.io"));
  });

  it("login + logout cycle updates user", async () => {
    renderWithProviders(<LaravelAuthProvider><Probe /></LaravelAuthProvider>);
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("0"));

    mockJson({ token: "t-1", user: { id: "u1", email: "a@b.c" } });
    await act(async () => { screen.getByText("login").click(); });
    await waitFor(() => expect(screen.getByTestId("email").textContent).toBe("a@b.c"));
    expect(laravelAuth.getToken()).toBe("t-1");

    mockJson({ ok: true });
    await act(async () => { screen.getByText("logout").click(); });
    await waitFor(() => expect(screen.getByTestId("email").textContent).toBe("-"));
    expect(laravelAuth.getToken()).toBeNull();
  });
});
