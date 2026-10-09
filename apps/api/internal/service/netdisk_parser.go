package service

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type NetdiskFileItem struct {
	Name      string            `json:"name"`
	Size      string            `json:"size"`
	SizeBytes int64             `json:"size_bytes,omitempty"`
	IsDir     bool              `json:"is_dir"`
	Ext       string            `json:"ext"`
	Children  []NetdiskFileItem `json:"children,omitempty"`
}

type NetdiskParsedInfo struct {
	FileName     string            `json:"file_name"`
	FileSize     string            `json:"file_size"`
	FileType     string            `json:"file_type"`
	FileTime     string            `json:"file_time,omitempty"`
	ResourceDesc string            `json:"resource_desc,omitempty"`
	HasVideo     bool              `json:"has_video"`
	FileList     []NetdiskFileItem `json:"file_list"`
	FileCount    int               `json:"file_count"`
	Success      bool              `json:"success"`
	Message      string            `json:"message"`
}

type NetdiskParserService struct{}

func NewNetdiskParserService() *NetdiskParserService {
	return &NetdiskParserService{}
}

// getClient 为每次网盘解析请求创建独立的临时 CookieJar 与短超时客户端，杜绝会话污染与悬挂
func (s *NetdiskParserService) getClient() *http.Client {
	jar, _ := cookiejar.New(nil)
	return &http.Client{
		Timeout: 8 * time.Second,
		Jar:     jar,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}
}

// ParseShareURL 智能解析网盘分享链接，获取真实文件大小与格式及时间
func (s *NetdiskParserService) ParseShareURL(rawURL string, driveType string, passcode string) NetdiskParsedInfo {
	rawURL = strings.TrimSpace(rawURL)
	passcode = strings.TrimSpace(passcode)

	if rawURL == "" {
		return NetdiskParsedInfo{
			Success:  false,
			Message:  "网盘链接不能为空",
			FileList: []NetdiskFileItem{},
		}
	}

	// 1. 夸克网盘链接解析 (https://pan.quark.cn/s/...)
	if strings.Contains(rawURL, "quark.cn") || driveType == "quark" {
		return s.parseQuarkShare(rawURL, passcode)
	}

	// 2. 百度网盘链接解析 (https://pan.baidu.com/s/...)
	if strings.Contains(rawURL, "baidu.com") || driveType == "baidu" {
		return s.parseBaiduShare(rawURL, passcode)
	}

	// 未能识别网盘类型
	return NetdiskParsedInfo{
		Success:  false,
		Message:  "暂不支持该类型的网盘链接，仅支持夸克网盘与百度网盘",
		FileList: []NetdiskFileItem{},
	}
}

