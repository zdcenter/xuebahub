package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// AiGenerateRequest AI 元数据与副标题生成请求参数
type AiGenerateRequest struct {
	Provider string `json:"provider"` // "gemini", "deepseek", "custom"
	APIKey   string `json:"api_key"`
	Model    string `json:"model"`
	BaseURL  string `json:"base_url"`
	Title    string `json:"title"`
}

// AiGenerateResponse AI 智能生成结果结构体
type AiGenerateResponse struct {
	PolishedTitle    string   `json:"polished_title"`
	Subject          string   `json:"subject"`
	Stage            string   `json:"stage"`
	Grade            string   `json:"grade"`
	Edition          string   `json:"edition"`
	HasVideo         bool     `json:"has_video"`
	Subtitles        []string `json:"subtitles"`
	SelectedSubtitle string   `json:"selected_subtitle"`
	Description      string   `json:"description"`
	RawProvider      string   `json:"raw_provider"`
}

type AiService struct {
	httpClient *http.Client
}

func NewAiService() *AiService {
	return &AiService{
		httpClient: &http.Client{
			Timeout: 45 * time.Second,
		},
	}
}

// GenerateMeta 根据资料标题，调用指定大模型进行深度语义分析并生成元数据、通俗副标题和完整使用指南
func (s *AiService) GenerateMeta(ctx context.Context, req AiGenerateRequest) (*AiGenerateResponse, error) {
	title := strings.TrimSpace(req.Title)
	if title == "" {
		return nil, fmt.Errorf("资料标题不能为空")
	}

	provider := strings.ToLower(strings.TrimSpace(req.Provider))
	if provider == "" {
		provider = "gemini"
	}

	switch provider {
	case "gemini":
		return s.callGemini(ctx, req)
	case "deepseek":
		return s.callDeepSeek(ctx, req)
	case "custom":
		return s.callOpenAICompatible(ctx, req)
	default:
		return nil, fmt.Errorf("不支持的 AI 模型提供商: %s", provider)
	}
}

// buildSystemPrompt 构建高质量、深度优化的教育网盘与 SEO 转化提示词
func (s *AiService) buildPrompt(title string) string {
	return fmt.Sprintf("你是一位深谙中小学及成人考证教育体系、网盘资源推广转化（CRO）与搜索引擎优化（SEO）的顶级专家。\n" +
		"用户提供了一个学习资料或试卷的主标题：【%s】。\n\n" +
		"请你发挥你的专业能力，对该资料进行精准分析与深度扩写，输出一段纯合法的 JSON 格式数据（不要输出任何 markdown 格式标记，直接输出纯 JSON 字符串）：\n" +
		"{\n" +
		"  \"polished_title\": \"规范美化后的标准SEO主标题（必须去除原始输入中的杂质噪音如营销号广告、提取码、多余无意义后缀如.pdf/.rar/下划线乱码等，规范提炼并补齐'教材版本+学段年级+章节专题核心知识点+资料属性如公开课PPT课件/名校期末真题/学霸精讲讲义'等规范要素，语言庄重大气，严禁生硬堆砌，长度控制在25-45字之间）\",\n" +
		"  \"subject\": \"学科名称（必须从'语文'、'数学'、'英语'、'物理'、'化学'、'生物'、'历史'、'地理'、'道德与法治'、'科学'、'综合素质'、'行测'、'申论'中准确选取，若为新概念/音标/词汇请必须选'英语'）\",\n" +
		"  \"stage\": \"学段（必须从 'primary'(小学)、'junior'(初中)、'senior'(高中)、'cert'(教资/考证)、'exam'(公考/职考) 中准确选取）\",\n" +
		"  \"grade\": \"适用年级或分类（如'四年级'、'七年级 (初一)'、'高三 (冲刺高考)'、'初中通用'、'通用 (1-6年级通用)'）\",\n" +
		"  \"edition\": \"教材版本（如'人教版 (统编)'、'外研版'、'北师大版'、'苏教版'、'通用版本 (全通用)'）\",\n" +
		"  \"has_video\": true,\n" +
		"  \"subtitles\": [\n" +
		"    \"第1款副标题（偏自学提分）：大白话通俗易懂，突出包含全套微课/讲义与配套答案，强调网盘免解压无损打印\",\n" +
		"    \"第2款副标题（偏名校冲刺）：大白话通俗易懂，突出名校压轴大题手写规范解题步骤与思路点拨\",\n" +
		"    \"第3款副标题（偏考前押题）：大白话通俗易懂，突出最新考纲高频考点必刷、避坑速记、自测查漏补缺\",\n" +
		"    \"第4款副标题（偏纯净护眼打印）：大白话通俗易懂，突出100%%全彩矢量无噪点、排版干净无水印、A4双面打印超清晰\"\n" +
		"  ],\n" +
		"  \"description\": \"用工整优美的 Markdown 生成专业详尽的内容介绍与使用指南，必须包含以下四大板块：\\n### 📌 资料核心亮点\\n（深度分析本套资料在知识点覆盖、题目解析深度、考纲贴合度上的3大硬核亮点，语言专业、生动通俗）\\n\\n### 📦 资源包含清单\\n（详细罗列本资料所包含的各类文件，如教材/核心讲义、针对性分层同步训练题、标准参考答案与规范手写评分细则、视频微课等）\\n\\n### 🎯 适用人群与自学建议\\n（详细说明学生自学预习、课后查漏补缺、考前模拟自测、家长辅导与助教备课的具体建议，消除学生的畏难情绪）\\n\\n### 💡 极速转存与无损打印指南\\n（用亲切大白话提醒用户：务必先点击【保存到网盘】存入个人账号，既能永久防失效，手机端还能直接原画流畅看微课；电脑端使用 PDF 打印设置选择 A4 纸双面高清输出）\"\n" +
		"}", title)
}

