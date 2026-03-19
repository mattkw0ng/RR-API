# Quick Reference: Exact Files & Line Numbers to Change

## File-by-File Breakdown

### 1. **config/config.js** (Lines 1-3)
```javascript
// ❌ BEFORE (Production)
const CLIENT_URL = "https://rooms.sjcac.org";
const ALLOWED_CLIENT_URLS = ["https://main--sensational-quokka-8e0ee2.netlify.app", "https://rooms.sjcac.org"];

// ✅ AFTER (Local Development)
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const ALLOWED_CLIENT_URLS = [
  process.env.CLIENT_URL || "http://localhost:3000",
  "http://127.0.0.1:3000"
];
```

**Add to .env:**
```bash
CLIENT_URL=http://localhost:3000
```

---

### 2. **server.js** (Multiple lines)

#### Line 46 - Redis connection
```javascript
// ❌ BEFORE
const redisClient = createClient({
  url: 'redis://localhost:6379'
});

// ✅ AFTER
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});
```

#### Line 52-54 - Session secret
```javascript
// ❌ BEFORE
secret: 'SuperSecretSecret3',

// ✅ AFTER
secret: process.env.SESSION_SECRET || 'local-dev-secret-change-me',
```

#### Line 58 - Cookie domain
```javascript
// ❌ BEFORE
domain: '.sjcac.org',

// ✅ AFTER
domain: process.env.COOKIE_DOMAIN || 'localhost',
```

#### Line 59 - Cookie secure flag
```javascript
// ❌ BEFORE
secure: true,

// ✅ AFTER
secure: process.env.NODE_ENV === 'production',
```

#### Line 63 - Port
```javascript
// ❌ BEFORE
const PORT = 5000;

// ✅ AFTER
const PORT = process.env.PORT || 5000;
```

**Add to .env:**
```bash
NODE_ENV=development
SESSION_SECRET=your-secret-key-here
COOKIE_DOMAIN=localhost
REDIS_URL=redis://localhost:6379
PORT=5000
```

---

### 3. **utils/sendEmail.js** (Multiple locations)

#### Lines 11-13 - Email transporter config
```javascript
// ❌ BEFORE
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'rooms@sjcac.org',
    pass: process.env.NODEMAILER_PASS,

// ✅ AFTER
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-test-email@gmail.com',
    pass: process.env.NODEMAILER_PASS,
```

#### Lines 27, 32 - Email from/cc addresses
```javascript
// ❌ BEFORE
from: '"SJCAC Room Reservations" <rooms@sjcac.org>',
cc: 'rooms@sjcac.org',

// ✅ AFTER
from: `"Room Reservations" <${process.env.EMAIL_USER || 'your-test-email@gmail.com'}>`,
cc: process.env.EMAIL_ADMIN || 'your-test-email@gmail.com',
```

#### Lines 72, 117 - Email template URLs
```javascript
// ❌ BEFORE (multiple occurrences)
<a href='https://rooms.sjcac.org/profile'>here on the profile page</a>
<a href="https://rooms.sjcac.org/profile">user profile</a>

// ✅ AFTER
<a href='${process.env.CLIENT_URL}/profile'>here on the profile page</a>
<a href="${process.env.CLIENT_URL}/profile">user profile</a>
```

#### Line 121 - Organization email
```javascript
// ❌ BEFORE
<a href="mailto:celine.bower@sjcac.org">celine.bower@sjcac.org</a>

// ✅ AFTER
<a href="mailto:${process.env.ADMIN_EMAIL}">support</a>
```

#### Line 122, 126 - Church/org specific URLs
```javascript
// ❌ BEFORE
<a href="https://sjcac.churchcenter.com/people/forms/932890">Incident Report Form</a>
<a href="https://sjcac.churchcenter.com/people/forms/947288">Maintenance Report Form</a>

// ✅ AFTER
<!-- Remove or replace with your organization's links -->
<!-- <a href="...">Incident Report Form</a> -->
<!-- <a href="...">Maintenance Report Form</a> -->
```

**Add to .env:**
```bash
EMAIL_USER=your-test-email@gmail.com
EMAIL_ADMIN=your-test-email@gmail.com
NODEMAILER_PASS=your-gmail-app-password
ADMIN_EMAIL=admin@example.com
```

---

### 4. **db.js** (Lines 1-10)

```javascript
// ❌ BEFORE
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// ✅ AFTER
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/room_reservation_dev'
});
```

