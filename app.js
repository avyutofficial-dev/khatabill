/**
 * KhataBill - Main Application Logic
 * Single Page Application controller with all screen logic
 */

(function () {
  'use strict';

  // ========== CONSTANTS ==========
  const PROFILE_KEY = 'khatabill_profile';
  const SETUP_KEY = 'isSetupDone';
  const BILLS_PER_PAGE = 10;

  // ========== STATE ==========
  let currentScreen = null;
  let currentBillId = null;
  let billItems = [];
  let selectedPayment = 'Cash';
  let selectedPaymentStatus = 'Paid';
  let currentPage = 1;
  let allBills = [];
  let screenHistory = [];
  let billsSortBy = 'date'; // 'date', 'amount', 'name'
  let billsSortOrder = 'desc'; // 'asc', 'desc'
  let allCatalogProducts = [];
  let printerDevice = null;
  let printCharacteristic = null;

  // ========== INITIALIZATION ==========
  let deferredPrompt = null;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  async function init() {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (isStandalone) {
      const landing = document.getElementById('landingPage');
      const app = document.getElementById('appContainer');
      if (landing) landing.style.display = 'none';
      if (app) app.style.display = 'block';

      try {
        await KhataBillDB.open();
        registerServiceWorker();
        bindEvents();
        checkFirstTimeUser();
      } catch (err) {
        console.error('[App] Standalone initialization failed:', err);
        if (app) {
          app.innerHTML = `
            <div style="padding: 32px 16px; text-align: center; color: var(--danger); font-family: var(--font-family); max-width: 480px; margin: 40px auto; background: var(--bg-white); border-radius: var(--radius-md); box-shadow: var(--shadow-md); border: 1px solid var(--border);">
              <h2 style="color: var(--danger); margin-bottom: 12px;">Database Error</h2>
              <p style="color: var(--text-secondary); margin-bottom: 20px;">We couldn't open the local database: ${err}. Please reload the page or clear your browser data.</p>
              <button onclick="location.reload()" style="margin: 0 auto; display: block; padding: 10px 20px; background: #0B1F3A; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">Reload Application</button>
            </div>
          `;
          app.style.display = 'block';
        }
      }
    } else {
      const landing = document.getElementById('landingPage');
      const app = document.getElementById('appContainer');
      if (landing) landing.style.display = 'block';
      if (app) app.style.display = 'none';

      registerServiceWorker();
      setupInstallPrompt();
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('[App] Service Worker registered'))
        .catch(err => console.log('[App] SW registration failed:', err));
    }
  }

  function setupInstallPrompt() {
    const installBtn = document.getElementById('installBtn');
    const installFallback = document.getElementById('installFallback');

    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    if (isIOS) {
      if (installFallback) installFallback.style.display = 'block';
      if (installBtn) installBtn.style.display = 'none';
    } else {
      if (installFallback) installFallback.style.display = 'none';
      if (installBtn) installBtn.style.display = 'none';
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;

      if (installBtn) installBtn.style.display = 'block';
      if (installFallback) installFallback.style.display = 'none';
    });

    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          console.log(`[App] User choice: ${outcome}`);
          deferredPrompt = null;
          installBtn.style.display = 'none';
        }
      });
    }

    window.addEventListener('appinstalled', () => {
      console.log('[App] App installed successfully');
    });
  }

  function checkFirstTimeUser() {
    const isSetupDone = localStorage.getItem(SETUP_KEY);
    if (isSetupDone === 'true') {
      showScreen('dashboard');
      showTabbar();
      showNavbar();
    } else {
      showScreen('setup');
      hideTabbar();
      hideNavbar();
    }
  }

  // ========== PROFILE HELPERS ==========
  function getProfile() {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveProfile(data) {
    try {
      const existing = getProfile();
      const merged = { ...existing, ...data, updatedAt: new Date().toISOString() };
      localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
      setTimeout(() => { if (window.GDriveSync) GDriveSync.triggerSync(); }, 0);
      return merged;
    } catch (err) {
      console.error('[App] Failed to save profile to LocalStorage:', err);
      showToast('Storage full or unavailable. Could not save details.', 'error');
      throw err;
    }
  }

  function compressAndPreviewImage(file, previewEl) {
    if (!file) return;

    // Show dynamic spinner while loading and compressing
    previewEl.innerHTML = '<div class="spinner" style="width: 24px; height: 24px; border-width: 3px; margin: auto;"></div>';

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Compress as JPEG with 0.7 quality to save storage space
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);

        previewEl.innerHTML = `<img src="${compressedDataUrl}" alt="Logo">`;
        previewEl.dataset.logoData = compressedDataUrl;

        // Show remove button
        const removeBtnId = previewEl.id === 'setupLogoPreview' ? 'setupLogoRemoveBtn' : 'editLogoRemoveBtn';
        const removeBtn = document.getElementById(removeBtnId);
        if (removeBtn) removeBtn.classList.remove('hidden');
      };
      img.onerror = () => {
        showToast('Invalid image file', 'error');
        previewEl.innerHTML = '<span class="upload-icon"><svg class="icon-svg" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></span>';
        previewEl.dataset.logoData = '';
      };
      img.src = e.target.result;
    };
    reader.onerror = () => {
      showToast('Failed to read image', 'error');
      previewEl.innerHTML = '<span class="upload-icon"><svg class="icon-svg" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></span>';
      previewEl.dataset.logoData = '';
    };
    reader.readAsDataURL(file);
  }

  function handleRemoveLogo(previewId, inputId, removeBtnId) {
    const preview = document.getElementById(previewId);
    const input = document.getElementById(inputId);
    const removeBtn = document.getElementById(removeBtnId);

    preview.innerHTML = '<span class="upload-icon"><svg class="icon-svg" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></span>';
    preview.dataset.logoData = '';

    if (input) input.value = '';
    if (removeBtn) removeBtn.classList.add('hidden');
  }

  // ========== NAVIGATION ==========
  function showScreen(name) {
    // Track history for back navigation
    if (currentScreen && currentScreen !== name) {
      screenHistory.push(currentScreen);
    }

    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => s.classList.remove('active'));

    const screenMap = {
      'setup': 'setupScreen',
      'dashboard': 'dashboardScreen',
      'billCreate': 'billCreateScreen',
      'billsList': 'billsListScreen',
      'billDetail': 'billDetailScreen',
      'settings': 'settingsScreen',
      'backup': 'backupScreen',
      'editShop': 'editShopScreen',
      'editPref': 'editPrefScreen',
      'about': 'aboutScreen',
      'ledger': 'ledgerScreen',
      'catalog': 'catalogScreen',
      'catalogForm': 'catalogFormScreen',
      'template': 'templateScreen',
      'printer': 'printerScreen'
    };

    const screenId = screenMap[name];
    if (screenId) {
      const el = document.getElementById(screenId);
      el.classList.add('active');
    }

    currentScreen = name;

    // Update navbar and tabbar visibility
    const noTabbarScreens = ['setup', 'billCreate', 'billDetail', 'backup', 'editShop', 'editPref', 'about', 'catalog', 'catalogForm', 'template', 'printer'];
    if (noTabbarScreens.includes(name)) {
      hideTabbar();
    } else {
      showTabbar();
    }

    // Update navbar
    if (name === 'setup') {
      hideNavbar();
    } else {
      showNavbar();
      const backScreens = ['billCreate', 'billDetail', 'backup', 'editShop', 'editPref', 'about', 'catalog', 'catalogForm', 'template', 'printer'];
      if (backScreens.includes(name)) {
        showBackButton();
      } else {
        hideBackButton();
      }
    }

    // Update tab highlight
    updateTabHighlight(name);

    // Screen-specific init
    switch (name) {
      case 'dashboard': initDashboard(); break;
      case 'billCreate': initBillCreate(); break;
      case 'billsList': initBillsList(); break;
      case 'settings': initSettings(); break;
      case 'editShop': initEditShop(); break;
      case 'editPref': initEditPref(); break;
      case 'ledger': initLedger(); break;
      case 'catalog': initCatalog(); break;
      case 'template': initTemplateDesigner(); break;
      case 'printer': initPrinterSettings(); break;
    }

    // Reset ledger UI state when navigating
    if (name !== 'ledger') {
      document.getElementById('ledgerDetailWrapper')?.classList.add('hidden');
      document.getElementById('ledgerMainContent')?.classList.remove('hidden');
    }

    // Scroll to top
    window.scrollTo(0, 0);
  }

  function goBack() {
    if (screenHistory.length > 0) {
      const prev = screenHistory.pop();
      // Don't push to history when going back
      const screens = document.querySelectorAll('.screen');
      screens.forEach(s => s.classList.remove('active'));

      const screenMap = {
        'setup': 'setupScreen',
        'dashboard': 'dashboardScreen',
        'billCreate': 'billCreateScreen',
        'billsList': 'billsListScreen',
        'billDetail': 'billDetailScreen',
        'settings': 'settingsScreen',
        'backup': 'backupScreen',
        'editShop': 'editShopScreen',
        'editPref': 'editPrefScreen',
        'about': 'aboutScreen',
        'ledger': 'ledgerScreen',
        'catalog': 'catalogScreen',
        'catalogForm': 'catalogFormScreen',
        'template': 'templateScreen',
        'printer': 'printerScreen'
      };

      const screenId = screenMap[prev];
      if (screenId) {
        document.getElementById(screenId).classList.add('active');
      }
      currentScreen = prev;

      const noTabbarScreens = ['setup', 'billCreate', 'billDetail', 'backup', 'editShop', 'editPref', 'about', 'catalog', 'catalogForm', 'template', 'printer'];
      if (noTabbarScreens.includes(prev)) {
        hideTabbar();
      } else {
        showTabbar();
      }

      if (prev === 'setup') {
        hideNavbar();
      } else {
        showNavbar();
        const backScreens = ['billCreate', 'billDetail', 'backup', 'editShop', 'editPref', 'about', 'catalog', 'catalogForm', 'template', 'printer'];
        if (backScreens.includes(prev)) {
          showBackButton();
        } else {
          hideBackButton();
        }
      }

      updateTabHighlight(prev);

      // Re-init screen
      switch (prev) {
        case 'dashboard': initDashboard(); break;
        case 'billsList': initBillsList(); break;
        case 'settings': initSettings(); break;
        case 'ledger': initLedger(); break;
        case 'catalog': initCatalog(); break;
        case 'template': initTemplateDesigner(); break;
        case 'printer': initPrinterSettings(); break;
      }

      window.scrollTo(0, 0);
    } else {
      showScreen('dashboard');
    }
  }

  function showNavbar() { document.getElementById('navbar').classList.remove('hidden'); }
  function hideNavbar() { document.getElementById('navbar').classList.add('hidden'); }
  function showTabbar() { document.getElementById('tabbar').classList.remove('hidden'); }
  function hideTabbar() { document.getElementById('tabbar').classList.add('hidden'); }

  function showBackButton() {
    document.getElementById('navBackBtn').classList.remove('hidden');
    document.getElementById('navActions').classList.add('hidden');
  }

  function hideBackButton() {
    document.getElementById('navBackBtn').classList.add('hidden');
    document.getElementById('navActions').classList.remove('hidden');
  }

  function updateTabHighlight(screen) {
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    if (screen === 'dashboard') {
      document.getElementById('tabHome').classList.add('active');
    } else if (screen === 'billsList' || screen === 'billDetail') {
      document.getElementById('tabBills').classList.add('active');
    } else if (screen === 'ledger') {
      document.getElementById('tabLedger').classList.add('active');
    } else if (screen === 'settings' || screen === 'editShop' || screen === 'editPref' || screen === 'backup' || screen === 'template' || screen === 'printer') {
      document.getElementById('tabSettings').classList.add('active');
    }
  }

  // ========== EVENT BINDING ==========
  function bindEvents() {
    // Navigation
    document.getElementById('navBackBtn').addEventListener('click', goBack);
    document.getElementById('navSettingsBtn')?.addEventListener('click', () => showScreen('settings'));
    document.getElementById('navBackupBtn')?.addEventListener('click', () => showScreen('backup'));

    // Tab bar
    document.querySelectorAll('.tab-item').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        screenHistory = []; // Reset history on tab navigation
        showScreen(target);
      });
    });

    // Setup screen
    document.getElementById('setupLogoPreview').addEventListener('click', () => {
      document.getElementById('setupLogoInput').click();
    });
    document.getElementById('setupLogoInput').addEventListener('change', handleSetupLogo);
    document.getElementById('setupLogoRemoveBtn').addEventListener('click', () => {
      handleRemoveLogo('setupLogoPreview', 'setupLogoInput', 'setupLogoRemoveBtn');
    });
    document.getElementById('setupSaveBtn').addEventListener('click', handleSetupSave);

    // Dashboard
    document.getElementById('dashNewBillBtn').addEventListener('click', () => showScreen('billCreate'));
    document.getElementById('dashViewBillsBtn').addEventListener('click', () => showScreen('billsList'));
    document.getElementById('dashSettingsBtn').addEventListener('click', () => showScreen('settings'));
    document.getElementById('dashViewAllBtn').addEventListener('click', () => showScreen('billsList'));
    document.getElementById('dashFab').addEventListener('click', () => showScreen('billCreate'));

    // Bill Creation
    document.getElementById('createAddItemTopBtn').addEventListener('click', addItemRow);
    document.getElementById('createAddItemBtn').addEventListener('click', addItemRow);
    document.getElementById('createDiscountValue').addEventListener('input', recalcBill);
    document.getElementById('createDiscountType').addEventListener('change', recalcBill);
    document.getElementById('createTaxValue').addEventListener('input', recalcBill);
    document.getElementById('createTaxType').addEventListener('change', recalcBill);
    document.getElementById('createSaveBtn').addEventListener('click', handleSaveBill);
    document.getElementById('createPdfBtn').addEventListener('click', handleSaveAndPdf);

    // Payment type chips
    document.getElementById('createPaymentTypes').addEventListener('click', (e) => {
      const chip = e.target.closest('.payment-chip');
      if (!chip) return;
      document.querySelectorAll('#createPaymentTypes .payment-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectedPayment = chip.dataset.payment;
    });

    // Payment status chips
    document.getElementById('createPaymentStatus').addEventListener('click', (e) => {
      const chip = e.target.closest('.payment-chip');
      if (!chip) return;
      document.querySelectorAll('#createPaymentStatus .payment-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectedPaymentStatus = chip.dataset.status;

      const amountPaidGroup = document.getElementById('amountPaidGroup');
      if (selectedPaymentStatus === 'Partial') {
        amountPaidGroup.classList.remove('hidden');
        document.getElementById('createAmountPaid').value = '';
        document.getElementById('createAmountPaid').focus();
      } else {
        amountPaidGroup.classList.add('hidden');
      }
    });

    // Bills List
    document.getElementById('billsSearchInput').addEventListener('input', debounce(handleBillSearch, 300));
    document.getElementById('billsFab').addEventListener('click', () => showScreen('billCreate'));
    document.getElementById('emptyCreateBtn')?.addEventListener('click', () => showScreen('billCreate'));

    // Sort button
    document.getElementById('billsSortBtn').addEventListener('click', () => {
      // Cycle: date → amount → name → date
      const sortModes = ['date', 'amount', 'name'];
      const labels = { date: 'Date', amount: 'Amount', name: 'Name' };
      const idx = sortModes.indexOf(billsSortBy);
      if (billsSortOrder === 'desc') {
        billsSortOrder = 'asc';
      } else {
        billsSortOrder = 'desc';
        billsSortBy = sortModes[(idx + 1) % sortModes.length];
      }
      const arrow = billsSortOrder === 'desc' ? '↓' : '↑';
      document.getElementById('billsSortBtn').innerHTML = `
        <svg class="icon-svg" viewBox="0 0 24 24" style="width:16px;height:16px;margin-right:4px;"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="8" y2="18"/></svg>
        ${labels[billsSortBy]} ${arrow}
      `;
      sortBills();
      currentPage = 1;
      renderBillsList();
    });

    // Bill Detail
    document.getElementById('detailPdfBtn').addEventListener('click', () => generatePdf(currentBillId));
    document.getElementById('detailWhatsappBtn').addEventListener('click', () => shareWhatsApp(currentBillId));
    document.getElementById('detailPrintBtn').addEventListener('click', () => handleBluetoothPrint(currentBillId));
    document.getElementById('detailDeleteBtn').addEventListener('click', handleDeleteBill);
    document.getElementById('detailPayBtn').addEventListener('click', () => handleSingleBillRepayment(currentBillId));

    // Ledger details
    document.getElementById('ledgerDetailBackBtn').addEventListener('click', goBackToLedgerList);
    document.getElementById('repaymentSaveBtn').addEventListener('click', handleRepaymentSave);

    // Settings
    document.getElementById('settingsEditShopBtn').addEventListener('click', () => showScreen('editShop'));
    document.getElementById('settingsDiscountItem').addEventListener('click', () => showScreen('editPref'));
    document.getElementById('settingsTaxItem').addEventListener('click', () => showScreen('editPref'));
    document.getElementById('settingsPrefixItem').addEventListener('click', () => showScreen('editPref'));
    document.getElementById('settingsBackupItem').addEventListener('click', () => showScreen('backup'));
    document.getElementById('settingsCatalogItem').addEventListener('click', () => showScreen('catalog'));
    document.getElementById('settingsTemplateItem').addEventListener('click', () => showScreen('template'));
    document.getElementById('settingsPrinterItem').addEventListener('click', () => showScreen('printer'));

    // Template Designer Layout Selection
    document.querySelectorAll('.layout-grid .layout-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.layout-grid .layout-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        updateLivePreview();
      });
    });

    // Template Designer Preset Color Selection
    document.querySelectorAll('#presetSwatches .color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        document.querySelectorAll('#presetSwatches .color-swatch').forEach(s => s.classList.remove('active'));
        document.querySelector('.custom-color-picker-wrapper').classList.remove('active');
        swatch.classList.add('active');
        updateLivePreview();
      });
    });

    // Template Designer Custom Color Picker
    const customColorInput = document.getElementById('customColorPicker');
    if (customColorInput) {
      customColorInput.addEventListener('input', () => {
        document.querySelectorAll('#presetSwatches .color-swatch').forEach(s => s.classList.remove('active'));
        document.querySelector('.custom-color-picker-wrapper').classList.add('active');
        updateLivePreview();
      });
      customColorInput.addEventListener('change', () => {
        updateLivePreview();
      });
    }

    // Template Designer Action Buttons
    document.getElementById('templateSaveBtn').addEventListener('click', handleTemplateSave);
    document.getElementById('templateCancelBtn').addEventListener('click', goBack);

    // Product Catalog
    document.getElementById('catalogFab').addEventListener('click', () => showCatalogForm(null));
    document.getElementById('catalogSearchInput').addEventListener('input', handleCatalogSearch);
    document.getElementById('catalogFormSaveBtn').addEventListener('click', handleCatalogFormSave);
    document.getElementById('catalogFormDeleteBtn').addEventListener('click', handleCatalogDelete);
    document.getElementById('settingsClearItem').addEventListener('click', handleClearAllData);
    document.getElementById('settingsAboutItem').addEventListener('click', () => showScreen('about'));
    document.getElementById('settingsResetBtn').addEventListener('click', handleResetApp);
    document.getElementById('aboutBackBtn').addEventListener('click', goBack);

    // Thermal Printer Settings
    document.getElementById('printerConnectBtn').addEventListener('click', connectBluetoothPrinter);
    document.getElementById('printerDisconnectBtn').addEventListener('click', disconnectBluetoothPrinter);
    document.getElementById('printerTestBtn').addEventListener('click', printTestReceipt);
    document.getElementById('printerCancelBtn').addEventListener('click', goBack);
    document.getElementById('printerPaperWidth').addEventListener('change', handlePaperWidthChange);

    document.querySelectorAll('.paper-width-card').forEach(card => {
      card.addEventListener('click', () => {
        const width = card.dataset.width;
        const select = document.getElementById('printerPaperWidth');
        if (select) {
          select.value = width;
          select.dispatchEvent(new Event('change'));
        }
        document.querySelectorAll('.paper-width-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      });
    });

    // Edit Shop
    document.getElementById('editLogoPreview').addEventListener('click', () => {
      document.getElementById('editLogoInput').click();
    });
    document.getElementById('editLogoInput').addEventListener('change', handleEditLogo);
    document.getElementById('editLogoRemoveBtn').addEventListener('click', () => {
      handleRemoveLogo('editLogoPreview', 'editLogoInput', 'editLogoRemoveBtn');
    });
    document.getElementById('editSaveBtn').addEventListener('click', handleEditShopSave);

    // Edit Preferences
    document.getElementById('prefSaveBtn').addEventListener('click', handlePrefSave);

    // Backup
    document.getElementById('backupExportBtn').addEventListener('click', handleExport);
    document.getElementById('backupImportBtn').addEventListener('click', () => {
      document.getElementById('backupImportInput').click();
    });
    document.getElementById('backupImportInput').addEventListener('change', handleImport);

    // Modal
    document.getElementById('modalCancelBtn').addEventListener('click', hideModal);
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modalOverlay')) hideModal();
    });

    // Prompt Modal
    document.getElementById('promptModalCancelBtn').addEventListener('click', hidePromptModal);
    document.getElementById('promptModalOverlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('promptModalOverlay')) hidePromptModal();
    });

    // Listen for Google Drive sync data merges
    document.addEventListener('khatabill-data-merged', async (e) => {
      const { billsAdded, billsUpdated } = e.detail;
      if (billsAdded > 0 || billsUpdated > 0) {
        showToast(`Synced with cloud: ${billsAdded} bills added, ${billsUpdated} updated`, 'success');
        
        // Refresh active screen
        if (currentScreen === 'dashboard') {
          await initDashboard();
        } else if (currentScreen === 'billsList') {
          await initBillsList();
        } else if (currentScreen === 'ledger') {
          await initLedger();
          if (activeCustomerKey) {
            showCustomerLedger(activeCustomerKey);
          }
        } else if (currentScreen === 'catalog') {
          await initCatalog();
        } else if (currentScreen === 'settings') {
          const profile = getProfile();
          const printerVal = document.getElementById('settingsPrinterValue');
          if (printerVal) {
            printerVal.textContent = profile.printerDeviceName || 'Disconnected';
          }
        }
      }
    });
  }

  // ========== SETUP SCREEN ==========
  function handleSetupLogo(e) {
    const file = e.target.files[0];
    const preview = document.getElementById('setupLogoPreview');
    compressAndPreviewImage(file, preview);
  }

  function handleSetupSave() {
    const shopName = document.getElementById('setupShopName').value.trim();
    const ownerName = document.getElementById('setupOwnerName').value.trim();
    const mobile = document.getElementById('setupMobile').value.trim();
    const address = document.getElementById('setupAddress').value.trim();
    const gstin = document.getElementById('setupGstin').value.trim();
    const logoPreview = document.getElementById('setupLogoPreview');
    const logo = logoPreview.dataset.logoData || '';

    if (!shopName) {
      showToast('Please enter shop name', 'error');
      document.getElementById('setupShopName').focus();
      return;
    }
    if (!ownerName) {
      showToast('Please enter owner name', 'error');
      document.getElementById('setupOwnerName').focus();
      return;
    }
    if (!mobile || mobile.length < 10) {
      showToast('Please enter valid mobile number', 'error');
      document.getElementById('setupMobile').focus();
      return;
    }

    saveProfile({
      shopName,
      ownerName,
      mobile,
      address,
      gstin,
      logo,
      billPrefix: 'BILL-',
      defaultDiscount: 0,
      defaultTax: 0,
      createdAt: new Date().toISOString()
    });

    // Mark setup as done
    localStorage.setItem(SETUP_KEY, 'true');

    showToast('Shop setup complete!', 'success');
    showScreen('dashboard');
  }

  // ========== DASHBOARD ==========
  async function initDashboard() {
    const profile = getProfile();
    document.getElementById('dashShopName').textContent = profile.shopName || 'Your Shop';

    if (profile.logo) {
      document.getElementById('dashShopLogoImg').src = profile.logo;
    } else {
      document.getElementById('dashShopLogoImg').src = 'assests/image/logo.png';
    }

    // Load recent bills
    try {
      const bills = await KhataBillDB.getAllBills();
      const recentBills = bills.slice(0, 3);
      const container = document.getElementById('dashRecentBills');

      if (recentBills.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="padding: 24px 0;">
            <div class="empty-state-icon">
              <svg class="icon-svg" viewBox="0 0 24 24" style="width:40px;height:40px;stroke:var(--text-muted);"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </div>
            <h3>No bills yet</h3>
            <p>Create your first bill!</p>
          </div>
        `;
      } else {
        container.innerHTML = recentBills.map(bill => renderBillCard(bill, true)).join('');
        // Bind click events
        container.querySelectorAll('.bill-card').forEach(card => {
          card.addEventListener('click', () => {
            const id = parseInt(card.dataset.billId);
            showBillDetail(id);
          });
        });
      }
    } catch (err) {
      console.error('Failed to load recent bills:', err);
    }
  }

  // ========== BILL CREATION ==========
  async function initBillCreate() {
    const profile = getProfile();

    // Generate bill number
    try {
      const billNumber = await KhataBillDB.getNextBillNumber();
      document.getElementById('createBillNumber').textContent = 'Bill No: ' + billNumber;
    } catch (err) {
      document.getElementById('createBillNumber').textContent = 'Bill No: BILL-00001';
    }

    // Set date
    const now = new Date();
    const dateStr = formatDate(now);
    document.getElementById('createBillDateText').textContent = dateStr;

    // Clear form
    document.getElementById('createCustName').value = '';
    document.getElementById('createCustMobile').value = '';

    // Set default discount/tax
    document.getElementById('createDiscountValue').value = profile.defaultDiscount || 0;
    document.getElementById('createDiscountType').value = '%';
    document.getElementById('createTaxValue').value = profile.defaultTax || 0;
    document.getElementById('createTaxType').value = '%';

    // Reset payment
    selectedPayment = 'Cash';
    selectedPaymentStatus = 'Paid';
    document.querySelectorAll('#createPaymentTypes .payment-chip').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-payment="Cash"]').classList.add('active');

    document.querySelectorAll('#createPaymentStatus .payment-chip').forEach(c => c.classList.remove('active'));
    document.querySelector('#createPaymentStatus [data-status="Paid"]').classList.add('active');
    document.getElementById('amountPaidGroup').classList.add('hidden');
    // Load products list for datalist autocomplete
    try {
      allCatalogProducts = await KhataBillDB.getAllProducts();
      const datalist = document.getElementById('productsDatalist');
      if (datalist) {
        datalist.innerHTML = allCatalogProducts.map(p => `<option value="${p.name}"></option>`).join('');
      }
    } catch (err) {
      console.warn('Failed to load products for datalist:', err);
    }

    // Reset items - add one empty row
    billItems = [];
    document.getElementById('createItemsBody').innerHTML = '';
    addItemRow();

    recalcBill();
  }

  function addItemRow() {
    const index = billItems.length;
    billItems.push({ name: '', qty: 1, price: 0, total: 0 });

    const row = document.createElement('div');
    row.className = 'item-row';
    row.dataset.index = index;
    row.innerHTML = `
      <input type="text" placeholder="Item name" class="item-name" data-idx="${index}" list="productsDatalist">
      <input type="number" placeholder="1" value="1" min="1" class="item-qty" data-idx="${index}">
      <input type="number" placeholder="0.00" min="0" step="0.01" class="item-price" data-idx="${index}">
      <input type="text" value="0.00" readonly class="item-total" data-idx="${index}">
      <button class="item-delete-btn" data-idx="${index}" aria-label="Remove item">
        <svg class="icon-svg" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
      </button>
    `;

    document.getElementById('createItemsBody').appendChild(row);

    // Bind events
    row.querySelector('.item-name').addEventListener('input', (e) => {
      const val = e.target.value;
      billItems[index].name = val;

      // Autocomplete pre-fill
      const match = allCatalogProducts.find(p => p.name && p.name.trim().toLowerCase() === val.trim().toLowerCase());
      if (match) {
        billItems[index].price = parseFloat(match.price) || 0;
        const priceInput = row.querySelector('.item-price');
        if (priceInput) {
          priceInput.value = match.price;
        }
        updateItemTotal(index);
        recalcBill();
      }
    });

    row.querySelector('.item-qty').addEventListener('input', (e) => {
      billItems[index].qty = parseFloat(e.target.value) || 0;
      updateItemTotal(index);
      recalcBill();
    });

    row.querySelector('.item-price').addEventListener('input', (e) => {
      billItems[index].price = parseFloat(e.target.value) || 0;
      updateItemTotal(index);
      recalcBill();
    });

    row.querySelector('.item-delete-btn').addEventListener('click', () => {
      if (billItems.length <= 1) {
        showToast('At least one item is required', 'warning');
        return;
      }
      row.style.animation = 'toastOut 0.2s ease forwards';
      setTimeout(() => {
        row.remove();
        billItems.splice(index, 1);
        // Re-index remaining rows
        reindexItems();
        recalcBill();
      }, 200);
    });

    // Focus the name input
    row.querySelector('.item-name').focus();
  }

  function reindexItems() {
    const rows = document.querySelectorAll('#createItemsBody .item-row');
    rows.forEach((row, i) => {
      row.dataset.index = i;
      row.querySelector('.item-name').dataset.idx = i;
      row.querySelector('.item-qty').dataset.idx = i;
      row.querySelector('.item-price').dataset.idx = i;
      row.querySelector('.item-total').dataset.idx = i;
      row.querySelector('.item-delete-btn').dataset.idx = i;
    });
  }

  function updateItemTotal(index) {
    const qty = billItems[index].qty || 0;
    const price = billItems[index].price || 0;
    const total = qty * price;
    billItems[index].total = total;

    const totalInput = document.querySelector(`.item-total[data-idx="${index}"]`);
    if (totalInput) {
      totalInput.value = total.toFixed(2);
    }
  }

  function recalcBill() {
    // Subtotal
    const subtotal = billItems.reduce((sum, item) => sum + (item.total || 0), 0);
    document.getElementById('createSubtotal').textContent = '₹' + subtotal.toFixed(2);

    // Discount
    const discType = document.getElementById('createDiscountType').value;
    const discVal = parseFloat(document.getElementById('createDiscountValue').value) || 0;
    let discountAmount = 0;
    if (discType === '%') {
      discountAmount = (subtotal * discVal) / 100;
    } else {
      discountAmount = discVal;
    }
    document.getElementById('createDiscountDisplay').textContent = discountAmount.toFixed(2);

    // Tax
    const taxType = document.getElementById('createTaxType').value;
    const taxVal = parseFloat(document.getElementById('createTaxValue').value) || 0;
    let taxAmount = 0;
    const afterDiscount = subtotal - discountAmount;
    if (taxType === '%') {
      taxAmount = (afterDiscount * taxVal) / 100;
    } else {
      taxAmount = taxVal;
    }
    document.getElementById('createTaxDisplay').textContent = taxAmount.toFixed(2);

    // Total
    const total = afterDiscount + taxAmount;
    document.getElementById('createTotal').textContent = '₹' + total.toFixed(2);
  }

  async function handleSaveBill() {
    const bill = collectBillData();
    if (!bill) return;

    try {
      await KhataBillDB.addBill(bill);
      showToast('Bill saved successfully!', 'success');
      showScreen('dashboard');
    } catch (err) {
      showToast('Failed to save bill', 'error');
      console.error(err);
    }
  }

  async function handleSaveAndPdf() {
    const bill = collectBillData();
    if (!bill) return;

    try {
      const id = await KhataBillDB.addBill(bill);
      showToast('Bill saved! Generating PDF...', 'success');
      await generatePdf(id);
    } catch (err) {
      showToast('Failed to save bill', 'error');
      console.error(err);
    }
  }

  function collectBillData() {
    const customerName = document.getElementById('createCustName').value.trim();
    const customerMobile = document.getElementById('createCustMobile').value.trim();

    if (!customerName) {
      showToast('Please enter customer name', 'error');
      document.getElementById('createCustName').focus();
      return null;
    }

    // Filter valid items
    const validItems = billItems.filter(item => item.name && item.name.trim() !== '');
    if (validItems.length === 0) {
      showToast('Please add at least one item', 'error');
      return null;
    }

    const subtotal = parseFloat(validItems.reduce((sum, item) => sum + (item.total || 0), 0).toFixed(2));

    const discType = document.getElementById('createDiscountType').value;
    const discVal = parseFloat(document.getElementById('createDiscountValue').value) || 0;
    let discountAmount = discType === '%' ? (subtotal * discVal) / 100 : discVal;
    discountAmount = parseFloat(discountAmount.toFixed(2));

    const taxType = document.getElementById('createTaxType').value;
    const taxVal = parseFloat(document.getElementById('createTaxValue').value) || 0;
    const afterDiscount = parseFloat((subtotal - discountAmount).toFixed(2));
    let taxAmount = taxType === '%' ? (afterDiscount * taxVal) / 100 : taxVal;
    taxAmount = parseFloat(taxAmount.toFixed(2));

    const totalAmount = parseFloat((afterDiscount + taxAmount).toFixed(2));

    const billNumber = document.getElementById('createBillNumber').textContent.replace('Bill No: ', '');

    let amountPaid = 0;
    let paymentStatus = selectedPaymentStatus;

    if (selectedPaymentStatus === 'Paid') {
      amountPaid = totalAmount;
    } else if (selectedPaymentStatus === 'Unpaid') {
      amountPaid = 0;
    } else {
      const inputVal = parseFloat(document.getElementById('createAmountPaid').value) || 0;
      amountPaid = parseFloat(inputVal.toFixed(2));
      if (amountPaid >= totalAmount - 0.015) {
        amountPaid = totalAmount;
        paymentStatus = 'Paid';
      } else if (amountPaid <= 0.015) {
        amountPaid = 0;
        paymentStatus = 'Unpaid';
      }
    }

    return {
      billNumber,
      customerName,
      customerMobile,
      items: validItems.map(item => ({
        name: item.name.trim(),
        qty: item.qty,
        price: item.price,
        total: item.total
      })),
      subtotal,
      discountType: discType,
      discountValue: discVal,
      discountAmount,
      taxType,
      taxValue: taxVal,
      taxAmount,
      totalAmount,
      paymentType: selectedPayment,
      paymentStatus: paymentStatus,
      amountPaid: amountPaid,
      date: new Date().toISOString()
    };
  }

  // ========== BILLS LIST ==========
  async function initBillsList() {
    try {
      allBills = await KhataBillDB.getAllBills();
      sortBills();
      currentPage = 1;
      renderBillsList();

      // Stats
      const stats = await KhataBillDB.getBillStats();
      document.getElementById('statTotalBills').textContent = stats.totalBills;
      document.getElementById('statTotalAmount').textContent = '₹' + formatAmount(stats.totalAmount);

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const now = new Date();
      document.getElementById('statMonthLabel').textContent = months[now.getMonth()] + ' ' + now.getFullYear();
    } catch (err) {
      console.error('Failed to load bills:', err);
    }
  }

  function sortBills() {
    allBills.sort((a, b) => {
      let valA, valB;
      switch (billsSortBy) {
        case 'amount':
          valA = parseFloat(a.totalAmount) || 0;
          valB = parseFloat(b.totalAmount) || 0;
          break;
        case 'name':
          valA = (a.customerName || '').toLowerCase();
          valB = (b.customerName || '').toLowerCase();
          return billsSortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        case 'date':
        default:
          valA = new Date(a.date || a.createdAt).getTime();
          valB = new Date(b.date || b.createdAt).getTime();
          break;
      }
      return billsSortOrder === 'asc' ? valA - valB : valB - valA;
    });
  }

  function renderBillsList() {
    const container = document.getElementById('billsListContainer');
    const emptyState = document.getElementById('billsEmptyState');
    const pagination = document.getElementById('billsPagination');
    const pageInfo = document.getElementById('billsPageInfo');

    if (allBills.length === 0) {
      container.innerHTML = '';
      const searchQuery = document.getElementById('billsSearchInput').value.trim();
      const emptyIcon = document.querySelector('#billsEmptyState .empty-state-icon');
      const emptyTitle = document.querySelector('#billsEmptyState h3');
      const emptyDesc = document.querySelector('#billsEmptyState p');
      if (searchQuery) {
        if (emptyIcon) {
          emptyIcon.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" style="width:48px;height:48px;stroke:var(--text-muted);"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
        }
        if (emptyTitle) emptyTitle.textContent = 'No matching bills found';
        if (emptyDesc) emptyDesc.textContent = `No results for "${searchQuery}". Try a different search.`;
      } else {
        if (emptyIcon) {
          emptyIcon.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" style="width:48px;height:48px;stroke:var(--text-muted);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
        }
        if (emptyTitle) emptyTitle.textContent = 'No bills yet';
        if (emptyDesc) emptyDesc.textContent = 'Create your first bill to get started!';
      }
      emptyState.classList.remove('hidden');
      pagination.classList.add('hidden');
      pageInfo.classList.add('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    // Paginate
    const totalPages = Math.ceil(allBills.length / BILLS_PER_PAGE);
    const start = (currentPage - 1) * BILLS_PER_PAGE;
    const end = start + BILLS_PER_PAGE;
    const pageBills = allBills.slice(start, end);

    container.innerHTML = pageBills.map(bill => renderBillCard(bill, true)).join('');

    // Bind click events
    container.querySelectorAll('.bill-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = parseInt(card.dataset.billId);
        showBillDetail(id);
      });
    });

    // Render pagination
    if (totalPages > 1) {
      pagination.classList.remove('hidden');
      pageInfo.classList.remove('hidden');
      let paginationHtml = '';

      // Prev button
      paginationHtml += `<button class="page-btn" data-page="prev" ${currentPage === 1 ? 'disabled' : ''} aria-label="Previous page"><svg class="icon-svg" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>`;

      for (let i = 1; i <= totalPages; i++) {
        if (totalPages <= 5 || i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
          paginationHtml += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
          paginationHtml += `<button class="page-btn" disabled>...</button>`;
        }
      }

      // Next button
      paginationHtml += `<button class="page-btn" data-page="next" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Next page"><svg class="icon-svg" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></button>`;

      pagination.innerHTML = paginationHtml;
      pageInfo.textContent = `Showing ${start + 1} to ${Math.min(end, allBills.length)} of ${allBills.length}`;

      // Bind pagination
      pagination.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const page = btn.dataset.page;
          if (page === 'prev') currentPage = Math.max(1, currentPage - 1);
          else if (page === 'next') currentPage = Math.min(totalPages, currentPage + 1);
          else currentPage = parseInt(page);
          renderBillsList();
          window.scrollTo(0, 0);
        });
      });
    } else {
      pagination.classList.add('hidden');
      pageInfo.classList.add('hidden');
    }
  }

  async function handleBillSearch(e) {
    const query = e.target.value.trim();
    if (!query) {
      allBills = await KhataBillDB.getAllBills();
    } else {
      allBills = await KhataBillDB.searchBills(query);
    }
    sortBills();
    currentPage = 1;
    renderBillsList();
  }

  function renderBillCard(bill, showStatus = false) {
    const date = new Date(bill.date || bill.createdAt);
    const dateStr = formatDateShort(date);
    
    let paymentStatus = bill.paymentStatus || 'Paid';
    const totalAmt = parseFloat(bill.totalAmount) || 0;
    const amtPaid = bill.amountPaid !== undefined ? parseFloat(bill.amountPaid) : (paymentStatus === 'Paid' ? totalAmt : 0);
    if (paymentStatus !== 'Paid' && totalAmt - amtPaid <= 0.015) {
      paymentStatus = 'Paid';
    }
    
    const statusClass = paymentStatus.toLowerCase();
    const statusHtml = showStatus ? `<span class="bill-card-status ${statusClass}">${paymentStatus}</span>` : '';

    return `
      <div class="bill-card" data-bill-id="${bill.id}">
        <div class="bill-card-icon">
          <svg class="icon-svg" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        </div>
        <div class="bill-card-info">
          <div class="bill-card-number">${bill.billNumber || '-'}</div>
          <div class="bill-card-customer">${bill.customerName || 'Unknown'}${bill.customerMobile ? ` • <svg class="icon-svg" viewBox="0 0 24 24" style="width:12px;height:12px;display:inline-block;stroke:var(--text-secondary);vertical-align:middle;margin-right:2px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${bill.customerMobile}` : ''}</div>
        </div>
        <div class="bill-card-right">
          <div class="bill-card-amount">₹${formatAmount(bill.totalAmount)}</div>
          <div class="bill-card-date">${dateStr}</div>
          ${statusHtml}
        </div>
        <span class="bill-card-chevron"><svg class="icon-svg" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span>
      </div>
    `;
  }

  // ========== BILL DETAIL ==========
  async function showBillDetail(id) {
    currentBillId = id;
    try {
      const bill = await KhataBillDB.getBill(id);
      if (!bill) {
        showToast('Bill not found', 'error');
        return;
      }

      const profile = getProfile();
      const date = new Date(bill.date || bill.createdAt);

      const totalAmt = parseFloat(bill.totalAmount) || 0;
      let amtPaid = bill.amountPaid !== undefined ? parseFloat(bill.amountPaid) : (bill.paymentStatus === 'Paid' ? totalAmt : 0);
      let dues = totalAmt - amtPaid;
      let paymentStatus = bill.paymentStatus || 'Paid';

      if (paymentStatus !== 'Paid' && dues <= 0.015) {
        paymentStatus = 'Paid';
        amtPaid = totalAmt;
        dues = 0;
      }

      const payBtn = document.getElementById('detailPayBtn');
      if (payBtn) {
        if (paymentStatus !== 'Paid') {
          payBtn.classList.remove('hidden');
        } else {
          payBtn.classList.add('hidden');
        }
      }

      const card = document.getElementById('billDetailCard');
      card.innerHTML = `
        <!-- Shop Header -->
        <div class="bill-detail-top">
          <div class="bill-detail-shop">
            ${(profile.showLogoOnBill !== false && profile.logo) ? `
            <div class="bill-detail-shop-logo">
              <img src="${profile.logo}" alt="Shop">
            </div>
            ` : ''}
            <div class="bill-detail-shop-info">
              <h3>${profile.shopName || 'Shop'}</h3>
              ${profile.address ? `<p><svg class="icon-svg" viewBox="0 0 24 24" style="width:13px;height:13px;stroke:var(--text-secondary);margin-right:4px;vertical-align:-2px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${profile.address}</p>` : ''}
              ${profile.mobile ? `<p><svg class="icon-svg" viewBox="0 0 24 24" style="width:13px;height:13px;stroke:var(--text-secondary);margin-right:4px;vertical-align:-2px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${profile.mobile}</p>` : ''}
              ${profile.gstin ? `<p><svg class="icon-svg" viewBox="0 0 24 24" style="width:13px;height:13px;stroke:var(--text-secondary);margin-right:4px;vertical-align:-2px;"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="16"/><line x1="15" y1="22" x2="15" y2="16"/><line x1="9" y1="16" x2="15" y2="16"/></svg>GSTIN: ${profile.gstin}</p>` : ''}
            </div>
          </div>
          <div class="bill-detail-meta">
            <div class="bill-detail-badge">
              <span class="badge">${bill.billNumber}</span>
            </div>
            <div class="bill-detail-date">
              <strong>${formatDate(date)}</strong>
              ${getDayName(date)}
            </div>
          </div>
        </div>

        <!-- Customer -->
        <div class="bill-detail-customer">
          <h4><svg class="icon-svg" viewBox="0 0 24 24" style="width:15px;height:15px;stroke:var(--text-muted);margin-right:6px;vertical-align:-2px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Customer Details</h4>
          <p>${bill.customerName}</p>
          ${bill.customerMobile ? `<p class="phone"><svg class="icon-svg" viewBox="0 0 24 24" style="width:13px;height:13px;stroke:var(--text-secondary);margin-right:4px;vertical-align:-2px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${bill.customerMobile}</p>` : ''}
        </div>

        <!-- Items -->
        <div class="bill-detail-items">
          <table class="detail-items-table">
            <thead>
              <tr>
                <th>Sr.</th>
                <th>Item Name</th>
                <th>Qty</th>
                <th>Price (₹)</th>
                <th>Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${(bill.items || []).map((item, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${item.name}</td>
                  <td>${item.qty}</td>
                  <td>${parseFloat(item.price).toFixed(2)}</td>
                  <td>${parseFloat(item.total).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Summary -->
        <div class="bill-detail-summary">
          <div class="detail-summary-row">
            <span class="label">Subtotal</span>
            <span class="value">₹${parseFloat(bill.subtotal).toFixed(2)}</span>
          </div>
          <div class="detail-summary-row">
            <span class="label">Discount${bill.discountType === '%' ? ` (${bill.discountValue}%)` : ''}</span>
            <span class="value">₹${parseFloat(bill.discountAmount || 0).toFixed(2)}</span>
          </div>
          <div class="detail-summary-row">
            <span class="label">Tax${bill.taxType === '%' ? ` (${bill.taxValue}%)` : ''}</span>
            <span class="value">₹${parseFloat(bill.taxAmount || 0).toFixed(2)}</span>
          </div>
          <div class="detail-total-row">
            <span class="label">TOTAL AMOUNT</span>
            <span class="value">₹${totalAmt.toFixed(2)}</span>
          </div>
          ${paymentStatus !== 'Paid' ? `
          <div class="detail-summary-row" style="margin-top: 12px;">
            <span class="label">Amount Paid</span>
            <span class="value">₹${amtPaid.toFixed(2)}</span>
          </div>
          <div class="detail-summary-row" style="color: var(--danger); font-weight: 700;">
            <span class="label" style="color: var(--danger); font-weight: 700;">Outstanding Dues</span>
            <span class="value">₹${dues.toFixed(2)}</span>
          </div>
          ` : `
          <div class="detail-summary-row" style="margin-top: 12px; color: var(--success); font-weight: 700;">
            <span class="label" style="color: var(--success); font-weight: 700;">Payment Status</span>
            <span class="value">Paid</span>
          </div>
          `}
        </div>
      `;

      showScreen('billDetail');
    } catch (err) {
      showToast('Failed to load bill', 'error');
      console.error(err);
    }
  }

  async function handleDeleteBill() {
    showModal('Delete Bill', 'Are you sure you want to delete this bill? This action cannot be undone.', async () => {
      try {
        await KhataBillDB.deleteBill(currentBillId);
        showToast('Bill deleted', 'success');
        goBack();
      } catch (err) {
        showToast('Failed to delete bill', 'error');
      }
    });
  }

  // ========== PDF GENERATION ==========
  function getImageFormat(source) {
    const lower = (source || '').toLowerCase();
    if (lower.includes('image/jpeg') || lower.includes('image/jpg') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      return 'JPEG';
    }
    return 'PNG';
  }

  function truncateToWidth(doc, text, maxWidth) {
    if (!text) return '';
    if (doc.getTextWidth(text) <= maxWidth) return text;
    const ellipsis = '...';
    let low = 0;
    let high = text.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const candidate = text.slice(0, mid) + ellipsis;
      if (doc.getTextWidth(candidate) <= maxWidth) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return text.slice(0, low) + ellipsis;
  }

  function formatCurrency(amount) {
    const num = parseFloat(amount) || 0;
    return `Rs. ${num.toFixed(2)}`;
  }

  async function loadImageData(source) {
    if (!source) return null;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          let dataUrl = source;
          let format = getImageFormat(source);
          if (!source.startsWith('data:image/')) {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Canvas context not available'));
              return;
            }
            ctx.drawImage(img, 0, 0);
            dataUrl = canvas.toDataURL('image/png');
            format = 'PNG';
          }
          resolve({
            dataUrl,
            format,
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height
          });
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Failed to load logo image'));
      img.src = source;
    });
  }

  async function generatePdf(billId) {
    showSpinner('Generating PDF...');

    try {
      const bill = await KhataBillDB.getBill(billId);
      if (!bill) {
        hideSpinner();
        showToast('Bill not found', 'error');
        return;
      }

      const profile = getProfile();
      const shopDisplayName = bill.shopName || profile.shopName || 'Shop';
      const billDate = new Date(bill.date || bill.createdAt);
      const dateTimeText = formatDate(billDate);
      const dayText = getDayName(billDate);
      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) {
        throw new Error('jsPDF is not available');
      }

      const layout = profile.invoiceLayout || 'classic';
      const accentColor = profile.invoiceColor || '#2E7D32';
      const rgb = hexToRgb(accentColor) || { r: 46, g: 125, b: 50 };

      // Initialize doc based on template
      let doc;
      let margin;
      let pageWidth;
      let pageHeight;
      let tableStartY;
      let tableTopMargin;
      let headerLineY;
      let rightX;
      let bodyWidth;

      if (layout === 'retail') {
        const itemRowsCount = (bill.items || []).length;
        // 80mm width, height is dynamic to prevent paging on POS rolls
        pageWidth = 80;
        pageHeight = Math.max(150, 85 + itemRowsCount * 12);
        doc = new jsPDF('p', 'mm', [pageWidth, pageHeight]);
        margin = { top: 8, left: 6, right: 6, bottom: 8 };

        let curY = 19;
        if (profile.address) curY += 4;
        const contactParts = [];
        if (profile.mobile) contactParts.push('');
        if (contactParts.length) curY += 4;

        tableStartY = curY + 26;
        tableTopMargin = 8;
        headerLineY = 24;
      } else {
        doc = new jsPDF('p', 'mm', 'a4');
        margin = { top: 15, left: 14, right: 14, bottom: 15 };
        pageWidth = doc.internal.pageSize.getWidth();
        pageHeight = doc.internal.pageSize.getHeight();

        tableStartY = 70;
        if (layout === 'minimal') {
          tableStartY = 64;
        } else if (layout === 'corporate') {
          tableStartY = 72;
        }
        tableTopMargin = 36;
        headerLineY = 32;
      }

      if (typeof doc.autoTable !== 'function') {
        throw new Error('jsPDF-AutoTable is not available');
      }

      rightX = pageWidth - margin.right;
      bodyWidth = pageWidth - margin.left - margin.right;
      const showLogo = profile.showLogoOnBill !== false;

      let logoData = null;
      if (showLogo) {
        const logoSource = bill.logo || profile.logo;
        try {
          if (logoSource) {
            logoData = await loadImageData(logoSource);
          } else {
            logoData = null;
          }
        } catch (err) {
          console.warn('Logo load failed:', err);
          logoData = null;
        }
      }

      const drawHeader = () => {
        if (layout === 'retail') {
          // Retail header: centered and compact
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(0);
          doc.text(truncateToWidth(doc, shopDisplayName, bodyWidth), pageWidth / 2, 12, { align: 'center' });

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(80);
          let curY = 16;
          if (profile.address) {
            doc.text(truncateToWidth(doc, profile.address, bodyWidth), pageWidth / 2, curY, { align: 'center' });
            curY += 4;
          }
          const contactParts = [];
          if (profile.mobile) contactParts.push(`Mobile: ${profile.mobile}`);
          if (profile.gstin) contactParts.push(`GST: ${profile.gstin}`);
          if (contactParts.length) {
            doc.text(truncateToWidth(doc, contactParts.join('  |  '), bodyWidth), pageWidth / 2, curY, { align: 'center' });
            curY += 4;
          }

          doc.setDrawColor(150, 150, 150);
          doc.setLineDashPattern([1, 1], 0);
          doc.line(margin.left, curY, rightX, curY);
          doc.setLineDashPattern([], 0);
        } else if (layout === 'corporate') {
          // Corporate style top banner header
          doc.setFillColor(rgb.r, rgb.g, rgb.b);
          doc.rect(margin.left, 12, bodyWidth, 18, 'F');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(14);
          doc.setTextColor(255, 255, 255);
          doc.text('TAX INVOICE', rightX - 6, 23, { align: 'right' });

          const hasLogo = showLogo && !!logoData;
          const textX = hasLogo ? margin.left + 22 : margin.left + 6;
          if (hasLogo) {
            let logoWidth = 14;
            let logoHeight = (logoWidth * logoData.height) / logoData.width;
            if (logoHeight > 12) {
              logoHeight = 12;
              logoWidth = (logoHeight * logoData.width) / logoData.height;
            }
            doc.addImage(logoData.dataUrl, logoData.format, margin.left + 4, 15, logoWidth, logoHeight);
          }
          doc.setFontSize(12);
          doc.text(truncateToWidth(doc, shopDisplayName, rightX - textX - 50), textX, 23);

          doc.setTextColor(0, 0, 0);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          const contactParts = [];
          if (profile.address) contactParts.push(profile.address);
          if (profile.mobile) contactParts.push(`Mobile: ${profile.mobile}`);
          if (profile.gstin) contactParts.push(`GSTIN: ${profile.gstin}`);
          doc.text(truncateToWidth(doc, contactParts.join('  |  '), bodyWidth), margin.left, 36);

          doc.setDrawColor(200, 200, 200);
          doc.line(margin.left, 39, rightX, 39);
        } else if (layout === 'minimal') {
          // Minimalist clean header (no borders or fills)
          const hasLogo = showLogo && !!logoData;
          const textX = hasLogo ? margin.left + 20 : margin.left;
          if (hasLogo) {
            let logoWidth = 16;
            let logoHeight = (logoWidth * logoData.height) / logoData.width;
            doc.addImage(logoData.dataUrl, logoData.format, margin.left, 12, logoWidth, logoHeight);
          }
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          doc.setTextColor(0);
          doc.text(truncateToWidth(doc, shopDisplayName, rightX - textX - 40), textX, 18);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(100);
          const contactParts = [];
          if (profile.address) contactParts.push(profile.address);
          if (profile.mobile) contactParts.push(`Mobile: ${profile.mobile}`);
          if (profile.gstin) contactParts.push(`GSTIN: ${profile.gstin}`);
          doc.text(truncateToWidth(doc, contactParts.join('  |  '), bodyWidth), textX, 24);

          doc.setDrawColor(220, 220, 220);
          doc.line(margin.left, 29, rightX, 29);
        } else {
          // Classic layout: original styled with brand color
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(0);
          doc.setFontSize(10);
          doc.text('KhataBill Invoice', margin.left, 10);

          const hasLogo = showLogo && !!logoData;
          const textX = hasLogo ? 45 : margin.left;
          const textWidth = rightX - textX;

          if (hasLogo) {
            let logoWidth = 25;
            let logoHeight = (logoWidth * logoData.height) / logoData.width;
            if (logoHeight > 12) {
              logoHeight = 12;
              logoWidth = (logoHeight * logoData.width) / logoData.height;
            }
            doc.addImage(logoData.dataUrl, logoData.format, margin.left, 12, logoWidth, logoHeight);
          }

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(14);
          doc.setTextColor(rgb.r, rgb.g, rgb.b); // Accent color for Shop Name
          const shopName = truncateToWidth(doc, shopDisplayName, textWidth);
          doc.text(shopName, textX, 16);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(0);
          if (profile.address) {
            const address = truncateToWidth(doc, `Address: ${profile.address}`, textWidth);
            doc.text(address, textX, 22);
          }

          const contactParts = [];
          if (profile.mobile) contactParts.push(`Mobile: ${profile.mobile}`);
          if (profile.gstin) contactParts.push(`GSTIN: ${profile.gstin}`);
          if (contactParts.length) {
            const contactLine = truncateToWidth(doc, contactParts.join('  |  '), textWidth);
            doc.text(contactLine, textX, 27);
          }

          doc.setDrawColor(rgb.r, rgb.g, rgb.b); // Accent color for line
          doc.line(14, headerLineY, 196, headerLineY);
        }
      };

      const drawInvoiceSection = () => {
        if (layout === 'retail') {
          // Slip meta details block
          let curY = 16;
          if (profile.address) curY += 4;
          if (profile.mobile || profile.gstin) curY += 4;

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(0);
          doc.text('RECEIPT', pageWidth / 2, curY + 5, { align: 'center' });
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.text(`No: ${bill.billNumber || 'BILL'}`, margin.left, curY + 10);
          doc.text(dateTimeText, rightX, curY + 10, { align: 'right' });
        } else if (layout === 'corporate') {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(0);
          doc.text(`INVOICE NO: ${bill.billNumber || 'BILL'}`, margin.left, 45);

          doc.setFont('helvetica', 'normal');
          doc.text(dateTimeText, rightX, 45, { align: 'right' });
        } else if (layout === 'minimal') {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(11);
          doc.setTextColor(0);
          doc.text(`Invoice: ${bill.billNumber || 'BILL'}`, margin.left, 35);
          doc.setFontSize(9);
          doc.text(dateTimeText, rightX, 35, { align: 'right' });
        } else {
          // Classic
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(12);
          doc.setTextColor(0, 0, 0);
          doc.text('TAX INVOICE:', 14, 38);

          doc.setTextColor(rgb.r, rgb.g, rgb.b); // Accent color for bill no
          const labelWidth = doc.getTextWidth('TAX INVOICE:');
          doc.text(' ' + (bill.billNumber || 'BILL'), 14 + labelWidth, 38);

          doc.setTextColor(0, 0, 0);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.text(dateTimeText, rightX, 24, { align: 'right' });
          doc.setFontSize(9);
          doc.text(dayText, rightX, 29, { align: 'right' });
        }
      };

      const drawCustomerSection = () => {
        if (layout === 'retail') {
          let curY = 16;
          if (profile.address) curY += 4;
          if (profile.mobile || profile.gstin) curY += 4;

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.text('CUSTOMER:', margin.left, curY + 15);
          doc.setFont('helvetica', 'normal');
          doc.text(truncateToWidth(doc, bill.customerName || 'Customer', bodyWidth), margin.left, curY + 19);
          if (bill.customerMobile) {
            doc.text(`Mob: ${bill.customerMobile}`, margin.left, curY + 23);
          }
        } else if (layout === 'corporate') {
          doc.setFillColor(245, 245, 245);
          doc.rect(margin.left, 50, bodyWidth, 15, 'F');
          doc.setFillColor(rgb.r, rgb.g, rgb.b);
          doc.rect(margin.left, 50, bodyWidth, 1.5, 'F'); // Top accent border

          doc.setTextColor(0);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.text('BILL TO:', margin.left + 4, 55);

          doc.setFontSize(10.5);
          doc.text(truncateToWidth(doc, bill.customerName || 'Customer', bodyWidth - 8), margin.left + 4, 60);
          if (bill.customerMobile) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.text(`Mobile: ${bill.customerMobile}`, margin.left + 4, 64);
          }
        } else if (layout === 'minimal') {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(120);
          doc.text('CUSTOMER', margin.left, 44);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(0);
          doc.text(truncateToWidth(doc, bill.customerName || 'Customer', bodyWidth), margin.left, 49);
          if (bill.customerMobile) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(80);
            doc.text(`Mobile: ${bill.customerMobile}`, margin.left, 54);
          }
          doc.setDrawColor(220, 220, 220);
          doc.line(margin.left, 58, rightX, 58);
        } else {
          // Classic
          doc.setFillColor(245, 245, 245);
          doc.roundedRect(margin.left, 47, bodyWidth, 16, 2, 2, 'F');

          // Draw left vertical accent line
          doc.setFillColor(rgb.r, rgb.g, rgb.b);
          doc.rect(margin.left, 47, 1.5, 16, 'F');

          doc.setTextColor(0);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.text('CUSTOMER DETAILS', margin.left + 4, 52);
          doc.setFontSize(11);
          doc.text(truncateToWidth(doc, bill.customerName || 'Customer', bodyWidth - 8), margin.left + 4, 57);
          if (bill.customerMobile) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text(`Mobile: ${bill.customerMobile}`, margin.left + 4, 62);
          }
        }
      };

      const drawPageNumber = (pageNumber) => {
        if (layout === 'retail') return; // no pagination on POS slips
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.text(`Page ${pageNumber}`, rightX, 290, { align: 'right' });
      };

      // Table layout and column definitions
      const tableHeaders = layout === 'retail' ? [['Item Name', 'Qty', 'Price', 'Total']] : [['Sr.', 'Item Name', 'Qty', 'Price', 'Total']];
      const itemsData = (bill.items || []).map((item, index) => {
        if (layout === 'retail') {
          return [
            item.name || '',
            String(item.qty ?? ''),
            parseFloat(item.price).toFixed(0),
            parseFloat(item.total).toFixed(0)
          ];
        } else {
          return [
            String(index + 1),
            item.name || '',
            String(item.qty ?? ''),
            formatCurrency(item.price),
            formatCurrency(item.total)
          ];
        }
      });

      const columnStyles = layout === 'retail' ? {
        0: { cellWidth: 30 },
        1: { cellWidth: 10, halign: 'center' },
        2: { cellWidth: 14, halign: 'right' },
        3: { cellWidth: 14, halign: 'right' }
      } : {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 80 },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 30, halign: 'right' }
      };

      // Determine Table Themes
      let tableTheme = 'grid';
      let tableHeadStyles = {
        fillColor: [230, 230, 230],
        textColor: 0,
        halign: 'center'
      };

      if (layout === 'classic' || layout === 'corporate') {
        tableTheme = 'grid';
        tableHeadStyles.fillColor = [rgb.r, rgb.g, rgb.b];
        tableHeadStyles.textColor = 255;
      } else if (layout === 'minimal') {
        tableTheme = 'plain';
        tableHeadStyles.fillColor = [255, 255, 255];
        tableHeadStyles.textColor = 0;
      } else if (layout === 'retail') {
        tableTheme = 'plain';
        tableHeadStyles.fillColor = [255, 255, 255];
        tableHeadStyles.textColor = 0;
      }

      doc.autoTable({
        startY: tableStartY,
        head: tableHeaders,
        body: itemsData,
        theme: tableTheme,
        styles: {
          font: layout === 'retail' ? 'courier' : 'helvetica',
          fontSize: layout === 'retail' ? 7.5 : 9,
          cellPadding: layout === 'retail' ? 1.5 : 2.5,
          overflow: 'linebreak'
        },
        headStyles: tableHeadStyles,
        columnStyles: columnStyles,
        margin: { left: margin.left, right: margin.right, top: tableTopMargin, bottom: margin.bottom },
        pageBreak: 'auto',
        rowPageBreak: 'avoid',
        didDrawCell: (data) => {
          // Custom border drawing for minimal and retail tables
          if (data.section === 'head') {
            if (layout === 'minimal') {
              doc.setDrawColor(rgb.r, rgb.g, rgb.b);
              doc.setLineWidth(0.4);
              doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
            } else if (layout === 'retail') {
              doc.setDrawColor(150, 150, 150);
              doc.setLineWidth(0.2);
              doc.setLineDashPattern([1, 1], 0);
              doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
              doc.setLineDashPattern([], 0);
            }
          }
          if (data.section === 'body' && layout === 'retail') {
            doc.setDrawColor(220, 220, 220);
            doc.setLineWidth(0.1);
            doc.setLineDashPattern([1, 1.5], 0);
            doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
            doc.setLineDashPattern([], 0);
          }
        },
        didDrawPage: (data) => {
          drawHeader();
          if (data.pageNumber === 1) {
            drawInvoiceSection();
            drawCustomerSection();
          }
          drawPageNumber(data.pageNumber);
        }
      });

      // Summary block drawing
      let finalY = doc.lastAutoTable.finalY + 10;
      const summaryBlockHeight = layout === 'retail' ? 30 : 66;
      if (finalY + summaryBlockHeight > pageHeight - margin.bottom) {
        doc.addPage();
        drawHeader();
        drawPageNumber(doc.internal.getCurrentPageInfo().pageNumber);
        finalY = layout === 'retail' ? 20 : 50;
      }

      const discountValue = bill.discountAmount ?? bill.discount ?? 0;
      const discountLabel = bill.discountType === '%' ? `Discount (${bill.discountValue}%)` : 'Discount';
      const taxPercent = bill.taxType === '%' ? bill.taxValue : (bill.taxValue ?? bill.taxPercent ?? 0);
      const taxLabel = bill.taxType === '%' ? `Tax (${bill.taxValue}%)` : 'Tax';
      const taxValue = bill.taxAmount ?? bill.tax ?? 0;
      const totalValue = bill.totalAmount ?? bill.total ?? 0;
      let paymentStatus = bill.paymentStatus || 'Paid';
      const totalAmt = parseFloat(bill.totalAmount) || 0;
      let amtPaid = bill.amountPaid !== undefined ? parseFloat(bill.amountPaid) : (bill.paymentStatus === 'Paid' ? totalAmt : 0);
      let dues = totalAmt - amtPaid;

      if (paymentStatus !== 'Paid' && dues <= 0.015) {
        paymentStatus = 'Paid';
        amtPaid = totalAmt;
        dues = 0;
      }

      if (layout === 'retail') {
        doc.setFont('courier', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(0);

        let curY = finalY;
        doc.text('Subtotal', margin.left, curY);
        doc.text(parseFloat(bill.subtotal).toFixed(2), rightX, curY, { align: 'right' });

        if (discountValue > 0) {
          curY += 4;
          doc.text(discountLabel, margin.left, curY);
          doc.text('-' + parseFloat(discountValue).toFixed(2), rightX, curY, { align: 'right' });
        }

        if (taxValue > 0) {
          curY += 4;
          doc.text(taxLabel, margin.left, curY);
          doc.text(parseFloat(taxValue).toFixed(2), rightX, curY, { align: 'right' });
        }

        // Total Row
        curY += 5;
        doc.setFont('courier', 'bold');
        doc.text('TOTAL AMOUNT', margin.left, curY);
        doc.text(parseFloat(totalValue).toFixed(2), rightX, curY, { align: 'right' });

        // Payment status & outstanding dues
        curY += 4;
        doc.setFont('courier', 'normal');
        doc.setFontSize(7.5);
        if (paymentStatus === 'Paid') {
          doc.text('Payment Status: Paid', margin.left, curY);
        } else {
          doc.text(`Paid: ${parseFloat(amtPaid).toFixed(0)}`, margin.left, curY);
          doc.text(`Due: ${parseFloat(dues).toFixed(0)}`, rightX, curY, { align: 'right' });
        }

        // Center thank you message
        curY += 8;
        doc.setFont('courier', 'italic');
        doc.text('Thank you for shopping with us!', pageWidth / 2, curY, { align: 'center' });
        doc.text('Visit again!', pageWidth / 2, curY + 4, { align: 'center' });
      } else {
        // A4 templates
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text('Subtotal', 130, finalY);
        doc.text(formatCurrency(bill.subtotal), rightX, finalY, { align: 'right' });
        doc.text(discountLabel, 130, finalY + 6);
        doc.text(formatCurrency(discountValue), rightX, finalY + 6, { align: 'right' });
        doc.text(taxLabel, 130, finalY + 12);
        doc.text(formatCurrency(taxValue), rightX, finalY + 12, { align: 'right' });

        const rLight = Math.round(255 * 0.88 + rgb.r * 0.12);
        const gLight = Math.round(255 * 0.88 + rgb.g * 0.12);
        const bLight = Math.round(255 * 0.88 + rgb.b * 0.12);

        // Draw Total block
        const totalLabel = 'TOTAL AMOUNT';
        const totalText = formatCurrency(totalValue);

        if (layout === 'minimal') {
          doc.setDrawColor(rgb.r, rgb.g, rgb.b);
          doc.setLineWidth(0.5);
          doc.line(130, finalY + 15, rightX, finalY + 15);
          doc.setFont('helvetica', 'bold');
          doc.text(totalLabel, 130, finalY + 22);
          doc.text(totalText, rightX, finalY + 22, { align: 'right' });
          doc.line(130, finalY + 26, rightX, finalY + 26);
        } else if (layout === 'corporate') {
          doc.setFillColor(rgb.r, rgb.g, rgb.b);
          const totalLabelWidth = doc.getTextWidth(totalLabel);
          const totalTextWidth = doc.getTextWidth(totalText);
          const totalBoxWidth = Math.max(70, totalLabelWidth + totalTextWidth + 12);
          const totalBoxX = rightX - totalBoxWidth;
          doc.roundedRect(totalBoxX, finalY + 16, totalBoxWidth, 12, 1, 1, 'F');

          doc.setFont('helvetica', 'bold');
          doc.setTextColor(255, 255, 255);
          doc.text(totalLabel, totalBoxX + 4, finalY + 24);
          doc.text(totalText, totalBoxX + totalBoxWidth - 4, finalY + 24, { align: 'right' });
          doc.setTextColor(0);
        } else {
          // Classic
          doc.setFillColor(rLight, gLight, bLight);
          const totalLabelWidth = doc.getTextWidth(totalLabel);
          const totalTextWidth = doc.getTextWidth(totalText);
          const totalBoxWidth = Math.max(70, totalLabelWidth + totalTextWidth + 12);
          const totalBoxX = rightX - totalBoxWidth;
          doc.roundedRect(totalBoxX, finalY + 16, totalBoxWidth, 12, 2, 2, 'F');

          doc.setFont('helvetica', 'bold');
          doc.setTextColor(rgb.r, rgb.g, rgb.b); // Accent color for total amount
          doc.text(totalLabel, totalBoxX + 4, finalY + 24);
          doc.text(totalText, totalBoxX + totalBoxWidth - 4, finalY + 24, { align: 'right' });
          doc.setTextColor(0);
        }

        // Outstanding payment info on A4
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        if (paymentStatus !== 'Paid') {
          doc.text(`Amount Paid: ${formatCurrency(amtPaid)}`, 130, finalY + 32);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(180, 0, 0);
          doc.text(`Outstanding Due: ${formatCurrency(dues)}`, 130, finalY + 37);
          doc.setTextColor(0);
        } else {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(rgb.r, rgb.g, rgb.b);
          doc.text('Payment Status: PAID', 130, finalY + 34);
          doc.setTextColor(0);
        }

        // Signatory details and thank you note
        doc.setFillColor(245, 245, 245);
        doc.roundedRect(margin.left, finalY + 41, 95, 14, 1.5, 1.5, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(80);
        doc.text('Thank you for shopping with us!', margin.left + 4, finalY + 50);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.text(`For ${shopDisplayName}`, 130, finalY + 46);
        doc.text('Authorized Signatory', 130, finalY + 56);

        doc.setFillColor(rLight, gLight, bLight);
        doc.roundedRect(margin.left, finalY + 60, bodyWidth, 12, 1.5, 1.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(rgb.r, rgb.g, rgb.b); // Accent color
        doc.text('Visit again. We look forward to serving you.', pageWidth / 2, finalY + 68, { align: 'center' });
      }

      const filename = `${bill.billNumber || 'Bill'}_${bill.customerName || 'Customer'}.pdf`;

      let saved = false;
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      if (isMobile) {
        try {
          const blob = doc.output('blob');
          const file = new File([blob], filename, { type: 'application/pdf' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: filename,
              text: `KhataBill Invoice - ${bill.billNumber}`
            });
            saved = true;
          }
        } catch (shareErr) {
          console.warn('Web Share failed, falling back:', shareErr);
        }
      }

      if (!saved) {
        try {
          doc.save(filename);
        } catch (saveErr) {
          console.warn('doc.save failed, trying blob URL fallback:', saveErr);
          const blob = doc.output('blob');
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        }
      }

      hideSpinner();
      showToast('PDF generated successfully!', 'success');

    } catch (err) {
      hideSpinner();
      showToast('Failed to generate PDF', 'error');
      console.error(err);
    }
  }

  // ========== WHATSAPP SHARE ==========
  async function shareWhatsApp(billId) {
    try {
      const bill = await KhataBillDB.getBill(billId);
      if (!bill) {
        showToast('Bill not found', 'error');
        return;
      }
      const profile = getProfile();
      const message = encodeURIComponent(
        `Hello, your bill amount is ₹${parseFloat(bill.totalAmount).toFixed(2)}. Thank you for shopping at ${profile.shopName || 'our shop'}!\n\nBill No: ${bill.billNumber}\nDate: ${formatDate(new Date(bill.date || bill.createdAt))}`
      );
      const url = `https://wa.me/${bill.customerMobile ? '91' + bill.customerMobile : ''}?text=${message}`;
      window.open(url, '_blank');
    } catch (err) {
      showToast('Failed to share', 'error');
    }
  }

  // ========== SETTINGS ==========
  async function initSettings() {
    const profile = getProfile();
    document.getElementById('settingsShopName').textContent = profile.shopName || 'Shop Name';
    document.getElementById('settingsOwnerName').textContent = profile.ownerName || 'Owner';
    document.getElementById('settingsMobile').textContent = profile.mobile || '-';
    document.getElementById('settingsAddress').textContent = profile.address || '-';

    if (profile.logo) {
      document.getElementById('settingsShopLogoImg').src = profile.logo;
    } else {
      document.getElementById('settingsShopLogoImg').src = 'assests/image/logo.png';
    }

    document.getElementById('settingsDiscountValue').textContent = (profile.defaultDiscount || 0) + ' %';
    document.getElementById('settingsTaxValue').textContent = (profile.defaultTax || 0) + ' %';
    document.getElementById('settingsPrefixValue').textContent = profile.billPrefix || 'BILL-';

    const layoutNames = {
      'classic': 'Classic Indian',
      'minimal': 'Minimalist',
      'corporate': 'Corporate A4',
      'retail': 'Retail Slip (POS)'
    };
    const activeLayout = profile.invoiceLayout || 'classic';
    document.getElementById('settingsTemplateValue').textContent = layoutNames[activeLayout] || 'Classic Indian';

    try {
      const products = await KhataBillDB.getAllProducts();
      document.getElementById('settingsCatalogCount').textContent = `${products.length} items`;
      allCatalogProducts = products;
    } catch (err) {
      console.warn('Failed to load products count:', err);
    }
  }

  // ========== EDIT SHOP ==========
  function initEditShop() {
    const profile = getProfile();
    document.getElementById('editShopName').value = profile.shopName || '';
    document.getElementById('editOwnerName').value = profile.ownerName || '';
    document.getElementById('editMobile').value = profile.mobile || '';
    document.getElementById('editAddress').value = profile.address || '';
    document.getElementById('editGstin').value = profile.gstin || '';

    const preview = document.getElementById('editLogoPreview');
    const removeBtn = document.getElementById('editLogoRemoveBtn');
    if (profile.logo) {
      preview.innerHTML = `<img src="${profile.logo}" alt="Logo">`;
      preview.dataset.logoData = profile.logo;
      if (removeBtn) removeBtn.classList.remove('hidden');
    } else {
      preview.innerHTML = '<span class="upload-icon"><svg class="icon-svg" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></span>';
      preview.dataset.logoData = '';
      if (removeBtn) removeBtn.classList.add('hidden');
    }
  }

  function handleEditLogo(e) {
    const file = e.target.files[0];
    const preview = document.getElementById('editLogoPreview');
    compressAndPreviewImage(file, preview);
  }

  function handleEditShopSave() {
    const shopName = document.getElementById('editShopName').value.trim();
    const ownerName = document.getElementById('editOwnerName').value.trim();
    const mobile = document.getElementById('editMobile').value.trim();

    if (!shopName || !ownerName || !mobile) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    const logoPreview = document.getElementById('editLogoPreview');
    saveProfile({
      shopName,
      ownerName,
      mobile,
      address: document.getElementById('editAddress').value.trim(),
      gstin: document.getElementById('editGstin').value.trim(),
      logo: logoPreview.dataset.logoData || ''
    });

    showToast('Shop details updated!', 'success');
    goBack();
  }

  // ========== EDIT PREFERENCES ==========
  function initEditPref() {
    const profile = getProfile();
    document.getElementById('prefDiscount').value = profile.defaultDiscount || 0;
    document.getElementById('prefTax').value = profile.defaultTax || 0;
    document.getElementById('prefPrefix').value = profile.billPrefix || 'BILL-';
    const showLogoCheckbox = document.getElementById('prefShowLogo');
    if (showLogoCheckbox) {
      showLogoCheckbox.checked = profile.showLogoOnBill !== false;
    }
  }

  function handlePrefSave() {
    const showLogoCheckbox = document.getElementById('prefShowLogo');
    const showLogoOnBill = showLogoCheckbox ? showLogoCheckbox.checked : true;

    saveProfile({
      defaultDiscount: parseFloat(document.getElementById('prefDiscount').value) || 0,
      defaultTax: parseFloat(document.getElementById('prefTax').value) || 0,
      billPrefix: document.getElementById('prefPrefix').value.trim() || 'BILL-',
      showLogoOnBill: showLogoOnBill
    });

    showToast('Preferences saved!', 'success');
    goBack();
  }

  // ========== BACKUP & RESTORE ==========
  async function handleExport() {
    try {
      showSpinner('Preparing backup...');
      const data = await KhataBillDB.exportData();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `KhataBill_Backup_${formatDateFile(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      hideSpinner();
      showToast('Backup downloaded!', 'success');
    } catch (err) {
      hideSpinner();
      showToast('Backup failed', 'error');
      console.error(err);
    }
  }

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    showModal('Restore Backup', 'This will replace all your current data with the backup. Are you sure?', async () => {
      try {
        showSpinner('Restoring data...');
        const text = await file.text();
        const data = JSON.parse(text);
        const count = await KhataBillDB.importData(data);

        // Mark setup done if profile was restored
        if (data.profile && data.profile.shopName) {
          localStorage.setItem(SETUP_KEY, 'true');
        }

        hideSpinner();
        showToast(`Restored ${count} bills successfully!`, 'success');

        // Refresh current screen
        if (currentScreen === 'dashboard') initDashboard();
        if (currentScreen === 'billsList') initBillsList();
        if (currentScreen === 'settings') initSettings();
      } catch (err) {
        hideSpinner();
        showToast('Invalid backup file', 'error');
        console.error(err);
      }
    });

    // Reset input
    e.target.value = '';
  }

  // ========== CLEAR / RESET ==========
  function handleClearAllData() {
    showModal('Clear All Data', 'This will permanently delete all bills. Your shop profile will remain. Continue?', async () => {
      try {
        await KhataBillDB.clearAll();
        allBills = [];
        showToast('All bills deleted', 'success');
        setTimeout(() => {
          location.reload();
        }, 1000);
      } catch (err) {
        showToast('Failed to clear data', 'error');
      }
    });
  }

  function handleResetApp() {
    showModal('Logout', 'This will log you out and return to the setup screen. Your bills will remain saved. Continue?', () => {
      try {
        localStorage.removeItem(PROFILE_KEY);
        localStorage.removeItem(SETUP_KEY);

        currentScreen = null;
        currentBillId = null;
        billItems = [];
        selectedPayment = 'Cash';
        currentPage = 1;
        allBills = [];
        screenHistory = [];

        const setupFields = ['setupShopName', 'setupOwnerName', 'setupMobile', 'setupAddress', 'setupGstin'];
        setupFields.forEach((id) => {
          const field = document.getElementById(id);
          if (field) field.value = '';
        });

        const setupLogoPreview = document.getElementById('setupLogoPreview');
        if (setupLogoPreview) {
          setupLogoPreview.innerHTML = '<span class="upload-icon"><svg class="icon-svg" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></span>';
          setupLogoPreview.dataset.logoData = '';
        }

        const setupLogoRemoveBtn = document.getElementById('setupLogoRemoveBtn');
        if (setupLogoRemoveBtn) setupLogoRemoveBtn.classList.add('hidden');

        showScreen('setup');
        showToast('Logged out', 'success');
      } catch (err) {
        showToast('Failed to log out', 'error');
      }
    });
  }

  // ========== UI HELPERS ==========

  // Toast
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = {
      success: `<svg class="icon-svg" viewBox="0 0 24 24" style="stroke:var(--text-white);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
      error: `<svg class="icon-svg" viewBox="0 0 24 24" style="stroke:var(--text-white);"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      warning: `<svg class="icon-svg" viewBox="0 0 24 24" style="stroke:var(--text-white);"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      info: `<svg class="icon-svg" viewBox="0 0 24 24" style="stroke:var(--text-white);"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
    };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon" style="display:inline-flex;align-items:center;">${icons[type] || icons.info}</span> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Spinner
  function showSpinner(text = 'Loading...') {
    document.getElementById('spinnerText').textContent = text;
    document.getElementById('spinnerOverlay').classList.add('active');
  }

  function hideSpinner() {
    document.getElementById('spinnerOverlay').classList.remove('active');
  }

  // Modal
  let modalCallback = null;
  function showModal(title, message, onConfirm) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    document.getElementById('modalOverlay').classList.add('active');
    modalCallback = onConfirm;

    document.getElementById('modalConfirmBtn').onclick = () => {
      const callback = modalCallback;
      hideModal();
      if (callback) callback();
    };
  }

  function hideModal() {
    document.getElementById('modalOverlay').classList.remove('active');
    modalCallback = null;
  }

  // Prompt Modal
  let promptModalCallback = null;
  function showPromptModal(title, message, defaultValue, onConfirm) {
    document.getElementById('promptModalTitle').textContent = title;
    document.getElementById('promptModalMessage').textContent = message;
    const input = document.getElementById('promptModalInput');
    input.value = defaultValue || '';
    document.getElementById('promptModalOverlay').classList.add('active');
    promptModalCallback = onConfirm;

    // Focus input after transition completes
    setTimeout(() => {
      input.focus();
      input.select();
    }, 150);

    document.getElementById('promptModalConfirmBtn').onclick = () => {
      const val = parseFloat(input.value);
      if (isNaN(val) || val <= 0) {
        showToast('Please enter a valid positive amount', 'error');
        input.focus();
        return;
      }
      const callback = promptModalCallback;
      hidePromptModal();
      if (callback) callback(val);
    };
  }

  function hidePromptModal() {
    document.getElementById('promptModalOverlay').classList.remove('active');
    promptModalCallback = null;
  }

  // ========== DATE HELPERS ==========
  function formatDate(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let hours = date.getHours();
    let minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}, ${hours}:${minutes} ${ampm}`;
  }

  function formatDateShort(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  function formatDateFile(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function getDayName(date) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
  }

  function formatAmount(amount) {
    const num = parseFloat(amount) || 0;
    if (num >= 100000) {
      return (num / 100000).toFixed(2) + 'L';
    } else if (num >= 1000) {
      return num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    }
    return num.toFixed(2);
  }

  // ========== CREDIT LEDGER (KHATA BOOK) ==========
  let ledgerCustomers = [];
  let activeCustomerKey = null;

  async function initLedger() {
    try {
      const bills = await KhataBillDB.getAllBills();

      // Group bills by customer name + mobile key
      const customerMap = {};

      bills.forEach(bill => {
        const name = (bill.customerName || '').trim();
        const mobile = (bill.customerMobile || '').trim();
        if (!name) return;

        const key = name.toLowerCase() + '::' + mobile;

        if (!customerMap[key]) {
          customerMap[key] = {
            name: name,
            mobile: mobile,
            totalAmount: 0,
            amountPaid: 0,
            bills: []
          };
        }

        const total = parseFloat(bill.totalAmount) || 0;
        let paid = bill.amountPaid !== undefined ? parseFloat(bill.amountPaid) : (bill.paymentStatus === 'Paid' ? total : 0);
        if (bill.paymentStatus !== 'Paid' && (total - paid) <= 0.015) {
          paid = total;
        }

        customerMap[key].totalAmount += total;
        customerMap[key].amountPaid += paid;
        customerMap[key].bills.push(bill);
      });

      // Convert to array and calculate outstanding balance
      ledgerCustomers = Object.keys(customerMap).map(key => {
        const cust = customerMap[key];
        const outstanding = cust.totalAmount - cust.amountPaid;
        return {
          key: key,
          name: cust.name,
          mobile: cust.mobile,
          totalAmount: cust.totalAmount,
          amountPaid: cust.amountPaid,
          outstanding: Math.max(0, outstanding),
          bills: cust.bills
        };
      }).filter(cust => cust.outstanding > 0.01); // Only show customers with dues

      // Render stats
      const totalOutstanding = ledgerCustomers.reduce((sum, c) => sum + c.outstanding, 0);
      document.getElementById('ledgerTotalDues').textContent = '₹' + formatAmount(totalOutstanding);
      document.getElementById('ledgerTotalCustomers').textContent = ledgerCustomers.length;

      // Render list
      renderLedgerList();

      // Bind Ledger Search
      document.getElementById('ledgerSearchInput').removeEventListener('input', handleLedgerSearch);
      document.getElementById('ledgerSearchInput').addEventListener('input', handleLedgerSearch);
    } catch (err) {
      console.error('[Ledger] Failed to init ledger:', err);
      showToast('Failed to load ledger', 'error');
    }
  }

  function renderLedgerList(filteredList = null) {
    const container = document.getElementById('ledgerCustomersContainer');
    const emptyState = document.getElementById('ledgerEmptyState');
    const list = filteredList || ledgerCustomers;

    if (list.length === 0) {
      container.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    container.innerHTML = list.map(cust => `
      <div class="ledger-customer-card" data-key="${cust.key}" style="display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: var(--bg-white); border-radius: var(--radius-md); margin-bottom: 8px; box-shadow: var(--shadow-sm); border: 1px solid var(--border-light); cursor: pointer;">
        <div class="ledger-cust-avatar" style="width: 40px; height: 40px; border-radius: var(--radius-full); background: var(--accent-bg); color: var(--accent); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: var(--font-lg);">
          ${cust.name.charAt(0).toUpperCase()}
        </div>
        <div class="ledger-cust-info" style="flex: 1;">
          <div class="ledger-cust-name" style="font-weight: 700; color: var(--primary); font-size: var(--font-base);">${cust.name}</div>
          <div class="ledger-cust-mobile" style="font-size: var(--font-xs); color: var(--text-secondary); margin-top: 2px;">${cust.mobile ? cust.mobile : 'No Mobile'}</div>
        </div>
        <div class="ledger-cust-dues" style="text-align: right;">
          <div class="dues-label" style="font-size: var(--font-xs); color: var(--text-muted); font-weight: 500;">Outstanding</div>
          <div class="dues-value" style="font-size: var(--font-md); font-weight: 800; color: var(--danger); margin-top: 1px;">₹${cust.outstanding.toFixed(2)}</div>
        </div>
        <span class="ledger-cust-chevron" style="color: var(--text-muted);">
          <svg class="icon-svg" viewBox="0 0 24 24" style="width: 18px; height: 18px;"><polyline points="9 18 15 12 9 6"/></svg>
        </span>
      </div>
    `).join('');

    // Bind click events
    container.querySelectorAll('.ledger-customer-card').forEach(card => {
      card.addEventListener('click', () => {
        const key = card.dataset.key;
        showCustomerLedger(key);
      });
    });
  }

  function handleLedgerSearch(e) {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      renderLedgerList();
      return;
    }
    const filtered = ledgerCustomers.filter(c =>
      c.name.toLowerCase().includes(q) || c.mobile.includes(q)
    );
    renderLedgerList(filtered);
  }

  function showCustomerLedger(key) {
    activeCustomerKey = key;
    const cust = ledgerCustomers.find(c => c.key === key);
    if (!cust) return;

    // Hide main content, show details
    document.getElementById('ledgerMainContent').classList.add('hidden');
    document.getElementById('ledgerDetailWrapper').classList.remove('hidden');

    // Set headers
    document.getElementById('ledgerCustName').textContent = cust.name;
    document.getElementById('ledgerCustMobile').textContent = cust.mobile ? 'Mobile: ' + cust.mobile : 'Mobile: Not Available';
    document.getElementById('ledgerCustBalance').textContent = '₹' + cust.outstanding.toFixed(2);

    // Clear repayment input
    document.getElementById('repaymentAmount').value = '';

    // Render outstanding bills list
    const billsContainer = document.getElementById('ledgerCustBillsContainer');

    // Filter bills that have outstanding dues
    const outstandingBills = cust.bills.filter(bill => {
      const total = parseFloat(bill.totalAmount) || 0;
      const paid = bill.amountPaid !== undefined ? parseFloat(bill.amountPaid) : (bill.paymentStatus === 'Paid' ? total : 0);
      return total - paid > 0.015;
    }).sort((a, b) => new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt)); // Oldest first

    if (outstandingBills.length === 0) {
      // Dues are cleared!
      goBackToLedgerList();
      return;
    }

    billsContainer.innerHTML = outstandingBills.map(bill => {
      const date = new Date(bill.date || bill.createdAt);
      const total = parseFloat(bill.totalAmount) || 0;
      const paid = bill.amountPaid !== undefined ? parseFloat(bill.amountPaid) : 0;
      const dues = total - paid;

      return `
        <div class="ledger-bill-item" data-bill-id="${bill.id}" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--bg-white); border-radius: var(--radius-md); border: 1px solid var(--border-light); margin-bottom: 8px; cursor: pointer; box-shadow: var(--shadow-sm);">
          <div class="bill-meta-left">
            <div class="bill-num" style="font-weight: 700; color: var(--primary); font-size: var(--font-sm);">${bill.billNumber}</div>
            <div class="bill-date" style="font-size: var(--font-xs); color: var(--text-secondary); margin-top: 1px;">${formatDateShort(date)}</div>
          </div>
          <div class="bill-amount-mid" style="text-align: left; padding: 0 8px;">
            <div class="bill-amt" style="font-size: var(--font-xs); color: var(--text-secondary);">Total: ₹${total.toFixed(0)}</div>
            <div class="bill-paid" style="font-size: var(--font-xs); color: var(--success);">Paid: ₹${paid.toFixed(0)}</div>
          </div>
          <div class="bill-dues-right" style="display: flex; align-items: center; gap: 8px;">
            <div style="text-align: right;">
              <div class="bill-dues-val" style="font-weight: 700; color: var(--danger); font-size: var(--font-sm);">Due: ₹${dues.toFixed(2)}</div>
            </div>
            <button class="btn btn-sm btn-outline pay-single-bill-btn" data-bill-id="${bill.id}" style="height: 28px; padding: 0 10px; font-size: var(--font-xs); border-radius: var(--radius-sm);">Pay</button>
          </div>
        </div>
      `;
    }).join('');

    // Bind click events for bill items (clicking bill opens bill detail, clicking pay opens repayment for that bill)
    billsContainer.querySelectorAll('.ledger-bill-item').forEach(item => {
      const billId = parseInt(item.dataset.billId);

      // Click on Pay button
      item.querySelector('.pay-single-bill-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        handleSingleBillRepayment(billId);
      });

      // Click on card opens bill detail
      item.addEventListener('click', () => {
        showBillDetail(billId);
      });
    });
  }

  function goBackToLedgerList() {
    document.getElementById('ledgerDetailWrapper').classList.add('hidden');
    document.getElementById('ledgerMainContent').classList.remove('hidden');
    initLedger();
  }

  // Handle distribution repayment (repaying across multiple oldest bills)
  async function handleRepaymentSave() {
    if (!activeCustomerKey) return;

    const amountVal = parseFloat(document.getElementById('repaymentAmount').value);
    if (isNaN(amountVal) || amountVal <= 0) {
      showToast('Please enter a valid repayment amount', 'error');
      document.getElementById('repaymentAmount').focus();
      return;
    }

    const cust = ledgerCustomers.find(c => c.key === activeCustomerKey);
    if (!cust) return;

    if (amountVal > cust.outstanding + 0.01) {
      showToast(`Repayment amount exceeds total outstanding balance (₹${cust.outstanding.toFixed(2)})`, 'error');
      document.getElementById('repaymentAmount').focus();
      return;
    }

    // Confirm repayment
    showModal('Record Repayment', `Record repayment of ₹${amountVal.toFixed(2)} for ${cust.name}?`, async () => {
      try {
        let remainingRepayment = amountVal;

        // Sort outstanding bills oldest first
        const outstandingBills = cust.bills.filter(bill => {
          const total = parseFloat(bill.totalAmount) || 0;
          const paid = bill.amountPaid !== undefined ? parseFloat(bill.amountPaid) : (bill.paymentStatus === 'Paid' ? total : 0);
          return total - paid > 0.015;
        }).sort((a, b) => new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt));

        for (const bill of outstandingBills) {
          if (remainingRepayment <= 0.005) break;

          const total = parseFloat(bill.totalAmount) || 0;
          const paid = bill.amountPaid !== undefined ? parseFloat(bill.amountPaid) : 0;
          const dues = parseFloat((total - paid).toFixed(2));

          if (remainingRepayment >= dues - 0.015) {
            bill.amountPaid = total;
            bill.paymentStatus = 'Paid';
            remainingRepayment = parseFloat((remainingRepayment - dues).toFixed(2));
          } else {
            bill.amountPaid = parseFloat((paid + remainingRepayment).toFixed(2));
            if (bill.amountPaid >= total - 0.015) {
              bill.amountPaid = total;
              bill.paymentStatus = 'Paid';
            } else {
              bill.paymentStatus = 'Partial';
            }
            remainingRepayment = 0;
          }

          await KhataBillDB.updateBill(bill);
        }

        showToast('Repayment recorded successfully', 'success');

        // Refresh Ledger
        await initLedger();

        const updatedCust = ledgerCustomers.find(c => c.key === activeCustomerKey);
        if (!updatedCust || updatedCust.outstanding <= 0.01) {
          goBackToLedgerList();
        } else {
          showCustomerLedger(activeCustomerKey);
        }
      } catch (err) {
        console.error('[Repayment] Failed to record repayment:', err);
        showToast('Failed to record repayment', 'error');
      }
    });
  }

  // Handle paying off a specific single bill
  async function handleSingleBillRepayment(billId) {
    try {
      const bill = await KhataBillDB.getBill(billId);
      if (!bill) {
        showToast('Bill not found', 'error');
        return;
      }

      const total = parseFloat(bill.totalAmount) || 0;
      const paid = bill.amountPaid !== undefined ? parseFloat(bill.amountPaid) : 0;
      const dues = parseFloat((total - paid).toFixed(2));

      showPromptModal(
        `Record Payment`,
        `Outstanding dues for Bill ${bill.billNumber} is ₹${dues.toFixed(2)}. Enter amount received (₹):`,
        dues.toFixed(2),
        async (repaymentAmount) => {
          if (repaymentAmount > dues + 0.015) {
            showToast(`Repayment amount cannot exceed bill dues (₹${dues.toFixed(2)})`, 'error');
            return;
          }

          if (repaymentAmount >= dues - 0.015) {
            bill.amountPaid = total;
            bill.paymentStatus = 'Paid';
          } else {
            bill.amountPaid = parseFloat((paid + repaymentAmount).toFixed(2));
            if (bill.amountPaid >= total - 0.015) {
              bill.amountPaid = total;
              bill.paymentStatus = 'Paid';
            } else {
              bill.paymentStatus = 'Partial';
            }
          }

          await KhataBillDB.updateBill(bill);
          showToast('Payment recorded successfully', 'success');

          // Refresh current view
          if (currentScreen === 'billDetail') {
            showBillDetail(billId);
          } else if (currentScreen === 'ledger') {
            await initLedger();
            if (activeCustomerKey) {
              showCustomerLedger(activeCustomerKey);
            }
          }
        }
      );
    } catch (err) {
      console.error('[SingleRepayment] Failed:', err);
      showToast('Failed to record payment', 'error');
    }
  }

  // ========== PRODUCT CATALOG ==========
  let activeProductId = null;

  async function initCatalog() {
    try {
      const products = await KhataBillDB.getAllProducts();
      allCatalogProducts = products;
      renderCatalogList();
    } catch (err) {
      console.error('[Catalog] Failed to init catalog:', err);
      showToast('Failed to load catalog', 'error');
    }
  }

  function renderCatalogList(filteredList = null) {
    const container = document.getElementById('catalogProductsContainer');
    const emptyState = document.getElementById('catalogEmptyState');
    const list = filteredList || allCatalogProducts;

    if (list.length === 0) {
      container.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    container.innerHTML = list.map(product => `
      <div class="ledger-customer-card" data-id="${product.id}" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: var(--bg-white); border-radius: var(--radius-md); margin-bottom: 8px; box-shadow: var(--shadow-sm); border: 1px solid var(--border-light); cursor: pointer;">
        <div style="flex: 1;">
          <div style="font-weight: 700; color: var(--primary); font-size: var(--font-base);">${product.name}</div>
          <div style="font-size: var(--font-xs); color: var(--text-secondary); margin-top: 2px;">Unit: ${product.unit || 'pcs'}</div>
        </div>
        <div style="text-align: right; margin-right: 8px;">
          <div style="font-size: var(--font-xs); color: var(--text-muted); font-weight: 500;">Selling Price</div>
          <div style="font-size: var(--font-md); font-weight: 800; color: var(--accent); margin-top: 1px;">₹${parseFloat(product.price).toFixed(2)}</div>
        </div>
        <span style="color: var(--text-muted);">
          <svg class="icon-svg" viewBox="0 0 24 24" style="width: 18px; height: 18px;"><polyline points="9 18 15 12 9 6"/></svg>
        </span>
      </div>
    `).join('');

    // Bind click events to edit
    container.querySelectorAll('.ledger-customer-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = parseInt(card.dataset.id);
        showCatalogForm(id);
      });
    });
  }

  function handleCatalogSearch(e) {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      renderCatalogList();
      return;
    }
    const filtered = allCatalogProducts.filter(p =>
      p.name && p.name.toLowerCase().includes(q)
    );
    renderCatalogList(filtered);
  }

  async function showCatalogForm(id = null) {
    activeProductId = id;
    const titleEl = document.getElementById('catalogFormTitle');
    const deleteBtn = document.getElementById('catalogFormDeleteBtn');

    // Clear inputs
    document.getElementById('catalogProductId').value = id || '';
    document.getElementById('catalogProductName').value = '';
    document.getElementById('catalogProductPrice').value = '';
    document.getElementById('catalogProductUnit').value = 'pcs';

    if (id) {
      titleEl.textContent = 'Edit Product';
      deleteBtn.classList.remove('hidden');

      const product = allCatalogProducts.find(p => p.id === id);
      if (product) {
        document.getElementById('catalogProductName').value = product.name || '';
        document.getElementById('catalogProductPrice').value = product.price || '';
        document.getElementById('catalogProductUnit').value = product.unit || 'pcs';
      }
    } else {
      titleEl.textContent = 'Add Product';
      deleteBtn.classList.add('hidden');
    }

    showScreen('catalogForm');
  }

  async function handleCatalogFormSave() {
    const name = document.getElementById('catalogProductName').value.trim();
    const priceVal = parseFloat(document.getElementById('catalogProductPrice').value);
    const unit = document.getElementById('catalogProductUnit').value;
    const idVal = document.getElementById('catalogProductId').value;
    const id = idVal ? parseInt(idVal) : null;

    if (!name) {
      showToast('Product name is required', 'error');
      document.getElementById('catalogProductName').focus();
      return;
    }

    if (isNaN(priceVal) || priceVal < 0) {
      showToast('Please enter a valid selling price', 'error');
      document.getElementById('catalogProductPrice').focus();
      return;
    }

    const product = {
      name: name,
      price: priceVal,
      unit: unit
    };

    if (id) {
      product.id = id;
    }

    try {
      if (id) {
        await KhataBillDB.updateProduct(product);
        showToast('Product updated successfully', 'success');
      } else {
        // Check duplicate name
        const duplicate = allCatalogProducts.find(p => p.name && p.name.trim().toLowerCase() === name.toLowerCase());
        if (duplicate) {
          showToast('A product with this name already exists', 'error');
          document.getElementById('catalogProductName').focus();
          return;
        }
        await KhataBillDB.addProduct(product);
        showToast('Product added to catalog', 'success');
      }

      // Update catalog state
      allCatalogProducts = await KhataBillDB.getAllProducts();
      goBack();
    } catch (err) {
      console.error('[Catalog] Save failed:', err);
      showToast('Failed to save product', 'error');
    }
  }

  async function handleCatalogDelete() {
    if (!activeProductId) return;

    showModal('Delete Product', 'Are you sure you want to delete this product from the catalog?', async () => {
      try {
        await KhataBillDB.deleteProduct(activeProductId);
        showToast('Product deleted from catalog', 'success');
        allCatalogProducts = await KhataBillDB.getAllProducts();
        goBack();
      } catch (err) {
        console.error('[Catalog] Delete failed:', err);
        showToast('Failed to delete product', 'error');
      }
    });
  }

  // ========== INVOICE TEMPLATE DESIGNER ==========
  function initTemplateDesigner() {
    const profile = getProfile();
    const layout = profile.invoiceLayout || 'classic';
    const color = profile.invoiceColor || '#2E7D32';

    // 1. Select layout card
    document.querySelectorAll('.layout-grid .layout-card').forEach(card => {
      if (card.dataset.layout === layout) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    // 2. Select color preset or custom color
    let colorFound = false;
    document.querySelectorAll('#presetSwatches .color-swatch').forEach(swatch => {
      const swatchColor = swatch.dataset.color;
      if (swatchColor.toLowerCase() === color.toLowerCase()) {
        swatch.classList.add('active');
        colorFound = true;
      } else {
        swatch.classList.remove('active');
      }
    });

    const customWrapper = document.querySelector('.custom-color-picker-wrapper');
    const customInput = document.getElementById('customColorPicker');

    if (colorFound) {
      if (customWrapper) customWrapper.classList.remove('active');
      if (customInput) customInput.value = '#2E7D32'; // reset to default green visually if preset used
    } else {
      if (customWrapper) customWrapper.classList.add('active');
      if (customInput) customInput.value = color;
    }

    // Set preview text to actual shop name
    const previewShopName = document.getElementById('previewShopName');
    if (previewShopName) {
      previewShopName.textContent = profile.shopName || 'Shree Ganesh General Store';
    }
    const previewShopContact = document.getElementById('previewShopContact');
    if (previewShopContact) {
      const contactParts = [];
      if (profile.address) contactParts.push(profile.address);
      if (profile.mobile) contactParts.push('Mobile: ' + profile.mobile);
      previewShopContact.textContent = contactParts.join('  |  ') || 'At/Post: Khedgaon  |  Mobile: 9876543210';
    }

    updateLivePreview();
  }

  function updateLivePreview() {
    const activeCard = document.querySelector('.layout-grid .layout-card.active');
    const layout = activeCard ? activeCard.dataset.layout : 'classic';

    let color = '#2E7D32'; // Default
    const activeSwatch = document.querySelector('#presetSwatches .color-swatch.active');

    if (activeSwatch) {
      color = activeSwatch.dataset.color;
    } else {
      const customWrapper = document.querySelector('.custom-color-picker-wrapper');
      if (customWrapper && customWrapper.classList.contains('active')) {
        color = document.getElementById('customColorPicker').value || '#2E7D32';
      }
    }

    const previewPage = document.getElementById('previewPage');
    if (previewPage) {
      // Set dynamic accent color variables on the preview page only to keep controls styled in default app theme
      previewPage.style.setProperty('--accent', color);
      const rgb = hexToRgb(color);
      if (rgb) {
        previewPage.style.setProperty('--accent-bg', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`);
        previewPage.style.setProperty('--accent-light', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`);
      }

      // Clear previous layout classes
      previewPage.classList.remove('preview-classic', 'preview-minimal', 'preview-corporate', 'preview-retail');
      previewPage.classList.add('preview-' + layout);

      // Apply dynamic colors
      const headerBar = document.getElementById('previewHeaderBar');
      const invoiceTitle = document.getElementById('previewInvoiceTitle');
      const customerCard = document.getElementById('previewCustomerCard');
      const totalRow = document.getElementById('previewTotalRow');
      const shopName = document.getElementById('previewShopName');
      const tableHead = document.getElementById('previewTableHead');

      // Set custom properties or styles directly
      if (layout === 'classic') {
        if (headerBar) headerBar.style.backgroundColor = color;
        if (invoiceTitle) invoiceTitle.style.color = color;
        if (customerCard) {
          customerCard.style.borderColor = color;
          customerCard.style.backgroundColor = 'var(--bg-light)';
        }
        if (totalRow) {
          totalRow.style.backgroundColor = 'var(--accent-bg)';
          totalRow.style.color = color;
          // Apply custom RGBA for background light color
          const rgb = hexToRgb(color);
          if (rgb) {
            totalRow.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`;
          }
        }
        if (shopName) shopName.style.color = 'var(--primary)';
        if (tableHead) {
          tableHead.style.backgroundColor = 'var(--border-light)';
          tableHead.style.color = 'var(--text-primary)';
          tableHead.style.borderBottom = 'none';
        }
      } else if (layout === 'minimal') {
        if (invoiceTitle) invoiceTitle.style.color = color;
        if (shopName) shopName.style.color = 'var(--primary)';
        if (totalRow) {
          totalRow.style.borderTop = `1px solid ${color}`;
          totalRow.style.color = color;
          totalRow.style.backgroundColor = 'transparent';
        }
        if (tableHead) {
          tableHead.style.borderBottom = `1px solid ${color}`;
          tableHead.style.color = 'var(--text-primary)';
          tableHead.style.backgroundColor = 'transparent';
        }
      } else if (layout === 'corporate') {
        if (headerBar) headerBar.style.backgroundColor = color;
        if (invoiceTitle) invoiceTitle.style.color = 'var(--primary)';
        if (shopName) shopName.style.color = color;
        if (customerCard) {
          customerCard.style.borderTop = `2px solid ${color}`;
          customerCard.style.borderLeft = 'none';
          customerCard.style.backgroundColor = 'var(--bg-light)';
        }
        if (tableHead) {
          tableHead.style.backgroundColor = color;
          tableHead.style.color = '#ffffff';
          tableHead.style.borderBottom = 'none';
        }
        if (totalRow) {
          totalRow.style.color = color;
          const rgb = hexToRgb(color);
          if (rgb) {
            totalRow.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`;
          }
        }
      } else if (layout === 'retail') {
        if (invoiceTitle) invoiceTitle.style.color = 'var(--text-primary)';
        if (shopName) shopName.style.color = 'var(--text-primary)';
        if (totalRow) {
          totalRow.style.color = 'var(--text-primary)';
          totalRow.style.backgroundColor = 'transparent';
        }
        if (tableHead) {
          tableHead.style.color = 'var(--text-primary)';
          tableHead.style.backgroundColor = 'transparent';
          tableHead.style.borderBottom = '1px dashed var(--text-muted)';
        }
      }
    }
  }

  function handleTemplateSave() {
    const activeCard = document.querySelector('.layout-grid .layout-card.active');
    const layout = activeCard ? activeCard.dataset.layout : 'classic';

    let color = '#2E7D32';
    const activeSwatch = document.querySelector('#presetSwatches .color-swatch.active');
    if (activeSwatch) {
      color = activeSwatch.dataset.color;
    } else {
      const picker = document.getElementById('customColorPicker');
      color = (picker ? picker.value : '') || '#2E7D32';
    }

    try {
      saveProfile({
        invoiceLayout: layout,
        invoiceColor: color
      });
      showToast('Invoice template saved!', 'success');
      goBack();
    } catch (err) {
      showToast('Failed to save design preferences', 'error');
    }
  }

  // Helper: Hex to RGB
  function hexToRgb(hex) {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  // ========== UTILITIES ==========
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // ========== THERMAL PRINTER ==========
  class EscPosEncoder {
    constructor() {
      this.buffer = [];
    }

    initialize() {
      this.buffer.push(0x1B, 0x40); // ESC @ (Initialize printer)
      return this;
    }

    align(alignment) {
      // 0 = left, 1 = center, 2 = right
      const val = alignment === 'center' ? 1 : (alignment === 'right' ? 2 : 0);
      this.buffer.push(0x1B, 0x61, val);
      return this;
    }

    bold(enable) {
      this.buffer.push(0x1B, 0x45, enable ? 1 : 0); // ESC E n
      return this;
    }

    fontSize(doubleWidth, doubleHeight) {
      let size = 0x00;
      if (doubleWidth) size |= 0x10;
      if (doubleHeight) size |= 0x01;
      this.buffer.push(0x1D, 0x21, size); // GS ! n
      return this;
    }

    line(text) {
      const sanitized = (text || '')
        .replace(/₹/g, 'Rs. ')
        .replace(/[^ -~\n]/g, '?'); // sanitize non-ASCII
      for (let i = 0; i < sanitized.length; i++) {
        this.buffer.push(sanitized.charCodeAt(i));
      }
      this.buffer.push(0x0A); // new line
      return this;
    }

    feed(lines = 1) {
      for (let i = 0; i < lines; i++) {
        this.buffer.push(0x0A);
      }
      return this;
    }

    cut() {
      this.buffer.push(0x1D, 0x56, 66, 0); // GS V 66 0 (partial cut)
      return this;
    }

    getBytes() {
      return new Uint8Array(this.buffer);
    }
  }

  function initPrinterSettings() {
    const profile = getProfile();
    const widthSelect = document.getElementById('printerPaperWidth');
    const width = profile.printerPaperWidth || '58';
    if (widthSelect) {
      widthSelect.value = width;
    }
    document.querySelectorAll('.paper-width-card').forEach(card => {
      if (card.dataset.width === width) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
    updatePrinterUI(!!printCharacteristic);
  }

  function handlePaperWidthChange(e) {
    const width = e.target.value;
    saveProfile({
      printerPaperWidth: width
    });
    showToast(`Paper width set to ${width}mm`, 'success');
  }

  function updatePrinterUI(connected) {
    const statusText = document.getElementById('printerStatusText');
    const deviceName = document.getElementById('printerDeviceName');
    const connectBtn = document.getElementById('printerConnectBtn');
    const disconnectBtn = document.getElementById('printerDisconnectBtn');
    const testBtn = document.getElementById('printerTestBtn');
    const statsBar = document.querySelector('#printerScreen .stats-bar');
    const settingsVal = document.getElementById('settingsPrinterValue');
    const badge = document.getElementById('printerStatusBadge');

    if (connected && printerDevice) {
      if (statusText) statusText.textContent = 'Connected';
      if (deviceName) deviceName.textContent = printerDevice.name || 'Generic Thermal Printer';
      if (statsBar) {
        statsBar.classList.add('connected');
        statsBar.classList.remove('disconnected', 'searching');
      }
      if (badge) {
        badge.textContent = 'Connected';
      }
      if (connectBtn) connectBtn.style.display = 'none';
      if (disconnectBtn) disconnectBtn.style.display = 'block';
      if (testBtn) testBtn.style.display = 'block';
      if (settingsVal) settingsVal.textContent = printerDevice.name || 'Connected';
    } else {
      if (statusText) statusText.textContent = 'Ready to Pair';
      if (deviceName) deviceName.textContent = 'No thermal printer connected';
      if (statsBar) {
        statsBar.classList.add('disconnected');
        statsBar.classList.remove('connected', 'searching');
      }
      if (badge) {
        badge.textContent = 'Disconnected';
      }
      if (connectBtn) connectBtn.style.display = 'block';
      if (disconnectBtn) disconnectBtn.style.display = 'none';
      if (testBtn) testBtn.style.display = 'none';
      if (settingsVal) settingsVal.textContent = 'Disconnected';
    }
  }

  async function connectBluetoothPrinter() {
    if (printCharacteristic) {
      showToast('Printer is already connected', 'info');
      return printCharacteristic;
    }

    const statusCard = document.getElementById('bluetoothStatusCard');
    const statusText = document.getElementById('printerStatusText');
    const badge = document.getElementById('printerStatusBadge');
    
    if (statusCard) {
      statusCard.classList.remove('disconnected', 'connected');
      statusCard.classList.add('searching');
    }
    if (statusText) statusText.textContent = 'Searching...';
    if (badge) {
      badge.textContent = 'Searching';
    }

    showSpinner('Searching for Bluetooth printers...');
    try {
      printerDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '00001101-0000-1000-8000-00805f9b34fb', // Standard SPP
          '000018f0-0000-1000-8000-00805f9b34fb', // Raw Print Service
          '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Serial Port
          'e7e1a000-a2bd-11e2-8e96-0800200c9a66'  // Custom SPP
        ]
      });

      printerDevice.addEventListener('gattserverdisconnected', onPrinterDisconnected);

      showSpinner('Connecting to GATT server...');
      const server = await printerDevice.gatt.connect();

      showSpinner('Scanning printable services...');
      const services = await server.getPrimaryServices();
      let foundChar = null;

      for (const service of services) {
        try {
          const chars = await service.getCharacteristics();
          for (const char of chars) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              foundChar = char;
              break;
            }
          }
        } catch (e) {
          console.warn('Could not read characteristics for service:', service.uuid, e);
        }
        if (foundChar) break;
      }

      if (!foundChar) {
        throw new Error('Could not find writeable characteristic on this device');
      }

      printCharacteristic = foundChar;
      updatePrinterUI(true);
      showToast('Connected successfully!', 'success');
      hideSpinner();
      return printCharacteristic;
    } catch (err) {
      hideSpinner();
      console.error('[Printer] Connection error:', err);
      showToast('Failed to connect: ' + err.message, 'error');
      updatePrinterUI(false);
      printerDevice = null;
      printCharacteristic = null;
      throw err;
    }
  }

  function disconnectBluetoothPrinter() {
    if (printerDevice && printerDevice.gatt.connected) {
      printerDevice.gatt.disconnect();
    }
    onPrinterDisconnected();
    showToast('Printer disconnected', 'info');
  }

  function onPrinterDisconnected() {
    printerDevice = null;
    printCharacteristic = null;
    updatePrinterUI(false);
  }

  async function writeCharacteristicValueInChunks(characteristic, bytes) {
    const chunkSize = 20;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      await characteristic.writeValue(chunk);
      // Wait 15ms between chunks to let the printer process
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  }

  function formatReceipt(bill, profile, widthChars) {
    const encoder = new EscPosEncoder();
    encoder.initialize();

    const shopName = bill.shopName || profile.shopName || 'Shop Name';
    const address = profile.address || '';
    const mobile = profile.mobile || '';
    const gstin = profile.gstin || '';

    // Title / Shop Details
    encoder.align('center').bold(true).fontSize(true, true).line(shopName);
    encoder.fontSize(false, false).bold(false);

    if (address) encoder.line(address);
    if (mobile) encoder.line('Mobile: ' + mobile);
    if (gstin) encoder.line('GST: ' + gstin);

    encoder.line('-'.repeat(widthChars));

    // Bill Meta
    encoder.align('left');
    encoder.line('Bill No: ' + (bill.billNumber || 'BILL'));
    encoder.line('Date: ' + formatDate(new Date(bill.date || bill.createdAt)));
    encoder.line('Customer: ' + (bill.customerName || 'Customer'));
    if (bill.customerMobile) {
      encoder.line('Mobile: ' + bill.customerMobile);
    }

    encoder.line('-'.repeat(widthChars));

    // Headers
    if (widthChars >= 40) {
      // 80mm table: columns: Name, Qty, Total
      const nameColWidth = widthChars - 18;
      let header = 'Item Name'.padEnd(nameColWidth) + 'Qty'.padStart(6) + 'Total'.padStart(12);
      encoder.bold(true).line(header).bold(false);
    } else {
      // 58mm table: headers
      let header = 'Item Name'.padEnd(widthChars - 10) + 'Total'.padStart(10);
      encoder.bold(true).line(header).bold(false);
    }

    encoder.line('-'.repeat(widthChars));

    // Items
    (bill.items || []).forEach(item => {
      const name = item.name || '';
      const qtyText = `${item.qty} ${item.unit || 'pcs'}`;
      const priceText = `Rs.${parseFloat(item.price).toFixed(2)}`;
      const totalText = `Rs.${parseFloat(item.total).toFixed(2)}`;

      if (widthChars >= 40) {
        // 80mm: Name (left), Qty (center), Total (right)
        const nameColWidth = widthChars - 18;
        let lineText = name.slice(0, nameColWidth - 1).padEnd(nameColWidth);
        lineText += qtyText.padStart(6);
        lineText += totalText.padStart(12);
        encoder.line(lineText);
      } else {
        // 58mm (32 chars): Line 1 Name, Line 2 Details
        encoder.line(name);
        const details = `  ${qtyText} x ${priceText}`;
        const remaining = widthChars - details.length - totalText.length;
        const spaces = remaining > 0 ? ' '.repeat(remaining) : ' ';
        encoder.line(details + spaces + totalText);
      }
    });

    encoder.line('-'.repeat(widthChars));

    // Totals
    const subtotalText = `Rs.${parseFloat(bill.subtotal).toFixed(2)}`;
    const discountVal = bill.discountAmount || 0;
    const discountText = `-Rs.${parseFloat(discountVal).toFixed(2)}`;
    const taxVal = bill.taxAmount || 0;
    const taxText = `Rs.${parseFloat(taxVal).toFixed(2)}`;
    const totalText = `Rs.${parseFloat(bill.totalAmount || bill.total).toFixed(2)}`;

    const rightAlignTotal = (label, value) => {
      const remaining = widthChars - label.length - value.length;
      return label + ' '.repeat(remaining > 0 ? remaining : 1) + value;
    };

    encoder.line(rightAlignTotal('Subtotal:', subtotalText));
    if (discountVal > 0) {
      encoder.line(rightAlignTotal('Discount:', discountText));
    }
    if (taxVal > 0) {
      encoder.line(rightAlignTotal('Tax:', taxText));
    }

    encoder.line('='.repeat(widthChars));
    encoder.bold(true).line(rightAlignTotal('GRAND TOTAL:', totalText)).bold(false);
    encoder.line('='.repeat(widthChars));

    // Payment Info
    let status = bill.paymentStatus || 'Paid';
    const totalAmt = parseFloat(bill.totalAmount || bill.total) || 0;
    let paidAmt = bill.amountPaid !== undefined ? parseFloat(bill.amountPaid) : (status === 'Paid' ? totalAmt : 0);
    let outstanding = totalAmt - paidAmt;

    if (status !== 'Paid' && outstanding <= 0.015) {
      status = 'Paid';
      paidAmt = totalAmt;
      outstanding = 0;
    }

    encoder.align('center');
    encoder.line('Payment Mode: ' + (bill.paymentType || bill.paymentMethod || 'Cash'));
    encoder.line('Payment Status: ' + status.toUpperCase());

    if (status !== 'Paid') {
      encoder.line(`Paid: Rs.${paidAmt.toFixed(2)}  |  Due: Rs.${outstanding.toFixed(2)}`);
    }

    encoder.feed(2);
    encoder.line('Thank you for shopping with us!');
    encoder.line('Visit again!');
    encoder.feed(4); // Feed paper to tearing line
    encoder.cut();

    return encoder.getBytes();
  }

  async function printTestReceipt() {
    if (!printCharacteristic) {
      showToast('Printer is not connected', 'error');
      return;
    }

    showSpinner('Printing test page...');
    try {
      const profile = getProfile();
      const paperWidth = parseInt(profile.printerPaperWidth || '58');
      const widthChars = paperWidth === 80 ? 48 : 32;

      const encoder = new EscPosEncoder();
      encoder.initialize();
      encoder.align('center').bold(true).fontSize(true, true).line('TEST PRINT');
      encoder.fontSize(false, false).bold(false).feed();
      encoder.line('KhataBill Thermal Printer Setup');
      encoder.line('Paper Width: ' + paperWidth + 'mm');
      encoder.line('Line Length: ' + widthChars + ' chars');
      encoder.line('Status: Working Successfully');
      encoder.feed(1);
      encoder.line('-'.repeat(widthChars));
      encoder.feed(4);
      encoder.cut();

      await writeCharacteristicValueInChunks(printCharacteristic, encoder.getBytes());
      showToast('Test page printed successfully!', 'success');
      hideSpinner();
    } catch (err) {
      hideSpinner();
      console.error('[Printer] Print failed:', err);
      showToast('Print failed: ' + err.message, 'error');
    }
  }

  async function handleBluetoothPrint(billId) {
    try {
      let char = printCharacteristic;
      if (!char) {
        char = await connectBluetoothPrinter();
      }

      if (!char) return;

      showSpinner('Formatting receipt...');
      const bill = await KhataBillDB.getBill(billId);
      if (!bill) {
        hideSpinner();
        showToast('Bill not found', 'error');
        return;
      }

      const profile = getProfile();
      const paperWidth = parseInt(profile.printerPaperWidth || '58');
      const widthChars = paperWidth === 80 ? 48 : 32;

      const receiptBytes = formatReceipt(bill, profile, widthChars);

      showSpinner('Sending print payload...');
      await writeCharacteristicValueInChunks(char, receiptBytes);

      showToast('Receipt printed successfully!', 'success');
      hideSpinner();
    } catch (err) {
      hideSpinner();
      if (err.message && !err.message.includes('User cancelled')) {
        showToast('Print failed: ' + err.message, 'error');
      }
    }
  }

})();
