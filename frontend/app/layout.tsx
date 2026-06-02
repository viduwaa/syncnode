import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/layout/BottomNav";
import MiniPlayer from "@/components/player/MiniPlayer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AuraStream | Universal IoT Audio",
  description: "High-fidelity YouTube streaming for ESP32 systems.",
};

import AuthProvider from "@/components/providers/AuthProvider";
import PlayerSync from "@/components/player/PlayerSync";
import Sidebar from "@/components/layout/Sidebar";
import DeviceStatusWidget from "@/components/layout/DeviceStatusWidget";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black text-white min-h-screen relative overflow-x-hidden`}
      >
        <AuthProvider>
          <PlayerSync />
          
          {/* Background Ambient Glow */}
          <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
            <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-brand-orange/10 blur-[120px] rounded-full" />
            <div className="absolute top-[20%] -right-[10%] w-[35%] h-[35%] bg-brand-purple/10 blur-[120px] rounded-full" />
            <div className="absolute -bottom-[10%] left-[20%] w-[45%] h-[45%] bg-brand-cyan/5 blur-[120px] rounded-full" />
          </div>

          <div className="flex relative z-10">
            <Sidebar />
            
            <main className="flex-1 w-full lg:pl-72 min-h-screen pb-32 lg:pb-0">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
                {/* Global Top Bar */}
                <div className="flex justify-end items-center mb-6">
                  <DeviceStatusWidget />
                </div>
                {children}
              </div>
            </main>
          </div>

          <div className="lg:hidden">
            <BottomNav />
          </div>
          
          <MiniPlayer />
        </AuthProvider>
      </body>
    </html>
  );
}



