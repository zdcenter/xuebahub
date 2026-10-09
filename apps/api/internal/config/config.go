package config

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Port        string
	DatabaseURL string
	JWTSecret   string
	CORSOrigin  string
}

// loadEnvFile 尝试加载指定的 .env 文件
func loadEnvFile(paths ...string) {
	for _, p := range paths {
		f, err := os.Open(p)
		if err != nil {
			continue
		}
		defer f.Close()

		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				key := strings.TrimSpace(parts[0])
				val := strings.TrimSpace(parts[1])
				val = strings.Trim(val, `"'`)
				if os.Getenv(key) == "" {
					os.Setenv(key, val)
				}
			}
		}
		break
	}
}

func Load() *Config {
	// 依次探测加载当前目录、apps/api 目录、根目录的 .env
	loadEnvFile(".env", "apps/api/.env", "../.env")

	port := os.Getenv("PORT")
	if port == "" {
		port = "4001"
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbHost := os.Getenv("DB_HOST")
		if dbHost == "" {
			dbHost = "localhost"
		}
		dbPort := os.Getenv("DB_PORT")
		if dbPort == "" {
			dbPort = "5432"
		}
		dbUser := os.Getenv("DB_USER")
		if dbUser == "" {
			dbUser = "postgres"
		}
		dbPass := os.Getenv("DB_PASSWORD")
		if dbPass == "" {
			dbPass = "format.11"
		}
		dbName := os.Getenv("DB_NAME")
		if dbName == "" {
			dbName = "netdisk_db"
		}
		dbSSL := os.Getenv("DB_SSLMODE")
		if dbSSL == "" {
			dbSSL = "disable"
		}

		dbURL = fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=%s TimeZone=Asia/Shanghai",
			dbHost, dbUser, dbPass, dbName, dbPort, dbSSL)
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "super-secret-netdisk-jwt-token-2026"
	}

	corsOrigin := os.Getenv("CORS_ORIGIN")
	if corsOrigin == "" {
		corsOrigin = "*"
	}

	return &Config{
		Port:        port,
		DatabaseURL: dbURL,
		JWTSecret:   jwtSecret,
		CORSOrigin:  corsOrigin,
	}
}
