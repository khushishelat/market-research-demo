# Google OAuth Setup Guide

To enable Google OAuth authentication for your Market Research App, follow these steps:

## 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID

## 2. Enable Required APIs

1. In the Google Cloud Console, go to **APIs & Services** > **Library**
2. Search for and enable:
   - **Google+ API** (for user info)
   - **Google OAuth2 API**

## 3. Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **+ CREATE CREDENTIALS** > **OAuth client ID**
3. Select **Web application**
4. Configure the OAuth client:

### Application Name
- Name: `Market Research App` (or your preferred name)

### Authorized JavaScript Origins
Add these origins based on your deployment:
- For local development: `http://localhost:5000`
- For production: `https://yourdomain.com`

### Authorized Redirect URIs
Add these callback URLs:
- For local development: `http://localhost:5000/auth/callback`
- For production: `https://yourdomain.com/auth/callback`

5. Click **Create**
6. Copy the **Client ID** and **Client Secret**

## 4. Configure Environment Variables

Add these to your `.env.local` file:

```env
# Your existing variables
PARALLEL_API_KEY=your_parallel_api_key_here
SECRET_KEY=1c2a9a042ca2477a0db55ecb00a91854db62eba99562723c45191b0ba9ceb347

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
```

## 5. Test Authentication

1. Restart your Flask app
2. Visit `http://localhost:5000`
3. Click "Sign in with Google"
4. Complete the OAuth flow
5. You should be redirected back with authentication

## Common Issues

### "redirect_uri_mismatch" Error
- Make sure your redirect URI exactly matches what you configured in Google Cloud Console
- Check that you're using the correct protocol (http vs https)
- Ensure no trailing slashes in URLs

### "unauthorized_client" Error
- Verify your Client ID and Client Secret are correct
- Make sure the OAuth client is enabled

### "access_denied" Error
- User declined authorization
- Check that your OAuth consent screen is configured properly

## Production Considerations

### OAuth Consent Screen
1. Go to **APIs & Services** > **OAuth consent screen**
2. Configure your app information:
   - App name: "Market Research Tool"
   - User support email
   - Developer contact information
3. Add scopes: `email`, `profile`, `openid`
4. Add test users if in development mode

### Domain Verification
For production deployments:
1. Verify your domain in Google Search Console
2. Add your verified domain to the OAuth configuration

### Security
- Keep your `GOOGLE_CLIENT_SECRET` secure and never commit it to version control
- Use environment variables in production
- Consider using Google Cloud Secret Manager for production secrets

## Example .env.local File

```env
# Parallel API Configuration
PARALLEL_API_KEY=pk_live_abc123def456
SECRET_KEY=1c2a9a042ca2477a0db55ecb00a91854db62eba99562723c45191b0ba9ceb347

# Google OAuth Configuration
GOOGLE_CLIENT_ID=123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-ABcdefghijklmnopqrstuvwxyz123456
```

## Testing the Integration

After setup, test these flows:

1. **Unauthenticated Access**: 
   - Visit homepage → Should see public reports library
   - Try to generate report → Should prompt for Google login

2. **Authentication Flow**:
   - Click "Sign in with Google" → Should redirect to Google
   - Complete OAuth → Should return to homepage as authenticated user
   - Generate report → Should work and track to your account

3. **Report Management**:
   - View your personal reports section
   - All generated reports appear in public library with your name
   - Download reports as markdown files

## Troubleshooting

If you encounter issues:

1. Check the browser console for JavaScript errors
2. Check Flask logs for OAuth errors
3. Verify all environment variables are set correctly
4. Test the OAuth flow in an incognito browser window
5. Ensure your Google Cloud project has the required APIs enabled

The app will work without OAuth (users just can't generate new reports), so you can set it up incrementally.
