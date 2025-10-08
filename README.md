# LinkedIn Community Engagement Platform

A comprehensive Node.js application for managing LinkedIn community engagement with intelligent automation, post scheduling, and supervised interaction workflows.

## 🎯 Platform Overview

This platform enables **supervised community engagement** on LinkedIn - combining AI assistance with human oversight for authentic, compliant, and effective networking.

### Core Philosophy
**AI Suggests → You Decide → Platform Executes**

- ✅ Full control over every action
- ✅ AI-powered engagement suggestions
- ✅ Quota-aware automation
- ✅ Compliance-first design
- ✅ Quality over quantity

---

## ✨ Key Features

### 🔐 Authentication & Security
- ✅ OAuth 2.0 + OpenID Connect (OIDC)
- ✅ ID token validation using JWKS
- ✅ AES-256-GCM token encryption
- ✅ CSRF protection with state parameter
- ✅ Secure session management
- ✅ HTTP-only encrypted cookies

### 📅 Content Management
- ✅ Post scheduling with cron automation
- ✅ Image URL support (external hosting)
- ✅ Character limits & validation
- ✅ Draft management
- ✅ Bulk scheduling
- ✅ Analytics export (JSON)

### 💬 Community Engagement (Planned - Requires API Access)
- 🔄 Intelligent comment prioritization
- 🔄 AI-assisted reply suggestions
- 🔄 Manual approval workflow
- 🔄 Smart like distribution
- 🔄 Engagement analytics
- 🔄 Profile data access (connections only)

### 📊 Analytics & Monitoring
- ✅ API quota tracking (500/day limit)
- ✅ Real-time usage dashboard
- ✅ Post performance metrics
- ✅ Weekly trends analysis
- ✅ Data export functionality

---

## 📋 Prerequisites

- **Node.js** v14 or higher
- **npm** or yarn
- **LinkedIn Developer Account**
- **Community Management API Access** (for full features)

---

## 🚀 Quick Start

### 1. LinkedIn App Setup

