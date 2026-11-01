# The image CodeSandbox runs the repository in (as a devbox): Node 22, which the demo app's
# Vite needs (22.12+, or 20.19+). zsh and git are there because CodeSandbox's terminal uses zsh.
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends zsh git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
