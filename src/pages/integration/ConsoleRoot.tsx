/**
 * Что показывать в корне сайта — решает имя хоста.
 *
 * Оба поддомена смотрят в тот же докрут, что и основной домен: так .htaccess
 * продолжает роутить /api в Laravel, запросы консолей остаются same-origin и
 * CORS не участвует. Плата за это — корень у всех трёх хостов один, поэтому
 * страницу выбираем здесь.
 */
import Landing from "@/pages/Landing";
import InboundConsole from "@/pages/integration/InboundConsole";
import OutboundConsole from "@/pages/integration/OutboundConsole";
import { INBOUND_HOST_PREFIX, OUTBOUND_HOST_PREFIX } from "@/lib/integrationConsole";

/** Первый лейбл хоста: api-out.growth-peak.pro → "api-out". */
export const hostPrefix = (): string => {
  if (typeof window === "undefined") return "";
  return window.location.hostname.split(".")[0].toLowerCase();
};

export default function ConsoleRoot() {
  const prefix = hostPrefix();

  if (prefix === OUTBOUND_HOST_PREFIX) return <OutboundConsole />;
  if (prefix === INBOUND_HOST_PREFIX) return <InboundConsole />;

  return <Landing />;
}
