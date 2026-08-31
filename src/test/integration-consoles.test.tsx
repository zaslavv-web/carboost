import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import OutboundConsole from "@/pages/integration/OutboundConsole";
import InboundConsole from "@/pages/integration/InboundConsole";

/**
 * Консоли публичные и авторизуются только API-ключом, поэтому проверяем
 * главное: без ключа наружу ничего не уходит, перечень методов берётся из
 * ответа API (а не из захардкоженного списка), и запрос уходит по адресу и с
 * телом, которые ожидает бэкенд.
 */

const META = {
  version: "v1",
  scopes: ["departments:read", "departments:write", "events:read"],
  events: ["departments.created"],
  resources: [
    {
      name: "departments",
      title: "Подразделения",
      scope_read: "departments:read",
      scope_write: "departments:write",
      granted: { read: true, write: true },
      operations: ["list", "read", "create", "update", "delete"],
      fields: { read: ["id", "name"], write: ["name", "parent_id"] },
      filters: ["name"],
      external_id: true,
      events: ["departments.created"],
    },
    {
      name: "positions",
      title: "Должности",
      scope_read: "positions:read",
      scope_write: "positions:write",
      granted: { read: false, write: false },
      operations: ["list", "read"],
      fields: { read: ["id", "title"], write: [] },
      filters: [],
      external_id: true,
      events: [],
    },
  ],
};

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
});

let fetchMock: ReturnType<typeof vi.fn>;

const connect = async (key = "gp_test_secret") => {
  fireEvent.change(screen.getByLabelText("API-ключ"), { target: { value: key } });
  fireEvent.click(screen.getByRole("button", { name: /Подключиться/i }));
};

beforeEach(() => {
  sessionStorage.clear();
  fetchMock = vi.fn(async () => jsonResponse(META));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("консоль выдачи данных", () => {
  it("без ключа не делает ни одного запроса", () => {
    render(<MemoryRouter><OutboundConsole /></MemoryRouter>);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Подразделения")).not.toBeInTheDocument();
  });

  it("перечень методов приходит из ответа API", async () => {
    render(<MemoryRouter><OutboundConsole /></MemoryRouter>);
    await connect();

    await waitFor(() => expect(screen.getByText("Подразделения")).toBeInTheDocument());
    expect(screen.getByText(/Методы выдачи данных/)).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/integration/v1/meta/resources");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer gp_test_secret");
  });

  it("«Получить данные» уходит на нужный ресурс с лимитом", async () => {
    render(<MemoryRouter><OutboundConsole /></MemoryRouter>);
    await connect();
    await waitFor(() => expect(screen.getByText("Подразделения")).toBeInTheDocument());

    fetchMock.mockImplementation(async () => jsonResponse({ data: [{ id: "d1", name: "IT" }], page: {} }));
    fireEvent.click(screen.getAllByRole("button", { name: /Получить данные/i })[0]);

    await waitFor(() => expect(screen.getByText("IT")).toBeInTheDocument());
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/integration/v1/departments?limit=10");
  });

  it("ресурс без права чтения нельзя запросить", async () => {
    render(<MemoryRouter><OutboundConsole /></MemoryRouter>);
    await connect();
    await waitFor(() => expect(screen.getByText("Должности")).toBeInTheDocument());

    const buttons = screen.getAllByRole("button", { name: /Получить данные/i });
    // Второй ресурс в META идёт без granted.read.
    expect(buttons[1]).toBeDisabled();
    expect(screen.getByText(/ключу не выдан скоуп positions:read/i)).toBeInTheDocument();
  });

  it("отказ API показывается с кодом, а не молча", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ message: "Ключ отозван" }, 401));
    render(<MemoryRouter><OutboundConsole /></MemoryRouter>);
    await connect();

    await waitFor(() => expect(screen.getByText("Ключ отозван")).toBeInTheDocument());
    expect(screen.getByText(/Подключиться не удалось/i)).toBeInTheDocument();
  });
});

describe("консоль приёма данных", () => {
  const connectAndFill = async () => {
    render(<MemoryRouter><InboundConsole /></MemoryRouter>);
    await connect();
    await waitFor(() => expect(screen.getByLabelText(/Идентификатор системы/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Идентификатор системы/i), { target: { value: "1c_zup" } });
    fireEvent.change(screen.getByLabelText(/Идентификатор записи/i), { target: { value: "00-1" } });
  };

  it("поля формы берутся из fields.write ресурса", async () => {
    await connectAndFill();
    expect(screen.getByLabelText("name")).toBeInTheDocument();
    expect(screen.getByLabelText("parent_id")).toBeInTheDocument();
    // Поле только для чтения в форму попасть не должно.
    expect(screen.queryByLabelText("id")).not.toBeInTheDocument();
  });

  it("отправляет upsert с внешним ключом и только заполненными полями", async () => {
    await connectAndFill();
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Склад" } });

    fetchMock.mockImplementation(async () => jsonResponse({ data: { id: "d9" }, created: true }, 201));
    fireEvent.click(screen.getByRole("button", { name: /Отправить в систему/i }));

    await waitFor(() => expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/integration/v1/departments/upsert"));
    const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      external_system: "1c_zup",
      external_id: "00-1",
      // parent_id остался пустым — пустая строка затёрла бы значение в системе.
      data: { name: "Склад" },
    });
  });

  it("не отправляет запрос, пока не заполнено ни одного поля", async () => {
    await connectAndFill();
    const before = fetchMock.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /Отправить в систему/i }));

    await waitFor(() => expect(screen.getByText(/Не заполнено ни одно поле/i)).toBeInTheDocument());
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it("требует идентификатор внешней системы", async () => {
    render(<MemoryRouter><InboundConsole /></MemoryRouter>);
    await connect();
    await waitFor(() => expect(screen.getByLabelText("name")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Склад" } });

    fireEvent.click(screen.getByRole("button", { name: /Отправить в систему/i }));

    await waitFor(() =>
      expect(screen.getByText(/Укажите идентификатор внешней системы/i)).toBeInTheDocument());
  });
});
