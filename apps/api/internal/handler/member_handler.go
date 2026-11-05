package handler

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/datatypes"

	"netdisk/api/internal/config"
	"netdisk/api/internal/database"
	"netdisk/api/internal/model"
)

type MemberHandler struct {
	cfg *config.Config
}

func NewMemberHandler(cfg *config.Config) *MemberHandler {
	return &MemberHandler{cfg: cfg}
}

// ==========================================
// 辅助工具函数
// ==========================================

// getClientIP 安全提取客户端 IP
func (h *MemberHandler) getClientIP(c fiber.Ctx) string {
	ip := c.Get("CF-Connecting-IP")
	if ip == "" {
		ip = c.Get("X-Forwarded-For")
		if ip != "" {
			parts := strings.Split(ip, ",")
			ip = strings.TrimSpace(parts[0])
		}
	}
	if ip == "" {
		ip = c.IP()
	}
	if ip == "" {
		ip = "127.0.0.1"
	}
	return ip
}

// parseFrontUserClaims 从 Authorization 标头中尝试解析前台用户 JWT
func (h *MemberHandler) parseFrontUserClaims(c fiber.Ctx) (uuid.UUID, string, bool) {
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		return uuid.Nil, "", false
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return uuid.Nil, "", false
	}
	tokenString := strings.TrimSpace(parts[1])

	token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fiber.ErrUnauthorized
		}
		return []byte(h.cfg.JWTSecret), nil
	})
	if err != nil || !token.Valid {
		return uuid.Nil, "", false
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return uuid.Nil, "", false
	}

	// 验证必须是前台用户令牌
	tokenType, _ := claims["typ"].(string)
	if tokenType != "front_user" {
		return uuid.Nil, "", false
	}

	subStr, _ := claims["sub"].(string)
	username, _ := claims["username"].(string)
	uid, err := uuid.Parse(subStr)
	if err != nil {
		return uuid.Nil, "", false
	}
	return uid, username, true
}

// generateCodeString 生成可读且防伪的卡密字符串，形如 XBW-A8B9-7C2D-E1F4
func generateCodeString() string {
	bytes := make([]byte, 6)
	_, _ = rand.Read(bytes)
	hexStr := strings.ToUpper(hex.EncodeToString(bytes)) // 12 字符
	return fmt.Sprintf("XBW-%s-%s-%s", hexStr[0:4], hexStr[4:8], hexStr[8:12])
}

// ==========================================
// 前台公开端 API
// ==========================================

// Register 用户轻量注册
func (h *MemberHandler) Register(c fiber.Ctx) error {
	type RegisterReq struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Email    string `json:"email"`
		Nickname string `json:"nickname"`
	}
	var req RegisterReq
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "请求参数无效"})
	}

	req.Username = strings.TrimSpace(req.Username)
	req.Password = strings.TrimSpace(req.Password)
	if len(req.Username) < 3 || len(req.Username) > 30 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "用户名长度需在 3~30 个字符之间"})
	}
	if len(req.Password) < 6 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "密码长度不能少于 6 位"})
	}

	var count int64
	database.DB.Model(&model.FrontUser{}).Where("username = ?", req.Username).Count(&count)
	if count > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "该用户名已被注册，请尝试其他用户名或直接登录"})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "密码加密异常"})
	}

	// 查找新注册默认角色
	var defaultLvl model.MemberLevel
	if err := database.DB.Where("is_default = true AND is_enabled = true").First(&defaultLvl).Error; err != nil {
		defaultLvl.ID = "user"
	}

	nickname := strings.TrimSpace(req.Nickname)
	if nickname == "" {
		nickname = req.Username
	}

	now := time.Now()
	ip := h.getClientIP(c)
	newUser := model.FrontUser{
		Username:     req.Username,
		PasswordHash: string(hash),
		Nickname:     nickname,
		Email:        strings.TrimSpace(req.Email),
		LevelID:      defaultLvl.ID,
		IsActive:     true,
		LastLoginAt:  &now,
		LastLoginIP:  ip,
	}

	if err := database.DB.Create(&newUser).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "创建用户失败"})
	}

	// 签发 JWT
	claims := jwt.MapClaims{
		"sub":      newUser.ID.String(),
		"username": newUser.Username,
		"typ":      "front_user",
		"exp":      time.Now().Add(time.Hour * 24 * 30).Unix(), // 30 天有效
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, _ := token.SignedString([]byte(h.cfg.JWTSecret))

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "注册成功，已自动登录",
		"data": fiber.Map{
			"token": tokenString,
			"user": fiber.Map{
				"id":            newUser.ID,
				"username":      newUser.Username,
				"nickname":      newUser.Nickname,
				"level_id":      newUser.LevelID,
				"vip_expire_at": newUser.VipExpireAt,
			},
		},
	})
}

