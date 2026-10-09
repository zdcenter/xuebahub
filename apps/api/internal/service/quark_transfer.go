package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type QuarkAccountInfo struct {
	Nickname      string `json:"nickname"`
	TotalCapacity string `json:"total_capacity"`
	UsedCapacity  string `json:"used_capacity"`
	FreeCapacity  string `json:"free_capacity"`
	IsOverQuota   bool   `json:"is_over_quota"`
}

type QuarkFolderItem struct {
	FID      string `json:"fid"`
	FileName string `json:"file_name"`
	Dir      bool   `json:"dir"`
}

type QuarkFileItem struct {
	FID        string `json:"fid"`
	FileName   string `json:"file_name"`
	Dir        bool   `json:"dir"`
	Size       int64  `json:"size"`
	SizeDesc   string `json:"size_desc"`
	FormatType string `json:"format_type"`
	ShareID    string `json:"share_id,omitempty"`
	ShareURL   string `json:"share_url,omitempty"`
	UpdatedAt  int64  `json:"updated_at,omitempty"`
}

type CreateShareResult struct {
	ShareID     string `json:"share_id"`
	ShareURL    string `json:"share_url"`
	ExtractCode string `json:"extract_code"`
	ShareTitle  string `json:"share_title"`
}

type TransferShareResult struct {
	OriginalURL     string `json:"original_url"`
	NewShareURL     string `json:"new_share_url"`
	ExtractCode     string `json:"extract_code"`
	ShareTitle      string `json:"share_title"`
	FileName        string `json:"file_name"`
	FileSize        string `json:"file_size"`
	FileType        string `json:"file_type"`
	FileTime        string `json:"file_time"`
	ResourceDesc    string `json:"resource_desc"`
	SavedFID        string `json:"saved_fid"`
	TargetFolderFID string `json:"target_folder_fid"`
}

type QuarkTransferService struct {
	client *http.Client
}

func NewQuarkTransferService() *QuarkTransferService {
	tr := &http.Transport{
		Proxy: func(req *http.Request) (*url.URL, error) {
			if u, err := http.ProxyFromEnvironment(req); err == nil && u != nil {
				return u, nil
			}
			return url.Parse("http://127.0.0.1:7897")
		},
	}
	return &QuarkTransferService{
		client: &http.Client{
			Transport: tr,
			Timeout:   20 * time.Second,
		},
	}
}

// 辅助方法：生成夸克标准客户端请求
func (s *QuarkTransferService) newRequest(method, reqURL string, body interface{}, cookie string) (*http.Request, error) {
	var bodyReader io.Reader
	if body != nil {
		jsonBytes, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(jsonBytes)
	}

	req, err := http.NewRequest(method, reqURL, bodyReader)
	if err != nil {
		return nil, err
	}

	// 夸克 PC/Web 端统一指纹 Header
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Origin", "https://pan.quark.cn")
	req.Header.Set("Referer", "https://pan.quark.cn/")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9")
	if body != nil {
		req.Header.Set("Content-Type", "application/json;charset=UTF-8")
	}
	if cookie != "" {
		req.Header.Set("Cookie", strings.TrimSpace(cookie))
	}
	return req, nil
}

