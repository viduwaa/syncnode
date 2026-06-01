#ifndef DISPLAY_MANAGER_H
#define DISPLAY_MANAGER_H

#include <Arduino.h>
#include <U8g2lib.h>

class DisplayManager {
public:
    DisplayManager();
    void begin();
    
    void showConnecting(const char* ssid);
    void showConnected(const char* ip, const char* server);
    void showApPortal(const char* apName);
    void showTrack(const char* title, const char* artist, bool isPlaying, int volume, int rssi, int positionSec);
    void showError(const char* msg);

private:
    U8G2_SSD1306_128X64_NONAME_F_HW_I2C _u8g2;
    void drawHeader(const char* statusText, int rssi);
};

#endif // DISPLAY_MANAGER_H
