package handlers

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"

	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/internal/service"
)

// SettingsHandler handles /api/settings routes.
type SettingsHandler struct {
	settingsSvc *service.SettingsService
}

// NewSettingsHandler creates a new SettingsHandler.
func NewSettingsHandler(settingsSvc *service.SettingsService) *SettingsHandler {
	return &SettingsHandler{settingsSvc: settingsSvc}
}

// GetSettings returns the current user's settings.
// GET /api/settings
func (h *SettingsHandler) GetSettings(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	settings, err := h.settingsSvc.GetSettings(userID)
	if err != nil {
		log.Printf("GetSettings error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal mengambil pengaturan"})
		return
	}

	c.JSON(http.StatusOK, settings)
}

// UpdateSettings saves the API keys for the current user.
// PUT /api/settings/maps
func (h *SettingsHandler) UpdateSettings(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	var req domain.UpdateSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Payload tidak valid: " + err.Error()})
		return
	}

	if err := h.settingsSvc.UpdateSettings(userID, req); err != nil {
		log.Printf("UpdateSettings error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan API key"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Pengaturan berhasil disimpan"})
}

// TestProviderKey validates an API key against the Provider API.
// POST /api/settings/maps/test
func (h *SettingsHandler) TestProviderKey(c *gin.Context) {
	var req domain.TestMapsKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Payload tidak valid: " + err.Error()})
		return
	}

	result := h.settingsSvc.TestProviderKey(c.Request.Context(), req.Provider, req.Key)
	status := http.StatusOK
	if !result.Valid {
		status = http.StatusUnprocessableEntity
	}
	c.JSON(status, result)
}
