/**
 * DB-backed storage service.
 *
 * MySQL on Hostinger is the single source of truth for ALL data
 * (quizzes, users, submissions, point logs). Every write goes through
 * the Express API (/api/...) which talks to MySQL directly (mysql2).
 *
 * localStorage is used ONLY for per-device preferences that are not
 * shared data: accessibility settings, the logged-in session pointer
 * and the admin database-connection form values.
 */
import { DailyQuiz, User, PointLog, UserQuizSubmission, DatabaseConfig } from '../types/index';
import { INITIAL_QUIZZES } from '../data/seedData';

const STORAGE_KEYS = {
  CURRENT_USER_ID: 'coptic_bible_current_user_id_v2',
  CURRENT_USER_CACHE: 'coptic_bible_current_user_cache_v2',
  SENIOR_SETTINGS: 'coptic_bible_senior_settings_v2',
  DB_CONFIG: 'coptic_bible_db_config_v2',
};

export interface SeniorSettings {
  fontSizeLevel: number;
  highContrast: boolean;
  autoPlayAudio: boolean;
  showVowelMarks: boolean;
}

const DEFAULT_SENIOR_SETTINGS: SeniorSettings = {
  fontSizeLevel: 1,
  highContrast: false,
  autoPlayAudio: false,
  showVowelMarks: true,
};

const DEFAULT_DB_CONFIG: DatabaseConfig = {
  host: '',
  port: 3306,
  database: '',
  user: '',
  password: '',
  ssl: false,
  isConnected: false,
  tablePrefix: 'cbq_',
  syncMode: 'direct',
  // Default bridge path: works for every visitor once bible_sync.php is uploaded
  // to public_html — no need to configure the URL on every device.
  bridgeUrl: 'https://wiseone.beinlive24.com/bible_sync.php',
  bridgeSecret: 'cbq_sec_9a7d4f128e',
};

export const STORAGE_CHANGE_EVENT = 'coptic_bible_data_refresh';

function dispatchChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(STORAGE_CHANGE_EVENT));
  }
}

// ---------------------------------------------------------------------------
// --- Helpers: extract Standing logic that works on an in-memory quiz list ---
// ---------------------------------------------------------------------------

export function getEgyptTodayDate(): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date()); // Formats as YYYY-MM-DD in Cairo
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

export function computeMainTodayQuiz(quizzes: DailyQuiz[], fallback?: DailyQuiz): DailyQuiz {
  const egyptToday = getEgyptTodayDate();

  // 1. Primary: Unlocked quiz whose date matches TODAY in Egypt
  const todayMatch = quizzes.find(q => q.date === egyptToday);
  if (todayMatch) return todayMatch;

  // 2. Secondary: An unlocked quiz (date <= egyptToday) marked as isMainToday
  const unlockedQuizzes = quizzes.filter(q => !q.date || q.date <= egyptToday);
  const explicitMain = unlockedQuizzes.find(q => q.isMainToday);
  if (explicitMain) return explicitMain;

  // 3. Tertiary: The latest unlocked quiz by date / dayNumber
  if (unlockedQuizzes.length > 0) {
    const sorted = [...unlockedQuizzes].sort((a, b) => {
      if (a.date && b.date && a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      return (b.dayNumber || 0) - (a.dayNumber || 0);
    });
    return sorted[0];
  }

  // 4. Fallback if all quizzes are future or empty
  return quizzes[0] || fallback || (INITIAL_QUIZZES[0] as DailyQuiz);
}

export function computePreviousDaysQuizzes(quizzes: DailyQuiz[]): DailyQuiz[] {
  const mainQuiz = computeMainTodayQuiz(quizzes);
  return quizzes
    .filter(q => q.id !== mainQuiz.id)
    .sort((a, b) => (b.dayNumber || 0) - (a.dayNumber || 0));
}

// ---------------------------------------------------------------------------
// --- Fetch helper + API service -------------------------------------------
// ---------------------------------------------------------------------------

async function api<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    // HTML or empty response => the Node API is not running on this host
    // (e.g. static hosting). Callers treat BAD_JSON as "try the PHP bridge".
    const err: any = new Error('رد غير صالح من الخادم. تأكد أن السيرفر يعمل على المنفذ الصحيح.');
    err.code = 'BAD_JSON';
    throw err;
  }
  if (data && data.success === false) {
    const err: any = new Error(data.message || data.error || 'فشل الاتصال بقاعدة البيانات.');
    err.apiData = data;
    throw err;
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// --- PHP Bridge transport (for static hosting: Bible-sync bridge on PHP/MySQL)
// ---------------------------------------------------------------------------

const BUILTIN_ADMIN: any = {
  id: 'user-admin-kirillos',
  fullName: 'كيرلس هلال (الخادم المسؤول)',
  email: 'kirilloshelal@gmail.com',
  password: '123456789',
  phone: '01220001111',
  ageGroup: 'servant',
  role: 'admin',
  totalPoints: 200,
  quizzesSolved: 12,
  currentStreak: 12,
  registeredBy: 'self',
  createdAt: '2026-10-01',
  submissions: [],
};

function matchesBuiltinAdmin(identifier: string, password: string): boolean {
  const cleanId = String(identifier || '').trim().toLowerCase();
  const idMatch = cleanId === BUILTIN_ADMIN.email.toLowerCase()
    || String(identifier || '').replace(/\D/g, '') === BUILTIN_ADMIN.phone;
  return idMatch && String(password || '').trim() === BUILTIN_ADMIN.password;
}

const isBridgeConfigured = (): boolean =>
  Boolean((StorageService.getDatabaseConfig().bridgeUrl || '').trim());

let pullCache: { at: number; data: { quizzes: any[]; users: any[]; pointLogs: any[] } } | null = null;

async function bridgeCall<T = any>(action: string, payload: Record<string, any> = {}): Promise<T> {
  const config = StorageService.getDatabaseConfig();
  const url = (config.bridgeUrl || '').trim();
  if (!url) {
    const err: any = new Error(
      'لم يتم إعداد جسر PHP بعد. سجّل الدخول بحساب المشرف العام ثم من لوحة التحكم > تبويب قاعدة البيانات > تبويب «جسر PHP المباشر»: نزّل ملف bible_sync.php وارفعه داخل public_html على Hostinger، ثم الصق رابطه في خانة الرابط واضغط «اختبار الاتصال».'
    );
    err.code = 'NO_BRIDGE';
    throw err;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, secret: config.bridgeSecret || '', ...payload }),
    });
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`رد غير صالح من ملف الجسر: ${text.substring(0, 120)}`);
    }
    if (data && data.success === false) {
      throw new Error(data.message || data.error || 'فشل تنفيذ الحدث عبر جسر PHP.');
    }
    return data as T;
  } catch (err: any) {
    // Fetch-level failures (network/CORS) — surface a clear Arabic message
    if (err instanceof TypeError) {
      throw new Error(`تعذر الوصول إلى ملف الجسر على «${(StorageService.getDatabaseConfig().bridgeUrl || '').trim()}». تأكد من صحة الرابط ومن رفع bible_sync.php على نفس الاستضافة.`);
    }
    throw err;
  }
}

async function bridgePullAll(force = false): Promise<{ quizzes: any[]; users: any[]; pointLogs: any[] }> {
  if (!force && pullCache && Date.now() - pullCache.at < 2500) {
    return pullCache.data;
  }
  const d = await bridgeCall<any>('pull');
  const data = {
    quizzes: d.quizzes || [],
    users: d.users || [],
    pointLogs: d.pointLogs || d.logs || [],
  };
  pullCache = { at: Date.now(), data };
  return data;
}

function invalidatePullCache(): void {
  pullCache = null;
}