**Or for more control:**
```javascript
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'room_reservation_dev',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});
```

**Add to .env:**
```bash
DATABASE_URL=postgresql://postgres:password@localhost:5432/room_reservation_dev
DB_USER=postgres
DB_HOST=localhost
DB_NAME=room_reservation_dev
DB_PASSWORD=password
DB_PORT=5432
```

---

### 5. **utils/webhook-utils.js** (Line 22)

```javascript
// ❌ BEFORE
address: 'https://api.rooms.sjcac.org/webhook',

// ✅ AFTER
address: process.env.WEBHOOK_URL || 'http://localhost:5000/webhook',
```

**Add to .env:**
```bash
WEBHOOK_URL=http://localhost:5000/webhook
```

---

### 6. **events.js** (Lines 10-12)

```javascript
// ❌ BEFORE (lines already use process.env, but ensure .env has values)
const PENDING_APPROVAL_CALENDAR_ID = process.env.PENDING_APPROVAL_CALENDAR_ID;
const APPROVED_CALENDAR_ID = process.env.APPROVED_CALENDAR_ID;
const PROPOSED_CHANGES_CALENDAR_ID = process.env.PROPOSED_CHANGES_CALENDAR_ID;

// ✅ These should work as-is, but add to .env:
```

**Add to .env:**
```bash
PENDING_APPROVAL_CALENDAR_ID=your-pending-calendar-id@group.calendar.google.com
APPROVED_CALENDAR_ID=your-approved-calendar-id@group.calendar.google.com
PROPOSED_CHANGES_CALENDAR_ID=your-proposed-calendar-id@group.calendar.google.com
```

---

### 7. **json/credentials.json** (No changes, but verify)

Ensure the file contains correct OAuth URIs:
```json
{
  "web": {
    "client_id": "...",
    "client_secret": "...",
    "redirect_uris": [
      "http://localhost:5000/auth/callback",
      "http://127.0.0.1:5000/auth/callback",
      "https://rooms.sjcac.org/auth/callback"  // Keep production URL too
    ]
  }
}
```

---

## Example Complete `.env` File

```bash
# Node Environment
NODE_ENV=development
PORT=5000

# Frontend
CLIENT_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/room_reservation_dev
DB_USER=postgres
DB_HOST=localhost
DB_NAME=room_reservation_dev
DB_PASSWORD=password
DB_PORT=5432

# Redis
REDIS_URL=redis://localhost:6379

# Session & Security
SESSION_SECRET=your-super-secret-local-dev-key-change-me
COOKIE_DOMAIN=localhost

# Email
EMAIL_USER=your-test-email@gmail.com
EMAIL_ADMIN=your-test-email@gmail.com
NODEMAILER_PASS=your-gmail-app-password
ADMIN_EMAIL=admin@example.com

# Google Calendar
PENDING_APPROVAL_CALENDAR_ID=your-pending@group.calendar.google.com
APPROVED_CALENDAR_ID=your-approved@group.calendar.google.com
PROPOSED_CHANGES_CALENDAR_ID=your-proposed@group.calendar.google.com

# Webhooks
WEBHOOK_URL=http://localhost:5000/webhook
```

---

## Files That Are OK As-Is (No Changes Needed)

- ✅ `events.js` - uses `process.env` for calendar IDs
- ✅ `rooms.js` - mostly uses `process.env` and database queries
- ✅ `utils/authorize.js` - reads from credentials.json automatically
- ✅ `utils/event-utils.js` - uses `process.env` for calendar IDs
- ✅ `auth.js` - uses OAuth via credentials.json
- ✅ `package.json` - no changes needed

---

## Summary: Changes by Priority

### 🔴 **CRITICAL** (Must change for local dev)
1. `config/config.js` - CLIENT_URL
2. `server.js` - cookie domain, secure flag
3. `.env` - DATABASE_URL, calendar IDs

### 🟠 **HIGH** (Should change)
1. `utils/sendEmail.js` - email addresses, URLs in templates
2. `.env` - email credentials
3. `server.js` - session secret

### 🟡 **MEDIUM** (Nice to change)
1. `utils/webhook-utils.js` - webhook URL
2. Email template organization links
3. Redis URL in `.env`

### 🟢 **LOW** (Optional)
1. PORT in `.env` (if 5000 is taken)
2. Organization-specific text in email templates

