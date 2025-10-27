# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install --ignore-scripts

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config ./config
COPY --from=builder /app/security ./security

# Copy additional configuration files
COPY nginx.conf ./
COPY nodemon.json ./

# Create workspace directory
RUN mkdir -p workspace

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Default command (can be overridden in docker-compose)
CMD ["npm", "start"]