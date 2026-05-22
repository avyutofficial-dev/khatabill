/**
 * KhataBill - IndexedDB Database Module
 * Handles all bill storage operations using IndexedDB
 */

const KhataBillDB = (() => {
  const DB_NAME = 'KhataBillDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'bills';
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
      };

      request.onsuccess = (event) => {
        db = event.target.result;
        resolve(db);
      };

      request.onerror = (event) => {
        reject('Failed to open database: ' + event.target.error);
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
      const request = store.add(bill);
      request.onsuccess = () => resolve(request.result);
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
      request.onsuccess = () => resolve(request.result);
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
      request.onsuccess = () => resolve();
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
   * Export all data (bills + profile) as JSON
   */
  function exportData() {
    return new Promise(async (resolve, reject) => {
      try {
        await open();
        const store = getStore('readonly');
        const request = store.getAll();
        request.onsuccess = () => {
          const data = {
            version: 1,
            exportDate: new Date().toISOString(),
            profile: JSON.parse(localStorage.getItem('khatabill_profile') || '{}'),
            bills: request.result
          };
          resolve(data);
        };
        request.onerror = () => reject('Export failed');
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

        // Clear existing bills and import new ones
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();

        let imported = 0;
        data.bills.forEach(bill => {
          // Remove auto-increment id to let IndexedDB assign new ones
          const billCopy = { ...bill };
          delete billCopy.id;
          store.add(billCopy);
          imported++;
        });

        tx.oncomplete = () => resolve(imported);
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
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject('Failed to clear data');
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
    clearAll,
    deleteDatabase
  };
})();
