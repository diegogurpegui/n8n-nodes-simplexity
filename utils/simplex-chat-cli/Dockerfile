# Use Ubuntu 24.04 as base image
FROM ubuntu:24.04

# Set environment variables to avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Update package list and install necessary dependencies
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create directory for simplex-chat
RUN mkdir -p /usr/local/bin

# Download and install simplex-chat CLI
RUN wget -O /usr/local/bin/simplex-chat \
    https://github.com/simplex-chat/simplex-chat/releases/download/v6.4.0/simplex-chat-ubuntu-24_04-x86-64 \
    && chmod +x /usr/local/bin/simplex-chat

# Create a non-root user for running simplex-chat
RUN useradd -m -s /bin/bash simplex

# Copy the startup script
COPY start-simplex.sh /usr/local/bin/start-simplex.sh
RUN chmod +x /usr/local/bin/start-simplex.sh

# Switch to non-root user
USER simplex

# Set working directory
WORKDIR /home/simplex

# Expose port 5225 for simplex-chat
EXPOSE 5225
