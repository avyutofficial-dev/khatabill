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
  let currentPage = 1;
  let allBills = [];
  let screenHistory = [];
  let billsSortBy = 'date'; // 'date', 'amount', 'name'
  let billsSortOrder = 'desc'; // 'asc', 'desc'

  // ========== INITIALIZATION ==========
  let deferredPrompt = null;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (isStandalone) {
      const landing = document.getElementById('landingPage');
      const app = document.getElementById('appContainer');
      if (landing) landing.style.display = 'none';
      if (app) app.style.display = 'block';

      await KhataBillDB.open();
      registerServiceWorker();
      bindEvents();
      checkFirstTimeUser();
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
      const merged = { ...existing, ...data };
      localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
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
      'about': 'aboutScreen'
    };

    const screenId = screenMap[name];
    if (screenId) {
      const el = document.getElementById(screenId);
      el.classList.add('active');
    }

    currentScreen = name;

    // Update navbar and tabbar visibility
    const noTabbarScreens = ['setup', 'billCreate', 'billDetail', 'backup', 'editShop', 'editPref', 'about'];
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
      const backScreens = ['billCreate', 'billDetail', 'backup', 'editShop', 'editPref', 'about'];
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
        'about': 'aboutScreen'
      };

      const screenId = screenMap[prev];
      if (screenId) {
        document.getElementById(screenId).classList.add('active');
      }
      currentScreen = prev;

      const noTabbarScreens = ['setup', 'billCreate', 'billDetail', 'backup', 'editShop', 'editPref', 'about'];
      if (noTabbarScreens.includes(prev)) {
        hideTabbar();
      } else {
        showTabbar();
      }

      if (prev === 'setup') {
        hideNavbar();
      } else {
        showNavbar();
        const backScreens = ['billCreate', 'billDetail', 'backup', 'editShop', 'editPref', 'about'];
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
    } else if (screen === 'settings' || screen === 'editShop' || screen === 'editPref' || screen === 'backup') {
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
      document.querySelectorAll('.payment-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectedPayment = chip.dataset.payment;
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
    document.getElementById('detailDeleteBtn').addEventListener('click', handleDeleteBill);

    // Settings
    document.getElementById('settingsEditShopBtn').addEventListener('click', () => showScreen('editShop'));
    document.getElementById('settingsDiscountItem').addEventListener('click', () => showScreen('editPref'));
    document.getElementById('settingsTaxItem').addEventListener('click', () => showScreen('editPref'));
    document.getElementById('settingsPrefixItem').addEventListener('click', () => showScreen('editPref'));
    document.getElementById('settingsBackupItem').addEventListener('click', () => showScreen('backup'));
    document.getElementById('settingsClearItem').addEventListener('click', handleClearAllData);
    document.getElementById('settingsAboutItem').addEventListener('click', () => showScreen('about'));
    document.getElementById('settingsResetBtn').addEventListener('click', handleResetApp);
    document.getElementById('aboutBackBtn').addEventListener('click', goBack);

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
        container.innerHTML = recentBills.map(bill => renderBillCard(bill)).join('');
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
    document.querySelectorAll('.payment-chip').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-payment="Cash"]').classList.add('active');

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
      <input type="text" placeholder="Item name" class="item-name" data-idx="${index}">
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
      billItems[index].name = e.target.value;
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

    const subtotal = validItems.reduce((sum, item) => sum + (item.total || 0), 0);

    const discType = document.getElementById('createDiscountType').value;
    const discVal = parseFloat(document.getElementById('createDiscountValue').value) || 0;
    let discountAmount = discType === '%' ? (subtotal * discVal) / 100 : discVal;

    const taxType = document.getElementById('createTaxType').value;
    const taxVal = parseFloat(document.getElementById('createTaxValue').value) || 0;
    const afterDiscount = subtotal - discountAmount;
    let taxAmount = taxType === '%' ? (afterDiscount * taxVal) / 100 : taxVal;

    const totalAmount = afterDiscount + taxAmount;

    const billNumber = document.getElementById('createBillNumber').textContent.replace('Bill No: ', '');

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
      paymentStatus: 'Paid',
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
    const statusClass = (bill.paymentStatus || 'Paid').toLowerCase();
    const statusHtml = showStatus ? `<span class="bill-card-status ${statusClass}">${bill.paymentStatus || 'Paid'}</span>` : '';

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

      const card = document.getElementById('billDetailCard');
      card.innerHTML = `
        <!-- Shop Header -->
        <div class="bill-detail-top">
          <div class="bill-detail-shop">
            ${profile.showLogoOnBill !== false ? `
            <div class="bill-detail-shop-logo">
              <img src="${profile.logo || 'assests/image/logo.png'}" alt="Shop">
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
            <span class="value">₹${parseFloat(bill.totalAmount).toFixed(2)}</span>
          </div>
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

      const doc = new jsPDF('p', 'mm', 'a4');
      if (typeof doc.autoTable !== 'function') {
        throw new Error('jsPDF-AutoTable is not available');
      }

      const margin = { top: 15, left: 14, right: 14, bottom: 15 };
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const tableStartY = 70;
      const tableTopMargin = 36;
      const headerLineY = 32;
      const rightX = pageWidth - margin.right;
      const bodyWidth = pageWidth - margin.left - margin.right;
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
        const shopName = truncateToWidth(doc, shopDisplayName, textWidth);
        doc.text(shopName, textX, 16);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
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

        doc.setDrawColor(0);
        doc.line(14, headerLineY, 196, headerLineY);
      };

      const drawInvoiceSection = () => {
        // ── Inline TAX INVOICE header (no box) ──────────────────────────
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);

        // "TAX INVOICE:" label – bold, black
        doc.setTextColor(0, 0, 0);
        doc.text('TAX INVOICE:', 14, 38);

        // Bill number – bold, green, positioned right after the label
        doc.setTextColor(46, 125, 50);
        const labelWidth = doc.getTextWidth('TAX INVOICE:');
        doc.text(' ' + (bill.billNumber || 'BILL'), 14 + labelWidth, 38);
        // ────────────────────────────────────────────────────────────────

        // Date / day on the right side
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(dateTimeText, rightX, 24, { align: 'right' });
        doc.setFontSize(9);
        doc.text(dayText, rightX, 29, { align: 'right' });
      };

      const drawCustomerSection = () => {
        // Starts at Y=47 → 9mm gap below the invoice line at Y=38
        doc.setFillColor(240, 240, 240);
        doc.roundedRect(margin.left, 47, bodyWidth, 16, 2, 2, 'F');
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
      };

      const drawPageNumber = (pageNumber) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.text(`Page ${pageNumber}`, rightX, 290, { align: 'right' });
      };

      const itemsData = (bill.items || []).map((item, index) => ([
        String(index + 1),
        item.name || '',
        String(item.qty ?? ''),
        formatCurrency(item.price),
        formatCurrency(item.total)
      ]));

      doc.autoTable({
        startY: tableStartY,
        head: [['Sr.', 'Item Name', 'Qty', 'Price', 'Total']],
        body: itemsData,
        theme: 'grid',
        styles: {
          font: 'helvetica',
          fontSize: 9,
          cellPadding: 2.5,
          overflow: 'linebreak'
        },
        headStyles: {
          fillColor: [230, 230, 230],
          textColor: 0,
          halign: 'center'
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 80 },
          2: { cellWidth: 20, halign: 'center' },
          3: { cellWidth: 30, halign: 'right' },
          4: { cellWidth: 30, halign: 'right' }
        },
        margin: { left: margin.left, right: margin.right, top: tableTopMargin, bottom: margin.bottom },
        pageBreak: 'auto',
        rowPageBreak: 'avoid',
        didDrawPage: (data) => {
          drawHeader();
          if (data.pageNumber === 1) {
            drawInvoiceSection();
            drawCustomerSection();
          }
          drawPageNumber(data.pageNumber);
        }
      });

      let finalY = doc.lastAutoTable.finalY + 15;
      const summaryBlockHeight = 66;
      if (finalY + summaryBlockHeight > pageHeight - margin.bottom) {
        doc.addPage();
        drawHeader();
        drawPageNumber(doc.internal.getCurrentPageInfo().pageNumber);
        finalY = 50;
      }

      const discountValue = bill.discountAmount ?? bill.discount ?? 0;
      const discountLabel = bill.discountType === '%' ? `Discount (${bill.discountValue}%)` : 'Discount';
      const taxPercent = bill.taxType === '%' ? bill.taxValue : (bill.taxValue ?? bill.taxPercent ?? 0);
      const taxLabel = bill.taxType === '%' ? `Tax (${bill.taxValue}%)` : 'Tax';
      const taxValue = bill.taxAmount ?? bill.tax ?? 0;
      const totalValue = bill.totalAmount ?? bill.total ?? 0;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(0);
      doc.text('Subtotal', 130, finalY);
      doc.text(formatCurrency(bill.subtotal), rightX, finalY, { align: 'right' });
      doc.text(discountLabel, 130, finalY + 6);
      doc.text(formatCurrency(discountValue), rightX, finalY + 6, { align: 'right' });
      doc.text(taxLabel, 130, finalY + 12);
      doc.text(formatCurrency(taxValue), rightX, finalY + 12, { align: 'right' });

      doc.setFillColor(220, 240, 220);
      const totalLabel = 'TOTAL AMOUNT';
      const totalText = formatCurrency(totalValue);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      const totalLabelWidth = doc.getTextWidth(totalLabel);
      const totalTextWidth = doc.getTextWidth(totalText);
      const totalBoxPadding = 4;
      const totalBoxGap = 8;
      const totalBoxWidth = Math.max(70, totalLabelWidth + totalTextWidth + totalBoxGap + totalBoxPadding * 2);
      const totalBoxX = rightX - totalBoxWidth;
      doc.roundedRect(totalBoxX, finalY + 16, totalBoxWidth, 12, 2, 2, 'F');
      doc.text(totalLabel, totalBoxX + totalBoxPadding, finalY + 24);
      doc.text(totalText, totalBoxX + totalBoxWidth - totalBoxPadding, finalY + 24, { align: 'right' });

      doc.setFillColor(240, 240, 240);
      doc.roundedRect(margin.left, finalY + 32, 100, 16, 2, 2, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.text('Thank you for shopping with us!', margin.left + 4, finalY + 42);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`For ${shopDisplayName}`, 130, finalY + 38);
      doc.text('Authorized Signatory', 130, finalY + 48);

      doc.setFillColor(220, 240, 220);
      doc.roundedRect(margin.left, finalY + 52, bodyWidth, 14, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Visit again. We look forward to serving you.', pageWidth / 2, finalY + 61, { align: 'center' });

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
  function initSettings() {
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

  // ========== UTILITIES ==========
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

})();
