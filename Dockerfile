# ==============================================================================
# Node.js Clean Architecture Dockerfile
# ==============================================================================
# This Dockerfile uses a Multi-Stage Build to keep the final image as small
# and secure as possible. It separates the build environment (compiling TS)
# from the runtime environment.
# ==============================================================================

# ------------------------------------------------------------------------------
# STAGE 1: Build Environment
# ------------------------------------------------------------------------------
# We use the alpine version of Node.js 22 to minimize attack surface and size.
FROM node:22-alpine AS build

# Set the working directory inside the container
WORKDIR /app

# Copy ONLY package files first to leverage Docker layer caching.
# If package.json/package-lock.json don't change, Docker uses the cached npm ci step.
COPY package*.json ./

# Install ALL dependencies (including devDependencies like typescript)
# 'npm ci' is used instead of 'npm install' for strict reproducible builds.
RUN npm ci

# Copy TypeScript configuration files
COPY tsconfig.json tsconfig.build.json ./

# Copy the actual source code
COPY src ./src

# Compile TypeScript to JavaScript.
# The resulting code will be output to the /app/dist folder.
RUN npm run build


# ------------------------------------------------------------------------------
# STAGE 2: Production Runtime
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runtime

# Set production environment variables
# - NODE_ENV=production enforces performance optimizations in Express.
# - HOST=0.0.0.0 allows the container to receive requests from the outside world.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# Create and set the working directory
WORKDIR /app

# Copy ONLY package files again for production dependencies
COPY package*.json ./

# Install ONLY production dependencies (--omit=dev).
# Then immediately clear the npm cache to reduce the image size.
RUN npm ci --omit=dev && npm cache clean --force

# Copy the compiled Javascript code from the STAGE 1 (build) container
COPY --from=build /app/dist ./dist

# ==========================================
# SECURITY: Drop privileges
# ==========================================
# By default, Docker containers run as the root user. This is a major security risk.
# The 'node' official image provides an unprivileged user named 'node'.
# We switch to this user so if the app is compromised, the attacker has limited access.
USER node

# Document the port the application binds to
EXPOSE 3000

# ==========================================
# RELIABILITY: Healthcheck
# ==========================================
# Docker will periodically hit this endpoint to check if the app is healthy.
# If it fails 3 times, orchestration tools (like Docker Swarm or Kubernetes)
# will know to restart the container.
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

# Start the application
CMD ["node", "dist/server.js"]
