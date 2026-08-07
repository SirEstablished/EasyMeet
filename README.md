<div align="center">

# EasyMeet

**Nigeria's trusted marketplace connecting customers with verified local professionals and businesses.**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.2-06B6D4?logo=tailwindcss)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3FCF8E?logo=supabase)](https://supabase.com)

</div>

---

## Overview

EasyMeet is a full-featured platform designed to bridge the gap between service seekers and trusted professionals across Nigeria. Whether you need a photographer, tutor, electrician, or any other service provider, EasyMeet makes it easy to find, verify, and book professionals in your area — with payments protected by escrow.

## Features

### For Customers
- **Smart Dashboard** — Spending summary, order stats, top-rated professionals, and recent orders at a glance
- **Browse & Discover** — Search professionals by category, location, ratings, and verification status
- **Service Categories** — Quick-access chips for Technology, Design, Beauty, Education, Legal, Finance, and more
- **Secure Escrow Payments** — Funds held safely until the service is completed to your satisfaction
- **Real Reviews** — Read authentic feedback from verified customers

### For Professionals & Businesses
- **Analytics Dashboard** — Track earnings, completed orders, repeat customers, and revenue trends with sparkline charts
- **Service & Product Management** — Create, edit, and manage your service offerings and product listings
- **Wallet & Withdrawals** — Real-time balance tracking, instant withdrawal requests, and auto-withdrawal settings
- **Order Management** — View incoming orders, track escrow status, and manage payouts

### Platform-Wide
- **Verified Profiles** — Identity verification with blue, white, and gold tick badges
- **Real-Time Messaging** — Private chat with integrated escrow workflow
- **Escrow Protection** — Multi-stage escrow system with dispute resolution
- **Social Feed** — Share updates and engage with the community
- **Responsive Design** — Seamless experience across mobile, tablet, and desktop

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript 5.8, Tailwind CSS 4.2 |
| **Routing** | TanStack Router (file-based) |
| **UI Components** | Radix UI, shadcn/ui, Lucide Icons |
| **Backend** | Supabase (Auth, PostgreSQL, Realtime, Storage) |
| **Build Tool** | Vite 7 |
| **Package Manager** | Bun |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ or [Bun](https://bun.sh/)
- [Supabase](https://supabase.com/) account (free tier works)

### Installation

```bash
# Clone the repository
git clone https://github.com/Promise278/EasyMeet.git

# Navigate to the project directory
cd EasyMeet

# Install dependencies
bun install
```

### Environment Variables

Create a `.env.local` file in the root directory:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Development

```bash
bun run dev
```

The app will be available at `http://localhost:5173`

### Production Build

```bash
bun run build
bun run preview
```

## Project Structure

```
EasyMeet/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── ui/              # shadcn/ui primitives
│   │   ├── ProfileView.tsx  # Full profile page with completion tracking
│   │   ├── ProfileCard.tsx  # Compact profile card for browsing
│   │   ├── EscrowPanel.tsx  # In-chat escrow workflow
│   │   ├── StarRating.tsx   # Star rating display
│   │   └── ...
│   ├── routes/              # TanStack Router file-based routes
│   │   ├── _authenticated/  # Protected dashboard, wallet, orders, etc.
│   │   └── index.tsx        # Landing page
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utilities, providers, escrow logic
│   ├── integrations/        # Supabase client & types
│   └── styles.css           # Global styles & theme
├── supabase/
│   └── migrations/          # Database schema & RPC functions
├── public/                  # Static assets
└── package.json
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server |
| `bun run build` | Build for production |
| `bun run preview` | Preview production build |
| `bun run lint` | Run ESLint |
| `bun run format` | Format code with Prettier |

## Key Architecture Decisions

- **File-based routing** with TanStack Router for type-safe navigation
- **Row-level security** via Supabase RLS policies for data protection
- **Real-time updates** using Supabase Realtime subscriptions for live wallet balances and order status
- **Escrow system** with multi-stage lifecycle: pending payment → holding → in progress → released → completed
- **AI-powered features** for role detection and agreement suggestion in escrow negotiations

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is proprietary software. All rights reserved.

---

<div align="center">

**Built with care for the Nigerian market**

</div>
