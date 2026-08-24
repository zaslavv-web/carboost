import { useCallback, useEffect, useMemo, useState } from "react";
import { useUserProfile } from "@/hooks/useUserProfile";

/**
 * Порядок блоков экрана, который запоминается индивидуально для пользователя.
 *
 * Иерархия не нарушается: перестановка возможна только внутри одного вызова
 * (одного уровня), вложенные блоки живут в собственном списке со своим ключом.
 */
export function useBlockOrder(scope: string, blockIds: string[]) {
  const { data: profile } = useUserProfile();
  const storageKey = `block-order:${scope}:${profile?.user_id ?? "anon"}`;
  const [order, setOrder] = useState<string[]>(blockIds);

  useEffect(() => {
    let stored: string[] = [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) stored = JSON.parse(raw) as string[];
    } catch {
      stored = [];
    }
    const known = stored.filter((id) => blockIds.includes(id));
    const missing = blockIds.filter((id) => !known.includes(id));
    setOrder([...known, ...missing]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, blockIds.join("|")]);

  const persist = useCallback(
    (next: string[]) => {
      setOrder(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* приватный режим — порядок останется только на время сессии */
      }
    },
    [storageKey],
  );

  const move = useCallback(
    (id: string, direction: -1 | 1) => {
      const index = order.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= order.length) return;
      const next = [...order];
      [next[index], next[target]] = [next[target], next[index]];
      persist(next);
    },
    [order, persist],
  );

  const reset = useCallback(() => persist(blockIds), [persist, blockIds]);

  const position = useMemo(() => {
    const map = new Map(order.map((id, i) => [id, i]));
    return (id: string) => ({
      index: map.get(id) ?? 0,
      isFirst: (map.get(id) ?? 0) === 0,
      isLast: (map.get(id) ?? 0) === order.length - 1,
    });
  }, [order]);

  return { order, move, reset, position };
}
