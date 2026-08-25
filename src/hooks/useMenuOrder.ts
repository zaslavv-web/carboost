import { useCallback, useEffect, useMemo, useState } from "react";

type OrderMap = Record<string, string[]>;

const readOrder = (storageKey: string): OrderMap => {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey) || "{}") as OrderMap;
  } catch {
    return {};
  }
};

/** Сохраняет порядок отдельно для каждого уровня меню, не смешивая родителей и детей. */
export function useMenuOrder(userId?: string | null) {
  const storageKey = `sidebar.menu-order.v1:${userId ?? "anon"}`;
  const [orders, setOrders] = useState<OrderMap>(() => readOrder(storageKey));

  useEffect(() => setOrders(readOrder(storageKey)), [storageKey]);

  const persist = useCallback((next: OrderMap) => {
    setOrders(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // В приватном режиме порядок действует до обновления страницы.
    }
  }, [storageKey]);

  const order = useCallback(<T,>(scope: string, items: T[], keyOf: (item: T) => string): T[] => {
    const saved = orders[scope] ?? [];
    const positions = new Map(saved.map((key, index) => [key, index]));
    return [...items].sort((a, b) => {
      const aIndex = positions.get(keyOf(a));
      const bIndex = positions.get(keyOf(b));
      if (aIndex === undefined && bIndex === undefined) return 0;
      if (aIndex === undefined) return 1;
      if (bIndex === undefined) return -1;
      return aIndex - bIndex;
    });
  }, [orders]);

  const move = useCallback((scope: string, keys: string[], dragged: string, target: string) => {
    if (dragged === target) return;
    const from = keys.indexOf(dragged);
    const to = keys.indexOf(target);
    if (from < 0 || to < 0) return;
    const nextKeys = [...keys];
    nextKeys.splice(from, 1);
    nextKeys.splice(to, 0, dragged);
    persist({ ...orders, [scope]: nextKeys });
  }, [orders, persist]);

  return useMemo(() => ({ order, move }), [move, order]);
}