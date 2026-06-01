package youtube

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"net/url"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/kkdai/youtube/v2"
	"syncnode-backend/pkg/player"
)

// YouTube API Key (should be set in main.go)
var YouTubeAPIKey string

// Client instance for in-process streaming resolution
var ytClient = youtube.Client{}

// Caching & Recently Played
var (
	searchCache    = make(map[string][]player.Track)
	recentlyPlayed = make([]string, 0, 50) // Circular buffer of last 50 played IDs
	cacheMu        sync.RWMutex
	recentMu       sync.RWMutex
)

// ============================================
// Core In-Process YouTube Resolution
// ============================================

// ResolveStream resolves a YouTube video ID to its direct audio stream URL using kkdai/youtube
func ResolveStream(videoID string) (string, error) {
	log.Printf("[YouTube] Resolving stream URL for ID: %s in-process", videoID)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	video, err := ytClient.GetVideoContext(ctx, videoID)
	if err != nil {
		log.Printf("[YouTube] kkdai/youtube failed to resolve details: %v. Trying yt-dlp fallback...", err)
		return ResolveStreamFallback(videoID)
	}

	formats := video.Formats.WithAudioChannels()
	if len(formats) == 0 {
		return "", fmt.Errorf("no audio streams found for video: %s", videoID)
	}

	// Select the best audio stream (prefer audio/mp4 or audio/webm with highest bitrate)
	var bestFormat *youtube.Format
	for i := range formats {
		format := &formats[i]
		if strings.HasPrefix(format.MimeType, "audio/") {
			if bestFormat == nil || format.Bitrate > bestFormat.Bitrate {
				bestFormat = format
			}
		}
	}

	if bestFormat == nil {
		bestFormat = &formats[0]
	}

	streamURL, err := ytClient.GetStreamURLContext(ctx, video, bestFormat)
	if err != nil {
		return "", fmt.Errorf("failed to get stream URL: %w", err)
	}

	return streamURL, nil
}

// ResolveStreamFallback is the yt-dlp backup resolver if kkdai fails
func ResolveStreamFallback(videoID string) (string, error) {
	videoURL := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)
	cmd := exec.Command("yt-dlp", "--get-url", "--format", "bestaudio", videoURL)
	
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("yt-dlp error: %v (stderr: %s)", err, stderr.String())
	}

	streamURL := strings.TrimSpace(stdout.String())
	if streamURL == "" {
		return "", fmt.Errorf("yt-dlp returned empty URL")
	}

	return streamURL, nil
}

// GetVideoDurationDirect gets duration of video in seconds without API keys using kkdai/youtube
func GetVideoDurationDirect(videoID string) (int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	video, err := ytClient.GetVideoContext(ctx, videoID)
	if err != nil {
		return 0, err
	}

	return int(video.Duration.Seconds()), nil
}

// ============================================
// YouTube API Search and Caching
// ============================================

func AddToRecentlyPlayed(videoID string) {
	recentMu.Lock()
	defer recentMu.Unlock()
	
	for _, id := range recentlyPlayed {
		if id == videoID {
			return
		}
	}
	
	if len(recentlyPlayed) >= 50 {
		recentlyPlayed = recentlyPlayed[1:]
	}
	recentlyPlayed = append(recentlyPlayed, videoID)
}

func IsRecentlyPlayed(videoID string) bool {
	recentMu.RLock()
	defer recentMu.RUnlock()
	
	for _, id := range recentlyPlayed {
		if id == videoID {
			return true
		}
	}
	return false
}

type VideoMetadata struct {
	ID           string
	Title        string
	ChannelID    string
	ChannelTitle string
	Tags         []string
	Description  string
	CategoryID   string
}

