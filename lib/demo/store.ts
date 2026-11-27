import { createExampleState } from "./fixtures";

const storageKey = "charm-demo-v1";
export function resetDemo() { sessionStorage.removeItem(storageKey); }

export function makeDemoRequest(storage: Pick<Storage, "getItem" | "setItem">) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const path = String(input);
    const method = init?.method ?? "GET";
    try {
      const saved = storage.getItem(storageKey);
      const state: ReturnType<typeof createExampleState> = saved ? JSON.parse(saved) : createExampleState();
      const persist = () => storage.setItem(storageKey, JSON.stringify(state));
      if (!saved) persist();
      const error = (message: string, status: number) => Response.json({error: message}, {status});
      if (method === "GET") {
        if (path === "/api/conversations") return Response.json({ conversations: [{
          id: "example-thread", channel: "SMS", title: "Avery · Example contact",
          updatedAt: state.messages[0].createdAt, messages: [...state.messages].reverse()
        }] });
        if (path === "/api/conversations/example-thread/messages") return Response.json({messages: state.messages});
        if (path === "/api/appointments") return Response.json({appointments: state.appointments});
      }
      if (method !== "POST") return error("Unavailable in this demo", 404);
      let data;
      try { data = JSON.parse(String(init?.body ?? "{}")); } catch { return error("Invalid request", 400); }
      if (!data || typeof data !== "object" || Array.isArray(data)) return error("Invalid request", 400);
      if (path === "/api/inbox/scan-dates") return Response.json({suggestions:
        state.appointments.some(a => a.datetime === state.suggestedTime) ? [] : [{
          title: "Example consultation", datetime: state.suggestedTime, location: "Example studio", source: "example conversation", confidence: 1
        }]});
      if (path === "/api/appointments") {
        if (typeof data.title !== "string" || !data.title.trim() || typeof data.datetime !== "string" ||
            !Number.isFinite(Date.parse(data.datetime))) return error("Enter a title & valid date.", 422);
        const datetime = new Date(data.datetime).toISOString();
        const title = data.title.trim();
        const previous = state.appointments.find(a => a.title === title && a.datetime === datetime);
        if (previous) return Response.json(previous);
        const row = {id: crypto.randomUUID(), title, datetime, description: String(data.description ?? ""),
          location: String(data.location ?? ""), status: "scheduled"};
        state.appointments.unshift(row);
        persist();
        return Response.json(row, {status: 201});
      }
      const approve = path === "/api/messages/example-draft/approve";
      if (!approve && path !== "/api/messages/example-draft/reject") return error("Unavailable in this demo", 404);
      const resolution = approve ? "approved" : "rejected";
      if (resolution === state.resolution) return Response.json({ok:true});
      if (state.resolution !== "pending") return error("This draft has already been handled.", 409);
      const draft = state.messages.find(m => m.id === "example-draft");
      if (!draft) return error("Draft unavailable", 404);
      if (approve) {
        if (data.content !== undefined && (typeof data.content !== "string" || !data.content.trim())) return error("Enter a reply before approving.", 422);
        draft.content = data.content?.trim() ?? draft.content;
        draft.approved = true;
        draft.draft = false;
        draft.sentAt = new Date().toISOString();
      } else {
        state.messages = state.messages.filter(m => m.id !== draft.id);
      }
      state.resolution = resolution;
      persist();
      return Response.json({ok:true});
    } catch {
      return Response.json({error:"Demo storage is unavailable. Enable tab storage or reset the demo."}, {status:503});
    }
  };
}

export const demoRequest: typeof fetch = (input, init) =>
  makeDemoRequest({getItem: key => sessionStorage.getItem(key), setItem: (key, value) => sessionStorage.setItem(key, value)})(input, init);
