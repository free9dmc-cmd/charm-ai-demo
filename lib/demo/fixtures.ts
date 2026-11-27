// Synthetic examples. No imported contacts or conversations.
export function createExampleState(now = new Date()) {
  const timestamp = now.toISOString();
  const suggested = new Date(now);
  suggested.setDate(suggested.getDate() + 1);
  suggested.setHours(14, 0, 0, 0);
  return {
    suggestedTime: suggested.toISOString(),
    messages: [
      { id: "example-question", role: "user", content: "Could I book a consultation tomorrow at 14:00?", draft: false, approved: false, createdAt: timestamp, sentAt: timestamp as string | null },
      { id: "example-draft", role: "assistant", content: "Tomorrow at 14:00 works. Shall I reserve your consultation?", draft: true, approved: false, createdAt: timestamp, sentAt: null as string | null }
    ],
    resolution: "pending" as "pending" | "approved" | "rejected",
    appointments: [] as { id: string; title: string; datetime: string; location: string; description: string; status: string }[]
  };
}