// VerifyCookie 验证夸克账号Cookie有效性，并获取昵称与容量
func (s *QuarkTransferService) VerifyCookie(cookie string) (*QuarkAccountInfo, error) {
	cookie = strings.TrimSpace(cookie)
	if cookie == "" {
		return nil, errors.New("Cookie 不能为空")
	}

	// 直接调用 drive-pc 官方会员与容量核心接口（响应迅速且带准确空间数据）
	memberURL := "https://drive-pc.quark.cn/1/clouddrive/member?pr=ucpro&fr=pc"
	req, err := s.newRequest("GET", memberURL, nil, cookie)
	if err != nil {
		return nil, fmt.Errorf("构建请求失败: %w", err)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("连接夸克服务器超时: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var memRes struct {
		Status  int    `json:"status"`
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			MemberType    string `json:"member_type"`
			AccStatus     int    `json:"acc_status"`
			TotalCapacity int64  `json:"total_capacity"`
			UseCapacity   int64  `json:"use_capacity"`
			MemberInfo    struct {
				FileSaveToRemains  int `json:"file_save_to_remains"`
				VideoSaveToRemains int `json:"video_save_to_remains"`
			} `json:"member_info"`
		} `json:"data"`
	}

	if err := json.Unmarshal(respBody, &memRes); err != nil {
		return nil, errors.New("解析夸克响应失败，请检查网络或 Cookie")
	}

	if resp.StatusCode == 401 || memRes.Status == 401 || memRes.Code == 31001 {
		return nil, errors.New("Cookie已失效或未登录，请重新在夸克网页端复制")
	}

	if memRes.Code != 0 && memRes.Status != 200 {
		msg := memRes.Message
		if msg == "" {
			msg = "Cookie验证失败，请重新登录网页端获取"
		}
		return nil, errors.New(msg)
	}

	// 智能识别会员等级与状态称号
	vipName := "夸克用户"
	switch strings.ToUpper(memRes.Data.MemberType) {
	case "SUPER_VIP":
		vipName = "夸克超级会员 SVIP"
	case "VIP":
		vipName = "夸克VIP会员"
	case "NORMAL":
		vipName = "夸克普通用户"
	}

	nickname := vipName
	if memRes.Data.MemberInfo.FileSaveToRemains > 0 {
		nickname = fmt.Sprintf("%s (转存剩余:%d次)", vipName, memRes.Data.MemberInfo.FileSaveToRemains)
	}

	totalCap := formatCapacityBytes(memRes.Data.TotalCapacity)
	usedCap := formatCapacityBytes(memRes.Data.UseCapacity)
	freeCap := "--"
	isOverQuota := false
	if memRes.Data.TotalCapacity > 0 {
		if memRes.Data.TotalCapacity > memRes.Data.UseCapacity {
			freeCap = formatCapacityBytes(memRes.Data.TotalCapacity - memRes.Data.UseCapacity)
		} else {
			isOverQuota = true
			freeCap = fmt.Sprintf("已超限 (已用 %s)", usedCap)
		}
	}

	return &QuarkAccountInfo{
		Nickname:      nickname,
		TotalCapacity: totalCap,
		UsedCapacity:  usedCap,
		FreeCapacity:  freeCap,
		IsOverQuota:   isOverQuota,
	}, nil
}