// Login 用户登录
func (h *MemberHandler) Login(c fiber.Ctx) error {
	type LoginReq struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	var req LoginReq
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "请求格式错误"})
	}

	req.Username = strings.TrimSpace(req.Username)
	var user model.FrontUser
	if err := database.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"code": 401, "message": "账号或密码错误"})
	}

	if !user.IsActive {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"code": 403, "message": "该账号已被停用，请联系客服"})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"code": 401, "message": "账号或密码错误"})
	}

	now := time.Now()
	user.LastLoginAt = &now
	user.LastLoginIP = h.getClientIP(c)
	database.DB.Save(&user)

	claims := jwt.MapClaims{
		"sub":      user.ID.String(),
		"username": user.Username,
		"typ":      "front_user",
		"exp":      time.Now().Add(time.Hour * 24 * 30).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, _ := token.SignedString([]byte(h.cfg.JWTSecret))

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "登录成功",
		"data": fiber.Map{
			"token": tokenString,
			"user": fiber.Map{
				"id":            user.ID,
				"username":      user.Username,
				"nickname":      user.Nickname,
				"level_id":      user.LevelID,
				"vip_expire_at": user.VipExpireAt,
			},
		},
	})
}

// GetMe 获取当前登录用户画像及等级详情
func (h *MemberHandler) GetMe(c fiber.Ctx) error {
	uid, _, ok := h.parseFrontUserClaims(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"code": 401, "message": "未登录"})
	}

	var user model.FrontUser
	if err := database.DB.Preload("Level").Where("id = ?", uid).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "用户不存在"})
	}

	// 自动检查 VIP 是否已过期，若过期则降级显示普通会员
	effectiveLevelID := user.LevelID
	if user.VipExpireAt != nil && user.VipExpireAt.Before(time.Now()) && effectiveLevelID != "vip_lifetime" {
		effectiveLevelID = "user"
	}

	var lvl model.MemberLevel
	if err := database.DB.Where("id = ?", effectiveLevelID).First(&lvl).Error; err != nil {
		lvl = model.MemberLevel{
			ID:         "user",
			Name:       "普通会员",
			DailyQuota: 15,
			BadgeText:  "注册会员",
			Color:      "blue",
		}
	}

	// 统计今日已用额度
	today := time.Now().Format("2006-01-02")
	ident := fmt.Sprintf("uid:%s", user.ID.String())
	var quotaLog model.DailyQuotaLog
	database.DB.Where("identifier = ? AND quota_date = ?", ident, today).First(&quotaLog)

	remain := lvl.DailyQuota - quotaLog.UsedCount
	if lvl.DailyQuota == -1 {
		remain = -1
	} else if remain < 0 {
		remain = 0
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"id":            user.ID,
			"username":      user.Username,
			"nickname":      user.Nickname,
			"email":         user.Email,
			"level_id":      lvl.ID,
			"level_name":    lvl.Name,
			"badge_text":    lvl.BadgeText,
			"color":         lvl.Color,
			"daily_quota":   lvl.DailyQuota,
			"used_count":    quotaLog.UsedCount,
			"remain_quota":  remain,
			"is_unlimited":  lvl.DailyQuota == -1,
			"vip_expire_at": user.VipExpireAt,
			"is_vip_active": user.VipExpireAt != nil && user.VipExpireAt.After(time.Now()),
		},
	})
}

