#include "input_manager.h"
#include "config.h"

InputManager::InputManager(ButtonCallback btnCallback, VolumeCallback volCallback)
    : _btnCallback(btnCallback)
    , _volCallback(volCallback)
    , _lastPlayPausePress(0)
    , _lastNextPress(0)
    , _lastPrevPress(0)
    , _lastVolume(-1)
    , _stableVolume(-1)
    , _filteredRaw(-1.0f)
    , _lastVolChangeTime(0)
    , _needsSync(false)
    , _lastPotPollTime(0) {}

void InputManager::begin() {
    pinMode(BTN_PLAY_PAUSE, INPUT_PULLUP);
    pinMode(BTN_NEXT, INPUT_PULLUP);
    pinMode(BTN_PREVIOUS, INPUT_PULLUP);
    
    // Read initial volume with averaging
    long sum = 0;
    for (int i = 0; i < 16; i++) {
        sum += analogRead(POT_PIN);
        delayMicroseconds(50);
    }
    int raw = sum / 16;
    _filteredRaw = (float)raw;
    _lastVolume = map(raw, 0, 4095, 0, 100);
    _stableVolume = _lastVolume;
    
    Serial.printf("[Input] Initialized. Initial Pot Volume: %d%% (Raw: %d)\n", _stableVolume, raw);
}

void InputManager::update() {
    unsigned long now = millis();

    // 1. Button Polling
    // Play / Pause Button
    if (digitalRead(BTN_PLAY_PAUSE) == LOW && (now - _lastPlayPausePress) > BTN_DEBOUNCE_MS) {
        _lastPlayPausePress = now;
        Serial.println("[Input] Play/Pause button pressed");
        if (_btnCallback) _btnCallback("play_pause");
    }

    // Skip Next Button
    if (digitalRead(BTN_NEXT) == LOW && (now - _lastNextPress) > BTN_DEBOUNCE_MS) {
        _lastNextPress = now;
        Serial.println("[Input] Skip button pressed");
        if (_btnCallback) _btnCallback("skip");
    }

    // Previous Button
    if (digitalRead(BTN_PREVIOUS) == LOW && (now - _lastPrevPress) > BTN_DEBOUNCE_MS) {
        _lastPrevPress = now;
        Serial.println("[Input] Previous button pressed");
        if (_btnCallback) _btnCallback("previous");
    }

    // 2. Potentiometer Volume Knob Polling (every POT_POLL_MS)
    if (now - _lastPotPollTime > POT_POLL_MS) {
        _lastPotPollTime = now;
        
        // Multi-sample average
        long sum = 0;
        for (int i = 0; i < 8; i++) {
            sum += analogRead(POT_PIN);
            delayMicroseconds(30);
        }
        int raw = sum / 8;
        
        // Exponential Moving Average (EMA) filter
        if (_filteredRaw < 0) {
            _filteredRaw = raw;
        } else {
            _filteredRaw = 0.15f * raw + 0.85f * _filteredRaw;
        }
        
        int mappedVol = map((int)_filteredRaw, 0, 4095, 0, 100);
        
        // If volume changed beyond deadzone
        if (abs(mappedVol - _lastVolume) > POT_DEADZONE) {
            _lastVolume = mappedVol;
            _lastVolChangeTime = now;
            _needsSync = true;
            
            // Invoke callback for instant local response (if desired by pipeline)
            if (_volCallback) {
                _volCallback(mappedVol);
            }
        }
    }

    // 3. Sync volume with backend only after the user stops turning the knob
    if (_needsSync && (now - _lastVolChangeTime > VOL_SYNC_DELAY_MS)) {
        _needsSync = false;
        _stableVolume = _lastVolume;
        Serial.printf("[Input] Volume knob settled at %d%%, triggering sync report\n", _stableVolume);
        
        // In the WS overhaul, main.cpp will catch this stable volume change
        // and send a WebSocket event. We trigger the callback with negative value
        // or a status update. The callback handles sending WS.
    }
}