// ListFolders 列出指定文件夹下的子文件夹（方便管理员选择转存目标文件夹）
func (s *QuarkTransferService) ListFolders(cookie string, pdirFID string) ([]QuarkFolderItem, error) {
	if pdirFID == "" {
		pdirFID = "0"
	}
	reqURL := fmt.Sprintf("https://drive-pc.quark.cn/1/clouddrive/file/sort?pr=ucpro&fr=pc&pdir_fid=%s&_page=1&_size=100&_fetch_total=1&_fetch_sub_dirs=1&_sort=file_type:asc,file_name:asc&__dt=%d&__t=%d",
		pdirFID, rand.Intn(9000)+1000, time.Now().UnixMilli())
	req, err := s.newRequest("GET", reqURL, nil, cookie)
	if err != nil {
		return nil, err
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	var res struct {
		Code int `json:"code"`
		Data struct {
			List []struct {
				FID      string `json:"fid"`
				FileName string `json:"file_name"`
				Dir      bool   `json:"dir"`
			} `json:"list"`
		} `json:"data"`
	}
	if err := json.Unmarshal(bodyBytes, &res); err != nil {
		return nil, err
	}

	folders := make([]QuarkFolderItem, 0)
	for _, item := range res.Data.List {
		if item.Dir {
			folders = append(folders, QuarkFolderItem{
				FID:      item.FID,
				FileName: item.FileName,
				Dir:      true,
			})
		}
	}
	return folders, nil
}

// ListItems 列出指定目录下的全部文件夹和文件（供后台文件选择器浏览自身网盘）
func (s *QuarkTransferService) ListItems(cookie string, pdirFID string) ([]QuarkFileItem, error) {
	if pdirFID == "" {
		pdirFID = "0"
	}
	reqURL := fmt.Sprintf("https://drive-pc.quark.cn/1/clouddrive/file/sort?pr=ucpro&fr=pc&pdir_fid=%s&_page=1&_size=200&_fetch_total=1&_fetch_sub_dirs=1&_sort=file_type:asc,file_name:asc&__dt=%d&__t=%d",
		pdirFID, rand.Intn(9000)+1000, time.Now().UnixMilli())
	req, err := s.newRequest("GET", reqURL, nil, cookie)
	if err != nil {
		return nil, err
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	var res struct {
		Code int `json:"code"`
		Data struct {
			List []struct {
				FID        string `json:"fid"`
				FileName   string `json:"file_name"`
				Dir        bool   `json:"dir"`
				Size       int64  `json:"size"`
				FormatType string `json:"format_type"`
				ShareID    string `json:"share_id"`
				UpdatedAt  int64  `json:"updated_at"`
			} `json:"list"`
		} `json:"data"`
	}
	if err := json.Unmarshal(bodyBytes, &res); err != nil {
		return nil, err
	}

	items := make([]QuarkFileItem, 0, len(res.Data.List))
	for _, item := range res.Data.List {
		sizeDesc := ""
		if !item.Dir && item.Size > 0 {
			sizeDesc = formatByteSize(item.Size)
		}
		shareURL := ""
		if item.ShareID != "" {
			shareURL = fmt.Sprintf("https://pan.quark.cn/s/%s", item.ShareID)
		}
		items = append(items, QuarkFileItem{
			FID:        item.FID,
			FileName:   item.FileName,
			Dir:        item.Dir,
			Size:       item.Size,
			SizeDesc:   sizeDesc,
			FormatType: item.FormatType,
			ShareID:    item.ShareID,
			ShareURL:   shareURL,
			UpdatedAt:  item.UpdatedAt,
		})
	}
	return items, nil
}

// CreateShareForFID 为网盘中的任意指定文件夹或文件创建永久公开无密码分享链接
func (s *QuarkTransferService) CreateShareForFID(cookie string, fid string, title string) (*CreateShareResult, error) {
	if fid == "" {
		return nil, errors.New("文件或文件夹 FID 不能为空")
	}
	if strings.TrimSpace(title) == "" {
		title = "学霸资源分享"
	}

	createShareURL := fmt.Sprintf("https://drive-pc.quark.cn/1/clouddrive/share?pr=ucpro&fr=pc&__dt=%d&__t=%d",
		rand.Intn(9000)+1000, time.Now().UnixMilli())

	createSharePayload := map[string]interface{}{
		"fid_list":     []string{fid},
		"title":        title,
		"url_type":     1, // 1: 公开分享
		"expired_type": 1, // 1: 永久有效
		"expire_time":  0,
	}

	createReq, err := s.newRequest("POST", createShareURL, createSharePayload, cookie)
	if err != nil {
		return nil, fmt.Errorf("创建分享请求失败: %w", err)
	}

	createResp, err := s.client.Do(createReq)
	if err != nil {
		return nil, fmt.Errorf("请求创建分享超时: %w", err)
	}
	defer createResp.Body.Close()

	createBody, _ := io.ReadAll(createResp.Body)
	var createResult struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			TaskID  string `json:"task_id"`
			ShareID string `json:"share_id"`
		} `json:"data"`
	}

	if err := json.Unmarshal(createBody, &createResult); err != nil {
		return nil, errors.New("解析创建分享响应失败")
	}

	if createResult.Code != 0 {
		return nil, fmt.Errorf("夸克创建分享失败: %s", createResult.Message)
	}

	shareID := createResult.Data.ShareID

	// 若返回了 task_id 则轮询取 share_id
	if shareID == "" && createResult.Data.TaskID != "" {
		for i := 0; i < 8; i++ {
			time.Sleep(600 * time.Millisecond)
			shareTaskURL := fmt.Sprintf("https://drive-pc.quark.cn/1/clouddrive/task?pr=ucpro&fr=pc&task_id=%s&__dt=%d&__t=%d",
				createResult.Data.TaskID, rand.Intn(9000)+1000, time.Now().UnixMilli())
			sTaskReq, _ := s.newRequest("GET", shareTaskURL, nil, cookie)
			if sTaskResp, stErr := s.client.Do(sTaskReq); stErr == nil {
				stBody, _ := io.ReadAll(sTaskResp.Body)
				sTaskResp.Body.Close()
				var stRes struct {
					Code int `json:"code"`
					Data struct {
						ShareID string `json:"share_id"`
						Status  int    `json:"status"`
					} `json:"data"`
				}
				if json.Unmarshal(stBody, &stRes) == nil && stRes.Data.ShareID != "" {
					shareID = stRes.Data.ShareID
					break
				}
			}
		}
	}

	if shareID == "" {
		return nil, errors.New("未能获取到生成的分享标识 share_id")
	}

	// 阶段 7：通过 share_id 获取最终可访问的 share_url 及 share_pwd (提取码)
	pwdURL := fmt.Sprintf("https://drive-pc.quark.cn/1/clouddrive/share/password?pr=ucpro&fr=pc&__dt=%d&__t=%d",
		rand.Intn(9000)+1000, time.Now().UnixMilli())

	pwdPayload := map[string]string{
		"share_id": shareID,
	}

	pwdReq, _ := s.newRequest("POST", pwdURL, pwdPayload, cookie)
	var finalShareURL string
	var finalExtractCode string

	if pwdResp, pErr := s.client.Do(pwdReq); pErr == nil {
		defer pwdResp.Body.Close()
		pwdBody, _ := io.ReadAll(pwdResp.Body)
		var pwdResult struct {
			Code int `json:"code"`
			Data struct {
				ShareURL string `json:"share_url"`
				SharePwd string `json:"share_pwd"`
			} `json:"data"`
		}
		if json.Unmarshal(pwdBody, &pwdResult) == nil && pwdResult.Data.ShareURL != "" {
			finalShareURL = pwdResult.Data.ShareURL
			finalExtractCode = pwdResult.Data.SharePwd
		}
	}

	if finalShareURL == "" {
		finalShareURL = fmt.Sprintf("https://pan.quark.cn/s/%s", shareID)
	}

	return &CreateShareResult{
		ShareID:     shareID,
		ShareURL:    finalShareURL,
		ExtractCode: finalExtractCode,
		ShareTitle:  title,
	}, nil
}