// GetQuotaStatus 查询当前用户/访客的额度状态与特定资源解锁情况
func (h *MemberHandler) GetQuotaStatus(c fiber.Ctx) error {
	resourceSlug := strings.TrimSpace(c.Query("slug"))

	// 1. 获取站点全局设置
	var siteSetting model.SiteSetting
	database.DB.Where("id = ?", "global").First(&siteSetting)

	today := time.Now().Format("2006-01-02")
	uid, _, isLogin := h.parseFrontUserClaims(c)

	var ident string
	var levelID string
	var vipExpireAt *time.Time
	var username string

	if isLogin {
		var user model.FrontUser
		if err := database.DB.Where("id = ?", uid).First(&user).Error; err == nil {
			username = user.Username
			levelID = user.LevelID
			vipExpireAt = user.VipExpireAt
			// VIP 过期检查
			if vipExpireAt != nil && vipExpireAt.Before(time.Now()) && levelID != "vip_lifetime" {
				levelID = "user"
			}
		} else {
			levelID = "user"
		}
		ident = fmt.Sprintf("uid:%s", uid.String())
	} else {
		levelID = "guest"
		clientIP := h.getClientIP(c)
		ident = fmt.Sprintf("ip:%s", clientIP)
	}

	var lvl model.MemberLevel
	if err := database.DB.Where("id = ?", levelID).First(&lvl).Error; err != nil {
		lvl = model.MemberLevel{
			ID:         levelID,
			Name:       "访客",
			DailyQuota: 5,
			BadgeText:  "访客",
			Color:      "slate",
		}
	}

	var quotaLog model.DailyQuotaLog
	database.DB.Where("identifier = ? AND quota_date = ?", ident, today).First(&quotaLog)

	// 判断当前资源是否已被当前用户/访客解锁
	isUnlocked := false
	if resourceSlug != "" && len(quotaLog.UnlockedResourceIDs) > 0 {
		jsonStr := string(quotaLog.UnlockedResourceIDs)
		if strings.Contains(jsonStr, fmt.Sprintf(`"%s"`, resourceSlug)) {
			isUnlocked = true
		}
	}

	remain := lvl.DailyQuota - quotaLog.UsedCount
	if lvl.DailyQuota == -1 {
		remain = -1
	} else if remain < 0 {
		remain = 0
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"enabled":            siteSetting.MemberSystemEnabled,
			"is_authenticated":   isLogin,
			"username":           username,
			"level_id":           lvl.ID,
			"level_name":         lvl.Name,
			"badge_text":         lvl.BadgeText,
			"color":              lvl.Color,
			"daily_quota":        lvl.DailyQuota,
			"used_count":         quotaLog.UsedCount,
			"remain_quota":       remain,
			"is_unlimited":       lvl.DailyQuota == -1,
			"is_unlocked":        isUnlocked,
			"vip_expire_at":      vipExpireAt,
			"taobao_shop_url":    siteSetting.TaobaoShopURL,
			"quota_notice_text":  siteSetting.QuotaNoticeText,
		},
	})
}

