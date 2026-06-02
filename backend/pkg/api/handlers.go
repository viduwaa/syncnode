package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"syncnode-backend/pkg/player"
	"syncnode-backend/pkg/youtube"
)

type DeviceStatus struct {
	MAC       string    `json:"mac"`
	IP        string    `json:"ip"`
	Name      string    `json:"name"`
	Version   string    `json:"version"`
	LastSeen  time.Time `json:"lastSeen"`
	Connected bool      `json:"connected"`
	RSSI      int       `json:"rssi"`
}

type APIHandler struct {
	StateMgr     *player.StateManager
	YouTubeKey   string
	upgrader     websocket.Upgrader
	
	// Web Clients
	clientsMu    sync.Mutex
	clients      map[*websocket.Conn]bool

	// ESP32 Clients (MAC -> Conn)
	espClientsMu sync.Mutex
	espClients   map[string]*websocket.Conn

	// Active devices status
	devicesMu    sync.RWMutex
	devices      map[string]*DeviceStatus
}

func NewAPIHandler(mgr *player.StateManager, ytKey string) *APIHandler {
	h := &APIHandler{
		StateMgr:   mgr,
		YouTubeKey: ytKey,
		clients:    make(map[*websocket.Conn]bool),
		espClients: make(map[string]*websocket.Conn),
		devices:    make(map[string]*DeviceStatus),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
	return h
}

// BroadcastState sends the full player state to all connected web clients
func (h *APIHandler) BroadcastState() {
	state := h.StateMgr.GetState()
	event := map[string]interface{}{
		"type":    "FULL_STATE",
		"payload": state,
	}

	data, err := json.Marshal(event)
	if err != nil {
		return
	}

	h.clientsMu.Lock()
	defer h.clientsMu.Unlock()
	for client := range h.clients {
		err := client.WriteMessage(websocket.TextMessage, data)
		if err != nil {
			log.Printf("[WS Client] Error writing: %v, closing connection", err)
			client.Close()
			delete(h.clients, client)
		}
	}
}

// BroadcastProgress sends playback progress ticks to all connected web clients
func (h *APIHandler) BroadcastProgress() {
	state := h.StateMgr.GetState()
	event := map[string]interface{}{
		"type": "PROGRESS",
		"payload": map[string]interface{}{
			"progress":  state.Progress,
			"duration":  state.Duration,
			"isPlaying": state.IsPlaying,
		},
	}

	data, err := json.Marshal(event)
	if err != nil {
		return
	}

	h.clientsMu.Lock()
	defer h.clientsMu.Unlock()
	for client := range h.clients {
		err := client.WriteMessage(websocket.TextMessage, data)
		if err != nil {
			client.Close()
			delete(h.clients, client)
		}
	}
}

// PushCommandToESP32 sends a control command payload to the connected ESP32 WebSocket
func (h *APIHandler) PushCommandToESP32(action string, value interface{}) {
	payload := map[string]interface{}{
		"action": action,
		"ts":     time.Now().UnixMilli(),
	}

	switch action {
	case "play":
		if track, ok := value.(player.Track); ok {
			payload["url"] = fmt.Sprintf("http://%s:8080/api/stream/%s", getLocalIP(), track.SourceID)
			payload["title"] = track.Title
			payload["artist"] = track.Artist
		}
	case "volume":
		if vol, ok := value.(int); ok {
			payload["value"] = vol
		}
	case "eq":
		if eqVals, ok := value.(map[string]int); ok {
			payload["bass"] = eqVals["bass"]
			payload["mid"] = eqVals["mid"]
			payload["treble"] = eqVals["treble"]
		}
	}

	data, err := json.Marshal(payload)
	if err != nil {
		log.Printf("[WS ESP32] Error marshaling command payload: %v", err)
		return
	}

	h.espClientsMu.Lock()
	defer h.espClientsMu.Unlock()
	
	if len(h.espClients) == 0 {
		log.Printf("[WS ESP32] Warning: No ESP32 device connected via WebSockets to receive command: %s", action)
		return
	}

	for mac, conn := range h.espClients {
		log.Printf("[WS ESP32] Pushing command '%s' to device %s", action, mac)
		err := conn.WriteMessage(websocket.TextMessage, data)
		if err != nil {
			log.Printf("[WS ESP32] Error writing command to %s: %v, closing connection", mac, err)
			conn.Close()
			delete(h.espClients, mac)
			h.setDeviceConnected(mac, false)
		}
	}
}

// HandleWS upgrades frontend connections and feeds full state
func (h *APIHandler) HandleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("[WS Client] Upgrade error:", err)
		return
	}

	h.clientsMu.Lock()
	h.clients[conn] = true
	h.clientsMu.Unlock()

	log.Printf("[WS Client] Dashboard client connected. Total clients: %d", len(h.clients))

	// Send initial state immediately
	state := h.StateMgr.GetState()
	conn.WriteJSON(map[string]interface{}{
		"type":    "FULL_STATE",
		"payload": state,
	})

	// Send initial devices list immediately
	h.devicesMu.RLock()
	devicesCopy := make(map[string]*DeviceStatus)
	for k, v := range h.devices {
		devicesCopy[k] = v
	}
	h.devicesMu.RUnlock()

	conn.WriteJSON(map[string]interface{}{
		"type":    "DEVICES_UPDATE",
		"payload": devicesCopy,
	})

	// Keep alive / cleanup read loop
	go func() {
		defer func() {
			h.clientsMu.Lock()
			delete(h.clients, conn)
			h.clientsMu.Unlock()
			conn.Close()
			log.Println("[WS Client] Dashboard client disconnected")
		}()

		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				break
			}
		}
	}()
}

