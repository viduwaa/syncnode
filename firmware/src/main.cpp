#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <Preferences.h>

#include "config.h"
#include "display_manager.h"
#include "audio_pipeline.h"
#include "input_manager.h"
#include "websocket_client.h"

// ============================================
// Global Objects
// ============================================
DisplayManager display;
AudioPipeline audio;
WebSocketClientManager* wsClient = nullptr;
InputManager* input = nullptr;

char backendHost[40] = "192.168.1.100";
String deviceMAC;
String localIP;
Preferences preferences;

// Shared States
String currentTitle = "";
String currentArtist = "";
int localVolume = 70;

// Inter-core communication flags
volatile bool trackFinished = false;

// Thread-safe command variables for Core 1 (Audio Task)
char pendingUrl[256] = "";
volatile bool pendingPlay = false;
volatile bool pendingStop = false;
volatile bool pendingPause = false;
volatile bool pendingResume = false;

volatile bool pendingVolumeUpdate = false;
volatile int pendingVolumeVal = 70;

volatile bool pendingEQUpdate = false;
volatile int pendingBass = 0;
volatile int pendingMid = 0;
volatile int pendingTreble = 0;

// Time trackers
unsigned long lastStatusTime = 0;
unsigned long lastDisplayTime = 0;

// Forward declarations
void controlTask(void* parameter);
void audioTask(void* parameter);

// ============================================
// WebSocket Callback Implementations
// ============================================
void onPlayCommand(const String& url, const String& title, const String& artist) {
    currentTitle = title;
    currentArtist = artist;
    Serial.printf("[Main] WebSocket requested PLAY: %s by %s\n", title.c_str(), artist.c_str());
    
    // OLED instant update
    display.showTrack(currentTitle.c_str(), currentArtist.c_str(), true, localVolume, WiFi.RSSI(), 0);
    
    // Start playback asynchronously on Core 1
    strncpy(pendingUrl, url.c_str(), sizeof(pendingUrl) - 1);
    pendingPlay = true;
}

void onPauseCommand() {
    Serial.println("[Main] WebSocket requested PAUSE");
    pendingPause = true;
    display.showTrack(currentTitle.c_str(), currentArtist.c_str(), false, localVolume, WiFi.RSSI(), audio.getPlaybackPositionSec());
}

void onResumeCommand() {
    Serial.println("[Main] WebSocket requested RESUME");
    pendingResume = true;
    display.showTrack(currentTitle.c_str(), currentArtist.c_str(), true, localVolume, WiFi.RSSI(), audio.getPlaybackPositionSec());
}

void onStopCommand() {
    Serial.println("[Main] WebSocket requested STOP");
    pendingStop = true;
    currentTitle = "";
    currentArtist = "";
    display.showTrack("Stopped", "", false, localVolume, WiFi.RSSI(), 0);
}

void onVolumeCommand(int volume) {
    Serial.printf("[Main] WebSocket requested VOLUME: %d%%\n", volume);
    localVolume = volume;
    pendingVolumeVal = volume;
    pendingVolumeUpdate = true;
    display.showTrack(currentTitle.c_str(), currentArtist.c_str(), audio.isPlaying(), localVolume, WiFi.RSSI(), audio.getPlaybackPositionSec());
}

void onEQCommand(int bass, int mid, int treble) {
    Serial.printf("[Main] WebSocket requested EQ: Bass=%d, Mid=%d, Treble=%d\n", bass, mid, treble);
    pendingBass = bass;
    pendingMid = mid;
    pendingTreble = treble;
    pendingEQUpdate = true;
}

// ============================================
// Hardware Input Callback Implementations
// ============================================
void onButtonPress(const char* action) {
    if (!wsClient || !wsClient->isConnected()) {
        Serial.println("[Main] Button pressed but WebSocket is not connected!");
        return;
    }

    if (strcmp(action, "play_pause") == 0) {
        if (audio.isPlaying()) {
            pendingPause = true; // Instant local response asynchronously
            wsClient->sendButtonAction("pause", WiFi.RSSI());
        } else {
            pendingResume = true; // Instant local response asynchronously
            wsClient->sendButtonAction("resume", WiFi.RSSI());
        }
    } 
    else if (strcmp(action, "skip") == 0) {
        pendingStop = true;
        wsClient->sendButtonAction("skip", WiFi.RSSI());
    } 
    else if (strcmp(action, "previous") == 0) {
        pendingStop = true;
        wsClient->sendButtonAction("previous", WiFi.RSSI());
    }
}

