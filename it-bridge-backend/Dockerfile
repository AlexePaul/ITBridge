# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY eslint.config.mjs ./

RUN npm install -g @nestjs/cli

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build the application
RUN npm run build

# Development stage
FROM node:22-alpine AS development

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY eslint.config.mjs ./

# Install all dependencies (including dev for nest-cli)
RUN npm ci

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application in watch mode
CMD ["npm", "run", "start:dev"]