func (s *AiService) cleanJsonString(raw string) string {
	raw = strings.TrimSpace(raw)
	fence := "`" + "`" + "`"
	if strings.HasPrefix(raw, fence+"json") {
		raw = strings.TrimPrefix(raw, fence+"json")
	} else if strings.HasPrefix(raw, fence) {
		raw = strings.TrimPrefix(raw, fence)
	}
	if strings.HasSuffix(raw, fence) {
		raw = strings.TrimSuffix(raw, fence)
	}
	return strings.TrimSpace(raw)
}

// callGemini 调用 Google Gemini API
func (s *AiService) callGemini(ctx context.Context, req AiGenerateRequest) (*AiGenerateResponse, error) {
	apiKey := strings.TrimSpace(req.APIKey)
	if apiKey == "" {
		return nil, fmt.Errorf("请提供有效的 Google Gemini API Key")
	}

	model := strings.TrimSpace(req.Model)
	// 自动兼容与映射 Google 已弃用/下线的旧版本模型名
	if model == "" || model == "gemini-1.5-flash" || model == "gemini-2.0-flash" {
		model = "gemini-3.5-flash"
	} else if model == "gemini-1.5-pro" {
		model = "gemini-2.5-pro"
	}

	endpoint := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", model, apiKey)
	prompt := s.buildPrompt(req.Title)

	requestBody := map[string]interface{}{
		"contents": []map[string]interface{}{
			{
				"parts": []map[string]interface{}{
					{"text": prompt},
				},
			},
		},
		"generationConfig": map[string]interface{}{
			"temperature":     0.7,
			"maxOutputTokens": 2048,
		},
	}

	jsonData, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("构造 Gemini 请求体失败: %w", err)
	}

	var respBytes []byte
	maxRetries := 2
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(800 * time.Millisecond)
		}
		httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewBuffer(jsonData))
		if err != nil {
			return nil, fmt.Errorf("创建 HTTP 请求失败: %w", err)
		}
		httpReq.Header.Set("Content-Type", "application/json")

		resp, err := s.httpClient.Do(httpReq)
		if err != nil {
			if attempt == maxRetries {
				return nil, fmt.Errorf("请求 Google Gemini API 失败: %w", err)
			}
			continue
		}

		respBytes, err = io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			if attempt == maxRetries {
				return nil, fmt.Errorf("读取 Gemini 响应失败: %w", err)
			}
			continue
		}

		if resp.StatusCode == http.StatusOK {
			break
		}

		// 遇到 503 (临时高峰) 进行退避重试
		if resp.StatusCode == 503 && attempt < maxRetries {
			continue
		}

		if resp.StatusCode == 429 {
			return nil, fmt.Errorf("Google Gemini 免费配额已耗尽 (HTTP 429: %s)。提示：该模型今日免费额度已达上限，建议在配置中切换为【gemini-3.5-flash-lite】（配额独立且目前可用）或使用 DeepSeek", string(respBytes))
		}

		return nil, fmt.Errorf("Google Gemini API 返回错误 (HTTP %d): %s", resp.StatusCode, string(respBytes))
	}

	var geminiResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}

	if err := json.Unmarshal(respBytes, &geminiResp); err != nil {
		return nil, fmt.Errorf("解析 Gemini 响应结构失败: %w", err)
	}

	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("Google Gemini 未返回有效内容")
	}

	rawText := geminiResp.Candidates[0].Content.Parts[0].Text
	cleanedJson := s.cleanJsonString(rawText)

	var result AiGenerateResponse
	if err := json.Unmarshal([]byte(cleanedJson), &result); err != nil {
		return nil, fmt.Errorf("解析 Gemini 生成的 JSON 失败: %w (原始输出: %s)", err, rawText)
	}

	if len(result.Subtitles) > 0 && result.SelectedSubtitle == "" {
		result.SelectedSubtitle = result.Subtitles[0]
	}
	result.RawProvider = fmt.Sprintf("Google Gemini (%s)", model)

	return &result, nil
}

