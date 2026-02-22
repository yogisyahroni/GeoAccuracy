package handlers

import (
	"context"
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"geoaccuracy-backend/internal/domain"
)

type ErpIntegrationHandler struct {
	svc domain.ErpIntegrationService
}

func NewErpIntegrationHandler(svc domain.ErpIntegrationService) *ErpIntegrationHandler {
	return &ErpIntegrationHandler{svc: svc}
}

func (h *ErpIntegrationHandler) Create(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	var req domain.ErpIntegration
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.UserID = int64(userID)

	// Default method fallback
	if req.Method == "" {
		req.Method = "GET"
	}

	if err := h.svc.Create(c.Request.Context(), &req); err != nil {
		log.Printf("ErpIntegrationHandler.Create error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan integrasi ERP"})
		return
	}

	// Nullify secret before returning
	req.AuthHeaderValue = ""
	c.JSON(http.StatusCreated, req)
}

func (h *ErpIntegrationHandler) List(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	integrations, err := h.svc.List(c.Request.Context(), int64(userID))
	if err != nil {
		log.Printf("ErpIntegrationHandler.List error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mengambil daftar integrasi ERP"})
		return
	}

	c.JSON(http.StatusOK, integrations)
}

func (h *ErpIntegrationHandler) Update(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID tidak valid"})
		return
	}

	var req domain.ErpIntegration
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.ID = id
	req.UserID = int64(userID)

	if err := h.svc.Update(c.Request.Context(), &req); err != nil {
		log.Printf("ErpIntegrationHandler.Update error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memperbarui integrasi ERP"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Integrasi ERP berhasil diperbarui"})
}

func (h *ErpIntegrationHandler) Delete(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID tidak valid"})
		return
	}

	if err := h.svc.Delete(c.Request.Context(), id, int64(userID)); err != nil {
		log.Printf("ErpIntegrationHandler.Delete error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menghapus integrasi ERP"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Integrasi ERP berhasil dihapus"})
}

// ManualSync triggers the job instantly
func (h *ErpIntegrationHandler) ManualSync(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID tidak valid"})
		return
	}

	// Validate ownership
	if _, err := h.svc.Get(c.Request.Context(), id, int64(userID)); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Integrasi tidak ditemukan atau Anda tidak memiliki akses"})
		return
	}

	// Execute fetch sync (Asynchronous)
	go func() {
		// Detached context is needed because the gin context cancels when the HTTP request finishes
		bgCtx := context.Background()
		if syncErr := h.svc.ExecuteSyncJob(bgCtx, id); syncErr != nil {
			log.Printf("[ERP Manual Sync] Error on %d: %v", id, syncErr)
		}
	}()

	c.JSON(http.StatusAccepted, gin.H{"message": "Proses sinkronisasi telah dimulai di latar belakang"})
}
