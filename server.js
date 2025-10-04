require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// LinkedIn OIDC endpoints
const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
const LINKEDIN_JWKS_URL = 'https://www.linkedin.com/oauth/openid/jwks';

// JWKS client for token verification
const client = jwksClient({
  jwksUri: LINKEDIN_JWKS_URL,
  cache: true,
  cacheMaxAge: 86400000 // 24 hours
});

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 3600000 // 1 hour
  }
}));

app.use(express.static('public'));
app.use(express.json());

// Helper function to get signing key
function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
    } else {
      const signingKey = key.getPublicKey();
      callback(null, signingKey);
    }
  });
}

// Helper function to verify ID token
async function verifyIdToken(idToken) {
  return new Promise((resolve, reject) => {
    jwt.verify(idToken, getKey, {
      algorithms: ['RS256'],
      issuer: 'https://www.linkedin.com',
      audience: process.env.LINKEDIN_CLIENT_ID
    }, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}

// Root route - serve landing page
app.get('/', (req, res) => {
  if (req.session.user) {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>LinkedIn OIDC - Profile</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .profile-card {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .profile-header {
            display: flex;
            align-items: center;
            margin-bottom: 20px;
          }
          .profile-picture {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            margin-right: 20px;
          }
          .profile-info p {
            margin: 5px 0;
          }
          .logout-btn {
            background: #0073b1;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 20px;
          }
          .logout-btn:hover {
            background: #005885;
          }
        </style>
      </head>
      <body>
        <div class="profile-card">
          <h1>Profile Information</h1>
          <div class="profile-header">
            ${req.session.user.picture ? `<img src="${req.session.user.picture}" alt="Profile" class="profile-picture">` : ''}
            <div class="profile-info">
              <p><strong>Name:</strong> ${req.session.user.name || 'N/A'}</p>
              <p><strong>Email:</strong> ${req.session.user.email || 'N/A'}</p>
              <p><strong>Sub:</strong> ${req.session.user.sub || 'N/A'}</p>
            </div>
          </div>
          <button class="logout-btn" onclick="window.location.href='/logout'">Logout</button>
        </div>
      </body>
      </html>
    `);
  } else {
    res.sendFile(__dirname + '/public/index.html');
  }
});

// Login route - redirect to LinkedIn
app.get('/auth/linkedin', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');

  req.session.state = state;
  req.session.nonce = nonce;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
    scope: 'openid profile email',
    state: state,
    nonce: nonce
  });

  res.redirect(`${LINKEDIN_AUTH_URL}?${params.toString()}`);
});

// Callback route - handle OAuth callback
app.get('/auth/linkedin/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error, error_description);
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Authentication Error</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .error-card {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border-left: 4px solid #d32f2f;
          }
          .error-card h1 {
            color: #d32f2f;
            margin-top: 0;
          }
          .back-link {
            display: inline-block;
            margin-top: 20px;
            color: #0073b1;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <div class="error-card">
          <h1>Authentication Failed</h1>
          <p><strong>Error:</strong> ${error}</p>
          <p><strong>Description:</strong> ${error_description || 'No additional details provided'}</p>
          <a href="/" class="back-link">← Back to Home</a>
        </div>
      </body>
      </html>
    `);
  }

  // Verify state parameter
  if (!state || state !== req.session.state) {
    console.error('State mismatch - possible CSRF attack');
    return res.status(403).send('Invalid state parameter');
  }

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await axios.post(LINKEDIN_TOKEN_URL, null, {
      params: {
        grant_type: 'authorization_code',
        code: code,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, id_token } = tokenResponse.data;

    if (!access_token) {
      throw new Error('No access token received');
    }

    // Verify ID token if present
    if (id_token) {
      try {
        const decoded = await verifyIdToken(id_token);

        // Verify nonce
        if (decoded.nonce !== req.session.nonce) {
          throw new Error('Nonce mismatch');
        }

        console.log('ID token verified successfully');
      } catch (err) {
        console.error('ID token verification failed:', err.message);
        // Continue anyway - we'll get user info from userinfo endpoint
      }
    }

    // Fetch user profile from userinfo endpoint
    const userInfoResponse = await axios.get(LINKEDIN_USERINFO_URL, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    const userInfo = userInfoResponse.data;

    // Store user info in session
    req.session.user = {
      sub: userInfo.sub,
      name: userInfo.name,
      email: userInfo.email,
      picture: userInfo.picture
    };

    // Clean up state and nonce
    delete req.session.state;
    delete req.session.nonce;

    res.redirect('/');

  } catch (error) {
    console.error('Authentication error:', error.response?.data || error.message);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Authentication Error</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .error-card {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border-left: 4px solid #d32f2f;
          }
          .error-card h1 {
            color: #d32f2f;
            margin-top: 0;
          }
          .error-details {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
            font-family: monospace;
            font-size: 14px;
            overflow-x: auto;
          }
          .back-link {
            display: inline-block;
            margin-top: 20px;
            color: #0073b1;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <div class="error-card">
          <h1>Authentication Error</h1>
          <p>An error occurred during the authentication process.</p>
          <div class="error-details">${error.response?.data ? JSON.stringify(error.response.data, null, 2) : error.message}</div>
          <a href="/" class="back-link">← Back to Home</a>
        </div>
      </body>
      </html>
    `);
  }
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop');
});
