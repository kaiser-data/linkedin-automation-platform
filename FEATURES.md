# Feature Overview

## LinkedIn Community Management & Automation Platform

### 🎯 What This App Does

This is a **compliance-first LinkedIn automation platform** that allows you to:

1. **Schedule LinkedIn Posts** - Write posts now, publish them automatically later
2. **Track Engagement** - View your posts, read comments, and like them manually
3. **Analyze Performance** - See posting trends and export analytics
4. **Manage API Usage** - Monitor your LinkedIn API quota in real-time

---

## 🔐 Authentication (OIDC + OAuth 2.0)

**Scopes Used**:
- `openid` - Basic authentication
- `profile` - User's LinkedIn profile info
- `email` - Email address
- `w_member_social` - **Write permissions** (create posts, like comments)
- `r_member_social` - **Read permissions** (view posts, read comments)

**Security**:
- ✅ ID token validation with JWKS
- ✅ CSRF protection (state parameter)
- ✅ Nonce validation
- ✅ Secure token storage in SQLite
- ✅ HTTP-only session cookies

---

## 📅 Post Scheduling System

### How It Works

1. **Create**: Write post content, add optional image URL, set future publish time
2. **Store**: Post saved in database with `pending` status
3. **Auto-Publish**: Cron job checks every minute for posts ready to publish
4. **Update**: Status changes to `published` (success) or `failed` (error)

### Limits & Rules

- ✅ Max **10 posts/day** (prevents spam)
- ✅ Publish time must be in **future**
- ✅ Max **3000 characters** per post
- ✅ Optional image URL supported

### Database Schema

```sql
scheduled_posts (
  id, user_sub, content, image_url,
  publish_at, status, linkedin_post_id,
  error_message, created_at, published_at
)
```

---

## 💬 Engagement Dashboard

### Features

**View Published Posts**:
- Fetches YOUR LinkedIn posts via API
- Shows post content and timestamps
- Rate limited: 20 requests/minute

**Read Comments**:
- Click "View Comments" on any post
- Loads all comments with author names
- Rate limited: 20 requests/minute

**Like Comments**:
- Manual like button for each comment
- Requires confirmation (prevents accidental clicks)
- Rate limited: **3 reactions/minute** (strict!)

### Why Manual Likes?

LinkedIn policies prohibit **automated engagement farming**. This app requires:
- ✅ User confirmation before each like
- ✅ Strict rate limiting (3/minute)
- ✅ No bulk operations
- ✅ Transparent user control

---

## 📊 Analytics & Reporting

### Metrics Tracked

1. **Summary Stats**:
   - Total published posts
   - Pending scheduled posts
   - Failed posts

2. **Weekly Trends**:
   - Posts published per week (last 8 weeks)
   - Line chart data for visualization

3. **API Usage**:
   - Total API calls today
   - Remaining quota (500/day limit)
   - Recent API call history

### Export Feature

Click "Export Data as JSON" to download:
```json
{
  "exportDate": "2025-01-15T...",
  "user": {...},
  "analytics": {
    "postsPerWeek": [...],
    "totalPosts": 42,
    "publishedPosts": 35,
    "pendingPosts": 5,
    "failedPosts": 2
  },
  "scheduledPosts": [...],
  "apiUsage": {...}
}
```

---

## 🚦 Rate Limit Management

### How It Works

**Database Tracking**:
- Every API call logged to `api_calls` table
- Tracks: endpoint, method, status code, timestamp
- Real-time count of today's API calls

**Visual Indicators**:
```
  0-350 calls: 🟢 Blue badge  (safe)
350-450 calls: 🟡 Yellow badge (warning)
450-500 calls: 🔴 Red badge   (danger)
```

**Enforcement**:
- App-level rate limiting for specific endpoints
- 3 likes/minute, 20 fetches/minute
- LinkedIn enforces 500 calls/day globally

---

## 🏗️ Technical Architecture

### Backend

**server.js**:
- Express.js web server
- OIDC authentication flow
- API routes with rate limiting
- Graceful shutdown handling

**database.js**:
- SQLite database wrapper
- Parameterized queries (SQL injection safe)
- Tables: users, scheduled_posts, api_calls

**scheduler.js**:
- Node-cron job (runs every minute)
- Publishes pending posts
- Updates post statuses
- Error handling & logging

### Frontend

**dashboard.html**:
- Single-page dashboard
- Tab-based navigation
- Real-time API usage display
- AJAX for all API calls
- HTML escaping (XSS protection)

---

