import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  signOut: vi.fn(async () => undefined),
  startImpersonation: vi.fn(async () => undefined),
  rpc: vi.fn(async () => ({ data: { ok: true }, error: null })),
  adminCreateUser: vi.fn(async () => ({ data: { user: { id: "u-new" } }, error: null })),
  laravelGet: vi.fn(async () => ({ data: null, error: null })),
  laravelPut: vi.fn(async () => ({ data: { setting: {} }, error: null })),
  laravelPost: vi.fn(async () => ({ data: { ok: true, setting: {} }, error: null })),
  role: "superadmin",
  realRole: "superadmin",
  currentUser: { id: "admin-1", email: "admin@example.com", roles: ["superadmin"] },
  profile: { id: "p-admin", user_id: "admin-1", full_name: "Super Admin", position: "Суперадмин", company_id: null, is_verified: true },
  db: {
    profiles: { data: [] as any[], error: null as null | { message: string } },
    user_roles: { data: [] as any[], error: null as null | { message: string } },
    companies: { data: [] as any[], error: null as null | { message: string } },
  },
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => mocks.navigate,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.currentUser, signOut: mocks.signOut }),
}));

vi.mock("@/contexts/ImpersonationContext", () => ({
  useImpersonation: () => ({ startImpersonation: mocks.startImpersonation }),
}));

vi.mock("@/hooks/useUserProfile", () => ({
  usePrimaryRole: () => mocks.role,
  useRealPrimaryRole: () => mocks.realRole,
  useUserProfile: () => ({ data: mocks.profile, isLoading: false }),
}));

vi.mock("@/integrations/laravel/db", () => ({
  laravelDb: {
    from: (table: "profiles" | "user_roles" | "companies") => ({
      select: vi.fn(async () => mocks.db[table] ?? { data: [], error: null }),
    }),
  },
}));

