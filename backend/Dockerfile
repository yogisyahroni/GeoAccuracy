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
# Use the explicit :nonroot variant for better permission handling
FROM gcr.io/distroless/base-debian12:nonroot-amd64

# Set working directory to root / as before, but with proper binary ownership
WORKDIR /

# Copy the pre-built binary with explicit ownership for the nonroot user (UID 65532)
COPY --from=builder --chown=65532:65532 /app/server /server

# Important: Copy migration files to production so database initialization succeeds
COPY --from=builder --chown=65532:65532 /app/internal/db/migrations /internal/db/migrations

# Expose port (default 8081 for backend)
EXPOSE 8081

# Run as non-root user (explicitly set though 'nonroot' image does this by default)
USER 65532:65532

# Command to run (using absolute path for safety)
ENTRYPOINT ["/server"]
