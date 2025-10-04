# LinkedIn Community Management & Automation Platform

Complete LinkedIn automation platform with OIDC authentication, post scheduling, engagement tracking, and analytics. Built for the LinkedIn Community Management API with compliance-first approach.

## 🚀 Features

### 1. **Authentication & Security**
- ✅ OpenID Connect (OIDC) authentication
- ✅ OAuth 2.0 with Community Management API scopes
- ✅ Secure token storage in SQLite
- ✅ ID token validation using JWKS
- ✅ Session management with HTTP-only cookies

### 2. **Post Scheduling System**
- ✅ Schedule posts with text and optional images
- ✅ Automated publishing via cron jobs (every minute check)
- ✅ Rate limiting: max 10 posts/day
- ✅ Post status tracking (pending, published, failed)
- ✅ Future-dated scheduling with validation

### 3. **Engagement Dashboard**
- ✅ View your published LinkedIn posts
- ✅ Fetch post comments
- ✅ Manual comment liking with confirmation
- ✅ Rate limiting: 3 reactions/minute
- ✅ Real-time API usage tracking

### 4. **Analytics & Reporting**
- ✅ Posts published per week (line chart data)
- ✅ Summary statistics (total/pending/published)
- ✅ Export analytics as JSON
- ✅ Historical data tracking

### 5. **Rate Limit Management**
- ✅ Track all API calls in database
- ✅ Display "X/500 calls used today" in header
- ✅ Visual warnings when approaching limit
- ✅ Automatic rate limit enforcement

## 📋 Prerequisites

- Node.js v14 or higher
- npm or yarn
- LinkedIn Developer Account with **Community Management API** access

## 🔑 LinkedIn App Setup

### Step 1: Create LinkedIn App