vi.mock("@/integrations/laravel/rpc", () => ({ laravelRpc: mocks.rpc }));
vi.mock("@/integrations/laravel/auth", () => ({ laravelAuthApi: { adminCreateUser: mocks.adminCreateUser } }));
vi.mock("@/integrations/laravel/client", () => ({
  laravel: { get: mocks.laravelGet, put: mocks.laravelPut, post: mocks.laravelPost },
}));

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("smoke-тесты критичных кнопок продукта", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = "superadmin";
    mocks.realRole = "superadmin";
    mocks.currentUser = { id: "admin-1", email: "admin@example.com", roles: ["superadmin"] };
    mocks.profile = { id: "p-admin", user_id: "admin-1", full_name: "Super Admin", position: "Суперадмин", company_id: null, is_verified: true };
    mocks.db.companies = { data: [{ id: "c1", name: "Acme" }], error: null };
    mocks.db.profiles = {
      data: [
        { id: "p1", user_id: "hrd-1", full_name: "HRD User", position: "HRD", department: "HR", company_id: "c1", is_verified: true },
        { id: "p2", user_id: "emp-1", full_name: "Pending User", position: "Dev", department: "IT", company_id: "c1", is_verified: false },
      ],
      error: null,
    };
    mocks.db.user_roles = { data: [{ user_id: "hrd-1", role: "hrd" }, { user_id: "emp-1", role: "employee" }], error: null };
    mocks.laravelGet.mockResolvedValue({
      data: {
        setting: {
          id: "smtp-1",
          provider: "custom",
          host: "smtp.example.com",
          port: 587,
          encryption: "tls",
          username: "mailer@example.com",
          from_address: "no-reply@example.com",
          from_name: "Career Track",
          reply_to_address: null,
          is_active: true,
          has_password: true,
          last_tested_at: null,
          last_test_error: null,
        },
        presets: { custom: { label: "Custom", host: "", port: 587, encryption: "tls", hint: "Введите параметры SMTP-сервера." } },
      },
      error: null,
    });
  });

  afterEach(() => cleanup());

  it("кнопки управления пользователями вызывают нужные действия", async () => {
    const UsersManagement = (await import("@/pages/UsersManagement")).default;
    renderWithProviders(<UsersManagement />);

    expect(await screen.findByText("HRD User")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Войти как/i }));
    await waitFor(() => expect(mocks.startImpersonation).toHaveBeenCalledWith("hrd-1", "HRD User", expect.objectContaining({ roles: ["hrd"] })));
    expect(mocks.navigate).toHaveBeenCalledWith("/dashboard");

    fireEvent.click(screen.getByRole("button", { name: /Подтвердить/i }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("verify_user", { _target_user_id: "emp-1" }));

    fireEvent.click(screen.getAllByRole("button", { name: /Удалить/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Отмена/i }));
    expect(screen.queryByRole("button", { name: /Да, удалить/i })).not.toBeInTheDocument();
  });

  it("кнопка создания пользователя открывает форму и отправляет приглашение", async () => {
    const UsersManagement = (await import("@/pages/UsersManagement")).default;
    renderWithProviders(<UsersManagement />);

    fireEvent.click(await screen.findByRole("button", { name: /Создать пользователя/i }));
    fireEvent.change(screen.getByPlaceholderText("Иванов Иван"), { target: { value: "Иван Иванов" } });
    fireEvent.change(screen.getByPlaceholderText("user@example.com"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Создать и отправить приглашение/i }));

    await waitFor(() => expect(mocks.adminCreateUser).toHaveBeenCalledWith(expect.objectContaining({ full_name: "Иван Иванов", email: "new@example.com", role: "employee" })));
  });

  it("кнопки почтового сервиса сохраняют SMTP и отправляют тест", async () => {
    const EmailSettingsManagement = (await import("@/pages/EmailSettingsManagement")).default;
    renderWithProviders(<EmailSettingsManagement />);

    await screen.findByText("Почтовый сервис");
    fireEvent.click(screen.getByRole("button", { name: /Сохранить SMTP/i }));
    await waitFor(() => expect(mocks.laravelPut).toHaveBeenCalledWith("/admin/email-settings", expect.objectContaining({ host: "smtp.example.com", username: "mailer@example.com" })));

    fireEvent.click(screen.getByRole("button", { name: /Отправить тест/i }));
    await waitFor(() => expect(mocks.laravelPost).toHaveBeenCalledWith("/admin/email-settings/test", { to: "no-reply@example.com" }));
  });

  it("кнопки сайдбара ведут в разделы суперадмина и выполняют выход", async () => {
    const AppSidebar = (await import("@/components/AppSidebar")).default;
    renderWithProviders(<AppSidebar collapsed={false} onToggle={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Почтовый сервис/i }));
    expect(mocks.navigate).toHaveBeenCalledWith("/email-settings");
    fireEvent.click(screen.getByRole("button", { name: /Пользователи/i }));
    expect(mocks.navigate).toHaveBeenCalledWith("/users");
    fireEvent.click(screen.getByRole("button", { name: /Выйти/i }));
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith("/login");
  });

  it("групповые кнопки HRD раскрывают меню и ведут в дочерние разделы", async () => {
    mocks.role = "hrd";
    mocks.realRole = "hrd";
    mocks.profile = { ...mocks.profile, company_id: "c1", position: "HRD" };
    const AppSidebar = (await import("@/components/AppSidebar")).default;
    renderWithProviders(<AppSidebar collapsed={false} onToggle={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /^Сотрудники/i }));
    fireEvent.click(screen.getByRole("button", { name: /Список сотрудников/i }));
    expect(mocks.navigate).toHaveBeenCalledWith("/employees");

    fireEvent.click(screen.getByRole("button", { name: /^Аналитика/i }));
    fireEvent.click(screen.getByRole("button", { name: /Риски и удержание/i }));
    expect(mocks.navigate).toHaveBeenCalledWith("/risk-analytics");
  });
});