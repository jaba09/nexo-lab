"use client";

import { useEffect, useRef, useState } from "react";

const CHECK_INTERVAL_MS = 60_000;

export default function VersionUpdateNotice({ initialVersion }: { initialVersion: string }) {
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [deferred, setDeferred] = useState(false);
  const editedForms = useRef(new Set<HTMLFormElement>());

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let lastSeenVersion: string | null = null;
    let pendingRequest: AbortController | null = null;

    async function checkVersion() {
      if (disposed || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      const controller = new AbortController();
      pendingRequest = controller;
      const timeout = window.setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch("/api/version", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const payload: unknown = await response.json();
        if (disposed) return;
        if (!payload || typeof payload !== "object" || !("version" in payload)
          || typeof payload.version !== "string" || !payload.version) return;

        if (payload.version === initialVersion) {
          if (lastSeenVersion !== null) {
            lastSeenVersion = null;
            setAvailableVersion(null);
          }
        } else if (payload.version !== lastSeenVersion) {
          lastSeenVersion = payload.version;
          setAvailableVersion(payload.version);
          setDeferred(false);
        }
      } catch {
        // Render can briefly be unavailable during a deployment. Try again later.
      } finally {
        window.clearTimeout(timeout);
        pendingRequest = null;
        inFlight = false;
      }
    }

    const onFocus = () => { void checkVersion(); };
    const onVisibilityChange = () => { if (document.visibilityState === "visible") void checkVersion(); };
    const interval = window.setInterval(() => { void checkVersion(); }, CHECK_INTERVAL_MS);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    void checkVersion();

    return () => {
      disposed = true;
      pendingRequest?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [initialVersion]);

  useEffect(() => {
    const onEdit = (event: Event) => {
      if (event.target instanceof Element) {
        const form = event.target.closest("form");
        if (form) editedForms.current.add(form);
      }
    };
    const onReset = (event: Event) => {
      if (event.target instanceof HTMLFormElement) editedForms.current.delete(event.target);
    };
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    document.addEventListener("reset", onReset, true);

    return () => {
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
      document.removeEventListener("reset", onReset, true);
    };
  }, []);

  function reloadNow() {
    const hasOpenDialog = Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
    const hasEditedForm = [...editedForms.current].some((form) => form.isConnected);
    if ((hasOpenDialog || hasEditedForm)
      && !window.confirm("Hay un formulario abierto o con cambios. Si recargas, podrías perder los cambios no guardados. ¿Recargar ahora?")) return;
    window.location.reload();
  }

  if (!availableVersion) return null;

  if (deferred) {
    return (
      <button className="version-update-reminder" type="button" onClick={() => setDeferred(false)}>
        Nueva versión disponible
      </button>
    );
  }

  return (
    <aside className="version-update-notice" aria-label="Actualización disponible" role="status">
      <span className="version-update-tag">ACTUALIZACIÓN</span>
      <strong>Nueva versión disponible</strong>
      <p>La aplicación se ha actualizado. Puedes recargarla cuando termines lo que estás haciendo.</p>
      <div className="version-update-actions">
        <button type="button" onClick={() => setDeferred(true)}>Más tarde</button>
        <button type="button" onClick={reloadNow}>Recargar ahora</button>
      </div>
    </aside>
  );
}
