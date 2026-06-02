#include "audio_pipeline.h"
#include "config.h"

AudioPipeline::AudioPipeline()
    : _isPlaying(false)
    , _currentVolume(70)
    , _bassDb(0)
    , _midDb(0)
    , _trebleDb(0)
    , _playbackStartTime(0)
    , _pausedPositionSec(0)
    , _i2s()
    , _equalizer(_i2s)
    , _volumeStream(_equalizer)
    , _mp3Decoder()
    , _decodedStream(&_volumeStream, &_mp3Decoder)
    , _urlStream()
    , _copier(nullptr) {}

void AudioPipeline::begin() {
    Serial.println("[Audio] Initializing I2S audio output...");

    // 1. Configure I2S for PCM5102A
    auto i2sConfig = _i2s.defaultConfig(TX_MODE);
    i2sConfig.sample_rate = SAMPLE_RATE;
    i2sConfig.bits_per_sample = BITS;
    i2sConfig.channels = CHANNELS;
    i2sConfig.pin_bck = I2S_BCK;
    i2sConfig.pin_ws = I2S_WS;
    i2sConfig.pin_data = I2S_DOUT;
    i2sConfig.use_apll = true; // High accuracy PLL for audio clock
    i2sConfig.buffer_size = 1024;
    i2sConfig.buffer_count = 12; // Extra buffering to prevent underruns
    
    if (!_i2s.begin(i2sConfig)) {
        Serial.println("[Audio] ERROR: I2S Stream initialization failed!");
        return;
    }
    Serial.println("[Audio] I2S Stream started successfully");

    // 2. Configure Equalizer (Wraps I2S)
    auto eqConfig = _equalizer.defaultConfig();
    eqConfig.sample_rate = SAMPLE_RATE;
    eqConfig.bits_per_sample = BITS;
    eqConfig.channels = CHANNELS;
    
    // Set baseline unity gains
    eqConfig.gain_low = 1.0;
    eqConfig.gain_medium = 1.0;
    eqConfig.gain_high = 1.0;

    _equalizer.begin(eqConfig);
    Serial.println("[Audio] 3-Band DSP Equalizer configured");

    // 3. Configure Volume Stream (Wraps Equalizer)
    auto volConfig = _volumeStream.defaultConfig();
    volConfig.sample_rate = SAMPLE_RATE;
    volConfig.bits_per_sample = BITS;
    volConfig.channels = CHANNELS;
    _volumeStream.begin(volConfig);
    setVolume(_currentVolume);

    // 4. Configure Decoded Audio Stream (Wraps VolumeStream with Helix MP3 Decoder)
    _decodedStream.begin();

    // 5. Configure URL Client Stream
    _urlStream.setClient(*(new WiFiClient()));

    // 6. Setup Copier linking input URLStream to output MP3 Decoder
    _copier = new StreamCopy(_decodedStream, _urlStream);
    
    Serial.println("[Audio] Playback pipeline initialized successfully");
}

bool AudioPipeline::startStream(const char* url) {
    Serial.printf("[Audio] Requesting stream: %s\n", url);
    stopStream();

    _currentUrl = url;
    _pausedPositionSec = 0;

    if (_urlStream.begin(url, "audio/mpeg")) {
        _isPlaying = true;
        _playbackStartTime = millis();
        Serial.println("[Audio] Stream connection established, playback started");
        return true;
    } else {
        Serial.println("[Audio] ERROR: Connection to audio stream failed!");
        _isPlaying = false;
        return false;
    }
}

void AudioPipeline::stopStream() {
    if (_isPlaying) {
        _urlStream.end();
        _isPlaying = false;
        _playbackStartTime = 0;
        _pausedPositionSec = 0;
        Serial.println("[Audio] Playback stopped");
    }
}

void AudioPipeline::pauseStream() {
    if (_isPlaying) {
        _pausedPositionSec = (millis() - _playbackStartTime) / 1000 + _pausedPositionSec;
        _urlStream.end();
        _isPlaying = false;
        Serial.printf("[Audio] Playback paused at %lu seconds\n", _pausedPositionSec);
    }
}

bool AudioPipeline::resumeStream() {
    if (!_isPlaying && _currentUrl.length() > 0) {
        Serial.printf("[Audio] Resuming stream from URL (tracked offset: %lu sec)\n", _pausedPositionSec);
        if (_urlStream.begin(_currentUrl.c_str(), "audio/mpeg")) {
            _isPlaying = true;
            _playbackStartTime = millis();
            return true;
        } else {
            Serial.println("[Audio] ERROR: Failed to resume stream connection");
        }
    }
    return false;
}

void AudioPipeline::setVolume(int volumePercent) {
    _currentVolume = constrain(volumePercent, 0, 100);
    float linearGain = _currentVolume / 100.0f;
    _volumeStream.setVolume(linearGain);
    Serial.printf("[Audio] Volume set to %d%% (gain: %.2f)\n", _currentVolume, linearGain);
}

void AudioPipeline::setEQ(int bassDb, int midDb, int trebleDb) {
    _bassDb = constrain(bassDb, -10, 10);
    _midDb = constrain(midDb, -10, 10);
    _trebleDb = constrain(trebleDb, -10, 10);

    // Convert decibels to linear multipliers: 10^(dB/20)
    float bassGain   = pow(10.0f, _bassDb / 20.0f);
    float midGain    = pow(10.0f, _midDb / 20.0f);
    float trebleGain = pow(10.0f, _trebleDb / 20.0f);

    auto& eqConfig = _equalizer.config();
    eqConfig.gain_low = bassGain;
    eqConfig.gain_medium = midGain;
    eqConfig.gain_high = trebleGain;

    // Apply gains dynamically
    _equalizer.begin(eqConfig);
    
    Serial.printf("[Audio] Equalizer gains updated: Bass=%ddB (x%.2f), Mid=%ddB (x%.2f), Treble=%ddB (x%.2f)\n",
        _bassDb, bassGain, _midDb, midGain, _trebleDb, trebleGain);
}

size_t AudioPipeline::copyTick() {
    if (_isPlaying && _urlStream.available() > 0 && _copier != nullptr) {
        return _copier->copy();
    }
    return 0;
}

bool AudioPipeline::isStreamAvailable() {
    return _urlStream.available() > 0;
}

bool AudioPipeline::isStreamActive() {
    return (bool)_urlStream;
}

int AudioPipeline::getPlaybackPositionSec() const {
    if (_isPlaying && _playbackStartTime > 0) {
        return (millis() - _playbackStartTime) / 1000 + _pausedPositionSec;
    }
    return _pausedPositionSec;
}


