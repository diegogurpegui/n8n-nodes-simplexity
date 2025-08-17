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

# Install telnet
RUN apt-get update && apt-get install -y telnet

# Create directory for simplex-chat
RUN mkdir -p /usr/local/bin

# Download and install simplex-chat CLI
RUN wget -O /usr/local/bin/simplex-chat \
    https://github.com/simplex-chat/simplex-chat/releases/download/v6.4.0/simplex-chat-ubuntu-24_04-x86-64 \
    && chmod +x /usr/local/bin/simplex-chat

# Create a non-root user for running simplex-chat with UID 1000
# This can be overridden at runtime with --build-arg
ARG USER_UID=1000
ARG USER_GID=1000

RUN groupadd -g $USER_GID simplex && \
    useradd -m -s /bin/bash -u $USER_UID -g $USER_GID simplex

# Create the .simplex directory and set proper ownership
RUN mkdir -p /home/simplex/.simplex && chown -R simplex:simplex /home/simplex/.simplex

# Copy the startup script
COPY start-simplex.sh /usr/local/bin/start-simplex.sh
RUN chmod +x /usr/local/bin/start-simplex.sh

# Switch to non-root user
USER simplex

# Set working directory
WORKDIR /home/simplex

# Expose port 5225 for simplex-chat
EXPOSE 5225
