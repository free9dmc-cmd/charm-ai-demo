"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { CheckCircle, XCircle, Edit2, Send, MessageCircle, Clock, ArrowLeft, AlertTriangle } from "lucide-react";
import { demoRequest } from "@/lib/demo/store";
import { runDashboardAction } from "@/lib/action-error";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  approved: boolean;
  draft: boolean;
  sentAt: string | null;
  createdAt: string;
};

type Conversation = {
  id: string;
  channel: string;
  title: string;
  updatedAt: string;
  messages: Message[];
};

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [loading, setLoading] = useState(false);
  // Per-draft failure message (keyed by message id) so a failed send is visible
  // on the exact draft that failed, not as a toast the provider might miss.
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [readError, setReadError] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  const [showThread, setShowThread] = useState(false); // mobile: controls which panel is shown
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    const res = await demoRequest("/api/conversations");
    const data = await res.json();
    setReadError(res.ok ? "" : data.error);
    const all: Conversation[] = data.conversations ?? [];
    setConversations(all);
    const drafts = all.reduce(
      (n, c) => n + (c.messages?.filter((m) => m.draft && !m.approved).length ?? 0),
      0
    );
    setPendingCount(drafts);
  }, []);

  const fetchThread = useCallback(async (convoId: string) => {
    const res = await demoRequest(`/api/conversations/${convoId}/messages`);
    const data = await res.json();
    if (!res.ok) setReadError(data.error);
    setMessages(data.messages ?? []);
  }, []);

  useEffect(() => {
    fetchConversations();
    const id = setInterval(fetchConversations, 15000);
    return () => clearInterval(id);
  }, [fetchConversations]);

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const selectConvo = async (convo: Conversation) => {
    setSelected(convo);
    setEditingId(null);
    setShowThread(true); // on mobile, switch to thread view
    await fetchThread(convo.id);
  };

  const goBack = () => {
    setShowThread(false);
    setSelected(null);
  };

  /** Record (or clear, with null) the inline error shown under one draft. */
  const setDraftError = (msgId: string, error: string | null) =>
    setActionErrors((prev) => {
      const next = { ...prev };
      if (error) next[msgId] = error;
      else delete next[msgId];
      return next;
    });

  /**
   * Shared body of approve/reject: run the action, and only on SUCCESS clear
   * the edit box and refresh. On failure the draft stays exactly as it was
   * (including an in-progress edit) with the reason shown under it — before
   * this, a 429 or a Twilio error looked identical to "sent".
   */
  const runDraftAction = async (msgId: string, verb: string, url: string, init: RequestInit) => {
    setLoading(true);
    setDraftError(msgId, null);
    try {
      const result = await runDashboardAction(verb, url, init, demoRequest);
      if (!result.ok) {
        setDraftError(msgId, result.error);
        return;
      }
      setEditingId((current) => (current === msgId ? null : current));
      if (selected) await fetchThread(selected.id);
      await fetchConversations();
    } finally {
      setLoading(false);
    }
  };

  const approve = (msgId: string, content?: string) =>
    runDraftAction(msgId, "send", `/api/messages/${msgId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

  const reject = (msgId: string) =>
    runDraftAction(msgId, "discard", `/api/messages/${msgId}/reject`, { method: "POST" });

  const startEdit = (msg: Message) => {
    setEditingId(msg.id);
    setEditContent(msg.content);
  };

  const pendingDrafts = messages.filter((m) => m.draft && !m.approved);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">

      {/* ── Conversation list ── */}
      {/* On mobile: visible when !showThread. On desktop: always visible */}
      <aside
        className={`
          ${showThread ? "hidden" : "flex"} md:flex
          flex-col w-full md:w-72 flex-shrink-0 border-r border-zinc-800 bg-zinc-950
          overflow-y-auto
        `}
      >
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="font-semibold text-white">Inbox</h2>
          {pendingCount > 0 && (
            <span className="bg-pink-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {pendingCount}
            </span>
          )}
        </div>

        {readError && <p role="alert" className="p-4 text-amber-300">{readError}</p>}
        {!readError && conversations.length === 0 && (
          <p className="text-zinc-500 text-sm p-4">No conversations yet.</p>
        )}

        {conversations.map((c) => {
          const lastMsg = c.messages?.[0];
          const unread = c.messages?.some((m) => m.draft && !m.approved);
          const isActive = selected?.id === c.id;
          return (
            <button
              key={c.id}
              onClick={() => selectConvo(c)}
              className={`w-full text-left px-4 py-3 border-b border-zinc-800 transition-colors ${
                isActive ? "bg-zinc-800" : "hover:bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <MessageCircle size={14} className="text-zinc-400 flex-shrink-0" />
                <span className="text-sm font-medium text-white truncate flex-1">
                  {c.title}
                </span>
                {unread && (
                  <span className="w-2 h-2 rounded-full bg-pink-500 flex-shrink-0" />
                )}
              </div>
              {lastMsg && (
                <p className="text-xs text-zinc-500 truncate mt-0.5 ml-5">
                  {lastMsg.content}
                </p>
              )}
              <p className="text-xs text-zinc-600 mt-0.5 ml-5">
                {c.channel} · {new Date(c.updatedAt).toLocaleDateString()}
              </p>
            </button>
          );
        })}
      </aside>

      {/* ── Thread panel ── */}
      {/* On mobile: visible when showThread. On desktop: always visible */}
      <main
        className={`
          ${showThread ? "flex" : "hidden"} md:flex
          flex-1 flex-col overflow-hidden bg-zinc-900
        `}
      >
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            <div className="text-center">
              <MessageCircle size={40} className="mx-auto mb-3 opacity-30" />
              <p>Select a conversation</p>
            </div>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-3">
              {/* Back button — mobile only */}
              <button
                aria-label="Back to conversations" onClick={goBack}
                className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-zinc-700 transition text-zinc-300"
              >
                <ArrowLeft size={18} />
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-white truncate">{selected.title}</h3>
                </div>
                <p className="text-xs text-zinc-500">
                  {selected.channel}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {pendingDrafts.length > 0 && (
                  <div className="hidden sm:flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-full px-3 py-1">
                    <Clock size={12} className="text-yellow-400" />
                    <span className="text-xs text-yellow-400 font-medium">
                      {pendingDrafts.length} pending
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Pending badge — mobile only */}
            {pendingDrafts.length > 0 && (
              <div className="sm:hidden flex items-center gap-1.5 bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2">
                <Clock size={12} className="text-yellow-400" />
                <span className="text-xs text-yellow-400 font-medium">
                  {pendingDrafts.length} pending draft{pendingDrafts.length > 1 ? "s" : ""}
                </span>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => {
                const isDraft = m.draft && !m.approved;
                const isEditing = editingId === m.id;
                return (
                  <div
                    key={m.id}
                    className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3 py-2.5 text-sm ${
                        m.role === "user"
                          ? "bg-zinc-700 text-white rounded-tl-sm"
                          : isDraft
                          ? "bg-yellow-500/10 border border-yellow-500/40 text-yellow-100 rounded-tr-sm"
                          : "bg-pink-600 text-white rounded-tr-sm"
                      }`}
                    >
                      {isDraft && !isEditing && (
                        <div className="flex items-center gap-1 mb-1.5 text-yellow-400 text-xs font-medium">
                          <Clock size={11} />
                          AI Draft — awaiting approval
                        </div>
                      )}

                      {isEditing ? (
                        <textarea
                          className="w-full bg-zinc-800 text-white rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-pink-500 min-h-[80px]"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          autoFocus
                        />
                      ) : (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      )}

                      {m.sentAt && !isDraft && (
                        <div className={`text-xs mt-1 opacity-60 ${m.role === "assistant" ? "text-right" : ""}`}>
                          {new Date(m.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      )}

                      {isDraft && (
                        <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-yellow-500/20">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => approve(m.id, editContent)}
                                disabled={loading}
                                className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                              >
                                <Send size={11} />
                                Approve edited reply
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1.5"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => approve(m.id)}
                                disabled={loading}
                                className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                              >
                                <CheckCircle size={11} />
                                Approve demo reply
                              </button>
                              <button
                                onClick={() => startEdit(m)}
                                className="flex items-center gap-1 text-xs bg-zinc-600 hover:bg-zinc-500 text-white px-3 py-1.5 rounded-lg transition-colors"
                              >
                                <Edit2 size={11} />
                                Edit
                              </button>
                              <button
                                onClick={() => reject(m.id)}
                                disabled={loading}
                                className="flex items-center gap-1 text-xs bg-red-800 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                              >
                                <XCircle size={11} />
                                Discard
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {isDraft && actionErrors[m.id] && (
                        <div
                          role="alert"
                          className="flex items-start gap-1.5 mt-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-2.5 py-1.5"
                        >
                          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                          <span>{actionErrors[m.id]}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
