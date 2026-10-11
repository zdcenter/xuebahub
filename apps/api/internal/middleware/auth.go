package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
)

// AuthMiddleware 校验 JWT 访问令牌的中间件
func AuthMiddleware(jwtSecret string) fiber.Handler {
	return func(c fiber.Ctx) error {
		// OPTIONS 预检请求直接放行
		if c.Method() == fiber.MethodOptions {
			return c.Next()
		}

		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"code":    401,
				"message": "请先登录管理员账号（未提供认证令牌）",
			})
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"code":    401,
				"message": "认证令牌格式无效",
			})
		}

		tokenString := strings.TrimSpace(parts[1])
		token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fiber.ErrUnauthorized
			}
			return []byte(jwtSecret), nil
		})

		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"code":    401,
				"message": "登录会话已过期或无效，请重新登录",
			})
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"code":    401,
				"message": "令牌载荷解析失败",
			})
		}

		if sub, ok := claims["sub"].(string); ok {
			c.Locals("user_id", sub)
		}
		if username, ok := claims["username"].(string); ok {
			c.Locals("username", username)
		}
		if role, ok := claims["role"].(string); ok {
			c.Locals("role", role)
		}

		return c.Next()
	}
}
