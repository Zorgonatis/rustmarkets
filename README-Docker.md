# Docker Setup for Rust Markets

This guide explains how to run the Rust Markets application using Docker and Docker Compose.

## Prerequisites

- Docker (version 20.10 or later)
- Docker Compose (version 1.29 or later)

## Quick Start

1. **Clone or download the project**
   ```bash
   git clone <repository-url>
   cd rustmarkets
   ```

2. **Configure environment variables**
   ```bash
   cp .env.docker .env
   ```
   
   Edit the `.env` file with your Rust server connection details:
   - `RUST_ADDRESS`: Your Rust server IP
   - `RUST_PORT`: Your Rust server app port (usually 28082)
   - `RUST_PLAYER_ID`: Your Steam64 ID
   - `RUST_PLAYER_TOKEN`: Your player token from Rust+ pairing

3. **Start the application**
   ```bash
   docker-compose up -d
   ```

4. **Access the application**
   Open your browser and navigate to `http://localhost:3008`
   
   Note: The default port has been changed to 3008 to avoid conflicts with the local Node.js development server.

## Docker Compose Commands

- **Start the application**: `docker-compose up -d`
- **Stop the application**: `docker-compose down`
- **View logs**: `docker-compose logs -f rustmarkets`
- **Rebuild the image**: `docker-compose up --build -d`
- **Check status**: `docker-compose ps`

## Configuration

### Environment Variables

The following environment variables can be configured in `.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Host port to expose the application | `3000` |
| `RUST_ADDRESS` | Rust server IP address | Required |
| `RUST_PORT` | Rust server app port | Required |
| `RUST_PLAYER_ID` | Your Steam64 ID | Required |
| `RUST_PLAYER_TOKEN` | Player token from pairing | Required |
| `RUST_USE_FACEPUNCH_PROXY` | Use Facepunch proxy if direct connection fails | `false` |
| `RUST_TIMEOUT_MS` | Request timeout in milliseconds | `10000` |
| `INFO_TTL_MS` | Info cache TTL in milliseconds | `10000` |
| `VENDING_TTL_MS` | Vending cache TTL in milliseconds | `5000` |
| `MAP_TTL_MS` | Map cache TTL in milliseconds | `300000` |

### Data Persistence

- **Application data**: Stored in `./data` directory (bind mount)
- **Logs**: Stored in Docker named volume `rustmarkets-logs`

## Docker Image Details

- **Base image**: `node:18-alpine`
- **Platform**: Supports Linux, macOS, and Windows
- **Architecture**: Supports amd64, arm64, and arm/v7
- **Health check**: Built-in health check on `/api/health` endpoint

## Troubleshooting

### Connection Issues

If you can't connect to your Rust server:

1. Verify your `.env` file has correct server details
2. Check if the Rust server's app port is accessible from the Docker host
3. Try setting `RUST_USE_FACEPUNCH_PROXY=true` if direct connection fails

### Port Conflicts

If port 3000 is already in use:

1. Change the `PORT` variable in `.env` to a different port
2. Update the port mapping in `docker-compose.yml`:
   ```yaml
   ports:
     - "8080:3000"  # Use port 8080 on host
   ```

### Viewing Logs

To see real-time logs:
```bash
docker-compose logs -f rustmarkets
```

To see the last 100 lines:
```bash
docker-compose logs --tail=100 rustmarkets
```

### Rebuilding

If you make changes to the application code:

```bash
docker-compose up --build -d
```

## Development

For development with live reload, consider using a volume mount for the source code:

```yaml
volumes:
  - .:/app
  - /app/node_modules
```

Note: This is not recommended for production due to potential performance issues.

## Production Deployment

For production deployment:

1. Ensure all environment variables are properly set
2. Consider using a reverse proxy (nginx, Traefik) for SSL termination
3. Set up proper monitoring and log aggregation
4. Use resource limits in docker-compose.yml if needed

Example resource limits:
```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 512M
    reservations:
      cpus: '0.5'
      memory: 256M
```

## Support

For issues specific to the Rust Markets application, please refer to the main README.md file.

For Docker-related issues, ensure you have the latest versions of Docker and Docker Compose installed.