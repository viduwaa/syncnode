# SyncNode Rehaul Directory Structure

This folder contains the restructured, clean codebase for the SyncNode overhaul, separated into modular firmware, backend, and frontend directories.

```
rehaul/
├── firmware/                 # ESP32 PlatformIO Project (Arduino Framework)
│   ├── include/
│   │   └── config.h          # Hardware pinout configurations, default settings, and Wi-Fi constants
│   ├── src/
│   │   ├── main.cpp          # FreeRTOS setup, task coordination, and core loops
│   │   ├── audio_pipeline.h  # DSP EQ filters, Helix MP3 decoder, Volume, and I2S streams
│   │   ├── audio_pipeline.cpp
│   │   ├── websocket_client.h# WebSocket client handles server push events and reports hardware status
│   │   ├── websocket_client.cpp
│   │   ├── display_manager.h # SSD1306 OLED layout drawing and dynamic menu transitions
│   │   ├── display_manager.cpp
│   │   ├── input_manager.h   # Non-blocking debounced buttons and analog potentiometer reading
│   │   └── input_manager.cpp
│   └── platformio.ini        # Environment profile, pins library dependency (WebSockets, U8g2, etc.)
│
├── backend/                  # Go REST & WebSocket Server
│   ├── cmd/
│   │   ├── server/
│   │   │   └── main.go       # Application entry point, env loader, and HTTP server startup
│   │   └── ip/
│   │       └── main.go       # Standalone LAN IP configurator utility (compiles to config_ip.exe)
│   ├── pkg/
│   │   ├── api/
│   │   │   ├── handlers.go   # REST handlers and WebSocket connection upgraders (/ws, /ws/esp32)
│   │   │   └── router.go     # Route mapping and CORS middlewares
│   │   ├── player/
│   │   │   └── state.go      # Thread-safe global player state and local file persistence
│   │   └── youtube/
│   │       └── resolver.go   # In-process YouTube parser (kkdai/youtube) and ffmpeg MP3 stream transcoder
│   ├── go.mod
│   ├── go.sum
│   └── .env.example
│
└── frontend/                 # Next.js 16 (React 19) Web Dashboard
    ├── app/
    │   ├── api/              # API and authentication endpoints
    │   ├── search/           # Search and recommendations interface
    │   ├── library/          # Liked songs and custom playlist explorer
    │   ├── page.tsx          # Glassmorphic control dashboard
    │   ├── layout.tsx
    │   └── globals.css       # Style variables, premium dark mode, and interactive scrollbars
    ├── components/
    │   ├── layout/           # Sidebar navigation, responsive mobile bottom navbar
    │   └── player/
    │       ├── MiniPlayer.tsx# Glassmorphic play overlay and responsive controls (EQ curves, sequence)
    │       └── PlayerSync.tsx# WebSocket listener component to feed server states into Zustand store
    ├── lib/
    │   ├── api.ts            # Client network request modules
    │   └── store.ts          # Zustand player state machine (volume, tracks, loading indicators)
    ├── package.json
    ├── tailwind.config.ts
    └── tsconfig.json
```
