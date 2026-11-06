<?php
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

$EXPECTED_SECRET = 'cbq_sec_9a7d4f128e';
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

$dbHost = 'localhost';
$dbName = 'bible_quiz';
$dbUser = 'root';
$dbPass = '';
$prefix = 'cbq_';

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
        'verses' => bridgeSafeParse($q['versesJson'] ?? '[]', []),
        'questions' => bridgeSafeParse($q['questionsJson'] ?? '[]', []),
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
