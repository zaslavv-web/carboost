import "@testing-library/jest-dom";

// Тесты всегда идут на русской локали: фиксируем язык до инициализации i18next,
// иначе детектор берёт navigator.language (en-US в jsdom) и подписи не совпадают.
import i18n from "@/i18n";

// Импорты поднимаются вверх модуля, поэтому язык принудительно переключаем
// уже после инициализации инстанса.
window.localStorage.setItem("ct-lang", "ru");
void i18n.changeLanguage("ru");

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