// callDeepSeek 调用 DeepSeek API
func (s *AiService) callDeepSeek(ctx context.Context, req AiGenerateRequest) (*AiGenerateResponse, error) {
	apiKey := strings.TrimSpace(req.APIKey)
	if apiKey == "" {
		return nil, fmt.Errorf("请提供有效的 DeepSeek API Key")
	}

	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = "deepseek-chat"
	}

	endpoint := "https://api.deepseek.com/chat/completions"
	prompt := s.buildPrompt(req.Title)

	requestBody := map[string]interface{}{
		"model": model,
		"messages": []map[string]interface{}{
			{
				"role":    "system",
				"content": "你是一位专业的教育资料归类与内容创作专家，请始终以纯合法的 JSON 格式返回分析结果，不要包含任何 markdown 代码块或冗余解释。",
			},
			{
				"role":    "user",
				"content": prompt,
			},
		},
		"temperature": 0.7,
		"response_format": map[string]interface{}{
			"type": "json_object",
		},
	}

	jsonData, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("构造 DeepSeek 请求体失败: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("创建 HTTP 请求失败: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("请求 DeepSeek API 失败: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取 DeepSeek 响应失败: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("DeepSeek API 返回错误 (HTTP %d): %s", resp.StatusCode, string(respBytes))
	}

	var openAiResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.Unmarshal(respBytes, &openAiResp); err != nil {
		return nil, fmt.Errorf("解析 DeepSeek 响应失败: %w", err)
	}

	if len(openAiResp.Choices) == 0 {
		return nil, fmt.Errorf("DeepSeek 未返回有效结果")
	}

	rawText := openAiResp.Choices[0].Message.Content
	cleanedJson := s.cleanJsonString(rawText)

	var result AiGenerateResponse
	if err := json.Unmarshal([]byte(cleanedJson), &result); err != nil {
		return nil, fmt.Errorf("解析 DeepSeek 生成的 JSON 失败: %w (原始输出: %s)", err, rawText)
	}

	if len(result.Subtitles) > 0 && result.SelectedSubtitle == "" {
		result.SelectedSubtitle = result.Subtitles[0]
	}
	result.RawProvider = fmt.Sprintf("DeepSeek (%s)", model)

	return &result, nil
}

// callOpenAICompatible 自定义 OpenAI 兼容接口
func (s *AiService) callOpenAICompatible(ctx context.Context, req AiGenerateRequest) (*AiGenerateResponse, error) {
	apiKey := strings.TrimSpace(req.APIKey)
	baseURL := strings.TrimRight(strings.TrimSpace(req.BaseURL), "/")
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	endpoint := baseURL + "/chat/completions"

	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = "gpt-4o-mini"
	}

	prompt := s.buildPrompt(req.Title)

	requestBody := map[string]interface{}{
		"model": model,
		"messages": []map[string]interface{}{
			{
				"role":    "system",
				"content": "You are a professional educational material metadata extractor. Always output clean valid JSON only without markdown code blocks.",
			},
			{
				"role":    "user",
				"content": prompt,
			},
		},
		"temperature": 0.7,
	}

	jsonData, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("构造请求体失败: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("创建 HTTP 请求失败: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("请求 OpenAI 兼容接口失败: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取接口响应失败: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("AI 接口返回错误 (HTTP %d): %s", resp.StatusCode, string(respBytes))
	}

	var openAiResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.Unmarshal(respBytes, &openAiResp); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}

	if len(openAiResp.Choices) == 0 {
		return nil, fmt.Errorf("未返回有效结果")
	}

	rawText := openAiResp.Choices[0].Message.Content
	cleanedJson := s.cleanJsonString(rawText)

	var result AiGenerateResponse
	if err := json.Unmarshal([]byte(cleanedJson), &result); err != nil {
		return nil, fmt.Errorf("解析 JSON 失败: %w", err)
	}

	if len(result.Subtitles) > 0 && result.SelectedSubtitle == "" {
		result.SelectedSubtitle = result.Subtitles[0]
	}
	result.RawProvider = fmt.Sprintf("Custom (%s)", model)

	return &result, nil
}

