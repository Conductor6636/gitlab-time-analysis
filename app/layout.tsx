import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ThemeWrapper from "./ThemeWrapper";
import { UserAuthProvider } from "./UserAuthContext";
import AppShell from "./components/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "GitLab DHBW-SE Time Analysis Tool";
const description =
  "A tool to analyze time tracking data from GitLab for DHBW-SE students.";

import { ThemeModeProvider } from "./ThemeContext";
import { UserProfileProvider } from "./UserProfileContext";

export const metadata: Metadata = {
  title,
  description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <UserAuthProvider>
          <UserProfileProvider>
            <ThemeModeProvider>
              <ThemeWrapper>
                <AppShell>{children}</AppShell>
              </ThemeWrapper>
            </ThemeModeProvider>
          </UserProfileProvider>
        </UserAuthProvider>
      </body>
    </html>
  );
}
