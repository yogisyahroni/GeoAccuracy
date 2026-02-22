# syntax=docker/dockerfile:1
# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Enable legacy peer deps explicitly due to leaflet-draw
ENV NPM_CONFIG_LEGACY_PEER_DEPS=true

# Copy package requirements
COPY package*.json ./

# Install dependencies using clean install
RUN npm ci

# Copy the rest of the application
COPY . .

# Build Vite application
RUN npm run build

# Production Stage
FROM nginx:alpine

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Replace default Nginx config with an SPA-friendly config
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
