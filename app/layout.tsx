import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chat",
  description: "对话与模型管理"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="page">
          <div className="shell">
            <nav className="nav">
              <h1>Chat</h1>
              <div className="nav-links">
                <Link className="nav-link" href="/chat">对话页面</Link>
                <Link className="nav-link" href="/settings">设置</Link>
              </div>
            </nav>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
