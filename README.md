# EasyMeet

Nigeria's trusted marketplace connecting customers with verified local professionals and businesses.

## Overview

EasyMeet is a platform designed to bridge the gap between service seekers and trusted professionals across Nigeria. Whether you need a photographer, tutor, electrician, or any other service provider, EasyMeet makes it easy to find, verify, and book professionals in your area.

## Features

- **Verified Profiles** -- Every professional undergoes identity verification and portfolio review before going live
- **Easy Booking** -- Browse, compare, and book services in just a few taps
- **Secure Messaging** -- Chat privately with professionals before committing
- **Escrow Payments** -- Funds are held safely until the service is completed
- **Real Reviews** -- Read authentic feedback from verified customers
- **Analytics Dashboard** -- Track performance, reviews, and earnings in real-time

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4
- **Routing:** TanStack Router
- **UI Components:** Radix UI, shadcn/ui
- **Backend:** Supabase (Authentication, Database, Storage)
- **Build Tool:** Vite
- **Package Manager:** Bun

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- Supabase account (for backend services)

### Installation

```bash
# Clone the repository
git clone 

# Navigate to the project directory
cd EasyMeet

# Install dependencies
bun install
```

### Environment Variables

Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Development

```bash
# Start the development server
bun run dev
```

The application will be available at `http://localhost:5173`

### Production Build

```bash
# Build for production
bun run build

# Preview the production build
bun run preview
```

## Project Structure

```
EasyMeet/
├── src/
│   ├── components/      # Reusable UI components
│   │   ├── ui/          # shadcn/ui components
│   │   └── *.tsx        # Custom components
│   ├── routes/          # TanStack Router file-based routes
│   ├── lib/             # Utilities, providers, and helpers
│   ├── styles.css       # Global styles and theme configuration
│   └── main.tsx         # Application entry point
├── public/              # Static assets
├── supabase/            # Supabase configuration and migrations
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

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is proprietary software. All rights reserved.