// ConsumeQuota 获取/直达资源时扣减额度（同资源当日不重复扣）
func (h *MemberHandler) ConsumeQuota(c fiber.Ctx) error {
	type ConsumeReq struct {
		Slug string `json:"slug"`
	}
	var req ConsumeReq
	_ = c.Bind().JSON(&req)
	slug := strings.TrimSpace(req.Slug)
	if slug == "" {
		slug = strings.TrimSpace(c.Query("slug"))
	}

	// 1. 获取站点设置，若全局停用会员额度系统则直接放行
	var siteSetting model.SiteSetting
	database.DB.Where("id = ?", "global").First(&siteSetting)
	if !siteSetting.MemberSystemEnabled {
		return c.JSON(fiber.Map{
			"code": 200,
			"data": fiber.Map{
				"allowed":      true,
				"remain_quota": -1,
				"is_unlimited": true,
				"message":      "全站额度限制已关闭，畅享下载",
			},
		})
	}

	today := time.Now().Format("2006-01-02")
	uid, _, isLogin := h.parseFrontUserClaims(c)

	var ident string
	var levelID string
	var vipExpireAt *time.Time

	if isLogin {
		var user model.FrontUser
		if err := database.DB.Where("id = ?", uid).First(&user).Error; err == nil {
			levelID = user.LevelID
			vipExpireAt = user.VipExpireAt
			if vipExpireAt != nil && vipExpireAt.Before(time.Now()) && levelID != "vip_lifetime" {
				levelID = "user"
			}
		} else {
			levelID = "user"
		}
		ident = fmt.Sprintf("uid:%s", uid.String())
	} else {
		levelID = "guest"
		clientIP := h.getClientIP(c)
		ident = fmt.Sprintf("ip:%s", clientIP)
	}

	var lvl model.MemberLevel
	if err := database.DB.Where("id = ?", levelID).First(&lvl).Error; err != nil {
		lvl = model.MemberLevel{ID: levelID, DailyQuota: 5}
	}

	// 2. 无限额度直接放行
	if lvl.DailyQuota == -1 {
		return c.JSON(fiber.Map{
			"code": 200,
			"data": fiber.Map{
				"allowed":      true,
				"remain_quota": -1,
				"is_unlimited": true,
				"message":      "VIP 无限次特权生效中",
			},
		})
	}

	// 3. 查找今日消耗日志
	var quotaLog model.DailyQuotaLog
	err := database.DB.Where("identifier = ? AND quota_date = ?", ident, today).First(&quotaLog).Error
	if err != nil {
		quotaLog = model.DailyQuotaLog{
			Identifier:          ident,
			QuotaDate:           today,
			UsedCount:           0,
			UnlockedResourceIDs: datatypes.JSON("[]"),
		}
	}

	// 4. 检查 slug 是否已在今日已解锁列表内
	unlockedStr := string(quotaLog.UnlockedResourceIDs)
	if slug != "" && strings.Contains(unlockedStr, fmt.Sprintf(`"%s"`, slug)) {
		remain := lvl.DailyQuota - quotaLog.UsedCount
		if remain < 0 {
			remain = 0
		}
		return c.JSON(fiber.Map{
			"code": 200,
			"data": fiber.Map{
				"allowed":          true,
				"remain_quota":     remain,
				"already_unlocked": true,
				"message":          "今日已解锁过此资源，不重复扣除额度",
			},
		})
	}

	// 5. 校验今日额度是否耗尽
	if quotaLog.UsedCount >= lvl.DailyQuota {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"code":    403,
			"message": siteSetting.QuotaNoticeText,
			"data": fiber.Map{
				"allowed":           false,
				"reason":            "quota_exceeded",
				"is_authenticated":  isLogin,
				"daily_quota":       lvl.DailyQuota,
				"used_count":        quotaLog.UsedCount,
				"remain_quota":      0,
				"taobao_shop_url":   siteSetting.TaobaoShopURL,
				"quota_notice_text": siteSetting.QuotaNoticeText,
			},
		})
	}

	// 6. 正常扣减并记录解锁
	quotaLog.UsedCount++
	if slug != "" {
		if unlockedStr == "" || unlockedStr == "[]" {
			quotaLog.UnlockedResourceIDs = datatypes.JSON(fmt.Sprintf(`["%s"]`, slug))
		} else {
			// 去掉末尾 ']' 并追加
			trimmed := strings.TrimSuffix(strings.TrimSpace(unlockedStr), "]")
			quotaLog.UnlockedResourceIDs = datatypes.JSON(fmt.Sprintf(`%s,"%s"]`, trimmed, slug))
		}
	}

	if quotaLog.ID == uuid.Nil {
		database.DB.Create(&quotaLog)
	} else {
		database.DB.Save(&quotaLog)
	}

	remain := lvl.DailyQuota - quotaLog.UsedCount
	if remain < 0 {
		remain = 0
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"allowed":      true,
			"remain_quota": remain,
			"used_count":   quotaLog.UsedCount,
			"daily_quota":  lvl.DailyQuota,
			"message":      "额度校验通过",
		},
	})
}