async function withFallback<T>(
  serverCall: () => Promise<T>,
  bridgeAction: string,
  bridgePayload: Record<string, any> = {}
): Promise<T> {
  try {
    return await serverCall();
  } catch (err: any) {
    if (err?.code === 'BAD_JSON') {
      // No Node API on this host → use the PHP bridge (full CRUD on MySQL)
      const result = await bridgeCall<any>(bridgeAction, bridgePayload);
      invalidatePullCache();
      return (result?.result !== undefined ? result.result : result) as T;
    }
    throw err;
  }
}

export const StorageService = {
  // --- Data read/write — Node API when available, PHP bridge on static hosts ---

  /** Fetch all quizzes from the database. */
  async getQuizzes(): Promise<DailyQuiz[]> {
    const fetchQuizzes = async (): Promise<DailyQuiz[]> => {
      const data = await api<{ quizzes: DailyQuiz[] }>('/api/quizzes');
      return (data.quizzes || []).map((q, idx) => ({ ...q, dayNumber: q.dayNumber || (idx + 1) }));
    };
    const fetchQuizzesBridge = async (): Promise<DailyQuiz[]> => {
      const d = await bridgePullAll();
      return (d.quizzes || []).map((q: any, idx: number) => ({
        ...q,
        dayNumber: q.dayNumber || (idx + 1),
        verses: q.versesJson ? (typeof q.versesJson === 'string' ? JSON.parse(q.versesJson) : q.versesJson) : (q.verses || []),
        questions: q.questionsJson ? (typeof q.questionsJson === 'string' ? JSON.parse(q.questionsJson) : q.questionsJson) : (q.questions || []),
      }));
    };
    try {
      return await fetchQuizzes();
    } catch (err: any) {
      if (err?.code === 'BAD_JSON') return await fetchQuizzesBridge();
      throw err;
    }
  },

  /** Fetch all users (with submissions) from the database. */
  async getUsers(): Promise<User[]> {
    const fetchUsers = async (): Promise<User[]> => {
      const data = await api<{ users: User[] }>('/api/users');
      return data.users || [];
    };
    const fetchUsersBridge = async (): Promise<User[]> => {
      const d = await bridgePullAll();
      return d.users || [];
    };
    try {
      return await fetchUsers();
    } catch (err: any) {
      if (err?.code === 'BAD_JSON') return await fetchUsersBridge();
      throw err;
    }
  },

  /** Fetch all point logs from the database. */
  async getPointLogs(): Promise<PointLog[]> {
    const fetchLogs = async (): Promise<PointLog[]> => {
      const data = await api<{ logs: PointLog[] }>('/api/point-logs');
      return data.logs || [];
    };
    const fetchLogsBridge = async (): Promise<PointLog[]> => {
      const d = await bridgePullAll();
      return (d.pointLogs || []).map((l: any) => ({
        id: l.id,
        userId: l.userId,
        userName: l.userName,
        change: Number(l.change ?? l.pointsChange) || 0,
        reason: l.reason,
        date: l.date || String(l.createdAt || ''),
        adminName: l.adminName,
      }));
    };
    try {
      return await fetchLogs();
    } catch (err: any) {
      if (err?.code === 'BAD_JSON') return await fetchLogsBridge();
      throw err;
    }
  },

  /** Create or update one quiz directly in the database. */
  async saveOrUpdateQuiz(quiz: DailyQuiz): Promise<void> {
    await withFallback(
      () => api('/api/quizzes', { method: 'POST', body: JSON.stringify({ quiz }) }),
      'save_quiz',
      { quiz }
    );
    dispatchChange();
  },

  /** Set which quiz is the main "today" (exclusive on the DB). */
  async setMainDay(quizId: string): Promise<void> {
    await withFallback(
      () => api('/api/quizzes/set-main', { method: 'POST', body: JSON.stringify({ quizId }) }),
      'set_main',
      { quizId }
    );
    dispatchChange();
  },

  /** Delete one quiz from the database. */
  async deleteQuiz(quizId: string): Promise<void> {
    await withFallback(
      () => api(`/api/quizzes/${encodeURIComponent(quizId)}`, { method: 'DELETE' }),
      'delete_quiz',
      { quizId }
    );
    dispatchChange();
  },

  // --- Users & Authentication (DB-backed) -----------------------------

  /** Authenticate with email/phone + password against the database. */
  async authenticate(identifier: string, pass: string): Promise<{ success: boolean; user?: User; error?: string; message?: string }> {
    try {
      const data = await api<{ user: User; message?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password: pass }),
      });
      this.cacheCurrentUser(data.user);
      dispatchChange();
      return { success: true, user: data.user, message: (data as any).message };
    } catch (err: any) {
      if (err?.code !== 'BAD_JSON') {
        return { success: false, error: err.message || 'فشل تسجيل الدخول' };
      }

      // --- Static hosting (no Node API): PHP bridge or setup mode ---
      if (isBridgeConfigured()) {
        try {
          const d = await bridgeCall<{ user: User; message?: string }>('login', { identifier, password: pass });
          this.cacheCurrentUser(d.user);
          dispatchChange();
          return { success: true, user: d.user, message: d.message };
        } catch (e2: any) {
          return { success: false, error: e2?.message || 'فشل تسجيل الدخول عبر الجسر' };
        }
      }

      // Setup mode: only the built-in admin can sign in before any DB/bridge setup
      if (matchesBuiltinAdmin(identifier, pass)) {
        this.cacheCurrentUser(BUILTIN_ADMIN);
        dispatchChange();
        return {
          success: true,
          user: BUILTIN_ADMIN,
          message: 'وضع التهيئة: تم الدخول بحساب المشرف العام. من لوحة التحكم > تبويب قاعدة البيانات > تبويب «جسر PHP المباشر»: نزّل ملف bible_sync.php وارفعه على public_html ثم أدخل رابطه واضغط اختبار.',
        };
      }
      return {
        success: false,
        error: 'لا يمكن تسجيل دخول حسابات المتسابقين قبل ربط قاعدة البيانات. سجّل الدخول بحساب المشرف العام أولاً لضبط الاتصال بالقاعدة.',
      };
    }
  },

  /** Create a new user in the database (self signup or admin registration). */
  async addUser(user: User): Promise<User> {
    const data = await withFallback(
      () => api<{ user: User }>('/api/users', { method: 'POST', body: JSON.stringify({ user }) }),
      'save_user',
      { user }
    );
    dispatchChange();
    return data?.user || user;
  },

  /** Update an existing user directly in the database. */
  async updateUser(user: User): Promise<void> {
    await withFallback(
      () => api(`/api/users/${encodeURIComponent(user.id)}`, { method: 'PUT', body: JSON.stringify({ user }) }),
      'update_user',
      { user }
    );
    dispatchChange();
  },

  /** Delete a user from the database. */
  async deleteUser(userId: string): Promise<void> {
    await withFallback(
      () => api(`/api/users/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
      'delete_user',
      { userId }
    );
    dispatchChange();
  },

  // --- Session (per-device pointer only) ------------------------------

  getCurrentUser(): User | null {
    // Visitor / Guest mode by default — DO NOT automatically sign in as admin!
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_CACHE);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  },

  cacheCurrentUser(user: User | null): void {
    if (typeof localStorage === 'undefined') return;
    if (user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, user.id);
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_CACHE, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_CACHE);
    }
  },

  setCurrentUser(user: User | null): void {
    this.cacheCurrentUser(user);
    dispatchChange();
  },

  logout(): void {
    this.cacheCurrentUser(null);
    dispatchChange();
  },

  // --- Points Adjustment by Admin (DB transaction) --------------------

  async adjustUserPoints(userId: string, pointsDelta: number, reason: string, adminName: string): Promise<void> {
    await withFallback(
      () => api('/api/points', {
        method: 'POST',
        body: JSON.stringify({ userId, delta: pointsDelta, reason, adminName }),
      }),
      'points',
      { userId, delta: pointsDelta, reason, adminName }
    );
    dispatchChange();
  },

  // --- Quiz Submission (DB transaction, first attempt only) -----------

  async submitQuiz(userId: string, submission: UserQuizSubmission): Promise<void> {
    await withFallback(
      () => api('/api/submissions', {
        method: 'POST',
        body: JSON.stringify({ userId, submission }),
      }),
      'submission',
      { userId, submission }
    );
    dispatchChange();
  },

  // --- Database Connection (stored server-side in data/db-config.json) --

  /**
   * Save connection info, test it, create tables and seed initial quizzes.
   * On static hosting (no Node API) this stores the config per-device and
   * creates the tables through the PHP bridge instead.
   */
  async connectDatabase(config: DatabaseConfig, seedInitialData = true): Promise<string> {
    const payload = {
      config: {
        host: config.host,
        port: config.port || 3306,
        database: config.database,
        user: config.user,
        password: config.password,
        ssl: config.ssl,
        tablePrefix: config.tablePrefix || 'cbq_',
        bridgeMode: config.syncMode === 'bridge',
        bridgeUrl: config.bridgeUrl,
        bridgeSecret: config.bridgeSecret,
      },
      seedQuizzes: seedInitialData ? INITIAL_QUIZZES : [],
    };
    try {
      const data = await api<{ message: string }>('/api/db/config', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      this.saveDatabaseConfig({ ...config, isConnected: true });
      dispatchChange();
      return data.message;
    } catch (err: any) {
      if (err?.code !== 'BAD_JSON') throw err;
      // Static hosting: remember locally + create tables via the PHP bridge
      this.saveDatabaseConfig({ ...config, syncMode: 'bridge', isConnected: true });
      try {
        const d = await bridgeCall<any>('sync_tables');
        dispatchChange();
        return d.message || 'تم إنشاء الجداول عبر جسر PHP بنجاح.';
      } catch (e2: any) {
        if (e2?.code === 'NO_BRIDGE') {
          dispatchChange();
          return 'تم حفظ الإعدادات محلياً. نزّل ملف bible_sync.php وارفعه على public_html ثم أضف رابطه في تبويب «جسر PHP المباشر» لتفعيل الربط.';
        }
        throw e2;
      }
    }
  },

  /** Check if the server already has a stored, working connection. */
  async getConnectionStatus(): Promise<{ saved: boolean; config?: DatabaseConfig }> {
    const data = await api<{ saved: boolean; config: DatabaseConfig | null }>('/api/db/config');
    return { saved: data.saved, config: data.config || undefined };
  },

  // --- Egypt Timezone (Africa/Cairo) & Date Logic ---------------------

  getEgyptTodayDate(): string {
    return getEgyptTodayDate();
  },

  isQuizLockedFuture(quizDate?: string): boolean {
    if (!quizDate) return false;
    const egyptToday = this.getEgyptTodayDate();
    return quizDate > egyptToday;
  },

  isQuizTodayInEgypt(quizDate?: string): boolean {
    if (!quizDate) return false;
    return quizDate === this.getEgyptTodayDate();
  },

  // --- Senior Settings (per-device, stays in localStorage) ------------

  getSeniorSettings(): SeniorSettings {
    const raw = localStorage.getItem(STORAGE_KEYS.SENIOR_SETTINGS);
    if (!raw) return DEFAULT_SENIOR_SETTINGS;
    try {
      return { ...DEFAULT_SENIOR_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_SENIOR_SETTINGS;
    }
  },

  saveSeniorSettings(settings: SeniorSettings): void {
    localStorage.setItem(STORAGE_KEYS.SENIOR_SETTINGS, JSON.stringify(settings));
    if (typeof document !== 'undefined') {
      if (settings.highContrast) {
        document.body.classList.add('high-contrast');
      } else {
        document.body.classList.remove('high-contrast');
      }
    }
    dispatchChange();
  },

  // --- Database Configuration form values (per-device convenience) ----

  getDatabaseConfig(): DatabaseConfig {
    if (typeof localStorage === 'undefined') return DEFAULT_DB_CONFIG;
    const raw = localStorage.getItem(STORAGE_KEYS.DB_CONFIG);
    if (!raw) return DEFAULT_DB_CONFIG;
    try {
      return { ...DEFAULT_DB_CONFIG, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_DB_CONFIG;
    }
  },

  saveDatabaseConfig(config: DatabaseConfig): void {
    localStorage.setItem(STORAGE_KEYS.DB_CONFIG, JSON.stringify(config));
    dispatchChange();
  },

  // Export SQL script for phpMyAdmin import
  generatePhpMyAdminSql(): string {
    const config = this.getDatabaseConfig();
    const prefix = config.tablePrefix || 'cbq_';

    return `-- ======================================================
-- مسابقة الكتاب المقدس اليومية - الكنيسة القبطية الأرثوذكسية
-- سكربت إنشاء الجداول وتصدير البيانات لـ phpMyAdmin (Hostinger)
-- تم التوليد بتاريخ: ${new Date().toLocaleString('ar-EG')}
-- قاعدة البيانات: \`${config.database}\`
-- ======================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. جدول المستخدمين (Users)
CREATE TABLE IF NOT EXISTS \`${prefix}users\` (
  \`id\` VARCHAR(64) NOT NULL,
  \`fullName\` VARCHAR(191) NOT NULL,
  \`email\` VARCHAR(191) DEFAULT NULL,
  \`password\` VARCHAR(191) DEFAULT NULL,
  \`phone\` VARCHAR(32) NOT NULL,
  \`ageGroup\` ENUM('senior', 'youth', 'family', 'servant') DEFAULT 'senior',
  \`role\` ENUM('admin', 'user') DEFAULT 'user',
  \`totalPoints\` INT NOT NULL DEFAULT 0,
  \`quizzesSolved\` INT NOT NULL DEFAULT 0,
  \`currentStreak\` INT NOT NULL DEFAULT 0,
  \`registeredBy\` ENUM('self', 'admin') DEFAULT 'self',
  \`servantNotes\` TEXT DEFAULT NULL,
  \`createdAt\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`idx_email\` (\`email\`),
  KEY \`idx_phone\` (\`phone\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. جدول الأيام والمسابقات (Daily Quizzes)
CREATE TABLE IF NOT EXISTS \`${prefix}daily_quizzes\` (
  \`id\` VARCHAR(64) NOT NULL,
  \`dayNumber\` INT NOT NULL,
  \`dayLabel\` VARCHAR(100) DEFAULT NULL,
  \`date\` DATE NOT NULL,
  \`isMainToday\` TINYINT(1) DEFAULT 0,
  \`testament\` ENUM('old', 'new') DEFAULT 'new',
  \`bookName\` VARCHAR(100) NOT NULL,
  \`chapterNumber\` INT NOT NULL,
  \`title\` VARCHAR(255) NOT NULL,
  \`keyVerse\` TEXT DEFAULT NULL,
  \`reflection\` TEXT DEFAULT NULL,
  \`audioUrl\` TEXT NOT NULL,
  \`audioDuration\` VARCHAR(20) DEFAULT '5:00',
  \`versesJson\` LONGTEXT NOT NULL,
  \`questionsJson\` LONGTEXT NOT NULL,
  \`totalPoints\` INT NOT NULL DEFAULT 20,
  \`published\` TINYINT(1) DEFAULT 1,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`idx_day_number\` (\`dayNumber\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. جدول تسليم الإجابات (Submissions)
CREATE TABLE IF NOT EXISTS \`${prefix}submissions\` (
  \`id\` INT AUTO_INCREMENT PRIMARY KEY,
  \`userId\` VARCHAR(64) NOT NULL,
  \`quizId\` VARCHAR(64) NOT NULL,
  \`dayNumber\` INT DEFAULT NULL,
  \`score\` INT NOT NULL DEFAULT 0,
  \`maxScore\` INT NOT NULL DEFAULT 0,
  \`answersJson\` LONGTEXT NOT NULL,
  \`status\` ENUM('graded', 'needs_review') DEFAULT 'graded',
  \`submittedAt\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY \`idx_user_quiz\` (\`userId\`, \`quizId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. جدول سجل النقاط والمكافآت (Point Logs)
CREATE TABLE IF NOT EXISTS \`${prefix}point_logs\` (
  \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
  \`userId\` VARCHAR(64) NOT NULL,
  \`userName\` VARCHAR(191) NOT NULL,
  \`pointsChange\` INT NOT NULL,
  \`reason\` TEXT NOT NULL,
  \`adminName\` VARCHAR(191) NOT NULL,
  \`createdAt\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ======================================================
-- إدخال بيانات المستخدم الأساسي (أدمن كيرلس هلال)
-- ======================================================
INSERT INTO \`${prefix}users\`
  (\`id\`, \`fullName\`, \`email\`, \`password\`, \`phone\`, \`ageGroup\`, \`role\`, \`totalPoints\`, \`quizzesSolved\`, \`currentStreak\`, \`registeredBy\`)
VALUES
  ('user-admin-kirillos', 'كيرلس هلال (الخادم المسؤول)', 'kirilloshelal@gmail.com', '123456789', '01220001111', 'servant', 'admin', 200, 12, 12, 'self')
ON DUPLICATE KEY UPDATE \`password\`='123456789', \`role\`='admin';

SET FOREIGN_KEY_CHECKS = 1;
-- ======================================================
-- انتهى السكربت. جاهز للاستيراد في phpMyAdmin
-- ======================================================
`;
  },

  resetSession(): void {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_CACHE);
    dispatchChange();
  },

  // Export PHP Bridge script that runs locally on Hostinger with zero firewall issues.
  // This is a FULL CRUD bridge: login, users, quizzes, submissions, points — everything
  // touches Hostinger's MySQL directly through PDO (localhost) so no Node.js is needed
  // and no Remote MySQL firewall rules have to be opened.
  generatePhpSyncBridgeScript(): string {
    const config = this.getDatabaseConfig();
    const prefix = config.tablePrefix || 'cbq_';
    const secret = config.bridgeSecret || 'cbq_sec_9a7d4f128e';
    const dbName = config.database || 'u123456789_bible_quiz';
    const dbUser = config.user || 'u123456789_admin';
    const dbPass = config.password || '';
    const dbHost = (config.host && config.host !== 'localhost' && !config.host.startsWith('34.96')) ? config.host : 'localhost';

    return `<?php
/**
 * Bible Quiz — جسر الربط المباشر مع قاعدة بيانات Hostinger (CRUD كامل)
 * 1) ارفع هذا الملف داخل public_html على Hostinger (مثال: public_html/bible_sync.php)
 * 2) ضع رابطه في: لوحة التحكم > تبويب قاعدة البيانات > جسر PHP المباشر
 * يدعم: login, save_user, update_user, delete_user, save_quiz, set_main,
 *       delete_quiz, submission, points, pull, push, sync_tables, test
 */
error_reporting(0);
ini_set('display_errors', '0');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Bridge-Secret, Authorization');
header('Content-Type: application/json; charset=UTF-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$EXPECTED_SECRET = '${secret}';
$providedSecret = $_SERVER['HTTP_X_BRIDGE_SECRET'] ?? $_GET['secret'] ?? $_POST['secret'] ?? '';
$rawInput = file_get_contents('php://input');
$jsonInput = json_decode($rawInput, true);
if (!is_array($jsonInput)) { $jsonInput = []; }
if ($providedSecret === '' && !empty($jsonInput['secret'])) { $providedSecret = $jsonInput['secret']; }
if ($providedSecret !== $EXPECTED_SECRET) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'رمز الأمان السري غير صحيح.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$dbHost = '${dbHost}';
$dbName = '${dbName}';
$dbUser = '${dbUser}';
$dbPass = '${dbPass}';
$prefix = '${prefix}';

$pdoOptions = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4",
];

try {
    // داخل شبكة Hostinger اسم المضيف الأصح هو localhost دائماً
    $pdo = new PDO("mysql:host=localhost;dbname=" . $dbName . ";charset=utf8mb4", $dbUser, $dbPass, $pdoOptions);
} catch (PDOException $e1) {
    try {
        $pdo = new PDO("mysql:host=" . $dbHost . ";dbname=" . $dbName . ";charset=utf8mb4", $dbUser, $dbPass, $pdoOptions);
    } catch (PDOException $e2) {
        echo json_encode(['success' => false, 'message' => 'فشل الاتصال بقاعدة البيانات على Hostinger: ' . $e2->getMessage()], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

/**
 * Helpers — نفس منطق الـ Node API بالضبط حتى تتطابق البيانات الواصلة للتطبيق
 */
function bridgeSafeParse($raw, $fallback = []) {
    $decoded = json_decode((string)$raw, true);
    return is_array($decoded) ? $decoded : $fallback;
}

function bridgeNowMysql() {
    return gmdate('Y-m-d H:i:s');
}

function normalizeQuizRow($q) {
    $totalPoints = (int)($q['totalPoints'] ?? 20);
    if ($totalPoints <= 0) { $totalPoints = 20; }
    $published = ($q['published'] === null || $q['published'] === '') ? true : (bool)((int)($q['published'] ?? 1));
    // When normalizing a raw client payload (no *Json columns staged), fall back to the object fields
    $versesRaw = isset($q['versesJson']) ? ($q['versesJson'] ?? '[]') : json_encode(!empty($q['verses']) && is_array($q['verses']) ? $q['verses'] : [], JSON_UNESCAPED_UNICODE);
    $questionsRaw = isset($q['questionsJson']) ? ($q['questionsJson'] ?? '[]') : json_encode(!empty($q['questions']) && is_array($q['questions']) ? $q['questions'] : [], JSON_UNESCAPED_UNICODE);
    return [
        'id' => (string)($q['id'] ?? ''),
        'dayNumber' => (int)($q['dayNumber'] ?? 0),
        'dayLabel' => $q['dayLabel'] ?? null,
        'date' => substr((string)($q['date'] ?? ''), 0, 10),
        'isMainToday' => (bool)((int)($q['isMainToday'] ?? 0)),
        'testament' => ($q['testament'] ?? 'new') ?: 'new',
        'bookName' => (string)($q['bookName'] ?? ''),
        'chapterNumber' => (int)($q['chapterNumber'] ?? 0),
        'title' => (string)($q['title'] ?? ''),
        'keyVerse' => ($q['keyVerse'] ?? '') ?? '',
        'reflection' => ($q['reflection'] ?? '') ?? '',
        'audioUrl' => (string)($q['audioUrl'] ?? ''),
        'audioDuration' => ($q['audioDuration'] ?? '') ?: '5:00',
        'verses' => bridgeSafeParse($versesRaw, []),
        'questions' => bridgeSafeParse($questionsRaw, []),
        'totalPoints' => $totalPoints,
        'published' => $published,
    ];
}

function normalizeSubmissionRow($s) {
    $parsed = bridgeSafeParse($s['answersJson'] ?? '{}', []);
    return [
        'quizId' => (string)($s['quizId'] ?? ''),
        'dayNumber' => !empty($s['dayNumber']) ? (int)$s['dayNumber'] : null,
        'date' => substr((string)($s['submittedAt'] ?? ''), 0, 10),
        'submittedAt' => (string)($s['submittedAt'] ?? ''),
        'score' => (int)($s['score'] ?? 0),
        'maxScore' => (int)($s['maxScore'] ?? 0),
        'answers' => isset($parsed['answers']) && is_array($parsed['answers']) ? $parsed['answers'] : $parsed,
        'status' => ($s['status'] ?? 'graded') ?: 'graded',
        'adminNotes' => $parsed['adminNotes'] ?? null,
    ];
}

function normalizeUserRow($u, $subs = []) {
    return [
        'id' => (string)($u['id'] ?? ''),
        'fullName' => (string)($u['fullName'] ?? ''),
        'email' => ($u['email'] ?? null) !== '' ? $u['email'] : null,
        'password' => ($u['password'] ?? null) !== '' ? $u['password'] : null,
        'phone' => (string)($u['phone'] ?? ''),
        'ageGroup' => ($u['ageGroup'] ?? 'senior') ?: 'senior',
        'role' => ($u['role'] ?? 'user') ?: 'user',
        'totalPoints' => (int)($u['totalPoints'] ?? 0),
        'quizzesSolved' => (int)($u['quizzesSolved'] ?? 0),
        'currentStreak' => (int)($u['currentStreak'] ?? 0),
        'registeredBy' => ($u['registeredBy'] ?? 'self') ?: 'self',
        'servantNotes' => ($u['servantNotes'] ?? null) !== '' ? ($u['servantNotes'] ?? null) : null,
        'createdAt' => substr((string)($u['createdAt'] ?? ''), 0, 10),
        'submissions' => $subs,
    ];
}

function loadSubmissions($pdo, $prefix, $userId = null) {
    if ($userId === null) {
        return $pdo->query("SELECT * FROM {$prefix}submissions ORDER BY submittedAt ASC")->fetchAll();
    }
    $stmt = $pdo->prepare("SELECT * FROM {$prefix}submissions WHERE userId = ? ORDER BY submittedAt ASC");
    $stmt->execute([$userId]);
    return $stmt->fetchAll();
}

function loadUsersWithSubmissions($pdo, $prefix) {
    $userRows = $pdo->query("SELECT * FROM {$prefix}users ORDER BY totalPoints DESC")->fetchAll();
    $subRows = loadSubmissions($pdo, $prefix);
    $subsByUser = [];
    foreach ($subRows as $s) {
        $key = (string)$s['userId'];
        if (!isset($subsByUser[$key])) { $subsByUser[$key] = []; }
        $subsByUser[$key][] = normalizeSubmissionRow($s);
    }
    $out = [];
    foreach ($userRows as $u) {
        $out[] = normalizeUserRow($u, isset($subsByUser[$u['id']]) ? $subsByUser[$u['id']] : []);
    }
    return $out;
}

function ensureTables($pdo, $prefix) {
    $ddl = [
        "CREATE TABLE IF NOT EXISTS {$prefix}users (
            id VARCHAR(64) NOT NULL PRIMARY KEY,
            fullName VARCHAR(191) NOT NULL,
            email VARCHAR(191) DEFAULT NULL,
            password VARCHAR(191) DEFAULT NULL,
            phone VARCHAR(32) NOT NULL DEFAULT '',
            ageGroup ENUM('senior', 'youth', 'family', 'servant') DEFAULT 'senior',
            role ENUM('admin', 'user') DEFAULT 'user',
            totalPoints INT NOT NULL DEFAULT 0,
            quizzesSolved INT NOT NULL DEFAULT 0,
            currentStreak INT NOT NULL DEFAULT 0,
            registeredBy ENUM('self', 'admin') DEFAULT 'self',
            servantNotes TEXT DEFAULT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            KEY idx_email (email),
            KEY idx_phone (phone)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS {$prefix}daily_quizzes (
            id VARCHAR(64) NOT NULL PRIMARY KEY,
            dayNumber INT NOT NULL,
            dayLabel VARCHAR(100) DEFAULT NULL,
            date DATE NOT NULL,
            isMainToday TINYINT(1) DEFAULT 0,
            testament ENUM('old', 'new') DEFAULT 'new',
            bookName VARCHAR(100) NOT NULL,
            chapterNumber INT NOT NULL DEFAULT 0,
            title VARCHAR(255) NOT NULL,
            keyVerse TEXT DEFAULT NULL,
            reflection TEXT DEFAULT NULL,
            audioUrl TEXT NOT NULL,
            audioDuration VARCHAR(20) DEFAULT '5:00',
            versesJson LONGTEXT NOT NULL,
            questionsJson LONGTEXT NOT NULL,
            totalPoints INT NOT NULL DEFAULT 20,
            published TINYINT(1) DEFAULT 1,
            UNIQUE KEY idx_day_number (dayNumber)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS {$prefix}submissions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            userId VARCHAR(64) NOT NULL,
            quizId VARCHAR(64) NOT NULL,
            dayNumber INT DEFAULT NULL,
            score INT NOT NULL DEFAULT 0,
            maxScore INT NOT NULL DEFAULT 0,
            answersJson LONGTEXT NOT NULL,
            status ENUM('graded', 'needs_review') DEFAULT 'graded',
            submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            KEY idx_user_quiz (userId, quizId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS {$prefix}point_logs (
            id VARCHAR(64) NOT NULL PRIMARY KEY,
            userId VARCHAR(64) NOT NULL,
            userName VARCHAR(191) NOT NULL,
            pointsChange INT NOT NULL,
            reason TEXT NOT NULL,
            adminName VARCHAR(191) NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    ];
    // ملاحظة مهمة: PDO لا يدعم تنفيذ عدة استعلامات CREATE في exec واحد، لذلك تنفذ واحدة واحدة
    foreach ($ddl as $stmt) {
        $pdo->exec($stmt);
    }
    $stmt = $pdo->prepare("INSERT INTO {$prefix}users (id, fullName, email, password, phone, ageGroup, role, totalPoints, quizzesSolved, currentStreak, registeredBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'self') ON DUPLICATE KEY UPDATE password='123456789', role='admin'");
    $stmt->execute(['user-admin-kirillos', 'كيرلس هلال (الخادم المسؤول)', 'kirilloshelal@gmail.com', '123456789', '01220001111', 'servant', 'admin', 200, 12, 12]);
    return true;
}

function upsertUser($pdo, $prefix, $u) {
    if (empty($u['id']) || empty($u['fullName'])) { return false; }
    $stmt = $pdo->prepare("INSERT INTO {$prefix}users (id, fullName, email, password, phone, ageGroup, role, totalPoints, quizzesSolved, currentStreak, registeredBy, servantNotes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE fullName=VALUES(fullName), email=VALUES(email), password=COALESCE(VALUES(password), password), phone=VALUES(phone), ageGroup=VALUES(ageGroup), role=VALUES(role), totalPoints=VALUES(totalPoints), quizzesSolved=VALUES(quizzesSolved), currentStreak=VALUES(currentStreak), registeredBy=VALUES(registeredBy), servantNotes=VALUES(servantNotes)");
    $stmt->execute([
        (string)$u['id'], (string)$u['fullName'],
        !empty($u['email']) ? (string)$u['email'] : null,
        !empty($u['password']) ? (string)$u['password'] : null,
        (string)($u['phone'] ?? ''),
        ($u['ageGroup'] ?? 'senior') ?: 'senior',
        ($u['role'] ?? 'user') ?: 'user',
        (int)($u['totalPoints'] ?? 0),
        (int)($u['quizzesSolved'] ?? 0),
        (int)($u['currentStreak'] ?? 0),
        ($u['registeredBy'] ?? 'self') ?: 'self',
        !empty($u['servantNotes']) ? (string)$u['servantNotes'] : null,
        bridgeNowMysql(),
    ]);
    return true;
}

function upsertQuiz($pdo, $prefix, $q) {
    if (empty($q['id']) || empty($q['bookName']) || empty($q['title'])) { return false; }
    $isMain = !empty($q['isMainToday']) ? 1 : 0;
    if ($isMain) {
        // اليوم الرئيسي حصري: إخفاء المعلَم عن كل الأيام الأخرى أولاً
        $pdo->exec("UPDATE {$prefix}daily_quizzes SET isMainToday = 0");
    }
    // replace any row on the same dayNumber so day numbers stay unique
    $dupStmt = $pdo->prepare("SELECT id FROM {$prefix}daily_quizzes WHERE dayNumber = ? AND id <> ?");
    $dupStmt->execute([(int)($q['dayNumber'] ?? 0), (string)$q['id']]);
    foreach ($dupStmt->fetchAll() as $row) {
        $pdo->prepare("DELETE FROM {$prefix}daily_quizzes WHERE id = ?")->execute([$row['id']]);
    }
    $stmt = $pdo->prepare("INSERT INTO {$prefix}daily_quizzes (id, dayNumber, dayLabel, date, isMainToday, testament, bookName, chapterNumber, title, keyVerse, reflection, audioUrl, audioDuration, versesJson, questionsJson, totalPoints, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE dayNumber=VALUES(dayNumber), dayLabel=VALUES(dayLabel), date=VALUES(date), isMainToday=VALUES(isMainToday), testament=VALUES(testament), bookName=VALUES(bookName), chapterNumber=VALUES(chapterNumber), title=VALUES(title), keyVerse=VALUES(keyVerse), reflection=VALUES(reflection), audioUrl=VALUES(audioUrl), audioDuration=VALUES(audioDuration), versesJson=VALUES(versesJson), questionsJson=VALUES(questionsJson), totalPoints=VALUES(totalPoints), published=VALUES(published)");
    $stmt->execute([
        (string)$q['id'], (int)($q['dayNumber'] ?? 0),
        !empty($q['dayLabel']) ? (string)$q['dayLabel'] : null,
        (string)($q['date'] ?? gmdate('Y-m-d')),
        $isMain,
        ($q['testament'] ?? 'new') ?: 'new',
        (string)$q['bookName'], (int)($q['chapterNumber'] ?? 0),
        (string)$q['title'],
        !empty($q['keyVerse']) ? (string)$q['keyVerse'] : null,
        !empty($q['reflection']) ? (string)$q['reflection'] : null,
        (string)($q['audioUrl'] ?? ''),
        ($q['audioDuration'] ?? '') ?: '5:00',
        json_encode(!empty($q['verses']) && is_array($q['verses']) ? $q['verses'] : [], JSON_UNESCAPED_UNICODE),
        json_encode(!empty($q['questions']) && is_array($q['questions']) ? $q['questions'] : [], JSON_UNESCAPED_UNICODE),
        max(1, (int)($q['totalPoints'] ?? 20)),
        isset($q['published']) && $q['published'] === false ? 0 : 1,
    ]);
    return true;
}

$BUILTIN_ADMIN_EMAIL = 'kirilloshelal@gmail.com';
$BUILTIN_ADMIN_PHONE = '01220001111';
$BUILTIN_ADMIN_PASSWORD = '123456789';

$BUILTIN_USER = normalizeUserRow([
    'id' => 'user-admin-kirillos',
    'fullName' => 'كيرلس هلال (الخادم المسؤول)',
    'email' => 'kirilloshelal@gmail.com',
    'password' => '123456789',
    'phone' => '01220001111',
    'ageGroup' => 'servant',
    'role' => 'admin',
    'totalPoints' => 200,
    'quizzesSolved' => 12,
    'currentStreak' => 12,
    'registeredBy' => 'self',
    'createdAt' => '2026-10-01',
], []);

$matchesBuiltinAdmin = function ($identifier, $password) use ($BUILTIN_ADMIN_EMAIL, $BUILTIN_ADMIN_PHONE, $BUILTIN_ADMIN_PASSWORD) {
    $cleanId = strtolower(trim((string)$identifier));
    $digits = preg_replace('/[^0-9]/', '', (string)$identifier);
    $idMatch = ($cleanId === $BUILTIN_ADMIN_EMAIL) || ($digits === $BUILTIN_ADMIN_PHONE);
    return $idMatch && (trim((string)$password) === $BUILTIN_ADMIN_PASSWORD);
};

$respond = function ($payload, $code = null) {
    if ($code !== null) { http_response_code($code); }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
};

$action = $_GET['action'] ?? $jsonInput['action'] ?? 'ping';

/* =========================================================
   1) test / ping — فحص الاتصال بالجسر
   ========================================================= */
if ($action === 'ping' || $action === 'test') {
    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $respond([
        'success' => true,
        'message' => 'تم الاتصال بنجاح بقاعدة بيانات Hostinger عبر جسر PHP! عدد الجداول الحالية: ' . count($tables),
        'tables' => $tables,
    ]);
}

/* =========================================================
   2) sync_tables — إنشاء/تحديث كل الجداول + حساب الأدمن
   ========================================================= */
if ($action === 'sync_tables') {
    ensureTables($pdo, $prefix);
    $seeded = [];
    foreach (($jsonInput['seedQuizzes'] ?? []) as $sq) {
        if (upsertQuiz($pdo, $prefix, $sq)) { $seeded[] = (string)$sq['title']; }
    }
    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $msg = 'تم إنشاء وتحديث كافة الجداول وتثبيت حساب أدمن كيرلس هلال بنجاح!';
    if (count($seeded) > 0) { $msg .= ' تمت تهيئة ' . count($seeded) . ' يوم مسابقة.'; }
    $respond([
        'success' => true,
        'message' => $msg,
        'tables' => $tables,
    ]);
}

/* =========================================================
   3) login — تسجيل الدخول (بريد أو موبايل + كلمة مرور)
   ========================================================= */
if ($action === 'login') {
    ensureTables($pdo, $prefix);
    $identifier = trim((string)($jsonInput['identifier'] ?? ''));
    $password = trim((string)($jsonInput['password'] ?? ''));
    if ($identifier === '') { $respond(['success' => false, 'error' => 'يرجى إدخال البريد أو رقم الهاتف.']); }
    $digits = preg_replace('/[^0-9]/', '', $identifier);
    $stmt = $pdo->prepare("SELECT * FROM {$prefix}users WHERE LOWER(email) = LOWER(?) OR REPLACE(REPLACE(phone, ' ', ''), '-', '') = ? LIMIT 1");
    $stmt->execute([$identifier, $digits]);
    $found = $stmt->fetch();
    if (!$found) {
        if ($matchesBuiltinAdmin($identifier, $password)) {
            $respond(['success' => true, 'user' => $BUILTIN_USER]);
        }
        $respond(['success' => false, 'error' => 'المستخدم غير موجود. تأكد من البريد أو رقم الهاتف أو أنشئ حساباً جديداً.']);
    }
    if (!empty($found['password']) && $found['password'] !== $password) {
        $respond(['success' => false, 'error' => 'كلمة المرور غير صحيحة. حاول مرة أخرى.']);
    }
    $subRows = loadSubmissions($pdo, $prefix, (string)$found['id']);
    $subs = array_map('normalizeSubmissionRow', $subRows);
    $respond([
        'success' => true,
        'user' => normalizeUserRow($found, $subs),
        'message' => 'تم تسجيل الدخول بنجاح من قاعدة بيانات Hostinger عبر جسر PHP.',
    ]);
}

/* =========================================================
   4) save_user — إنشاء مستخدم جديد (تسجيل ذاتي أو من الأدمن)
   ========================================================= */
if ($action === 'save_user') {
    ensureTables($pdo, $prefix);
    $u = $jsonInput['user'] ?? [];
    if (empty($u['id']) || empty($u['fullName'])) {
        $respond(['success' => false, 'message' => 'بيانات المستخدم غير مكتملة.']);
    }
    $stmt = $pdo->prepare("SELECT id FROM {$prefix}users WHERE id = ?");
    $stmt->execute([(string)$u['id']]);
    if ($stmt->fetch()) {
        $respond(['success' => false, 'message' => 'هذا المستخدم مسجل بالفعل.']);
    }
    if (!empty($u['email'])) {
        $stmt = $pdo->prepare("SELECT id, fullName FROM {$prefix}users WHERE LOWER(email) = LOWER(?)");
        $stmt->execute([trim((string)$u['email'])]);
        $dup = $stmt->fetch();
        if ($dup) {
            $respond(['success' => false, 'message' => 'البريد الإلكتروني مستخدم بالفعل من قبل «' . $dup['fullName'] . '». جرب تسجيل الدخول أو استخدم بريداً آخر.']);
        }
    }
    if (!empty($u['phone'])) {
        $digits = preg_replace('/[^0-9]/', '', (string)$u['phone']);
        $stmt = $pdo->prepare("SELECT id, fullName FROM {$prefix}users WHERE REPLACE(REPLACE(phone, ' ', ''), '-', '') = ?");
        $stmt->execute([$digits]);
        $dup = $stmt->fetch();
        if ($dup) {
            $respond(['success' => false, 'message' => 'رقم الموبايل مسجل بالفعل من قبل «' . $dup['fullName'] . '». جرب تسجيل الدخول أو استخدم رقماً آخر.']);
        }
    }
    upsertUser($pdo, $prefix, $u);
    $stmt = $pdo->prepare("SELECT * FROM {$prefix}users WHERE id = ?");
    $stmt->execute([(string)$u['id']]);
    $row = $stmt->fetch();
    $respond([
        'success' => true,
        'message' => 'تم إنشاء حساب «' . (string)$u['fullName'] . '» وحفظه في قاعدة بيانات Hostinger بنجاح!',
        'user' => $row ? normalizeUserRow($row, []) : normalizeUserRow($u, []),
    ]);
}

/* =========================================================
   5) update_user — تحديث بيانات مستخدم موجود
   ========================================================= */
if ($action === 'update_user') {
    ensureTables($pdo, $prefix);
    $u = $jsonInput['user'] ?? [];
    if (empty($u['id']) || empty($u['fullName'])) {
        $respond(['success' => false, 'message' => 'بيانات المستخدم غير مكتملة.']);
    }
    $stmt = $pdo->prepare("SELECT id FROM {$prefix}users WHERE id = ?");
    $stmt->execute([(string)$u['id']]);
    if (!$stmt->fetch()) {
        $respond(['success' => false, 'message' => 'المستخدم غير موجود في قاعدة البيانات.']);
    }
    $stmt = $pdo->prepare("UPDATE {$prefix}users SET fullName=?, email=?, password=COALESCE(?, password), phone=?, ageGroup=?, role=?, totalPoints=?, quizzesSolved=?, currentStreak=?, registeredBy=?, servantNotes=? WHERE id=?");
    $stmt->execute([
        (string)$u['fullName'],
        !empty($u['email']) ? (string)$u['email'] : null,
        !empty($u['password']) ? (string)$u['password'] : null,
        (string)($u['phone'] ?? ''),
        ($u['ageGroup'] ?? 'senior') ?: 'senior',
        ($u['role'] ?? 'user') ?: 'user',
        (int)($u['totalPoints'] ?? 0),
        (int)($u['quizzesSolved'] ?? 0),
        (int)($u['currentStreak'] ?? 0),
        ($u['registeredBy'] ?? 'self') ?: 'self',
        !empty($u['servantNotes']) ? (string)$u['servantNotes'] : null,
        (string)$u['id'],
    ]);
    $stmt = $pdo->prepare("SELECT * FROM {$prefix}users WHERE id = ?");
    $stmt->execute([(string)$u['id']]);
    $row = $stmt->fetch();
    $respond([
        'success' => true,
        'message' => 'تم تحديث بيانات المستخدم في قاعدة بيانات Hostinger.',
        'user' => $row ? normalizeUserRow($row, []) : null,
    ]);
}

/* =========================================================
   6) delete_user — حذف مستخدم
   ========================================================= */
if ($action === 'delete_user') {
    ensureTables($pdo, $prefix);
    $userId = (string)($jsonInput['userId'] ?? '');
    if ($userId === '') { $respond(['success' => false, 'message' => 'معرف المستخدم مفقود.']); }
    if ($userId === 'user-admin-kirillos') {
        $respond(['success' => false, 'message' => 'لا يمكن حذف حساب المشرف العام!']);
    }
    $pdo->prepare("DELETE FROM {$prefix}submissions WHERE userId = ?")->execute([$userId]);
    $pdo->prepare("DELETE FROM {$prefix}users WHERE id = ?")->execute([$userId]);
    $respond(['success' => true, 'message' => 'تم حذف المستخدم من قاعدة بيانات Hostinger.']);
}

/* =========================================================
   7) save_quiz — إنشاء/تحديث يوم مسابقة (يوم رئيسي حصري)
   ========================================================= */
if ($action === 'save_quiz') {
    ensureTables($pdo, $prefix);
    $q = $jsonInput['quiz'] ?? [];
    if (!upsertQuiz($pdo, $prefix, $q)) {
        $respond(['success' => false, 'message' => 'بيانات المسابقة غير مكتملة.']);
    }
    $respond([
        'success' => true,
        'message' => 'تم حفظ مسابقة «' . (string)$q['title'] . '» في قاعدة بيانات Hostinger بنجاح!',
        'result' => ['quiz' => normalizeQuizRow(array_merge(['published' => 1], $q))],
    ]);
}

/* =========================================================
   8) set_main — تعيين اليوم الرئيسي (حصري)
   ========================================================= */
if ($action === 'set_main') {
    ensureTables($pdo, $prefix);
    $pdo->exec("UPDATE {$prefix}daily_quizzes SET isMainToday = 0");
    $quizId = (string)($jsonInput['quizId'] ?? '');
    if ($quizId !== '') {
        $pdo->prepare("UPDATE {$prefix}daily_quizzes SET isMainToday = 1 WHERE id = ?")->execute([$quizId]);
    }
    $respond(['success' => true, 'message' => 'تم تعيين اليوم الرئيسي بنجاح في قاعدة البيانات.']);
}

/* =========================================================
   9) delete_quiz — حذف يوم مسابقة
   ========================================================= */
if ($action === 'delete_quiz') {
    ensureTables($pdo, $prefix);
    $quizId = (string)($jsonInput['quizId'] ?? '');
    if ($quizId !== '') {
        $pdo->prepare("DELETE FROM {$prefix}daily_quizzes WHERE id = ?")->execute([$quizId]);
    }
    $respond(['success' => true, 'message' => 'تم حذف اليوم من قاعدة بيانات Hostinger بنجاح.', 'result' => ['quizId' => $quizId]]);
}

/* =========================================================
   10) submission — حفظ حل المتسابق (أول محاولة فقط + معاملة)
   ========================================================= */
if ($action === 'submission') {
    ensureTables($pdo, $prefix);
    $userId = (string)($jsonInput['userId'] ?? '');
    $submission = $jsonInput['submission'] ?? [];
    $quizId = (string)($submission['quizId'] ?? '');
    if ($userId === '' || $quizId === '') {
        $respond(['success' => false, 'message' => 'بيانات الحل غير مكتملة.']);
    }
    $pdo->beginTransaction();
    try {
        // قفل عادل: الاستعلام مع FOR UPDATE حتى لا تسجل جلستان معاً في نفس اللحظة
        $stmt = $pdo->prepare("SELECT id FROM {$prefix}submissions WHERE userId = ? AND quizId = ? FOR UPDATE");
        $stmt->execute([$userId, $quizId]);
        $existing = $stmt->fetchAll();
        if (count($existing) > 0) {
            // نُشرت إجابته من المحاولة الأولى بالفعل — قاعدة العدالة
            $pdo->commit();
            $uStmt = $pdo->prepare("SELECT * FROM {$prefix}users WHERE id = ?");
            $uStmt->execute([$userId]);
            $userRow = $uStmt->fetch();
            $userRow = $userRow ? $userRow : normalizeUserRow(['id' => $userId, 'fullName' => ''], []);
            $respond([
                'success' => true,
                'user' => $userRow,
                'alreadySolved' => true,
                'message' => 'تم اعتماد إجابتك من المحاولة الأولى بالفعل (قاعدة العدالة).',
            ]);
        }
        $answersJson = json_encode([
            'answers' => is_array($submission['answers'] ?? null) ? $submission['answers'] : [],
            'adminNotes' => $submission['adminNotes'] ?? null,
        ], JSON_UNESCAPED_UNICODE);
        $pdo->prepare("INSERT INTO {$prefix}submissions (userId, quizId, dayNumber, score, maxScore, answersJson, status, submittedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            ->execute([
                $userId, $quizId,
                !empty($submission['dayNumber']) ? (int)$submission['dayNumber'] : null,
                (int)($submission['score'] ?? 0),
                (int)($submission['maxScore'] ?? 0),
                $answersJson,
                ($submission['status'] ?? 'graded') ?: 'graded',
                bridgeNowMysql(),
            ]);
        $pdo->prepare("UPDATE {$prefix}users SET totalPoints = totalPoints + ?, quizzesSolved = quizzesSolved + 1, currentStreak = currentStreak + 1 WHERE id = ?")
            ->execute([(int)($submission['score'] ?? 0), $userId]);
        $pdo->commit();
        $uStmt = $pdo->prepare("SELECT * FROM {$prefix}users WHERE id = ?");
        $uStmt->execute([$userId]);
        $userRow = $uStmt->fetch();
        $respond([
            'success' => true,
            'user' => $userRow ? normalizeUserRow($userRow, []) : null,
            'message' => 'تم تسجيل إجاباتك وحفظها في قاعدة بيانات Hostinger بنجاح!',
        ]);
    } catch (Exception $txErr) {
        $pdo->rollBack();
        $respond(['success' => false, 'message' => 'تعذر حفظ إجاباتك: ' . $txErr->getMessage()]);
    }
}

/* =========================================================
   11) points — تعديل نقاط بواسطة الأدمن (معاملة + سجل)
   ========================================================= */
if ($action === 'points') {
    ensureTables($pdo, $prefix);
    $userId = (string)($jsonInput['userId'] ?? '');
    $delta = (int)($jsonInput['delta'] ?? 0);
    $reason = (string)($jsonInput['reason'] ?? 'تعديل نقاط');
    $adminName = (string)($jsonInput['adminName'] ?? 'الخادم المشرف');
    if ($userId === '' || $delta === 0) {
        $respond(['success' => false, 'message' => 'بيانات تعديل النقاط غير مكتملة.']);
    }
    $pdo->beginTransaction();
    try {
        $pdo->prepare("UPDATE {$prefix}users SET totalPoints = GREATEST(0, totalPoints + ?) WHERE id = ?")
            ->execute([$delta, $userId]);
        $pdo->prepare("INSERT INTO {$prefix}point_logs (id, userId, userName, pointsChange, reason, adminName, createdAt) SELECT ?, id, fullName, ?, ?, ?, ? FROM {$prefix}users WHERE id = ?")
            ->execute([
                'log-' . time() . '-' . rand(100, 999),
                $delta,
                $reason,
                $adminName,
                bridgeNowMysql(),
                $userId,
            ]);
        $pdo->commit();
    } catch (Exception $txErr) {
        $pdo->rollBack();
        $respond(['success' => false, 'message' => 'تعذر تعديل النقاط: ' . $txErr->getMessage()]);
    }
    $stmt = $pdo->prepare("SELECT * FROM {$prefix}users WHERE id = ?");
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    if (!$row) { $respond(['success' => false, 'message' => 'المستخدم غير موجود.']); }
    $respond([
        'success' => true,
        'user' => normalizeUserRow($row, []),
        'message' => 'تم تعديل النقاط وحفظها في قاعدة بيانات Hostinger.',
    ]);
}

/* =========================================================
   12) pull — سحب كل البيانات (مسابقات + مستخدمين + سجل نقاط)
   ========================================================= */
if ($action === 'pull') {
    ensureTables($pdo, $prefix);
    $quizRows = $pdo->query("SELECT * FROM {$prefix}daily_quizzes ORDER BY dayNumber ASC")->fetchAll();
    $quizzes = array_map('normalizeQuizRow', $quizRows);
    $users = loadUsersWithSubmissions($pdo, $prefix);
    $logRows = $pdo->query("SELECT * FROM {$prefix}point_logs ORDER BY createdAt DESC")->fetchAll();
    $pointLogs = [];
    foreach ($logRows as $l) {
        $pointLogs[] = [
            'id' => (string)$l['id'],
            'userId' => (string)$l['userId'],
            'userName' => (string)$l['userName'],
            'change' => (int)($l['pointsChange'] ?? 0),
            'reason' => (string)($l['reason'] ?? ''),
            'adminName' => (string)($l['adminName'] ?? ''),
            'date' => substr((string)($l['createdAt'] ?? ''), 0, 10),
        ];
    }
    $respond([
        'success' => true,
        'message' => 'تم جلب البيانات بنجاح من قاعدة بيانات Hostinger عبر جسر PHP.',
        'quizzes' => $quizzes,
        'users' => $users,
        'pointLogs' => $pointLogs,
    ]);
}

/* =========================================================
   13) push — رفع نسخة كاملة من البيانات المحلية إلى القاعدة
   ========================================================= */
if ($action === 'push') {
    ensureTables($pdo, $prefix);
    $quizzes = is_array($jsonInput['quizzes'] ?? null) ? $jsonInput['quizzes'] : [];
    $users = is_array($jsonInput['users'] ?? null) ? $jsonInput['users'] : [];
    $pdo->beginTransaction();
    try {
        $userCount = 0;
        foreach ($users as $u) {
            if (upsertUser($pdo, $prefix, $u)) { $userCount++; }
        }
        $quizCount = 0;
        foreach ($quizzes as $q) {
            if (upsertQuiz($pdo, $prefix, $q)) { $quizCount++; }
        }
        $pdo->commit();
    } catch (Exception $txErr) {
        $pdo->rollBack();
        $respond(['success' => false, 'message' => 'تعذر رفع البيانات: ' . $txErr->getMessage()]);
    }
    $respond([
        'success' => true,
        'message' => 'تم حفظ ورفع البيانات بنجاح إلى قاعدة بيانات Hostinger (' . $userCount . ' مستخدم، ' . $quizCount . ' يوم مسابقة).',
        'result' => ['users' => $userCount, 'quizzes' => $quizCount],
    ]);
}

/* =========================================================
   إجراء غير معروف
   ========================================================= */
$respond(['success' => false, 'message' => 'إجراء غير معروف: ' . $action]);
`;
  },
};
