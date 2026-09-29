import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InterviewIQ — AI Technical Interviewer",
  description: "Practice realistic technical interviews for Python, full-stack, RAG, GenAI, frontend, and AWS roles.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
