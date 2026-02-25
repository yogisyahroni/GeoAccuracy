package main

import (
	"database/sql"
	"io/ioutil"
	"log"
	"path/filepath"

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

	upFile := filepath.Join("internal", "db", "migrations", "000009_create_batches_tables.up.sql")
	c, err := ioutil.ReadFile(upFile)
	if err != nil {
		log.Fatalf("Cannot read up file: %v", err)
	}

	_, err = db.Exec(string(c))
	if err != nil {
		log.Fatalf("Error running migration: %v", err)
	}

	log.Println("Migration successful: batches and batch_items tables created.")
}
