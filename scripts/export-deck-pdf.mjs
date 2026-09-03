/**
 * Собирает PDF презентации для инвесторов из живых слайдов /investor-deck.
 *
 * Каждый слайд снимается в браузере в 1920×1080 (в двойной плотности) и кладётся
 * картинкой на страницу PDF 16:9. Текст в файле растровый — это осознанный выбор:
 * PDF со встроенными шрифтами телефонные просмотрщики подменяют своими и ломают
 * кириллицу, картинка же выглядит одинаково везде.
 *
 * Запуск (dev-сервер должен быть поднят):
 *   npm run dev
 *   npm run deck:pdf
 *
 * Ключи:
 *   --base <url>   адрес запущенного приложения (по умолчанию http://127.0.0.1:8080)
 *   --out <файл>   куда положить PDF (по умолчанию public/investor-deck.pdf)
 *   --shots <дир>  оставить снимки слайдов на диске — для проверки
 *   --allow-missing-images  собрать файл, даже если какая-то картинка не загрузилась
 */
import { chromium } from "@playwright/test";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WIDTH = 1920;
const HEIGHT = 1080;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const base = arg("base", "http://127.0.0.1:8080").replace(/\/$/, "");
const out = arg("out", "public/investor-deck.pdf");
// По умолчанию сборка падает, если картинка слайда не загрузилась: слайд 1 тянет
// снимок панели HRD из хранилища Lovable, и без доступа к нему на слайде будет дыра.
const allowMissing = process.argv.includes("--allow-missing-images");

/** Ждём, пока слайд действительно готов к съёмке. */
async function waitForSlide(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  // Только картинки видимого слайда: в разметке есть ещё скрытая печатная копия
  // всех слайдов, её изображения браузер грузит лениво и ждать их незачем.
  const visibleImages = `(() => Array.from(document.images).filter((img) => {
    const r = img.getBoundingClientRect();
    return img.getAttribute("src") && r.width > 0 && r.height > 0;
  }))()`;
  await page.waitForFunction(`${visibleImages}.every((img) => img.complete)`, null, { timeout: 30_000 });
  const broken = await page.evaluate(`${visibleImages}.filter((img) => img.naturalWidth === 0).map((img) => img.currentSrc)`);
  if (broken.length) {
    if (!allowMissing) {
      throw new Error(`не загрузились картинки:\n${[...new Set(broken)].join("\n")}`);
    }
    // Чтобы на снимке не осталось иконки битой картинки и alt-текста.
    await page.evaluate(`${visibleImages}.filter((img) => img.naturalWidth === 0).forEach((img) => { img.style.visibility = "hidden" })`);
    process.stdout.write(`  внимание: пропущены картинки:\n  ${[...new Set(broken)].join("\n  ")}\n`);
  }
  // Анимации входа слайда (framer-motion) и отрисовка графиков Recharts.
  await page.waitForTimeout(2000);
}

const shots = [];
// --shots <dir> оставляет снимки слайдов на диске: удобно для проверки.
const shotsDir = arg("shots", null);
const tmp = shotsDir ?? (await mkdtemp(join(tmpdir(), "deck-pdf-")));
if (shotsDir) await mkdir(shotsDir, { recursive: true });
const browser = await chromium.launch({
  // В окружениях, где браузер лежит вне кеша Playwright, путь задаётся переменной.
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

try {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    // Двойная плотность: на телефоне слайд можно увеличить, мелкие таблицы остаются читаемыми.
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  // Число слайдов берём из счётчика самой презентации, чтобы не разъезжалось.
  await page.goto(`${base}/investor-deck?slide=1`, { waitUntil: "domcontentloaded" });
  const counter = await page.textContent("[data-deck-nav] span", { timeout: 15_000 });
  const total = Number(counter?.split("/")[1]?.trim());
  if (!Number.isInteger(total) || total < 1) {
    throw new Error(`не удалось определить число слайдов (счётчик: ${JSON.stringify(counter)})`);
  }

  for (let n = 1; n <= total; n++) {
    await page.goto(`${base}/investor-deck?slide=${n}`, { waitUntil: "domcontentloaded" });
    // Панель навигации — часть приложения, а не слайда.
    await page.addStyleTag({ content: "[data-deck-nav]{display:none!important}" });
    await waitForSlide(page);

    const file = join(tmp, `slide-${String(n).padStart(2, "0")}.jpg`);
    await page.screenshot({ path: file, type: "jpeg", quality: 85, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
    shots.push(file);
    process.stdout.write(`снят слайд ${n}/${total}\n`);
  }

  const html = `<!doctype html><meta charset="utf-8"><style>
    @page { size: ${WIDTH}px ${HEIGHT}px; margin: 0 }
    html, body { margin: 0; padding: 0; background: #fff }
    .p { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; break-after: page }
    .p:last-child { break-after: auto }
    img { display: block; width: ${WIDTH}px; height: ${HEIGHT}px }
  </style>${shots.map((f) => `<div class="p"><img src="file://${f}"></div>`).join("")}`;

  const htmlFile = join(tmp, "deck.html");
  await writeFile(htmlFile, html, "utf8");

  const pdfPage = await context.newPage();
  await pdfPage.goto(`file://${htmlFile}`, { waitUntil: "load" });
  await pdfPage.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0));
  await pdfPage.pdf({
    path: out,
    width: `${WIDTH}px`,
    height: `${HEIGHT}px`,
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
    pageRanges: `1-${total}`,
  });

  process.stdout.write(`готово: ${out}\n`);
} finally {
  await browser.close();
  if (!shotsDir) await rm(tmp, { recursive: true, force: true });
}
