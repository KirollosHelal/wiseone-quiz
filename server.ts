import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.use(express.json());

  // Helper for MySQL connection with strict timeout (prevents Cloud Run 502/504 HTML gateway timeouts)
  const connectMysqlWithTimeout = async (config: mysql.ConnectionOptions, timeoutMs = 2800): Promise<mysql.Connection> => {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const err: any = new Error('ETIMEDOUT');
        err.code = 'ETIMEDOUT';
        reject(err);
      }, timeoutMs);
    });

    try {
      const conn = await Promise.race([mysql.createConnection(config), timeoutPromise]);
      clearTimeout(timer!);
      return conn;
    } catch (error) {
      clearTimeout(timer!);
      throw error;
    }
  };

  const cleanHostString = (rawHost: string) => {
    let clean = (rawHost || '').trim();
    // If user entered srv123.main-hosting.eu:3306 or https://..., strip protocol and port
    clean = clean.replace(/^https?:\/\//i, '');
    if (clean.includes(':')) {
      clean = clean.split(':')[0];
    }
    return clean;
  };

  const getFriendlyErrorMessage = (err: any, database: string, host: string) => {
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      return `تم رفض الوصول (Access Denied). اسم المستخدم أو كلمة المرور غير صحيحة، أو لم يتم إعطاء الصلاحيات الكاملة للمستخدم على قاعدة «${database}» في لوحة Hostinger.`;
    }
    if (err.code === 'ER_BAD_DB_ERROR') {
      return `قاعدة البيانات «${database}» غير موجودة في سيرفر Hostinger. يرجى التأكد من الاسم بالكامل كما يظهر في لوحة التحكم (مثل: u123456789_dbname).`;
    }
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      return `انتهت مهلة استجابة السيرفر «${host}» (ETIMEDOUT).
الأسباب الأكيدة في Hostinger:
1) جدار الحماية (Firewall) في Hostinger يحجب منفذ 3306: تأكد من إضافة IP السيرفر (34.96.62.46) في Hostinger > Databases > Remote MySQL.
2) تأكد أن عنوان السيرفر ليس "localhost" ولا اسم موقعك، بل Hostname أو IP السيرفر المخصص في Hostinger (مثل: srv123.main-hosting.eu).
★ الحل الأسهل والأسرع 100%: استخدم «جسر PHP المباشر (Hostinger Bridge)» المتاح في التبويب الثاني في الموقع، فهو يتصل محلياً داخل Hostinger بدون قيود جدار الحماية!`;
    }
    return `فشل الاتصال: ${err.message || 'خطأ غير معروف'}`;
  };

  // --- API: Server Info (Outbound IP for Hostinger Remote MySQL) ---
  app.get('/api/db/server-info', async (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    return res.json({
      success: true,
      ip: '34.96.62.46',
      port: 3000,
    });
  });

  // --- API: Test MySQL Connection (Hostinger phpMyAdmin) ---
  app.post('/api/db/test-connection', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { host, port, database, user, password, ssl } = req.body;

    const cleanedHost = cleanHostString(host);

    if (!cleanedHost || !database || !user) {
      return res.json({
        success: false,
        message: 'يرجى إدخال عنوان السيرفر (Host) واسم قاعدة البيانات (Database) واسم المستخدم (User).',
      });
    }

    if (cleanedHost.toLowerCase() === 'localhost' || cleanedHost === '127.0.0.1') {
      return res.json({
        success: false,
        message: 'تنبيه: "localhost" تشير للسيرفر المحلي الداخلي للموقع وليس لسيرفر Hostinger. يرجى نسخ عنوان السيرفر الخارجي (MySQL Hostname / IP) من لوحة تحكم Hostinger > MySQL Databases (مثل: srv123.main-hosting.eu أو IP السيرفر)، أو استخدام جسر PHP المباشر.',
      });
    }

    try {
      const parsedPort = port ? parseInt(port) : (host.includes(':') ? parseInt(host.split(':')[1]) : 3306);
      const connection = await connectMysqlWithTimeout({
        host: cleanedHost,
        port: isNaN(parsedPort) ? 3306 : parsedPort,
        user: (user || '').trim(),
        password: password || '',
        database: (database || '').trim(),
        connectTimeout: 2500,
        ssl: ssl ? { rejectUnauthorized: false } : undefined,
      }, 2800);

      const [rows] = await connection.query('SELECT 1 + 1 AS solution, NOW() as server_time');
      
      // Also check tables exist
      const [tableRows] = await connection.query('SHOW TABLES');
      await connection.end();

      const tableNames = (tableRows as any[]).map(r => Object.values(r)[0]);

      return res.json({
        success: true,
        message: `تم الاتصال بنجاح بقاعدة بيانات Hostinger (${database})! عدد الجداول الموجودة: ${tableNames.length}.`,
        serverTime: (rows as any)[0]?.server_time,
        tables: tableNames,
      });
    } catch (err: any) {
      console.error('MySQL connection error:', err);
      const friendlyMsg = getFriendlyErrorMessage(err, database, cleanedHost);

      return res.json({
        success: false,
        message: friendlyMsg,
        code: err.code || 'CONNECTION_ERROR',
      });
    }
  });

  // --- API: Test Hostinger PHP Bridge ---
  app.post('/api/db/bridge-test', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { bridgeUrl, bridgeSecret } = req.body;
    if (!bridgeUrl) {
      return res.json({
        success: false,
        message: 'يرجى إدخال رابط ملف الجسر (مثل: https://yourdomain.com/bible_sync.php).',
      });
    }

    try {
      const cleanUrl = bridgeUrl.trim();
      const targetUrl = new URL(cleanUrl);
      targetUrl.searchParams.set('action', 'test');
      targetUrl.searchParams.set('secret', bridgeSecret || '');

      const response = await fetch(targetUrl.toString(), {
        method: 'GET',
        headers: {
          'X-Bridge-Secret': bridgeSecret || '',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(6000),
      });

      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        return res.json({
          success: false,
          message: `رد السيرفر لم يكن بتنسيق JSON صحيح. تأكد من رفع ملف bible_sync.php داخل مجلد public_html في Hostinger.\n(نص الرد المستلم: ${text.substring(0, 150)}...)`,
        });
      }

      return res.json(data);
    } catch (err: any) {
      return res.json({
        success: false,
        message: `تعذر الوصول إلى رابط ملف الجسر: ${err.message || 'تأكد من صحة الرابط وعمل الموقع على Hostinger'}.`,
      });
    }
  });

  // --- API: Sync Tables via PHP Bridge ---
  app.post('/api/db/bridge-sync-tables', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { bridgeUrl, bridgeSecret } = req.body;
    if (!bridgeUrl) {
      return res.json({ success: false, message: 'يرجى إدخال رابط ملف الجسر أولاً.' });
    }

    try {
      const cleanUrl = bridgeUrl.trim();
      const targetUrl = new URL(cleanUrl);
      targetUrl.searchParams.set('action', 'sync_tables');
      targetUrl.searchParams.set('secret', bridgeSecret || '');

      const response = await fetch(targetUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Secret': bridgeSecret || '',
        },
        body: JSON.stringify({ action: 'sync_tables', secret: bridgeSecret }),
        signal: AbortSignal.timeout(8000),
      });

      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        return res.json({
          success: false,
          message: `خطأ في الرد من ملف الجسر: ${text.substring(0, 120)}`,
        });
      }
      return res.json(data);
    } catch (err: any) {
      return res.json({
        success: false,
        message: `تعذر إنشاء الجداول عبر الجسر: ${err.message}`,
      });
    }
  });

  // --- API: Pull Data via PHP Bridge ---
  app.post('/api/db/bridge-pull', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { bridgeUrl, bridgeSecret } = req.body;
    if (!bridgeUrl) {
      return res.json({ success: false, message: 'يرجى إدخال رابط ملف الجسر أولاً.' });
    }

    try {
      const cleanUrl = bridgeUrl.trim();
      const targetUrl = new URL(cleanUrl);
      targetUrl.searchParams.set('action', 'pull');
      targetUrl.searchParams.set('secret', bridgeSecret || '');

      const response = await fetch(targetUrl.toString(), {
        method: 'GET',
        headers: {
          'X-Bridge-Secret': bridgeSecret || '',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });

      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        return res.json({
          success: false,
          message: `خطأ في استجابة سحب البيانات: ${text.substring(0, 120)}`,
        });
      }
      return res.json(data);
    } catch (err: any) {
      return res.json({
        success: false,
        message: `تعذر سحب البيانات عبر الجسر: ${err.message}`,
      });
    }
  });

  // --- API: Push Data via PHP Bridge ---
  app.post('/api/db/bridge-push', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { bridgeUrl, bridgeSecret, quizzes, users } = req.body;
    if (!bridgeUrl) {
      return res.json({ success: false, message: 'يرجى إدخال رابط ملف الجسر أولاً.' });
    }

    try {
      const cleanUrl = bridgeUrl.trim();
      const targetUrl = new URL(cleanUrl);
      targetUrl.searchParams.set('action', 'push');
      targetUrl.searchParams.set('secret', bridgeSecret || '');

      const response = await fetch(targetUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Secret': bridgeSecret || '',
        },
        body: JSON.stringify({
          action: 'push',
          secret: bridgeSecret,
          quizzes,
          users,
        }),
        signal: AbortSignal.timeout(10000),
      });

      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        return res.json({
          success: false,
          message: `خطأ في استجابة رفع البيانات: ${text.substring(0, 120)}`,
        });
      }
      return res.json(data);
    } catch (err: any) {
      return res.json({
        success: false,
        message: `تعذر رفع البيانات عبر الجسر: ${err.message}`,
      });
    }
  });

  // --- API: Auto-create tables on MySQL DB ---
  app.post('/api/db/sync-tables', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { host, port, database, user, password, ssl, tablePrefix = 'cbq_' } = req.body;

    if (!host || !database || !user) {
      return res.json({
        success: false,
        message: 'يرجى إدخال بيانات السيرفر واسم قاعدة البيانات أولاً.',
      });
    }

    try {
      const connection = await connectMysqlWithTimeout({
        host,
        port: port ? parseInt(port) : 3306,
        user,
        password: password || '',
        database,
        connectTimeout: 3000,
        ssl: ssl ? { rejectUnauthorized: false } : undefined,
        multipleStatements: true,
      }, 4000);

      const ddl = `
        CREATE TABLE IF NOT EXISTS \`${tablePrefix}users\` (
          \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
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
          KEY \`idx_email\` (\`email\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

        CREATE TABLE IF NOT EXISTS \`${tablePrefix}daily_quizzes\` (
          \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
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
          UNIQUE KEY \`idx_day_number\` (\`dayNumber\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

        CREATE TABLE IF NOT EXISTS \`${tablePrefix}submissions\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`userId\` VARCHAR(64) NOT NULL,
          \`quizId\` VARCHAR(64) NOT NULL,
          \`dayNumber\` INT DEFAULT NULL,
          \`score\` INT NOT NULL DEFAULT 0,
          \`maxScore\` INT NOT NULL DEFAULT 0,
          \`answersJson\` LONGTEXT NOT NULL,
          \`status\` ENUM('graded', 'needs_review') DEFAULT 'graded',
          \`submittedAt\` DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

        CREATE TABLE IF NOT EXISTS \`${tablePrefix}point_logs\` (
          \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
          \`userId\` VARCHAR(64) NOT NULL,
          \`userName\` VARCHAR(191) NOT NULL,
          \`pointsChange\` INT NOT NULL,
          \`reason\` TEXT NOT NULL,
          \`adminName\` VARCHAR(191) NOT NULL,
          \`createdAt\` DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

        INSERT INTO \`${tablePrefix}users\` 
          (\`id\`, \`fullName\`, \`email\`, \`password\`, \`phone\`, \`ageGroup\`, \`role\`, \`totalPoints\`, \`quizzesSolved\`, \`currentStreak\`, \`registeredBy\`)
        VALUES 
          ('user-admin-kirillos', 'الخادم المسؤول', 'kirilloshelal@gmail.com', '123456789', '01220001111', 'servant', 'admin', 200, 12, 12, 'self')
        ON DUPLICATE KEY UPDATE \`password\`='123456789', \`role\`='admin';
      `;

      await connection.query(ddl);
      await connection.end();

      return res.json({
        success: true,
        message: 'تم إنشاء الجداول بنجاح في قاعدة بيانات Hostinger وتثبيت حساب أدمن كيرلس هلال!',
      });
    } catch (err: any) {
      console.error('Error creating tables:', err);
      const friendlyMsg = getFriendlyErrorMessage(err, database, host);
      return res.json({
        success: false,
        message: `تعذر إنشاء الجداول: ${friendlyMsg}`,
      });
    }
  });

  // --- API: Pull / Sync Data from Hostinger MySQL into Website ---
  app.post('/api/db/pull-data', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { host, port, database, user, password, ssl, tablePrefix = 'cbq_' } = req.body;
    const cleanedHost = cleanHostString(host);

    if (!cleanedHost || !database || !user) {
      return res.json({
        success: false,
        message: 'يرجى إدخال بيانات السيرفر واسم قاعدة البيانات أولاً.',
      });
    }

    try {
      const parsedPort = port ? parseInt(port) : (host.includes(':') ? parseInt(host.split(':')[1]) : 3306);
      const connection = await connectMysqlWithTimeout({
        host: cleanedHost,
        port: isNaN(parsedPort) ? 3306 : parsedPort,
        user: (user || '').trim(),
        password: password || '',
        database: (database || '').trim(),
        connectTimeout: 5000,
        ssl: ssl ? { rejectUnauthorized: false } : undefined,
      }, 5500);

      // Check which tables exist
      const [tableRows] = await connection.query('SHOW TABLES');
      const tableNames: string[] = (tableRows as any[]).map(r => Object.values(r)[0] as string);

      let quizzes: any[] = [];
      let users: any[] = [];
      let pointLogs: any[] = [];

      const quizzesTable = `${tablePrefix}daily_quizzes`;
      const usersTable = `${tablePrefix}users`;
      const logsTable = `${tablePrefix}point_logs`;

      if (tableNames.includes(quizzesTable)) {
        const [qRows] = await connection.query(`SELECT * FROM \`${quizzesTable}\` ORDER BY dayNumber ASC`);
        quizzes = (qRows as any[]).map(q => ({
          ...q,
          isMainToday: Boolean(q.isMainToday),
          published: Boolean(q.published),
          verses: typeof q.versesJson === 'string' ? JSON.parse(q.versesJson) : q.versesJson || [],
          questions: typeof q.questionsJson === 'string' ? JSON.parse(q.questionsJson) : q.questionsJson || [],
          date: q.date instanceof Date ? q.date.toISOString().split('T')[0] : String(q.date),
        }));
      }

      if (tableNames.includes(usersTable)) {
        const [uRows] = await connection.query(`SELECT * FROM \`${usersTable}\``);
        users = (uRows as any[]).map(u => ({
          ...u,
          submissions: [],
        }));
      }

      if (tableNames.includes(logsTable)) {
        const [lRows] = await connection.query(`SELECT * FROM \`${logsTable}\` ORDER BY createdAt DESC`);
        pointLogs = (lRows as any[]).map(l => ({
          id: l.id,
          userId: l.userId,
          userName: l.userName,
          change: l.pointsChange,
          reason: l.reason,
          adminName: l.adminName,
          date: l.createdAt instanceof Date ? l.createdAt.toISOString().split('T')[0] : String(l.createdAt),
        }));
      }

      await connection.end();

      return res.json({
        success: true,
        message: `تم جلب البيانات بنجاح من Hostinger! (تم العثور على ${quizzes.length} مسابقة و ${users.length} متسابق).`,
        quizzes,
        users,
        pointLogs,
      });
    } catch (err: any) {
      console.error('Error pulling data from MySQL:', err);
      const friendlyMsg = getFriendlyErrorMessage(err, database, cleanedHost);
      return res.json({
        success: false,
        message: friendlyMsg,
      });
    }
  });

  // --- API: Push / Upload Local Website Data into Hostinger MySQL ---
  app.post('/api/db/push-data', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { config, quizzes, users } = req.body;
    const { host, port, database, user, password, ssl, tablePrefix = 'cbq_' } = config || {};
    const cleanedHost = cleanHostString(host);

    if (!cleanedHost || !database || !user) {
      return res.json({
        success: false,
        message: 'بيانات الاتصال بقاعدة البيانات غير مكتملة.',
      });
    }

    try {
      const parsedPort = port ? parseInt(port) : (host.includes(':') ? parseInt(host.split(':')[1]) : 3306);
      const connection = await connectMysqlWithTimeout({
        host: cleanedHost,
        port: isNaN(parsedPort) ? 3306 : parsedPort,
        user: (user || '').trim(),
        password: password || '',
        database: (database || '').trim(),
        connectTimeout: 5000,
        ssl: ssl ? { rejectUnauthorized: false } : undefined,
      }, 6000);

      // Insert or update users
      if (Array.isArray(users)) {
        for (const u of users) {
          await connection.query(`
            INSERT INTO \`${tablePrefix}users\` 
              (\`id\`, \`fullName\`, \`email\`, \`password\`, \`phone\`, \`ageGroup\`, \`role\`, \`totalPoints\`, \`quizzesSolved\`, \`currentStreak\`, \`registeredBy\`, \`servantNotes\`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
              \`fullName\`=VALUES(\`fullName\`),
              \`totalPoints\`=VALUES(\`totalPoints\`),
              \`quizzesSolved\`=VALUES(\`quizzesSolved\`),
              \`currentStreak\`=VALUES(\`currentStreak\`),
              \`role\`=VALUES(\`role\`),
              \`password\`=COALESCE(VALUES(\`password\`), \`password\`)
          `, [
            u.id, u.fullName, u.email || null, u.password || null, u.phone || '',
            u.ageGroup || 'senior', u.role || 'user', u.totalPoints || 0,
            u.quizzesSolved || 0, u.currentStreak || 0, u.registeredBy || 'self',
            u.servantNotes || null
          ]);
        }
      }

      // Insert or update quizzes
      if (Array.isArray(quizzes)) {
        for (const q of quizzes) {
          await connection.query(`
            INSERT INTO \`${tablePrefix}daily_quizzes\` 
              (\`id\`, \`dayNumber\`, \`dayLabel\`, \`date\`, \`isMainToday\`, \`testament\`, \`bookName\`, \`chapterNumber\`, \`title\`, \`keyVerse\`, \`reflection\`, \`audioUrl\`, \`audioDuration\`, \`versesJson\`, \`questionsJson\`, \`totalPoints\`, \`published\`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
              \`title\`=VALUES(\`title\`),
              \`dayLabel\`=VALUES(\`dayLabel\`),
              \`isMainToday\`=VALUES(\`isMainToday\`),
              \`keyVerse\`=VALUES(\`keyVerse\`),
              \`reflection\`=VALUES(\`reflection\`),
              \`versesJson\`=VALUES(\`versesJson\`),
              \`questionsJson\`=VALUES(\`questionsJson\`),
              \`totalPoints\`=VALUES(\`totalPoints\`)
          `, [
            q.id, q.dayNumber, q.dayLabel || null, q.date, q.isMainToday ? 1 : 0,
            q.testament || 'new', q.bookName, q.chapterNumber, q.title,
            q.keyVerse || null, q.reflection || null, q.audioUrl,
            q.audioDuration || '5:00', JSON.stringify(q.verses || []),
            JSON.stringify(q.questions || []), q.totalPoints || 20,
            q.published !== false ? 1 : 0
          ]);
        }
      }

      await connection.end();

      return res.json({
        success: true,
        message: 'تمت مزامنة ورفع كافة المسابقات والمتسابقين بنجاح إلى قاعدة بيانات Hostinger MySQL!',
      });
    } catch (err: any) {
      console.error('Error pushing data to MySQL:', err);
      const friendlyMsg = getFriendlyErrorMessage(err, database, cleanedHost);
      return res.json({
        success: false,
        message: friendlyMsg,
      });
    }
  });

  // ============================================================
  // === MySQL-backed CRUD API (Hostinger DB = single source of truth) ===
  // ============================================================

  const DATA_DIR = path.join(__dirname, 'data');
  const DB_CONFIG_FILE = path.join(DATA_DIR, 'db-config.json');

  interface StoredDbConfig {
    host: string;
    port?: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
    tablePrefix?: string;
    bridgeMode?: boolean;
    bridgeUrl?: string;
    bridgeSecret?: string;
    savedAt?: string;
  }

  const readStoredDbConfig = (): StoredDbConfig | null => {
    try {
      if (fs.existsSync(DB_CONFIG_FILE)) {
        const raw = fs.readFileSync(DB_CONFIG_FILE, 'utf-8');
        const cfg = JSON.parse(raw);
        if (cfg?.host && cfg?.database && cfg?.user) return cfg as StoredDbConfig;
      }
    } catch { /* ignore corrupt file */ }
    return null;
  };

  const writeStoredDbConfig = (cfg: StoredDbConfig): void => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_CONFIG_FILE, JSON.stringify({ ...cfg, savedAt: new Date().toISOString() }, null, 2), 'utf-8');
  };

  // Single central connection factory (dateStrings keeps DATE/DATETIME as plain strings)
  const getDbConnection = async (cfg: StoredDbConfig, timeoutMs = 8000): Promise<mysql.Connection> => {
    const conn = await connectMysqlWithTimeout({
      host: cleanHostString(cfg.host),
      port: cfg.port ? Number(cfg.port) : 3306,
      user: cfg.user,
      password: cfg.password || '',
      database: cfg.database,
      connectTimeout: 6000,
      multipleStatements: true,
      dateStrings: true,
      ...(cfg.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
    }, timeoutMs);
    return conn;
  };

  // Creates all tables if missing and guarantees the default admin account exists
  const ensureDbSchema = async (conn: mysql.Connection, tablePrefix = 'cbq_'): Promise<void> => {
    const ddl = `
      CREATE TABLE IF NOT EXISTS \`${tablePrefix}users\` (
        \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
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
        KEY \`idx_email\` (\`email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE IF NOT EXISTS \`${tablePrefix}daily_quizzes\` (
        \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
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
        UNIQUE KEY \`idx_day_number\` (\`dayNumber\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE IF NOT EXISTS \`${tablePrefix}submissions\` (
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

      CREATE TABLE IF NOT EXISTS \`${tablePrefix}point_logs\` (
        \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
        \`userId\` VARCHAR(64) NOT NULL,
        \`userName\` VARCHAR(191) NOT NULL,
        \`pointsChange\` INT NOT NULL,
        \`reason\` TEXT NOT NULL,
        \`adminName\` VARCHAR(191) NOT NULL,
        \`createdAt\` DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      INSERT INTO \`${tablePrefix}users\`
        (\`id\`, \`fullName\`, \`email\`, \`password\`, \`phone\`, \`ageGroup\`, \`role\`, \`totalPoints\`, \`quizzesSolved\`, \`currentStreak\`, \`registeredBy\`)
      VALUES
        ('user-admin-kirillos', 'كيرلس هلال (الخادم المسؤول)', 'kirilloshelal@gmail.com', '123456789', '01220001111', 'servant', 'admin', 200, 12, 12, 'self')
      ON DUPLICATE KEY UPDATE \`password\`='123456789', \`role\`='admin';
    `;
    await conn.query(ddl);
  };

  const safeJsonParse = <T,>(raw: any, fallback: T): T => {
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw !== 'string') return raw as T;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  };

  // DB row -> client DailyQuiz
  const normalizeQuiz = (q: any): any => ({
    id: q.id,
    dayNumber: Number(q.dayNumber),
    dayLabel: q.dayLabel ?? undefined,
    date: String(q.date || '').slice(0, 10),
    isMainToday: Boolean(Number(q.isMainToday)),
    testament: q.testament || 'new',
    bookName: q.bookName,
    chapterNumber: Number(q.chapterNumber),
    title: q.title,
    keyVerse: q.keyVerse ?? '',
    reflection: q.reflection ?? '',
    audioUrl: q.audioUrl,
    audioDuration: q.audioDuration || '5:00',
    verses: safeJsonParse<any[]>(q.versesJson, []),
    questions: safeJsonParse<any[]>(q.questionsJson, []),
    totalPoints: Number(q.totalPoints) || 20,
    published: q.published === null ? true : Boolean(Number(q.published)),
  });

  // DB row -> client User (+ submissions from separate table)
  const normalizeUser = (u: any, submissions: any[] = []): any => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email ?? undefined,
    password: u.password ?? undefined,
    phone: u.phone,
    ageGroup: u.ageGroup || 'senior',
    role: u.role || 'user',
    totalPoints: Number(u.totalPoints) || 0,
    quizzesSolved: Number(u.quizzesSolved) || 0,
    currentStreak: Number(u.currentStreak) || 0,
    registeredBy: u.registeredBy || 'self',
    servantNotes: u.servantNotes ?? undefined,
    createdAt: String(u.createdAt || '').slice(0, 10),
    submissions,
  });

  const normalizeSubmission = (s: any): any => {
    const parsed = safeJsonParse<any>(s.answersJson, {});
    return {
      quizId: s.quizId,
      dayNumber: s.dayNumber ? Number(s.dayNumber) : undefined,
      date: String(s.submittedAt || '').slice(0, 10),
      submittedAt: String(s.submittedAt || ''),
      score: Number(s.score) || 0,
      maxScore: Number(s.maxScore) || 0,
      answers: parsed.answers || parsed || {},
      status: s.status || 'graded',
      adminNotes: parsed.adminNotes,
    };
  };

  const nowMysql = (): string => new Date().toISOString().slice(0, 19).replace('T', ' ');

  // Wrapper: every CRUD route needs a stored DB config and graceful JSON errors
  const handleDbRoute = (
    fn: (req: express.Request, res: express.Response, cfg: StoredDbConfig) => Promise<any>
  ) => async (req: express.Request, res: express.Response) => {
    const cfg = readStoredDbConfig();
    if (!cfg) {
      return res.json({
        success: false,
        code: 'NO_DB_CONFIG',
        message: 'لم يتم حفظ بيانات الاتصال بقاعدة بيانات Hostinger في السيرفر بعد. افتح: لوحة التحكم > تبويب قاعدة البيانات > أدخل بيانات الاتصال ثم اضغط «حفظ وتفعيل الاتصال».',
      });
    }
    try {
      await fn(req, res, cfg);
    } catch (err: any) {
      console.error('DB API error:', err);
      return res.json({
        success: false,
        message: getFriendlyErrorMessage(err, cfg.database, cleanHostString(cfg.host)),
      });
    }
  };

  // --- Config: save + test + create tables + seed initial quizzes (only if empty) ---
  app.post('/api/db/config', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const cfg: StoredDbConfig = req.body?.config;
    if (!cfg?.host || !cfg?.database || !cfg?.user) {
      return res.json({ success: false, message: 'بيانات الاتصال غير مكتملة. يرجى إدخال Host وDatabase وUser.' });
    }
    try {
      const conn = await getDbConnection(cfg, 9000);
      await ensureDbSchema(conn, cfg.tablePrefix || 'cbq_');

      // Seed initial quizzes once (never overwrite existing live data)
      const seedQuizzes: any[] = Array.isArray(req.body?.seedQuizzes) ? req.body.seedQuizzes : [];
      let seeded = 0;
      if (seedQuizzes.length > 0) {
        const [countRows] = await conn.query(`SELECT COUNT(*) AS c FROM \`${cfg.tablePrefix || 'cbq_'}daily_quizzes\``);
        const existing = Number((countRows as any[])[0]?.c || 0);
        if (existing === 0) {
          for (const q of seedQuizzes) {
            await conn.query(
              `INSERT INTO \`${cfg.tablePrefix || 'cbq_'}daily_quizzes\`
                (\`id\`, \`dayNumber\`, \`dayLabel\`, \`date\`, \`isMainToday\`, \`testament\`, \`bookName\`, \`chapterNumber\`, \`title\`, \`keyVerse\`, \`reflection\`, \`audioUrl\`, \`audioDuration\`, \`versesJson\`, \`questionsJson\`, \`totalPoints\`, \`published\`)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE \`id\`=VALUES(\`id\`)`,
              [q.id, q.dayNumber, q.dayLabel || null, q.date, q.isMainToday ? 1 : 0, q.testament || 'new',
                q.bookName, q.chapterNumber, q.title, q.keyVerse || null, q.reflection || null, q.audioUrl,
                q.audioDuration || '5:00', JSON.stringify(q.verses || []), JSON.stringify(q.questions || []),
                q.totalPoints || 20, q.published !== false ? 1 : 0]
            );
            seeded++;
          }
        }
      }
      await conn.end();

      writeStoredDbConfig(cfg);
      return res.json({
        success: true,
        message: seeded > 0
          ? `تم حفظ البيانات وتفعيل الاتصال بقاعدة «${cfg.database}» بنجاح! تمت تهيئة الجداول مع رفع ${seeded} يوم مسابقة افتراضي.`
          : `تم حفظ البيانات وتفعيل الاتصال بقاعدة «${cfg.database}» بنجاح! كل العمليات الآن تعمل عبر قاعدة البيانات مباشرة.`,
        seeded,
      });
    } catch (err: any) {
      console.error('DB config error:', err);
      return res.json({ success: false, message: getFriendlyErrorMessage(err, cfg.database, cleanHostString(cfg.host)) });
    }
  });

  app.get('/api/db/config', (_req, res) => {
    const cfg = readStoredDbConfig();
    res.json({ success: true, saved: Boolean(cfg), config: cfg || null });
  });

  // --- Quizzes: list ---
  app.get('/api/quizzes', handleDbRoute(async (_req, res, cfg) => {
    const conn = await getDbConnection(cfg);
    await ensureDbSchema(conn, cfg.tablePrefix || 'cbq_');
    const [rows] = await conn.query(`SELECT * FROM \`${cfg.tablePrefix || 'cbq_'}daily_quizzes\` ORDER BY dayNumber ASC`);
    await conn.end();
    res.json({ success: true, quizzes: (rows as any[]).map(normalizeQuiz) });
  }));

  // --- Quizzes: create or update (upsert by id) ---
  app.post('/api/quizzes', handleDbRoute(async (req, res, cfg) => {
    const q = req.body?.quiz;
    const prefix = cfg.tablePrefix || 'cbq_';
    if (!q?.id || !q?.bookName || !q?.title) {
      return res.json({ success: false, message: 'بيانات المسابقة غير مكتملة.' });
    }
    const conn = await getDbConnection(cfg);
    await ensureDbSchema(conn, prefix);

    // Exclusive main day: unset everyone else first
    if (q.isMainToday) {
      await conn.query(`UPDATE \`${prefix}daily_quizzes\` SET \`isMainToday\` = 0`);
    }

    // Replace any row on the same dayNumber so day numbers stay unique
    const [dupRows] = await conn.query(
      `SELECT \`id\` FROM \`${prefix}daily_quizzes\` WHERE \`dayNumber\` = ? AND \`id\` <> ?`,
      [q.dayNumber, q.id]
    );
    for (const row of (dupRows as any[])) {
      await conn.query(`DELETE FROM \`${prefix}daily_quizzes\` WHERE \`id\` = ?`, [row.id]);
    }

    await conn.query(
      `INSERT INTO \`${prefix}daily_quizzes\`
        (\`id\`, \`dayNumber\`, \`dayLabel\`, \`date\`, \`isMainToday\`, \`testament\`, \`bookName\`, \`chapterNumber\`, \`title\`, \`keyVerse\`, \`reflection\`, \`audioUrl\`, \`audioDuration\`, \`versesJson\`, \`questionsJson\`, \`totalPoints\`, \`published\`)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        \`dayNumber\`=VALUES(\`dayNumber\`), \`dayLabel\`=VALUES(\`dayLabel\`), \`date\`=VALUES(\`date\`),
        \`isMainToday\`=VALUES(\`isMainToday\`), \`testament\`=VALUES(\`testament\`), \`bookName\`=VALUES(\`bookName\`),
        \`chapterNumber\`=VALUES(\`chapterNumber\`), \`title\`=VALUES(\`title\`), \`keyVerse\`=VALUES(\`keyVerse\`),
        \`reflection\`=VALUES(\`reflection\`), \`audioUrl\`=VALUES(\`audioUrl\`), \`audioDuration\`=VALUES(\`audioDuration\`),
        \`versesJson\`=VALUES(\`versesJson\`), \`questionsJson\`=VALUES(\`questionsJson\`),
        \`totalPoints\`=VALUES(\`totalPoints\`), \`published\`=VALUES(\`published\`)`,
      [q.id, q.dayNumber, q.dayLabel || null, q.date, q.isMainToday ? 1 : 0, q.testament || 'new',
        q.bookName, q.chapterNumber, q.title, q.keyVerse || null, q.reflection || null, q.audioUrl,
        q.audioDuration || '5:00', JSON.stringify(q.verses || []), JSON.stringify(q.questions || []),
        q.totalPoints || 20, q.published === false ? 0 : 1]
    );
    await conn.end();
    res.json({ success: true, message: `تم حفظ مسابقة «${q.title}» في قاعدة البيانات بنجاح!` });
  }));

  // --- Quizzes: set the main today ---
  app.post('/api/quizzes/set-main', handleDbRoute(async (req, res, cfg) => {
    const { quizId } = req.body || {};
    const prefix = cfg.tablePrefix || 'cbq_';
    const conn = await getDbConnection(cfg);
    await ensureDbSchema(conn, prefix);
    await conn.query(`UPDATE \`${prefix}daily_quizzes\` SET \`isMainToday\` = 0`);
    if (quizId) {
      await conn.query(`UPDATE \`${prefix}daily_quizzes\` SET \`isMainToday\` = 1 WHERE \`id\` = ?`, [quizId]);
    }
    await conn.end();
    res.json({ success: true, message: 'تم تعيين اليوم الرئيسي بنجاح في قاعدة البيانات.' });
  }));

  // --- Quizzes: delete ---
  app.delete('/api/quizzes/:id', handleDbRoute(async (req, res, cfg) => {
    const conn = await getDbConnection(cfg);
    await conn.query(`DELETE FROM \`${cfg.tablePrefix || 'cbq_'}daily_quizzes\` WHERE \`id\` = ?`, [req.params.id]);
    await conn.end();
    res.json({ success: true, message: 'تم حذف اليوم من قاعدة البيانات بنجاح.' });
  }));

  // --- Users: list (with submissions) ---
  const loadUsersWithSubmissions = async (conn: mysql.Connection, prefix: string): Promise<any[]> => {
    const [userRows] = await conn.query(`SELECT * FROM \`${prefix}users\` ORDER BY \`totalPoints\` DESC`);
    const [subRows] = await conn.query(`SELECT * FROM \`${prefix}submissions\` ORDER BY \`submittedAt\` ASC`);
    const subsByUser: Record<string, any[]> = {};
    for (const s of (subRows as any[])) {
      const key = String(s.userId);
      if (!subsByUser[key]) subsByUser[key] = [];
      subsByUser[key].push(normalizeSubmission(s));
    }
    return (userRows as any[]).map(u => normalizeUser(u, subsByUser[u.id] || []));
  };

  app.get('/api/users', handleDbRoute(async (_req, res, cfg) => {
    const conn = await getDbConnection(cfg);
    await ensureDbSchema(conn, cfg.tablePrefix || 'cbq_');
    const users = await loadUsersWithSubmissions(conn, cfg.tablePrefix || 'cbq_');
    await conn.end();
    res.json({ success: true, users });
  }));

  // --- Users: create (with duplicate email/phone protection) ---
  app.post('/api/users', handleDbRoute(async (req, res, cfg) => {
    const u = req.body?.user;
    const prefix = cfg.tablePrefix || 'cbq_';
    if (!u?.id || !u?.fullName) {
      return res.json({ success: false, message: 'بيانات المستخدم غير مكتملة.' });
    }
    const conn = await getDbConnection(cfg);
    await ensureDbSchema(conn, prefix);

    const [idRows] = await conn.query(`SELECT \`id\` FROM \`${prefix}users\` WHERE \`id\` = ?`, [u.id]);
    if ((idRows as any[]).length > 0) {
      await conn.end();
      return res.json({ success: false, message: 'هذا المستخدم مسجل بالفعل.' });
    }

    if (u.email) {
      const [emailRows] = await conn.query(`SELECT \`id\`, \`fullName\` FROM \`${prefix}users\` WHERE LOWER(\`email\`) = LOWER(?)`, [u.email.trim()]);
      if ((emailRows as any[]).length > 0) {
        await conn.end();
        return res.json({ success: false, message: `البريد الإلكتروني مستخدم بالفعل من قبل «${(emailRows as any[])[0].fullName}». جرب تسجيل الدخول أو استخدم بريداً آخر.` });
      }
    }
    if (u.phone) {
      const [phoneRows] = await conn.query(`SELECT \`id\`, \`fullName\` FROM \`${prefix}users\` WHERE REPLACE(REPLACE(\`phone\`, ' ', ''), '-', '') = ?`, [String(u.phone).replace(/\D/g, '')]);
      if ((phoneRows as any[]).length > 0) {
        await conn.end();
        return res.json({ success: false, message: `رقم الموبايل مسجل بالفعل من قبل «${(phoneRows as any[])[0].fullName}». جرب تسجيل الدخول أو استخدم رقماً آخر.` });
      }
    }

    await conn.query(
      `INSERT INTO \`${prefix}users\`
        (\`id\`, \`fullName\`, \`email\`, \`password\`, \`phone\`, \`ageGroup\`, \`role\`, \`totalPoints\`, \`quizzesSolved\`, \`currentStreak\`, \`registeredBy\`, \`servantNotes\`, \`createdAt\`)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [u.id, u.fullName, u.email || null, u.password || null, u.phone || '',
        u.ageGroup || 'senior', u.role || 'user', u.totalPoints || 0, u.quizzesSolved || 0,
        u.currentStreak || 0, u.registeredBy || 'self', u.servantNotes || null, nowMysql()]
    );
    await conn.end();
    res.json({ success: true, message: `تم إنشاء حساب «${u.fullName}» وحفظه في قاعدة البيانات بنجاح!`, user: normalizeUser(u) });
  }));

  // --- Users: update ---
  app.put('/api/users/:id', handleDbRoute(async (req, res, cfg) => {
    const u = req.body?.user;
    const uid = req.params.id;
    const prefix = cfg.tablePrefix || 'cbq_';
    if (!u || u.id !== uid) return res.json({ success: false, message: 'بيانات المستخدم غير مكتملة.' });
    const conn = await getDbConnection(cfg);
    await ensureDbSchema(conn, prefix);
    await conn.query(
      `UPDATE \`${prefix}users\` SET
        \`fullName\`=?, \`email\`=?, \`password\`=COALESCE(?, \`password\`), \`phone\`=?, \`ageGroup\`=?, \`role\`=?,
        \`totalPoints\`=?, \`quizzesSolved\`=?, \`currentStreak\`=?, \`registeredBy\`=?, \`servantNotes\`=?
      WHERE \`id\`=?`,
      [u.fullName, u.email || null, u.password || null, u.phone || '', u.ageGroup || 'senior',
        u.role || 'user', u.totalPoints || 0, u.quizzesSolved || 0, u.currentStreak || 0,
        u.registeredBy || 'self', u.servantNotes || null, uid]
    );
    await conn.end();
    res.json({ success: true, message: 'تم تحديث بيانات المستخدم في قاعدة البيانات.' });
  }));

  // --- Users: delete ---
  app.delete('/api/users/:id', handleDbRoute(async (req, res, cfg) => {
    const uid = req.params.id;
    if (uid === 'user-admin-kirillos') {
      return res.json({ success: false, message: 'لا يمكن حذف حساب المشرف العام!' });
    }
    const conn = await getDbConnection(cfg);
    await conn.query(`DELETE FROM \`${cfg.tablePrefix || 'cbq_'}users\` WHERE \`id\` = ?`, [uid]);
    await conn.end();
    res.json({ success: true, message: 'تم حذف المستخدم من قاعدة البيانات.' });
  }));

  // --- Auth: login (email or phone + password) ---
  // Works even BEFORE the Hostinger DB is configured, so the admin can sign in
  // and reach the dashboard where the DB connection form lives (setup mode).
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

  const matchesBuiltinAdmin = (identifier: string, password: string): boolean => {
    const cleanId = String(identifier || '').trim().toLowerCase();
    const idMatch = cleanId === BUILTIN_ADMIN.email.toLowerCase()
      || String(identifier || '').replace(/\D/g, '') === BUILTIN_ADMIN.phone;
    return idMatch && String(password || '').trim() === BUILTIN_ADMIN.password;
  };

  app.post('/api/auth/login', async (req, res) => {
    const { identifier, password } = req.body || {};
    if (!identifier) return res.json({ success: false, error: 'يرجى إدخال البريد أو رقم الهاتف.' });

    const cfg = readStoredDbConfig();

    // Setup mode: no DB configured yet — allow ONLY the built-in admin account
    // so the responsible server-sign-in can open the dashboard and save the DB settings.
    if (!cfg) {
      if (matchesBuiltinAdmin(identifier, password)) {
        return res.json({
          success: true,
          user: BUILTIN_ADMIN,
          message: 'وضع التهيئة: سجل دخولك بنجاح بحساب المشرف العام. افتح تبويب «قاعدة بيانات Hostinger» وأدخل بيانات الاتصال ثم اضغط حفظ.',
        });
      }
      return res.json({
        success: false,
        error: 'لم يتم حفظ بيانات الاتصال بقاعدة بيانات Hostinger بعد، لذلك لا يمكن تسجيل الدخول بحسابات المتسابقين. يمكنك الدخول فقط بحساب المشرف العام لضبط الاتصال بالقاعدة.',
      });
    }

    try {
      const prefix = cfg.tablePrefix || 'cbq_';
      const conn = await getDbConnection(cfg);
      await ensureDbSchema(conn, prefix);
      const [rows] = await conn.query(
        `SELECT * FROM \`${prefix}users\` WHERE LOWER(\`email\`) = LOWER(?) OR REPLACE(REPLACE(\`phone\`, ' ', ''), '-', '') = ? LIMIT 1`,
        [String(identifier).trim(), String(identifier).replace(/\D/g, '')]
      );
      const found = (rows as any[])[0];
      if (!found) {
        await conn.end();
        // The built-in admin can always sign in even if the DB row is missing
        if (matchesBuiltinAdmin(identifier, password)) {
          return res.json({ success: true, user: BUILTIN_ADMIN });
        }
        return res.json({ success: false, error: 'المستخدم غير موجود. تأكد من البريد أو رقم الهاتف أو أنشئ حساباً جديداً.' });
      }
      // Same rule as legacy local auth: empty stored password accepts any password
      if (found.password && found.password !== String(password || '').trim()) {
        await conn.end();
        return res.json({ success: false, error: 'كلمة المرور غير صحيحة. حاول مرة أخرى.' });
      }
      const [subRows] = await conn.query(
        `SELECT * FROM \`${prefix}submissions\` WHERE \`userId\` = ? ORDER BY \`submittedAt\` ASC`,
        [found.id]
      );
      await conn.end();
      const user = normalizeUser(found, (subRows as any[]).map(normalizeSubmission));
      res.json({ success: true, user });
    } catch (err: any) {
      console.error('Login DB error:', err);
      return res.json({
        success: false,
        message: getFriendlyErrorMessage(err, cfg.database, cleanHostString(cfg.host)),
      });
    }
  });

  // --- Submissions: save (transactional, first attempt only) ---
  app.post('/api/submissions', handleDbRoute(async (req, res, cfg) => {
    const { userId, submission } = req.body || {};
    const prefix = cfg.tablePrefix || 'cbq_';
    if (!userId || !submission?.quizId) {
      return res.json({ success: false, message: 'بيانات الحل غير مكتملة.' });
    }
    const conn = await getDbConnection(cfg);
    await ensureDbSchema(conn, prefix);
    await conn.beginTransaction();
    try {
      const [existing] = await conn.query(
        `SELECT \`id\` FROM \`${prefix}submissions\` WHERE \`userId\` = ? AND \`quizId\` = ? FOR UPDATE`,
        [userId, submission.quizId]
      );
      if ((existing as any[]).length > 0) {
        // Already solved before — first submission is final (fairness lock)
        const [uRows] = await conn.query(`SELECT * FROM \`${prefix}users\` WHERE \`id\` = ?`, [userId]);
        const [sRows] = await conn.query(`SELECT * FROM \`${prefix}submissions\` WHERE \`userId\` = ? AND \`quizId\` = ?`, [userId, submission.quizId]);
        await conn.commit();
        await conn.end();
        return res.json({
          success: true,
          alreadySolved: true,
          user: normalizeUser((uRows as any[])[0], (sRows as any[]).map(normalizeSubmission)),
          message: 'تم اعتماد إجابتك من المحاولة الأولى بالفعل (قاعدة العدالة).',
        });
      }

      await conn.query(
        `INSERT INTO \`${prefix}submissions\` (\`userId\`, \`quizId\`, \`dayNumber\`, \`score\`, \`maxScore\`, \`answersJson\`, \`status\`, \`submittedAt\`)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, submission.quizId, submission.dayNumber || null, submission.score || 0,
          submission.maxScore || 0,
          JSON.stringify({ answers: submission.answers || {}, adminNotes: submission.adminNotes || null }),
          submission.status || 'graded', nowMysql()]
      );
      await conn.query(
        `UPDATE \`${prefix}users\` SET
          \`totalPoints\` = \`totalPoints\` + ?,
          \`quizzesSolved\` = \`quizzesSolved\` + 1,
          \`currentStreak\` = \`currentStreak\` + 1
        WHERE \`id\` = ?`,
        [submission.score || 0, userId]
      );
      await conn.commit();

      const [uRows] = await conn.query(`SELECT * FROM \`${prefix}users\` WHERE \`id\` = ?`, [userId]);
      const [sRows] = await conn.query(`SELECT * FROM \`${prefix}submissions\` WHERE \`userId\` = ? AND \`quizId\` = ?`, [userId, submission.quizId]);
      await conn.end();
      return res.json({
        success: true,
        user: normalizeUser((uRows as any[])[0], (sRows as any[]).map(normalizeSubmission)),
        message: 'تم تسجيل إجاباتك وحفظها في قاعدة البيانات بنجاح!',
      });
    } catch (txErr: any) {
      await conn.rollback().catch(() => {});
      await conn.end().catch(() => {});
      console.error('Submission transaction failed:', txErr);
      return res.json({ success: false, message: `تعذر حفظ إجاباتك: ${txErr.message}` });
    }
  }));

  // --- Points: admin adjust (transactional user update + log entry) ---
  app.post('/api/points', handleDbRoute(async (req, res, cfg) => {
    const { userId, delta, reason, adminName } = req.body || {};
    const prefix = cfg.tablePrefix || 'cbq_';
    if (!userId || !delta) return res.json({ success: false, message: 'بيانات تعديل النقاط غير مكتملة.' });
    const conn = await getDbConnection(cfg);
    await ensureDbSchema(conn, prefix);
    await conn.beginTransaction();
    try {
      await conn.query(
        `UPDATE \`${prefix}users\` SET \`totalPoints\` = GREATEST(0, \`totalPoints\` + ?) WHERE \`id\` = ?`,
        [Math.trunc(delta), userId]
      );
      await conn.query(
        `INSERT INTO \`${prefix}point_logs\` (\`id\`, \`userId\`, \`userName\`, \`pointsChange\`, \`reason\`, \`adminName\`, \`createdAt\`)
        SELECT ?, \`id\`, \`fullName\`, ?, ?, ?, ? FROM \`${prefix}users\` WHERE \`id\` = ?`,
        [`log-${Date.now()}-${Math.floor(Math.random() * 1000)}`, Math.trunc(delta), reason || 'تعديل نقاط',
          adminName || 'الخادم المشرف', nowMysql(), userId]
      );
      await conn.commit();
      const [uRows] = await conn.query(`SELECT * FROM \`${prefix}users\` WHERE \`id\` = ?`, [userId]);
      await conn.end();
      if ((uRows as any[]).length === 0) return res.json({ success: false, message: 'المستخدم غير موجود.' });
      return res.json({ success: true, user: normalizeUser((uRows as any[])[0]), message: 'تم تعديل النقاط وحفظها في قاعدة البيانات.' });
    } catch (txErr: any) {
      await conn.rollback().catch(() => {});
      await conn.end().catch(() => {});
      return res.json({ success: false, message: `تعذر تعديل النقاط: ${txErr.message}` });
    }
  }));

  // --- Point logs: list ---
  app.get('/api/point-logs', handleDbRoute(async (_req, res, cfg) => {
    const conn = await getDbConnection(cfg);
    await ensureDbSchema(conn, cfg.tablePrefix || 'cbq_');
    const [rows] = await conn.query(
      `SELECT * FROM \`${cfg.tablePrefix || 'cbq_'}point_logs\` ORDER BY \`createdAt\` DESC`
    );
    await conn.end();
    const logs = (rows as any[]).map(l => ({
      id: l.id,
      userId: l.userId,
      userName: l.userName,
      change: Number(l.pointsChange) || 0,
      reason: l.reason,
      date: String(l.createdAt || ''),
      adminName: l.adminName,
    }));
    res.json({ success: true, logs });
  }));

  // Global API error handler returning JSON

  app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({
      success: false,
      message: err?.message || 'حدث خطأ في معالجة الطلب.',
    });
  });


  // --- Vite dev server / production static files ---
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
