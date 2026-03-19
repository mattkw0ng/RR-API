# 📑 Index: Local Development Setup Guides

## Quick Navigation

**Choose one based on your style:**

### 🏃 I just want to start - 5 minute version
→ Read: **`LOCAL_DEVELOPMENT_QUICKSTART.md`**
- TL;DR summary
- Essential changes table
- Quick commands
- Checklist

### 🔍 I want exact line numbers and code
→ Read: **`LOCAL_CHANGES_QUICK_REFERENCE.md`**
- File-by-file breakdown
- Exact line numbers
- Before/after code snippets
- Changes by priority (🔴🟠🟡🟢)

### 📖 I want detailed explanations
→ Read: **`LOCAL_SETUP.md`**
- Comprehensive guide
- Section by section
- Troubleshooting
- Why each change matters

### 📊 I'm a visual learner
→ Read: **`CHANGES_VISUAL_REFERENCE.md`**
- Architecture diagrams
- File change maps
- Configuration matrices
- Dependency graphs

### 💾 Copy-paste template
→ Read: **`.env.example`**
- Ready-to-fill template
- Instructions for each value
- Docker commands
- Verification checklist

---

## The Three Essential Files to Edit

### 1️⃣ Create `.env` (NEW FILE)
```bash
cp .env.example .env
# Then fill in values from .env.example guide
```

### 2️⃣ Edit `config/config.js` (LINE 1)
```javascript
// Change CLIENT_URL
// See: LOCAL_CHANGES_QUICK_REFERENCE.md section 1
```

### 3️⃣ Edit `server.js` (LINES 46, 52-63)
```javascript
// Change: Redis URL, Session secret, Cookie domain/secure, PORT
// See: LOCAL_CHANGES_QUICK_REFERENCE.md section 2
```

### 4️⃣ Edit `utils/sendEmail.js` (LINES 11-32, 72, 117, 121-126)
```javascript
// Change: Email user, from/cc addresses, URLs in templates
// See: LOCAL_CHANGES_QUICK_REFERENCE.md section 3
```

---

## Files Overview

| File | Purpose | When to Read |
|------|---------|--------------|
| `LOCAL_DEVELOPMENT_QUICKSTART.md` | Overview & summary | First thing to read |
| `LOCAL_CHANGES_QUICK_REFERENCE.md` | Exact changes needed | When making edits |
| `LOCAL_SETUP.md` | Detailed explanations | If you have questions |
| `CHANGES_VISUAL_REFERENCE.md` | Diagrams & visuals | To understand architecture |
| `.env.example` | Configuration template | To set up environment vars |
| `LOCAL_SETUP.md` | PostgreSQL & Google setup | If setting up from scratch |

---

## By Use Case

### 🎯 "I just cloned the repo and want to run it locally"
1. Read: `LOCAL_DEVELOPMENT_QUICKSTART.md` (3 min)
2. Copy: `.env.example` to `.env`
3. Read: `.env.example` to fill in values (10 min)
4. Run: Start services (Redis, PostgreSQL) (5 min)
5. Run: `npm install && node server.js` (5 min)
6. Done! ✅

### 🔧 "I need to know exactly what to change in each file"
1. Read: `LOCAL_CHANGES_QUICK_REFERENCE.md` (10 min)
2. Go file-by-file and make changes
3. Create `.env` with values
4. Run tests

### 🤔 "I don't understand why something needs to change"
1. Read: `LOCAL_SETUP.md` (15 min)
2. Find your question in the explanations
3. Understand the "why" behind each change

### 🎨 "I'm visual and want to see the big picture"
1. Read: `CHANGES_VISUAL_REFERENCE.md` (10 min)
2. Check architecture diagrams
3. Verify configuration matrix
4. Make changes with confidence

### ⚠️ "I'm getting errors running locally"
1. Check: `.env.example` "Troubleshooting" section
2. Read: `LOCAL_SETUP.md` "Troubleshooting" section
3. Verify your services are running (Redis, PostgreSQL)
4. Check `.env` values are correct

---

## 30-Second Summary

