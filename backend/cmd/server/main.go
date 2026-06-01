package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"syncnode-backend/pkg/api"
	"syncnode-backend/pkg/player"
	"syncnode-backend/pkg/youtube"
)

const defaultPort = ":8080"

func main() {
	log.Println("=== SyncNode Overhaul Server Starting ===")

	// Load env
	if err := godotenv.Load(); err != nil {
		log.Println("[Main] Warning: No .env file found, using system environment variables")
	}

	// Read YouTube API Key
	ytKey := os.Getenv("YOUTUBE_API_KEY")
	if ytKey == "" {
		log.Println("[Main] Warning: YOUTUBE_API_KEY is not configured. Falling back to native scrapers.")
	} else {
		youtube.YouTubeAPIKey = ytKey
		log.Printf("[Main] Configured official YouTube API Integration (Key: ...%s)", ytKey[len(ytKey)-4:])
	}

	// Create placeholders for state triggers (we link them right after creating APIHandler)
	var stateHandler *api.APIHandler

	onStateUpdate := func() {
		if stateHandler != nil {
			stateHandler.BroadcastState()
		}
	}

	onProgressTick := func() {
		if stateHandler != nil {
			stateHandler.BroadcastProgress()
		}
	}

	// Initialize thread-safe player state manager
	stateMgr := player.NewStateManager("player_state.json", onStateUpdate, onProgressTick)

	// Initialize API Handler
	stateHandler = api.NewAPIHandler(stateMgr, ytKey)
	stateHandler.StartDeviceTimeoutMonitor()

	// Register routing table
	mux := http.NewServeMux()
	api.RegisterRoutes(mux, stateHandler)

	// Launch central Progress Tracker loop (ticks every 1s)
	go func() {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			// TickProgress returns true if track ended, indicating auto-skip
			if stateMgr.TickProgress() {
				log.Println("[Tracker] Track duration reached, auto-skipping...")
				go stateHandler.TriggerAutoSkip()
			}
		}
	}()

	// Signal capture for graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	server := &http.Server{
		Addr:    defaultPort,
		Handler: mux,
	}

	go func() {
		log.Printf("[Main] Go HTTP & WebSocket server listening on port %s", defaultPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[Main] Server error: %v", err)
		}
	}()

	<-stop
	log.Println("\n[Main] Shutdown signal received. Cleaning up...")
	stateMgr.Save()
	log.Println("[Main] State cache written to disk. Goodbye!")
}