## 🔧 API Endpoints

| Route | Method | Rate Limit | Purpose |
|-------|--------|------------|---------|
| `/api/rate-limit` | GET | - | Get current API usage |
| `/api/posts/schedule` | POST | 10/day | Schedule new post |
| `/api/posts/scheduled` | GET | - | List scheduled posts |
| `/api/posts/scheduled/:id` | DELETE | - | Delete pending post |
| `/api/posts/published` | GET | 20/min | Fetch LinkedIn posts |
| `/api/posts/:id/comments` | GET | 20/min | Get post comments |
| `/api/comments/:id/like` | POST | **3/min** | Like a comment |
| `/api/analytics` | GET | - | Get analytics data |
| `/api/analytics/export` | GET | - | Export JSON |

---

## ⚠️ Compliance & Best Practices

### LinkedIn Policy Adherence

**Allowed** ✅:
- Scheduling YOUR OWN posts
- Viewing YOUR OWN published content
- Manual engagement with confirmation
- Analytics for YOUR OWN account

**Prohibited** ❌:
- Automated mass liking
- Bulk follows/unfollows
- Spam or unsolicited messages
- Engagement farming bots

### This App's Approach

1. **No Automation Without Consent**:
   - Post scheduling requires explicit setup
   - Likes require manual confirmation

2. **Strict Rate Limiting**:
   - Enforced at app level
   - More restrictive than LinkedIn's limits

3. **Transparency**:
   - All actions logged
   - API usage visible in dashboard
   - Clear error messages

4. **Personal Use Only**:
   - Single-user design
   - No multi-account support
   - No client/agency features

---

## 🚀 Getting Started

### Quick Setup (5 minutes)

1. **LinkedIn App Setup**:
   - Create app at linkedin.com/developers
   - Request Community Management API access
   - Get Client ID + Secret

2. **Installation**:
   ```bash
   npm install
   cp .env.example .env
   # Edit .env with your credentials
   npm start
   ```

3. **First Use**:
   - Visit http://localhost:3000
   - Sign in with LinkedIn
   - Schedule your first post!

---

## 📈 Use Cases

### Content Creators
- Schedule posts during optimal times
- Maintain consistent posting schedule
- Track engagement trends

### Professionals
- Schedule thought leadership content
- Engage with network systematically
- Monitor personal brand performance

### Small Businesses
- Plan content calendar in advance
- Analyze posting effectiveness
- Stay active without constant monitoring

---

## 🔒 Security Features

1. **Token Security**:
   - Stored in SQLite (file-based, not cloud)
   - Never exposed in client-side code
   - Expiration checking before API calls

2. **Session Security**:
   - HTTP-only cookies
   - Secure flag in production
   - 1-hour session timeout

3. **Input Validation**:
   - Character limits enforced
   - Future date validation
   - URL format checking

4. **SQL Injection Prevention**:
   - Parameterized queries only
   - No string concatenation
   - Prepared statements

---

## 🎓 Learning Resources

### LinkedIn API Documentation
- [Community Management API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/overview)
- [REST API Guidelines](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/overview)
- [OAuth 2.0 Flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication)

### Related Technologies
- [Express.js](https://expressjs.com/)
- [Node-cron](https://www.npmjs.com/package/node-cron)
- [SQLite](https://www.sqlite.org/)

---

## 💡 Pro Tips

1. **Schedule During Off-Hours**:
   - Write posts when inspired
   - Publish when audience is online

2. **Monitor API Usage**:
   - Check dashboard before bulk operations
   - Export analytics before hitting limits

3. **Use Image URLs**:
   - Host images externally (Imgur, S3)
   - Paste URL in scheduler

4. **Backup Your Data**:
   - Export analytics regularly
   - SQLite DB stored in project folder

---

## 🐛 Known Limitations

1. **No Token Refresh**:
   - Must re-authenticate after 60 days
   - Future: implement refresh token flow

2. **Single User Only**:
   - Designed for personal use
   - No multi-account support

3. **Basic Analytics**:
   - No engagement rate calculations
   - No follower growth tracking

4. **Image Upload**:
   - Only supports image URLs
   - No direct upload to LinkedIn

---

## 🌟 Why This App Exists

LinkedIn's web interface requires:
- Manual posting at specific times
- Constant checking for notifications
- No bulk operations

This app solves:
- ✅ Schedule posts in advance
- ✅ View all activity in one place
- ✅ Track API usage proactively
- ✅ Export data for analysis

**While remaining 100% compliant with LinkedIn's policies.**
