import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import ApiKeysCard from "@/components/integrations/ApiKeysCard";

/**
 * Выбор компании — это граница доступа, а не удобство формы: компания ключа
 * определяет, чьи данные он увидит. Поэтому проверяем, что поле появляется
 * только у суперадмина и что выбранное значение действительно уходит на сервер.
 */

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(async () => ({ data: { token: "gp_x_y" }, error: null })),
  delete: vi.fn(async () => ({ data: null, error: null })),
  toastError: vi.fn(),
}));

vi.mock("@/integrations/laravel/client", () => ({
  laravel: { get: mocks.get, post: mocks.post, delete: mocks.delete },
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: mocks.toastError },
}));

const COMPANIES = [
  { id: "c1", name: "Первая" },
  { id: "c2", name: "Вторая" },
];

const setup = (isSuperadmin: boolean, keys: unknown[] = []) => {
  mocks.get.mockImplementation(async (url: string) => {
    if (url.includes("/companies")) {
      return { data: { is_superadmin: isSuperadmin, companies: isSuperadmin ? COMPANIES : [COMPANIES[0]] }, error: null };
    }
    if (url.includes("/scopes")) {
      return { data: { scopes: ["departments:read", "departments:write"] }, error: null };
    }
    return { data: keys, error: null };
  });
  render(<ApiKeysCard />);
};

const openDialog = async () => {
  fireEvent.click(screen.getByRole("button", { name: /Создать ключ/i }));
  await waitFor(() => expect(screen.getByLabelText("Название")).toBeInTheDocument());
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("карточка ключей API", () => {
  it("администратору компании выбор не показывается", async () => {
    setup(false);
    await openDialog();

    expect(screen.queryByLabelText("Компания")).not.toBeInTheDocument();
  });

  it("суперадмину показывается выбор со списком компаний", async () => {
    setup(true);
    await openDialog();

    const select = screen.getByLabelText("Компания");
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Первая" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Вторая" })).toBeInTheDocument();
  });

  it("суперадмин не может создать ключ, не выбрав компанию", async () => {
    setup(true);
    await openDialog();

    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "ключ" } });
    fireEvent.click(screen.getByLabelText("departments:read"));
    fireEvent.click(screen.getByRole("button", { name: /^Создать$/ }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Выберите компанию, для которой выпускается ключ"));
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("выбранная компания уходит в запрос", async () => {
    setup(true);
    await openDialog();

    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "для клиента" } });
    fireEvent.change(screen.getByLabelText("Компания"), { target: { value: "c2" } });
    fireEvent.click(screen.getByLabelText("departments:read"));
    fireEvent.click(screen.getByRole("button", { name: /^Создать$/ }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    expect(mocks.post.mock.calls[0][1]).toMatchObject({
      name: "для клиента",
      company_id: "c2",
      scopes: ["departments:read"],
    });
  });

  it("администратор компании не передаёт company_id — сервер подставит свою", async () => {
    setup(false);
    await openDialog();

    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "ключ" } });
    fireEvent.click(screen.getByLabelText("departments:read"));
    fireEvent.click(screen.getByRole("button", { name: /^Создать$/ }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    expect(mocks.post.mock.calls[0][1]).toMatchObject({ company_id: null });
  });

  it("в списке суперадмина видно, какой компании принадлежит ключ", async () => {
    setup(true, [{
      id: "k1", name: "ключ", prefix: "abc", scopes: ["departments:read"],
      company_id: "c2", company_name: "Вторая",
      expires_at: null, last_used_at: null, revoked_at: null, created_at: "2026-08-31T00:00:00Z",
    }]);

    await waitFor(() => expect(screen.getByText("Вторая")).toBeInTheDocument());
  });

  it("администратору компании название компании в списке не дублируется", async () => {
    setup(false, [{
      id: "k1", name: "ключ", prefix: "abc", scopes: ["departments:read"],
      company_id: "c1", company_name: "Первая",
      expires_at: null, last_used_at: null, revoked_at: null, created_at: "2026-08-31T00:00:00Z",
    }]);

    await waitFor(() => expect(screen.getByText("ключ")).toBeInTheDocument());
    expect(screen.queryByText("Первая")).not.toBeInTheDocument();
  });
});
