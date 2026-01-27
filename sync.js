#!/usr/bin/env node
/**
 * sync.js - Standalone sync script for GitHub Actions
 * Syncs Infinity Kanban data to tasks.json
 */

const https = require('https');
const fs = require('fs');

const CONFIG = {
  apiKey: process.env.INFINITY_API_KEY,
  workspaceId: '42334',
  boardId: 'LgHZYtLK5KM',
  suzyFolderId: 'nwbsS4EtxnU',
  attributes: {
    name: 'bd59077c-fe5a-4cfa-a6c9-b381ddec3cba',
    altName: '1ae29a79-35d8-4b29-b5e5-41568bfcada7',
    status: 'e408fedf-cad1-4117-93cd-e4df60918da5',
    description: '672ce408-896f-4028-af3d-ad18cfa3bb74'
  },
  statusLabels: {
    'd17a25f0-f952-4aab-a240-6860c7ed7002': 'todo',
    'af621a4e-c371-4500-87a4-a95a0f5210c5': 'in-progress',
    '1955abff-8c63-40bb-9e69-b4f1b5bd5122': 'completed'
  }
};

if (!CONFIG.apiKey) {
  console.error('INFINITY_API_KEY not set');
  process.exit(1);
}

function apiGet(urlPath) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'app.startinfinity.com',
      path: urlPath,
      headers: { 'Authorization': `Bearer ${CONFIG.apiKey}` }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } 
        catch (e) { reject(new Error('Parse error')); }
      });
    }).on('error', reject);
  });
}

function getValue(itemData, attrId) {
  if (!itemData?.values) return null;
  const val = itemData.values.find(v => v.attribute_id === attrId);
  return val?.data || null;
}

async function fetchItem(id) {
  return apiGet(`/api/v2/workspaces/${CONFIG.workspaceId}/boards/${CONFIG.boardId}/items/${id}?expand=values`);
}

async function main() {
  console.log('Syncing from Infinity...');
  
  const result = await apiGet(
    `/api/v2/workspaces/${CONFIG.workspaceId}/boards/${CONFIG.boardId}/items?folder_id=${CONFIG.suzyFolderId}&limit=100`
  );
  
  if (!result.data) {
    console.error('No data');
    process.exit(1);
  }
  
  console.log(`Found ${result.data.length} items`);
  
  const tasks = [];
  for (let i = 0; i < result.data.length; i += 5) {
    const batch = result.data.slice(i, i + 5);
    const results = await Promise.all(batch.map(item => fetchItem(item.id).catch(() => null)));
    
    for (const itemData of results) {
      if (!itemData) continue;
      
      const name = getValue(itemData, CONFIG.attributes.name) || getValue(itemData, CONFIG.attributes.altName);
      if (!name || name === itemData.id) continue;
      
      const statusData = getValue(itemData, CONFIG.attributes.status);
      const statusLabelId = Array.isArray(statusData) ? statusData[0] : statusData;
      const status = CONFIG.statusLabels[statusLabelId];
      if (!status) continue;
      
      tasks.push({
        id: itemData.id,
        name: name.trim(),
        status,
        description: getValue(itemData, CONFIG.attributes.description) || '',
        created: itemData.created_at,
        updated: itemData.updated_at
      });
    }
    console.log(`Processed ${Math.min(i + 5, result.data.length)}/${result.data.length}`);
  }
  
  fs.writeFileSync('tasks.json', JSON.stringify({ updatedAt: new Date().toISOString(), tasks }, null, 2));
  console.log(`✅ Synced ${tasks.length} tasks`);
}

main().catch(err => { console.error(err); process.exit(1); });
