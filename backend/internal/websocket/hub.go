package websocket

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

// Message is the generic container for WS payloads
type Message struct {
	BatchID string `json:"batch_id"`
	Type    string `json:"type"` // "progress", "completed", "error"
	Payload any    `json:"payload"`
}

type Client struct {
	Conn    *websocket.Conn
	BatchID string
	Send    chan []byte
}

type Hub struct {
	// Registered clients registered by batch ID
	clients map[string]map[*Client]bool
	// FIX BUG-01: Use a full Mutex (not RWMutex) because Run() both reads AND
	// modifies the map (close + delete slow clients). Using RLock while mutating
	// is a data race that can crash the Render server.
	mu sync.Mutex

	// Inbound messages to broadcast
	Broadcast chan Message
}

func NewHub() *Hub {
	return &Hub{
		clients:   make(map[string]map[*Client]bool),
		Broadcast: make(chan Message),
	}
}

func (h *Hub) Run() {
	for {
		msg := <-h.Broadcast

		// FIX BUG-01: Lock (write lock) because we may close + delete slow clients
		h.mu.Lock()
		subscribers := h.clients[msg.BatchID]
		if len(subscribers) > 0 {
			msgBytes, err := json.Marshal(msg)
			if err != nil {
				log.Printf("Error marshaling ws message: %v", err)
			} else {
				for client := range subscribers {
					select {
					case client.Send <- msgBytes:
					default:
						// Client send buffer is full — it's unresponsive.
						// Close channel and remove while we already hold the lock.
						close(client.Send)
						delete(subscribers, client)
					}
				}
			}
		}
		h.mu.Unlock()
	}
}

func (h *Hub) Register(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.clients[client.BatchID] == nil {
		h.clients[client.BatchID] = make(map[*Client]bool)
	}
	h.clients[client.BatchID][client] = true
	log.Printf("WS: Registered client for batch %s", client.BatchID)
}

func (h *Hub) Unregister(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[client.BatchID]; ok {
		if _, exists := h.clients[client.BatchID][client]; exists {
			delete(h.clients[client.BatchID], client)
			close(client.Send)
			if len(h.clients[client.BatchID]) == 0 {
				delete(h.clients, client.BatchID)
			}
			log.Printf("WS: Unregistered client for batch %s", client.BatchID)
		}
	}
}
