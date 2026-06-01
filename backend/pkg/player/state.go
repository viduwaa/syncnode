package player

import (
	"encoding/json"
	"log"
	"os"
	"sync"
)

type Track struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Artist    string `json:"artist"`
	Album     string `json:"album,omitempty"`
	Duration  int    `json:"duration"`
	Thumbnail string `json:"thumbnail"`
	Source    string `json:"source"`
	SourceID  string `json:"sourceId"`
	StreamURL string `json:"streamUrl,omitempty"`
}

type QueueItem struct {
	ID      string `json:"id"`
	Track   Track  `json:"track"`
	AddedAt int64  `json:"addedAt"`
}

type EQState struct {
	Bass   int `json:"bass"`
	Mid    int `json:"mid"`
	Treble int `json:"treble"`
}

type PlayerState struct {
	CurrentTrack *Track      `json:"currentTrack"`
	IsPlaying    bool        `json:"isPlaying"`
	IsLoading    bool        `json:"isLoading"`
	Progress     float64     `json:"progress"`
	Duration     int         `json:"duration"`
	Volume       int         `json:"volume"`
	Shuffle      bool        `json:"shuffle"`
	Repeat       string      `json:"repeat"` // off, one, all
	Queue        []QueueItem `json:"queue"`
	EQ           EQState     `json:"eq"`

	// Playback Context
	ContextType   string  `json:"contextType"`
	ContextID     string  `json:"contextId"`
	ContextTracks []Track `json:"contextTracks"`
	ContextIndex  int     `json:"contextIndex"`
}

type StateManager struct {
	mu         sync.RWMutex
	state      PlayerState
	cachePath  string
	onUpdate   func() // Callback triggered on state change
	onProgress func() // Callback triggered on playback progress tick
}

// NewStateManager creates a new player state manager
func NewStateManager(cachePath string, onUpdate func(), onProgress func()) *StateManager {
	mgr := &StateManager{
		cachePath:  cachePath,
		onUpdate:   onUpdate,
		onProgress: onProgress,
		state: PlayerState{
			Volume: 70,
			Repeat: "off",
			Queue:  []QueueItem{},
			EQ:     EQState{Bass: 0, Mid: 0, Treble: 0},
		},
	}
	mgr.Load()
	return mgr
}

// GetState returns a copy of the player state
func (s *StateManager) GetState() PlayerState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.state
}

// UpdateState updates player state fields and saves it
func (s *StateManager) Update(fn func(*PlayerState)) {
	s.mu.Lock()
	fn(&s.state)
	s.mu.Unlock()

	s.Save()
	if s.onUpdate != nil {
		s.onUpdate()
	}
}

// TickProgress increments progress by 1 second and checks for track end
func (s *StateManager) TickProgress() bool {
	s.mu.Lock()
	trackFinished := false
	if s.state.IsPlaying && s.state.Duration > 0 {
		s.state.Progress += 1
		if int(s.state.Progress) >= s.state.Duration {
			trackFinished = true
		}
	}
	s.mu.Unlock()

	if trackFinished {
		return true // Indicates caller should handle skip/next track
	}

	if s.onProgress != nil {
		s.onProgress()
	}
	return false
}

// Save writes current player state to the JSON cache file
func (s *StateManager) Save() {
	s.mu.RLock()
	data, err := json.MarshalIndent(s.state, "", "  ")
	s.mu.RUnlock()
	if err != nil {
		log.Printf("[State] Error marshaling state: %v", err)
		return
	}

	err = os.WriteFile(s.cachePath, data, 0644)
	if err != nil {
		log.Printf("[State] Error writing cache file: %v", err)
	}
}

// Load reads player state from the JSON cache file
func (s *StateManager) Load() {
	data, err := os.ReadFile(s.cachePath)
	if err != nil {
		log.Printf("[State] No cached state found, starting fresh")
		return
	}

	s.mu.Lock()
	err = json.Unmarshal(data, &s.state)
	s.mu.Unlock()
	if err != nil {
		log.Printf("[State] Error unmarshaling state: %v", err)
	} else {
		log.Printf("[State] State successfully loaded from cache")
	}
}