func GetVideoMetadata(videoID string) (*VideoMetadata, error) {
	if YouTubeAPIKey == "" {
		return nil, fmt.Errorf("YouTube API Key not configured")
	}

	apiURL := fmt.Sprintf("https://www.googleapis.com/youtube/v3/videos?part=snippet&id=%s&key=%s",
		videoID, YouTubeAPIKey)

	resp, err := http.Get(apiURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("YouTube API error (%d): %s", resp.StatusCode, string(body))
	}

	var data struct {
		Items []struct {
			Snippet struct {
				Title        string   `json:"title"`
				ChannelID    string   `json:"channelId"`
				ChannelTitle string   `json:"channelTitle"`
				Tags         []string `json:"tags"`
				Description  string   `json:"description"`
				CategoryID   string   `json:"categoryId"`
			} `json:"snippet"`
		} `json:"items"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	if len(data.Items) == 0 {
		return nil, fmt.Errorf("video not found: %s", videoID)
	}

	item := data.Items[0]
	return &VideoMetadata{
		ID:           videoID,
		Title:        item.Snippet.Title,
		ChannelID:    item.Snippet.ChannelID,
		ChannelTitle: item.Snippet.ChannelTitle,
		Tags:         item.Snippet.Tags,
		Description:  item.Snippet.Description,
		CategoryID:   item.Snippet.CategoryID,
	}, nil
}

// SearchYouTube searches for music videos on YouTube using API Key
func SearchYouTube(query string) ([]player.Track, error) {
	cacheMu.RLock()
	if results, ok := searchCache[query]; ok {
		cacheMu.RUnlock()
		return results, nil
	}
	cacheMu.RUnlock()

	if YouTubeAPIKey == "" {
		return nil, fmt.Errorf("YouTube API Key not configured")
	}

	searchURL := fmt.Sprintf("https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=%s&type=video&videoCategoryId=10&key=%s", 
		url.QueryEscape(query), YouTubeAPIKey)

	resp, err := http.Get(searchURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("YouTube API error (%d): %s", resp.StatusCode, string(body))
	}

	var data struct {
		Items []struct {
			ID struct {
				VideoID string `json:"videoId"`
			} `json:"id"`
			Snippet struct {
				Title        string `json:"title"`
				ChannelTitle string `json:"channelTitle"`
				Thumbnails   struct {
					High struct {
						URL string `json:"url"`
					} `json:"high"`
				} `json:"thumbnails"`
			} `json:"snippet"`
		} `json:"items"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	tracks := make([]player.Track, 0, len(data.Items))
	for _, item := range data.Items {
		tracks = append(tracks, player.Track{
			ID:        item.ID.VideoID,
			Title:     item.Snippet.Title,
			Artist:    item.Snippet.ChannelTitle,
			Thumbnail: item.Snippet.Thumbnails.High.URL,
			Source:    "youtube",
			SourceID:  item.ID.VideoID,
		})
	}

	// Cache the results
	cacheMu.Lock()
	searchCache[query] = tracks
	cacheMu.Unlock()

	return tracks, nil
}

// GetVideoDuration fetches duration via official YouTube API
func GetVideoDuration(videoID string) (int, error) {
	if YouTubeAPIKey == "" {
		return 0, fmt.Errorf("YouTube API Key not configured")
	}

	videoURL := fmt.Sprintf("https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=%s&key=%s",
		videoID, YouTubeAPIKey)

	resp, err := http.Get(videoURL)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	var data struct {
		Items []struct {
			ContentDetails struct {
				Duration string `json:"duration"`
			} `json:"contentDetails"`
		} `json:"items"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, err
	}

	if len(data.Items) == 0 {
		return 0, fmt.Errorf("video not found")
	}

	duration := data.Items[0].ContentDetails.Duration
	return parseISO8601Duration(duration), nil
}

// parseISO8601Duration parses YouTube's ISO 8601 duration format (PT4M13S)
func parseISO8601Duration(duration string) int {
	duration = strings.TrimPrefix(duration, "PT")
	
	var hours, minutes, seconds int
	if idx := strings.Index(duration, "H"); idx != -1 {
		fmt.Sscanf(duration[:idx], "%d", &hours)
		duration = duration[idx+1:]
	}
	if idx := strings.Index(duration, "M"); idx != -1 {
		fmt.Sscanf(duration[:idx], "%d", &minutes)
		duration = duration[idx+1:]
	}
	if idx := strings.Index(duration, "S"); idx != -1 {
		fmt.Sscanf(duration[:idx], "%d", &seconds)
	}
	
	return hours*3600 + minutes*60 + seconds
}

// ============================================
// Smart Recommendation Engine
// ============================================

func GetSmartRecommendation(currentVideoID string) (*player.Track, error) {
	log.Printf("[YouTube] Smart Recommendation: Finding next track for %s", currentVideoID)
	
	AddToRecentlyPlayed(currentVideoID)
	
	meta, err := GetVideoMetadata(currentVideoID)
	if err != nil {
		log.Printf("[YouTube] Warning: couldn't get metadata for %s: %v. Using fallback search.", currentVideoID, err)
		return getBasicRecommendation(currentVideoID)
	}
	
	log.Printf("[YouTube] Current Track: %s by %s", meta.Title, meta.ChannelTitle)
	
	// Strategy 1: Try to find a YouTube Mix containing this video
	if track := tryYouTubeMix(currentVideoID, meta); track != nil {
		log.Printf("[YouTube] Suggestion found via YouTube Mix: %s", track.Title)
		return track, nil
	}
	
	// Strategy 2: Get other videos from the same channel
	if track := tryChannelVideos(meta); track != nil {
		log.Printf("[YouTube] Suggestion found via Channel: %s", track.Title)
		return track, nil
	}
	
	// Strategy 3: Keyword search using title and tags
	if track := tryKeywordSearch(meta); track != nil {
		log.Printf("[YouTube] Suggestion found via Keyword Search: %s", track.Title)
		return track, nil
	}
	
	// Strategy 4: Generic music search as last resort
	return getBasicRecommendation(currentVideoID)
}

func tryYouTubeMix(videoID string, meta *VideoMetadata) *player.Track {
	if YouTubeAPIKey == "" {
		return nil
	}
	
	searchQuery := fmt.Sprintf("Mix - %s", meta.Title)
	apiURL := fmt.Sprintf("https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=5&q=%s&type=playlist&key=%s",
		url.QueryEscape(searchQuery), YouTubeAPIKey)
	
	resp, err := http.Get(apiURL)
	if err != nil || resp.StatusCode != http.StatusOK {
		return nil
	}
	defer resp.Body.Close()
	
	var data struct {
		Items []struct {
			ID struct {
				PlaylistID string `json:"playlistId"`
			} `json:"id"`
		} `json:"items"`
	}
	
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil || len(data.Items) == 0 {
		return nil
	}
	
	playlistID := data.Items[0].ID.PlaylistID
	return getRandomFromPlaylist(playlistID, videoID)
}

func getRandomFromPlaylist(playlistID, excludeVideoID string) *player.Track {
	apiURL := fmt.Sprintf("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=25&playlistId=%s&key=%s",
		playlistID, YouTubeAPIKey)
	
	resp, err := http.Get(apiURL)
	if err != nil || resp.StatusCode != http.StatusOK {
		return nil
	}
	defer resp.Body.Close()
	
	var data struct {
		Items []struct {
			Snippet struct {
				Title        string `json:"title"`
				ChannelTitle string `json:"channelTitle"`
				ResourceID   struct {
					VideoID string `json:"videoId"`
				} `json:"resourceId"`
				Thumbnails   struct {
					High struct {
						URL string `json:"url"`
					} `json:"high"`
				} `json:"thumbnails"`
			} `json:"snippet"`
		} `json:"items"`
	}
	
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil
	}
	
	var candidates []player.Track
	for _, item := range data.Items {
		vid := item.Snippet.ResourceID.VideoID
		if vid == excludeVideoID || vid == "" || IsRecentlyPlayed(vid) {
			continue
		}
		candidates = append(candidates, player.Track{
			ID:        vid,
			Title:     item.Snippet.Title,
			Artist:    item.Snippet.ChannelTitle,
			Thumbnail: item.Snippet.Thumbnails.High.URL,
			Source:    "youtube",
			SourceID:  vid,
		})
	}
	
	if len(candidates) == 0 {
		return nil
	}
	
	maxIdx := len(candidates)
	if maxIdx > 5 {
		maxIdx = 5
	}
	return &candidates[rand.Intn(maxIdx)]
}

func tryChannelVideos(meta *VideoMetadata) *player.Track {
	if meta.ChannelID == "" {
		return nil
	}
	
	apiURL := fmt.Sprintf("https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=%s&maxResults=15&type=video&videoCategoryId=10&order=viewCount&key=%s",
		meta.ChannelID, YouTubeAPIKey)
	
	resp, err := http.Get(apiURL)
	if err != nil || resp.StatusCode != http.StatusOK {
		return nil
	}
	defer resp.Body.Close()
	
	var data struct {
		Items []struct {
			ID struct {
				VideoID string `json:"videoId"`
			} `json:"id"`
			Snippet struct {
				Title        string `json:"title"`
				ChannelTitle string `json:"channelTitle"`
				Thumbnails   struct {
					High struct {
						URL string `json:"url"`
					} `json:"high"`
				} `json:"thumbnails"`
			} `json:"snippet"`
		} `json:"items"`
	}
	
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil
	}
	
	var candidates []player.Track
	for _, item := range data.Items {
		if item.ID.VideoID == meta.ID || IsRecentlyPlayed(item.ID.VideoID) {
			continue
		}
		candidates = append(candidates, player.Track{
			ID:        item.ID.VideoID,
			Title:     item.Snippet.Title,
			Artist:    item.Snippet.ChannelTitle,
			Thumbnail: item.Snippet.Thumbnails.High.URL,
			Source:    "youtube",
			SourceID:  item.ID.VideoID,
		})
	}
	
	if len(candidates) == 0 {
		return nil
	}
	
	maxIdx := len(candidates)
	if maxIdx > 5 {
		maxIdx = 5
	}
	return &candidates[rand.Intn(maxIdx)]
}

func tryKeywordSearch(meta *VideoMetadata) *player.Track {
	var queryParts []string
	cleanTitle := cleanMusicTitle(meta.Title)
	if cleanTitle != "" {
		queryParts = append(queryParts, cleanTitle)
	}
	
	tagCount := 0
	for _, tag := range meta.Tags {
		if tagCount >= 3 {
			break
		}
		lowerTag := strings.ToLower(tag)
		if lowerTag == "music" || lowerTag == "official" || lowerTag == "video" || lowerTag == "lyrics" {
			continue
		}
		queryParts = append(queryParts, tag)
		tagCount++
	}
	
	if len(queryParts) == 0 {
		queryParts = append(queryParts, meta.Title)
	}
	
	searchQuery := strings.Join(queryParts, " ")
	apiURL := fmt.Sprintf("https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=%s&type=video&videoCategoryId=10&key=%s",
		url.QueryEscape(searchQuery), YouTubeAPIKey)
	
	resp, err := http.Get(apiURL)
	if err != nil || resp.StatusCode != http.StatusOK {
		return nil
	}
	defer resp.Body.Close()
	
	var data struct {
		Items []struct {
			ID struct {
				VideoID string `json:"videoId"`
			} `json:"id"`
			Snippet struct {
				Title        string `json:"title"`
				ChannelTitle string `json:"channelTitle"`
				Thumbnails   struct {
					High struct {
						URL string `json:"url"`
					} `json:"high"`
				} `json:"thumbnails"`
			} `json:"snippet"`
		} `json:"items"`
	}
	
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil
	}
	
	var candidates []player.Track
	for _, item := range data.Items {
		if item.ID.VideoID == meta.ID || IsRecentlyPlayed(item.ID.VideoID) {
			continue
		}
		candidates = append(candidates, player.Track{
			ID:        item.ID.VideoID,
			Title:     item.Snippet.Title,
			Artist:    item.Snippet.ChannelTitle,
			Thumbnail: item.Snippet.Thumbnails.High.URL,
			Source:    "youtube",
			SourceID:  item.ID.VideoID,
		})
	}
	
	if len(candidates) == 0 {
		return nil
	}
	
	maxIdx := len(candidates)
	if maxIdx > 5 {
		maxIdx = 5
	}
	return &candidates[rand.Intn(maxIdx)]
}

func cleanMusicTitle(title string) string {
	patterns := []string{
		"(Official Video)", "(Official Music Video)", "(Lyrics)", "(Lyric Video)",
		"[Official Video]", "[Official Music Video]", "[Lyrics]",
		"| Official Video", "| Lyrics", "- Official Video", "- Official Music Video",
		"ft.", "feat.",
	}
	
	result := title
	for _, pattern := range patterns {
		result = strings.ReplaceAll(result, pattern, "")
		result = strings.ReplaceAll(result, strings.ToLower(pattern), "")
		result = strings.ReplaceAll(result, strings.ToUpper(pattern), "")
	}
	return strings.TrimSpace(result)
}

func getBasicRecommendation(videoID string) (*player.Track, error) {
	tracks, err := SearchYouTube("popular music 2026")
	if err != nil {
		return nil, err
	}
	
	var candidates []player.Track
	for _, track := range tracks {
		if track.ID == videoID || IsRecentlyPlayed(track.ID) {
			continue
		}
		candidates = append(candidates, track)
	}
	
	if len(candidates) == 0 {
		return nil, fmt.Errorf("no recommendations available")
	}
	
	idx := rand.Intn(len(candidates))
	return &candidates[idx], nil
}

func init() {
	rand.Seed(time.Now().UnixNano())
}
