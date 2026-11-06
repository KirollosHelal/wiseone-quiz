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
  bridgeUrl: '',
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
    throw new Error('رد غير صالح من الخادم. تأكد أن السيرفر يعمل على المنفذ الصحيح.');
  }
  if (data && data.success === false) {
    const err: any = new Error(data.message || data.error || 'فشل الاتصال بقاعدة البيانات.');
    err.apiData = data;
    throw err;
  }
  return data as T;
}

export const StorageService = {
  // --- Data read/write — ALL via the MySQL REST API -------------------

  /** Fetch all quizzes from the Hostinger database. */
  async getQuizzes(): Promise<DailyQuiz[]> {
    const data = await api<{ quizzes: DailyQuiz[] }>('/api/quizzes');
    return (data.quizzes || []).map((q, idx) => ({ ...q, dayNumber: q.dayNumber || (idx + 1) }));
  },

  /** Fetch all users (with submissions) from the Hostinger database. */
  async getUsers(): Promise<User[]> {
    const data = await api<{ users: User[] }>('/api/users');
    return data.users || [];
  },

  /** Fetch all point logs from the Hostinger database. */
  async getPointLogs(): Promise<PointLog[]> {
    const data = await api<{ logs: PointLog[] }>('/api/point-logs');
    return data.logs || [];
  },

  /** Create or update one quiz directly in the database. */
  async saveOrUpdateQuiz(quiz: DailyQuiz): Promise<void> {
    await api('/api/quizzes', {
      method: 'POST',
      body: JSON.stringify({ quiz }),
    });
    dispatchChange();
  },

  /** Set which quiz is the main "today" (exclusive on the server). */
  async setMainDay(quizId: string): Promise<void> {
    await api('/api/quizzes/set-main', {
      method: 'POST',
      body: JSON.stringify({ quizId }),
    });
    dispatchChange();
  },

  /** Delete one quiz from the database. */
  async deleteQuiz(quizId: string): Promise<void> {
    await api(`/api/quizzes/${encodeURIComponent(quizId)}`, { method: 'DELETE' });
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
      return { success: false, error: err.message || 'فشل تسجيل الدخول' };
    }
  },

  /** Create a new user in the database (self signup or admin registration). */
  async addUser(user: User): Promise<User> {
    const data = await api<{ user: User }>('/api/users', {
      method: 'POST',
      body: JSON.stringify({ user }),
    });
    dispatchChange();
    return data.user;
  },

  /** Update an existing user directly in the database. */
  async updateUser(user: User): Promise<void> {
    await api(`/api/users/${encodeURIComponent(user.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ user }),
    });
    dispatchChange();
  },

  /** Delete a user from the database. */
  async deleteUser(userId: string): Promise<void> {
    await api(`/api/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
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
    await api('/api/points', {
      method: 'POST',
      body: JSON.stringify({ userId, delta: pointsDelta, reason, adminName }),
    });
    dispatchChange();
  },

  // --- Quiz Submission (DB transaction, first attempt only) -----------

  async submitQuiz(userId: string, submission: UserQuizSubmission): Promise<void> {
    await api('/api/submissions', {
      method: 'POST',
      body: JSON.stringify({ userId, submission }),
    });
    dispatchChange();
  },

  // --- Database Connection (stored server-side in data/db-config.json) --

  /** Save connection info on the server, test it, create tables and seed initial quizzes. */
  async connectDatabase(config: DatabaseConfig, seedInitialData = true): Promise<string> {
    const data = await api<{ message: string }>('/api/db/config', {
      method: 'POST',
      body: JSON.stringify({
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
      }),
    });
    this.saveDatabaseConfig({ ...config, isConnected: true });
    dispatchChange();
    return data.message;
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

  // Export PHP Bridge script that runs locally on Hostinger with zero firewall issues
  generatePhpSyncBridgeScript(): string {
    const config = this.getDatabaseConfig();
    const prefix = config.tablePrefix || 'cbq_';
    const secret = config.bridgeSecret || 'cbq_sec_9a7d4f128e';
    const dbName = config.database || 'u123456789_bible_quiz';
    const dbUser = config.user || 'u123456789_admin';
    const dbPass = config.password || '';
    const dbHost = (config.host && config.host !== 'localhost' && !config.host.startsWith('34.96')) ? config.host : 'localhost';

    const p = prefix;
    const parts = [
      '<?php',
      '/**',
      ' * Bible Quiz - Hostinger Direct PHP Sync Bridge',
      ' * جـسر الربط المباشر مع قاعدة بيانات Hostinger',
      ' */',
      'error_reporting(0);',
      "ini_set('display_errors', '0');",
      "header('Access-Control-Allow-Origin: *');",
      "header('Access-Control-Allow-Methods: GET, POST, OPTIONS');",
      "header('Access-Control-Allow-Headers: Content-Type, X-Bridge-Secret, Authorization');",
      "header('Content-Type: application/json; charset=UTF-8');",
      '',
      "if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {",
      '    http_response_code(200);',
      '    exit;',
      '}',
      '',
      "$EXPECTED_SECRET = '" + secret + "';",
      "$providedSecret = $_SERVER['HTTP_X_BRIDGE_SECRET'] ?? $_GET['secret'] ?? $_POST['secret'] ?? '';",
      "$rawInput = file_get_contents('php://input');",
      "$jsonInput = json_decode($rawInput, true) ?? [];",
      "if (empty($providedSecret) && !empty($jsonInput['secret'])) { $providedSecret = $jsonInput['secret']; }",
      '',
      "if ($providedSecret !== $EXPECTED_SECRET) {",
      "    http_response_code(401);",
      "    echo json_encode(['success' => false, 'message' => 'رمز الأمان السري غير صحيح.'], JSON_UNESCAPED_UNICODE);",
      "    exit;",
      "}",
      '',
      "$dbHost = '" + dbHost + "';",
      "$dbName = '" + dbName + "';",
      "$dbUser = '" + dbUser + "';",
      "$dbPass = '" + dbPass + "';",
      "$prefix = '" + p + "';",
      '',
      "try {",
      '    $pdo = new PDO("mysql:host=localhost;dbname={$dbName};charset=utf8mb4", $dbUser, $dbPass, [',
      '        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,',
      '        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,',
      '        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"',
      '    ]);',
      "} catch (PDOException $e1) {",
      "    try {",
      '        $pdo = new PDO("mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4", $dbUser, $dbPass, [',
      '            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,',
      '            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,',
      '            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"',
      '        ]);',
      "    } catch (PDOException $e2) {",
      "        echo json_encode(['success' => false, 'message' => 'فشل الاتصال بقاعدة البيانات في Hostinger: ' . $e2->getMessage()], JSON_UNESCAPED_UNICODE);",
      "        exit;",
      "    }",
      "}",
      '',
      "$action = $_GET['action'] ?? $jsonInput['action'] ?? 'ping';",
      '',
      "if ($action === 'ping' || $action === 'test') {",
      '    $stmt = $pdo->query("SHOW TABLES");',
      '    $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);',
      "    echo json_encode(['success' => true, 'message' => 'تم الاتصال بنجاح بقاعدة بيانات Hostinger عبر جسر PHP! عدد الجداول الحالية: ' . count($tables), 'tables' => $tables], JSON_UNESCAPED_UNICODE);",
      "    exit;",
      "}",
      '',
      "if ($action === 'sync_tables') {",
      '    $ddl = "',
      '    CREATE TABLE IF NOT EXISTS " . $prefix . "users (',
      '      id VARCHAR(64) NOT NULL PRIMARY KEY,',
      '      fullName VARCHAR(191) NOT NULL,',
      '      email VARCHAR(191) DEFAULT NULL,',
      '      password VARCHAR(191) DEFAULT NULL,',
      '      phone VARCHAR(32) NOT NULL,',
      "      ageGroup ENUM('senior', 'youth', 'family', 'servant') DEFAULT 'senior',",
      "      role ENUM('admin', 'user') DEFAULT 'user',",
      '      totalPoints INT NOT NULL DEFAULT 0,',
      '      quizzesSolved INT NOT NULL DEFAULT 0,',
      '      currentStreak INT NOT NULL DEFAULT 0,',
      "      registeredBy ENUM('self', 'admin') DEFAULT 'self',",
      '      servantNotes TEXT DEFAULT NULL,',
      '      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,',
      '      KEY idx_email (email)',
      '    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
      '',
      '    CREATE TABLE IF NOT EXISTS " . $prefix . "daily_quizzes (',
      '      id VARCHAR(64) NOT NULL PRIMARY KEY,',
      '      dayNumber INT NOT NULL,',
      '      dayLabel VARCHAR(100) DEFAULT NULL,',
      '      date DATE NOT NULL,',
      '      isMainToday TINYINT(1) DEFAULT 0,',
      "      testament ENUM('old', 'new') DEFAULT 'new',",
      '      bookName VARCHAR(100) NOT NULL,',
      '      chapterNumber INT NOT NULL,',
      '      title VARCHAR(255) NOT NULL,',
      '      keyVerse TEXT DEFAULT NULL,',
      '      reflection TEXT DEFAULT NULL,',
      '      audioUrl TEXT NOT NULL,',
      "      audioDuration VARCHAR(20) DEFAULT '5:00',",
      '      versesJson LONGTEXT NOT NULL,',
      '      questionsJson LONGTEXT NOT NULL,',
      '      totalPoints INT NOT NULL DEFAULT 20,',
      '      published TINYINT(1) DEFAULT 1,',
      '      UNIQUE KEY idx_day_number (dayNumber)',
      '    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
      '',
      '    CREATE TABLE IF NOT EXISTS " . $prefix . "submissions (',
      '      id INT AUTO_INCREMENT PRIMARY KEY,',
      '      userId VARCHAR(64) NOT NULL,',
      '      quizId VARCHAR(64) NOT NULL,',
      '      dayNumber INT DEFAULT NULL,',
      '      score INT NOT NULL DEFAULT 0,',
      '      maxScore INT NOT NULL DEFAULT 0,',
      '      answersJson LONGTEXT NOT NULL,',
      "      status ENUM('graded', 'needs_review') DEFAULT 'graded',",
      '      submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP',
      '    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
      '',
      '    CREATE TABLE IF NOT EXISTS " . $prefix . "point_logs (',
      '      id VARCHAR(64) NOT NULL PRIMARY KEY,',
      '      userId VARCHAR(64) NOT NULL,',
      '      userName VARCHAR(191) NOT NULL,',
      '      pointsChange INT NOT NULL,',
      '      reason TEXT NOT NULL,',
      '      adminName VARCHAR(191) NOT NULL,',
      '      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP',
      '    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
      '',
      '    INSERT INTO " . $prefix . "users ',
      '      (id, fullName, email, password, phone, ageGroup, role, totalPoints, quizzesSolved, currentStreak, registeredBy)',
      '    VALUES ',
      "      ('user-admin-kirillos', 'كيرلس هلال (الخادم المسؤول)', 'kirilloshelal@gmail.com', '123456789', '01220001111', 'servant', 'admin', 200, 12, 12, 'self')",
      "    ON DUPLICATE KEY UPDATE password='123456789', role='admin';",
      '    ";',
      '    $pdo->exec($ddl);',
      "    echo json_encode(['success' => true, 'message' => 'تم إنشاء وتحديث كافة الجداول وتثبيت حساب أدمن كيرلس هلال بنجاح!'], JSON_UNESCAPED_UNICODE);",
      '    exit;',
      '}',
      '',
      "if ($action === 'pull') {",
      '    $quizzesStmt = $pdo->query("SELECT * FROM " . $prefix . "daily_quizzes ORDER BY dayNumber ASC");',
      '    $rawQuizzes = $quizzesStmt->fetchAll();',
      '    $quizzes = array_map(function($q) {',
      '        $q[\'isMainToday\'] = (bool)$q[\'isMainToday\'];',
      '        $q[\'published\'] = (bool)$q[\'published\'];',
      "        $q['verses'] = json_decode($q['versesJson'] ?? '[]', true) ?: [];",
      "        $q['questions'] = json_decode($q['questionsJson'] ?? '[]', true) ?: [];",
      '        return $q;',
      '    }, $rawQuizzes);',
      '',
      '    $usersStmt = $pdo->query("SELECT * FROM " . $prefix . "users");',
      '    $rawUsers = $usersStmt->fetchAll();',
      "    $users = array_map(function($u) { $u['submissions'] = []; return $u; }, $rawUsers);",
      '',
      '    $logsStmt = $pdo->query("SELECT * FROM " . $prefix . "point_logs ORDER BY createdAt DESC");',
      '    $rawLogs = $logsStmt->fetchAll();',
      '    $pointLogs = array_map(function($l) {',
      '        return [',
      "            'id' => $l['id'],",
      "            'userId' => $l['userId'],",
      "            'userName' => $l['userName'],",
      "            'change' => (int)$l['pointsChange'],",
      "            'reason' => $l['reason'],",
      "            'adminName' => $l['adminName'],",
      "            'date' => substr($l['createdAt'], 0, 10),",
      '        ];',
      '    }, $rawLogs);',
      '',
      "    echo json_encode(['success' => true, 'message' => 'تم جلب البيانات بنجاح من Hostinger!', 'quizzes' => $quizzes, 'users' => $users, 'pointLogs' => $pointLogs], JSON_UNESCAPED_UNICODE);",
      '    exit;',
      '}',
      '',
      "if ($action === 'push') {",
      "    $quizzes = $jsonInput['quizzes'] ?? [];",
      "    $users = $jsonInput['users'] ?? [];",
      '    $pdo->beginTransaction();',
      '    if (!empty($users)) {',
      '        $uSql = "INSERT INTO " . $prefix . "users (id, fullName, email, password, phone, ageGroup, role, totalPoints, quizzesSolved, currentStreak, registeredBy, servantNotes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE fullName=VALUES(fullName), totalPoints=VALUES(totalPoints), quizzesSolved=VALUES(quizzesSolved), currentStreak=VALUES(currentStreak), role=VALUES(role), password=COALESCE(VALUES(password), password)";',
      '        $uStmt = $pdo->prepare($uSql);',
      '        foreach ($users as $u) {',
      "            $uStmt->execute([$u['id'], $u['fullName'], $u['email'] ?? null, $u['password'] ?? null, $u['phone'] ?? '', $u['ageGroup'] ?? 'senior', $u['role'] ?? 'user', $u['totalPoints'] ?? 0, $u['quizzesSolved'] ?? 0, $u['currentStreak'] ?? 0, $u['registeredBy'] ?? 'self', $u['servantNotes'] ?? null]);",
      '        }',
      '    }',
      '    if (!empty($quizzes)) {',
      '        $qSql = "INSERT INTO " . $prefix . "daily_quizzes (id, dayNumber, dayLabel, date, isMainToday, testament, bookName, chapterNumber, title, keyVerse, reflection, audioUrl, audioDuration, versesJson, questionsJson, totalPoints, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE title=VALUES(title), dayLabel=VALUES(dayLabel), isMainToday=VALUES(isMainToday), keyVerse=VALUES(keyVerse), reflection=VALUES(reflection), versesJson=VALUES(versesJson), questionsJson=VALUES(questionsJson), totalPoints=VALUES(totalPoints)";',
      '        $qStmt = $pdo->prepare($qSql);',
      '        foreach ($quizzes as $q) {',
      "            $qStmt->execute([$q['id'], $q['dayNumber'], $q['dayLabel'] ?? null, $q['date'], !empty($q['isMainToday']) ? 1 : 0, $q['testament'] ?? 'new', $q['bookName'], $q['chapterNumber'], $q['title'], $q['keyVerse'] ?? null, $q['reflection'] ?? null, $q['audioUrl'], $q['audioDuration'] ?? '5:00', json_encode($q['verses'] ?? []), json_encode($q['questions'] ?? []), $q['totalPoints'] ?? 20, isset($q['published']) && $q['published'] === false ? 0 : 1]);",
      '        }',
      '    }',
      '    $pdo->commit();',
      "    echo json_encode(['success' => true, 'message' => 'تم حفظ ورفع البيانات بنجاح إلى Hostinger!'], JSON_UNESCAPED_UNICODE);",
      '    exit;',
      '}',
      '',
      "echo json_encode(['success' => false, 'message' => 'إجراء غير معروف'], JSON_UNESCAPED_UNICODE);",
    ];

    return parts.join('\n');
  },
};
