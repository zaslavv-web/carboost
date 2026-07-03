# Фикс: пустой экран в инвест-презентации

## Причина

В `InvestorDeck.tsx` я обернул слайд в `motion.div` с `filter: blur(...)` и `scale`. И `filter`, и `transform` создают новый **containing block** — значит `position: fixed inset-0` внутри `SlideLayout` теперь привязан не к viewport, а к пустому боксу этого motion.div (у которого нет своих размеров). Итог: слайд отрендерен в 0×0 → чёрный экран.

## Правка (1 файл)

`src/pages/investor/InvestorDeck.tsx` — убрать `filter`/`scale` из motion-обёртки и растянуть её на весь экран, чтобы `fixed inset-0` в `SlideLayout` работал корректно:

```tsx
<motion.div
  key={index}
  className="fixed inset-0"
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  transition={{ duration: 0.35, ease: "easeOut" }}
>
  <Current />
</motion.div>
```

Плавный cross-fade сохраняется, «пульсация» логотипа и анимации внутри слайдов остаются как есть.

## Проверка

После правки прогоню Playwright по всем 6 слайдам и покажу скриншоты.