// parseQuarkShare 解析夸克公开分享页（带真实 Cookie 会话管理、规范 URL 参数与子目录递归提取）
func (s *NetdiskParserService) parseQuarkShare(rawURL string, passcode string) NetdiskParsedInfo {
	re := regexp.MustCompile(`/s/([a-zA-Z0-9]+)`)
	matches := re.FindStringSubmatch(rawURL)
	if len(matches) < 2 {
		return NetdiskParsedInfo{
			Success:  false,
			Message:  "无法从夸克链接提取有效分享ID",
			FileList: []NetdiskFileItem{},
		}
	}

	pwdID := matches[1]
	client := s.getClient()
	headers := map[string]string{
		"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		"Referer":    fmt.Sprintf("https://pan.quark.cn/s/%s", pwdID),
		"Accept":     "application/json, text/plain, */*",
	}

	// 第一步：POST 请求交换 stoken 访问凭证
	tokenURL := "https://pan.quark.cn/1/clouddrive/share/sharepage/token"
	tokenPayload := fmt.Sprintf(`{"pwd_id":"%s","passcode":"%s"}`, pwdID, passcode)

	var tokenBody []byte
	for attempt := 0; attempt < 2; attempt++ {
		req, err := http.NewRequest("POST", tokenURL, strings.NewReader(tokenPayload))
		if err != nil {
			break
		}
		req.Header.Set("Content-Type", "application/json")
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		resp, err := client.Do(req)
		if err == nil && resp.StatusCode == 200 {
			tokenBody, _ = io.ReadAll(resp.Body)
			resp.Body.Close()
			break
		}
		if resp != nil {
			resp.Body.Close()
		}
		time.Sleep(150 * time.Millisecond)
	}

	if len(tokenBody) == 0 {
		return NetdiskParsedInfo{
			Success:  false,
			Message:  "未能获取夸克访问凭据（可能分享已失效、已被删除或网络超时）",
			FileList: []NetdiskFileItem{},
		}
	}

	var tokenResult struct {
		Status int `json:"status"`
		Data   struct {
			Stoken string `json:"stoken"`
			Title  string `json:"title"`
		} `json:"data"`
	}
	if err := json.Unmarshal(tokenBody, &tokenResult); err != nil || tokenResult.Data.Stoken == "" {
		return NetdiskParsedInfo{
			Success:  false,
			Message:  "夸克分享凭据解析失败，请确认提取码是否正确或分享是否有效",
			FileList: []NetdiskFileItem{},
		}
	}

	stoken := tokenResult.Data.Stoken
	resourceTitle := tokenResult.Data.Title

	// 第二步：GET 请求详情页根层文件列表
	detailQ := url.Values{}
	detailQ.Set("pwd_id", pwdID)
	detailQ.Set("stoken", stoken)
	detailQ.Set("_page", "1")
	detailQ.Set("_size", "100")
	detailQ.Set("_fetch_share", "1")
	detailQ.Set("_fetch_total", "1")
	detailURL := "https://pan.quark.cn/1/clouddrive/share/sharepage/detail?" + detailQ.Encode()

	var detailBody []byte
	for attempt := 0; attempt < 2; attempt++ {
		req, err := http.NewRequest("GET", detailURL, nil)
		if err != nil {
			break
		}
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		resp, err := client.Do(req)
		if err == nil && resp.StatusCode == 200 {
			detailBody, _ = io.ReadAll(resp.Body)
			resp.Body.Close()
			break
		}
		if resp != nil {
			resp.Body.Close()
		}
		time.Sleep(150 * time.Millisecond)
	}

	if len(detailBody) == 0 {
		return NetdiskParsedInfo{
			Success:  false,
			Message:  "获取夸克文件列表超时，请重试",
			FileList: []NetdiskFileItem{},
		}
	}

	type FileItem struct {
		FID        string `json:"fid"`
		FileName   string `json:"file_name"`
		FormatType string `json:"format_type"`
		Size       int64  `json:"size"`
		Dir        bool   `json:"dir"`
		UpdatedAt  int64  `json:"updated_at"`
	}

	// 递归穿透子目录函数：支持嵌套目录遍历与真实容量累加统计（深度上限 4 层）
	var fetchQuarkDirRecursive func(pdirFID, folderName string, depth int) NetdiskFileItem
	var latestTime int64 = 0
	var totalBytes int64 = 0
	hasVideo := false
	actualFileCount := 0
	var isTruncated bool = false

	fetchQuarkDirRecursive = func(pdirFID, folderName string, depth int) NetdiskFileItem {
		folderNode := NetdiskFileItem{
			Name:     folderName,
			IsDir:    true,
			Ext:      "DIR",
			Children: []NetdiskFileItem{},
		}
		if depth > 4 {
			folderNode.Size = "文件夹"
			isTruncated = true
			return folderNode
		}

		subQ := url.Values{}
		subQ.Set("pwd_id", pwdID)
		subQ.Set("stoken", stoken)
		subQ.Set("pdir_fid", pdirFID)
		subQ.Set("_page", "1")
		subQ.Set("_size", "1000") // Increase to 1000 to reduce pagination truncation
		subURL := "https://pan.quark.cn/1/clouddrive/share/sharepage/detail?" + subQ.Encode()

		subReq, _ := http.NewRequest("GET", subURL, nil)
		for k, v := range headers {
			subReq.Header.Set(k, v)
		}
		subResp, subErr := client.Do(subReq)
		if subErr != nil || subResp.StatusCode != 200 {
			if subResp != nil {
				subResp.Body.Close()
			}
			folderNode.Size = "文件夹"
			isTruncated = true
			return folderNode
		}
		subBody, _ := io.ReadAll(subResp.Body)
		subResp.Body.Close()

		var subResult struct {
			Data struct {
				List []FileItem `json:"list"`
			} `json:"data"`
		}
		if json.Unmarshal(subBody, &subResult) != nil || len(subResult.Data.List) == 0 {
			folderNode.Size = "文件夹 (空)"
			return folderNode
		}

		if len(subResult.Data.List) >= 1000 {
			isTruncated = true
		}

		var folderBytes int64 = 0
		for _, subItem := range subResult.Data.List {
			if subItem.UpdatedAt > latestTime {
				latestTime = subItem.UpdatedAt
			}
			if subItem.Dir {
				// 深度递归穿透子目录
				childDir := fetchQuarkDirRecursive(subItem.FID, subItem.FileName, depth+1)
				folderBytes += childDir.SizeBytes
				folderNode.Children = append(folderNode.Children, childDir)
			} else {
				folderBytes += subItem.Size
				actualFileCount++
				lower := strings.ToLower(subItem.FileName)
				if strings.HasSuffix(lower, ".mp4") || strings.HasSuffix(lower, ".mkv") || strings.HasSuffix(lower, ".avi") ||
					strings.HasSuffix(lower, ".flv") || strings.HasSuffix(lower, ".mov") ||
					strings.Contains(strings.ToLower(subItem.FormatType), "video") {
					hasVideo = true
				}
				folderNode.Children = append(folderNode.Children, NetdiskFileItem{
					Name:      subItem.FileName,
					Size:      formatByteSize(subItem.Size),
					SizeBytes: subItem.Size,
					IsDir:     false,
					Ext:       getFileExt(subItem.FileName, false),
				})
			}
		}

		folderNode.SizeBytes = folderBytes
		if len(folderNode.Children) > 0 {
			if folderBytes > 0 {
				folderNode.Size = fmt.Sprintf("%s (%d项)", formatByteSize(folderBytes), len(folderNode.Children))
			} else {
				folderNode.Size = fmt.Sprintf("文件夹 (%d项)", len(folderNode.Children))
			}
		} else {
			if isTruncated {
				folderNode.Size = "文件夹"
			} else {
				folderNode.Size = "文件夹 (空)"
			}
		}
		return folderNode
	}

	var detailResult struct {
		Status int `json:"status"`
		Data   struct {
			List []FileItem `json:"list"`
			Share struct {
				Size       int64 `json:"size"`
				AllFileNum int   `json:"all_file_num"`
			} `json:"share"`
		} `json:"data"`
	}
	if err := json.Unmarshal(detailBody, &detailResult); err != nil || len(detailResult.Data.List) == 0 {
		return NetdiskParsedInfo{
			Success:  false,
			Message:  "夸克网盘分享中未包含任何文件",
			FileList: []NetdiskFileItem{},
		}
	}

	if len(detailResult.Data.List) >= 100 {
		isTruncated = true // Initial request had _size=100
	}

	mainFileName := resourceTitle
	var fileList []NetdiskFileItem

	for _, item := range detailResult.Data.List {
		if mainFileName == "" {
			mainFileName = item.FileName
		}
		if item.UpdatedAt > latestTime {
			latestTime = item.UpdatedAt
		}

		if item.Dir {
			folderItem := fetchQuarkDirRecursive(item.FID, item.FileName, 1)
			totalBytes += folderItem.SizeBytes
			fileList = append(fileList, folderItem)
		} else {
			totalBytes += item.Size
			actualFileCount++
			lower := strings.ToLower(item.FileName)
			if strings.HasSuffix(lower, ".mp4") || strings.HasSuffix(lower, ".mkv") || strings.HasSuffix(lower, ".avi") ||
				strings.HasSuffix(lower, ".flv") || strings.HasSuffix(lower, ".mov") ||
				strings.Contains(strings.ToLower(item.FormatType), "video") {
				hasVideo = true
			}
			fileList = append(fileList, NetdiskFileItem{
				Name:      item.FileName,
				Size:      formatByteSize(item.Size),
				SizeBytes: item.Size,
				IsDir:     item.Dir,
				Ext:       getFileExt(item.FileName, item.Dir),
			})
		}
	}

	if len(fileList) == 1 && detailResult.Data.Share.Size > 0 {
		fileList[0].SizeBytes = detailResult.Data.Share.Size
		if len(fileList[0].Children) > 0 {
			fileList[0].Size = fmt.Sprintf("%s (%d项)", formatByteSize(detailResult.Data.Share.Size), len(fileList[0].Children))
		} else {
			fileList[0].Size = formatByteSize(detailResult.Data.Share.Size)
		}
	}

	if len(fileList) == 0 {
		return NetdiskParsedInfo{
			Success:  false,
			Message:  "未能从该夸克分享中提取到有效文件",
			FileList: []NetdiskFileItem{},
		}
	}

	fileType := "PDF"
	if hasVideo || strings.Contains(mainFileName, "视频") || strings.Contains(mainFileName, "微课") || strings.Contains(mainFileName, "动画") || strings.Contains(mainFileName, "课") {
		fileType = "高清视频课"
		hasVideo = true
	} else if strings.HasSuffix(strings.ToLower(mainFileName), ".zip") || strings.HasSuffix(strings.ToLower(mainFileName), ".rar") || strings.HasSuffix(strings.ToLower(mainFileName), ".7z") {
		fileType = "ZIP资料包"
	} else if strings.HasSuffix(strings.ToLower(mainFileName), ".docx") || strings.HasSuffix(strings.ToLower(mainFileName), ".doc") {
		fileType = "Word文档"
	}

	formattedSize := formatByteSize(totalBytes)
	if detailResult.Data.Share.Size > 0 {
		formattedSize = formatByteSize(detailResult.Data.Share.Size)
	} else if totalBytes == 0 || isTruncated {
		if fileType == "高清视频课" {
			formattedSize = "完整视频合集包"
		} else {
			formattedSize = "完整资源合集"
		}
	}

	dateStr := time.Now().Format("2006-01-02")
	if latestTime > 0 {
		if latestTime > 1e11 {
			latestTime = latestTime / 1000
		}
		dateStr = time.Unix(latestTime, 0).Format("2006-01-02")
	}

	desc := fmt.Sprintf("夸克网盘 · %s 更新 · %s", dateStr, fileType)
	if hasVideo {
		desc = fmt.Sprintf("夸克网盘 · %s 更新 · 包含超清视频精讲", dateStr)
	}

	finalFileCount := actualFileCount
	if detailResult.Data.Share.AllFileNum > 0 {
		finalFileCount = detailResult.Data.Share.AllFileNum
	}

	return NetdiskParsedInfo{
		FileName:     mainFileName,
		FileSize:     formattedSize,
		FileType:     fileType,
		FileTime:     dateStr,
		ResourceDesc: desc,
		HasVideo:     hasVideo,
		FileList:     fileList,
		FileCount:    finalFileCount,
		Success:      true,
		Message:      fmt.Sprintf("成功读取夸克网盘（%s，共 %d 个文件）！", formattedSize, finalFileCount),
	}
}

