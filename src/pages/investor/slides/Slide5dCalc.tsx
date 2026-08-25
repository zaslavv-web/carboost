import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import { Calculator, Layers, Receipt, Wallet } from "lucide-react";

// Калькуляция из файла «пик роста бюджет» (листы «детализация продукта», «доходы», «Бюджет»).
const modules = [
  { name: "База: корпоративный портал", month: 300, year: 3600 },
  { name: "Такс-трекер", month: 100, year: 1200 },
  { name: "Мессенджер", month: 100, year: 1200 },
  { name: "Аналитика персонала", month: 100, year: 1200 },
  { name: "Опросы (360, performance review)", month: 100, year: 1200 },
  { name: "Кадровый резерв / карьерный трек", month: 100, year: 1200 },
  { name: "Корпоративный университет", month: 100, year: 1200 },
  { name: "Геймификация (валюта, магазин)", month: 100, year: 1200 },
  { name: "КЭДО", month: 100, year: 1200 },
];

const listPriceMonth = modules.reduce((s, m) => s + m.month, 0); // 1 100
const listPriceYear = modules.reduce((s, m) => s + m.year, 0); // 13 200
const bundleMonth = 900;
const bundleYear = 10000;

const costs = [
  { name: "Офис", value: 150 },
  { name: "Продажник №1", value: 200 },
  { name: "Продажник №2", value: 200 },
  { name: "ИТ-инфраструктура", value: 100 },
  { name: "IT-фрилансер", value: 250 },
  { name: "DevOps", value: 300 },
  { name: "Product owner", value: 400 },
  { name: "Руководитель компании", value: 400 },
  { name: "Реклама / PR", value: 100 },
];
const costsTotal = costs.reduce((s, c) => s + c.value, 0); // 2 100 тыс./мес

const kpi = [
  { Icon: Layers, label: "Прайс по модулям", value: `${listPriceMonth} руб.`, note: `сотрудник / мес · ${listPriceYear.toLocaleString("ru-RU")} руб. в год` },
  { Icon: Receipt, label: "Пакет со скидкой", value: `${bundleMonth} руб.`, note: `сотрудник / мес · ${bundleYear.toLocaleString("ru-RU")} руб. в год` },
  { Icon: Calculator, label: "Клиент 250 сотрудников", value: "225 тыс. руб./мес", note: "2,7 млн руб. в год подписки" },
  { Icon: Wallet, label: "Кастомизация", value: "2 000 руб./час", note: "~100 часов = 200 тыс. руб. на проект" },
];

export default function Slide5dCalc() {
  return (
    <SlideLayout kicker="Экономика · Калькуляция юнита">
      <div className="flex h-full flex-col px-[80px] pt-[110px] pb-[60px]">
        <Editable
          id="s5d.title"
          as="h2"
          defaultValue="Калькуляция: из чего складывается цена и себестоимость"
          className="text-[44px] font-bold leading-[1.05] text-[#1B1D22]"
        />
        <Editable
          id="s5d.lead"
          as="p"
          defaultValue="Модульный прайс — 1 100 руб. за сотрудника в месяц при покупке по частям, 900 руб. — за весь пакет. Постоянные расходы выходят на 2,1 млн руб. в месяц."
          className="mt-2 text-[19px] text-[#1B1D22]/70"
        />

        <div className="mt-5 grid grid-cols-4 gap-4">
          {kpi.map((k) => (
            <div
              key={k.label}
              className="rounded-2xl bg-white p-4"
              style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 1px 3px 1px rgba(0,0,0,0.04)" }}
            >
              <div className="flex items-center gap-2.5 text-[#8C6A1A]">
                <k.Icon size={20} strokeWidth={1.6} />
                <div className="text-[15px] font-medium">{k.label}</div>
              </div>
              <div className="mt-2 text-[26px] font-bold leading-none tabular-nums text-[#1B1D22]">{k.value}</div>
              <div className="mt-2 text-[15px] text-[#1B1D22]/60">{k.note}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid flex-1 min-h-0 grid-cols-2 gap-4">
          <div
            className="flex min-h-0 flex-col rounded-2xl bg-white p-5"
            style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 1px 3px 1px rgba(0,0,0,0.04)" }}
          >
            <div className="mb-2 text-[13px] font-semibold uppercase tracking-[0.16em] text-[#8C6A1A]">
              Прайс по модулям, руб. / сотрудник
            </div>
            <div className="flex-1 space-y-[6px] overflow-hidden">
              {modules.map((m) => (
                <div key={m.name} className="flex items-baseline justify-between gap-3 text-[16px]">
                  <span className="truncate text-[#1B1D22]/80">{m.name}</span>
                  <span className="whitespace-nowrap tabular-nums text-[#1B1D22]">
                    {m.month} / мес · {m.year.toLocaleString("ru-RU")} / год
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-baseline justify-between border-t border-[#D5A52A]/30 pt-2 text-[17px] font-semibold">
              <span>Весь пакет со скидкой</span>
              <span className="tabular-nums">
                {bundleMonth} / мес · {bundleYear.toLocaleString("ru-RU")} / год
              </span>
            </div>
          </div>

          <div
            className="flex min-h-0 flex-col rounded-2xl bg-white p-5"
            style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 1px 3px 1px rgba(0,0,0,0.04)" }}
          >
            <div className="mb-2 text-[13px] font-semibold uppercase tracking-[0.16em] text-[#8C6A1A]">
              Постоянные расходы, тыс. руб. / мес
            </div>
            <div className="flex-1 space-y-[6px] overflow-hidden">
              {costs.map((c) => (
                <div key={c.name} className="text-[16px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[#1B1D22]/80">{c.name}</span>
                    <span className="tabular-nums text-[#1B1D22]">{c.value}</span>
                  </div>
                  <div className="mt-[3px] h-[4px] rounded-full bg-[#D5A52A]/15">
                    <div
                      className="h-full rounded-full bg-[#D5A52A]"
                      style={{ width: `${(c.value / 400) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-baseline justify-between border-t border-[#D5A52A]/30 pt-2 text-[17px] font-semibold">
              <span>Итого при полной команде</span>
              <span className="tabular-nums">{costsTotal.toLocaleString("ru-RU")} тыс. руб./мес</span>
            </div>
          </div>
        </div>

        <Editable
          id="s5d.foot"
          as="div"
          multiline
          defaultValue="Один клиент на 250 сотрудников закрывает ~11% месячных расходов; окупаемость постоянных затрат достигается на 9–10 клиентах."
          className="mt-3 text-[15px] text-[#1B1D22]/60"
        />
        <div className="mt-1 flex items-center justify-between text-[17px] text-[#1B1D22]/60">
          <Editable id="s5d.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s5d.foot.page" defaultValue="08 / 11" />
        </div>
      </div>
    </SlideLayout>
  );
}