// Redeem 使用卡密/兑换码升级会员
func (h *MemberHandler) Redeem(c fiber.Ctx) error {
	uid, username, isLogin := h.parseFrontUserClaims(c)
	if !isLogin {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"code":    401,
			"message": "请先登录学霸网账号，以便将 VIP 权益绑定至您的个人账号",
		})
	}

	type RedeemReq struct {
		Code string `json:"code"`
	}
	var req RedeemReq
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "请求格式错误"})
	}

	codeStr := strings.ToUpper(strings.TrimSpace(req.Code))
	if codeStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "请输入卡密兑换码"})
	}

	var code model.ActivationCode
	if err := database.DB.Where("code = ?", codeStr).First(&code).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "该卡密不存在，请仔细核对后重新输入"})
	}

	if code.Status == "used" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "该卡密已在其他时间被兑换使用"})
	}
	if code.Status == "void" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "该卡密已被作废"})
	}

	// 查询目标会员角色信息
	var targetLvl model.MemberLevel
	if err := database.DB.Where("id = ?", code.TargetLevelID).First(&targetLvl).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "卡密对应的会员角色不存在"})
	}

	var user model.FrontUser
	if err := database.DB.Where("id = ?", uid).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "用户不存在"})
	}

	now := time.Now()
	// 计算延长后的 VIP 到期时间
	var newExpire time.Time
	if code.DurationDays >= 36500 || code.TargetLevelID == "vip_lifetime" {
		// 终身 VIP 设置到 2099 年
		newExpire = time.Date(2099, 12, 31, 23, 59, 59, 0, time.Local)
	} else {
		// 若当前仍在有效 VIP 期内，则在现有到期时间上顺延；否则从当前时间开始计算
		baseTime := now
		if user.VipExpireAt != nil && user.VipExpireAt.After(now) {
			baseTime = *user.VipExpireAt
		}
		newExpire = baseTime.AddDate(0, 0, code.DurationDays)
	}

	// 更新用户等级与到期时间
	user.LevelID = code.TargetLevelID
	user.VipExpireAt = &newExpire
	database.DB.Save(&user)

	// 核销卡密
	code.Status = "used"
	code.UsedByUserID = &user.ID
	code.UsedByUsername = username
	code.UsedAt = &now
	database.DB.Save(&code)

	return c.JSON(fiber.Map{
		"code":    200,
		"message": fmt.Sprintf("🎉 兑换成功！已为您开通【%s】，有效期至 %s", targetLvl.Name, newExpire.Format("2006-01-02")),
		"data": fiber.Map{
			"level_id":      targetLvl.ID,
			"level_name":    targetLvl.Name,
			"badge_text":    targetLvl.BadgeText,
			"daily_quota":   targetLvl.DailyQuota,
			"vip_expire_at": newExpire,
		},
	})
}

// ==========================================
// 后台管理员管理端 API (必须携带管理员 JWT)
// ==========================================

// AdminListMemberLevels 获取所有会员角色及额度规则列表
func (h *MemberHandler) AdminListMemberLevels(c fiber.Ctx) error {
	var list []model.MemberLevel
	if err := database.DB.Order("sort_order asc, created_at asc").Find(&list).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "获取会员等级列表失败"})
	}
	return c.JSON(fiber.Map{
		"code": 200,
		"data": list,
	})
}

