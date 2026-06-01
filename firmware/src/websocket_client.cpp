#include "websocket_client.h"

// Define the static instance pointer
WebSocketClientManager* WebSocketClientManager::_instance = nullptr;

static String urlEncode(const String& val) {
    String encoded = "";
    char c;
    char code0;
    char code1;
    for (unsigned int i = 0; i < val.length(); i++) {
        c = val.charAt(i);
        if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
            encoded += c;
        } else {
            code1 = (c & 0xf) + '0';
            if ((c & 0xf) > 9) code1 = (c & 0xf) - 10 + 'A';
            c = (c >> 4) & 0xf;
            code0 = c + '0';
            if (c > 9) code0 = c - 10 + 'A';
            encoded += '%';
            encoded += code0;
            encoded += code1;
        }
    }
    return encoded;
}

WebSocketClientManager::WebSocketClientManager(Callbacks callbacks)
    : _callbacks(callbacks)
    , _isConnected(false) {}

void WebSocketClientManager::begin(const char* host, uint16_t port, const String& mac, const String& ip) {
    _mac = mac;
    _ip = ip;
    _instance = this;

    // Prepare query parameters containing local MAC and IP address
    String url = "/ws/esp32?mac=" + urlEncode(mac) + "&ip=" + urlEncode(ip);

    Serial.printf("[WS] Connecting to server: ws://%s:%d%s\n", host, port, url.c_str());
    
    _webSocket.begin(host, port, url.c_str());
    _webSocket.onEvent(webSocketEvent);
    _webSocket.enableHeartbeat(15000, 3000, 2); // Ping every 15s, wait 3s, disconnect after 2 fails
    
    _isConnected = false;
}

void WebSocketClientManager::loop() {
    _webSocket.loop();
}

void WebSocketClientManager::webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    if (_instance) {
        _instance->handleEvent(type, payload, length);
    }
}

void WebSocketClientManager::handleEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            _isConnected = false;
            Serial.println("[WS] Disconnected from server!");
            break;
            
        case WStype_CONNECTED:
            _isConnected = true;
            Serial.println("[WS] Successfully connected to server WebSocket!");
            break;
            
        case WStype_TEXT:
            handleTextMessage((const char*)payload);
            break;
            
        case WStype_BIN:
            // Binary formats not used in SyncNode controls
            break;
            
        case WStype_ERROR:
            Serial.println("[WS] Error occurred on connection");
            break;
            
        case WStype_PING:
        case WStype_PONG:
            break;
    }
}

void WebSocketClientManager::handleTextMessage(const char* text) {
    // Parse JSON
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, text);
    if (err) {
        Serial.printf("[WS] JSON Deserialization failed: %s\n", err.c_str());
        return;
    }

    String action = doc["action"].as<String>();
    Serial.printf("[WS] Incoming command: '%s'\n", action.c_str());

    if (action == "play") {
        String url = doc["url"].as<String>();
        String title = doc["title"] | "Unknown Track";
        String artist = doc["artist"] | "Unknown Artist";
        if (_callbacks.onPlay) {
            _callbacks.onPlay(url, title, artist);
        }
    } 
    else if (action == "pause") {
        if (_callbacks.onPause) _callbacks.onPause();
    } 
    else if (action == "resume") {
        if (_callbacks.onResume) _callbacks.onResume();
    } 
    else if (action == "stop") {
        if (_callbacks.onStop) _callbacks.onStop();
    } 
    else if (action == "volume") {
        int val = doc["value"] | 70;
        if (_callbacks.onVolume) _callbacks.onVolume(val);
    } 
    else if (action == "eq") {
        int bass = doc["bass"] | 0;
        int mid = doc["mid"] | 0;
        int treble = doc["treble"] | 0;
        if (_callbacks.onEQ) _callbacks.onEQ(bass, mid, treble);
    }
}

void WebSocketClientManager::sendReport(const char* state, int volume, int position, int rssi) {
    if (!_isConnected) return;

    JsonDocument doc;
    doc["event"] = "status_report";
    doc["state"] = state;
    doc["volume"] = volume;
    doc["position"] = position;
    doc["rssi"] = rssi;

    String payload;
    serializeJson(doc, payload);
    _webSocket.sendTXT(payload);
}

void WebSocketClientManager::sendTrackFinished(int rssi) {
    if (!_isConnected) return;

    JsonDocument doc;
    doc["event"] = "track_finished";
    doc["rssi"] = rssi;

    String payload;
    serializeJson(doc, payload);
    _webSocket.sendTXT(payload);
}

void WebSocketClientManager::sendButtonAction(const char* action, int rssi) {
    if (!_isConnected) return;

    JsonDocument doc;
    doc["event"] = "button_press";
    doc["action"] = action;
    doc["rssi"] = rssi;

    String payload;
    serializeJson(doc, payload);
    _webSocket.sendTXT(payload);
}

void WebSocketClientManager::sendKnobVolume(int volume, int rssi) {
    if (!_isConnected) return;

    JsonDocument doc;
    doc["event"] = "pot_volume";
    doc["volume"] = volume;
    doc["rssi"] = rssi;

    String payload;
    serializeJson(doc, payload);
    _webSocket.sendTXT(payload);
}
