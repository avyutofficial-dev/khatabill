# Google OAuth 2.0 Setup Guide for KhataBill

To make the Google Drive Auto-Sync work, you need to configure OAuth 2.0 in the Google Cloud Console. Follow these steps to generate your `CLIENT_ID`:

## Step 1: Create a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click on the project drop-down at the top left and select **New Project**.
3. Name your project (e.g., "KhataBill-Drive-Sync") and click **Create**.

## Step 2: Enable the Google Drive API
1. In the left-hand menu, navigate to **APIs & Services** > **Library**.
2. Search for **Google Drive API**.
3. Select it and click **Enable**.

## Step 3: Configure the OAuth Consent Screen (Branding, Data Access, and Audience)
Google recently updated their UI to the "Google Auth Platform". Based on the new design:

1. Look at the left-hand menu where you see **Overview, Branding, Audience, Clients, Data Access**.
2. Click on **Data Access** in the left menu.
3. Click the button to **Add Scopes** (or "Add or Remove Scopes").
4. A sidebar or modal will appear. Manually add or search for this exact scope: `https://www.googleapis.com/auth/drive.file`
5. Select it and click **Save** or **Update**.
   *Note: This specific scope only allows the app to manage files it creates itself.*
6. Next, click on **Audience** in the left menu.
7. Make sure the type is set to **External**.
8. Under the **Test users** section, add your personal Google email address so you can test the app while it's unverified.

## Step 4: Create OAuth Credentials (You already did this!)
1. Go to **APIs & Services** > **Credentials**.
2. Click **Create Credentials** at the top and select **OAuth client ID**.
3. Set the **Application type** to **Web application**.
4. Name the client (e.g., "KhataBill Web Client").
5. Under **Authorized JavaScript origins**, add the URLs where you host the app. Since you are using XAMPP locally, add:
   - `http://localhost`
   - `http://localhost:80`
   
   **For Vercel (Live Deployment):**
   You MUST add your live Vercel domain(s) here, otherwise Google will block the login request. Add:
   - `https://your-project-name.vercel.app` (Your main Vercel production branch URL)
   - `https://your-custom-domain.com` (If you have a custom domain attached to Vercel)
   *(Note: Vercel preview environments generate unique URLs. For testing Drive Sync, it's best to use your static production URL or explicitly add the preview URL you want to test).*
6. Click **Create**.

## Step 5: Update the App
1. A modal will pop up with your **Client ID**. It looks something like `123456789-abcdefg.apps.googleusercontent.com`.
2. Copy this Client ID.
3. Open `gdrive.js` in your workspace.
4. Replace the filler text on Line 7:
   ```javascript
   const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com';
   ```
   with your actual Client ID.

Save the file, and your app will now be fully ready to authenticate users and start syncing to their Google Drive!