// parseBaiduShare 解析百度网盘公开分享页
func (s *NetdiskParserService) parseBaiduShare(rawURL string, passcode string) NetdiskParsedInfo {
	cleanURL, surl, pwd := extractBaiduParams(rawURL, passcode)
	if surl == "" {
		return NetdiskParsedInfo{
			Success:  false,
			Message:  "无法从百度网盘链接提取分享标识(surl)",
			FileList: []NetdiskFileItem{},
		}
	}

	headers := map[string]string{
		"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		"Referer":    "https://pan.baidu.com/",
		"Accept":     "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
	}

	pageURL := fmt.Sprintf("https://pan.baidu.com/s/1%s", surl)
	client := s.getClient()

	// Step 1: 首次请求分享主页面
	req1, err := http.NewRequest("GET", pageURL, nil)
	if err != nil {
		return NetdiskParsedInfo{
			Success:  false,
			Message:  "构建百度请求失败",
			FileList: []NetdiskFileItem{},
		}
	}
	for k, v := range headers {
		req1.Header.Set(k, v)
	}

	resp1, err := client.Do(req1)
	if err != nil {
		return NetdiskParsedInfo{
			Success:  false,
			Message:  "请求百度网盘超时",
			FileList: []NetdiskFileItem{},
		}
	}
	body1Bytes, _ := io.ReadAll(resp1.Body)
	resp1.Body.Close()
	html1 := string(body1Bytes)

	// 提取 share_uk 和 shareid
	ukRe := regexp.MustCompile(`(?i)share_uk["'\\]?\s*[:=]\s*["'\\]?(\d+)`)
	idRe := regexp.MustCompile(`(?i)shareid["'\\]?\s*[:=]\s*["'\\]?(\d+)`)

	shareUk := ""
	if m := ukRe.FindStringSubmatch(html1); len(m) > 1 {
		shareUk = m[1]
	}
	shareId := ""
	if m := idRe.FindStringSubmatch(html1); len(m) > 1 {
		shareId = m[1]
	}

	// Step 2: 如果存在提取码且提取到了 share_uk 与 shareid，发起 POST verify 验证获取鉴权 Cookie
	if pwd != "" && shareUk != "" && shareId != "" {
		timestamp := time.Now().UnixNano() / 1e6
		verifyURL := fmt.Sprintf("https://pan.baidu.com/share/verify?t=%d&shareid=%s&uk=%s&channel=chunlei&clienttype=0&web=1", timestamp, shareId, shareUk)
		formData := url.Values{}
		formData.Set("pwd", pwd)
		formData.Set("vcode", "")
		formData.Set("vcode_str", "")

		vReq, vErr := http.NewRequest("POST", verifyURL, strings.NewReader(formData.Encode()))
		if vErr == nil {
			vReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			vReq.Header.Set("X-Requested-With", "XMLHttpRequest")
			for k, v := range headers {
				vReq.Header.Set(k, v)
			}
			vReq.Header.Set("Referer", pageURL)

			if vResp, vDoErr := client.Do(vReq); vDoErr == nil {
				vResp.Body.Close()
			}
		}
	}

	// Step 3: 请求分享页面，解析真实 file_list
	req2, _ := http.NewRequest("GET", pageURL, nil)
	for k, v := range headers {
		req2.Header.Set(k, v)
	}
	req2.Header.Set("Referer", pageURL)

	resp2, err := client.Do(req2)
	if err != nil {
		return NetdiskParsedInfo{
			Success:  false,
			Message:  "刷新百度网盘详情超时",
			FileList: []NetdiskFileItem{},
		}
	}
	body2Bytes, _ := io.ReadAll(resp2.Body)
	resp2.Body.Close()
	html2 := string(body2Bytes)

	type BaiduFileEntry struct {
		ServerFilename string `json:"server_filename"`
		Size           int64  `json:"size"`
		IsDir          int    `json:"isdir"`
		ServerMtime    int64  `json:"server_mtime"`
		Category       int    `json:"category"`
		Path           string `json:"path"`
	}

	var files []BaiduFileEntry
	flRe := regexp.MustCompile(`"file_list"\s*:\s*(\[.*?\])\s*,\s*"(?:errortype|errno|ufcTime|data)`)
	if m := flRe.FindStringSubmatch(html2); len(m) > 1 {
		_ = json.Unmarshal([]byte(m[1]), &files)
	}

	if len(files) == 0 {
		looseRe := regexp.MustCompile(`"server_filename"\s*:\s*"([^"]+)"[\s\S]*?"size"\s*:\s*(\d+)[\s\S]*?"server_mtime"\s*:\s*(\d+)`)
		if matches := looseRe.FindAllStringSubmatch(html2, -1); len(matches) > 0 {
			for _, match := range matches {
				var sz, mt int64
				fmt.Sscanf(match[2], "%d", &sz)
				fmt.Sscanf(match[3], "%d", &mt)
				files = append(files, BaiduFileEntry{
					ServerFilename: match[1],
					Size:           sz,
					ServerMtime:    mt,
				})
			}
		}
	}

	if len(files) == 0 {
		return NetdiskParsedInfo{
			Success:  false,
			Message:  "未能提取到百度网盘文件列表（可能分享已被取消或提取码不正确）",
			FileList: []NetdiskFileItem{},
		}
	}

	var totalBytes int64 = 0
	var latestMtime int64 = 0
	hasVideo := false
	mainName := ""
	var fileList []NetdiskFileItem
	actualFileCount := 0

	for _, f := range files {
		if mainName == "" {
			mainName = f.ServerFilename
		}
		if f.ServerMtime > latestMtime {
			latestMtime = f.ServerMtime
		}

		if f.IsDir == 1 {
			folderItem := NetdiskFileItem{
				Name:      f.ServerFilename,
				IsDir:     true,
				Ext:       "DIR",
				Children:  []NetdiskFileItem{},
			}
			var folderBytes int64 = 0

			if f.Path != "" && shareUk != "" && shareId != "" {
				subURL := fmt.Sprintf("https://pan.baidu.com/share/list?shareid=%s&uk=%s&dir=%s&channel=chunlei&clienttype=0&web=1&page=1&num=100&order=time&desc=1",
					shareId, shareUk, url.QueryEscape(f.Path))
				subReq, _ := http.NewRequest("GET", subURL, nil)
				if subReq != nil {
					for k, v := range headers {
						subReq.Header.Set(k, v)
					}
					subReq.Header.Set("X-Requested-With", "XMLHttpRequest")
					subReq.Header.Set("Referer", pageURL)

					if subResp, subErr := client.Do(subReq); subErr == nil {
						subBody, _ := io.ReadAll(subResp.Body)
						subResp.Body.Close()

						var subResult struct {
							Errno int              `json:"errno"`
							List  []BaiduFileEntry `json:"list"`
						}
						if json.Unmarshal(subBody, &subResult) == nil && subResult.Errno == 0 {
							for _, subFile := range subResult.List {
								folderBytes += subFile.Size
								totalBytes += subFile.Size
								if subFile.ServerMtime > latestMtime {
									latestMtime = subFile.ServerMtime
								}
								lower := strings.ToLower(subFile.ServerFilename)
								if strings.HasSuffix(lower, ".mp4") || strings.HasSuffix(lower, ".mkv") || strings.HasSuffix(lower, ".avi") || subFile.Category == 1 {
									hasVideo = true
								}
								subIsDir := subFile.IsDir == 1
								subExt := getFileExt(subFile.ServerFilename, subIsDir)
								if !subIsDir {
									actualFileCount++
								}
								folderItem.Children = append(folderItem.Children, NetdiskFileItem{
									Name:      subFile.ServerFilename,
									Size:      formatByteSize(subFile.Size),
									SizeBytes: subFile.Size,
									IsDir:     subIsDir,
									Ext:       subExt,
								})
							}
						}
					}
				}
			}

			folderItem.SizeBytes = folderBytes
			if len(folderItem.Children) > 0 {
				folderItem.Size = fmt.Sprintf("%s (%d个文件)", formatByteSize(folderBytes), len(folderItem.Children))
			} else {
				folderItem.Size = "文件夹"
			}
			fileList = append(fileList, folderItem)
		} else {
			totalBytes += f.Size
			actualFileCount++
			lower := strings.ToLower(f.ServerFilename)
			if strings.HasSuffix(lower, ".mp4") || strings.HasSuffix(lower, ".mkv") || strings.HasSuffix(lower, ".avi") || f.Category == 1 {
				hasVideo = true
			}
			fileList = append(fileList, NetdiskFileItem{
				Name:      f.ServerFilename,
				Size:      formatByteSize(f.Size),
				SizeBytes: f.Size,
				IsDir:     false,
				Ext:       getFileExt(f.ServerFilename, false),
			})
		}
	}

	formattedSize := formatByteSize(totalBytes)
	fileType := "PDF"
	if hasVideo {
		fileType = "高清视频课"
	} else if strings.HasSuffix(strings.ToLower(mainName), ".zip") || strings.HasSuffix(strings.ToLower(mainName), ".rar") {
		fileType = "ZIP资料包"
	}

	dateStr := time.Now().Format("2006-01-02")
	if latestMtime > 0 {
		dateStr = time.Unix(latestMtime, 0).Format("2006-01-02")
	}

	desc := fmt.Sprintf("百度网盘 · %s 更新 · %s", dateStr, fileType)
	if hasVideo {
		desc = fmt.Sprintf("百度网盘 · %s 更新 · 含超清录播精讲", dateStr)
	}

	_ = cleanURL
	return NetdiskParsedInfo{
		FileName:     mainName,
		FileSize:     formattedSize,
		FileType:     fileType,
		FileTime:     dateStr,
		ResourceDesc: desc,
		HasVideo:     hasVideo,
		FileList:     fileList,
		FileCount:    actualFileCount,
		Success:      true,
		Message:      fmt.Sprintf("成功读取百度网盘真实容量（%s，共 %d 个文件）！", formattedSize, actualFileCount),
	}
}

