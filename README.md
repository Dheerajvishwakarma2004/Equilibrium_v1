# Equilibrium

Equilibrium is a privacy-first mental health and wellness platform designed to help users track mood, sleep, journaling, digital wellbeing, and community support through a mobile app backed by a lightweight Express API.

The project is split into two main parts:

- Frontend: React Native + Expo mobile app
- Backend: Node.js + Express + MongoDB API for auth, community, and help directory features

This repository is organized to keep sensitive personal health data on-device while using the backend for authentication, anonymous community features, and curated support resources.

## Project overview

Equilibrium focuses on helping users understand their wellbeing through:

- Mood tracking and wellness scoring
- Journal entries and sentiment-aware reflection
- Sleep tracking and consistency analysis
- Daily and weekly wellness insights
- Community forum discussions
- Professional help directory and emergency support
- Privacy-centered local data handling and encrypted storage

## Key technologies

### Frontend
- React Native
- Expo SDK
- React Navigation
- AsyncStorage / SecureStore
- CryptoJS for local encryption
- Expo Notifications, Device, and Location APIs
- Charting libraries for reports and insight visualization

### Backend
- Node.js
- Express.js
- MongoDB with Mongoose
- JWT authentication
- bcryptjs for password hashing
- Cron-based maintenance jobs
- CORS-enabled REST API

## Repository structure

```text
main repo/
├── backend/                 # Express API server
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── server.js
│   ├── package.json
│   └── .env
├── frontend/                # Expo mobile app
│   ├── components/
│   ├── config/
│   ├── screens/
│   ├── services/
│   ├── App.js
│   ├── package.json
│   ├── PROJECT_DOCUMENTATION.md
│   └── .env
├── update-ip.js             # Auto-updates local IP for Expo and API connectivity
├── .vscode/                 # Local dev config and tasks
├── .gitignore
└── README.md
```

## Features

### Mobile app features
- Dashboard with wellness overview
- Journal for personal reflections
- Mood and habit tracking
- Sleep data analysis and monitoring
- Reports and wellness insights
- Privacy settings and consent controls
- Community forum for support discussions
- Help directory for therapists, hotlines, and local resources
- Emergency and crisis support screens

### Backend features
- User registration and login
- JWT-based authentication
- Community posts and comments
- Alerts and maintenance processing
- Professional help directory APIs
- Aggregated reporting endpoints

## Privacy-first architecture

A defining principle in this project is that sensitive health data stays local to the user device whenever possible.

The frontend is designed to store and process wellness and sleep data locally, while the backend is used for:

- account management
- authentication
- non-sensitive community data
- support and directory resources

For deeper implementation details and architecture notes, see the documentation in [frontend/PROJECT_DOCUMENTATION.md](frontend/PROJECT_DOCUMENTATION.md).

## Prerequisites

Before running the project locally, make sure you have:

- Node.js 18+ recommended
- npm
- MongoDB instance running locally or using MongoDB Atlas
- Expo CLI / Expo Go for the mobile app
- A local machine IP for the Expo app to reach the backend during development

## Environment setup

### Backend
Create a `.env` file inside the `backend` folder with variables similar to:

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/equilibrium
JWT_SECRET=your_super_secret_key
IP=your_local_ip_address
```

Notes:
- `IP` is used for the backend to allow Expo development connections.
- `JWT_SECRET` should be a strong, private value.

### Frontend
Create a `.env` file inside the `frontend` folder with variables similar to:

```env
LOCAL_IP=your_local_ip_address
PRODUCTION_API_URL=http://your-production-api-url.com/api/v1
```

The repository includes a helper script at [update-ip.js](update-ip.js) that automatically detects your local IPv4 and updates the required env files.

## Running the project locally

### 1) Install backend dependencies

```bash
cd backend
npm install
```

### 2) Start the backend server

```bash
cd backend
npm run dev
```

If you prefer the production-like script:

```bash
cd backend
npm start
```

### 3) Install frontend dependencies

```bash
cd frontend
npm install
```

### 4) Start the Expo app

```bash
cd frontend
npx expo start
```

Then run the app in:

- an Android emulator
- an iOS simulator
- Expo Go on a mobile device
- a web browser if supported by the project setup

## Common development notes

- Expo mobile apps running on a device need the backend to be accessible on the same local network or via a network-safe IP.
- The helper script [update-ip.js](update-ip.js) keeps the local backend/frontend network addresses aligned.
- If the API fails to connect from the app, confirm that both the Expo app and backend are using the same local network IP.

## Scripts

### Backend package scripts
```json
{
  "start": "node server.js",
  "dev": "nodemon server.js"
}
```

### Frontend package scripts
```json
{
  "start": "expo start",
  "android": "expo run:android",
  "ios": "expo run:ios",
  "web": "expo start --web"
}
```

## Documentation

This README gives a practical overview of the project. For deeper technical information, see:

- [frontend/PROJECT_DOCUMENTATION.md](frontend/PROJECT_DOCUMENTATION.md)

That documentation covers:

- planned and implemented architecture
- local-first sleep data design
- wellness insights engine
- data model notes
- privacy strategy
- app feature breakdown

## Current status

This project is structured as a working mobile wellness app with a supporting API layer and a detailed architecture document. It is best suited for local development and experimentation in a privacy-conscious wellness product workflow.

## Contributing

To contribute:

1. Create a feature branch.
2. Keep changes focused on the relevant frontend or backend area.
3. Update documentation when behavior or setup changes.
4. Validate the app and API locally before opening a PR.


