package handler

import (
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"netdisk/api/internal/config"
	"netdisk/api/internal/database"
	"netdisk/api/internal/model"
)

type AuthHandler struct {
	cfg *config.Config
}

func NewAuthHandler(cfg *config.Config) *AuthHandler {
	return &AuthHandler{cfg: cfg}
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (h *AuthHandler) Login(c fiber.Ctx) error {
	var req LoginRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"code":    400,
			"message": "参数格式错误",
		})
	}

	var user model.AdminUser
	if err := database.DB.Where("username = ? AND is_active = true", req.Username).First(&user).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"code":    401,
			"message": "账号或密码错误",
		})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"code":    401,
			"message": "账号或密码错误",
		})
	}

	// 签发 JWT
	claims := jwt.MapClaims{
		"sub":      user.ID.String(),
		"username": user.Username,
		"role":     user.Role,
		"exp":      time.Now().Add(time.Hour * 72).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(h.cfg.JWTSecret))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"code":    500,
			"message": "生成 Token 失败",
		})
	}

	now := time.Now()
	user.LastLoginAt = &now
	database.DB.Save(&user)

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "登录成功",
		"data": fiber.Map{
			"token":    tokenString,
			"username": user.Username,
			"nickname": user.Nickname,
			"role":     user.Role,
		},
	})
}

// Me 获取当前登录管理员信息
func (h *AuthHandler) Me(c fiber.Ctx) error {
	userID := c.Locals("user_id")
	if userID == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"code": 401, "message": "未登录"})
	}

	var user model.AdminUser
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "用户不存在"})
	}

	return c.JSON(fiber.Map{
		"code": 200,
		"data": user,
	})
}

type UpdateProfileRequest struct {
	Nickname string `json:"nickname"`
}

type ChangePasswordRequest struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

// UpdateProfile 修改当前管理员个人资料（如昵称）
func (h *AuthHandler) UpdateProfile(c fiber.Ctx) error {
	userID := c.Locals("user_id")
	if userID == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"code": 401, "message": "未登录"})
	}

	var req UpdateProfileRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}

	var user model.AdminUser
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "用户不存在"})
	}

	if req.Nickname != "" {
		user.Nickname = req.Nickname
		if err := database.DB.Model(&user).Update("nickname", user.Nickname).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "更新资料失败"})
		}
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "资料更新成功",
		"data":    user,
	})
}

// ChangePassword 修改管理员密码
func (h *AuthHandler) ChangePassword(c fiber.Ctx) error {
	userID := c.Locals("user_id")
	if userID == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"code": 401, "message": "未登录"})
	}

	var req ChangePasswordRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "参数格式错误"})
	}

	if len(req.NewPassword) < 6 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "新密码长度不能少于 6 位"})
	}

	var user model.AdminUser
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"code": 404, "message": "用户不存在"})
	}

	// 校验原密码
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.OldPassword)); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"code": 400, "message": "原密码不正确，请重新输入"})
	}

	// 生成新密码哈希
	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "密码加密失败"})
	}

	user.PasswordHash = string(newHash)
	if err := database.DB.Model(&user).Update("password_hash", user.PasswordHash).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"code": 500, "message": "保存新密码失败"})
	}

	return c.JSON(fiber.Map{
		"code":    200,
		"message": "密码修改成功，新密码已生效",
	})
}
