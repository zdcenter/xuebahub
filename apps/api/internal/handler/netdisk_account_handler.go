package handler

import (
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"netdisk/api/internal/database"
	"netdisk/api/internal/model"
	"netdisk/api/internal/service"
)

type NetdiskAccountHandler struct {
	transferSvc *service.QuarkTransferService
}

func NewNetdiskAccountHandler(transferSvc *service.QuarkTransferService) *NetdiskAccountHandler {
	return &NetdiskAccountHandler{
		transferSvc: transferSvc,
	}
}

// NetdiskAccountDTO 供前端展示的脱敏账号对象
type NetdiskAccountDTO struct {
	ID               uuid.UUID  `json:"id"`
	DriveType        string     `json:"drive_type"`
	AccountName      string     `json:"account_name"`
	HasCookie        bool       `json:"has_cookie"`
	CookieMasked     string     `json:"cookie_masked"`
	TargetFolderFID  string     `json:"target_folder_fid"`
	TargetFolderName string     `json:"target_folder_name"`
	IsDefault        bool       `json:"is_default"`
	Nickname         string     `json:"nickname"`
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
		CookieMasked:     masked,
		TargetFolderFID:  acc.TargetFolderFID,
		TargetFolderName: acc.TargetFolderName,
		IsDefault:        acc.IsDefault,
		Nickname:         acc.Nickname,
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

	if vErr != nil {
		acc.Status = "invalid"
		acc.ErrorMessage = vErr.Error()
	} else {
		acc.Status = "valid"
		acc.Nickname = verifiedInfo.Nickname
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
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "保存账号配置失败"})
		}
	} else {
		// 如果是第一个账号，自动设为默认
		var count int64
		database.DB.Model(&model.NetdiskAccount{}).Where("drive_type = ?", acc.DriveType).Count(&count)
		if count == 0 {
			acc.IsDefault = true
		}
		if err := database.DB.Create(&acc).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "添加账号配置失败"})
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
	acc.Nickname = verifiedInfo.Nickname
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

	// 查找转存账号
	var account model.NetdiskAccount
	if req.AccountID != nil && *req.AccountID != uuid.Nil {
		if err := database.DB.First(&account, "id = ?", *req.AccountID).Error; err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "指定的网盘账号不存在"})
		}
	} else {
		// 查找默认账号
		if err := database.DB.Where("is_default = true AND status = 'valid'").First(&account).Error; err != nil {
			// 退一步找任意有效夸克账号
			if err := database.DB.Where("status = 'valid'").First(&account).Error; err != nil {
				// 再退一步找任意夸克账号
				if err := database.DB.First(&account).Error; err != nil {
					return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
						"code":    400,
						"message": "尚未配置夸克网盘账号，请先在‘网盘账号管理’中配置个人夸克 Cookie 凭据",
					})
				}
			}
		}
	}

	targetFolderFID := req.TargetFolderFID
	if targetFolderFID == "" {
		targetFolderFID = account.TargetFolderFID
	}
	if targetFolderFID == "" {
		targetFolderFID = "0"
	}

	result, err := h.transferSvc.TransferAndShare(account.Cookie, targetFolderFID, req.ShareURL, req.Passcode)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "恭喜！文件已自动转存到您的夸克网盘并生成全新专属分享链！",
		"data":    result,
	})
}
