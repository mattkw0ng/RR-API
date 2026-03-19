# 📊 Visual: What Needs to Change

## Architecture & Configuration Points

```
┌─────────────────────────────────────────────────────────────────┐
│                   PRODUCTION vs LOCAL SETUP                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  FRONTEND                                                         │
│  ┌────────────────────┐      ┌────────────────────┐              │
│  │ PRODUCTION         │      │ LOCAL              │              │
│  │ rooms.sjcac.org    │      │ localhost:3000     │              │
│  │ (Netlify)          │      │ (React dev server) │              │
│  └────────────────────┘      └────────────────────┘              │
│           ↓ API Calls               ↓ API Calls                  │
│                                                                   │
│  BACKEND                                                          │
│  ┌────────────────────┐      ┌────────────────────┐              │
│  │ PRODUCTION         │      │ LOCAL              │              │
│  │ api.rooms.sjcac.org│      │ localhost:5000     │              │
│  │ (EC2 Server)       │      │ (node server.js)   │              │
│  │ :5000              │      │ :5000              │              │
│  └────────────────────┘      └────────────────────┘              │
│           ↓                          ↓                            │
│                                                                   │
│  DATABASE                                                         │
│  ┌────────────────────┐      ┌────────────────────┐              │
│  │ PRODUCTION         │      │ LOCAL              │              │
│  │ AWS RDS PostgreSQL │      │ PostgreSQL:5432    │              │
│  │ (Managed)          │      │ (Docker or local)  │              │
│  └────────────────────┘      └────────────────────┘              │
│                                                                   │
│  CACHE                                                            │
│  ┌────────────────────┐      ┌────────────────────┐              │
│  │ PRODUCTION         │      │ LOCAL              │              │
│  │ AWS ElastiCache    │      │ Redis:6379         │              │
│  │ Redis (Managed)    │      │ (Docker)           │              │
│  └────────────────────┘      └────────────────────┘              │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Change Map

```
LOCAL DEVELOPMENT CHANGES
├── 📄 .env (CREATE NEW)
│   ├── NODE_ENV=development
│   ├── PORT=5000
│   ├── CLIENT_URL=http://localhost:3000
│   ├── DATABASE_URL=postgresql://postgres:password@localhost:5432/room_reservation_dev
│   ├── REDIS_URL=redis://localhost:6379
│   ├── EMAIL_USER=your-test-email@gmail.com
│   ├── NODEMAILER_PASS=your-gmail-app-password
│   ├── SESSION_SECRET=random-string
│   ├── COOKIE_DOMAIN=localhost
│   ├── PENDING_APPROVAL_CALENDAR_ID=...
│   ├── APPROVED_CALENDAR_ID=...
│   └── PROPOSED_CHANGES_CALENDAR_ID=...
│
├── ⚙️ config/config.js (MODIFY)
│   ├── ❌ CLIENT_URL = "https://rooms.sjcac.org"
│   └── ✅ CLIENT_URL = "http://localhost:3000"
│
├── ⚙️ server.js (MODIFY)
│   ├── Line 46: redis://localhost:6379 ✓ (OK)
│   ├── Line 52-54: Session secret → use .env
│   ├── Line 58: domain '.sjcac.org' → 'localhost'
│   ├── Line 59: secure: true → false (for HTTP)
│   └── Line 63: PORT = 5000 ✓ (OK)
│
├── ⚙️ utils/sendEmail.js (MODIFY)
│   ├── Line 12: user: 'rooms@sjcac.org' → process.env.EMAIL_USER
│   ├── Line 27: from: '...<rooms@sjcac.org>' → use .env
│   ├── Line 32: cc: 'rooms@sjcac.org' → use .env
│   ├── Line 72: 'https://rooms.sjcac.org' → process.env.CLIENT_URL
│   ├── Line 117: 'https://rooms.sjcac.org' → process.env.CLIENT_URL
│   ├── Line 121: Organization email → admin email
│   └── Line 122, 126: Organization URLs → comment out or replace
│
├── ⚙️ db.js (VERIFY/MODIFY)
│   ├── ✓ DATABASE_URL from .env
│   └── (Optional: Use individual DB_* env vars)
│
├── ✅ events.js (NO CHANGES)
│   ├── Already uses process.env.PENDING_APPROVAL_CALENDAR_ID
│   ├── Already uses process.env.APPROVED_CALENDAR_ID
│   └── Already uses process.env.PROPOSED_CHANGES_CALENDAR_ID
│
├── ✅ rooms.js (NO CHANGES)
│   └── Reads from database
│
├── ✅ utils/authorize.js (NO CHANGES)
│   └── Reads from credentials.json (already set up)
│
├── ⚙️ utils/webhook-utils.js (OPTIONAL)
│   ├── Line 22: 'https://api.rooms.sjcac.org/webhook'
│   └── → process.env.WEBHOOK_URL || 'http://localhost:5000/webhook'
│
└── 📋 .gitignore (VERIFY)
    ├── .env ✓
    ├── .env.local ✓
    ├── json/token.json ✓
    └── json/credentials.json ✓