// CreateFolder 在指定父文件夹下创建新目录
func (s *QuarkTransferService) CreateFolder(cookie string, pdirFID string, folderName string) (*QuarkFolderItem, error) {
	if pdirFID == "" {
		pdirFID = "0"
	}
	folderName = strings.TrimSpace(folderName)
	if folderName == "" {
		return nil, errors.New("文件夹名称不能为空")
	}

	reqURL := "https://drive-pc.quark.cn/1/clouddrive/file?pr=ucpro&fr=pc"
	payload := map[string]interface{}{
		"pdir_fid":      pdirFID,
		"file_name":     folderName,
		"dir_path":      "",
		"dir_init_lock": false,
	}

	req, err := s.newRequest("POST", reqURL, payload, cookie)
	if err != nil {
		return nil, err
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	var res struct {
		Status  int    `json:"status"`
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			FID      string `json:"fid"`
			FileName string `json:"file_name"`
			Finish   bool   `json:"finish"`
		} `json:"data"`
	}
	if err := json.Unmarshal(bodyBytes, &res); err != nil {
		return nil, err
	}
	if res.Code != 0 {
		msg := res.Message
		if msg == "" {
			msg = "创建文件夹失败"
		}
		return nil, errors.New(msg)
	}

	return &QuarkFolderItem{
		FID:      res.Data.FID,
		FileName: folderName,
		Dir:      true,
	}, nil
}

