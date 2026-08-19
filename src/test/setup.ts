import "@testing-library/jest-dom";

// Тесты всегда идут на русской локали: фиксируем язык до инициализации i18next,
// иначе детектор берёт navigator.language (en-US в jsdom) и подписи не совпадают.
window.localStorage.setItem("ct-lang", "ru");
import "@/i18n";

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