```

---

## Configuration Values Matrix

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Component        │ Production               │ Local Development        │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Frontend URL     │ https://rooms.sjcac.org  │ http://localhost:3000    │
│ Backend URL      │ https://api.rooms.sjcac  │ http://localhost:5000    │
│ Backend Port     │ 5000                     │ 5000                     │
│ Database Host    │ AWS RDS (managed)        │ localhost                │
│ Database Port    │ 5432                     │ 5432                     │
│ Database SSL     │ Required                 │ Not required             │
│ Redis Host       │ AWS ElastiCache          │ localhost                │
│ Redis Port       │ 6379                     │ 6379                     │
│ Email Service    │ Gmail OAuth2              │ Gmail OAuth2             │
│ Email Sender     │ rooms@sjcac.org          │ your-test-email@gmail    │
│ Session Secret   │ (secure random)          │ (local random string)    │
│ Cookie Domain    │ .sjcac.org               │ localhost                │
│ Cookie Secure    │ true (HTTPS)             │ false (HTTP)             │
│ Session Store    │ Redis (AWS)              │ Redis (local)            │
│ Node Environment │ production               │ development              │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ All other values │ Same for both            │                          │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

---

## Environment Variables Dependency Graph

```
.env (Master Configuration)
├── NODE_ENV
│   └── Controls: secure flag, error handling, logging
├── PORT
│   └── Backend server: localhost:PORT
├── CLIENT_URL
│   └── Used by:
│       ├── config/config.js
│       ├── utils/sendEmail.js (email templates)
│       └── CORS configuration
├── DATABASE_URL
│   └── db.js → PostgreSQL connection
├── REDIS_URL
│   └── server.js → Session store & cache
├── SESSION_SECRET
│   └── server.js → Session encryption
├── COOKIE_DOMAIN
│   └── server.js → Session cookies
├── EMAIL_USER + NODEMAILER_PASS
│   └── utils/sendEmail.js → Email sending
├── PENDING_APPROVAL_CALENDAR_ID
│   └── events.js, utils/event-utils.js
├── APPROVED_CALENDAR_ID
│   └── events.js, utils/event-utils.js, utils/webhook-utils.js
├── PROPOSED_CHANGES_CALENDAR_ID
│   └── events.js, utils/event-utils.js, utils/webhook-utils.js
└── WEBHOOK_URL (optional)
    └── utils/webhook-utils.js
```

---

## Code Change Examples

### Before → After Pattern

```javascript
// PATTERN 1: Hardcoded String
❌ const CLIENT_URL = "https://rooms.sjcac.org";
✅ const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

// PATTERN 2: Email in Template
❌ cc: 'rooms@sjcac.org',
✅ cc: process.env.EMAIL_ADMIN || 'admin@example.com',

// PATTERN 3: Security Flag
❌ secure: true,
✅ secure: process.env.NODE_ENV === 'production',

// PATTERN 4: URL in Email Template
❌ <a href='https://rooms.sjcac.org/profile'>profile</a>
✅ <a href='${process.env.CLIENT_URL}/profile'>profile</a>

// PATTERN 5: Connection String
❌ const redisClient = createClient({ url: 'redis://localhost:6379' });
✅ const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
```

---

## Local vs Production Checklist

### 🟢 LOCAL DEVELOPMENT (.env + code changes)
```
NODE_ENV=development
CLIENT_URL=http://localhost:3000
PORT=5000
DATABASE_URL=postgresql://postgres:password@localhost:5432/room_reservation_dev
REDIS_URL=redis://localhost:6379
COOKIE_DOMAIN=localhost
secure=false (in code)
EMAIL_USER=your-test-email@gmail.com
SESSION_SECRET=any-random-string-here
```

### 🔴 PRODUCTION (.env + code changes)
```
NODE_ENV=production
CLIENT_URL=https://rooms.sjcac.org
PORT=5000
DATABASE_URL=postgresql://prod-user:prod-pass@prod-rds.amazonaws.com/room_reservation
REDIS_URL=redis://prod-cache.elasticache.amazonaws.com:6379
COOKIE_DOMAIN=.sjcac.org
secure=true (in code)
EMAIL_USER=rooms@sjcac.org
SESSION_SECRET=(use strong random string)
```

---

## Summary: Total Changes Required

| Category | Count | Priority |
|----------|-------|----------|
| Files to modify | 5 | HIGH |
| Files to verify | 3 | MEDIUM |
| New files to create | 1 (.env) | CRITICAL |
| Environment variables | 11 | CRITICAL |
| Code lines to change | ~15 | HIGH |
| Email template URLs | 4-6 | MEDIUM |
| Configuration values | 8 | HIGH |
| **Total effort** | **~30 min** | - |

