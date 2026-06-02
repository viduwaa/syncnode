# 🎵 SyncNode: Universal IoT Audio Streaming System

Welcome to **SyncNode**! SyncNode is a high-fidelity, real-time audio streaming system that connects an **ESP32 hardware node** directly to a **Go backend transcoder** and controls it all via a beautiful **Next.js web dashboard**.

Whether you want to stream high-quality music from YouTube directly to an I2S DAC (like the PCM5102A), control your system with hardware knobs and buttons, adjust audio frequencies with a **3-Band software EQ**, or view real-time castings from a web panel, SyncNode has you covered.

---

## 🚀 Key Features

*   **⚡ WebSocket Powered Control**: Ditch HTTP polling. Commands (play, pause, volume, EQ adjustment) are pushed down persistent WebSockets instantly (< 5ms delay).
*   **🎹 Hardware 3-Band DSP Equalizer**: Adjust low, mid, and high frequencies directly on the ESP32 (ranges: $-10dB$ to $+10dB$) using linear multipliers.
*   **🔍 Native Go YouTube Resolver**: Resolves Google Video stream links in-process (using `kkdai/youtube`), cutting down resolution start delays by up to 2 seconds.
*   **📡 Real-Time Diagnostics & Casting**: A premium web widget tracking connected nodes, MAC addresses, local IPs, and WiFi signal levels (RSSI in dBm) in real-time.
*   **🎛️ Noise-Filtered Inputs**: Debounced physical buttons and an Exponential Moving Average (EMA) filter on the potentiometer to eliminate Wi-Fi noise and volume jumps.
*   **📺 ssd1306 OLED Status Screen**: Shows real-time song titles, artist info, current volume, connection state, signal strength, and a live elapsed track timer.

---

## 📂 Project Structure

```
syncnode/
├── firmware/             # ESP32 C++ PlatformIO Firmware Project
│   ├── include/config.h  # Central pinout declarations & timing thresholds
│   └── src/
│       ├── main.cpp      # Coordinator looping WebSocket client & audio pipeline
│       ├── audio_pipeline.h/cpp # Helix MP3 decoder, Volume, Equalizer & I2S streams
│       ├── websocket_client.h/cpp # Persistent WebSocket client & JSON handlers
│       ├── display_manager.h/cpp  # OLED SSD1306 drawing layouts & status screens
│       └── input_manager.h/cpp    # Non-blocking button handler & EMA volume filter
│
├── backend/              # Go REST & WebSocket Transcoding Server
│   ├── cmd/
│   │   ├── server/       # Entry point main.go launching API routes & tracker loop
│   │   └── ip/           # Utility main.go for local IP address detection
│   └── pkg/
│       ├── api/          # handlers.go (WS connections, ffmpeg stream) & router.go
│       ├── player/       # state.go (Thread-safe PlayerState & local caching)
│       └── youtube/      # resolver.go (Native streaming resolver & YouTube search)
│
└── frontend/             # Next.js 16 Web Dashboard
    ├── app/              # Navigation views: /, /search, /library, /profile
    ├── components/
    │   ├── layout/       # Sidebar, BottomNav, and DeviceStatusWidget
    │   ├── player/       # MiniPlayer and PlayerSync components
    │   └── providers/    # AuthProvider and other context wrappers
    ├── lib/              # store.ts (Zustand store) and api.ts (REST client)
    └── types/            # Shared TypeScript type definitions
```

---

## 🔌 Hardware Wiring Guide

To build the physical SyncNode receiver, connect your ESP32 to a **PCM5102A DAC** and an **SSD1306 OLED screen** (I2C) using the pinout mapping defined in [config.h](firmware/include/config.h):

### 1. I2S DAC (PCM5102A) Wiring
| PCM5102A Pin | ESP32 GPIO Pin | Description |
| :--- | :--- | :--- |
| **VCC** | `3V3` or `5V` | Power Supply |
| **GND** | `GND` | Ground |
| **BCK** | `GPIO 26` | Bit Clock (BCK) |
| **DIN** | `GPIO 25` | Data Input (DIN) |
| **LCK** | `GPIO 22` | Word Select (WS / LRCK) |

> [!NOTE]
> Ensure you bridge the **SCK** (System Clock) pin on the PCM5102A directly to **GND** to enable internal clock generation, as the ESP32 doesn't output a master clock (MCLK).

### 2. SSD1306 OLED Display (I2C) Wiring
| SSD1306 Pin | ESP32 GPIO Pin | Description |
| :--- | :--- | :--- |
| **VCC** | `3V3` | Power Supply |
| **GND** | `GND` | Ground |
| **SDA** | `GPIO 21` | Serial Data |
| **SCL** | `GPIO 19` | Serial Clock |

### 3. Controls & Potentiometers
*   **Play/Pause Button**: `GPIO 33` (pulled up, triggers on transition to GND)
*   **Skip Next Button**: `GPIO 32` (pulled up, triggers on transition to GND)
*   **Skip Previous Button**: `GPIO 35` (pulled up, triggers on transition to GND)
*   **Volume Potentiometer**: `GPIO 34` (analog input pin)

---

## 🛠️ Installation & Setup

### Prerequisite: install ffmpeg
The Go backend requires `ffmpeg` to be installed and available in your system's `PATH` to transcode streams into standard MP3 format for the Helix decoder.

---

### Step 1: Run the Go Backend
1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```
2.  Copy the example environment settings and populate your settings (add your `YOUTUBE_API_KEY` if you want search queries enabled):
    ```bash
    copy .env.example .env
    ```
3.  Build and run the server:
    ```bash
    go build -o server.exe ./cmd/server/
    ./server.exe
    ```
    The server will expose REST endpoints and WebSockets on port **`8080`**.

---

### Step 2: Launch the Web Dashboard
1.  Navigate to the frontend directory:
    ```bash
    cd frontend
    ```
2.  Install the packages:
    ```bash
    pnpm install
    ```
3.  Start the development server:
    ```bash
    pnpm dev
    ```
4.  Open `http://localhost:3000` in your web browser.

---

### Step 3: Flash the ESP32 Firmware
1.  Open the directory `firmware` using VS Code with the **PlatformIO** extension installed.
2.  Open [config.h](firmware/include/config.h) and verify that the pins align with your hardware.
3.  Connect the ESP32 to your PC via USB and click **Upload** in the PlatformIO toolbar.
4.  Once flashed:
    *   The OLED screen will boot up and display a `WiFi Setup AP` prompt.
    *   Connect to the WiFi network `SyncNode-XXXX` on your phone or PC.
    *   The configuration portal will load. Select your home Wi-Fi network and input your **Go server's local IP address** (e.g. `192.168.1.44`).
    *   Save and restart the ESP32. It will connect to your Wi-Fi, register with the server, and stay ready to stream!

---

## 🤝 Contributing & Feedback

Have questions, suggestions, or want to contribute? Feel free to open a Pull Request, report issues, or contribute to optimizing helix codecs or hardware filters! Let's keep the audio streaming low-latency and premium.

Happy streaming! 🎧
