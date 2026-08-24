import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/game/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleGameApi } = await import("@/lib/game-auth/http.server");
        return handleGameApi(request);
      },
      POST: async ({ request }) => {
        const { handleGameApi } = await import("@/lib/game-auth/http.server");
        return handleGameApi(request);
      },
    },
  },
});
