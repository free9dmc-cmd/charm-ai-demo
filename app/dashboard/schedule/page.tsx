"use client";

import { useState, useEffect } from "react";
import { Calendar, Plus, MapPin, Clock, Sparkles, Check, X, AlertTriangle } from "lucide-react";
import { demoRequest } from "@/lib/demo/store";
import { formatDate } from "@/lib/utils";

type Appointment = {
  id: string;
  title: string;
  description?: string;
  datetime: string;
  location?: string;
  duration?: string;
  clientPhone?: string;
  videoCallUrl?: string;
  videoCallPlatform?: string;
  status: string;
};

/** POST /api/appointments echoes the saved row plus how the calendar sync went. */
type CreatedAppointment = Appointment & {
  calendarSync?: "synced" | "failed" | "not_connected";
};

type Suggestion = {
  title: string;
  datetime: string;
  location?: string;
  source: string;
  confidence: number;
};


export default function SchedulePage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", datetime: "", location: "", description: "" });
  const [saving, setSaving] = useState(false);
  // One banner for both outcomes the create path can produce that the provider
  // needs to know about: the save failed outright, or it saved but never reached
  // Google Calendar. Previously neither was shown — a rejected POST silently
  // pushed the error object into the list as a blank appointment row.
  const [notice, setNotice] = useState<{ tone: "error" | "warn"; text: string } | null>(null);

  useEffect(() => {
    loadAppointments();
  }, []);

  async function loadAppointments() {
    setLoading(true);
    const res = await demoRequest("/api/appointments");
    const data = await res.json();
    if (!res.ok) setNotice({tone: "error", text: data.error});
    setAppointments(data.appointments ?? []);
    setLoading(false);
  }

  async function scanInbox() {
    setScanning(true);
    try {
      const res = await demoRequest("/api/inbox/scan-dates", { method: "POST" });
      const data = await res.json();
      if (!res.ok) setNotice({tone: "error", text: data.error});
      setSuggestions(data.suggestions ?? []);
    } finally {
      setScanning(false);
    }
  }

  /**
   * The single POST /api/appointments path, shared by the manual form and the
   * "accept suggestion" button so both get the same failure handling (DRY).
   * Returns the created appointment, or null when nothing was saved.
   */
  async function submitAppointment(payload: Record<string, unknown>): Promise<CreatedAppointment | null> {
    setNotice(null);
    let res: Response;
    try {
      res = await demoRequest("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      setNotice({ tone: "error", text: "Couldn't reach the server. Check your connection and try again." });
      return null;
    }

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      // 429 carries Retry-After (seconds); everything else carries an `error`
      // string. Only trust Retry-After when it parses as a positive integer —
      // otherwise say it without a number rather than print "in a seconds".
      const retryRaw = Number(res.headers.get("Retry-After"));
      const retrySec = Number.isInteger(retryRaw) && retryRaw > 0 ? retryRaw : null;
      setNotice({
        tone: "error",
        text:
          res.status === 429
            ? retrySec
              ? `Too many bookings at once — try again in ${retrySec} second${retrySec === 1 ? "" : "s"}.`
              : "Too many bookings at once — give it a moment and try again."
            : (data as { error?: string } | null)?.error || "Couldn't save that appointment.",
      });
      return null;
    }

    // A 2xx with an unparseable or empty body shouldn't push a null row into
    // the list and crash the render below it.
    if (!data || typeof data !== "object" || !("id" in data)) {
      setNotice({ tone: "error", text: "The server didn't return the saved appointment. Refresh to check." });
      return null;
    }

    const apt = data as CreatedAppointment;
    setAppointments((a) => [apt, ...a.filter((row) => row.id !== apt.id)]);
    if (apt.calendarSync === "failed") {
      setNotice({
        tone: "warn",
        text: "Saved here, but it didn't reach your Google Calendar. Reconnect Google in Settings to sync it.",
      });
    }
    return apt;
  }

  async function acceptSuggestion(s: Suggestion) {
    const apt = await submitAppointment({
      title: s.title,
      datetime: s.datetime,
      location: s.location,
      description: `Auto-detected from ${s.source}`,
    });
    if (apt) setSuggestions((sg) => sg.filter((x) => x !== s));
  }

  function dismissSuggestion(s: Suggestion) {
    setSuggestions((sg) => sg.filter((x) => x !== s));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return; // double-submit guard — a second POST would duplicate the row
    setSaving(true);
    try {
      const apt = await submitAppointment(form);
      // Keep the form open and populated on failure so the provider doesn't
      // have to retype what they just entered.
      if (!apt) return;
      setShowForm(false);
      setForm({ title: "", datetime: "", location: "", description: "" });
    } finally {
      setSaving(false);
    }
  }

  const upcoming = appointments.filter((a) => new Date(a.datetime) >= new Date());
  const past = appointments.filter((a) => new Date(a.datetime) < new Date());

  return (
    <div className="w-full p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="flex flex-wrap gap-3 items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Schedule</h1>
          <p className="text-muted-foreground text-sm mt-1">Dates and appointments</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={scanInbox}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium hover:bg-accent transition disabled:opacity-40"
          >
            <Sparkles className="w-4 h-4" />
            {scanning ? "Scanning..." : "Scan inbox"}
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition"
          >
            <Plus className="w-4 h-4" />
            Add date
          </button>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className={`mb-6 flex items-start gap-3 rounded-xl border p-4 text-sm ${
            notice.tone === "error"
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
              : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
          }`}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="flex-1">{notice.text}</p>
          <button
            onClick={() => setNotice(null)}
            className="shrink-0 opacity-60 hover:opacity-100 transition"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mb-6 rounded-xl border-2 border-primary/30 bg-primary/5 p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-primary" />
            Detected from your messages
          </h2>
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-center gap-3 bg-background rounded-lg border p-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{s.title}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground">{formatDate(s.datetime)}</span>
                    {s.location && (
                      <span className="text-xs text-muted-foreground">📍 {s.location}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground">{s.source}</span>
                  </div>
                </div>
                <button
                  onClick={() => acceptSuggestion(s)}
                  className="w-8 h-8 rounded-lg bg-green-100 text-green-700 flex items-center justify-center hover:bg-green-200 transition"
                  title="Add"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => dismissSuggestion(s)}
                  className="w-8 h-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center hover:bg-accent transition"
                  title="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={create} className="rounded-xl border bg-card p-5 mb-6 space-y-3">
          <h2 className="font-semibold">New appointment</h2>
          <input
            required
            aria-label="Appointment title" placeholder="Example consultation"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 bg-background"
          />
          <input
            required
            aria-label="Appointment date and time" type="datetime-local"
            value={form.datetime}
            onChange={(e) => setForm({ ...form, datetime: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 bg-background"
          />
          <input
            placeholder="Location (optional)"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 bg-background"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border text-sm hover:bg-accent transition">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && <p className="text-muted-foreground text-sm">Loading...</p>}

      {!loading && upcoming.length === 0 && suggestions.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No upcoming dates. Scan the example inbox or add a date.</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">Upcoming</h2>
          <div className="space-y-3">
            {upcoming.map((apt) => (
              <AppointmentCard key={apt.id} apt={apt} />
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">Past</h2>
          <div className="space-y-3 opacity-60">
            {past.slice(0, 5).map((apt) => (
              <AppointmentCard key={apt.id} apt={apt} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AppointmentCard({ apt }: { apt: Appointment }) {
  return (
    <div className="rounded-xl border bg-card p-4 flex gap-4">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Calendar className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1">
        <p className="font-medium">{apt.title}</p>
        <div className="flex flex-wrap gap-3 mt-1">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {formatDate(apt.datetime)}
          </span>
          {apt.duration && (
            <span className="text-xs text-muted-foreground">⏱ {apt.duration}</span>
          )}
          {apt.location && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" />
              {apt.location}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
