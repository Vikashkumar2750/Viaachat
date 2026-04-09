# 💬 ViaaChat

> **Secure, encrypted real-time messaging, voice/video calling, and live rooms — built with React + Supabase.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-viaachat.vercel.app-10b981?style=for-the-badge&logo=vercel)](https://viaachat.vercel.app)
[![Built with React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react)](https://react.dev)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20Realtime-3ecf8e?style=flat-square&logo=supabase)](https://supabase.com)
[![Deployed on Vercel](https://img.shields.io/badge/Deployed-Vercel-black?style=flat-square&logo=vercel)](https://vercel.com)

---

## ✨ Features

| Feature | Details |
|---|---|
| 💬 **Real-time Chat** | 1-1 and group messaging with image & voice note support |
| 📞 **Voice Calls** | WebRTC peer-to-peer with STUN/TURN fallback |
| 🎥 **Video Calls** | Face-to-face calling with camera toggle |
| 🎲 **Random Calls** | Auto-match with strangers (friends-only re-calling) |
| 🏠 **Live Rooms** | Multi-user audio rooms with seat management |
| 👤 **Google + Email + Guest** | Multiple auth methods |
| 🔒 **End-to-End Encrypted** | All messages over TLS, WebRTC DTLS |
| 👫 **Friend System** | Send/accept requests; auto-creates chat inbox |
| 📸 **Status Updates** | 24-hour stories with image/text support |
| 🌍 **Communities** | Public community boards |
| 🔇 **Block/Mute** | Per-user blocking and chat muting |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project

### 1. Clone & Install

```bash
git clone https://github.com/Vikashkumar2750/Viaachat.git
cd Viaachat
npm install
```

### 2. Configure Environment

Create a `.env` file in the root:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Get these from: **Supabase Dashboard → Settings → API**

### 3. Set Up the Database

Run the full `schema.sql` in **Supabase Dashboard → SQL Editor**:

```
Supabase Dashboard → SQL Editor → New Query → paste schema.sql → Run
```

### 4. Enable Auth Providers

In **Supabase Dashboard → Authentication → Providers**:

| Provider | Setting |
|---|---|
| **Email** | Enable (optionally disable email confirmation for dev) |
| **Google** | Enable → add Client ID + Secret from [Google Cloud Console](https://console.cloud.google.com) |
| **Anonymous Sign-ins** | Enable (for Guest login) |

### 5. Add Redirect URLs (for Google Login)

**Supabase Dashboard → Authentication → URL Configuration → Redirect URLs:**

```
https://viaachat.vercel.app/**
http://localhost:5173/**
```

> ⚠️ Without this, Google OAuth will fail with a "redirect_uri_mismatch" error.

### 6. Run Locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 + TypeScript + Vite |
| **Styling** | Tailwind CSS v4 |
| **Database** | Supabase (PostgreSQL) |
| **Auth** | Supabase Auth (Google OAuth, Email, Anonymous) |
| **Real-time** | Supabase Realtime (postgres_changes) |
| **Calls** | WebRTC (RTCPeerConnection) + Supabase signaling |
| **Deployment** | Vercel (auto-deploy from GitHub main) |

---

## 📁 Project Structure

```
Viaachat/
├── components/
│   ├── CallScreen.tsx          # WebRTC voice/video call UI
│   ├── CallsScreen.tsx         # Call history + random call
│   ├── ChatDetailScreen.tsx    # 1-1 / group chat messages
│   ├── CommunitiesScreen.tsx   # Community board
│   ├── CreateContactModal.tsx  # New contact dialog
│   ├── CreateGroupModal.tsx    # New group dialog
│   ├── DeleteConfirmationModal.tsx
│   ├── Fab.tsx                 # Floating action button
│   ├── GroupDetailScreen.tsx   # Group info & settings
│   ├── IncomingCallModal.tsx   # Incoming call overlay
│   ├── Login.tsx               # Auth screen
│   ├── PostCallModal.tsx       # Post-random-call friend prompt
│   ├── ProfileDashboard.tsx    # User profile & settings
│   ├── RoomDetailScreen.tsx    # Live room detail
│   ├── RoomsScreen.tsx         # Room browser
│   ├── UpdatesScreen.tsx       # Status/stories screen
│   └── UserProfileModal.tsx    # View another user's profile
├── hooks/
│   └── useRoomAudio.ts         # Multi-user room WebRTC mesh
├── App.tsx                     # Main app shell + routing
├── supabase.ts                 # Supabase client + auth helpers
├── schema.sql                  # Full PostgreSQL schema + RLS
├── types.ts                    # TypeScript type definitions
├── index.css                   # Global styles + animations
└── vercel.json                 # Vercel deployment config
```

---

## 🔒 Security

- **Row Level Security (RLS)** enabled on all tables
- Users can only read/write their own data
- Call signals gated to caller + receiver only
- ICE candidates open to all authenticated users (required for WebRTC)
- Guest (anonymous) users have the same RLS restrictions as regular users

---

## 📞 How Calls Work

```
User A clicks "Random Call"
       ↓
Added to call_queue table
       ↓
Supabase Realtime sees User B also waiting
       ↓
Matchmaker auto-assigns roles (lower UUID = caller)
       ↓
Both users get activeCall state → CallScreen mounts
       ↓
Caller: creates RTCPeerConnection → SDP offer → writes to call_signals
Receiver: polls call_signals for offer (up to 22s) → creates answer
       ↓
ICE candidates exchanged via ice_candidates table
       ↓
WebRTC P2P connection established
       ↓
Audio routed through hidden <audio> element (always rendered)
       ↓
Call ends → PostCallModal prompts to add friend
```

---

## 🌐 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import repo at [vercel.com](https://vercel.com)
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy — every push to `main` auto-deploys

### Build Manually

```bash
npm run build   # outputs to /dist
```

---

## 🐛 Known Issues & Limitations

| Issue | Status |
|---|---|
| Images/voice stored as base64 in DB | ⚠️ Should migrate to Supabase Storage |
| Rooms use full-mesh WebRTC | ⚠️ Practical limit ~6 users; needs SFU for scale |
| Push notifications | ❌ Not implemented (needs FCM) |
| iOS Safari speaker routing | ⚠️ `setSinkId` not supported on iOS |

---

## 📄 License

MIT — free to use and modify.

---

<p align="center">Made with ❤️ by <a href="https://github.com/Vikashkumar2750">Vikash Kumar</a></p>
