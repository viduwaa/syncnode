package api

import (
	"net/http"
)

// RegisterRoutes binds all server endpoints to the central multiplexer
func RegisterRoutes(mux *http.ServeMux, h *APIHandler) {
	// WebSockets Connections
	mux.HandleFunc("/ws", h.HandleWS)             // Web Client dashboards
	mux.HandleFunc("/ws/esp32", h.HandleWSESP32)   // ESP32 hardware

	// REST APIs (Unified and CORS-compliant)
	mux.HandleFunc("/api/control", h.HandleControl)
	mux.HandleFunc("/api/player", h.HandlePlayerState)
	mux.HandleFunc("/api/queue", h.HandleQueue)
	mux.HandleFunc("/api/search", h.HandleSearch)
	mux.HandleFunc("/api/devices", h.HandleDevices)
	mux.HandleFunc("/api/stream/", h.HandleStreamProxy) // Path prefix matching
	
	// Utility Endpoints
	mux.HandleFunc("/health", h.HandleHealth)
}