// DeleteFolder 删除指定的文件夹或文件
func (s *QuarkTransferService) DeleteFolder(cookie string, fid string) error {
	fid = strings.TrimSpace(fid)
	if fid == "" || fid == "0" {
		return errors.New("无效的文件或文件夹 ID")
	}

	reqURL := "https://drive-pc.quark.cn/1/clouddrive/file/delete?pr=ucpro&fr=pc"
	payload := map[string]interface{}{
		"action_type": 1,
		"filelist":    []string{fid},
	}

	req, err := s.newRequest("POST", reqURL, payload, cookie)
	if err != nil {
		return err
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	var res struct {
		Status  int    `json:"status"`
		Code    int    `json:"code"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(bodyBytes, &res); err != nil {
		return err
	}
	if res.Code != 0 {
		msg := res.Message
		if msg == "" {
			msg = "删除失败"
		}
		return errors.New(msg)
	}
	return nil
}

// TransferAndShare 核心：自动将第三方夸克分享转存至个人网盘并生成专属新分享链接
func (s *QuarkTransferService) TransferAndShare(cookie string, targetFolderFID string, rawURL string, passcode string) (*TransferShareResult, error) {
	cookie = strings.TrimSpace(cookie)
	if cookie == "" {
		return nil, errors.New("网盘转存失败：请先在设置中配置夸克账号 Cookie")
	}

	if targetFolderFID == "" {
		targetFolderFID = "0" // 默认根目录
	}

	rawURL = strings.TrimSpace(rawURL)
	passcode = strings.TrimSpace(passcode)

	// 如果 URL 中自带 pwd=xxx，优先提取
	if passcode == "" {
		if u, err := url.Parse(rawURL); err == nil {
			passcode = u.Query().Get("pwd")
			if passcode == "" {
				passcode = u.Query().Get("passcode")
			}
		}
	}

	// 提取 pwd_id
	re := regexp.MustCompile(`/s/([a-zA-Z0-9]+)`)
	matches := re.FindStringSubmatch(rawURL)
	if len(matches) < 2 {
		return nil, errors.New("无法从提供的链接中识别夸克分享ID，请确认链接格式正确")
	}
	pwdID := matches[1]

	// 阶段 1：获取公开分享的 stoken
	tokenURL := fmt.Sprintf("https://drive-pc.quark.cn/1/clouddrive/share/sharepage/token?pr=ucpro&fr=pc&__dt=%d&__t=%d",
		rand.Intn(9000)+1000, time.Now().UnixMilli())
	tokenPayload := map[string]string{
		"pwd_id":   pwdID,
		"passcode": passcode,
	}

	tokenReq, err := s.newRequest("POST", tokenURL, tokenPayload, cookie)
	if err != nil {
		return nil, fmt.Errorf("创建凭据请求失败: %w", err)
	}

	tokenResp, err := s.client.Do(tokenReq)
	if err != nil {
		return nil, fmt.Errorf("请求夸克分享详情超时: %w", err)
	}
	defer tokenResp.Body.Close()

	tokenBody, _ := io.ReadAll(tokenResp.Body)
	var tokenResult struct {
		Status  int    `json:"status"`
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			Stoken string `json:"stoken"`
			Title  string `json:"title"`
		} `json:"data"`
	}
	if err := json.Unmarshal(tokenBody, &tokenResult); err != nil {
		return nil, errors.New("夸克凭据接口响应异常")
	}
	if tokenResult.Data.Stoken == "" {
		msg := tokenResult.Message
		if msg == "" {
			msg = "获取夸克分享凭据失败（链接可能已失效或需要提取码）"
		}
		return nil, errors.New(msg)
	}

	stoken := tokenResult.Data.Stoken
	shareTitle := tokenResult.Data.Title

	// 阶段 2：获取分享链接内的文件列表 (fid, share_fid_token)
	detailURL := fmt.Sprintf("https://drive-pc.quark.cn/1/clouddrive/share/sharepage/detail?pr=ucpro&fr=pc&pwd_id=%s&stoken=%s&pdir_fid=0&_page=1&_size=100&_sort=file_type:asc,updated_at:desc&__dt=%d&__t=%d",
		pwdID, url.QueryEscape(stoken), rand.Intn(9000)+1000, time.Now().UnixMilli())

	detailReq, err := s.newRequest("GET", detailURL, nil, cookie)
	if err != nil {
		return nil, fmt.Errorf("构建详情请求失败: %w", err)
	}

	detailResp, err := s.client.Do(detailReq)
	if err != nil {
		return nil, fmt.Errorf("获取文件详情超时: %w", err)
	}
	defer detailResp.Body.Close()

	detailBody, _ := io.ReadAll(detailResp.Body)

	type FileItem struct {
		FID           string `json:"fid"`
		FileName      string `json:"file_name"`
		FileType      string `json:"file_type"`
		FormatType    string `json:"format_type"`
		Size          int64  `json:"size"`
		Dir           bool   `json:"dir"`
		ShareFIDToken string `json:"share_fid_token"`
		UpdatedAt     int64  `json:"updated_at"`
	}

	var detailResult struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			List []FileItem `json:"list"`
		} `json:"data"`
	}

	if err := json.Unmarshal(detailBody, &detailResult); err != nil || len(detailResult.Data.List) == 0 {
		return nil, errors.New("未在源分享中找到有效文件，或文件已被原作者删除")
	}

	var fidList []string
	var fidTokenList []string
	var totalBytes int64 = 0
	primaryFileName := shareTitle
	detectedFileType := "PDF"
	hasVideo := false
	var latestTime int64 = 0

	for _, item := range detailResult.Data.List {
		fidList = append(fidList, item.FID)
		fidTokenList = append(fidTokenList, item.ShareFIDToken)
		totalBytes += item.Size
		if primaryFileName == "" {
			primaryFileName = item.FileName
		}
		if item.UpdatedAt > latestTime {
			latestTime = item.UpdatedAt
		}
		// 检测类型
		ext := strings.ToLower(item.FileName)
		if strings.Contains(ext, ".mp4") || strings.Contains(ext, ".mkv") || strings.Contains(strings.ToLower(item.FormatType), "video") {
			hasVideo = true
		} else if strings.Contains(ext, ".zip") || strings.Contains(ext, ".rar") || strings.Contains(ext, ".7z") {
			detectedFileType = "ZIP/压缩包"
		} else if strings.Contains(ext, ".docx") || strings.Contains(ext, ".doc") {
			detectedFileType = "Word/DOC"
		} else if strings.Contains(ext, ".pdf") {
			detectedFileType = "PDF"
		}
	}

	if hasVideo {
		detectedFileType = "高清视频课"
	}

	fileSizeStr := formatCapacityBytes(totalBytes)
	if totalBytes == 0 {
		fileSizeStr = "完整资源包"
	}

	fileTimeStr := time.Now().Format("2006-01-02")
	if latestTime > 0 {
		fileTimeStr = time.UnixMilli(latestTime).Format("2006-01-02")
	}

	// 阶段 3：执行转存 (Save)
	saveURL := fmt.Sprintf("https://drive-pc.quark.cn/1/clouddrive/share/sharepage/save?pr=ucpro&fr=pc&__dt=%d&__t=%d",
		rand.Intn(9000)+1000, time.Now().UnixMilli())

	savePayload := map[string]interface{}{
		"pwd_id":         pwdID,
		"stoken":         stoken,
		"fid_list":       fidList,
		"fid_token_list": fidTokenList,
		"to_pdir_fid":    targetFolderFID,
	}

	saveReq, err := s.newRequest("POST", saveURL, savePayload, cookie)
	if err != nil {
		return nil, fmt.Errorf("构建转存请求失败: %w", err)
	}

	saveResp, err := s.client.Do(saveReq)
	if err != nil {
		return nil, fmt.Errorf("提交转存请求超时: %w", err)
	}
	defer saveResp.Body.Close()

	saveBody, _ := io.ReadAll(saveResp.Body)
	var saveResult struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			TaskID string `json:"task_id"`
			SaveAs []struct {
				FID string `json:"fid"`
			} `json:"save_as"`
		} `json:"data"`
	}

	if err := json.Unmarshal(saveBody, &saveResult); err != nil {
		return nil, errors.New("解析转存响应失败")
	}

	if saveResult.Code != 0 {
		errMsg := saveResult.Message
		if errMsg == "" {
			errMsg = "夸克转存拒绝，可能容量不足或 Cookie 无权限"
		}
		return nil, fmt.Errorf("转存失败: %s", errMsg)
	}

	taskID := saveResult.Data.TaskID

	// 阶段 4：轮询转存任务状态 (最多等待 10 秒)
	if taskID != "" {
		taskCompleted := false
		for i := 0; i < 10; i++ {
			time.Sleep(800 * time.Millisecond)
			taskURL := fmt.Sprintf("https://drive-pc.quark.cn/1/clouddrive/task?pr=ucpro&fr=pc&task_id=%s&__dt=%d&__t=%d",
				taskID, rand.Intn(9000)+1000, time.Now().UnixMilli())
			taskReq, _ := s.newRequest("GET", taskURL, nil, cookie)
			taskResp, tErr := s.client.Do(taskReq)
			if tErr == nil {
				tBody, _ := io.ReadAll(taskResp.Body)
				taskResp.Body.Close()
				var taskRes struct {
					Code int `json:"code"`
					Data struct {
						Status int `json:"status"` // 2 为完成
					} `json:"data"`
				}
				if json.Unmarshal(tBody, &taskRes) == nil {
					if taskRes.Data.Status == 2 {
						taskCompleted = true
						break
					}
				}
			}
		}
		if !taskCompleted {
			// 即便异步任务轮询未返回2，有的文件较小已落库，继续尝试
		}
	}

	// 阶段 5：获取自己网盘中刚保存的目标文件 FID
	var newFids []string
	if len(saveResult.Data.SaveAs) > 0 {
		for _, sa := range saveResult.Data.SaveAs {
			newFids = append(newFids, sa.FID)
		}
	}

	// 如果 save_as 为空，从目标文件夹中查询最新创建的文件
	if len(newFids) == 0 {
		listURL := fmt.Sprintf("https://drive-pc.quark.cn/1/clouddrive/file/sort?pr=ucpro&fr=pc&pdir_fid=%s&_page=1&_size=10&_sort=created_at:desc&__dt=%d&__t=%d",
			targetFolderFID, rand.Intn(9000)+1000, time.Now().UnixMilli())
		listReq, _ := s.newRequest("GET", listURL, nil, cookie)
		if listResp, lErr := s.client.Do(listReq); lErr == nil {
			defer listResp.Body.Close()
			listBody, _ := io.ReadAll(listResp.Body)
			var listRes struct {
				Code int `json:"code"`
				Data struct {
					List []struct {
						FID      string `json:"fid"`
						FileName string `json:"file_name"`
					} `json:"list"`
				} `json:"data"`
			}
			if json.Unmarshal(listBody, &listRes) == nil && len(listRes.Data.List) > 0 {
				// 取匹配最新的一项
				newFids = append(newFids, listRes.Data.List[0].FID)
			}
		}
	}

	if len(newFids) == 0 {
		return nil, errors.New("文件已转存，但未能定位到新文件的唯一标识(FID)，请检查转存目录")
	}

	// 阶段 6：为自己网盘里的刚转存文件创建公开分享链接
	shareTitleFinal := shareTitle
	if shareTitleFinal == "" {
		shareTitleFinal = primaryFileName
	}
	if shareTitleFinal == "" {
		shareTitleFinal = "学霸资源分享"
	}

	createShareURL := fmt.Sprintf("https://drive-pc.quark.cn/1/clouddrive/share?pr=ucpro&fr=pc&__dt=%d&__t=%d",
		rand.Intn(9000)+1000, time.Now().UnixMilli())

	createSharePayload := map[string]interface{}{
		"fid_list":     newFids,
		"title":        shareTitleFinal,
		"url_type":     1, // 公开/标准分享
		"expired_type": 1, // 永久有效
		"expire_time":  0,
	}

	createReq, err := s.newRequest("POST", createShareURL, createSharePayload, cookie)
	if err != nil {
		return nil, fmt.Errorf("创建分享请求失败: %w", err)
	}

	createResp, err := s.client.Do(createReq)
	if err != nil {
		return nil, fmt.Errorf("请求创建分享超时: %w", err)
	}
	defer createResp.Body.Close()

	createBody, _ := io.ReadAll(createResp.Body)
	var createResult struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			TaskID  string `json:"task_id"`
			ShareID string `json:"share_id"`
		} `json:"data"`
	}

	if err := json.Unmarshal(createBody, &createResult); err != nil {
		return nil, errors.New("解析创建分享响应失败")
	}

	if createResult.Code != 0 {
		return nil, fmt.Errorf("生成分享失败: %s", createResult.Message)
	}

	shareID := createResult.Data.ShareID

	// 若返回了 task_id 则轮询取 share_id
	if shareID == "" && createResult.Data.TaskID != "" {
		for i := 0; i < 8; i++ {
			time.Sleep(800 * time.Millisecond)
			shareTaskURL := fmt.Sprintf("https://drive-pc.quark.cn/1/clouddrive/task?pr=ucpro&fr=pc&task_id=%s&__dt=%d&__t=%d",
				createResult.Data.TaskID, rand.Intn(9000)+1000, time.Now().UnixMilli())
			sTaskReq, _ := s.newRequest("GET", shareTaskURL, nil, cookie)
			if sTaskResp, stErr := s.client.Do(sTaskReq); stErr == nil {
				stBody, _ := io.ReadAll(sTaskResp.Body)
				sTaskResp.Body.Close()
				var stRes struct {
					Code int `json:"code"`
					Data struct {
						ShareID string `json:"share_id"`
						Status  int    `json:"status"`
					} `json:"data"`
				}
				if json.Unmarshal(stBody, &stRes) == nil && stRes.Data.ShareID != "" {
					shareID = stRes.Data.ShareID
					break
				}
			}
		}
	}

	if shareID == "" {
		return nil, errors.New("已转存成功，但未能生成分享链接唯一标识")
	}

	// 阶段 7：通过 share_id 获取最终可访问的 share_url 及 share_pwd (提取码)
	pwdURL := fmt.Sprintf("https://drive-pc.quark.cn/1/clouddrive/share/password?pr=ucpro&fr=pc&__dt=%d&__t=%d",
		rand.Intn(9000)+1000, time.Now().UnixMilli())

	pwdPayload := map[string]string{
		"share_id": shareID,
	}

	pwdReq, _ := s.newRequest("POST", pwdURL, pwdPayload, cookie)
	pwdResp, pErr := s.client.Do(pwdReq)
	if pErr != nil {
		return nil, fmt.Errorf("获取分享密码失败: %w", pErr)
	}
	defer pwdResp.Body.Close()

	pwdBody, _ := io.ReadAll(pwdResp.Body)
	var pwdResult struct {
		Code int `json:"code"`
		Data struct {
			ShareURL string `json:"share_url"`
			SharePwd string `json:"share_pwd"`
		} `json:"data"`
	}

	var finalShareURL string
	var finalExtractCode string

	if json.Unmarshal(pwdBody, &pwdResult) == nil && pwdResult.Data.ShareURL != "" {
		finalShareURL = pwdResult.Data.ShareURL
		finalExtractCode = pwdResult.Data.SharePwd
	} else {
		// 兜底分享 URL 规则
		finalShareURL = fmt.Sprintf("https://pan.quark.cn/s/%s", shareID)
	}

	desc := "转存自官方原版，支持在线极速下载"
	if hasVideo {
		desc = "全套高清音视频资源，支持在线倍速播放"
	}

	return &TransferShareResult{
		OriginalURL:     rawURL,
		NewShareURL:     finalShareURL,
		ExtractCode:     finalExtractCode,
		ShareTitle:      shareTitleFinal,
		FileName:        primaryFileName,
		FileSize:        fileSizeStr,
		FileType:        detectedFileType,
		FileTime:        fileTimeStr,
		ResourceDesc:    desc,
		SavedFID:        strings.Join(newFids, ","),
		TargetFolderFID: targetFolderFID,
	}, nil
}

func formatCapacityBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}