1. **Create LinkedIn App:**
   - Visit [LinkedIn Developers](https://www.linkedin.com/developers/apps)
   - Click "Create app"
   - Fill in required information

2. **Configure OAuth Settings:**
   - Navigate to **Auth** tab
   - Add redirect URL: `http://localhost:3001/auth/linkedin/callback`
   - Request scopes:
     - `openid` (required)
     - `profile` (required)
     - `email` (required)
     - `w_member_social` (for posting - requires API access)
     - `r_member_social` (for reading - requires API access)

3. **Request Community Management API:**
   - Go to **Products** tab
   - Find "Community Management API"
   - Click "Request access"
   - **Wait 24-48 hours** for LinkedIn approval

4. **Get Credentials:**
   - Copy **Client ID**
   - Copy **Client Secret**

### 2. Application Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd linkedin-connect

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Generate security keys
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy output to SESSION_SECRET and ENCRYPTION_KEY in .env
```

### 3. Configuration

Edit `.env` with your credentials:

```env
# LinkedIn API Credentials
LINKEDIN_CLIENT_ID=your_client_id_here
LINKEDIN_CLIENT_SECRET=your_client_secret_here
LINKEDIN_REDIRECT_URI=http://localhost:3001/auth/linkedin/callback

# Server Configuration
PORT=3001
NODE_ENV=development

# Security Keys (generate unique values)
SESSION_SECRET=your_generated_session_secret
ENCRYPTION_KEY=your_generated_encryption_key
```

### 4. Run the Application

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

Access the app at: **http://localhost:3001**

---

## 🔄 User Workflow

### Daily Engagement Routine (15-20 min)

#### **Morning Session (10 min)**
1. **Open Dashboard** → http://localhost:3001/dashboard
2. **Review Scheduled Posts**
   - Check today's queue
   - Edit if needed
   - Verify timing
3. **Plan New Content**
   - Write post
   - Add image URL (optional)
   - Schedule for optimal time

#### **Throughout Day (5 min each)**
4. **Monitor Engagement** (When API access granted)
   - Review new comments
   - Approve/edit AI-suggested replies
   - Queue responses for natural timing

#### **Evening Session (10 min)**
5. **Review Analytics**
   - Check post performance
   - Monitor API quota usage
   - Export data if needed
6. **Plan Tomorrow**
   - Schedule next day's posts
   - Review engagement opportunities

### Weekly Planning (30 min)

1. **Content Calendar**
   - Plan 7-10 posts for week
   - Mix content types (insights, team highlights, questions)
   - Schedule at optimal times (Tuesday 12pm, Wednesday 1pm)

2. **Performance Review**
   - Analyze which posts performed best
   - Identify top engagers
   - Adjust strategy

3. **Community Building**
   - Review connection requests
   - Identify key conversations
   - Plan targeted engagement

---

## 📊 API Quota Management

### LinkedIn Rate Limits (Per User/Day)

| Action | Quota | Your Target | Usage % |
|--------|-------|-------------|---------|
| **Posts** | 500/day | 10/day | 2% |
| **Image Uploads** | 500/day | 10/day | 2% |
| **Comments** | 500/day | 100/day | 20% |
| **Likes** | 10,000/day | 500/day | 5% |
| **Profile Reads** | 100,000/app | As needed | <1% |

### Smart Quota Strategy

**The app automatically:**
- ✅ Tracks all API calls in real-time
- ✅ Warns at 80% usage
- ✅ Blocks at 95% (reserves 5% for critical actions)
- ✅ Distributes actions naturally throughout day
- ✅ Prioritizes high-value engagements

**Visual Indicators:**
- 🟢 **0-60%**: Green (safe)
- 🟡 **60-80%**: Yellow (monitor)
- 🟠 **80-95%**: Orange (warning)
- 🔴 **95-100%**: Red (limit reached)

---

## 👥 Profile Data Access

### What You CAN Access (Compliant)

With proper API permissions (`r_liteprofile` or `r_basicprofile`):

```javascript
// For 1st-degree connections only
{
  "firstName": "John",
  "lastName": "Smith",
  "headline": "CEO at TechCorp",
  "profilePicture": "https://...",
  "location": "San Francisco, CA",
  "industry": "Technology",
  "publicProfileUrl": "https://linkedin.com/in/johnsmith"
}
```

✅ **Allowed:**
- Name, headline, profile picture
- Location, industry
- Public profile URL
- Connection degree

❌ **NOT Allowed:**
- Full work history (only public data)
- Skills, endorsements, recommendations
- Private contact information
- Non-connection profiles (2nd/3rd degree)

### What You CANNOT Do (Prohibited)

⚠️ **LinkedIn Terms of Service PROHIBIT:**
- Web scraping/crawling profiles
- Automated data collection
- Bypassing rate limits
- Storing data without permission
- Accessing non-connection profiles

**Consequences:**
- Account suspension/ban
- Legal action
- API access revoked
- IP blocking

### Our Approach (100% Compliant)

This app **ONLY** uses official LinkedIn APIs with:
- ✅ Proper OAuth authentication
- ✅ Rate limit compliance
- ✅ Connection-based access only
- ✅ No scraping or crawling
- ✅ Transparent data usage

---

## 🏗️ Project Structure

```
linkedin-connect/
├── server.js              # Main Express server + API routes
├── database.js            # SQLite database wrapper
├── scheduler.js           # Cron-based post scheduler
├── worker.js              # Background automation worker
├── public/
│   ├── index.html         # Landing page
│   └── dashboard.html     # Main dashboard UI
├── package.json           # Dependencies
├── .env                   # Configuration (git-ignored)
├── .env.example           # Configuration template
├── linkedin_automation.db # SQLite database (git-ignored)
├── README.md              # This file
├── README-EXTENDED.md     # Detailed documentation
└── FEATURES.md            # Feature specifications
```

---

## 🔧 API Endpoints

### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Landing page / Profile redirect |
| `/dashboard` | GET | Main dashboard (auth required) |
| `/auth/linkedin` | GET | Initiate LinkedIn OAuth |
| `/auth/linkedin/callback` | GET | OAuth callback handler |
| `/logout` | GET | Destroy session |

### Post Management
| Endpoint | Method | Rate Limit | Description |
|----------|--------|------------|-------------|
| `/api/posts/schedule` | POST | 500/day | Schedule new post |
| `/api/posts/scheduled` | GET | - | List scheduled posts |
| `/api/posts/scheduled/:id` | DELETE | - | Delete pending post |
| `/api/posts/published` | GET | 20/min | Fetch published posts |

### Engagement (Requires API Access)
| Endpoint | Method | Rate Limit | Description |
|----------|--------|------------|-------------|
| `/api/posts/:id/comments` | GET | 20/min | Get post comments |
| `/api/comments/:id/like` | POST | 3/min | Like a comment |

### Analytics
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/rate-limit` | GET | Current API quota usage |
| `/api/analytics` | GET | Engagement analytics |
| `/api/analytics/export` | GET | Export data as JSON |
| `/api/activity` | GET | Recent activity log |

---

## 🛡️ Security Features

### Data Protection
- **AES-256-GCM Encryption** for tokens
- **Parameterized SQL queries** (injection-safe)
- **HTTP-only secure cookies**
- **Environment-based secrets**
- **No secrets in code/git**

### Access Control
- **Session-based authentication**
- **Per-user rate limiting**
- **CSRF protection**
- **Nonce validation**
- **Input sanitization**

### Compliance
- **LinkedIn TOS compliant**
- **No web scraping**
- **Official APIs only**
- **Rate limit enforcement**
- **Activity logging**

---

## 🚨 Troubleshooting

### Common Issues

**"unauthorized_scope_error"**
- Your app doesn't have Community Management API access yet
- Request access at https://www.linkedin.com/developers/apps
- Current features work with basic scopes only

**"Invalid state parameter"**
- Session expired during authentication
- Clear cookies and try again in incognito mode
- Server may have restarted mid-auth

**"Redirect URI mismatch"**
- Ensure `.env` URI exactly matches LinkedIn app settings
- Check port number (3000 vs 3001)
- No trailing slashes

**"Port already in use"**
- Another process is using port 3001
- Change PORT in `.env` or kill the process:
  ```bash
  lsof -ti:3001 | xargs kill -9
  ```

**Session not persisting**
- Generate SESSION_SECRET if missing
- Clear browser cookies
- Check server logs for errors

---

## 📈 Roadmap

### ✅ Current Features (v2.0)
- OAuth authentication
- Post scheduling
- Analytics dashboard
- API quota tracking
- Image URL support

### 🔄 In Progress (v2.1 - Requires API Access)
- Image upload to LinkedIn
- Person tagging in images
- Comment management
- Smart engagement suggestions

### 📋 Planned (v3.0)
- AI-powered reply suggestions
- Engagement prioritization
- Learning system (adapts to your style)
- Advanced analytics
- Multi-account support

---

## 📚 Resources

### LinkedIn APIs
- [Community Management API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management)
- [OAuth 2.0 Guide](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication)
- [Rate Limits](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits)

### Technologies
- [Express.js](https://expressjs.com/)
- [SQLite](https://www.sqlite.org/)
- [node-cron](https://www.npmjs.com/package/node-cron)
- [OIDC Specification](https://openid.net/connect/)

---

## 📄 License

ISC

---

## 🤝 Support

For issues or questions:
1. Check [LinkedIn Developer Docs](https://docs.microsoft.com/en-us/linkedin/)
2. Review server logs for error messages
3. Verify `.env` configuration
4. Ensure Community Management API access granted

---

## ⚖️ Legal Disclaimer

This application:
- ✅ Uses official LinkedIn APIs only
- ✅ Complies with LinkedIn Terms of Service
- ✅ Requires explicit user authentication
- ✅ Respects rate limits and quotas
- ❌ Does NOT scrape or crawl LinkedIn
- ❌ Does NOT bypass LinkedIn security
- ❌ Does NOT access data without permission

**Use responsibly and in accordance with [LinkedIn's Terms of Service](https://www.linkedin.com/legal/user-agreement).**
