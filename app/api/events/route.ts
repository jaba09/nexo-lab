import { getAuthenticatedTeacher, unauthorizedResponse } from "../../../lib/auth";
import { subscribeToDataChanges } from "../../../lib/dataEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!await getAuthenticatedTeacher()) return unauthorizedResponse();

  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe = () => {};
      const onAbort = () => {
        stop();
        try { controller.close(); } catch { /* The browser already closed the stream. */ }
      };
      stop = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        request.signal.removeEventListener("abort", onAbort);
      };
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          stop();
        }
      };

      unsubscribe = subscribeToDataChanges((revision) => {
        send(`id: ${revision}\nevent: data-changed\ndata: ${revision}\n\n`);
      });
      const heartbeat = setInterval(() => send(": keepalive\n\n"), 25_000);
      request.signal.addEventListener("abort", onAbort, { once: true });
      send(": connected\n\n");
      if (request.signal.aborted) onAbort();
    },
    cancel() { stop(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