// TestConnection 对指定模型执行极速轻量探活测试
func (s *AiService) TestConnection(ctx context.Context, req AiGenerateRequest) (map[string]interface{}, error) {
	provider := strings.ToLower(strings.TrimSpace(req.Provider))
	switch provider {
	case "gemini":
		model := strings.TrimSpace(req.Model)
		if model == "" || model == "gemini-1.5-flash" || model == "gemini-2.0-flash" {
			model = "gemini-3.5-flash"
		} else if model == "gemini-1.5-pro" {
			model = "gemini-2.5-pro"
		}
		endpoint := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", model, req.APIKey)
		requestBody := map[string]interface{}{
			"contents": []map[string]interface{}{
				{"parts": []map[string]interface{}{{"text": "Ping"}}},
			},
			"generationConfig": map[string]interface{}{
				"maxOutputTokens": 10,
			},
		}
		jsonData, _ := json.Marshal(requestBody)
		var lastErr error
		for attempt := 0; attempt <= 2; attempt++ {
			if attempt > 0 {
				time.Sleep(600 * time.Millisecond)
			}
			httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewBuffer(jsonData))
			if err != nil {
				return nil, err
			}
			httpReq.Header.Set("Content-Type", "application/json")
			resp, err := s.httpClient.Do(httpReq)
			if err != nil {
				lastErr = err
				continue
			}
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return map[string]interface{}{
					"provider": "Google Gemini",
					"model":    model,
					"status":   "connected",
					"message":  fmt.Sprintf("Google Gemini (%s) 连通性测试通过！模型响应正常", model),
				}, nil
			}
			if resp.StatusCode == 503 && attempt < 2 {
				continue
			}
			if resp.StatusCode == 429 {
				return nil, fmt.Errorf("Google Gemini 免费配额已用完 (HTTP 429)。该模型今日请求已达 Google 免费层上限，建议在配置中选择【gemini-3.5-flash-lite】（独立配额，目前可用）或使用 DeepSeek")
			}
			return nil, fmt.Errorf("Google Gemini API 返回错误 (HTTP %d): %s", resp.StatusCode, string(body))
		}
		if lastErr != nil {
			return nil, lastErr
		}
		return nil, fmt.Errorf("Google Gemini 连通性探测超时")

	case "deepseek":
		model := strings.TrimSpace(req.Model)
		if model == "" {
			model = "deepseek-chat"
		}
		endpoint := "https://api.deepseek.com/chat/completions"
		requestBody := map[string]interface{}{
			"model": model,
			"messages": []map[string]interface{}{
				{"role": "user", "content": "Ping"},
			},
			"max_tokens": 10,
		}
		jsonData, _ := json.Marshal(requestBody)
		httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewBuffer(jsonData))
		if err != nil {
			return nil, err
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("Authorization", "Bearer "+strings.TrimSpace(req.APIKey))
		resp, err := s.httpClient.Do(httpReq)
		if err != nil {
			return nil, fmt.Errorf("请求 DeepSeek 失败: %w", err)
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("DeepSeek API 返回错误 (HTTP %d): %s", resp.StatusCode, string(body))
		}
		return map[string]interface{}{
			"provider": "DeepSeek",
			"model":    model,
			"status":   "connected",
			"message":  fmt.Sprintf("DeepSeek (%s) 连通性测试通过！模型响应正常", model),
		}, nil

	default:
		res, err := s.GenerateMeta(ctx, req)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{
			"provider": req.Provider,
			"status":   "connected",
			"data":     res,
		}, nil
	}
}
