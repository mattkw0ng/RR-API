# 🚀 Running Room Reservation System Locally - Quick Start

## Summary

I've identified all the variable names and configuration points you need to change. Three reference documents have been created:

1. **`LOCAL_SETUP.md`** — Comprehensive guide with explanations
2. **`LOCAL_CHANGES_QUICK_REFERENCE.md`** — Exact files, line numbers, and before/after code
3. **`.env.example`** — Copy-paste ready environment variables template

---

## The Essentials (TL;DR)

### Step 1: Create `.env` file
Copy from `.env.example` and fill in:
```bash
cp .env.example .env
# Edit .env with your values
```

### Step 2: Key changes needed

| What | Where | Local Value |
|------|-------|------------|
| Frontend URL | `config/config.js` + `.env` | `http://localhost:3000` |
| Backend Port | `server.js` + `.env` | `5000` (or any free port) |
| Database | `.env` | `postgresql://postgres:password@localhost:5432/room_reservation_dev` |
| Redis | `server.js` + `.env` | `redis://localhost:6379` |
| Email (sender) | `utils/sendEmail.js` + `.env` | Your test email |
| Email (password) | `.env` | Gmail App Password |
| Google Calendars | `.env` | Your 3 calendar IDs |
| Session secret | `server.js` + `.env` | Any random string |
| Cookie domain | `server.js` + `.env` | `localhost` |
| Cookie secure | `server.js` | `false` for local HTTP |

### Step 3: Start services locally

```bash
# Start PostgreSQL (Docker)
docker run -d -e POSTGRES_PASSWORD=password -e POSTGRES_DB=room_reservation_dev -p 5432:5432 postgres:14

# Start Redis (Docker)
docker run -d -p 6379:6379 redis:7

# Start Node backend
npm install
node server.js

# Backend will be at http://localhost:5000
```

### Step 4: Start frontend
In your frontend project:
```bash
npm start
# Frontend will be at http://localhost:3000
```

---

## All Files That Need Changes

### Required Changes
- [ ] `config/config.js` — Update CLIENT_URL
- [ ] `server.js` — Update Redis URL, session secret, cookie settings, port
- [ ] `utils/sendEmail.js` — Update email address, URLs in templates
- [ ] `db.js` — Update or ensure DATABASE_URL in `.env`
- [ ] `.env` (create new) — Add all environment variables

### Optional Changes (Already using process.env)
- [ ] `events.js` — Just ensure `.env` has calendar IDs
- [ ] `utils/webhook-utils.js` — Update webhook URL in `.env`
- [ ] `utils/event-utils.js` — Ensure `.env` has calendar IDs

### No Changes Needed
- ✅ `auth.js` — Uses OAuth via credentials.json
- ✅ `rooms.js` — Uses database and process.env
- ✅ `utils/authorize.js` — Reads from credentials.json
- ✅ `package.json` — No changes needed
- ✅ `json/credentials.json` — Already set up (DO NOT COMMIT)

---

## Hardcoded Values Found & Their Fixes

### Frontend URLs (in email templates & config)
```bash
❌ https://rooms.sjcac.org → ✅ http://localhost:3000
❌ https://api.rooms.sjcac.org → ✅ http://localhost:5000
```

### Email Addresses
```bash
❌ rooms@sjcac.org → ✅ your-test-email@gmail.com
❌ celine.bower@sjcac.org → ✅ admin@example.com
```

### Organization-specific Links (in email templates)
```bash
❌ https://sjcac.churchcenter.com → ✅ Remove or replace with your org
```

### Session & Security
```bash
❌ domain: '.sjcac.org' → ✅ domain: 'localhost'
❌ secure: true → ✅ secure: false  (for HTTP)
❌ secret: 'SuperSecretSecret3' → ✅ Use random string from .env
```

### Database & Cache
```bash
DATABASE_URL=postgresql://postgres:password@localhost:5432/room_reservation_dev
REDIS_URL=redis://localhost:6379
```

### Google Calendar IDs
```bash
# Get these from https://calendar.google.com Settings
PENDING_APPROVAL_CALENDAR_ID=your-id@group.calendar.google.com
APPROVED_CALENDAR_ID=your-id@group.calendar.google.com
PROPOSED_CHANGES_CALENDAR_ID=your-id@group.calendar.google.com
```

---

## Single-File Examples

### Updated `config/config.js`
```javascript
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const ALLOWED_CLIENT_URLS = [
  process.env.CLIENT_URL || "http://localhost:3000",
  "http://127.0.0.1:3000"
];
module.exports = {CLIENT_URL, ALLOWED_CLIENT_URLS};
```

### Critical `.env` values
```bash
CLIENT_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:password@localhost:5432/room_reservation_dev
REDIS_URL=redis://localhost:6379
EMAIL_USER=your-test-email@gmail.com
NODEMAILER_PASS=your-gmail-app-password
PENDING_APPROVAL_CALENDAR_ID=abc@group.calendar.google.com
APPROVED_CALENDAR_ID=def@group.calendar.google.com
PROPOSED_CHANGES_CALENDAR_ID=ghi@group.calendar.google.com
NODE_ENV=development
COOKIE_DOMAIN=localhost
SESSION_SECRET=random-secret-string
```

---

## Checklist Before Running

- [ ] `.env` file created in project root
- [ ] All 7 calendar/database/email values in `.env` are filled in
- [ ] PostgreSQL running on localhost:5432
- [ ] Redis running on localhost:6379
- [ ] `config/config.js` updated with localhost URLs
- [ ] `server.js` cookie settings for localhost
- [ ] `utils/sendEmail.js` updated with your test email
- [ ] `json/credentials.json` has `http://localhost:5000` in redirect URIs
- [ ] `.gitignore` includes `.env` and `json/token.json`
- [ ] Frontend `.env` or config has `REACT_APP_API_URL=http://localhost:5000`

---

## Quick Commands

```bash
# Generate a secure random string for SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Test database connection
psql -U postgres -h localhost -d room_reservation_dev -c "SELECT 1"

# Test Redis connection
redis-cli ping  # Should return "PONG"

# Check if .env is ignored by git
git check-ignore .env  # Should return ".env"

# Start the app
npm install
node server.js
```

---

## When You're Ready to Deploy

1. Update all `localhost` URLs to your production domain
2. Set `NODE_ENV=production`
3. Set `secure: true` for cookies
4. Use production database URL
5. Use production email account
6. Update webhook URL to production endpoint
7. Commit `.env` to a secure vault (never to Git)

---

## Support Docs

- `LOCAL_SETUP.md` — Detailed explanations of each change
- `LOCAL_CHANGES_QUICK_REFERENCE.md` — Line numbers and code snippets
- `.env.example` — Copy-paste ready template with all variables
- `README.md` — Original project documentation

---

**Questions?** Check the relevant reference doc or search for the specific file/value you need to change.

