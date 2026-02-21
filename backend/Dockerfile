FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install git and other build dependencies
RUN apk add --no-cache git

# Copy go mod and sum files
COPY go.mod go.sum ./

# Download all dependencies.
RUN go mod download

# Copy the source code
COPY . .

# Build the application (disable CGO for statically linked binary)
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./cmd/server/main.go

# ---

FROM alpine:3.18

WORKDIR /app

# Add CA certificates for HTTPS requests (e.g. to Nominatim)
RUN apk --no-cache add ca-certificates tzdata

# Copy the Pre-built binary file from the previous stage
COPY --from=builder /app/main .

# Expose port 8080 to the outside world
EXPOSE 8080

# Run the executable
CMD ["./main"]
