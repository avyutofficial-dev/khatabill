/**
 * KhataBill - Google Drive Sync Module
 * Handles backup and sync via Google Identity Services and Google Drive REST API
 */

const GDriveSync = (() => {
  const CLIENT_ID = '26787211339-2dkmoep018jpc7knpts89vkg0roe7jsu.apps.googleusercontent.com';
  const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
  const SCOPES = 'https://www.googleapis.com/auth/drive.file';

  let tokenClient;
  let gapiInited = false;
  let gisInited = false;
  let accessToken = localStorage.getItem('gdrive_access_token');
  let backupFileId = localStorage.getItem('gdrive_backup_file_id');

  function init() {
    // Load gapi
    if (window.gapi) {
      gapi.load('client', intializeGapiClient);
    } else {
      setTimeout(init, 500); // Retry later if not loaded
      return;
    }

    // Load GIS
    if (window.google && google.accounts) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        prompt: '',
        callback: (tokenResponse) => {
          if (tokenResponse.error !== undefined) {
            console.error('OAuth Error:', tokenResponse);
            return;
          }
          accessToken = tokenResponse.access_token;
          localStorage.setItem('gdrive_access_token', accessToken);
          updateUI();
          syncToDrive(); // perform an initial sync when connected
        },
      });
      gisInited = true;
    } else {
      setTimeout(init, 500);
      return;
    }
    
    updateUI();
  }

  async function intializeGapiClient() {
    try {
      await gapi.client.init({
        discoveryDocs: [DISCOVERY_DOC],
      });
      gapiInited = true;
    } catch (e) {
      console.error('Failed to init GAPI client', e);
    }
  }

  function handleAuthClick() {
    if (!gisInited) {
      alert('Google services are still loading. Please wait a moment.');
      return;
    }
    
    if (accessToken) {
      // Disconnect
      google.accounts.oauth2.revoke(accessToken, () => {
        accessToken = null;
        localStorage.removeItem('gdrive_access_token');
        updateUI();
      });
    } else {
      // Request access token (forces consent screen if not previously authorized)
      tokenClient.requestAccessToken({prompt: 'consent'});
    }
  }

  function updateUI() {
    const statusText = document.getElementById('gdriveStatusText');
    const toggleBtn = document.getElementById('gdriveToggleBtn');
    if (!statusText || !toggleBtn) return;

    if (accessToken) {
      statusText.textContent = 'Connected (Sync Active)';
      toggleBtn.textContent = 'Disconnect';
      toggleBtn.style.color = 'var(--danger)';
    } else {
      statusText.textContent = 'Not connected';
      toggleBtn.textContent = 'Connect';
      toggleBtn.style.color = 'var(--accent)';
    }
  }

  async function syncToDrive() {
    if (!accessToken || !gapiInited) return;

    try {
      const dbData = await KhataBillDB.exportData();
      const fileContent = JSON.stringify(dbData);
      const fileMetadata = {
        name: 'KhataBill_Backup.json',
        mimeType: 'application/json'
      };

      if (!backupFileId) {
        // Search for existing backup file
        const query = "name='KhataBill_Backup.json' and trashed=false";
        const response = await gapi.client.drive.files.list({
          q: query,
          spaces: 'drive',
          fields: 'files(id, name)'
        });
        const files = response.result.files;
        if (files && files.length > 0) {
          backupFileId = files[0].id;
          localStorage.setItem('gdrive_backup_file_id', backupFileId);
        }
      }

      const form = new FormData();
      if (backupFileId) {
        // Update existing file
        const url = `https://www.googleapis.com/upload/drive/v3/files/${backupFileId}?uploadType=multipart`;
        
        form.append('metadata', new Blob([JSON.stringify({})], { type: 'application/json' }));
        form.append('file', new Blob([fileContent], { type: 'application/json' }));
        
        await fetch(url, {
          method: 'PATCH',
          headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
          body: form
        });
      } else {
        // Create new file
        const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        
        form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
        form.append('file', new Blob([fileContent], { type: 'application/json' }));
        
        const res = await fetch(url, {
          method: 'POST',
          headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
          body: form
        });
        const resData = await res.json();
        backupFileId = resData.id;
        localStorage.setItem('gdrive_backup_file_id', backupFileId);
      }
      console.log('[GDrive] Successfully synced backup to Google Drive');
    } catch (e) {
      console.error('[GDrive] Sync Error:', e);
      if (e.status === 401 || (e.result && e.result.error && e.result.error.code === 401)) {
        accessToken = null;
        localStorage.removeItem('gdrive_access_token');
        updateUI();
      }
    }
  }

  // Set up auto-sync hook to be called when data changes
  function triggerSync() {
    if (accessToken) {
      syncToDrive();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Slight delay to allow base libraries to begin loading
    setTimeout(init, 300);
    
    // Bind UI button
    const btn = document.getElementById('gdriveToggleBtn');
    if (btn) {
      btn.addEventListener('click', handleAuthClick);
    }
  });

  return { triggerSync };
})();