1. Go to [LinkedIn Developers](https://www.linkedin.com/developers/apps)
2. Click "Create app"
3. Fill in required information
4. Click "Create app"

### Step 2: Request Community Management API Access

**IMPORTANT**: The Community Management API requires special access approval.

1. In your app, go to the "Products" tab
2. Request access to **"Community Management API"**
3. Wait for LinkedIn approval (may take several days)
4. Once approved, you'll have access to `r_member_social` and `w_member_social` scopes

### Step 3: Configure OAuth 2.0 Settings

1. Go to the "Auth" tab
2. Add redirect URL: `http://localhost:3000/auth/linkedin/callback`
3. Under "OAuth 2.0 scopes", you should now see:
   - ✅ `openid`
   - ✅ `profile`
   - ✅ `email` (r_emailaddress)
   - ✅ `w_member_social` (Create/edit posts, comments, reactions)
   - ✅ `r_member_social` (Read posts, comments, reactions)

### Step 4: Get Credentials

- Copy your **Client ID**
- Copy your **Client Secret**

## 📦 Installation

1. **Clone the repository**

```bash
cd linkedin-connect
```

2. **Install dependencies**

```bash
npm install
```

3. **Create environment file**

```bash
cp .env.example .env
```

4. **Configure environment variables**

Edit `.env`:

```env
# LinkedIn OAuth credentials
LINKEDIN_CLIENT_ID=your_client_id_here
LINKEDIN_CLIENT_SECRET=your_client_secret_here
LINKEDIN_REDIRECT_URI=http://localhost:3000/auth/linkedin/callback

# Server configuration
PORT=3000
NODE_ENV=development

# Session secret (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
SESSION_SECRET=your_random_session_secret_here
```

## 🏃 Running the Application

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

The application will start on `http://localhost:3000`

## 📱 Usage Guide

### 1. Initial Setup

1. Navigate to `http://localhost:3000`
2. Click "Sign in with LinkedIn"
3. Authorize the app (approve all requested scopes)
4. You'll be redirected to the dashboard

### 2. Schedule a Post

1. Go to "Schedule Post" tab
2. Enter post content (max 3000 characters)
3. Optionally add an image URL
4. Select future publish date/time
5. Click "Schedule Post"

**Limits**:
- Max 10 posts per day
- Publish time must be in the future
- Posts are checked every minute for publishing

### 3. View Scheduled Posts

1. Click "Scheduled Posts" tab
2. See all your scheduled posts with status
3. Delete pending posts if needed

**Statuses**:
- 🟡 **Pending**: Waiting to be published
- 🟢 **Published**: Successfully posted to LinkedIn
- 🔴 **Failed**: Publishing failed (see error message)

### 4. Engagement Management

1. Click "Engagement" tab
2. Click "Refresh Posts" to load your LinkedIn posts
3. Click "View Comments" on any post
4. Like comments manually with confirmation

**Rate Limits**:
- Max 20 post fetches per minute
- Max 3 comment likes per minute

### 5. Analytics

1. Click "Analytics" tab
2. View summary statistics
3. See posts published per week
4. Click "Export Data as JSON" to download full analytics

## 🗄️ Database Schema

The app uses SQLite with the following tables:

### `users`
Stores user profiles and access tokens
- `id`, `sub`, `name`, `email`, `picture`
- `access_token`, `refresh_token`, `token_expires_at`

### `scheduled_posts`
Tracks scheduled posts
- `id`, `user_sub`, `content`, `image_url`
- `publish_at`, `status`, `linkedin_post_id`, `error_message`

### `api_calls`
Tracks API usage for rate limiting
- `id`, `endpoint`, `method`, `status_code`, `timestamp`

## 🔒 Security & Compliance

### Rate Limiting

**LinkedIn API Limits** (enforced by platform):
- 500 API calls per day
- Throttling for rapid requests

**App-Level Limits** (enforced by this app):
- 10 scheduled posts per day
- 3 comment reactions per minute
- 20 post fetches per minute

### Security Features

- ✅ CSRF protection with state parameter
- ✅ Nonce validation for ID tokens
- ✅ HTTP-only session cookies
- ✅ Token expiration checking
- ✅ SQL injection prevention (parameterized queries)
- ✅ XSS protection (HTML escaping in UI)

### LinkedIn Policy Compliance

**This app is designed for personal, non-spammy use**:
- ❌ No mass automation
- ❌ No bulk operations
- ✅ Manual confirmation for likes
- ✅ Strict rate limiting
- ✅ Transparent user controls

## 🎯 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/linkedin` | GET | Initiate LinkedIn OAuth flow |
| `/auth/linkedin/callback` | GET | OAuth callback handler |
| `/dashboard` | GET | Main dashboard UI |
| `/api/rate-limit` | GET | Get current API usage |
| `/api/posts/schedule` | POST | Schedule a new post |
| `/api/posts/scheduled` | GET | Get all scheduled posts |
| `/api/posts/scheduled/:id` | DELETE | Delete a pending post |
| `/api/posts/published` | GET | Fetch user's LinkedIn posts |
| `/api/posts/:postId/comments` | GET | Get comments for a post |
| `/api/comments/:commentId/like` | POST | Like a comment |
| `/api/analytics` | GET | Get analytics data |
| `/api/analytics/export` | GET | Export analytics as JSON |
| `/logout` | GET | Logout and destroy session |

## 🛠️ Architecture

```
linkedin-connect/
├── server.js              # Main Express server
├── database.js            # SQLite database layer
├── scheduler.js           # Cron job for post publishing
├── public/
│   ├── index.html        # Landing page
│   └── dashboard.html    # Main dashboard UI
├── package.json          # Dependencies
├── .env.example          # Environment template
└── README.md            # This file
```

### How It Works

1. **Authentication Flow**:
   - User clicks "Sign in with LinkedIn"
   - Redirected to LinkedIn OAuth
   - Authorization code exchanged for access token
   - Token stored in database + session

2. **Post Scheduling**:
   - User creates scheduled post via dashboard
   - Stored in database with `pending` status
   - Cron job runs every minute
   - Posts with `publish_at <= now` are published
   - Status updated to `published` or `failed`

3. **Engagement Tracking**:
   - User fetches posts via LinkedIn API
   - Comments loaded on demand
   - Manual like actions with confirmation
   - All API calls tracked for rate limiting

## 🚨 Troubleshooting

### "Access Denied" Error

**Issue**: LinkedIn denies access during OAuth

**Solutions**:
- Ensure Community Management API is approved
- Check all scopes are properly configured
- Verify redirect URI matches exactly

### "Access Token Expired"

**Issue**: Token expired (typically after 60 days)

**Solutions**:
- Re-authenticate through the app
- Implement refresh token logic (advanced)

### Posts Not Publishing

**Issue**: Scheduled posts stuck in pending

**Solutions**:
- Check server logs for errors
- Verify token is still valid
- Ensure cron job is running
- Check LinkedIn API quotas

### Rate Limit Exceeded

**Issue**: "429 Too Many Requests"

**Solutions**:
- Wait for rate limit to reset (24 hours)
- Reduce API call frequency
- Check "API Usage" in dashboard

## 📊 LinkedIn API Endpoints Used

| Purpose | Endpoint | Method |
|---------|----------|--------|
| Authenticate | `/oauth/v2/authorization` | GET |
| Get tokens | `/oauth/v2/accessToken` | POST |
| User info | `/v2/userinfo` | GET |
| Create post | `/rest/posts` | POST |
| Get posts | `/rest/posts?q=author` | GET |
| Get comments | `/rest/comments?q=post` | GET |
| Like comment | `/rest/reactions` | POST |

All REST API calls use:
- `LinkedIn-Version: 202405`
- `X-Restli-Protocol-Version: 2.0.0`

## 🔄 Future Enhancements

- [ ] Token refresh implementation
- [ ] Multi-user support
- [ ] Image upload to LinkedIn
- [ ] Post edit functionality
- [ ] Comment reply feature
- [ ] Advanced analytics (engagement rates)
- [ ] Webhook notifications
- [ ] Post templates

## 📄 License

ISC

## 🤝 Contributing

Contributions welcome! Please ensure:
- Code follows existing patterns
- LinkedIn API policies are respected
- Rate limiting is maintained
- Security best practices are followed

## ⚠️ Disclaimer

This tool is for personal use only. Users are responsible for complying with:
- LinkedIn User Agreement
- LinkedIn API Terms of Service
- Community Management API policies

Do not use this tool for:
- Spam or unsolicited messages
- Automated engagement farming
- Violation of LinkedIn policies

## 📞 Support

For issues:
- Check [LinkedIn API Documentation](https://docs.microsoft.com/en-us/linkedin/)
- Review application logs
- Verify API quotas and limits

## 🎉 Acknowledgments

- LinkedIn Developer Platform
- Express.js
- Node-cron
- SQLite3
