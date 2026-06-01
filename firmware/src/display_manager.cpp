#include "display_manager.h"
#include "config.h"
#include <Wire.h>

DisplayManager::DisplayManager()
    : _u8g2(U8G2_R0, U8X8_PIN_NONE) {}

void DisplayManager::begin() {
    Serial.println("[OLED] Initializing screen on custom SDA/SCL pins...");
    Wire.begin(OLED_SDA, OLED_SCL, 400000); // 400kHz fast I2C
    _u8g2.begin();
    _u8g2.setContrast(255);
    
    // Welcome splash
    _u8g2.clearBuffer();
    _u8g2.setFont(u8g2_font_7x14B_tf);
    _u8g2.drawStr(22, 26, "SyncNode v2.0");
    _u8g2.setFont(u8g2_font_6x10_tf);
    _u8g2.drawStr(28, 45, "Loading system...");
    _u8g2.sendBuffer();
    Serial.println("[OLED] Splash screen loaded successfully");
}

void DisplayManager::showConnecting(const char* ssid) {
    _u8g2.clearBuffer();
    _u8g2.setFont(u8g2_font_7x14B_tf);
    _u8g2.drawStr(10, 20, "Connecting...");
    _u8g2.setFont(u8g2_font_6x10_tf);
    _u8g2.drawStr(10, 42, "Target Network:");
    _u8g2.drawStr(10, 56, ssid);
    _u8g2.sendBuffer();
}

void DisplayManager::showConnected(const char* ip, const char* server) {
    _u8g2.clearBuffer();
    _u8g2.setFont(u8g2_font_7x14B_tf);
    _u8g2.drawStr(10, 20, "Connected!");
    _u8g2.setFont(u8g2_font_6x10_tf);
    _u8g2.drawStr(10, 38, ip);
    _u8g2.drawStr(10, 54, server);
    _u8g2.sendBuffer();
}

void DisplayManager::showApPortal(const char* apName) {
    _u8g2.clearBuffer();
    _u8g2.setFont(u8g2_font_7x14B_tf);
    _u8g2.drawStr(10, 18, "Captive Portal");
    _u8g2.setFont(u8g2_font_6x10_tf);
    _u8g2.drawStr(5, 36, "Join Access Point:");
    _u8g2.setFont(u8g2_font_6x10_tf);
    _u8g2.drawStr(5, 52, apName);
    _u8g2.sendBuffer();
}

void DisplayManager::showError(const char* msg) {
    _u8g2.clearBuffer();
    _u8g2.setFont(u8g2_font_7x14B_tf);
    _u8g2.drawStr(10, 20, "SYSTEM ERROR");
    _u8g2.setFont(u8g2_font_6x10_tf);
    _u8g2.drawStr(10, 45, msg);
    _u8g2.sendBuffer();
}

void DisplayManager::showTrack(const char* title, const char* artist, bool isPlaying, int volume, int rssi, int positionSec) {
    _u8g2.clearBuffer();
    
    // Draw Top Header
    drawHeader(isPlaying ? "> PLAYING" : "|| PAUSED", rssi);
    
    // Draw Separator Line
    _u8g2.drawHLine(0, 14, 128);
    
    // Draw Title (Max 18 chars shown)
    _u8g2.setFont(u8g2_font_7x14B_tf);
    if (title && strlen(title) > 0) {
        String t = String(title).substring(0, 18);
        _u8g2.drawStr(0, 30, t.c_str());
    } else {
        _u8g2.drawStr(0, 30, "No Track Loaded");
    }
    
    // Draw Artist (Max 21 chars shown)
    _u8g2.setFont(u8g2_font_6x10_tf);
    if (artist && strlen(artist) > 0) {
        String a = String(artist).substring(0, 21);
        _u8g2.drawStr(0, 43, a.c_str());
    }
    
    // Draw Lower Separator Line
    _u8g2.drawHLine(0, 47, 128);
    
    // Draw Volume Status & Timer
    _u8g2.setFont(u8g2_font_6x10_tf);
    char volStr[16];
    snprintf(volStr, sizeof(volStr), "Vol: %d%%", volume);
    _u8g2.drawStr(0, 60, volStr);
    
    char timeStr[16];
    int minutes = positionSec / 60;
    int seconds = positionSec % 60;
    snprintf(timeStr, sizeof(timeStr), "%02d:%02d", minutes, seconds);
    _u8g2.drawStr(98, 60, timeStr);
    
    _u8g2.sendBuffer();
}

void DisplayManager::drawHeader(const char* statusText, int rssi) {
    _u8g2.setFont(u8g2_font_6x10_tf);
    _u8g2.drawStr(0, 10, statusText);
    
    // Draw WiFi RSSI Signal Strength Bars (Top Right corner)
    // 3 bars total based on dBm limits
    int x = 116;
    
    // Bar 1 (always shown if connected)
    if (rssi > -90) _u8g2.drawBox(x, 7, 3, 3);
    // Bar 2
    if (rssi > -70) _u8g2.drawBox(x + 4, 4, 3, 6);
    // Bar 3
    if (rssi > -50) _u8g2.drawBox(x + 8, 1, 3, 9);
}
