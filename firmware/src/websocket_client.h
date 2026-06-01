#ifndef WEBSOCKET_CLIENT_H
#define WEBSOCKET_CLIENT_H

#include <Arduino.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

class WebSocketClientManager {
public:
    struct Callbacks {
        void (*onPlay)(const String& url, const String& title, const String& artist);
        void (*onPause)();
        void (*onResume)();
        void (*onStop)();
        void (*onVolume)(int volume);
        void (*onEQ)(int bass, int mid, int treble);
    };

    WebSocketClientManager(Callbacks callbacks);
    
    void begin(const char* host, uint16_t port, const String& mac, const String& ip);
    void loop();
    
    bool isConnected() const { return _isConnected; }
    
    // Status reports to backend
    void sendReport(const char* state, int volume, int position, int rssi);
    void sendTrackFinished(int rssi);
    void sendButtonAction(const char* action, int rssi);
    void sendKnobVolume(int volume, int rssi);

private:
    WebSocketsClient _webSocket;
    Callbacks _callbacks;
    bool _isConnected;
    String _mac;
    String _ip;

    void handleEvent(WStype_t type, uint8_t * payload, size_t length);
    void handleTextMessage(const char* text);
    
    static WebSocketClientManager* _instance;
    static void webSocketEvent(WStype_t type, uint8_t * payload, size_t length);
};

#endif // WEBSOCKET_CLIENT_H