**What needs to change:**
- Frontend/backend URLs from `rooms.sjcac.org` → `localhost`
- Database from AWS RDS → local PostgreSQL
- Email from `rooms@sjcac.org` → your test email
- Session/cookie settings for local development
- 5 key files + 1 new `.env` file

**Why:**
- Local development needs different hostnames, ports, credentials than production
- Environment variables keep sensitive data out of code
- `.env` stays private (not committed to Git)

**How long:**
- 30 minutes to complete all changes
- 5 minutes with this guide

---

## Files Affected (Summary)

### 🔴 MUST CHANGE (4 files)
- [ ] `config/config.js` — Frontend URL
- [ ] `server.js` — Session, cookies, port
- [ ] `utils/sendEmail.js` — Email addresses and URLs
- [ ] `.env` (create new) — All environment variables

### 🟠 SHOULD CHANGE (1 file)
- [ ] `db.js` — Verify DATABASE_URL

### 🟡 OPTIONAL CHANGE (1 file)
- [ ] `utils/webhook-utils.js` — Webhook URL

### 🟢 NO CHANGES NEEDED (4 files)
- ✅ `events.js` — Already uses process.env
- ✅ `rooms.js` — Already uses database
- ✅ `utils/authorize.js` — Already uses credentials.json
- ✅ `package.json` — No changes

---

## Variables You'll Need (11 Total)

### From Google (2)
- Google OAuth credentials (from `json/credentials.json`)
- 3 Google Calendar IDs

### From Gmail (2)
- Gmail address for sending
- Gmail App Password

### For PostgreSQL (3-4)
- Host: `localhost`
- Port: `5432`
- Username: `postgres` (or custom)
- Password: (your choice)
- Database: `room_reservation_dev`

### For Redis (1)
- `redis://localhost:6379`

### For Security (2)
- Session secret: (any random string)
- Environment: `development`

### For Frontend (1)
- Frontend URL: `http://localhost:3000`

---

## Commands You'll Run

```bash
# 1. Set up environment
cp .env.example .env
# Edit .env with your values

# 2. Start services (in separate terminals or Docker)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password -e POSTGRES_DB=room_reservation_dev postgres:14
docker run -d -p 6379:6379 redis:7

# 3. Install and run
npm install
node server.js

# 4. In another terminal, start frontend
cd ../frontend  # or wherever your React app is
npm start
```

---

## Verification

After setup, verify:
```bash
# Backend running?
curl http://localhost:5000

# Database connected?
psql -U postgres -h localhost -d room_reservation_dev -c "SELECT 1;"

# Redis connected?
redis-cli ping  # Should return "PONG"

# Frontend running?
curl http://localhost:3000
```

---

## Next Steps

1. **Pick a guide** above based on your preference
2. **Read** the guide (5-15 minutes depending on detail level)
3. **Make changes** using the reference guide
4. **Create `.env`** from template
5. **Start services** (Redis, PostgreSQL)
6. **Run** `npm install && node server.js`
7. **Test** by visiting frontend
8. **Debug** using the troubleshooting sections

---

## Still Have Questions?

| Question | Answer in |
|----------|-----------|
| What is this value? | `LOCAL_SETUP.md` |
| What line do I change? | `LOCAL_CHANGES_QUICK_REFERENCE.md` |
| How do I get this value? | `.env.example` |
| Why this change? | `LOCAL_SETUP.md` |
| Error when running | `LOCAL_SETUP.md` Troubleshooting |
| Architecture overview | `CHANGES_VISUAL_REFERENCE.md` |
| Just want to start | `LOCAL_DEVELOPMENT_QUICKSTART.md` |

---

## 📝 Document Cheat Sheet

```
Start here          → LOCAL_DEVELOPMENT_QUICKSTART.md
Making changes      → LOCAL_CHANGES_QUICK_REFERENCE.md
Deep dive           → LOCAL_SETUP.md
Visual learner      → CHANGES_VISUAL_REFERENCE.md
Fill in values      → .env.example
Stuck?              → LOCAL_SETUP.md Troubleshooting
```

---

**Good luck! 🚀 You've got this!**

