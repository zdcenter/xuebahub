package service

import (
	"context"
	"fmt"
	"sync"
	"time"

	"netdisk/api/internal/model"
)

// SearchResult 聚合搜索返回结果
type SearchResult struct {
	Title       string `json:"title"`
	DriveType   string `json:"drive_type"` // quark, baidu, aliyun, etc.
	ShareURL    string `json:"share_url"`
	ExtractCode string `json:"extract_code"`
	FileSize    string `json:"file_size"`
	Source      string `json:"source"`
}

// SearchAggregatorService 负责多源并发聚合爬虫/API调用的核心引擎
type SearchAggregatorService struct{}

func NewSearchAggregatorService() *SearchAggregatorService {
	return &SearchAggregatorService{}
}

// AggregateSearch 并发调用多个搜索源（Goroutine + WaitGroup 毫秒级多源汇总）
func (s *SearchAggregatorService) AggregateSearch(ctx context.Context, keyword string) ([]SearchResult, error) {
	// 演示支持的搜索通道/爬虫源通道列表
	channels := []string{"夸克公开知识库", "名校教辅镜像源", "百度公共考点库"}

	resultsChan := make(chan []SearchResult, len(channels))
	var wg sync.WaitGroup

	// 为并发任务设定严格的整体超时，防止慢爬虫拖垮接口（例如 2.5 秒封顶）
	searchCtx, cancel := context.WithTimeout(ctx, 2500*time.Millisecond)
	defer cancel()

	for _, ch := range channels {
		wg.Add(1)
		go func(sourceChannel string) {
			defer wg.Done()

			// 模拟各独立通道并发抓取/请求外部接口
			select {
			case <-searchCtx.Done():
				return
			default:
				mockResults := []SearchResult{
					{
						Title:       fmt.Sprintf("【%s】%s 全套高频期末真题与考点梳理", sourceChannel, keyword),
						DriveType:   "quark",
						ShareURL:    "https://pan.quark.cn/s/crawled_demo_item",
						ExtractCode: "",
						FileSize:    "15.8 MB",
						Source:      sourceChannel,
					},
				}
				resultsChan <- mockResults
			}
		}(ch)
	}

	// 等待所有协程完成或超时后关闭通道
	go func() {
		wg.Wait()
		close(resultsChan)
	}()

	var allResults []SearchResult
	for resList := range resultsChan {
		allResults = append(allResults, resList...)
	}

	// 记录搜索日志异步进行，不阻碍主响应
	go func(kw string, count int) {
		_ = model.SearchLog{
			Keyword:     kw,
			ResultCount: count,
		}
	}(keyword, len(allResults))

	return allResults, nil
}
