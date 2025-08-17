#!/bin/bash

# Setup script to ensure proper permissions for simplex-chat container

echo "Setting up simplex-chat data directory permissions..."

# Create the simplex-data directory if it doesn't exist
mkdir -p simplex-data

# Get the current user's UID and GID
CURRENT_UID=$(id -u)
CURRENT_GID=$(id -g)

echo "Current user UID: $CURRENT_UID, GID: $CURRENT_GID"

# Set proper ownership to current user
sudo chown -R $CURRENT_UID:$CURRENT_GID simplex-data

# Set proper permissions
chmod -R 755 simplex-data

# Export the UID and GID for docker-compose
export USER_UID=$CURRENT_UID
export USER_GID=$CURRENT_GID

echo "Permissions set up successfully!"
echo "Environment variables set: USER_UID=$CURRENT_UID, USER_GID=$CURRENT_GID"
echo "You can now run: docker-compose up --build -d"
