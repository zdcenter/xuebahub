package service

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"

	"netdisk/api/internal/model"
)

type CoverGeneratorService struct {
	storageDir string
	scriptPath string
	mu         sync.Mutex // 防止同一时刻对同一资源重复并发截图造成资源浪费
}

func NewCoverGeneratorService() *CoverGeneratorService {
	// 存储路径默认为 storage/covers
	storageDir := os.Getenv("COVERS_STORAGE_DIR")
	if storageDir == "" {
		storageDir = filepath.Join("storage", "covers")
	}
	_ = os.MkdirAll(storageDir, 0755)

	scriptPath := filepath.Join("scripts", "render_cover.mjs")
	if _, err := os.Stat(scriptPath); err != nil {
		// 容错：查找上一级或当前目录
		if altPath := filepath.Join("apps", "api", "scripts", "render_cover.mjs"); fileExists(altPath) {
			scriptPath = altPath
		}
	}

	return &CoverGeneratorService{
		storageDir: storageDir,
		scriptPath: scriptPath,
	}
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// GetCachedCoverFilePath 仅检查本地磁盘是否已存在已生成的封面
func (s *CoverGeneratorService) GetCachedCoverFilePath(res *model.Resource) (string, error) {
	if res == nil {
		return "", fmt.Errorf("resource is nil")
	}

	fileName := fmt.Sprintf("%s.png", res.Slug)
	targetPath := filepath.Join(s.storageDir, fileName)

	if fileExists(targetPath) {
		return targetPath, nil
	}
	return "", fmt.Errorf("not cached locally")
}

// GetCoverFilePath 获取封面本地文件路径，若已存在则直接返回，若不存在则现场动态生成并缓存到磁盘
func (s *CoverGeneratorService) GetCoverFilePath(res *model.Resource) (string, error) {
	if res == nil {
		return "", fmt.Errorf("resource is nil")
	}

	fileName := fmt.Sprintf("%s.png", res.Slug)
	targetPath := filepath.Join(s.storageDir, fileName)

	// 1. 检查磁盘上是否已存在已生成的封面
	if fileExists(targetPath) {
		return targetPath, nil
	}

	// 2. 加互斥锁，避免并发重复渲染
	s.mu.Lock()
	defer s.mu.Unlock()

	// 二次确认，防止锁等待期间已有其他请求生成完毕
	if fileExists(targetPath) {
		return targetPath, nil
	}

	// 3. 构造传递给渲染脚本的精简 JSON 数据
	payload := map[string]interface{}{
		"slug":      res.Slug,
		"title":     res.Title,
		"stage":     res.Stage,
		"grade":     res.Grade,
		"subject":   res.Subject,
		"edition":   res.Edition,
		"file_size": res.FileSize,
		"file_tree": res.FileTree,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal resource data failed: %w", err)
	}

	// 4. 调用无头 Chrome 渲染脚本
	cmd := exec.Command("node", s.scriptPath, "--data", string(jsonData), "--out", targetPath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[CoverGenerator] Failed to render cover for %s: %v, output: %s", res.Slug, err, string(output))
		// 如果生成失败，尝试使用兜底官方封面
		fallbackPath := filepath.Join("assets", "og-cover.png")
		if !fileExists(fallbackPath) {
			fallbackPath = filepath.Join("apps", "api", "assets", "og-cover.png")
		}
		if fileExists(fallbackPath) {
			return fallbackPath, nil
		}
		return "", fmt.Errorf("render failed and no fallback available: %w", err)
	}

	log.Printf("[CoverGenerator] Successfully rendered and cached cover for %s at %s", res.Slug, targetPath)
	return targetPath, nil
}
