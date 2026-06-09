/**
 * Hook for a refresh() that:
 *  - Cancels the previous request on unmount or new call (no setState-after-unmount)
 *  - Swallows transient errors (logged, never thrown) so dev overlay stays clean
 *  - Returns a stable callback usable from buttons + useEffect
 *
 * Usage:
 *   const refresh = useSafeFetch("/api/trips", setTrips);
 *   useEffect(() => { refresh(); }, [refresh]);
 */
import { useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";

export function useSafeFetch(url, setter, deps = []) {
  const aliveRef = useRef(true);
  const ctrlRef = useRef(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      ctrlRef.current?.abort?.();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!url) return;
    ctrlRef.current?.abort?.();
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    ctrlRef.current = ctrl;
    try {
      const { data } = await api.get(url, ctrl ? { signal: ctrl.signal } : {});
      if (aliveRef.current) setter(data);
    } catch (e) {
      if (e?.name === "CanceledError" || e?.code === "ERR_CANCELED") return;
      // eslint-disable-next-line no-console
      console.warn(`[safe-fetch ${url}]`, e?.message || e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  return refresh;
}
