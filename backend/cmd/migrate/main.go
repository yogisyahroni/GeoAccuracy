package main

import (
	"database/sql"
	"log"

	_ "github.com/lib/pq"
)

func main() {
	db, err := sql.Open("postgres", "postgresql://postgres:1234@localhost:5432/geodata?sslmode=disable")
	if err != nil {
		log.Fatalf("Could not connect to database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Could not ping database: %v", err)
	}

	rawSQL := `ALTER TABLE external_api_keys ALTER COLUMN prefix TYPE VARCHAR(50);`

	_, err = db.Exec(rawSQL)
	if err != nil {
		log.Fatalf("Error adjusting column type prefix varying extent: %v", err)
	}

	log.Println("Database Alter TABLE external_api_keys Selesai! Prefix varchar diperluas lagi! ke 50.")
}
