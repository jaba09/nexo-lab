type DataChangeListener = (revision: number) => void;

type DataEventHub = {
  revision: number;
  listeners: Set<DataChangeListener>;
};

// Route handlers are bundled separately, but share this object in the same Node process.
const globalEvents = globalThis as typeof globalThis & { nexoLabDataEvents?: DataEventHub };

function eventHub(): DataEventHub {
  return globalEvents.nexoLabDataEvents ??= { revision: 0, listeners: new Set() };
}

export function subscribeToDataChanges(listener: DataChangeListener): () => void {
  const hub = eventHub();
  hub.listeners.add(listener);
  return () => hub.listeners.delete(listener);
}

export function publishDataChange(): void {
  const hub = eventHub();
  const revision = ++hub.revision;
  for (const listener of hub.listeners) {
    try { listener(revision); } catch { /* A disconnected client must not undo a saved change. */ }
  }
}
