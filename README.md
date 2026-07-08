# AI Assistant App

A chat app I built with a React Native (Expo) frontend and a Node/Express backend, powered by Groq's free API (Llama 3.3).

Started as a way to learn full-stack + mobile dev, ended up turning into a full ChatGPT-style clone with auth, multi-chat history, voice input, document uploads, and even image generation.

## What it does

- Chat with an AI (streaming responses, feels instant thanks to Groq)
- Sign up / log in (JWT auth, passwords hashed with bcrypt — no Firebase, just a simple local backend)
- Multiple chats saved in a sidebar, like ChatGPT
- Text-to-speech — tap the speaker icon to have AI responses read aloud
- Upload PDFs/documents and ask questions about them
- Generate images just by typing something like "create an image of a cyberpunk city" (uses Pollinations.ai, free, no key needed)
- Copy / edit / regenerate messages
- Dark, minimal UI — no clutter

## Stack

**Frontend:** Expo (React Native), React Navigation, AsyncStorage for local session storage

**Backend:** Node.js + Express, Groq SDK for the LLM, JWT for auth, local JSON file storage (`users.json`, `chats.json`) — no database yet, kept it simple since this started as a personal project

**Other:** `react-native-sse` for streaming on mobile, `pdf-parse` for document text extraction, Pollinations.ai for image gen

## Running it locally

### Backend
```bash
cd App/backend
npm install
cp .env.example .env   # add your own Groq API key + JWT secret here
npm run dev
```

### Mobile
```bash
cd App/mobile
npm install
npx expo start
```
Scan the QR code with Expo Go on your phone. Make sure your phone and computer are on the same WiFi, and update the backend URL in `config.js` to your computer's local IP (not `localhost`).

## Notes

- This uses local JSON files for storage, which works fine for testing but isn't meant for production/many concurrent users — SQLite or a real DB would be the next step if this grows.
- Groq's free tier has rate limits, so heavy use might hit a "too many requests" wall.
- Image generation isn't sent through Groq (it's not a vision model) — it's a separate free API (Pollinations) triggered by keywords in your message.

## Why I built this

Wanted to understand how apps like ChatGPT/Claude actually work under the hood — auth, streaming, chat history, all of it — without paying for expensive APIs. Turned into a pretty solid learning project.