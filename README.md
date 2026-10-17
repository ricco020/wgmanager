# WireGuard Manager (by VPNSmith)

Micro-SaaS: hosted multi-server WireGuard configuration manager. Free (1 server, 3 peers) and Pro (9 EUR/month, Stripe).

- Stack: Next.js 15 (App Router, server actions), Prisma 6, PostgreSQL, qrcode. No native modules.
- Keys: X25519 via Node crypto, stored AES-256-GCM encrypted (`ENCRYPTION_SECRET`).
- Auth: email + scrypt password hash, signed HttpOnly session cookie (`SESSION_SECRET`).
- Billing: Stripe Checkout (subscription), `metadata[projet]=wgmanager`. Pro access is derived from Stripe
  (`user.proUntil` = period end + 3 days grace), refreshed on return from checkout, on webhook, and lazily when lapsed.
- Deploy: Railway, Docker build on push. `npm start` runs `prisma db push` then `next start`.
- Local build: copy to ext4 (`/tmp`), `npm ci`, `npm run build`. Never build on `/mnt/c`.

Env: see `.env.example`. State and metrics: `NDD/state/saas/wgmanager.md`.
