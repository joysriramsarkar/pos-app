const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/app/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// Find and replace the processOfflineSale section
// Step 1: Remove the separate SalesDB.save call
const oldSave = `await SalesDB.save(sale);

    // २. ক্লাউড এপিআই-এর জন্য একদম সঠিক কাঠামোর পেলোড তৈরি (The Critical Fix)`;

const newStart = `// ২. ক্লাউড এপিআই-এর জন্য একদম সঠিক কাঠামোর পেলোড তৈরি`;

if (content.includes(oldSave)) {
  content = content.replace(oldSave, newStart);
  console.log('✓ Step 1: Removed SalesDB.save call');
} else {
  console.log('⚠ Step 1: Could not find exact SalesDB.save pattern, trying alternative...');
  // Try alternative
  content = content.replace(
    'await SalesDB.save(sale);',
    '// Save will be done with saveSaleWithSyncQueue'
  );
}

// Step 2: Replace the SyncQueueDB.add with saveSaleWithSyncQueue
const oldAdd = `    await SyncQueueDB.add({
      id: uuidv4(),
      entityType: 'Sale',
      entityId: sale.id,
      action: 'create',
      payload: JSON.stringify(backendSyncPayload),
      synced: false,
      retryCount: 0,
      createdAt: new Date(),
    });`;

const newAdd = `    const syncQueueItem: SyncQueueItem = {
      id: uuidv4(),
      entityType: 'Sale',
      entityId: sale.id,
      action: 'create',
      payload: JSON.stringify(backendSyncPayload),
      synced: false,
      retryCount: 0,
      createdAt: new Date(),
    };

    // CRITICAL FIX: Save sale and sync queue in a single atomic transaction
    await saveSaleWithSyncQueue(sale, syncQueueItem);`;

if (content.includes(oldAdd)) {
  content = content.replace(oldAdd, newAdd);
  console.log('✓ Step 2: Replaced SyncQueueDB.add with saveSaleWithSyncQueue');
} else {
  console.log('⚠ Step 2: Could not find exact SyncQueueDB.add pattern');
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log('✓ File updated successfully');
