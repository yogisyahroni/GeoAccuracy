# syntax=docker/dockerfile:1
# Build Stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install dependencies required for building (if any native C libraries are needed in future, add gcc musl-dev)
RUN apk add --no-cache git

# Copy go mod and sum files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application statically linked
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o server ./cmd/server/main.go

# Production Stage
FROM gcr.io/distroless/static-debian12:latest-amd64

WORKDIR /

# Copy the pre-built binary
COPY --from=builder /app/server /server

# Expose port (default 8081 for backend)
EXPOSE 8081

# Command to run
CMD ["/server"]
