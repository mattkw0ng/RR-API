# Room Reservation System - Google Calendar API Integration

This project is a **Room Reservation System** that integrates with the **Google Calendar API** to manage room bookings, check availability, and handle conflicts. It is currently deployed on an **Amazon EC2 server instance**.

---

## Table of Contents
1. [Overview](#overview)
2. [Features](#features)
3. [Prerequisites](#prerequisites)
4. [Setup and Installation](#setup-and-installation)
5. [Environment Variables](#environment-variables)
6. [Running the Application](#running-the-application)
7. [Code Structure](#code-structure)
8. [Key Functions](#key-functions)
9. [Deployment Details](#deployment-details)
10. [Troubleshooting](#troubleshooting)

---

## Overview

This system allows users to:
- Reserve rooms by creating events in Google Calendar.
- Check room availability for specific time ranges.
- Handle recurring events using the `rrule` library.
- Notify users via email about reservation statuses (e.g., received, approved, rejected).
- Manage conflicts between events and provide detailed feedback.

The backend is built with **Node.js** and uses the **Google Calendar API** for event management. It also integrates with **SendGrid** for email notifications and uses **PostgreSQL** for database storage.

---

## Features

- **Room Availability**: Check which rooms are available during a specific time range.
- **Conflict Detection**: Identify conflicting events in the database.
- **Recurring Events**: Expand recurring events into individual instances.
- **Email Notifications**: Notify users about reservation statuses using SendGrid.
- **Database Integration**: Store and retrieve event and room data using PostgreSQL.
- **Admin Tools**: Manage pending and approved events.

---

## Prerequisites

Before running the application, ensure you have the following installed:

1. **Node.js** (v16 or higher)
2. **PostgreSQL** (v12 or higher)
3. **Google Cloud Project** with Calendar API enabled
4. **SendGrid Account** for email notifications
5. **Amazon EC2 Instance** (if deploying on AWS)

---

## Setup and Installation

### 1. Clone the Repository
```bash
git clone https://github.com/your-repo/room-reservation-system.git
cd room-reservation-system
```
### 2. Set Up the Database
- Create a PostgreSQL database
- Run the SQL schema to create the necessary tables

```sql
CREATE TABLE rooms (
  id SERIAL PRIMARY KEY,
  room_name VARCHAR(255) NOT NULL,
  calendar_id VARCHAR(255) NOT NULL
);

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL UNIQUE,
  calendar_id VARCHAR(255) NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  recurrence_rule TEXT,
  rooms TEXT[],
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE google_sync_tokens (
  id SERIAL PRIMARY KEY,
  calendar_id VARCHAR(255) NOT NULL UNIQUE,
  sync_token TEXT
);
```
### 4. Configure Google Calendar API
- Create a project in the Google Cloud Console.
- Enable the Google Calendar API.
- Create OAuth 2.0 credentials and download the credentials.json file.
- Place the credentials.json file in the root directory of the project.
### 5. Configure SendGrid
- Create a SendGrid account and generate an API key.
- Add the API key to the .env file (see below).
- Create a .env file in the root directory and add the following variables:

```bash
# Google Calendar API
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=your-google-redirect-uri

# Calendar IDs
PENDING_APPROVAL_CALENDAR_ID=your-pending-approval-calendar-id
PROPOSED_CHANGES_CALENDAR_ID=your-proposed-changes-calendar-id

# PostgreSQL Database
DB_HOST=your-database-host
DB_PORT=5432
DB_USER=your-database-username
DB_PASSWORD=your-database-password
DB_NAME=your-database-name

# SendGrid
SENDGRID_API_KEY=your-sendgrid-api-key
```