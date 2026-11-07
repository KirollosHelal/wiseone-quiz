import fs from 'fs';
import { StorageService } from '../src/services/storage';

// Node-side localStorage shim so the generator can read config
const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
};

StorageService.saveDatabaseConfig({
  host: 'localhost',
  port: 3306,
  database: 'bible_quiz',
  user: 'root',
  password: '',
  ssl: false,
  tablePrefix: 'cbq_',
  syncMode: 'bridge',
  bridgeUrl: 'http://localhost/wiseone-quiz/bible_sync_test.php',
  bridgeSecret: 'cbq_sec_9a7d4f128e',
  isConnected: false,
} as any);

const php = StorageService.generatePhpSyncBridgeScript();
fs.writeFileSync('bible_sync_test.php', php, 'utf8');
console.log('Written bible_sync_test.php,', php.split('\n').length, 'lines');
