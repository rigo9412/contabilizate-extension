import { useSyncExternalStore } from "react";
import { formatCurrency } from "./bill-calc";

const KEY = "hide-amounts";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

let hidden = read();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setHideAmounts(value: boolean) {
  hidden = value;
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // Sin almacenamiento: solo vale para esta sesión.
  }
  listeners.forEach((cb) => cb());
}

/** Modo privado del inicio: oculta los montos para mostrar la pantalla sin exponer cifras. */
export function useHideAmounts() {
  const hide = useSyncExternalStore(subscribe, () => hidden);
  return {
    hide,
    toggle: () => setHideAmounts(!hide),
    money: (value: number) => (hide ? "$ ••••••" : formatCurrency(value)),
  };
}
