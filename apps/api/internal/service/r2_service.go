package service

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"netdisk/api/internal/config"
)

type R2Service struct {
	cfg    *config.Config
	client *http.Client
}

func NewR2Service(cfg *config.Config) *R2Service {
	return &R2Service{
		cfg: cfg,
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (s *R2Service) IsConfigured() bool {
	return s.cfg.R2AccountID != "" && s.cfg.R2AccessKey != "" && s.cfg.R2SecretKey != "" && s.cfg.R2Bucket != ""
}

func (s *R2Service) GetPublicURL(key string) string {
	base := strings.TrimRight(s.cfg.R2PublicURL, "/")
	if base == "" {
		base = "https://image.xuebaw.com"
	}
	key = strings.TrimLeft(key, "/")
	return fmt.Sprintf("%s/%s", base, key)
}

func hmacSHA256(key []byte, data string) []byte {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(data))
	return h.Sum(nil)
}

func sha256Hex(data []byte) string {
	h := sha256.New()
	h.Write(data)
	return hex.EncodeToString(h.Sum(nil))
}

// UploadObject 上传二进制数据到 Cloudflare R2
func (s *R2Service) UploadObject(key string, data []byte, contentType string) (string, error) {
	if !s.IsConfigured() {
		return "", fmt.Errorf("R2 is not configured in .env")
	}

	key = strings.TrimLeft(key, "/")
	host := fmt.Sprintf("%s.r2.cloudflarestorage.com", s.cfg.R2AccountID)
	endpoint := fmt.Sprintf("https://%s/%s/%s", host, s.cfg.R2Bucket, key)
	canonicalURI := fmt.Sprintf("/%s/%s", s.cfg.R2Bucket, key)

	if contentType == "" {
		contentType = "image/png"
	}

	now := time.Now().UTC()
	amzDate := now.Format("20060102T150405Z")
	dateStamp := now.Format("20060102")
	payloadHash := sha256Hex(data)

	// AWS SigV4 Canonical Headers
	canonicalHeaders := fmt.Sprintf("content-type:%s\nhost:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\n",
		contentType, host, payloadHash, amzDate)
	signedHeaders := "content-type;host;x-amz-content-sha256;x-amz-date"

	canonicalRequest := fmt.Sprintf("PUT\n%s\n\n%s\n%s\n%s",
		canonicalURI, canonicalHeaders, signedHeaders, payloadHash)

	algorithm := "AWS4-HMAC-SHA256"
	credentialScope := fmt.Sprintf("%s/auto/s3/aws4_request", dateStamp)
	stringToSign := fmt.Sprintf("%s\n%s\n%s\n%s",
		algorithm, amzDate, credentialScope, sha256Hex([]byte(canonicalRequest)))

	// 生成签名
	kDate := hmacSHA256([]byte("AWS4"+s.cfg.R2SecretKey), dateStamp)
	kRegion := hmacSHA256(kDate, "auto")
	kService := hmacSHA256(kRegion, "s3")
	kSigning := hmacSHA256(kService, "aws4_request")
	signature := hex.EncodeToString(hmacSHA256(kSigning, stringToSign))

	authHeader := fmt.Sprintf("%s Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		algorithm, s.cfg.R2AccessKey, credentialScope, signedHeaders, signature)

	req, err := http.NewRequest("PUT", endpoint, bytes.NewReader(data))
	if err != nil {
		return "", fmt.Errorf("create R2 request failed: %w", err)
	}

	req.Header.Set("Host", host)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("x-amz-date", amzDate)
	req.Header.Set("x-amz-content-sha256", payloadHash)
	req.Header.Set("Authorization", authHeader)

	resp, err := s.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("R2 upload request error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("R2 upload failed HTTP %d: %s", resp.StatusCode, string(bodyBytes))
	}

	publicURL := s.GetPublicURL(key)
	return publicURL, nil
}