void onVolumeKnobChange(int volume) {
    // Instant local volume response (updates DAC asynchronously on Core 1)
    localVolume = volume;
    pendingVolumeVal = volume;
    pendingVolumeUpdate = true;
    
    // OLED instant update for real-time dial feedback
    display.showTrack(currentTitle.c_str(), currentArtist.c_str(), audio.isPlaying(), localVolume, WiFi.RSSI(), audio.getPlaybackPositionSec());

    // When the knob settles, input_manager.cpp will log the sync event,
    // which triggers the main loop volume sync via onVolumeKnobSettled
}

// Linked to stable knob settle callback (from input_manager)
void onVolumeKnobSettled(int volume) {
    if (wsClient && wsClient->isConnected()) {
        wsClient->sendKnobVolume(volume, WiFi.RSSI());
    }
}

// ============================================
// WiFi Connection setup via Captive Portal
// ============================================
bool setupWiFi() {
    WiFiManager wm;

    // Load saved server IP from storage
    preferences.begin("syncnode", false);
    String savedHost = preferences.getString("backend", "192.168.1.100");
    savedHost.toCharArray(backendHost, sizeof(backendHost));
    preferences.end();

    // Setup WiFiManager captive portal input field
    WiFiManagerParameter customBackend("backend", "Go Server IP", backendHost, 40);
    wm.addParameter(&customBackend);

    // Create unique AP name
    String mac = WiFi.macAddress();
    String apName = "SyncNode-" + mac.substring(mac.length() - 5);
    apName.replace(":", "");

    Serial.printf("[WiFi] Starting AP Portal: %s\n", apName.c_str());
    display.showApPortal(apName.c_str());

    // Config portal timeout (3 mins)
    wm.setConfigPortalTimeout(180);

    if (wm.autoConnect(apName.c_str())) {
        deviceMAC = WiFi.macAddress();
        localIP = WiFi.localIP().toString();

        // Save server IP entered in portal
        strncpy(backendHost, customBackend.getValue(), sizeof(backendHost) - 1);
        preferences.begin("syncnode", false);
        preferences.putString("backend", backendHost);
        preferences.end();

        Serial.printf("[WiFi] Connected successfully. Local IP: %s\n", localIP.c_str());
        Serial.printf("[WiFi] Central Go Server IP: %s\n", backendHost);
        display.showConnected(localIP.c_str(), backendHost);
        delay(1500);
        return true;
    }
    
    Serial.println("[WiFi] Connection failed!");
    return false;
}

// ============================================
// Setup
// ============================================
void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n=========================================");
    Serial.println("   SyncNode ESP32 Overhauled Firmware");
    Serial.println("=========================================\n");

    // Initialize OLED Display
    display.begin();

    // Factory Reset WiFi Trigger: Hold Play/Pause button on power up
    pinMode(BTN_PLAY_PAUSE, INPUT_PULLUP);
    delay(100); // Wait for physical lines to stabilize
    if (digitalRead(BTN_PLAY_PAUSE) == LOW) {
        Serial.println("[System] Play/Pause button held during boot! Factory resetting WiFi...");
        display.showError("Resetting WiFi...\nRelease Button");
        
        WiFiManager wm;
        wm.resetSettings();
        
        // Keep waiting until the button is released to prevent loop
        while (digitalRead(BTN_PLAY_PAUSE) == LOW) {
            delay(50);
        }
        Serial.println("[System] WiFi settings cleared. Restarting board...");
        ESP.restart();
    }

    // Provision Wi-Fi
    if (!setupWiFi()) {
        display.showError("WiFi Setup Failed. Restarting...");
        delay(5000);
        ESP.restart();
    }

    // Configure I2S audio & EQ
    audio.begin();

    // Start UI/WebSocket task on Core 0
    xTaskCreatePinnedToCore(
        controlTask,      // Task function
        "ControlTask",    // Name
        8192,             // Stack size (8KB)
        NULL,             // Parameters
        1,                // Priority (1 = normal)
        NULL,             // Task handle
        0                 // Run on Core 0
    );
    Serial.println("[Core] UI/WebSocket task started on Core 0");

    // Start Audio Stream task on Core 1 (Priority 5, 48KB stack for Helix decoding)
    xTaskCreatePinnedToCore(
        audioTask,        // Task function
        "AudioTask",      // Name
        49152,            // Stack size (48KB)
        NULL,             // Parameters
        5,                // Priority (5 = above normal)
        NULL,             // Task handle
        1                 // Run on Core 1
    );
    Serial.println("[Core] Audio stream task started on Core 1");
}

