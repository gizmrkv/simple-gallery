// アップロード結果を localStorage に保存・読み出しする hook。
import { useCallback, useEffect, useState } from "react";
import type { ClusterResult, HistoryItem } from "../lib/types";

const STORAGE_KEY = "theme-color-history";
const MAX_ITEMS = 12;

function load(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

// 容量超過時は古い項目を捨てながら書き込みを試みる。
function persist(items: HistoryItem[]): HistoryItem[] {
  let current = items.slice(0, MAX_ITEMS);
  while (current.length > 0) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      return current;
    } catch {
      current = current.slice(0, current.length - 1); // 末尾（最古）を削る
    }
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return [];
}

export function useHistory() {
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    setItems(load());
  }, []);

  const add = useCallback(
    (entry: { thumbDataURL: string; previewDataURL: string; result: ClusterResult }) => {
      setItems((prev) => {
        const item: HistoryItem = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          ...entry,
        };
        return persist([item, ...prev]);
      });
    },
    [],
  );

  const remove = useCallback((id: string) => {
    setItems((prev) => persist(prev.filter((it) => it.id !== id)));
  }, []);

  return { items, add, remove };
}
