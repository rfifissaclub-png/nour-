"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearBackupCache, readBackupCache, writeBackupCache } from "@/lib/backup/offline-cache";

type SnapshotResponse<T> = { scope: string; data: T; savedAt?: string };

export function useOfflineBackup<T>(scope: string, cacheKey: string, endpoint: string, initialData: T) {
  const key = `${scope}:${cacheKey}`;
  const [isOffline, setIsOffline] = useState(false);
  const [isUsingCachedData, setIsUsingCachedData] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [cachedData, setCachedData] = useState<T | null>(initialData);
  const [cachedKey, setCachedKey] = useState(key);
  const active = useRef(true);
  const hasServerSnapshot = useRef(true);

  const refreshCache = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Backup data request failed (${response.status})`);
      const result: unknown = await response.json();
      if (!isSnapshotResponse<T>(result) || result.scope !== scope || !isValidCachedData(cacheKey, result.data)) {
        throw new Error("Backup data scope or shape is invalid");
      }
      const savedAt = await writeBackupCache(key, scope, result.data);
      if (!active.current) return;
      setCachedData(result.data);
      setCachedKey(key);
      setLastUpdatedAt(savedAt);
      setIsUsingCachedData(false);
    } catch (error) {
      try {
        const cached = await readBackupCache<T>(key, scope);
        if (!active.current) return;
        if (cached && isValidCachedData(cacheKey, cached.data)) {
          if (hasServerSnapshot.current) {
            setIsUsingCachedData(true);
            return;
          }
          setCachedData(cached.data);
          setCachedKey(key);
          setLastUpdatedAt(cached.savedAt);
          setIsUsingCachedData(true);
        }
      } catch (cacheError) {
        console.warn("NOUR IndexedDB backup cache unavailable:", cacheError instanceof Error ? cacheError.name : "UnknownError");
      }
      if (navigator.onLine) console.warn("NOUR offline backup refresh failed:", error instanceof Error ? error.message : "UnknownError");
    }
  }, [cacheKey, endpoint, key, scope]);

  useEffect(() => {
    active.current = true;
    setIsOffline(!navigator.onLine);
    let disposed = false;
    void (async () => {
      try {
        const savedAt = await writeBackupCache(key, scope, initialData);
        if (disposed || !active.current) return;
        setCachedData(initialData);
        setCachedKey(key);
        setLastUpdatedAt(savedAt);
        if (navigator.onLine) await refreshCache();
        else setIsUsingCachedData(true);
      } catch (error) {
        if (disposed) return;
        setCachedData(initialData);
        setCachedKey(key);
        console.warn("NOUR IndexedDB backup cache unavailable:", error instanceof Error ? error.name : "UnknownError");
      }
    })();

    const onOffline = () => {
      setIsOffline(true);
      setIsUsingCachedData(true);
    };
    const onOnline = () => {
      setIsOffline(false);
      void refreshCache();
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      disposed = true;
      active.current = false;
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [initialData, key, refreshCache, scope]);

  const clearCache = useCallback(async () => {
    await clearBackupCache(key);
    setCachedData(null);
    setCachedKey(key);
    setLastUpdatedAt(null);
  }, [key]);

  return { isOffline, isUsingCachedData, lastUpdatedAt, cachedData: cachedKey === key ? cachedData : null, refreshCache, clearCache };
}

function isSnapshotResponse<T>(value: unknown): value is SnapshotResponse<T> {
  return typeof value === "object" && value !== null && "scope" in value && typeof value.scope === "string" && "data" in value;
}

function isValidCachedData(cacheKey: string, value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  if (cacheKey === "students") {
    return "levels" in value && Array.isArray(value.levels) &&
      "groups" in value && Array.isArray(value.groups) &&
      "students" in value && Array.isArray(value.students);
  }
  if (cacheKey.startsWith("payments:")) {
    return "year" in value && Number.isInteger(value.year) &&
      "month" in value && Number.isInteger(value.month) &&
      "levels" in value && Array.isArray(value.levels) &&
      "students" in value && Array.isArray(value.students);
  }
  return false;
}
