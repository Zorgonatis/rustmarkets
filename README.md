# ⚠️ AI-Generated Market Tracker - Proceed with Caution!

**Warning:** This project was created by AI and might occasionally be as accurate as a weatherman predicting snow in the Sahara. No offense to weatherpeople, they're usually right... usually.

---

> *Why did the AI market tracker break up with the database?*
> 
> *It said they had too many commitment issues and the data was always changing!*

---

# RustMarket Tracker

![RustMarket Tracker](https://github.com/user-attachments/assets/395f2a6d-dcdb-4029-8633-342128b9c9b0)

A comprehensive market tracking application for Rust gaming servers that helps you monitor vending machines, detect undercuts, and optimize your trading strategy.

## Features

### 🏪 Market Tracking System
- **Dual Panel Interface**: Separate views for your offers and competing offers
- **Real-time Undercut Detection**: Audio alerts and visual warnings when competitors undercut your prices
- **Currency Filtering**: Filter by Scrap, HQM, or custom currencies
- **Manual Offer Entry**: Add custom offers when no owned machines are detected
- **Auto-refresh**: Updates every 30 seconds with manual refresh option

### 🎯 Advanced Market Filtering
- **"Match My Offers" Toggle**: Filter competing offers to show only items matching your inventory
- **Visual Feedback**: Clear display of filtered results with "x/y offers" format
- **Persistent State**: Your filter preferences are saved across sessions

### 🔧 Machine Management
- **Ownership Claims System**: Claim and manage vending machines
- **Coordinate Display**: Precise map locations for each machine
- **Map Focus**: Quick navigation to specific machines
- **Visual Indicators**: Owned machines highlighted on the interactive map

### 🗺️ Interactive Map
- **Clustering System**: Organized display of machine locations
- **Search Functionality**: Find items across all vending machines
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile

### 🐳 Docker Support
- **Containerized Deployment**: Easy setup with Docker and Docker Compose
- **Production Ready**: Optimized for server deployment

## Quick Start

1. Clone the repository
2. Copy `.env.example` to `.env` and configure your server connection
3. Run `npm install && npm start`
4. Open `http://localhost:3000` in your browser

## Setup Requirements

- Node.js 18+ (or 20/22 LTS)
- Rust server pairing details (IP, port, player ID, and token)

## Pairing Guide

1. Register with Rust+ Companion: `npx @liamcottle/rustplus.js fcm-register`
2. Listen for pairing: `npx @liamcottle/rustplus.js fcm-listen`
3. Click "Pair" in-game and copy the JSON output
4. Add values to your `.env` file:
   ```
   RUST_ADDRESS=<ip>
   RUST_PORT=<port>
   RUST_PLAYER_ID=<playerId>
   RUST_PLAYER_TOKEN=<playerToken>
   ```

## API Endpoints

- `GET /api/health` – Connectivity check
- `GET /api/info` – Server information
- `GET /api/vending-machines` – All vending machine data
- `GET /api/map` – Map metadata
- `GET /api/map.jpg` – Map image

## Docker Deployment

For containerized deployment, see [README-Docker.md](README-Docker.md) for detailed instructions.

## Troubleshooting

- **Connection Issues**: Check firewall settings or enable proxy mode with `RUST_USE_FACEPUNCH_PROXY=true`
- **Rate Limits**: Increase TTL values in configuration for large maps
- **Missing Item Names**: Add mappings to `data/items.json`

---

*Despite the AI quirks, this market tracker turned out surprisingly amazing! Just don't blame me if it occasionally tries to sell you a rock for 10,000 scrap. Even AI has dreams of becoming a successful trader.*
