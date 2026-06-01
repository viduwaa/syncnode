#ifndef INPUT_MANAGER_H
#define INPUT_MANAGER_H

#include <Arduino.h>

class InputManager {
public:
    typedef void (*ButtonCallback)(const char* action);
    typedef void (*VolumeCallback)(int volume);

    InputManager(ButtonCallback btnCallback, VolumeCallback volCallback);
    
    void begin();
    void update();

private:
    ButtonCallback _btnCallback;
    VolumeCallback _volCallback;

    // Debounce tracking
    unsigned long _lastPlayPausePress;
    unsigned long _lastNextPress;
    unsigned long _lastPrevPress;

    // Potentiometer tracking
    int _lastVolume;
    int _stableVolume;
    float _filteredRaw;
    unsigned long _lastVolChangeTime;
    bool _needsSync;
    unsigned long _lastPotPollTime;
};

#endif // INPUT_MANAGER_H
