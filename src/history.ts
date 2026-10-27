import type { ScanResult } from "./types";

const KEY = "headercheck.history.v1";
const MAX = 20;

export interface HistoryEntry {
  id: string;
  result: ScanResult;
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function save(list: HistoryEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable or full: history is a convenience only */
  }
}

export function addToHistory(list: HistoryEntry[], result: ScanResult): HistoryEntry[] {
  const next = [{ id: `${result.scannedAt}-${result.url}`, result }, ...list].slice(0, MAX);
  save(next);
  return next;
}

export function removeFromHistory(list: HistoryEntry[], id: string): HistoryEntry[] {
  const next = list.filter((h) => h.id !== id);
  save(next);
  return next;
}

export function clearHistory(): HistoryEntry[] {
  save([]);
  return [];
}
