package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"geoaccuracy-backend/config"
	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/internal/repository"
	"geoaccuracy-backend/internal/service"
)

type AuthHandler struct {
	authService service.AuthService
	cfg         *config.Config
}

func NewAuthHandler(authService service.AuthService, cfg *config.Config) *AuthHandler {
	return &AuthHandler{authService: authService, cfg: cfg}
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req domain.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := h.authService.Register(c.Request.Context(), req)
	if err != nil {
		if err == repository.ErrEmailAlreadyExists {
			c.JSON(http.StatusConflict, gin.H{"error": "Email already registered"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register user"})
		return
	}

	h.setAuthCookies(c, res.AccessToken, res.RefreshToken)

	// In Grade S++, we don't send the token in JSON body to prevent storage in localStorage
	res.AccessToken = ""
	res.RefreshToken = ""
	c.JSON(http.StatusCreated, res)
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req domain.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := h.authService.Login(c.Request.Context(), req)
	if err != nil {
		if err == service.ErrInvalidCredentials {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to login"})
		return
	}

	h.setAuthCookies(c, res.AccessToken, res.RefreshToken)

	// Don't leak tokens in JSON body
	res.AccessToken = ""
	res.RefreshToken = ""
	c.JSON(http.StatusOK, res)
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	refreshToken, err := c.Cookie("refresh_token")
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh token required"})
		return
	}

	res, err := h.authService.Refresh(c.Request.Context(), refreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid refresh token"})
		return
	}

	h.setAuthCookies(c, res.AccessToken, res.RefreshToken)

	// Don't leak tokens in JSON body
	res.AccessToken = ""
	res.RefreshToken = ""
	c.JSON(http.StatusOK, res)
}

func (h *AuthHandler) Logout(c *gin.Context) {
	h.clearAuthCookies(c)
	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

func (h *AuthHandler) setAuthCookies(c *gin.Context, accessToken, refreshToken string) {
	secure := h.cfg.AppEnv == "production"
	
	// Grade S++ Cookie Strategy:
	// If in production (Vercel + Render), we need SameSite=None for cross-site cookies.
	// Otherwise, SameSite=Lax is sufficient for same-site (localhost) dev.
	sameSite := http.SameSiteLaxMode
	if secure {
		sameSite = http.SameSiteNoneMode
	}
	
	// Access Token: 15 min
	c.SetSameSite(sameSite)
	c.SetCookie("access_token", accessToken, 15*60, "/", "", secure, true)
	
	// Refresh Token: 7 days
	c.SetCookie("refresh_token", refreshToken, 7*24*3600, "/api/auth/refresh", "", secure, true)
}

func (h *AuthHandler) clearAuthCookies(c *gin.Context) {
	secure := h.cfg.AppEnv == "production"
	sameSite := http.SameSiteLaxMode
	if secure {
		sameSite = http.SameSiteNoneMode
	}
	c.SetSameSite(sameSite)
	c.SetCookie("access_token", "", -1, "/", "", secure, true)
	c.SetCookie("refresh_token", "", -1, "/api/auth/refresh", "", secure, true)
}


