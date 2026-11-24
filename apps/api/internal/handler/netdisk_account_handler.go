package handler

import (
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/datatypes"

	"netdisk/api/internal/database"
	"netdisk/api/internal/model"
	"netdisk/api/internal/service"
)

type NetdiskAccountHandler struct {
	transferSvc *service.QuarkTransferService
	smartMeta   *service.SmartMetaService
	crawlerSvc  *service.TelegramCrawlerService
}

func NewNetdiskAccountHandler(transferSvc *service.QuarkTransferService, smartMeta *service.SmartMetaService, crawlerSvc *service.TelegramCrawlerService) *NetdiskAccountHandler {
	return &NetdiskAccountHandler{
		transferSvc: transferSvc,
		smartMeta:   smartMeta,
		crawlerSvc:  crawlerSvc,
	}
}

// NetdiskAccountDTO 供前端展示的脱敏账号对象
type NetdiskAccountDTO struct {
	ID               uuid.UUID  `json:"id"`
	DriveType        string     `json:"drive_type"`
	AccountName      string     `json:"account_name"`
	HasCookie        bool       `json:"has_cookie"`
	Cookie           string     `json:"cookie"`
	CookieMasked     string     `json:"cookie_masked"`
	TargetFolderFID  string     `json:"target_folder_fid"`
	TargetFolderName string     `json:"target_folder_name"`
	IsDefault        bool       `json:"is_default"`
	Nickname         string     `json:"nickname"`
	UID              string     `json:"uid"`
	TotalCapacity    string     `json:"total_capacity"`
	UsedCapacity     string     `json:"used_capacity"`
	FreeCapacity     string     `json:"free_capacity"`
	IsOverQuota      bool       `json:"is_over_quota"`
	Status           string     `json:"status"`
	ErrorMessage     string     `json:"error_message"`
	LastVerifiedAt   *time.Time `json:"last_verified_at"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

func isAllDigits(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func toDTO(acc model.NetdiskAccount) NetdiskAccountDTO {
	masked := ""
	if len(acc.Cookie) > 12 {
		masked = acc.Cookie[:6] + "..." + acc.Cookie[len(acc.Cookie)-6:]
	} else if len(acc.Cookie) > 0 {
		masked = "******"
	}
	isOver := strings.Contains(acc.FreeCapacity, "超限") || strings.Contains(acc.FreeCapacity, "超额") || strings.Contains(acc.ErrorMessage, "超限")
	return NetdiskAccountDTO{
		ID:               acc.ID,
		DriveType:        acc.DriveType,
		AccountName:      acc.AccountName,
		HasCookie:        acc.Cookie != "",
		Cookie:           acc.Cookie,
		CookieMasked:     masked,
		TargetFolderFID:  acc.TargetFolderFID,
		TargetFolderName: acc.TargetFolderName,
		IsDefault:        acc.IsDefault,
		Nickname:         acc.Nickname,
		UID:              acc.UID,
		TotalCapacity:    acc.TotalCapacity,
		UsedCapacity:     acc.UsedCapacity,
		FreeCapacity:     acc.FreeCapacity,
		IsOverQuota:      isOver,
		Status:           acc.Status,
		ErrorMessage:     acc.ErrorMessage,
		LastVerifiedAt:   acc.LastVerifiedAt,
		CreatedAt:        acc.CreatedAt,
		UpdatedAt:        acc.UpdatedAt,
	}
}

// ListAccounts 获取所有已配置的网盘账号列表
func (h *NetdiskAccountHandler) ListAccounts(c fiber.Ctx) error {
	var accounts []model.NetdiskAccount
	database.DB.Order("is_default DESC, created_at DESC").Find(&accounts)

	dtos := make([]NetdiskAccountDTO, len(accounts))
	for i, acc := range accounts {
		dtos[i] = toDTO(acc)
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": dtos,
	})
}

type SaveAccountRequest struct {
	ID               *uuid.UUID `json:"id"`
	DriveType        string     `json:"drive_type"` // quark
	AccountName      string     `json:"account_name"`
	Cookie           string     `json:"cookie"`
	TargetFolderFID  string     `json:"target_folder_fid"`
	TargetFolderName string     `json:"target_folder_name"`
	IsDefault        bool       `json:"is_default"`
	Nickname         string     `json:"nickname"`
	UID              string     `json:"uid"`
}

// SaveAccount 新增或修改网盘账号（自动连通验证与容量刷新）
func (h *NetdiskAccountHandler) SaveAccount(c fiber.Ctx) error {
	var req SaveAccountRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "参数解析失败",
		})
	}

	req.AccountName = strings.TrimSpace(req.AccountName)
	if req.AccountName == "" {
		req.AccountName = "我的夸克网盘"
	}
	if req.DriveType == "" {
		req.DriveType = "quark"
	}
	if req.TargetFolderFID == "" {
		req.TargetFolderFID = "0"
	}
	if req.TargetFolderName == "" {
		req.TargetFolderName = "/"
	}

	var acc model.NetdiskAccount
	isUpdate := false

	if req.ID != nil && *req.ID != uuid.Nil {
		if err := database.DB.First(&acc, "id = ?", *req.ID).Error; err == nil {
			isUpdate = true
		}
	}

	cookieToVerify := strings.TrimSpace(req.Cookie)
	if cookieToVerify == "" && isUpdate {
		cookieToVerify = acc.Cookie
	}

	if cookieToVerify == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "请填写有效的网盘 Cookie 凭据",
		})
	}

	// 立即测试验证 Cookie 有效性并提取账号昵称和容量
	verifiedInfo, vErr := h.transferSvc.VerifyCookie(cookieToVerify)
	now := time.Now()

	acc.DriveType = req.DriveType
	acc.AccountName = req.AccountName
	acc.Cookie = cookieToVerify
	acc.TargetFolderFID = req.TargetFolderFID
	acc.TargetFolderName = req.TargetFolderName
	acc.IsDefault = req.IsDefault
	acc.LastVerifiedAt = &now

	if req.Nickname != "" {
		acc.Nickname = strings.TrimSpace(req.Nickname)
	}

	if req.UID != "" {
		acc.UID = strings.TrimSpace(req.UID)
	} else if verifiedInfo != nil && verifiedInfo.UID != "" {
		acc.UID = verifiedInfo.UID
	}

	if vErr != nil {
		acc.Status = "invalid"
		acc.ErrorMessage = vErr.Error()
	} else {
		acc.Status = "valid"
		if verifiedInfo.Nickname != "" {
			acc.Nickname = verifiedInfo.Nickname
		} else if strings.Contains(acc.Nickname, "转存剩余") || strings.Contains(acc.Nickname, "夸克用户") || strings.Contains(acc.Nickname, "夸克普通用户") {
			// 若接口未返回真实昵称，且当前是旧版占位名，自动清理为空，绝不假造
			acc.Nickname = ""
		}
		// 若获取到了真实数字 UID，自动同步
		if verifiedInfo.UID != "" {
			acc.UID = verifiedInfo.UID
		} else if !isAllDigits(acc.UID) {
			// 若当前保留的是旧版非数字密文字符串（如 AARr...），清理掉，避免误导
			acc.UID = ""
		}
		acc.TotalCapacity = verifiedInfo.TotalCapacity
		acc.UsedCapacity = verifiedInfo.UsedCapacity
		acc.FreeCapacity = verifiedInfo.FreeCapacity
		if verifiedInfo.IsOverQuota {
			acc.ErrorMessage = fmt.Sprintf("空间已超限 (已占用 %s / 配额 %s)，请注意清理或扩容", verifiedInfo.UsedCapacity, verifiedInfo.TotalCapacity)
		} else {
			acc.ErrorMessage = ""
		}
	}

	// 如果设为默认，将其他同类型账号的 is_default 置为 false
	if acc.IsDefault {
		database.DB.Model(&model.NetdiskAccount{}).
			Where("drive_type = ?", acc.DriveType).
			Update("is_default", false)
	}

	if isUpdate {
		if err := database.DB.Save(&acc).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"code":    500,
				"message": "保存账号配置失败: " + err.Error(),
			})
		}
	} else {
		// 如果是第一个账号，自动设为默认
		var count int64
		database.DB.Model(&model.NetdiskAccount{}).Where("drive_type = ?", acc.DriveType).Count(&count)
		if count == 0 {
			acc.IsDefault = true
		}
		if err := database.DB.Create(&acc).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"code":    500,
				"message": "添加账号配置失败: " + err.Error(),
			})
		}
	}

	msg := "网盘账号保存成功并已连通！"
	if acc.Status == "invalid" {
		msg = "账号已保存，但验证提示: " + acc.ErrorMessage
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": msg,
		"data":    toDTO(acc),
	})
}

// SetDefaultAccount 一键激活并设为默认转存账号
func (h *NetdiskAccountHandler) SetDefaultAccount(c fiber.Ctx) error {
	idStr := c.Params("id")
	accUUID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效账号ID"})
	}

	var targetAcc model.NetdiskAccount
	if err := database.DB.First(&targetAcc, "id = ?", accUUID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "账号不存在"})
	}

	// 将所有同类型账号的 is_default 置为 false
	database.DB.Model(&model.NetdiskAccount{}).
		Where("drive_type = ?", targetAcc.DriveType).
		Update("is_default", false)

	// 将当前账号设为 true
	targetAcc.IsDefault = true
	database.DB.Model(&targetAcc).Update("is_default", true)

	return c.JSON(fiber.Map{
		"code":    200,
		"message": fmt.Sprintf("已成功将【%s】激活为默认网盘账号", targetAcc.AccountName),
		"data":    toDTO(targetAcc),
	})
}

// DeleteAccount 删除网盘账号
func (h *NetdiskAccountHandler) DeleteAccount(c fiber.Ctx) error {
	idStr := c.Params("id")
	accUUID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效账号ID"})
	}

	if err := database.DB.Delete(&model.NetdiskAccount{}, "id = ?", accUUID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "删除失败"})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "账号已删除",
	})
}

// VerifyAccount 手动检测并刷新账号状态与容量
func (h *NetdiskAccountHandler) VerifyAccount(c fiber.Ctx) error {
	idStr := c.Params("id")
	accUUID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效账号ID"})
	}

	var acc model.NetdiskAccount
	if err := database.DB.First(&acc, "id = ?", accUUID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "账号不存在"})
	}

	verifiedInfo, err := h.transferSvc.VerifyCookie(acc.Cookie)
	now := time.Now()
	acc.LastVerifiedAt = &now

	if err != nil {
		acc.Status = "invalid"
		acc.ErrorMessage = err.Error()
		database.DB.Save(&acc)
		return c.JSON(fiber.Map{
			"code":    200,
			"message": "验证失败：" + err.Error(),
			"data":    toDTO(acc),
		})
	}

	acc.Status = "valid"
	if verifiedInfo.Nickname != "" {
		acc.Nickname = verifiedInfo.Nickname
	} else if strings.Contains(acc.Nickname, "转存剩余") || strings.Contains(acc.Nickname, "夸克用户") || strings.Contains(acc.Nickname, "夸克普通用户") {
		// 若接口未返回真实昵称，且当前是旧版占位名，自动清理为空，绝不假造
		acc.Nickname = ""
	}
	if verifiedInfo.UID != "" {
		acc.UID = verifiedInfo.UID
	} else if !isAllDigits(acc.UID) {
		acc.UID = ""
	}
	acc.TotalCapacity = verifiedInfo.TotalCapacity
	acc.UsedCapacity = verifiedInfo.UsedCapacity
	acc.FreeCapacity = verifiedInfo.FreeCapacity
	if verifiedInfo.IsOverQuota {
		acc.ErrorMessage = fmt.Sprintf("空间已超限 (已占用 %s / 配额 %s)，请注意清理或扩容", verifiedInfo.UsedCapacity, verifiedInfo.TotalCapacity)
	} else {
		acc.ErrorMessage = ""
	}
	database.DB.Save(&acc)

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "连通验证成功！容量数据已刷新",
		"data":    toDTO(acc),
	})
}

// VerifyAllAccounts 一键检测所有账号状态与容量
func (h *NetdiskAccountHandler) VerifyAllAccounts(c fiber.Ctx) error {
	count := h.verifyAllAccountsInternal()
	return c.JSON(fiber.Map{
		"code":    200,
		"message": fmt.Sprintf("已成功完成对 %d 个网盘账号的状态心跳与容量检测", count),
	})
}

// StartHeartbeatRoutine 启动后台心跳定时器
func (h *NetdiskAccountHandler) StartHeartbeatRoutine(interval time.Duration) {
	time.Sleep(15 * time.Second)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	h.verifyAllAccountsInternal()

	for range ticker.C {
		h.verifyAllAccountsInternal()
	}
}

func (h *NetdiskAccountHandler) verifyAllAccountsInternal() int {
	var accounts []model.NetdiskAccount
	if err := database.DB.Where("cookie != ''").Find(&accounts).Error; err != nil {
		return 0
	}

	for _, acc := range accounts {
		prevStatus := acc.Status
		verifiedInfo, err := h.transferSvc.VerifyCookie(acc.Cookie)
		now := time.Now()
		acc.LastVerifiedAt = &now
		if err != nil {
			acc.Status = "expired"
			acc.ErrorMessage = err.Error()

			// 如果账号从可用变为失效，触发系统即时预警
			if prevStatus == "valid" && h.crawlerSvc != nil {
				alertMsg := fmt.Sprintf("⚠️ <b>【学霸网·网盘账号异常告警】</b>\n网盘账号 <b>%s</b> Cookie 已失效或已过期！\n报错详情: %s\n👉 请尽快登录管理后台更新 Cookie 凭据以确保转存正常运行！", acc.AccountName, err.Error())
				go h.crawlerSvc.SendAdminNotification(alertMsg)
			}
		} else {
			acc.Status = "valid"
			if verifiedInfo.Nickname != "" {
				acc.Nickname = verifiedInfo.Nickname
			} else if strings.Contains(acc.Nickname, "转存剩余") || strings.Contains(acc.Nickname, "夸克用户") || strings.Contains(acc.Nickname, "夸克普通用户") {
				acc.Nickname = ""
			}
			if verifiedInfo.UID != "" {
				acc.UID = verifiedInfo.UID
			} else if !isAllDigits(acc.UID) {
				acc.UID = ""
			}
			acc.TotalCapacity = verifiedInfo.TotalCapacity
			acc.UsedCapacity = verifiedInfo.UsedCapacity
			acc.FreeCapacity = verifiedInfo.FreeCapacity
			if verifiedInfo.IsOverQuota {
				acc.ErrorMessage = fmt.Sprintf("空间已超限 (已占用 %s / 配额 %s)，请及时扩容或清理", verifiedInfo.UsedCapacity, verifiedInfo.TotalCapacity)
				if h.crawlerSvc != nil {
					alertMsg := fmt.Sprintf("⚠️ <b>【学霸网·夸克网盘容量告警】</b>\n网盘账号 <b>%s</b> %s", acc.AccountName, acc.ErrorMessage)
					go h.crawlerSvc.SendAdminNotification(alertMsg)
				}
			} else {
				acc.ErrorMessage = ""
			}
		}
		database.DB.Save(&acc)
	}
	return len(accounts)
}

// ListFolders 查询指定网盘账号中的文件夹列表
func (h *NetdiskAccountHandler) ListFolders(c fiber.Ctx) error {
	idStr := c.Params("id")
	accUUID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效账号ID"})
	}

	var acc model.NetdiskAccount
	if err := database.DB.First(&acc, "id = ?", accUUID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "账号不存在"})
	}

	pdirFID := c.Query("pdir_fid", "0")
	folders, err := h.transferSvc.ListFolders(acc.Cookie, pdirFID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "获取网盘目录失败：" + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": folders,
	})
}

type CreateFolderRequest struct {
	PdirFID    string `json:"pdir_fid"`
	FolderName string `json:"folder_name"`
}

// CreateFolder 在指定网盘账号下新建文件夹
func (h *NetdiskAccountHandler) CreateFolder(c fiber.Ctx) error {
	idStr := c.Params("id")
	accUUID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效账号ID"})
	}

	var acc model.NetdiskAccount
	if err := database.DB.First(&acc, "id = ?", accUUID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "账号不存在"})
	}

	var req CreateFolderRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "请求参数解析失败"})
	}

	folder, err := h.transferSvc.CreateFolder(acc.Cookie, req.PdirFID, req.FolderName)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "创建文件夹失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "文件夹创建成功",
		"data":    folder,
	})
}

// DeleteFolder 删除指定网盘账号下的文件夹或文件
func (h *NetdiskAccountHandler) DeleteFolder(c fiber.Ctx) error {
	idStr := c.Params("id")
	accUUID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "无效账号ID"})
	}

	fid := c.Params("fid")
	if fid == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "缺少文件夹ID"})
	}

	var acc model.NetdiskAccount
	if err := database.DB.First(&acc, "id = ?", accUUID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "账号不存在"})
	}

	if err := h.transferSvc.DeleteFolder(acc.Cookie, fid); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "删除文件夹失败: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "文件夹已成功删除",
	})
}

type AutoTransferRequest struct {
	AccountID       *uuid.UUID `json:"account_id"`
	ShareURL        string     `json:"share_url"`
	Passcode        string     `json:"passcode"`
	TargetFolderFID string     `json:"target_folder_fid"`
}

// AutoTransferAndShare 核心：自动将第三方分享链接转存到我的网盘并生成专属新链接
func (h *NetdiskAccountHandler) AutoTransferAndShare(c fiber.Ctx) error {
	var req AutoTransferRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "请求参数解析失败",
		})
	}

	req.ShareURL = strings.TrimSpace(req.ShareURL)
	if req.ShareURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "源分享链接不能为空",
		})
	}

	// 查找转存候选账号
	var candidateAccounts []model.NetdiskAccount
	if req.AccountID != nil && *req.AccountID != uuid.Nil {
		var single model.NetdiskAccount
		if err := database.DB.First(&single, "id = ?", *req.AccountID).Error; err == nil {
			candidateAccounts = append(candidateAccounts, single)
		}
	} else {
		database.DB.Where("cookie != '' AND (status = 'valid' OR status IS NULL OR status = '')").
			Order("is_default desc, updated_at desc").Find(&candidateAccounts)
		if len(candidateAccounts) == 0 {
			database.DB.Where("cookie != ''").Find(&candidateAccounts)
		}
	}

	if len(candidateAccounts) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "尚未配置夸克网盘账号，请先在‘网盘账号管理’中配置个人夸克 Cookie 凭据",
		})
	}

	var lastErr error
	var result *service.TransferShareResult
	var usedAccount model.NetdiskAccount

	// 自动轮询执行转存（具备多账号故障转移）
	for _, acc := range candidateAccounts {
		targetFolderFID := req.TargetFolderFID
		if targetFolderFID == "" {
			targetFolderFID = acc.TargetFolderFID
		}
		if targetFolderFID == "" {
			targetFolderFID = "0"
		}

		res, err := h.transferSvc.TransferAndShare(acc.Cookie, targetFolderFID, req.ShareURL, req.Passcode)
		if err == nil && res != nil {
			result = res
			usedAccount = acc
			break
		}
		lastErr = err
		log.Printf("[AutoTransferAndShare] Account %s transfer failed: %v, trying next candidate...", acc.AccountName, err)
	}

	if result == nil {
		errMsg := "所有可用网盘账号转存均失败"
		if lastErr != nil {
			errMsg += "：" + lastErr.Error()
		}
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": errMsg,
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": fmt.Sprintf("恭喜！文件已自动通过账号 [%s] 转存到网盘并生成全新专属推广链！", usedAccount.AccountName),
		"data":    result,
	})
}

type BatchImportQuarkFolderRequest struct {
	AccountID   *uuid.UUID `json:"account_id"`
	PdirFID     string     `json:"pdir_fid"` // 目标文件夹 fid
	FIDs        []string   `json:"fids"`     // 可选，指定要导入的 fid 列表；留空则导入整目录下的全部文件/文件夹
	AutoPublish *bool      `json:"auto_publish"`
	ChannelSlug string     `json:"channel_slug"`
}

// AdminBatchImportQuarkFolder 将夸克网盘指定目录下的文件一键批量生成分享链并上架为网站资源
func (h *NetdiskAccountHandler) AdminBatchImportQuarkFolder(c fiber.Ctx) error {
	var req BatchImportQuarkFolderRequest
	if err := c.Bind().JSON(&req); err != nil {
		req.PdirFID = "0"
	}

	autoPublish := true
	if req.AutoPublish != nil {
		autoPublish = *req.AutoPublish
	}

	var account model.NetdiskAccount
	if req.AccountID != nil && *req.AccountID != uuid.Nil {
		if err := database.DB.First(&account, "id = ?", *req.AccountID).Error; err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "指定的网盘账号不存在"})
		}
	} else {
		if err := database.DB.Where("is_default = true AND cookie != ''").First(&account).Error; err != nil {
			if err := database.DB.Where("cookie != ''").Order("is_default desc, updated_at desc").First(&account).Error; err != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"code":    400,
					"message": "尚未配置有效的夸克网盘账号凭证",
				})
			}
		}
	}

	pdirFID := req.PdirFID
	if pdirFID == "" {
		pdirFID = "0"
	}

	items, err := h.transferSvc.ListItems(account.Cookie, pdirFID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "读取网盘目录失败：" + err.Error(),
		})
	}

	filterSet := make(map[string]bool)
	for _, f := range req.FIDs {
		filterSet[f] = true
	}

	targetChannel := req.ChannelSlug
	if targetChannel == "" {
		targetChannel = "edu"
	}

	importedCount := 0
	failedCount := 0

	for _, item := range items {
		if len(filterSet) > 0 && !filterSet[item.FID] {
			continue
		}

		// 为该文件/目录在夸克网盘中生成永久公开分享链接
		shareResult, err := h.transferSvc.CreateShareForFID(account.Cookie, item.FID, item.FileName)
		if err != nil || shareResult == nil || shareResult.ShareURL == "" {
			log.Printf("[BatchImportQuarkFolder] Failed to create share for FID %s (%s): %v", item.FID, item.FileName, err)
			failedCount++
			continue
		}

		// 智能推断学科、学段、年级
		meta := h.smartMeta.InferMeta(item.FileName)

		resID := uuid.New()
		slug := fmt.Sprintf("res-%d-%s", time.Now().UnixNano(), uuid.New().String()[:8])
		chSlug := targetChannel
		if meta.ChannelSlug == "book" {
			chSlug = "book"
		}

		fileSizeStr := item.SizeDesc
		if fileSizeStr == "" || fileSizeStr == "0 B" {
			fileSizeStr = "完整教学包"
		}

		newRes := model.Resource{
			ID:          resID,
			Slug:        slug,
			ChannelSlug: chSlug,
			Title:       meta.PolishedTitle,
			Subtitle:    meta.Subtitle,
			Description: meta.Description,
			Stage:       meta.Stage,
			Grade:       meta.Grade,
			Term:        meta.Term,
			Subject:     meta.Subject,
			Edition:     meta.Edition,
			FileType:    "PDF",
			FileSize:    fileSizeStr,
			IsPublished: autoPublish,
			FileTree:    datatypes.JSON([]byte("[]")),
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}

		newLink := model.ResourceLink{
			ID:           uuid.New(),
			ResourceID:   resID,
			AccountID:    &account.ID,
			AccountName:  account.AccountName,
			DriveType:    "quark",
			ShareURL:     shareResult.ShareURL,
			ExtractCode:  shareResult.ExtractCode,
			IsPrimary:    true,
			Status:       "active",
			FileSize:     fileSizeStr,
			FileType:     "PDF",
			ResourceDesc: "夸克官方高速免密通道",
			CreatedAt:    time.Now(),
			UpdatedAt:    time.Now(),
		}
		newRes.Links = []model.ResourceLink{newLink}

		if err := database.DB.Create(&newRes).Error; err != nil {
			log.Printf("[BatchImportQuarkFolder] Failed to save resource %s: %v", item.FileName, err)
			failedCount++
			continue
		}
		importedCount++
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": fmt.Sprintf("网盘目录上架完成！成功录入 %d 条资料，失败 %d 条", importedCount, failedCount),
		"data": fiber.Map{
			"imported_count": importedCount,
			"failed_count":   failedCount,
		},
	})
}

// ListDefaultAccountFiles 获取默认夸克网盘账号的文件与文件夹列表（支持按 pdir_fid 下钻）
func (h *NetdiskAccountHandler) ListDefaultAccountFiles(c fiber.Ctx) error {
	var account model.NetdiskAccount
	// 查找默认账号
	if err := database.DB.Where("is_default = true AND cookie != ''").First(&account).Error; err != nil {
		if err := database.DB.Where("cookie != ''").Order("is_default desc, updated_at desc").First(&account).Error; err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"code":    400,
				"message": "尚未配置夸克网盘账号或 Cookie 为空，请先在‘网盘账号管理’中配置个人夸克 Cookie 凭据",
			})
		}
	}

	pdirFID := c.Query("pdir_fid", "0")
	items, err := h.transferSvc.ListItems(account.Cookie, pdirFID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "读取网盘目录失败：" + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"account_id":   account.ID,
			"account_name": account.AccountName,
			"nickname":     account.Nickname,
			"pdir_fid":     pdirFID,
			"items":        items,
		},
	})
}

type CreateShareRequest struct {
	FID   string `json:"fid"`
	Title string `json:"title"`
}

// CreateShareFromDefaultAccount 在默认夸克网盘账号中为指定文件/文件夹一键生成永久公开分享链接
func (h *NetdiskAccountHandler) CreateShareFromDefaultAccount(c fiber.Ctx) error {
	var req CreateShareRequest
	if err := c.Bind().Body(&req); err != nil || strings.TrimSpace(req.FID) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "请指定要分享的文件或文件夹 fid",
		})
	}

	var account model.NetdiskAccount
	if err := database.DB.Where("is_default = true AND cookie != ''").First(&account).Error; err != nil {
		if err := database.DB.Where("cookie != ''").Order("is_default desc, updated_at desc").First(&account).Error; err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"code":    400,
				"message": "尚未配置有效的夸克网盘账号凭证",
			})
		}
	}

	result, err := h.transferSvc.CreateShareForFID(account.Cookie, req.FID, req.Title)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "创建分享链接失败：" + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "分享创建成功！永久有效且无提取码",
		"data":    result,
	})
}
