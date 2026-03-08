FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ── Distroless runtime (~30 MB, no shell, no package manager) ──
FROM oven/bun:1-distroless AS runtime
WORKDIR /app

# Copy only what's needed to run
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY tsconfig.json ./
COPY index.ts ./
COPY src/ ./src/

# Run as non-root (distroless has no adduser; set UID directly)
USER 65534

CMD ["bun", "run", "index.ts"]
