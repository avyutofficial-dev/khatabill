# Google App Verification Process Guide

To remove the "Google hasn't verified this app" warning, Google requires you to prove what your app does and that you have a privacy policy. Here is exactly what you need to do.

## Step 1: Deploy Your App Live
Google reviewers need to be able to visit your app on a live web address (like `https://khatabill.vercel.app`).
1. I have created a `privacy-policy.html` file in your project. This is **mandatory** for verification.
2. Deploy your current code (including `privacy-policy.html`) to Vercel (or your hosting provider).
3. Ensure you have the live links ready:
   - Homepage: `https://your-app.vercel.app`
   - Privacy Policy: `https://your-app.vercel.app/privacy-policy.html`

## Step 2: Verify Your Domain in Google Search Console
Google needs to know you own the domain where the app is hosted.
1. Go to [Google Search Console](https://search.google.com/search-console).
2. Click **Add Property** and select **URL prefix**.
3. Enter your live app URL (e.g., `https://your-app.vercel.app`) and follow the HTML Tag method to verify it. (If you deploy to Vercel, putting the HTML tag in your `index.html` head and re-deploying is the easiest way).

## Step 3: Record a Video Demo
Google requires a screen recording showing exactly how you use the OAuth scopes.
1. Download a screen recorder (like OBS, or just use Windows Game Bar / Mac Screen Recording).
2. Record a video where you:
   - Start at your live app URL.
   - Show yourself clicking the **"Connect to Google Drive"** button.
   - Wait for the Google login popup to appear. **Crucial:** Make sure the URL bar in the popup clearly shows your `CLIENT_ID`.
   - Log into your Google account and grant the permission.
   - Show the app generating a bill, and ideally show the "Syncing" or backup functionality happening.
3. Upload this video to **YouTube** (you can set the visibility to "Unlisted" so only people with the link can see it).

## Step 4: Submit Verification in Google Cloud Console
1. Go back to the [Google Cloud Console](https://console.cloud.google.com/).
2. In the left menu under Google Auth Platform, click **Branding**.
3. Fill out the application details. You will need to add:
   - **Application home page**: `https://your-app.vercel.app`
   - **Application privacy policy link**: `https://your-app.vercel.app/privacy-policy.html`
   - **Authorized domains**: Add `vercel.app` (or your custom domain).
4. Click **Save**.
5. Next, click on **Verification Center** in the left menu.
6. Look for a button or banner that says **Submit for Verification**.
7. In the form:
   - Explain why you need the scope: *"KhataBill is an offline billing app. It uses the drive.file scope to allow shopkeepers to automatically back up their local IndexedDB database to their own Google Drive as a JSON file, and restore it if they lose their phone."*
   - Provide the **YouTube Link** to your demo video.
8. Submit the request!

It usually takes Google **2 to 5 days** to review your app. Once approved, the scary warning screen will be gone forever for all users!