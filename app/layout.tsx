import type { Metadata } from "next";
import Link from "next/link";
import { ResetDemo } from "./reset-demo";
import "./globals.css";

export const metadata: Metadata = {title: "Charm AI | Portfolio demo", description: "A synthetic SMS inbox & appointment scheduling demo."};
export default function Layout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en" className="dark"><body className="flex min-h-dvh flex-col has-[aside]:h-dvh">
    <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-zinc-800 bg-zinc-950 px-4 py-3 text-sm">
      <strong className="text-white">Charm AI</strong><nav aria-label="Demo navigation" className="flex gap-4">
      <Link href="/dashboard/inbox">Inbox</Link><Link href="/dashboard/schedule">Schedule</Link></nav><ResetDemo/>
      <p className="basis-full text-xs text-zinc-400">Portfolio demo · Synthetic data · Replies & bookings stay in this tab. SMS delivery & calendar sync are disabled.</p>
    </header>{children}</body></html>;
}
