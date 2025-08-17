# Simplex Chat CLI Docker Setup

This directory contains a Docker setup for running the Simplex Chat CLI with configurable environment variables.

## Files

- `Dockerfile` - Container definition for simplex-chat
- `docker-compose.yml` - Docker Compose configuration
- `start-simplex.sh` - Bash script that handles startup with environment variables
- `.env.template` - Template environment variables file
- `.env` - Your environment variables (create this file)

## Setup

1. Copy the example environment file:
   ```bash
   cp env.template .env
   ```

2. Edit the `.env` file with your desired configuration:
   ```bash
   # Log level: debug, info, warn, error
   SIMPLEX_LOG_LEVEL=warn
   
   # Port for simplex-chat server
   SIMPLEX_PORT=5225
   
   # Bot name for initial profile creation
   SIMPLEX_BOT_NAME=my-bot
   
   # Profile directory (usually don't need to change this)
   SIMPLEX_PROFILE_DIR=/home/simplex/.simplex
   ```

3. Set up proper permissions for the data directory:
   ```bash
   ./setup-permissions.sh
   ```
   
   **Note**: This script will automatically detect your user's UID and GID, create the `simplex-data` directory, and set proper ownership. The container will be built with the correct user permissions.

4. Build and start the container:
   ```bash
   docker-compose up --build -d
   ```
   
   **Note**: The `--build` flag is required on first run to build the container with the correct user permissions.

## Features

- **Environment Variables**: All configuration is done through environment variables
- **Profile Detection**: Automatically detects if a simplex profile exists
- **First Run Setup**: If no profile exists, creates one with the specified bot name
- **Persistent Storage**: Profile data persists between container restarts

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SIMPLEX_LOG_LEVEL` | `warn` | Logging level (debug, info, warn, error) |
| `SIMPLEX_PORT` | `5225` | Port for the simplex-chat server |
| `SIMPLEX_BOT_NAME` | `n8n-bot` | Bot name for initial profile creation |
| `SIMPLEX_PROFILE_DIR` | `/home/simplex/.simplex` | Directory for simplex profiles |

## Usage

The container will automatically:
1. Check if a simplex profile exists
2. If not, create one with the specified bot name
3. Start the simplex-chat server with the configured settings

The server will be available at `http://localhost:5225` (or your configured port). 