// extractBaiduParams 解析百度网盘链接、提取码以及短链标识
func extractBaiduParams(rawURL, passcode string) (cleanURL, surl, pwd string) {
	cleanURL = strings.TrimSpace(rawURL)
	pwd = strings.TrimSpace(passcode)

	if pwd == "" {
		codeRe := regexp.MustCompile(`(?i)(?:提取码|密码|pwd)[:：\s]*([a-zA-Z0-9]{4})`)
		if m := codeRe.FindStringSubmatch(cleanURL); len(m) > 1 {
			pwd = m[1]
		}
	}

	urlRe := regexp.MustCompile(`https?://pan\.baidu\.com/\S+`)
	if m := urlRe.FindString(cleanURL); m != "" {
		cleanURL = m
	}

	if u, err := url.Parse(cleanURL); err == nil {
		if qPwd := u.Query().Get("pwd"); qPwd != "" && pwd == "" {
			pwd = qPwd
		}
		if qSurl := u.Query().Get("surl"); qSurl != "" {
			surl = qSurl
		}
	}

	if surl == "" {
		pathRe := regexp.MustCompile(`/s/(?:1)?([a-zA-Z0-9_-]+)`)
		if m := pathRe.FindStringSubmatch(cleanURL); len(m) > 1 {
			surl = m[1]
		}
	}

	return cleanURL, surl, pwd
}

func getFileExt(filename string, isDir bool) string {
	if isDir {
		return "DIR"
	}
	idx := strings.LastIndex(filename, ".")
	if idx != -1 && idx < len(filename)-1 {
		return strings.ToUpper(filename[idx+1:])
	}
	return "FILE"
}

func formatByteSize(bytes int64) string {
	if bytes <= 0 {
		return "0 B"
	}
	const (
		KB = 1024
		MB = 1024 * KB
		GB = 1024 * MB
	)

	switch {
	case bytes >= GB:
		return fmt.Sprintf("%.2f GB", float64(bytes)/float64(GB))
	case bytes >= MB:
		return fmt.Sprintf("%.1f MB", float64(bytes)/float64(MB))
	case bytes >= KB:
		return fmt.Sprintf("%.1f KB", float64(bytes)/float64(KB))
	default:
		return fmt.Sprintf("%d B", bytes)
	}
}
