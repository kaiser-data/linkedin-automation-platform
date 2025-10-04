# LinkedIn OIDC Authentication

A Node.js application that implements LinkedIn authentication using OpenID Connect (OIDC) protocol with OAuth 2.0.

## Features

- ✅ OAuth 2.0 authorization code flow
- ✅ OpenID Connect (OIDC) implementation
- ✅ ID token validation using JWKS
- ✅ Secure session management
- ✅ User profile data retrieval (sub, name, email, picture)
- ✅ CSRF protection with state parameter
- ✅ Nonce validation for ID tokens
- ✅ Comprehensive error handling
- ✅ Modern, responsive UI

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- LinkedIn Developer Account

## LinkedIn App Setup

1. **Create a LinkedIn App:**
   - Go to [LinkedIn Developers](https://www.linkedin.com/developers/apps)
   - Click "Create app"
   - Fill in the required information
   - Click "Create app"

2. **Configure OAuth 2.0 Settings:**
   - Go to the "Auth" tab of your app
   - Add redirect URL: `http://localhost:3000/auth/linkedin/callback`
   - Under "OAuth 2.0 scopes", request:
     - `openid`
     - `profile`
     - `email`

3. **Get Credentials:**
   - Copy your **Client ID**
   - Copy your **Client Secret**

## Installation

1. **Clone or download this project**

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

4. **Configure environment variables:**

   Edit `.env` file with your LinkedIn credentials:
   ```env
   LINKEDIN_CLIENT_ID=your_client_id_here
   LINKEDIN_CLIENT_SECRET=your_client_secret_here
   LINKEDIN_REDIRECT_URI=http://localhost:3000/auth/linkedin/callback
   PORT=3000
   NODE_ENV=development
   SESSION_SECRET=your_random_session_secret
   ```

   Generate a secure session secret:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

## Running the Application

### Development Mode (with auto-reload):
```bash
npm run dev
```

### Production Mode:
```bash
npm start
```

The application will start on `http://localhost:3000`

## Usage

1. Open your browser and navigate to `http://localhost:3000`
2. Click "Sign in with LinkedIn"
3. Authorize the application on LinkedIn
4. You'll be redirected back with your profile information displayed

## Project Structure

```
linkedin-oidc-auth/
├── server.js              # Main Express server with OIDC implementation
├── public/
│   └── index.html        # Landing page with sign-in button
├── package.json          # Project dependencies
├── .env.example          # Environment variables template
├── .env                  # Your actual environment variables (git-ignored)
└── README.md            # This file
```

## How It Works

### Authentication Flow

1. **User Initiates Login:**
   - User clicks "Sign in with LinkedIn" button
   - Application generates random `state` and `nonce` parameters
   - User is redirected to LinkedIn authorization endpoint

2. **User Authorizes:**
   - User logs in and authorizes the application on LinkedIn
   - LinkedIn redirects back to callback URL with authorization code

3. **Token Exchange:**
   - Application exchanges authorization code for access token and ID token
   - Application validates the ID token using JWKS from LinkedIn

4. **User Information Retrieval:**
   - Application uses access token to fetch user profile from userinfo endpoint
   - User data (sub, name, email, picture) is stored in session

5. **Session Management:**
   - User information is stored securely in session
   - User can logout to clear session data

### Security Features

- **CSRF Protection:** State parameter prevents cross-site request forgery
- **Nonce Validation:** Prevents replay attacks on ID tokens
- **ID Token Verification:** Uses JWKS to cryptographically verify tokens
- **Secure Sessions:** HTTP-only cookies with configurable security settings
- **Error Handling:** Comprehensive error handling for all OAuth flows

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Landing page / Profile page (if authenticated) |
| `/auth/linkedin` | GET | Initiates LinkedIn OAuth flow |
| `/auth/linkedin/callback` | GET | OAuth callback handler |
| `/logout` | GET | Destroys session and logs out user |

## LinkedIn OIDC Endpoints Used

- **Authorization:** `https://www.linkedin.com/oauth/v2/authorization`
- **Token:** `https://www.linkedin.com/oauth/v2/accessToken`
- **UserInfo:** `https://api.linkedin.com/v2/userinfo`
- **JWKS:** `https://www.linkedin.com/oauth/openid/jwks`

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `LINKEDIN_CLIENT_ID` | Your LinkedIn app client ID | Yes |
| `LINKEDIN_CLIENT_SECRET` | Your LinkedIn app client secret | Yes |
| `LINKEDIN_REDIRECT_URI` | OAuth callback URL | Yes |
| `PORT` | Server port (default: 3000) | No |
| `NODE_ENV` | Environment (development/production) | No |
| `SESSION_SECRET` | Secret for session encryption | Recommended |

## Troubleshooting

### Common Issues

**"Redirect URI mismatch" error:**
- Ensure the redirect URI in your `.env` file exactly matches the one configured in your LinkedIn app
- Check for trailing slashes and http vs https

**"Invalid client credentials" error:**
- Verify your Client ID and Client Secret are correct
- Ensure there are no extra spaces in your `.env` file

**Session issues:**
- Generate a secure SESSION_SECRET
- Clear browser cookies and try again

**ID token verification fails:**
- This is logged but doesn't block authentication
- User information is still retrieved from the userinfo endpoint

## Production Deployment

For production deployment:

1. Set `NODE_ENV=production` in your environment
2. Use HTTPS for all URLs
3. Update `LINKEDIN_REDIRECT_URI` to your production domain
4. Add your production redirect URI to LinkedIn app settings
5. Use a strong, random SESSION_SECRET
6. Enable secure cookies (automatically enabled when NODE_ENV=production)

## Dependencies

- **express:** Web framework
- **express-session:** Session management
- **dotenv:** Environment variable management
- **axios:** HTTP client for API requests
- **jsonwebtoken:** JWT verification
- **jwks-rsa:** JWKS key retrieval and caching

## License

ISC

## Resources

- [LinkedIn OAuth 2.0 Documentation](https://docs.microsoft.com/en-us/linkedin/shared/authentication/authentication)
- [OpenID Connect Specification](https://openid.net/connect/)
- [Express.js Documentation](https://expressjs.com/)

## Support

For issues or questions:
- Check LinkedIn's [developer documentation](https://docs.microsoft.com/en-us/linkedin/)
- Review the error messages in the console
- Ensure all environment variables are correctly set
