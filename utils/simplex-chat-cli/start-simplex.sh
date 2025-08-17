#!/bin/bash

# Exit on any error
set -e

# Default values for environment variables
DEFAULT_LOG_LEVEL=${SIMPLEX_LOG_LEVEL:-"warn"}
DEFAULT_PORT=${SIMPLEX_PORT:-"5225"}
DEFAULT_BOT_NAME=${SIMPLEX_BOT_NAME:-"n8n-bot"}
DEFAULT_PROFILE_DIR=${SIMPLEX_PROFILE_DIR:-"/home/simplex/.simplex"}

# Function to check if profile exists
check_profile_exists() {
    if [ -d "$DEFAULT_PROFILE_DIR" ] && [ "$(ls -A $DEFAULT_PROFILE_DIR 2>/dev/null)" ]; then
        return 0  # Profile exists
    else
        return 1  # Profile doesn't exist
    fi
}

# Function to start simplex-chat with common parameters
start_simplex_chat() {
    # (By default it binds to localhost only)
    /usr/local/bin/simplex-chat \
        --log-level "$DEFAULT_LOG_LEVEL" \
        -p "$DEFAULT_PORT" \
        -r \
        -a
}

# Function to start socat for port forwarding
start_socat_forward() {
    echo "Starting socat to forward traffic from 0.0.0.0:$DEFAULT_PORT to 127.0.0.1:$DEFAULT_PORT"
    socat TCP-LISTEN:$DEFAULT_PORT,fork,reuseaddr TCP:127.0.0.1:$DEFAULT_PORT &
    SOCAT_PID=$!
    echo "Socat started with PID: $SOCAT_PID"
}

# Function to start simplex-chat with automatic profile creation
start_simplex_with_auto_profile() {
    echo "No profile found. Creating profile automatically with bot name: $DEFAULT_BOT_NAME"
    
    # Ensure the profile directory exists and has correct permissions
    mkdir -p "$DEFAULT_PROFILE_DIR"
    
    # Start socat forwarding first
    start_socat_forward
    
    # Use a coprocess to handle the interactive input
    coproc SIMPLEX_PROC {
        start_simplex_chat
    }
    
    # Wait a moment for the process to start and potentially prompt
    sleep 2
    
    # Send the bot name to the process
    echo "$DEFAULT_BOT_NAME" >&${SIMPLEX_PROC[1]}
    
    # Wait for the process to complete
    wait $SIMPLEX_PROC_PID
}

# Function to start simplex-chat normally (with profile)
start_simplex_normal() {
    echo "Profile found. Starting simplex-chat..."
    
    # Start socat forwarding first
    start_socat_forward
    
    # Start simplex-chat
    start_simplex_chat
}

# Function to cleanup on exit
cleanup() {
    echo "Cleaning up..."
    if [ ! -z "$SOCAT_PID" ]; then
        echo "Stopping socat (PID: $SOCAT_PID)"
        kill $SOCAT_PID 2>/dev/null || true
    fi
}

# Set up signal handlers
trap cleanup EXIT INT TERM

# Main execution
echo "Starting simplex-chat with configuration:"
echo "  Log Level: $DEFAULT_LOG_LEVEL"
echo "  Port: $DEFAULT_PORT"
echo "  Bot Name: $DEFAULT_BOT_NAME"
echo "  Profile Directory: $DEFAULT_PROFILE_DIR"
echo "  Socat forwarding: 0.0.0.0:$DEFAULT_PORT -> 127.0.0.1:$DEFAULT_PORT"

# Check if profile exists
if ! check_profile_exists; then
    start_simplex_with_auto_profile
else
    start_simplex_normal
fi