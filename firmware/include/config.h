    #ifndef CONFIG_H
    #define CONFIG_H

    #include <Arduino.h>

    // ============================================
    // Network & WebSocket Settings
    // ============================================
    extern char backendHost[40];
    constexpr int BACKEND_PORT = 8080;
    constexpr int WS_PING_INTERVAL_MS = 5000;

    // ============================================
    // I2S Pins (PCM5102A DAC)
    // ============================================
    constexpr int I2S_BCK  = 26;   // BCLK (Bit Clock)
    constexpr int I2S_WS   = 25;   // LRC  (Word Select / LRCLK)
    constexpr int I2S_DOUT = 22;   // DIN  (Data In)

    // Audio Configuration
    constexpr uint32_t SAMPLE_RATE = 44100;
    constexpr uint8_t  CHANNELS    = 2;
    constexpr uint8_t  BITS        = 16;

    // ============================================
    // Hardware Buttons (Pull-Up Active LOW)
    // ============================================
    constexpr int BTN_PLAY_PAUSE = 32;
    constexpr int BTN_NEXT       = 33;
    constexpr int BTN_PREVIOUS   = 27;
    constexpr unsigned long BTN_DEBOUNCE_MS = 350;

    // ============================================
    // Volume Potentiometer (B10K Analog Input)
    // ============================================
    constexpr int POT_PIN = 36;             // VP Pin (ADC1_CH0)
    constexpr int POT_DEADZONE = 8;         // Ignore minor fluctuations (0-100% range)
    constexpr unsigned long POT_POLL_MS = 50;
    constexpr unsigned long VOL_SYNC_DELAY_MS = 400; // Wait for user to stop turning before syncing

    // ============================================
    // OLED Display (SSD1306 128x64 HW I2C)
    // ============================================
    constexpr int OLED_SDA = 21;
    constexpr int OLED_SCL = 19;
    constexpr unsigned long OLED_REFRESH_MS = 1000;

    // ============================================
    // Status Reporting Intervals
    // ============================================
    constexpr unsigned long STATUS_REPORT_MS = 2000;

    #endif // CONFIG_H
