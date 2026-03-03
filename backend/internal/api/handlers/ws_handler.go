package handlers

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"geoaccuracy-backend/config"
	ws "geoaccuracy-backend/internal/websocket"
	"geoaccuracy-backend/pkg/utils"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Make sure to allow all origins in development, or restrict to frontend host
	CheckOrigin: func(r *http.Request) bool {
		return true // Allowing all origins for simple integration
	},
}

type WSHandler struct {
	hub *ws.Hub
	cfg *config.Config
}

func NewWSHandler(hub *ws.Hub, cfg *config.Config) *WSHandler {
	return &WSHandler{hub: hub, cfg: cfg}
}

// HandleBatchWS upgrades the HTTP connection and limits subscription by batchID
func (h *WSHandler) HandleBatchWS(c *gin.Context) {
	// Authentication handling via JWT can also be applied here securely
	// Typically either auth middleware or reading token from query params
	// Since standard browser WS doesn't send Authorization headers easily:
	token := c.Query("token")
	if token == "" {
		// Try to fallback to reading Authorization if provided anyway
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" && len(authHeader) > 7 {
			token = authHeader[7:]
		}
	}

	if _, err := utils.ParseToken(token, h.cfg); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized websocket connection"})
		return
	}

	batchID := c.Param("id")
	if batchID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing batch ID"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to set websocket upgrade: %v", err)
		return
	}

	client := &ws.Client{
		Conn:    conn,
		BatchID: batchID,
		Send:    make(chan []byte, 256),
	}

	h.hub.Register(client)

	// Single goroutine to write to the connection
	go func() {
		defer func() {
			h.hub.Unregister(client)
			client.Conn.Close()
		}()
		for {
			msg, ok := <-client.Send
			if !ok {
				client.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := client.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(msg)

			// Send queued messages safely
			n := len(client.Send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-client.Send)
			}

			if err := w.Close(); err != nil {
				return
			}
		}
	}()

	// Read block handles client disconnect explicitly
	go func() {
		defer func() {
			h.hub.Unregister(client)
			client.Conn.Close()
		}()
		for {
			_, _, err := client.Conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("error: %v", err)
				}
				break
			}
		}
	}()
}