// ============================================
// Core 0 Task: WebSocket, Display, and Inputs
// ============================================
void controlTask(void* parameter) {
    Serial.println("[Core 0] Control task active");

    // Setup WebSockets client
    WebSocketClientManager::Callbacks wsCallbacks = {
        .onPlay = onPlayCommand,
        .onPause = onPauseCommand,
        .onResume = onResumeCommand,
        .onStop = onStopCommand,
        .onVolume = onVolumeCommand,
        .onEQ = onEQCommand
    };
    wsClient = new WebSocketClientManager(wsCallbacks);
    wsClient->begin(backendHost, BACKEND_PORT, deviceMAC, localIP);

    // Setup Hardware Inputs
    input = new InputManager(onButtonPress, onVolumeKnobChange, onVolumeKnobSettled);
    input->begin();

    for (;;) {
        unsigned long now = millis();

        // 1. Loop WebSocket client
        wsClient->loop();

        // 2. Loop Hardware Buttons & Potentiometer
        input->update();

        // If volume sync is requested (after pot settles)
        // input_manager manages timing, so we check if stable volume changed and report it
        // We do this by mapping the settled volume directly
        static int prevStableVol = -1;
        int currentStableVol = localVolume; // falls back to local volume if changed
        // To verify settling, we map settled callbacks in input_manager
        
        // 3. Process track finished reports (Core 1 flag transfer)
        if (trackFinished) {
            trackFinished = false;
            Serial.println("[Core 0] Sending track finished report to WebSocket...");
            wsClient->sendTrackFinished(WiFi.RSSI());
        }

        // 4. Periodically report playback status (every 2 seconds)
        if (audio.isPlaying() && (now - lastStatusTime >= STATUS_REPORT_MS)) {
            lastStatusTime = now;
            wsClient->sendReport("playing", localVolume, audio.getPlaybackPositionSec(), WiFi.RSSI());
        }

        // 5. Periodically refresh OLED (every 1 second)
        if (now - lastDisplayTime >= OLED_REFRESH_MS) {
            lastDisplayTime = now;
            display.showTrack(currentTitle.c_str(), currentArtist.c_str(), audio.isPlaying(), localVolume, WiFi.RSSI(), audio.getPlaybackPositionSec());
        }

        // 6. Handle Reconnections
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println("[WiFi] Lost connection, trying to reconnect...");
            WiFi.disconnect();
            WiFi.begin();
            // Wait up to 10s
            int attempts = 0;
            while (WiFi.status() != WL_CONNECTED && attempts < 20) {
                delay(500);
                attempts++;
            }
            if (WiFi.status() == WL_CONNECTED) {
                Serial.printf("[WiFi] Reconnected. IP: %s\n", WiFi.localIP().toString().c_str());
                localIP = WiFi.localIP().toString();
                wsClient->begin(backendHost, BACKEND_PORT, deviceMAC, localIP);
            }
        }

        // Yield to other tasks
        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}

// ============================================
// Core 1 Dedicated Audio Thread
// ============================================
void audioTask(void* parameter) {
    Serial.println("[Core 1] Audio task active");

    for (;;) {
        // 1. Process asynchronous commands from Core 0
        if (pendingPlay) {
            pendingPlay = false;
            Serial.printf("[Core 1] Starting playback stream on Core 1: %s\n", pendingUrl);
            audio.startStream(pendingUrl);
        }
        if (pendingPause) {
            pendingPause = false;
            audio.pauseStream();
        }
        if (pendingResume) {
            pendingResume = false;
            audio.resumeStream();
        }
        if (pendingStop) {
            pendingStop = false;
            audio.stopStream();
        }
        if (pendingVolumeUpdate) {
            pendingVolumeUpdate = false;
            audio.setVolume(pendingVolumeVal);
        }
        if (pendingEQUpdate) {
            pendingEQUpdate = false;
            audio.setEQ(pendingBass, pendingMid, pendingTreble);
        }

        // 2. Perform audio stream data copy tick
        if (audio.isPlaying()) {
            size_t copied = audio.copyTick();
            
            // Detect if stream ended
            if (copied == 0) {
                if (!audio.isStreamActive()) {
                    Serial.println("[Core 1] Audio stream closed by server, track ended.");
                    audio.stopStream();
                    trackFinished = true; // Signal Core 0 to send the WS report
                } else {
                    // Yield to prevent watchdog starvation while network buffers are loading
                    vTaskDelay(10 / portTICK_PERIOD_MS);
                }
            }
        } else {
            // Yield on idle to prevent watchdog trigger
            vTaskDelay(10 / portTICK_PERIOD_MS);
        }
    }
}

// ============================================
// Main Arduino Loop (Core 1 - Standard loopTask)
// ============================================
void loop() {
    // The loop task simply yields since AudioTask on Core 1 does all the work
    vTaskDelay(1000 / portTICK_PERIOD_MS);
}
