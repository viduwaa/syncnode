package main

import (
	"bufio"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

func main() {
	fmt.Println("=========================================")
	fmt.Println("   SyncNode IP Configurator Utility")
	fmt.Println("=========================================\n")

	localIP, err := detectLocalIP()
	if err != nil {
		log.Fatalf("[Error] Failed to detect local IP address: %v", err)
	}

	fmt.Printf("[Detected] Local IPv4 Address: \033[1;36m%s\033[0m\n\n", localIP)

	// 1. Update Frontend env file (rehaul/frontend/.env.local)
	frontendEnvPath := filepath.Join("..", "frontend", ".env.local")
	err = updateEnvFile(frontendEnvPath, "NEXT_PUBLIC_BACKEND_URL", fmt.Sprintf("http://%s:8080", localIP))
	if err != nil {
		fmt.Printf("[Frontend] Warning: Could not update env file at %s: %v\n", frontendEnvPath, err)
	} else {
		fmt.Printf("[Frontend] \033[1;32mSuccessfully updated\033[0m NEXT_PUBLIC_BACKEND_URL to http://%s:8080 in %s\n", localIP, frontendEnvPath)
	}

	// 2. Print instructions for ESP32 and Dashboard
	fmt.Println("\n-----------------------------------------")
	fmt.Println("🔧 CONFIGURATION PARAMETERS:")
	fmt.Printf("  1. Next.js Dashboard Link:  http://localhost:3000\n")
	fmt.Printf("  2. Go Server Stream API:    http://%s:8080/api/stream/\n", localIP)
	fmt.Printf("  3. ESP32 Captive Portal IP: \033[1;33m%s\033[0m\n", localIP)
	fmt.Println("-----------------------------------------\n")
	fmt.Println("Press [Enter] to exit...")
	bufio.NewReader(os.Stdin).ReadBytes('\n')
}

// detectLocalIP searches for the active LAN IPv4 address (via OS routing fallback)
func detectLocalIP() (string, error) {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err == nil {
		defer conn.Close()
		localAddr := conn.LocalAddr().(*net.UDPAddr)
		return localAddr.IP.String(), nil
	}

	// Fallback interface scan
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "", err
	}

	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				ip := ipnet.IP.String()
				// Return common private class IPs
				if strings.HasPrefix(ip, "192.168.") || strings.HasPrefix(ip, "10.") {
					return ip, nil
				}
			}
		}
	}

	return "127.0.0.1", nil
}

// updateEnvFile updates or inserts a key=value pair in the specified env file path
func updateEnvFile(filePath, key, value string) error {
	// Ensure directory exists
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	var lines []string
	found := false
	reg := regexp.MustCompile(fmt.Sprintf(`^%s\s*=.*`, key))
	newLine := fmt.Sprintf("%s=%s", key, value)

	file, err := os.Open(filePath)
	if err == nil {
		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			line := scanner.Text()
			if reg.MatchString(line) {
				lines = append(lines, newLine)
				found = true
			} else {
				lines = append(lines, line)
			}
		}
		file.Close()
	}

	// If the file didn't exist or didn't contain the key
	if !found {
		lines = append(lines, newLine)
	}

	// Write back
	output := strings.Join(lines, "\n") + "\n"
	return os.WriteFile(filePath, []byte(output), 0644)
}