// HandleWSESP32 upgrades the ESP32 connection for instant command pushing
func (h *APIHandler) HandleWSESP32(w http.ResponseWriter, r *http.Request) {
	mac := r.URL.Query().Get("mac")
	ip := r.URL.Query().Get("ip")
	if mac == "" {
		http.Error(w, "MAC address parameter required", http.StatusBadRequest)
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("[WS ESP32] Upgrade error:", err)
		return
	}

	h.espClientsMu.Lock()
	// Close existing connection if any
	if oldConn, exists := h.espClients[mac]; exists {
		oldConn.Close()
	}
	h.espClients[mac] = conn
	h.espClientsMu.Unlock()

	log.Printf("[WS ESP32] ESP32 device connected via WS: MAC=%s, IP=%s", mac, ip)
	h.registerOrUpdateDevice(mac, ip, "SyncNode-ESP32", "2.0.0")
	h.BroadcastDevices()

	// Read loop to receive local reports or inputs from hardware
	go func() {
		defer func() {
			h.espClientsMu.Lock()
			if h.espClients[mac] == conn {
				delete(h.espClients, mac)
				h.setDeviceConnected(mac, false)
				h.BroadcastDevices()
			}
			h.espClientsMu.Unlock()
			conn.Close()
			log.Printf("[WS ESP32] ESP32 device disconnected: MAC=%s", mac)
		}()

		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				break
			}

			// Parse reports from ESP32
			var report struct {
				Event    string `json:"event"`    // status_report, button_press, track_finished, pot_volume
				State    string `json:"state"`    // playing, paused, finished
				Volume   int    `json:"volume"`   
				Position int    `json:"position"` 
				RSSI     int    `json:"rssi"`
				Action   string `json:"action"`   // for button triggers: pause, resume, skip, previous
			}

			if err := json.Unmarshal(message, &report); err != nil {
				log.Printf("[WS ESP32] Error decoding report from ESP32: %v", err)
				continue
			}

			h.updateDeviceRSSI(mac, report.RSSI)

			// Handle different event types
			switch report.Event {
			case "status_report":
				log.Printf("[WS ESP32] Status report from %s: State=%s, Volume=%d%%, Position=%ds, RSSI=%ddBm", mac, report.State, report.Volume, report.Position, report.RSSI)
				h.StateMgr.Update(func(s *player.PlayerState) {
					s.IsPlaying = report.State == "playing"
					if report.Position > 0 {
						s.Progress = float64(report.Position)
					}
					s.Volume = report.Volume
				})

			case "button_press":
				log.Printf("[WS ESP32] Hardware button action received: %s", report.Action)
				h.HandleHardwareAction(report.Action)

			case "pot_volume":
				log.Printf("[WS ESP32] Hardware volume knob set: %d%%", report.Volume)
				h.StateMgr.Update(func(s *player.PlayerState) {
					s.Volume = report.Volume
				})

			case "track_finished":
				log.Printf("[WS ESP32] Hardware reports track finished, triggering auto-skip")
				go h.TriggerAutoSkip()
			}
		}
	}()
}

