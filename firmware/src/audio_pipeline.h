#ifndef AUDIO_PIPELINE_H
#define AUDIO_PIPELINE_H

#include <Arduino.h>
#include "AudioTools.h"
#include "AudioTools/AudioCodecs/CodecMP3Helix.h"
#include "AudioTools/Communication/AudioHttp.h"
#include "AudioTools/CoreAudio/AudioFilter/Equalizer3Bands.h" // 3-Band Equalizer

class AudioPipeline {
public:
    AudioPipeline();
    void begin();
    
    bool startStream(const char* url);
    void stopStream();
    void pauseStream();
    bool resumeStream();
    
    void setVolume(int volumePercent);
    void setEQ(int bassDb, int midDb, int trebleDb);
    
    size_t copyTick();
    bool isPlaying() const { return _isPlaying; }
    bool isStreamAvailable();
    bool isStreamActive();
    int getPlaybackPositionSec() const;

private:
    bool _isPlaying;
    int _currentVolume;
    
    // Equalizer DB levels
    int _bassDb;
    int _midDb;
    int _trebleDb;

    String _currentUrl;
    unsigned long _playbackStartTime;
    unsigned long _pausedPositionSec;

    // Pipeline instances
    I2SStream _i2s;
    Equalizer3Bands _equalizer;        // EQ wraps I2S
    VolumeStream _volumeStream;        // VolumeStream wraps EQ
    MP3DecoderHelix _mp3Decoder;
    EncodedAudioStream _decodedStream; // MP3 decoder writes to volumeStream
    URLStream _urlStream;
    StreamCopy* _copier;
};

#endif // AUDIO_PIPELINE_H
