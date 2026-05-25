/**
 * KhataBill - IndexedDB Database Module
 * Handles all bill storage operations using IndexedDB
 */

const KhataBillDB = (() => {
  const DB_NAME = 'KhataBillDB';
  const DB_VERSION = 5;
  const STORE_NAME = 'bills';
  const PRODUCTS_STORE = 'products';
  let db = null;

  /**
   * Open/initialize the database
   */
  function open() {
    return new Promise((resolve, reject) => {
      if (db) {
        resolve(db);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        const transaction = event.target.transaction;
        
        // Bills store (v1)
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true
          });
          store.createIndex('billNumber', 'billNumber', { unique: true });
          store.createIndex('customerName', 'customerName', { unique: false });
          store.createIndex('date', 'date', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Products catalog store (v2)
        let productsStore;
        if (!database.objectStoreNames.contains(PRODUCTS_STORE)) {
          productsStore = database.createObjectStore(PRODUCTS_STORE, {
            keyPath: 'id',
            autoIncrement: true
          });
          productsStore.createIndex('name', 'name', { unique: true });
        } else {
          productsStore = transaction.objectStore(PRODUCTS_STORE);
        }

        // Add barcode index (v3)
        if (productsStore && !productsStore.indexNames.contains('barcode')) {
          productsStore.createIndex('barcode', 'barcode', { unique: false });
        }

        // Add stock history store (v4)
        if (!database.objectStoreNames.contains('stock_history')) {
          const historyStore = database.createObjectStore('stock_history', {
            keyPath: 'id',
            autoIncrement: true
          });
          historyStore.createIndex('productId', 'productId', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        db = event.target.result;
        resolve(db);
      };

      request.onerror = (event) => {
        const error = event.target.error;
        if (error && error.name === 'VersionError') {
          console.warn('[DB] VersionError detected. Outdated app cache suspected. Clearing cache and reloading...');
          // Clear service worker registrations
          if (navigator.serviceWorker) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
              for (let registration of registrations) {
                registration.unregister();
              }
            });
          }
          // Clear caches
          if (window.caches) {
            caches.keys().then(keys => {
              keys.forEach(key => caches.delete(key));
            });
          }
          // Force reload after a short delay to allow clearing to start
          setTimeout(() => {
            window.location.reload();
          }, 500);
        }
        reject('Failed to open database: ' + error);
      };
    });
  }

  /**
   * Get a transaction and object store
   */
  function getStore(mode) {
    const tx = db.transaction(STORE_NAME, mode);
    return tx.objectStore(STORE_NAME);
  }

  /**
   * Add a new bill
   */
  function addBill(bill) {
    return new Promise(async (resolve, reject) => {
      await open();
      const store = getStore('readwrite');
      bill.createdAt = new Date().toISOString();
      bill.updatedAt = new Date().toISOString();
      const request = store.add(bill);
      request.onsuccess = () => {
        if (window.GDriveSync) GDriveSync.triggerSync();
        resolve(request.result);
      };
      request.onerror = () => reject('Failed to add bill: ' + request.error);
    });
  }

  /**
   * Get a single bill by ID
   */
  function getBill(id) {
    return new Promise(async (resolve, reject) => {
      await open();
      const store = getStore('readonly');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('Failed to get bill: ' + request.error);
    });
  }

  /**
   * Get all bills, sorted by createdAt descending
   */
  function getAllBills() {
    return new Promise(async (resolve, reject) => {
      await open();
      const store = getStore('readonly');
      const request = store.getAll();
      request.onsuccess = () => {
        const bills = request.result.sort((a, b) => {
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        resolve(bills);
      };
      request.onerror = () => reject('Failed to get bills: ' + request.error);
    });
  }

  /**
   * Update an existing bill
   */
  function updateBill(bill) {
    return new Promise(async (resolve, reject) => {
      await open();
      const store = getStore('readwrite');
      bill.updatedAt = new Date().toISOString();
      const request = store.put(bill);
      request.onsuccess = () => {
        if (window.GDriveSync) GDriveSync.triggerSync();
        resolve(request.result);
      };
      request.onerror = () => reject('Failed to update bill: ' + request.error);
    });
  }

  /**
   * Delete a bill by ID
   */
  function deleteBill(id) {
    return new Promise(async (resolve, reject) => {
      await open();
      const store = getStore('readwrite');
      const request = store.delete(id);
      request.onsuccess = () => {
        if (window.GDriveSync) GDriveSync.triggerSync();
        resolve();
      };
      request.onerror = () => reject('Failed to delete bill: ' + request.error);
    });
  }

  /**
   * Get the next bill number based on prefix and existing bills
   */
  function getNextBillNumber() {
    return new Promise(async (resolve, reject) => {
      await open();
      const profile = JSON.parse(localStorage.getItem('khatabill_profile') || '{}');
      const prefix = profile.billPrefix || 'BILL-';

      const store = getStore('readonly');
      const request = store.getAll();
      request.onsuccess = () => {
        const bills = request.result;
        let maxNum = 0;
        bills.forEach(bill => {
          if (bill.billNumber) {
            const numPart = bill.billNumber.replace(/[^0-9]/g, '');
            const num = parseInt(numPart) || 0;
            if (num > maxNum) maxNum = num;
          }
        });
        const nextNum = String(maxNum + 1).padStart(5, '0');
        resolve(prefix + nextNum);
      };
      request.onerror = () => reject('Failed to get next bill number');
    });
  }

  /**
   * Get bill statistics
   */
  function getBillStats() {
    return new Promise(async (resolve, reject) => {
      await open();
      const store = getStore('readonly');
      const request = store.getAll();
      request.onsuccess = () => {
        const bills = request.result;
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const monthBills = bills.filter(b => {
          const d = new Date(b.date || b.createdAt);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });

        resolve({
          totalBills: bills.length,
          totalAmount: bills.reduce((sum, b) => sum + (parseFloat(b.totalAmount) || 0), 0),
          monthBills: monthBills.length,
          monthAmount: monthBills.reduce((sum, b) => sum + (parseFloat(b.totalAmount) || 0), 0)
        });
      };
      request.onerror = () => reject('Failed to get stats');
    });
  }

  /**
   * Search bills by customer name or bill number
   */
  function searchBills(query) {
    return new Promise(async (resolve, reject) => {
      await open();
      const store = getStore('readonly');
      const request = store.getAll();
      request.onsuccess = () => {
        const q = query.toLowerCase().trim();
        const results = request.result.filter(bill => {
          return (
            (bill.customerName && bill.customerName.toLowerCase().includes(q)) ||
            (bill.billNumber && bill.billNumber.toLowerCase().includes(q)) ||
            (bill.customerMobile && bill.customerMobile.includes(q))
          );
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        resolve(results);
      };
      request.onerror = () => reject('Search failed');
    });
  }

  /**
   * Add a new product
   */
  function addProduct(product) {
    return new Promise(async (resolve, reject) => {
      try {
        await open();
        const tx = db.transaction([PRODUCTS_STORE, 'stock_history'], 'readwrite');
        const store = tx.objectStore(PRODUCTS_STORE);
        const historyStore = tx.objectStore('stock_history');
        product.createdAt = new Date().toISOString();
        product.updatedAt = new Date().toISOString();
        product.costPrice = parseFloat(product.costPrice) || 0;
        product.stockQuantity = parseFloat(product.stockQuantity) || 0;
        product.minStockLevel = parseFloat(product.minStockLevel) || 0;
        product.gstPercent = parseFloat(product.gstPercent) || 0;
        product.location = (product.location || '').trim();
        product.mfgDate = product.mfgDate || '';
        product.expDate = product.expDate || '';
        const request = store.add(product);
        request.onsuccess = () => {
          const productId = request.result;
          if (product.stockQuantity > 0) {
            const historyEntry = {
              productId,
              type: 'IN',
              quantity: product.stockQuantity,
              reason: 'Initial Stock',
              createdAt: new Date().toISOString()
            };
            historyStore.add(historyEntry);
          }
        };
        tx.oncomplete = () => {
          if (window.GDriveSync) GDriveSync.triggerSync();
          resolve(request.result);
        };
        tx.onerror = () => reject('Failed to add product: ' + tx.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Get all products
   */
  function getAllProducts() {
    return new Promise(async (resolve, reject) => {
      try {
        await open();
        const tx = db.transaction(PRODUCTS_STORE, 'readonly');
        const store = tx.objectStore(PRODUCTS_STORE);
        const request = store.getAll();
        request.onsuccess = () => {
          const products = request.result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          resolve(products);
        };
        request.onerror = () => reject('Failed to get products: ' + request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Update product
   */
  function updateProduct(product) {
    return new Promise(async (resolve, reject) => {
      try {
        await open();
        const tx = db.transaction([PRODUCTS_STORE, 'stock_history'], 'readwrite');
        const store = tx.objectStore(PRODUCTS_STORE);
        const historyStore = tx.objectStore('stock_history');
        
        product.updatedAt = new Date().toISOString();
        product.costPrice = parseFloat(product.costPrice) || 0;
        product.stockQuantity = parseFloat(product.stockQuantity) || 0;
        product.minStockLevel = parseFloat(product.minStockLevel) || 0;
        product.gstPercent = parseFloat(product.gstPercent) || 0;
        product.location = (product.location || '').trim();
        product.mfgDate = product.mfgDate || '';
        product.expDate = product.expDate || '';

        const getReq = store.get(product.id);
        getReq.onsuccess = () => {
          const oldProduct = getReq.result;
          const oldStock = oldProduct ? (parseFloat(oldProduct.stockQuantity) || 0) : 0;
          const newStock = product.stockQuantity;

          const request = store.put(product);
          request.onsuccess = () => {
            if (newStock !== oldStock) {
              const diff = newStock - oldStock;
              const historyEntry = {
                productId: product.id,
                type: diff > 0 ? 'IN' : 'OUT',
                quantity: Math.abs(diff),
                reason: 'Manual Adjustment',
                createdAt: new Date().toISOString()
              };
              historyStore.add(historyEntry);
            }
          };
        };

        tx.oncomplete = () => {
          if (window.GDriveSync) GDriveSync.triggerSync();
          resolve(product.id);
        };
        tx.onerror = () => reject('Failed to update product: ' + tx.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Delete product
   */
  function deleteProduct(id) {
    return new Promise(async (resolve, reject) => {
      try {
        await open();
        const tx = db.transaction(PRODUCTS_STORE, 'readwrite');
        const store = tx.objectStore(PRODUCTS_STORE);
        const request = store.delete(id);
        request.onsuccess = () => {
          if (window.GDriveSync) GDriveSync.triggerSync();
          resolve();
        };
        request.onerror = () => reject('Failed to delete product: ' + request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Get product by barcode
   */
  function getProductByBarcode(barcode) {
    return new Promise(async (resolve, reject) => {
      try {
        await open();
        const tx = db.transaction(PRODUCTS_STORE, 'readonly');
        const store = tx.objectStore(PRODUCTS_STORE);
        const index = store.index('barcode');
        const request = index.get(barcode);
        request.onsuccess = () => {
          resolve(request.result || null);
        };
        request.onerror = () => reject('Failed to get product by barcode: ' + request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Export all data (bills + profile + products) as JSON
   */
  function exportData() {
    return new Promise(async (resolve, reject) => {
      try {
        await open();
        const tx = db.transaction([STORE_NAME, PRODUCTS_STORE, 'stock_history'], 'readonly');
        const billsStore = tx.objectStore(STORE_NAME);
        const productsStore = tx.objectStore(PRODUCTS_STORE);
        const historyStore = tx.objectStore('stock_history');

        const billsReq = billsStore.getAll();
        const productsReq = productsStore.getAll();
        const historyReq = historyStore.getAll();

        tx.oncomplete = () => {
          const data = {
            version: 3,
            exportDate: new Date().toISOString(),
            profile: JSON.parse(localStorage.getItem('khatabill_profile') || '{}'),
            bills: billsReq.result || [],
            products: productsReq.result || [],
            stockHistory: historyReq.result || []
          };
          resolve(data);
        };
        tx.onerror = () => reject('Export failed: ' + tx.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Import data from JSON backup
   */
  function importData(data) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!data || !data.bills) {
          reject('Invalid backup file');
          return;
        }
        await open();

        // Restore profile
        if (data.profile) {
          localStorage.setItem('khatabill_profile', JSON.stringify(data.profile));
        }

        // Clear existing bills, products and stock history
        const tx = db.transaction([STORE_NAME, PRODUCTS_STORE, 'stock_history'], 'readwrite');
        const billsStore = tx.objectStore(STORE_NAME);
        const productsStore = tx.objectStore(PRODUCTS_STORE);
        const historyStore = tx.objectStore('stock_history');
        
        billsStore.clear();
        productsStore.clear();
        historyStore.clear();

        let importedBills = 0;
        data.bills.forEach(bill => {
          const billCopy = { ...bill };
          delete billCopy.id;
          billsStore.add(billCopy);
          importedBills++;
        });

        if (data.products && Array.isArray(data.products)) {
          data.products.forEach(product => {
            const productCopy = { ...product };
            delete productCopy.id;
            productsStore.add(productCopy);
          });
        }

        if (data.stockHistory && Array.isArray(data.stockHistory)) {
          data.stockHistory.forEach(entry => {
            const entryCopy = { ...entry };
            delete entryCopy.id;
            historyStore.add(entryCopy);
          });
        }

        tx.oncomplete = () => {
          if (window.GDriveSync) GDriveSync.triggerSync();
          resolve(importedBills);
        };
        tx.onerror = () => reject('Import failed: ' + tx.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Clear all bills
   */
  function clearAll() {
    return new Promise(async (resolve, reject) => {
      await open();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onerror = () => reject('Failed to clear data');
      tx.oncomplete = () => {
        if (window.GDriveSync) GDriveSync.triggerSync();
        resolve();
      };
      tx.onerror = () => reject('Failed to clear data');
    });
  }

  /**
   * Merge data from backup JSON with local database
   */
  function mergeData(data) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!data || !data.bills) {
          reject('Invalid backup file');
          return;
        }
        await open();

        // 1. Merge profile settings
        const localProfile = JSON.parse(localStorage.getItem('khatabill_profile') || '{}');
        const backupProfile = data.profile || {};
        
        const localProfileTime = new Date(localProfile.updatedAt || 0).getTime();
        const backupProfileTime = new Date(backupProfile.updatedAt || 0).getTime();
        
        if (backupProfileTime > localProfileTime) {
          localStorage.setItem('khatabill_profile', JSON.stringify(backupProfile));
        }

        // Get all local data
        const txRead = db.transaction([STORE_NAME, PRODUCTS_STORE, 'stock_history'], 'readonly');
        const billsStoreRead = txRead.objectStore(STORE_NAME);
        const productsStoreRead = txRead.objectStore(PRODUCTS_STORE);
        const historyStoreRead = txRead.objectStore('stock_history');
        
        const localBills = await new Promise((res) => {
          const req = billsStoreRead.getAll();
          req.onsuccess = () => res(req.result);
        });
        
        const localProducts = await new Promise((res) => {
          const req = productsStoreRead.getAll();
          req.onsuccess = () => res(req.result);
        });

        const localHistory = await new Promise((res) => {
          const req = historyStoreRead.getAll();
          req.onsuccess = () => res(req.result);
        });
        
        // Maps and Sets
        const localBillsMap = new Map();
        localBills.forEach(b => {
          if (b.billNumber) localBillsMap.set(b.billNumber, b);
        });
        
        const localProductsMap = new Map();
        localProducts.forEach(p => {
          if (p.name) localProductsMap.set(p.name.trim().toLowerCase(), p);
        });

        const localHistorySet = new Set();
        localHistory.forEach(h => {
          const key = `${h.productId}::${h.type}::${h.quantity}::${h.reason}::${h.createdAt}`;
          localHistorySet.add(key);
        });

        // Start write transaction
        const txWrite = db.transaction([STORE_NAME, PRODUCTS_STORE, 'stock_history'], 'readwrite');
        const billsStoreWrite = txWrite.objectStore(STORE_NAME);
        const productsStoreWrite = txWrite.objectStore(PRODUCTS_STORE);
        const historyStoreWrite = txWrite.objectStore('stock_history');

        let billsAdded = 0;
        let billsUpdated = 0;

        // Process bills
        data.bills.forEach(backupBill => {
          const localBill = localBillsMap.get(backupBill.billNumber);
          if (!localBill) {
            const billCopy = { ...backupBill };
            delete billCopy.id;
            billsStoreWrite.add(billCopy);
            billsAdded++;
          } else {
            const localTime = new Date(localBill.updatedAt || localBill.date || localBill.createdAt || 0).getTime();
            const backupTime = new Date(backupBill.updatedAt || backupBill.date || backupBill.createdAt || 0).getTime();
            if (backupTime > localTime) {
              const billCopy = { ...backupBill };
              billCopy.id = localBill.id;
              billsStoreWrite.put(billCopy);
              billsUpdated++;
            }
          }
        });

        // Process products
        if (data.products && Array.isArray(data.products)) {
          data.products.forEach(backupProduct => {
            if (!backupProduct.name) return;
            const key = backupProduct.name.trim().toLowerCase();
            const localProduct = localProductsMap.get(key);
            if (!localProduct) {
              const productCopy = { ...backupProduct };
              delete productCopy.id;
              productsStoreWrite.add(productCopy);
            } else {
              const localTime = new Date(localProduct.updatedAt || localProduct.createdAt || 0).getTime();
              const backupTime = new Date(backupProduct.updatedAt || backupProduct.createdAt || 0).getTime();
              if (backupTime > localTime) {
                const productCopy = { ...backupProduct };
                productCopy.id = localProduct.id;
                productsStoreWrite.put(productCopy);
              }
            }
          });
        }

        // Process stock history
        if (data.stockHistory && Array.isArray(data.stockHistory)) {
          data.stockHistory.forEach(backupEntry => {
            const key = `${backupEntry.productId}::${backupEntry.type}::${backupEntry.quantity}::${backupEntry.reason}::${backupEntry.createdAt}`;
            if (!localHistorySet.has(key)) {
              const entryCopy = { ...backupEntry };
              delete entryCopy.id;
              historyStoreWrite.add(entryCopy);
            }
          });
        }

        txWrite.oncomplete = () => {
          resolve({ billsAdded, billsUpdated });
        };
        txWrite.onerror = () => reject('Merge transaction failed');
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Adjust stock for a product and record in history
   */
  function adjustProductStock(productId, qtyChange, reason) {
    return new Promise(async (resolve, reject) => {
      try {
        await open();
        const tx = db.transaction([PRODUCTS_STORE, 'stock_history'], 'readwrite');
        const productsStore = tx.objectStore(PRODUCTS_STORE);
        const historyStore = tx.objectStore('stock_history');

        const getReq = productsStore.get(productId);
        getReq.onsuccess = () => {
          const product = getReq.result;
          if (!product) {
            reject('Product not found: ' + productId);
            return;
          }

          const currentStock = parseFloat(product.stockQuantity) || 0;
          const newStock = currentStock + qtyChange;
          product.stockQuantity = newStock;
          product.updatedAt = new Date().toISOString();

          const updateReq = productsStore.put(product);
          updateReq.onsuccess = () => {
            const historyEntry = {
              productId,
              type: qtyChange >= 0 ? 'IN' : 'OUT',
              quantity: Math.abs(qtyChange),
              reason,
              createdAt: new Date().toISOString()
            };
            const addHistoryReq = historyStore.add(historyEntry);
            addHistoryReq.onsuccess = () => {
              if (window.GDriveSync) GDriveSync.triggerSync();
              resolve(newStock);
            };
            addHistoryReq.onerror = () => reject('Failed to write stock history: ' + addHistoryReq.error);
          };
          updateReq.onerror = () => reject('Failed to update product stock: ' + updateReq.error);
        };
        getReq.onerror = () => reject('Failed to get product: ' + getReq.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Get stock history for a product
   */
  function getStockHistory(productId) {
    return new Promise(async (resolve, reject) => {
      try {
        await open();
        const tx = db.transaction('stock_history', 'readonly');
        const store = tx.objectStore('stock_history');
        const index = store.index('productId');
        const request = index.getAll(productId);
        request.onsuccess = () => {
          const history = request.result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          resolve(history);
        };
        request.onerror = () => reject('Failed to get stock history: ' + request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Delete the entire database
   */
  function deleteDatabase() {
    return new Promise((resolve, reject) => {
      if (db) {
        db.close();
        db = null;
      }

      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject('Failed to delete database: ' + request.error);
      request.onblocked = () => reject('Failed to delete database: database is blocked');
    });
  }

  // Public API
  return {
    open,
    addBill,
    getBill,
    getAllBills,
    updateBill,
    deleteBill,
    getNextBillNumber,
    getBillStats,
    searchBills,
    exportData,
    importData,
    mergeData,
    clearAll,
    deleteDatabase,
    addProduct,
    getAllProducts,
    updateProduct,
    deleteProduct,
    getProductByBarcode,
    adjustProductStock,
    getStockHistory
  };
})();