// HandleHardwareAction handles control signals originating from physical ESP32 buttons
func (h *APIHandler) HandleHardwareAction(action string) {
	switch action {
	case "pause":
		h.StateMgr.Update(func(s *player.PlayerState) { s.IsPlaying = false })
		h.PushCommandToESP32("pause", nil)
	case "resume":
		h.StateMgr.Update(func(s *player.PlayerState) { s.IsPlaying = true })
		h.PushCommandToESP32("resume", nil)
	case "skip":
		h.TriggerAutoSkip()
	case "previous":
		go h.TriggerPrevious()
	}
}

// REST Control Endpoint
func (h *APIHandler) HandleControl(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Action  string `json:"action"`
		Value   *int   `json:"value,omitempty"`
		Band    string `json:"band,omitempty"`
		Gain    *int   `json:"gain,omitempty"`
		TrackID string `json:"trackId,omitempty"`
		Meta    *struct {
			Title  string `json:"title"`
			Artist string `json:"artist"`
			Img    string `json:"img"`
		} `json:"meta,omitempty"`
		ContextType   string         `json:"contextType,omitempty"`
		ContextID     string         `json:"contextId,omitempty"`
		ContextTracks []player.Track `json:"contextTracks,omitempty"`
		ContextIndex  int            `json:"contextIndex,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	log.Printf("[API] REST Control command received: %s", req.Action)

	switch req.Action {
	case "play":
		if req.TrackID == "" {
			http.Error(w, "TrackID is required", http.StatusBadRequest)
			return
		}

		h.StateMgr.Update(func(s *player.PlayerState) {
			s.IsPlaying = true
			s.Progress = 0
			s.IsLoading = true
			if req.Meta != nil {
				s.CurrentTrack = &player.Track{
					ID:        req.TrackID,
					Title:     req.Meta.Title,
					Artist:    req.Meta.Artist,
					Thumbnail: req.Meta.Img,
					Source:    "youtube",
					SourceID:  req.TrackID,
				}
			}
			if req.ContextType != "" {
				s.ContextType = req.ContextType
				s.ContextID = req.ContextID
				s.ContextTracks = req.ContextTracks
				s.ContextIndex = req.ContextIndex
			}
		})

		// Background resolver
		go func(trackID string) {
			duration, err := youtube.GetVideoDurationDirect(trackID)
			if err != nil && h.YouTubeKey != "" {
				duration, _ = youtube.GetVideoDuration(trackID) // Fallback to official API
			}

			h.StateMgr.Update(func(s *player.PlayerState) {
				s.IsLoading = false
				if s.CurrentTrack != nil && s.CurrentTrack.ID == trackID {
					if duration > 0 {
						s.Duration = duration
						s.CurrentTrack.Duration = duration
					}
				}
			})

			state := h.StateMgr.GetState()
			if state.CurrentTrack != nil {
				h.PushCommandToESP32("play", *state.CurrentTrack)
			}
		}(req.TrackID)

	case "pause":
		h.StateMgr.Update(func(s *player.PlayerState) { s.IsPlaying = false })
		h.PushCommandToESP32("pause", nil)

	case "resume":
		h.StateMgr.Update(func(s *player.PlayerState) { s.IsPlaying = true })
		h.PushCommandToESP32("resume", nil)

	case "stop":
		h.StateMgr.Update(func(s *player.PlayerState) {
			s.IsPlaying = false
			s.CurrentTrack = nil
			s.Progress = 0
		})
		h.PushCommandToESP32("stop", nil)

	case "volume":
		if req.Value != nil {
			h.StateMgr.Update(func(s *player.PlayerState) {
				s.Volume = *req.Value
			})
			h.PushCommandToESP32("volume", *req.Value)
		}

	case "eq":
		if req.Band != "" && req.Gain != nil {
			h.StateMgr.Update(func(s *player.PlayerState) {
				switch req.Band {
				case "bass":
					s.EQ.Bass = *req.Gain
				case "mid":
					s.EQ.Mid = *req.Gain
				case "treble":
					s.EQ.Treble = *req.Gain
				}
			})
			// Push full EQ parameters down the socket
			state := h.StateMgr.GetState()
			h.PushCommandToESP32("eq", map[string]int{
				"bass":   state.EQ.Bass,
				"mid":    state.EQ.Mid,
				"treble": state.EQ.Treble,
			})
		}

	case "skip":
		go h.TriggerAutoSkip()

	case "previous":
		go h.TriggerPrevious()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// TriggerAutoSkip handles logic to play the next track in queue or recommend a song
func (h *APIHandler) TriggerAutoSkip() {
	var nextTrack *player.Track

	h.StateMgr.Update(func(s *player.PlayerState) {
		s.IsLoading = true
		s.Progress = 0

		if len(s.Queue) > 0 {
			item := s.Queue[0]
			s.Queue = s.Queue[1:]
			nextTrack = &item.Track
			s.CurrentTrack = nextTrack
			s.IsPlaying = true
		} else if s.ContextType == "playlist" && len(s.ContextTracks) > 0 {
			nextIdx := s.ContextIndex + 1
			if nextIdx < len(s.ContextTracks) {
				s.ContextIndex = nextIdx
				nextTrack = &s.ContextTracks[nextIdx]
				s.CurrentTrack = nextTrack
				s.IsPlaying = true
			} else if s.Repeat == "all" {
				s.ContextIndex = 0
				nextTrack = &s.ContextTracks[0]
				s.CurrentTrack = nextTrack
				s.IsPlaying = true
			} else {
				s.ContextType = "radio"
				s.ContextTracks = nil
			}
		}
	})

	// If no queue or playlist item, try smart recommendation
	if nextTrack == nil {
		currState := h.StateMgr.GetState()
		if currState.CurrentTrack != nil {
			log.Printf("[Resolver] Fetching recommendation for ending track: %s", currState.CurrentTrack.ID)
			recTrack, err := youtube.GetSmartRecommendation(currState.CurrentTrack.ID)
			if err == nil && recTrack != nil {
				nextTrack = &player.Track{
					ID:        recTrack.ID,
					Title:     recTrack.Title,
					Artist:    recTrack.Artist,
					Thumbnail: recTrack.Thumbnail,
					Source:    "youtube",
					SourceID:  recTrack.ID,
				}
				h.StateMgr.Update(func(s *player.PlayerState) {
					s.CurrentTrack = nextTrack
					s.IsPlaying = true
				})
			}
		}
	}

	if nextTrack != nil {
		log.Printf("[Player] Next track selected: %s by %s", nextTrack.Title, nextTrack.Artist)
		
		duration, err := youtube.GetVideoDurationDirect(nextTrack.ID)
		if err != nil && h.YouTubeKey != "" {
			duration, _ = youtube.GetVideoDuration(nextTrack.ID)
		}

		h.StateMgr.Update(func(s *player.PlayerState) {
			s.IsLoading = false
			if s.CurrentTrack != nil && s.CurrentTrack.ID == nextTrack.ID {
				if duration > 0 {
					s.Duration = duration
					s.CurrentTrack.Duration = duration
				}
			}
		})

		h.PushCommandToESP32("play", *nextTrack)
	} else {
		log.Printf("[Player] No next track available, stopping playback")
		h.StateMgr.Update(func(s *player.PlayerState) {
			s.IsPlaying = false
			s.IsLoading = false
			s.CurrentTrack = nil
		})
		h.PushCommandToESP32("stop", nil)
	}
}

// TriggerPrevious handles logic to play the previous track in context or restart current track
func (h *APIHandler) TriggerPrevious() {
	var prevTrack *player.Track

	h.StateMgr.Update(func(s *player.PlayerState) {
		// If progress is greater than 3 seconds, just restart the current song
		if s.Progress > 3.0 {
			s.Progress = 0
			if s.CurrentTrack != nil {
				prevTrack = s.CurrentTrack
			}
			return
		}

		// Otherwise, try to go to the previous track in the playlist
		if s.ContextType == "playlist" && len(s.ContextTracks) > 0 && s.ContextIndex > 0 {
			s.ContextIndex--
			prevTrack = &s.ContextTracks[s.ContextIndex]
			s.CurrentTrack = prevTrack
			s.Progress = 0
			s.IsPlaying = true
			s.IsLoading = true
		} else if s.CurrentTrack != nil {
			// Fallback: just restart the song if we can't go back
			s.Progress = 0
			prevTrack = s.CurrentTrack
		}
	})

	if prevTrack != nil {
		log.Printf("[Player] Previous track selected: %s by %s", prevTrack.Title, prevTrack.Artist)
		
		go func(track player.Track) {
			h.PushCommandToESP32("play", track)
			
			duration, err := youtube.GetVideoDurationDirect(track.ID)
			if err != nil && h.YouTubeKey != "" {
				duration, _ = youtube.GetVideoDuration(track.ID)
			}

			h.StateMgr.Update(func(s *player.PlayerState) {
				s.IsLoading = false
				if s.CurrentTrack != nil && s.CurrentTrack.ID == track.ID {
					if duration > 0 {
						s.Duration = duration
						s.CurrentTrack.Duration = duration
					}
				}
			})
		}(*prevTrack)
	}
}

// REST Proxy Stream Endpoint
func (h *APIHandler) HandleStreamProxy(w http.ResponseWriter, r *http.Request) {
	videoID := strings.TrimPrefix(r.URL.Path, "/api/stream/")
	if videoID == "" || videoID == r.URL.Path {
		http.Error(w, "Video ID required", http.StatusBadRequest)
		return
	}

	log.Printf("[Stream Proxy] Requesting: %s", videoID)

	streamURL, err := youtube.ResolveStream(videoID)
	if err != nil {
		log.Printf("[Stream Proxy] Resolution failed for %s: %v", videoID, err)
		http.Error(w, "Failed to resolve stream", http.StatusInternalServerError)
		return
	}

	// Set headers for MP3 chunked stream
	w.Header().Set("Content-Type", "audio/mpeg")
	w.Header().Set("Transfer-Encoding", "chunked")
	w.Header().Set("Connection", "keep-alive")

	// Spawn optimized low-latency ffmpeg transcoding
	cmd := exec.Command("ffmpeg",
		"-hide_banner",
		"-loglevel", "warning",
		"-reconnect", "1",
		"-reconnect_streamed", "1",
		"-reconnect_at_eof", "1",
		"-reconnect_delay_max", "5",
		"-timeout", "30000000",
		"-rw_timeout", "30000000",
		"-user_agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		"-probesize", "32768",          // Small probe size for low latency
		"-analyzeduration", "0",        // Skip analyze duration to start instantly
		"-fflags", "nobuffer",          // Disable internal buffering
		"-flags", "low_delay",          // Low delay flags
		"-i", streamURL,
		"-vn",
		"-acodec", "libmp3lame",
		"-ar", "44100",
		"-ac", "2",
		"-b:a", "128k",
		"-f", "mp3",
		"pipe:1",
	)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		log.Printf("[Stream Proxy] Failed to create ffmpeg pipe: %v", err)
		http.Error(w, "Internal transcoder error", http.StatusInternalServerError)
		return
	}

	if err := cmd.Start(); err != nil {
		log.Printf("[Stream Proxy] Failed to start ffmpeg: %v. Make sure it's installed in PATH.", err)
		http.Error(w, "Transcoder unavailable", http.StatusServiceUnavailable)
		return
	}

	defer func() {
		// Kill the process if client disconnects early
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
		cmd.Wait()
	}()

	bytesCopied, err := io.Copy(w, stdout)
	if err != nil {
		log.Printf("[Stream Proxy] Transcode stream ended: %v (sent %d bytes)", err, bytesCopied)
	} else {
		log.Printf("[Stream Proxy] Transcode completed: %d bytes sent", bytesCopied)
	}
}

// REST GET/PUT Queue
func (h *APIHandler) HandleQueue(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	switch r.Method {
	case "GET":
		state := h.StateMgr.GetState()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(state.Queue)

	case "POST":
		var item player.QueueItem
		if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}
		item.AddedAt = time.Now().UnixMilli()
		h.StateMgr.Update(func(s *player.PlayerState) {
			s.Queue = append(s.Queue, item)
		})
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"success": true})

	case "DELETE":
		id := r.URL.Query().Get("id")
		h.StateMgr.Update(func(s *player.PlayerState) {
			if id == "" {
				s.Queue = []player.QueueItem{}
			} else {
				var newQueue []player.QueueItem
				for _, q := range s.Queue {
					if q.ID != id {
						newQueue = append(newQueue, q)
					}
				}
				s.Queue = newQueue
			}
		})
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"success": true})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// REST Player State Endpoint
func (h *APIHandler) HandlePlayerState(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method == "GET" {
		state := h.StateMgr.GetState()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(state)
	} else {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// REST Devices Endpoint
func (h *APIHandler) HandleDevices(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	h.devicesMu.RLock()
	defer h.devicesMu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(h.devices)
}

// REST Search YouTube
func (h *APIHandler) HandleSearch(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	q := r.URL.Query().Get("q")
	if q == "" {
		http.Error(w, "Query is required", http.StatusBadRequest)
		return
	}

	tracks, err := youtube.SearchYouTube(q)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tracks)
}

// REST Health Check
func (h *APIHandler) HandleHealth(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	h.devicesMu.RLock()
	connectedCount := 0
	for _, d := range h.devices {
		if d.Connected && time.Since(d.LastSeen) < 30*time.Second {
			connectedCount++
		}
	}
	h.devicesMu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":           "ok",
		"connectedDevices": connectedCount,
	})
}

// Helper: device registry functions
func (h *APIHandler) registerOrUpdateDevice(mac, ip, name, version string) {
	h.devicesMu.Lock()
	defer h.devicesMu.Unlock()

	if dev, exists := h.devices[mac]; exists {
		dev.IP = ip
		dev.LastSeen = time.Now()
		dev.Connected = true
	} else {
		h.devices[mac] = &DeviceStatus{
			MAC:       mac,
			IP:        ip,
			Name:      name,
			Version:   version,
			LastSeen:  time.Now(),
			Connected: true,
		}
		log.Printf("[Device Registry] Registered new hardware client: MAC=%s", mac)
	}
}

func (h *APIHandler) setDeviceConnected(mac string, connected bool) {
	h.devicesMu.Lock()
	defer h.devicesMu.Unlock()
	if dev, exists := h.devices[mac]; exists {
		dev.Connected = connected
	}
}

func (h *APIHandler) updateDeviceRSSI(mac string, rssi int) {
	h.devicesMu.Lock()
	defer h.devicesMu.Unlock()
	if dev, exists := h.devices[mac]; exists {
		dev.RSSI = rssi
		dev.LastSeen = time.Now()
		dev.Connected = true
	}
}

// Routine to periodically clean timed-out devices
func (h *APIHandler) StartDeviceTimeoutMonitor() {
	ticker := time.NewTicker(10 * time.Second)
	go func() {
		for range ticker.C {
			h.devicesMu.Lock()
			hasChanges := false
			for mac, dev := range h.devices {
				if dev.Connected && time.Since(dev.LastSeen) > 30*time.Second {
					dev.Connected = false
					hasChanges = true
					log.Printf("[Device Monitor] Device %s timed out, status set offline", mac)
				}
			}
			h.devicesMu.Unlock()
			if hasChanges {
				h.BroadcastDevices()
			}
		}
	}()
}

// BroadcastDevices sends the list of all registered hardware devices to all web clients
func (h *APIHandler) BroadcastDevices() {
	h.devicesMu.RLock()
	devicesCopy := make(map[string]*DeviceStatus)
	for k, v := range h.devices {
		devicesCopy[k] = v
	}
	h.devicesMu.RUnlock()

	event := map[string]interface{}{
		"type":    "DEVICES_UPDATE",
		"payload": devicesCopy,
	}

	data, err := json.Marshal(event)
	if err != nil {
		log.Printf("[WS Client] Error marshaling devices list: %v", err)
		return
	}

	h.clientsMu.Lock()
	defer h.clientsMu.Unlock()
	for client := range h.clients {
		err := client.WriteMessage(websocket.TextMessage, data)
		if err != nil {
			client.Close()
			delete(h.clients, client)
		}
	}
}

// Utility CORS middleware
func enableCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

// Helper: getLocalIP searches for local IP via OS route tables
func getLocalIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err == nil {
		defer conn.Close()
		localAddr := conn.LocalAddr().(*net.UDPAddr)
		return localAddr.IP.String()
	}
	// Fallback interface scan
	addrs, _ := net.InterfaceAddrs()
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok {
			ip := ipnet.IP.To4()
			if ip != nil && !ip.IsLoopback() && !ip.IsLinkLocalUnicast() {
				if ip[0] == 192 || ip[0] == 10 {
					return ip.String()
				}
			}
		}
	}
	return "localhost"
}
