import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { metricsCatalog } from "@/lib/metricsCatalog";

/**
 * Кнопка «Открыть раздел» в поповере метрики ведёт по href из справочника.
 * Если href не совпадает ни с одним роутом App.tsx — кнопка «ничего не делает».
 */
const appSource = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");
const routes = new Set(
  Array.from(appSource.matchAll(/path="([^"]+)"/g)).map((m) => m[1]),
);

const matchesRoute = (path: string) => {
  const clean = path.split("?")[0];
  if (routes.has(clean)) return true;
  // Вложенные роуты (<Route path="/tracker"><Route path="board" .../></Route>)
  const parts = clean.replace(/^\//, "").split("/");
  for (let i = 1; i < parts.length; i += 1) {
    const parent = `/${parts.slice(0, i).join("/")}`;
    const child = parts.slice(i).join("/");
    if (routes.has(parent) && routes.has(child)) return true;
  }
  return false;
};

describe("metricsCatalog hrefs", () => {
  it("каждая ссылка метрики соответствует существующему роуту", () => {
    const broken = Object.values(metricsCatalog)
      .map((m: any) => m.href)
      .filter((href: string | undefined): href is string => Boolean(href))
      .filter((href) => !matchesRoute(href));

    expect(broken).toEqual([]);
  });
});
