package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/internal/service"
)

// WebhookHandler handles API Key lifecycles and webhook coordinate ingestions.
type WebhookHandler struct {
	webhookSvc *service.WebhookService
}

// NewWebhookHandler creates a new WebhookHandler.
func NewWebhookHandler(webhookSvc *service.WebhookService) *WebhookHandler {
	return &WebhookHandler{
		webhookSvc: webhookSvc,
	}
}

// GenerateAPIKey generates a new static API token for external ingest.
// POST /api/settings/api-keys
func (h *WebhookHandler) GenerateAPIKey(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req struct {
		Name string `json:"name" binding:"required,min=3"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "VALIDATION_FAILED"})
		return
	}

	// JWT claims decode numeric values as float64 mostly, but let's handle int and int64
	var uid int
	switch v := userID.(type) {
	case float64:
		uid = int(v)
	case int:
		uid = v
	case int64:
		uid = int(v)
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error: invalid user claims"})
		return
	}

	response, err := h.webhookSvc.GenerateAPIKey(c.Request.Context(), uid, req.Name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, response)
}

// ListAPIKeys retrieves keys for the user.
// GET /api/settings/api-keys
func (h *WebhookHandler) ListAPIKeys(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// JWT claims decode numeric values as float64 mostly, but let's handle int and int64
	var uid int
	switch v := userID.(type) {
	case float64:
		uid = int(v)
	case int:
		uid = v
	case int64:
		uid = int(v)
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error: invalid user claims"})
		return
	}

	keys, err := h.webhookSvc.GetAPIKeys(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list api keys", "details": err.Error()})
		return
	}

	if keys == nil {
		keys = []domain.ExternalAPIKey{}
	}

	c.JSON(http.StatusOK, keys)
}

// RevokeAPIKey deletes a user's API key.
// DELETE /api/settings/api-keys/:id
func (h *WebhookHandler) RevokeAPIKey(c *gin.Context) {
	userID, _ := c.Get("userID")

	idParam := c.Param("id")
	id, err := uuid.Parse(idParam)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid UUID format"})
		return
	}

	// JWT claims
	var uid int
	switch v := userID.(type) {
	case float64:
		uid = int(v)
	case int:
		uid = v
	case int64:
		uid = int(v)
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid user claim"})
		return
	}

	if err := h.webhookSvc.DeleteAPIKey(c.Request.Context(), id, uid); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}

// IngestData accepts Webhook Payload directly from external systems.
// POST /api/webhooks/ingest
func (h *WebhookHandler) IngestData(c *gin.Context) {
	// 1. Authenticated via Middleware (API Key)
	userIDObj, keyExists := c.Get("webhookUserID")

	// Just logging usage for tracing
	if keyExists {
		c.Set("log_webhook_user_id", userIDObj)
	}

	// 2. Parse & Validate Payload
	var payload domain.WebhookPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid webhook payload structure", "details": err.Error()})
		return
	}

	if !keyExists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized via API Key"})
		return
	}

	// 3. Send to processing service
	res, err := h.webhookSvc.ProcessWebhookPayload(c.Request.Context(), userIDObj.(int), payload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal processing failed", "details": err.Error()})
		return
	}

	// Return Accept status indicating data was safely received into memory/queue
	c.JSON(http.StatusAccepted, res)
}