// AdminUpdateMemberLevel 更新某个会员角色的额度或配置
func (h *MemberHandler) AdminUpdateMemberLevel(c fiber.Ctx) error {
	id := c.Params("id")
	var existing model.MemberLevel
	if err := database.DB.Where("id = ?", id).First(&existing).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "角色等级不存在"})
	}

	var req model.MemberLevel
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}

	existing.Name = req.Name
	existing.DailyQuota = req.DailyQuota
	existing.Color = req.Color
	existing.BadgeText = req.BadgeText
	existing.PriceHint = req.PriceHint
	existing.Description = req.Description
	existing.IsEnabled = req.IsEnabled
	existing.SortOrder = req.SortOrder

	// 如果设置当前为默认等级，重置其他等级的 is_default
	if req.IsDefault && !existing.IsDefault {
		database.DB.Model(&model.MemberLevel{}).Where("id <> ?", id).Update("is_default", false)
		existing.IsDefault = true
	}

	if err := database.DB.Save(&existing).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "更新失败"})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "会员规则配置更新成功",
		"data":    existing,
	})
}

// AdminCreateMemberLevel 新建自定义会员等级
func (h *MemberHandler) AdminCreateMemberLevel(c fiber.Ctx) error {
	var req model.MemberLevel
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}
	req.ID = strings.TrimSpace(strings.ToLower(req.ID))
	if req.ID == "" || req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "角色标识 ID 与显示名称不能为空"})
	}

	var count int64
	database.DB.Model(&model.MemberLevel{}).Where("id = ?", req.ID).Count(&count)
	if count > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "该标识 ID 已存在"})
	}

	if err := database.DB.Create(&req).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "创建等级失败"})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "创建会员角色成功",
		"data":    req,
	})
}

// AdminBatchGenerateCodes 批量生成卡密并返回纯文本列表 (方便一键复制至淘宝自动发卡软件)
func (h *MemberHandler) AdminBatchGenerateCodes(c fiber.Ctx) error {
	type BatchReq struct {
		TargetLevelID string `json:"target_level_id"`
		DurationDays  int    `json:"duration_days"`
		Count         int    `json:"count"`
		BatchNo       string `json:"batch_no"`
		Remark        string `json:"remark"`
	}
	var req BatchReq
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}

	if req.Count <= 0 || req.Count > 500 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "单次生成数量建议在 1 ~ 500 之间"})
	}
	if req.DurationDays <= 0 {
		req.DurationDays = 30
	}
	if req.BatchNo == "" {
		req.BatchNo = fmt.Sprintf("TB-%s", time.Now().Format("20060102-1504"))
	}

	var targetLvl model.MemberLevel
	if err := database.DB.Where("id = ?", req.TargetLevelID).First(&targetLvl).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "目标角色等级不存在"})
	}

	now := time.Now()
	var codesToCreate []model.ActivationCode
	var codeStrings []string

	for i := 0; i < req.Count; i++ {
		codeStr := generateCodeString()
		codeStrings = append(codeStrings, codeStr)
		codesToCreate = append(codesToCreate, model.ActivationCode{
			Code:          codeStr,
			TargetLevelID: req.TargetLevelID,
			DurationDays:  req.DurationDays,
			BatchNo:       req.BatchNo,
			Remark:        req.Remark,
			Status:        "unused",
			CreatedAt:     now,
		})
	}

	if err := database.DB.Create(&codesToCreate).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "批量生成卡密入库失败"})
	}

	plainText := strings.Join(codeStrings, "\n")

	return c.JSON(fiber.Map{
		"code":    200,
		"message": fmt.Sprintf("成功批量生成 %d 张卡密", req.Count),
		"data": fiber.Map{
			"batch_no":     req.BatchNo,
			"count":        req.Count,
			"target_level": targetLvl.Name,
			"codes":        codeStrings,
			"plain_text":   plainText,
		},
	})
}

// AdminListActivationCodes 分页查询卡密列表
func (h *MemberHandler) AdminListActivationCodes(c fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	status := strings.TrimSpace(c.Query("status"))
	batchNo := strings.TrimSpace(c.Query("batch_no"))
	keyword := strings.TrimSpace(c.Query("keyword"))

	query := database.DB.Model(&model.ActivationCode{})
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if batchNo != "" {
		query = query.Where("batch_no = ?", batchNo)
	}
	if keyword != "" {
		query = query.Where("code ILIKE ? OR remark ILIKE ? OR used_by_username ILIKE ?", "%"+keyword+"%", "%"+keyword+"%", "%"+keyword+"%")
	}

	var total int64
	query.Count(&total)

	var list []model.ActivationCode
	offset := (page - 1) * pageSize
	if err := query.Preload("TargetLevel").Order("created_at desc").Offset(offset).Limit(pageSize).Find(&list).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "查询卡密失败"})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"total":     total,
			"page":      page,
			"page_size": pageSize,
			"items":     list,
		},
	})
}

// AdminVoidActivationCode 作废指定卡密
func (h *MemberHandler) AdminVoidActivationCode(c fiber.Ctx) error {
	id := c.Params("id")
	var code model.ActivationCode
	if err := database.DB.Where("id = ?", id).First(&code).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "卡密不存在"})
	}
	if code.Status == "used" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "已兑换使用的卡密无法作废"})
	}
	code.Status = "void"
	database.DB.Save(&code)
	return c.JSON(fiber.Map{"code": 200, "message": "卡密已作废"})
}

// AdminListUsers 分页查看前台注册会员
func (h *MemberHandler) AdminListUsers(c fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	keyword := strings.TrimSpace(c.Query("keyword"))
	levelID := strings.TrimSpace(c.Query("level_id"))

	query := database.DB.Model(&model.FrontUser{})
	if keyword != "" {
		query = query.Where("username ILIKE ? OR nickname ILIKE ? OR email ILIKE ?", "%"+keyword+"%", "%"+keyword+"%", "%"+keyword+"%")
	}
	if levelID != "" {
		query = query.Where("level_id = ?", levelID)
	}

	var total int64
	query.Count(&total)

	var users []model.FrontUser
	offset := (page - 1) * pageSize
	if err := query.Preload("Level").Order("created_at desc").Offset(offset).Limit(pageSize).Find(&users).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "查询会员列表失败"})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": fiber.Map{
			"total":     total,
			"page":      page,
			"page_size": pageSize,
			"items":     users,
		},
	})
}

// AdminUpdateUser 管理员手动修改前台会员属性 (调整等级、续期VIP、封禁/解封)
func (h *MemberHandler) AdminUpdateUser(c fiber.Ctx) error {
	id := c.Params("id")
	var user model.FrontUser
	if err := database.DB.Where("id = ?", id).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "用户不存在"})
	}

	type UpdateReq struct {
		LevelID     string     `json:"level_id"`
		VipExpireAt *time.Time `json:"vip_expire_at"`
		IsActive    *bool      `json:"is_active"`
		Password    string     `json:"password"`
	}
	var req UpdateReq
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}

	if req.LevelID != "" {
		user.LevelID = req.LevelID
	}
	if req.VipExpireAt != nil {
		user.VipExpireAt = req.VipExpireAt
	}
	if req.IsActive != nil {
		user.IsActive = *req.IsActive
	}
	if strings.TrimSpace(req.Password) != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err == nil {
			user.PasswordHash = string(hash)
		}
	}

	if err := database.DB.Save(&user).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "更新用户信息失败"})
	}

	return c.JSON(fiber.Map{"code": 200, "message": "用户信息更新成功", "data": user})
}
