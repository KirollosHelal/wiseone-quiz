import React, { useState, useEffect } from 'react';
import { 
  PlusCircle, BookOpen, Users, Award, Trash2, Edit3, 
  CheckCircle, FileText, Download, Upload, RefreshCw, 
  Plus, Check, X, SlidersHorizontal, UserPlus, Sparkles,
  Database, Server, Copy, ExternalLink, ShieldCheck, AlertCircle, Calendar, Star,
  Link2, Zap, Globe, FileCode, CheckCircle2, Shield, Info, ArrowRight, Lock
} from 'lucide-react';
import { DailyQuiz, Question, QuestionType, User, ScriptureVerse, DatabaseConfig } from '../types';
import { StorageService, STORAGE_CHANGE_EVENT } from '../services/storage';

const requestAppDataRefresh = () => {
  window.dispatchEvent(new CustomEvent(STORAGE_CHANGE_EVENT));
};

interface AdminDashboardProps {
  quizzes: DailyQuiz[];
  users: User[];
  currentUser: User;
  onOpenAdjustPoints: (user: User) => void;
  onOpenRegisterUser: () => void;
  onSelectQuizToRead: (quiz: DailyQuiz) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  quizzes,
  users,
  currentUser,
  onOpenAdjustPoints,
  onOpenRegisterUser,
  onSelectQuizToRead,
}) => {
  const [activeTab, setActiveTab] = useState<'quizzes' | 'users' | 'add_quiz' | 'point_logs' | 'database'>('quizzes');

  // New Chapter Form State
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [dayNumber, setDayNumber] = useState<number>(quizzes.length + 1);
  const [dayLabel, setDayLabel] = useState<string>(`اليوم ${quizzes.length + 1}`);
  const [isMainToday, setIsMainToday] = useState<boolean>(true);
  const [bookName, setBookName] = useState<string>('إنجيل متى');
  const [chapterNumber, setChapterNumber] = useState<number>(5);
  const [testament, setTestament] = useState<'old' | 'new'>('new');
  const [chapterTitle, setChapterTitle] = useState<string>('الموعظة على الجبل - التطويبات ونور العالم');
  const [keyVerse, setKeyVerse] = useState<string>('طُوبَى لِلأَنْقِيَاءِ الْقَلْبِ، لأَنَّهُمْ يُعَايِنُونَ اللهَ. (مت 5: 8)');
  const [reflection, setReflection] = useState<string>('دستور الحياة المسيحية ونقاء القلب لنكون نوراً وملحاً للعالم.');
  const [audioUrl, setAudioUrl] = useState<string>('https://media.blubrry.com/coptic_audio/archive.org/download/StTakla.Org-Arabic-Bible-Audio-01-Matthew/40_Matthew_05.mp3');
  const [audioDuration, setAudioDuration] = useState<string>('6:15');
  const [quizDate, setQuizDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [versesText, setVersesText] = useState<string>(
    '1 وَلَمَّا رَأَى الْجُمُوعَ صَعِدَ إِلَى الْجَبَلِ، فَلَمَّا جَلَسَ تَقَدَّمَ إِلَيْهِ تَلاَمِيذُهُ.\n2 فَفَتَحَ فَاهُ وَعَلَّمَهُمْ قَائِلاً:\n3 «طُوبَى لِلْمَسَاكِينِ بِالرُّوحِ، لأَنَّ لَهُمْ مَلَكُوتَ السَّمَاوَاتِ.\n4 طُوبَى لِلْحَزَانَى، لأَنَّهُمْ يُعَزَّوْنَ.\n5 طُوبَى لِلْوُدَعَاءِ، لأَنَّهُمْ يَرِثُونَ الأَرْضَ.\n8 طُوبَى لِلأَنْقِيَاءِ الْقَلْبِ، لأَنَّهُمْ يُعَايِنُونَ اللهَ.\n14 أَنْتُمْ نُورُ الْعَالَمِ. لاَ يُمْكِنُ أَنْ تُخْفَى مَدِينَةٌ مَوْضُوعَةٌ عَلَى جَبَلٍ.'
  );

  // Questions for the new/edited quiz
  const [questionsList, setQuestionsList] = useState<Question[]>([
    {
      id: 'q-demo-1',
      type: 'multiple_choice',
      title: 'ما هي مكافأة أنقياء القلب حسب الموعظة على الجبل في الآية 8؟',
      options: ['يعاينون الله', 'يرثون الأرض', 'يملكون الذهب', 'يعلمون الأمم'],
      correctAnswerIndex: 0,
      points: 5,
      verseReference: 'متى 5: 8',
      explanation: 'الآية 8: «طُوبَى لِلأَنْقِيَاءِ الْقَلْبِ، لأَنَّهُمْ يُعَايِنُونَ اللهَ».'
    }
  ]);

  // Current question builder state
  const [isAddingQuestion, setIsAddingQuestion] = useState<boolean>(false);
  const [selectedQuestionType, setSelectedQuestionType] = useState<QuestionType>('multiple_choice');
  const [qTitle, setQTitle] = useState<string>('');
  const [qPoints, setQPoints] = useState<number>(5);
  const [qExplanation, setQExplanation] = useState<string>('');
  const [qVerseRef, setQVerseRef] = useState<string>('');

  // Fields for multiple choice
  const [mcOptions, setMcOptions] = useState<string[]>(['', '', '', '']);
  const [mcCorrectIdx, setMcCorrectIdx] = useState<number>(0);

  // Fields for complete verse
  const [completeVerseWithBlank, setCompleteVerseWithBlank] = useState<string>('طُوبَى لِلْحَزَانَى، لأَنَّهُمْ [...]');
  const [completeBlankAnswer, setCompleteBlankAnswer] = useState<string>('يُعَزَّوْنَ');
  const [completeWordBank, setCompleteWordBank] = useState<string>('يُعَزَّوْنَ، يَفْرَحُونَ، يَمْلِكُونَ');

  // Fields for true/false
  const [tfStatement, setTfStatement] = useState<string>('قال السيد المسيح: أنتم نور العالم ولا يمكن أن تخفى مدينة على جبل');
  const [tfIsCorrect, setTfIsCorrect] = useState<boolean>(true);

  // Fields for short answer
  const [saPrompt, setSaPrompt] = useState<string>('كيف نكون نوراً للعالم في سلوكنا اليومي حسب تعاليم المسيح؟');
  const [saModelAnswer, setSaModelAnswer] = useState<string>('بأعمالنا الصالحة ومحبتنا ليمجدوا أبانا الذي في السماوات');
  const [saKeywords, setSaKeywords] = useState<string>('أعمال صالحة, محبة, سلام, نور, تمجيد الله');

  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // Database Tab States (Hostinger MySQL / phpMyAdmin / PHP Bridge)
  const [dbConfig, setDbConfig] = useState<DatabaseConfig>(() => StorageService.getDatabaseConfig());
  // The PHP bridge is the primary (and only) working flow on static hosting,
  // while 'direct' works when the app runs with the Node.js server.
  const [activeDbTab, setActiveDbTab] = useState<'bridge' | 'direct' | 'phpmyadmin'>('bridge');
  const [isTestingDb, setIsTestingDb] = useState(false);
  const [dbTestResult, setDbTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSyncingTables, setIsSyncingTables] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);
  const [pointLogs, setPointLogs] = useState<any[]>([]);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedIp, setCopiedIp] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Load point logs from the MySQL DB, and keep them fresh on data changes
  useEffect(() => {
    let cancelled = false;
    const loadLogs = () => {
      StorageService.getPointLogs()
        .then(l => { if (!cancelled) setPointLogs(l); })
        .catch(() => { if (!cancelled) setPointLogs([]); });
    };
    loadLogs();
    window.addEventListener(STORAGE_CHANGE_EVENT, loadLogs);
    return () => {
      cancelled = true;
      window.removeEventListener(STORAGE_CHANGE_EVENT, loadLogs);
    };
  }, []);

  const resetQuestionForm = () => {
    setIsAddingQuestion(false);
    setQTitle('');
    setQPoints(5);
    setQExplanation('');
    setQVerseRef('');
    setMcOptions(['', '', '', '']);
    setMcCorrectIdx(0);
    setCompleteVerseWithBlank('');
    setCompleteBlankAnswer('');
    setCompleteWordBank('');
    setTfStatement('');
    setTfIsCorrect(true);
    setSaPrompt('');
    setSaModelAnswer('');
    setSaKeywords('');
  };

  const handleSaveQuestion = () => {
    if (!qTitle.trim() && selectedQuestionType !== 'complete' && selectedQuestionType !== 'true_false' && selectedQuestionType !== 'short_answer') {
      alert('يرجى كتابة نص السؤال');
      return;
    }

    let newQ: Question;

    if (selectedQuestionType === 'multiple_choice') {
      const validOptions = mcOptions.map(o => o.trim()).filter(Boolean);
      if (validOptions.length < 2) {
        alert('يرجى إدخال خيارين على الأقل');
        return;
      }
      newQ = {
        id: 'q-' + Date.now(),
        type: 'multiple_choice',
        title: qTitle.trim(),
        options: validOptions,
        correctAnswerIndex: Math.min(mcCorrectIdx, validOptions.length - 1),
        points: qPoints,
        explanation: qExplanation.trim(),
        verseReference: qVerseRef.trim(),
      };
    } else if (selectedQuestionType === 'complete') {
      newQ = {
        id: 'q-' + Date.now(),
        type: 'complete',
        title: qTitle.trim() || 'أكمل الآية المباركة:',
        verseWithBlank: completeVerseWithBlank.trim(),
        blankAnswer: completeBlankAnswer.trim(),
        wordBank: completeWordBank.split(/[,،]+/).map(w => w.trim()).filter(Boolean),
        points: qPoints,
        explanation: qExplanation.trim(),
        verseReference: qVerseRef.trim(),
      };
    } else if (selectedQuestionType === 'true_false') {
      newQ = {
        id: 'q-' + Date.now(),
        type: 'true_false',
        title: qTitle.trim() || 'صح أم خطأ:',
        statement: tfStatement.trim(),
        isCorrect: tfIsCorrect,
        points: qPoints,
        explanation: qExplanation.trim(),
        verseReference: qVerseRef.trim(),
      };
    } else {
      newQ = {
        id: 'q-' + Date.now(),
        type: 'short_answer',
        title: qTitle.trim() || 'سؤال مقالي أو تأملي:',
        questionPrompt: saPrompt.trim(),
        modelAnswer: saModelAnswer.trim(),
        keywords: saKeywords.split(/[,،]+/).map(k => k.trim()).filter(Boolean),
        maxPoints: qPoints,
        points: qPoints,
        explanation: qExplanation.trim(),
        verseReference: qVerseRef.trim(),
      };
    }

    setQuestionsList(prev => [...prev, newQ]);
    resetQuestionForm();
  };

  const handleDeleteQuestion = (qId: string) => {
    setQuestionsList(prev => prev.filter(q => q.id !== qId));
  };

  const parseVersesFromText = (raw: string): ScriptureVerse[] => {
    const lines = raw.split('\n').filter(l => l.trim().length > 0);
    return lines.map((line, idx) => {
      const match = line.match(/^(\d+)[\s.:-]+(.*)/);
      if (match) {
        return { verse: parseInt(match[1]), text: match[2].trim() };
      }
      return { verse: idx + 1, text: line.trim() };
    });
  };

  const handleSaveWholeQuiz = async (e: React.FormEvent) => {
    e.preventDefault();

    if (questionsList.length === 0) {
      alert('يرجى إضافة سؤال واحد على الأقل قبل حفظ الأصحاح');
      return;
    }

    const parsedVerses = parseVersesFromText(versesText);
    const totalPts = questionsList.reduce((sum, q) => sum + q.points, 0);

    const newQuiz: DailyQuiz = {
      id: editingQuizId || 'quiz-day-' + dayNumber + '-' + Date.now(),
      dayNumber: Number(dayNumber),
      dayLabel: dayLabel.trim() || `اليوم ${dayNumber}`,
      isMainToday: isMainToday,
      date: quizDate,
      testament,
      bookName: bookName.trim(),
      chapterNumber: Number(chapterNumber),
      title: chapterTitle.trim(),
      keyVerse: keyVerse.trim(),
      reflection: reflection.trim(),
      audioUrl: audioUrl.trim(),
      audioDuration: audioDuration.trim() || '5:00',
      verses: parsedVerses,
      questions: questionsList,
      totalPoints: totalPts,
      published: true,
    };

    try {
      await StorageService.saveOrUpdateQuiz(newQuiz);
      setSaveSuccessNotice(`تم حفظ مسابقة «${newQuiz.dayLabel}» في قاعدة البيانات بنجاح!`);
      setTimeout(() => {
        setSaveSuccessNotice(null);
        setActiveTab('quizzes');
        setEditingQuizId(null);
      }, 1500);
    } catch (err: any) {
      alert(err?.message || 'تعذر حفظ المسابقة في قاعدة البيانات.');
    }
  };

  const handleEditQuiz = (q: DailyQuiz) => {
    setEditingQuizId(q.id);
    setDayNumber(q.dayNumber || 1);
    setDayLabel(q.dayLabel || `اليوم ${q.dayNumber || 1}`);
    setIsMainToday(!!q.isMainToday);
    setBookName(q.bookName);
    setChapterNumber(q.chapterNumber);
    setTestament(q.testament);
    setChapterTitle(q.title);
    setKeyVerse(q.keyVerse);
    setReflection(q.reflection);
    setAudioUrl(q.audioUrl);
    setAudioDuration(q.audioDuration || '5:00');
    setQuizDate(q.date);
    setVersesText(q.verses.map(v => `${v.verse} ${v.text}`).join('\n'));
    setQuestionsList(q.questions);
    setActiveTab('add_quiz');
  };

  const handleDeleteQuiz = async (quizId: string) => {
    if (confirm('هل أنت متأكد من حذف هذا اليوم ومسابقته؟ سيتم الحذف نهائياً من قاعدة البيانات.')) {
      try {
        await StorageService.deleteQuiz(quizId);
      } catch (err: any) {
        alert(err?.message || 'تعذر الحذف من قاعدة البيانات.');
      }
    }
  };

  // Helper to safely parse API responses even if proxy/server returns HTML
  const parseSafeApiResponse = async (res: Response, fallbackMsg: string) => {
    try {
      const text = await res.text();
      if (!text) {
        return { success: false, message: fallbackMsg };
      }
      if (text.trim().startsWith('<') || text.includes('<!DOCTYPE') || text.includes('<html')) {
        return {
          success: false,
          message: 'انتهت مهلة استجابة الخادم أثناء محاولة الاتصال بـ Hostinger عبر المنفذ 3306. جدار الحماية (Firewall) في استضافة Hostinger يمنع الاتصالات الخارجية المباشرة. يُرجى استخدام «جسر PHP المباشر (Hostinger Bridge)» المتاح في التبويب الأول فهو يتصل فوراً ومضمون 100% بدون أي حظر!',
        };
      }
      return JSON.parse(text);
    } catch {
      return {
        success: false,
        message: fallbackMsg,
      };
    }
  };

  // --- PHP Bridge Handlers (Hostinger Zero-Firewall Solution) ---
  const handleDownloadPhpBridge = () => {
    StorageService.saveDatabaseConfig(dbConfig);
    const phpCode = StorageService.generatePhpSyncBridgeScript();
    const blob = new Blob([phpCode], { type: 'application/x-httpd-php;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'bible_sync.php');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /**
   * Calls the uploaded bible_sync.php directly from the browser — works on static
   * hosting too (the old Node relay endpoints 404 there). Throws with a clear
   * Arabic error message when anything goes wrong.
   */
  const callBridgeDirectly = async (action: string, extra: Record<string, unknown> = {}) => {
    const url = (dbConfig.bridgeUrl || '').trim();
    let data: any;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, secret: dbConfig.bridgeSecret || '', ...extra }),
      });
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`الرد من الجسر ليس JSON (الرد يبدأ بـ: ${text.slice(0, 80)}). تأكد أن الملف مرفوع بشكل صحيح رفعه بصيغة PHP سليمة.`);
      }
    } catch (err: any) {
      if (err instanceof TypeError) {
        throw new Error(`تعذر الوصول إلى «${url}». تأكد من صحة الرابط ومن رفع الملف على الاستضافة ومن عدم منع الطلبات الخارجية (CORS).`);
      }
      throw err;
    }
    if (data && data.success === false) {
      throw new Error(data.message || data.error || 'فشل تنفيذ العملية عبر جسر PHP.');
    }
    return data;
  };

  const handleTestBridge = async () => {
    if (!dbConfig.bridgeUrl?.trim()) {
      setDbTestResult({
        success: false,
        message: 'يرجى كتابة رابط ملف bible_sync.php الذي رفعته على استضافة Hostinger أولاً.',
      });
      return;
    }

    setIsTestingDb(true);
    setDbTestResult(null);
    StorageService.saveDatabaseConfig(dbConfig);

    try {
      const data = await callBridgeDirectly('test');
      setDbTestResult({
        success: true,
        message: data.message || 'تم الاتصال بنجاح عبر جسر PHP!',
      });
      setDbConfig(prev => ({ ...prev, isConnected: true, lastChecked: new Date().toLocaleTimeString('ar-EG') }));
      StorageService.saveDatabaseConfig({ ...dbConfig, isConnected: true });
    } catch (err: any) {
      setDbTestResult({
        success: false,
        message: `تعذر الاتصال بملف الجسر: ${err.message}`,
      });
    } finally {
      setIsTestingDb(false);
    }
  };

  const handleSyncTablesViaBridge = async () => {
    if (!dbConfig.bridgeUrl?.trim()) {
      setSyncResult({
        success: false,
        message: 'يرجى كتابة رابط ملف bible_sync.php أولاً.',
      });
      return;
    }

    setIsSyncingTables(true);
    setSyncResult(null);

    try {
      const data = await callBridgeDirectly('sync_tables');
      setSyncResult({
        success: true,
        message: data.message || 'تم إنشاء وتحديث الجداول بنجاح!',
      });
      setDbConfig(prev => ({ ...prev, isConnected: true }));
      StorageService.saveDatabaseConfig({ ...dbConfig, isConnected: true });
    } catch (err: any) {
      setSyncResult({
        success: false,
        message: `تعذر إنشاء الجداول: ${err.message}`,
      });
    } finally {
      setIsSyncingTables(false);
    }
  };

  const handlePullViaBridge = async () => {
    if (!dbConfig.bridgeUrl?.trim()) {
      setDbTestResult({
        success: false,
        message: 'يرجى كتابة رابط ملف bible_sync.php أولاً.',
      });
      return;
    }

    setIsTestingDb(true);
    setDbTestResult(null);

    try {
      const data = await callBridgeDirectly('pull');
      // DB is the single source of truth — trigger a fresh reload through the bridge
      requestAppDataRefresh();
      setDbTestResult({
        success: true,
        message: data.message || 'تم الاتصال بجسر PHP بنجاح! البيانات تُجلب الآن من قاعدة البيانات مباشرة.',
      });
      setDbConfig(prev => ({ ...prev, isConnected: true, lastChecked: new Date().toLocaleTimeString('ar-EG') }));
      StorageService.saveDatabaseConfig({ ...dbConfig, isConnected: true });
    } catch (err: any) {
      setDbTestResult({
        success: false,
        message: `خطأ في جلب البيانات: ${err.message}`,
      });
    } finally {
      setIsTestingDb(false);
    }
  };

  const handlePushViaBridge = async () => {
    if (!dbConfig.bridgeUrl?.trim()) {
      setSyncResult({
        success: false,
        message: 'يرجى كتابة رابط ملف bible_sync.php أولاً.',
      });
      return;
    }

    setIsSyncingTables(true);
    setSyncResult(null);

    try {
      // Push the live app data (already loaded from the DB) via the bridge
      const data = await callBridgeDirectly('push', { quizzes, users });
      setSyncResult({
        success: true,
        message: data.message || 'تم حفظ ومزامنة البيانات في Hostinger بنجاح!',
      });
      setDbConfig(prev => ({ ...prev, isConnected: true }));
      StorageService.saveDatabaseConfig({ ...dbConfig, isConnected: true });
    } catch (err: any) {
      setSyncResult({
        success: false,
        message: `خطأ في رفع البيانات: ${err.message}`,
      });
    } finally {
      setIsSyncingTables(false);
    }
  };

  const copyServerIp = () => {
    navigator.clipboard.writeText('34.96.62.46');
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 2000);
  };

  const copyBridgeSecret = () => {
    navigator.clipboard.writeText(dbConfig.bridgeSecret || '');
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  // --- Direct MySQL Connection Handlers ---
  // Uses StorageService.connectDatabase which works in BOTH modes:
  // Node hosting (/api/db/config server-side) AND static hosting
  // (falls back to the PHP bridge to create the tables).
  const handleTestDatabaseConnection = async () => {
    setIsTestingDb(true);
    setDbTestResult(null);

    StorageService.saveDatabaseConfig(dbConfig);

    try {
      const message = await StorageService.connectDatabase(dbConfig, false);
      StorageService.saveDatabaseConfig({ ...dbConfig, isConnected: true });
      requestAppDataRefresh();
      setDbTestResult({
        success: true,
        message: message || 'تم حفظ الاتصال وتفعيله بنجاح! كل العمليات الآن عبر قاعدة البيانات.',
      });
    } catch (err: any) {
      setDbTestResult({
        success: false,
        message: `تعذر الاتصال بسيرفر Hostinger: ${err.message || 'تأكد من إتاحة الاتصال الخارجي في Remote MySQL أو استخدم جسر PHP'}.`,
      });
    } finally {
      setIsTestingDb(false);
    }
  };

  const handleSyncTables = async () => {
    setIsSyncingTables(true);
    setSyncResult(null);

    try {
      const res = await fetch('/api/db/sync-tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbConfig),
      });
      const data = await parseSafeApiResponse(
        res,
        'تعذر إنشاء الجداول في السيرفر. يمكنك تنزيل ملف SQL أو استخدام جسر PHP.'
      );
      setSyncResult({
        success: Boolean(data.success),
        message: data.message || (data.success ? 'تم إنشاء الجداول بنجاح!' : 'تعذر إنشاء الجداول.'),
      });
      if (data.success) {
        setDbConfig(prev => ({ ...prev, isConnected: true }));
        StorageService.saveDatabaseConfig({ ...dbConfig, isConnected: true });
      }
    } catch (err: any) {
      setSyncResult({
        success: false,
        message: `تعذر تنفيذ سكربت الجداول: ${err.message}${err?.code === 'BAD_JSON' ? ' — إذا كان موقعك مستضافاً حجباً بدون Node.js، استخدم تبويب «جسر PHP المباشر» بدلاً من هذا.' : ''}`,
      });
    } finally {
      setIsSyncingTables(false);
    }
  };

  const handlePullFromMysql = async () => {
    setIsTestingDb(true);
    setDbTestResult(null);

    try {
      const res = await fetch('/api/db/pull-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbConfig),
      });
      const data = await parseSafeApiResponse(res, 'فشل جلب البيانات من Hostinger.');
      if (data.success) {
        // DB is the single source of truth — trigger a fresh reload from the API
        requestAppDataRefresh();
        setDbTestResult({
          success: true,
          message: data.message || 'تم التأكيد أن الاتصال المباشر بقاعدة بيانات Hostinger يعمل بنجاح!',
        });
        setDbConfig(prev => ({ ...prev, isConnected: true, lastChecked: new Date().toLocaleTimeString('ar-EG') }));
        StorageService.saveDatabaseConfig({ ...dbConfig, isConnected: true });
      } else {
        setDbTestResult({
          success: false,
          message: data.message || 'تعذر الاتصال بـ Hostinger.',
        });
      }
    } catch (err: any) {
      setDbTestResult({
        success: false,
        message: `خطأ في جلب البيانات: ${err.message}${err?.code === 'BAD_JSON' ? ' — إذا كان موقعك بدون Node.js، استخدم تبويب «جسر PHP المباشر».' : ''}`,
      });
    } finally {
      setIsTestingDb(false);
    }
  };

  const handlePushToMysql = async () => {
    setIsSyncingTables(true);
    setSyncResult(null);

    try {
      // Push the live app data (already loaded from the DB) to MySQL
      const currentQuizzes = quizzes;
      const currentUsers = users;

      const res = await fetch('/api/db/push-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: dbConfig,
          quizzes: currentQuizzes,
          users: currentUsers,
        }),
      });
      const data = await parseSafeApiResponse(res, 'فشل رفع البيانات إلى Hostinger.');
      setSyncResult({
        success: Boolean(data.success),
        message: data.message || (data.success ? 'تم رفع البيانات بنجاح!' : 'فشل رفع البيانات.'),
      });
      if (data.success) {
        setDbConfig(prev => ({ ...prev, isConnected: true }));
        StorageService.saveDatabaseConfig({ ...dbConfig, isConnected: true });
      }
    } catch (err: any) {
      setSyncResult({
        success: false,
        message: `خطأ في رفع البيانات: ${err.message}${err?.code === 'BAD_JSON' ? ' — إذا كان موقعك بدون Node.js، استخدم زر «رفع البيانات» في تبويب «جسر PHP المباشر».' : ''}`,
      });
    } finally {
      setIsSyncingTables(false);
    }
  };

  // Download SQL for phpMyAdmin
  const handleDownloadSql = () => {
    const sql = StorageService.generatePhpMyAdminSql();
    const blob = new Blob([sql], { type: 'text/sql;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `coptic_bible_quiz_${dbConfig.database || 'db'}.sql`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy SQL script to clipboard
  const handleCopySql = () => {
    const sql = StorageService.generatePhpMyAdminSql();
    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const logs = pointLogs;

  return (
    <div className="space-y-6 sm:space-y-8 w-full max-w-6xl mx-auto overflow-hidden">
      {/* Top Banner */}
      <div className="w-full bg-stone-900 text-stone-100 rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xl border border-stone-800 flex flex-col md:flex-row items-center justify-between gap-5 sm:gap-6">
        <div>
          <span className="text-amber-400 font-bold text-xs flex items-center gap-1.5 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            لوحة تحكم المشرف العام 
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            إدارة مسابقة الأيام وقاعدة البيانات
          </h1>
          <p className="text-stone-400 text-xs sm:text-sm mt-1">
            إضافة أيام جديدة، تسجيل وتعديل نقاط المخدومين، وربط قاعدة بيانات Hostinger عبر phpMyAdmin
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setEditingQuizId(null);
              setDayNumber(quizzes.length + 1);
              setDayLabel(`اليوم ${quizzes.length + 1}`);
              setActiveTab('add_quiz');
            }}
            className="flex items-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl text-sm shadow-md transition-all cursor-pointer whitespace-nowrap"
          >
            <PlusCircle className="w-4 h-4" />
            <span>إضافة يوم ومسابقة جديدة</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-2 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 scrollbar-none">
        {[
          { id: 'quizzes', label: '📅 أيام المسابقة والأرشيف', count: quizzes.length },
          { id: 'users', label: '👥 المتسابقون والمخدومون', count: users.length },
          { id: 'add_quiz', label: editingQuizId ? '✏️ تعديل اليوم' : '➕ إضافة يوم جديد' },
          { id: 'point_logs', label: '📜 سجل النقاط', count: logs.length },
          { id: 'database', label: '🗄️ قاعدة بيانات Hostinger (SQL)' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 sm:gap-2 shrink-0 ${
              activeTab === tab.id
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={`px-1.5 sm:px-2 py-0.2 sm:py-0.5 rounded-full text-[11px] sm:text-xs ${
                activeTab === tab.id ? 'bg-amber-800 text-amber-100' : 'bg-stone-200 text-stone-700'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: Quizzes / Days List */}
      {activeTab === 'quizzes' && (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-md divide-y divide-stone-100 overflow-hidden">
          <div className="p-5 flex items-center justify-between">
            <h3 className="font-bold text-stone-900 text-base">الأيام المنشورة بالمسابقة</h3>
            <span className="text-xs text-stone-500">{quizzes.length} يوم متاح للمتسابقين</span>
          </div>

          {[...quizzes].sort((a, b) => (b.dayNumber || 0) - (a.dayNumber || 0)).map((q) => (
            <div key={q.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-stone-50">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-amber-900 bg-amber-100 px-3 py-1 rounded-xl">
                    اليوم {q.dayNumber}
                  </span>
                  {q.isMainToday && (
                    <span className="text-xs font-bold bg-amber-500 text-stone-950 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                      <Star className="w-3 h-3 fill-current" />
                      اليوم الرئيسي الحالي
                    </span>
                  )}
                  {StorageService.isQuizLockedFuture(q.date) && (
                    <span className="text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-lg flex items-center gap-1 shadow-xs">
                      <Lock className="w-3 h-3 text-amber-700" />
                      <span>مغلق للمتسابقين (يفتح في {q.date})</span>
                    </span>
                  )}
                  <span className="text-xs text-stone-500 font-mono font-bold">
                    {q.date}
                  </span>
                </div>
                <h4 className="font-extrabold text-stone-900 text-lg">
                  {q.bookName} - الأصحاح {q.chapterNumber}
                </h4>
                <p className="text-xs text-stone-600">{q.title}</p>
                <div className="flex items-center gap-3 text-xs text-stone-500 pt-1">
                  <span>{q.verses.length} آية</span>
                  <span>·</span>
                  <span className="font-bold text-amber-700">{q.questions.length} أسئلة ({q.totalPoints} نقطة)</span>
                  <span>·</span>
                  <span>مدة الصوت: {q.audioDuration || '5:00'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-center">
                {!q.isMainToday && (
                  <button
                    onClick={() => { StorageService.setMainDay(q.id).catch((e: any) => alert(e?.message || 'تعذر تعيين اليوم الرئيسي من قاعدة البيانات.')); }}
                    className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    title="جعله اليوم الرئيسي الحالي"
                  >
                    تعيين كـ رئيسي
                  </button>
                )}
                <button
                  onClick={() => onSelectQuizToRead(q)}
                  className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  معاينة
                </button>
                <button
                  onClick={() => handleEditQuiz(q)}
                  className="px-3.5 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>تعديل</span>
                </button>
                <button
                  onClick={() => handleDeleteQuiz(q.id)}
                  className="p-2 text-stone-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition-colors cursor-pointer"
                  title="حذف هذا اليوم"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: Users Management & Points Adjust */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-md overflow-hidden space-y-4">
          <div className="p-5 border-b border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-stone-900 text-base">قائمة المتسابقين والمخدومين</h3>
              <p className="text-xs text-stone-500">تسجيل مخدومين جدد أو تعديل رصيد النقاط لأي متسابق</p>
            </div>
            <button
              onClick={onOpenRegisterUser}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>تسجيل مخدوم جديد</span>
            </button>
          </div>

          <div className="divide-y divide-stone-100">
            {users.map((u) => (
              <div key={u.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-stone-50">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-stone-900 text-base">{u.fullName}</h4>
                    {u.role === 'admin' && (
                      <span className="text-[10px] bg-amber-500 text-stone-950 font-black px-2 py-0.5 rounded">
                        👑 مسؤول
                      </span>
                    )}
                    {u.ageGroup === 'senior' && (
                      <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded">
                        👴 اجتماع الحكماء
                      </span>
                    )}
                    {u.registeredBy === 'admin' && (
                      <span className="text-[10px] bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded">
                        سجله الخادم
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-stone-500 mt-1">
                    {u.email && <span>البريد: {u.email}</span>}
                    <span>الهاتف: {u.phone}</span>
                    <span>·</span>
                    <span>حل {u.quizzesSolved} مسابقة</span>
                    <span>·</span>
                    <span>تتابع: {u.currentStreak} أيام</span>
                  </div>
                  {u.servantNotes && (
                    <p className="text-xs text-amber-800 bg-amber-50/70 p-1.5 rounded-lg mt-2 inline-block">
                      ملاحظة الخادم: {u.servantNotes}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <div className="text-left font-mono">
                    <span className="text-xl font-black text-amber-900">{u.totalPoints}</span>
                    <span className="text-xs text-stone-500 mr-1">نقطة</span>
                  </div>
                  <button
                    onClick={() => onOpenAdjustPoints(u)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg border border-amber-200 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>تعديل النقاط</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Add / Edit Chapter Form by Day */}
      {activeTab === 'add_quiz' && (
        <form onSubmit={handleSaveWholeQuiz} className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-md space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-stone-200">
            <div>
              <h3 className="text-xl font-bold text-stone-900">
                {editingQuizId ? 'تعديل مسابقة اليوم' : 'إضافة يوم ومسابقة جديدة'}
              </h3>
              <p className="text-xs text-stone-500">
                حدد رقم اليوم، وتاريخه، وبيانات السفر والأصحاح والتسجيل الصوتي والأسئلة
              </p>
            </div>
            {editingQuizId && (
              <button
                type="button"
                onClick={() => {
                  setEditingQuizId(null);
                  setActiveTab('quizzes');
                }}
                className="text-xs text-rose-600 font-bold underline"
              >
                إلغاء التعديل
              </button>
            )}
          </div>

          {saveSuccessNotice && (
            <div className="p-4 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200 text-center font-bold flex items-center justify-center gap-2">
              <Check className="w-5 h-5" />
              <span>{saveSuccessNotice}</span>
            </div>
          )}

          {/* Day configuration Row */}
          <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <div>
              <label className="block text-xs font-bold text-amber-900 mb-1">
                رقم اليوم (بالترتيب): *
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={dayNumber}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  setDayNumber(val);
                  setDayLabel(`اليوم ${val}`);
                }}
                className="w-full p-2.5 rounded-xl border border-amber-300 bg-white font-mono text-base font-bold text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-amber-900 mb-1">
                تسمية اليوم في الواجهة:
              </label>
              <input
                type="text"
                value={dayLabel}
                onChange={(e) => setDayLabel(e.target.value)}
                placeholder="مثال: اليوم الأول، اليوم الثاني..."
                className="w-full p-2.5 rounded-xl border border-amber-300 bg-white text-xs font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center sm:pt-5">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-950">
                <input
                  type="checkbox"
                  checked={isMainToday}
                  onChange={(e) => setIsMainToday(e.target.checked)}
                  className="w-4 h-4 text-amber-600 rounded"
                />
                <span>تعيين كـ «اليوم الرئيسي الحالي» في الصفحة الأولى</span>
              </label>
            </div>
          </div>

          {/* Grid row: Date, Testament, Book, Chapter */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">تاريخ المسابقة:</label>
              <input
                type="date"
                value={quizDate}
                onChange={(e) => setQuizDate(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
              {StorageService.isQuizLockedFuture(quizDate) && (
                <p className="mt-1.5 text-[11px] font-bold text-amber-900 bg-amber-50 p-2 rounded-lg border border-amber-300/80 leading-relaxed">
                  🔒 تاريخ متقدم عن اليوم الحالي: سيتم إغلاق الأصحاح والمسابقة تلقائياً أمام المتسابقين لحين حلول تاريخ اليوم بتوقيت مصر 🇪🇬، وسيظهر لهم اسم السفر والأصحاح فقط كما طلبت.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">العهد:</label>
              <select
                value={testament}
                onChange={(e) => setTestament(e.target.value as any)}
                className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="new">العهد الجديد</option>
                <option value="old">العهد القديم</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">اسم السفر:</label>
              <input
                type="text"
                value={bookName}
                onChange={(e) => setBookName(e.target.value)}
                placeholder="مثال: إنجيل يوحنا"
                className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">رقم الأصحاح:</label>
              <input
                type="number"
                min={1}
                max={150}
                value={chapterNumber}
                onChange={(e) => setChapterNumber(parseInt(e.target.value) || 1)}
                className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>
          </div>

          {/* Chapter Title */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">عنوان الأصحاح أو موضوع اليوم:</label>
            <input
              type="text"
              value={chapterTitle}
              onChange={(e) => setChapterTitle(e.target.value)}
              placeholder="مثال: الموعظة على الجبل - التطويبات"
              className="w-full p-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              required
            />
          </div>

          {/* Audio Link & Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-stone-700 mb-1">
                رابط الملف الصوتي للأصحاح (MP3):
              </label>
              <input
                type="url"
                value={audioUrl}
                onChange={(e) => setAudioUrl(e.target.value)}
                placeholder="https://example.com/audio/chapter.mp3"
                className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">مدة المقطع التقريبية:</label>
              <input
                type="text"
                value={audioDuration}
                onChange={(e) => setAudioDuration(e.target.value)}
                placeholder="مثال: 5:30"
                className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Key Verse & Reflection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">آية اليوم للحفظ:</label>
              <input
                type="text"
                value={keyVerse}
                onChange={(e) => setKeyVerse(e.target.value)}
                placeholder="«طوبى لأنقياء القلب...»"
                className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">تأمل روحي في الأصحاح:</label>
              <input
                type="text"
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="تأمل مقتضب ومفيد..."
                className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Scripture Verses Text */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              نص آيات الأصحاح للقراءة (ضع رقم الآية أول السطر):
            </label>
            <textarea
              rows={6}
              value={versesText}
              onChange={(e) => setVersesText(e.target.value)}
              placeholder="1 في البدء كان الكلمة...\n2 هذا كان في البدء عند الله..."
              className="w-full p-3 rounded-xl border border-stone-300 font-scripture text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
              required
            />
          </div>

          {/* Questions section */}
          <div className="pt-6 border-t border-stone-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-extrabold text-stone-900 text-base">أسئلة اليوم ({questionsList.length} سؤال)</h4>
                <p className="text-xs text-stone-500">اختر نوع السؤال قبل كتابته: اختيار من متعدد، أكمل، صح أم خطأ، أو مقالي</p>
              </div>

              {!isAddingQuestion && (
                <button
                  type="button"
                  onClick={() => setIsAddingQuestion(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة سؤال جديد</span>
                </button>
              )}
            </div>

            {/* List of currently created questions */}
            <div className="space-y-3">
              {questionsList.map((q, idx) => (
                <div key={q.id} className="p-4 bg-stone-50 rounded-2xl border border-stone-200 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-900 font-bold text-xs flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-bold text-stone-500">
                        {q.type === 'multiple_choice' && 'اختيار من متعدد'}
                        {q.type === 'complete' && 'أكمل الآية'}
                        {q.type === 'true_false' && 'صح أم خطأ'}
                        {q.type === 'short_answer' && 'سؤال مقالي'}
                      </span>
                      <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                        {q.points} نقاط
                      </span>
                    </div>
                    <h5 className="font-bold text-stone-900 text-sm">{q.title}</h5>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteQuestion(q.id)}
                    className="text-stone-400 hover:text-rose-600 p-1 rounded"
                    title="حذف هذا السؤال"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Interactive Question Creator Form */}
            {isAddingQuestion && (
              <div className="p-6 bg-amber-50/60 rounded-3xl border-2 border-amber-300 space-y-5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between pb-3 border-b border-amber-200">
                  <h5 className="font-bold text-amber-950 text-sm">
                    الخطوة 1: اختر نوع السؤال أولاً
                  </h5>
                  <button
                    type="button"
                    onClick={resetQuestionForm}
                    className="text-stone-500 hover:text-stone-800 text-xs font-bold"
                  >
                    إلغاء
                  </button>
                </div>

                {/* Question Type Chooser */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { type: 'multiple_choice', label: 'اختيار من متعدد' },
                    { type: 'complete', label: 'أكمل الآية' },
                    { type: 'true_false', label: 'صح أم خطأ' },
                    { type: 'short_answer', label: 'إجابة قصيرة / مقالي' },
                  ].map((t) => (
                    <button
                      key={t.type}
                      type="button"
                      onClick={() => setSelectedQuestionType(t.type as QuestionType)}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        selectedQuestionType === t.type
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-white hover:bg-stone-50 text-stone-700 border-stone-300'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Common fields */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      نص السؤال أو التوجيه:
                    </label>
                    <input
                      type="text"
                      value={qTitle}
                      onChange={(e) => setQTitle(e.target.value)}
                      placeholder="اكتب السؤال بوضوح..."
                      className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">النقاط:</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={qPoints}
                      onChange={(e) => setQPoints(parseInt(e.target.value) || 5)}
                      className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Dynamic Type-specific fields */}
                {selectedQuestionType === 'multiple_choice' && (
                  <div className="space-y-3 bg-white p-4 rounded-2xl border border-stone-200">
                    <span className="text-xs font-bold text-stone-700 block">
                      خيارات الإجابة (حدد الخيار الصحيح بزر الاختيار):
                    </span>
                    {mcOptions.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="mcCorrect"
                          checked={mcCorrectIdx === oIdx}
                          onChange={() => setMcCorrectIdx(oIdx)}
                          className="w-4 h-4 text-amber-600 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const copy = [...mcOptions];
                            copy[oIdx] = e.target.value;
                            setMcOptions(copy);
                          }}
                          placeholder={`الخيار ${oIdx + 1}...`}
                          className="w-full p-2 rounded-lg border border-stone-300 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {selectedQuestionType === 'complete' && (
                  <div className="space-y-3 bg-white p-4 rounded-2xl border border-stone-200">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        نص الآية مع علامة الفراغ [...] :
                      </label>
                      <input
                        type="text"
                        value={completeVerseWithBlank}
                        onChange={(e) => setCompleteVerseWithBlank(e.target.value)}
                        placeholder="«وَالْكَلِمَةُ صَارَ [...] وَحَلَّ بَيْنَنَا»"
                        className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-scripture text-base focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-stone-700 mb-1">الكلمة المفقودة الصحيحة:</label>
                        <input
                          type="text"
                          value={completeBlankAnswer}
                          onChange={(e) => setCompleteBlankAnswer(e.target.value)}
                          placeholder="مثال: جسداً"
                          className="w-full p-2 rounded-lg border border-stone-300 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-stone-700 mb-1">بنك كلمات مساعدة (مفصولة بفاصلة):</label>
                        <input
                          type="text"
                          value={completeWordBank}
                          onChange={(e) => setCompleteWordBank(e.target.value)}
                          placeholder="جسداً، نوراً، صوتاً، ملكاً"
                          className="w-full p-2 rounded-lg border border-stone-300 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {selectedQuestionType === 'true_false' && (
                  <div className="space-y-3 bg-white p-4 rounded-2xl border border-stone-200">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">نص العبارة:</label>
                      <input
                        type="text"
                        value={tfStatement}
                        onChange={(e) => setTfStatement(e.target.value)}
                        placeholder="اكتب العبارة ليحدد المتسابق صحتها..."
                        className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">الجواب الصحيح:</label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-xs font-bold text-emerald-800 cursor-pointer">
                          <input
                            type="radio"
                            name="tfAnswer"
                            checked={tfIsCorrect === true}
                            onChange={() => setTfIsCorrect(true)}
                          />
                          <span>صـح (صواب)</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs font-bold text-rose-800 cursor-pointer">
                          <input
                            type="radio"
                            name="tfAnswer"
                            checked={tfIsCorrect === false}
                            onChange={() => setTfIsCorrect(false)}
                          />
                          <span>خـطـأ</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {selectedQuestionType === 'short_answer' && (
                  <div className="space-y-3 bg-white p-4 rounded-2xl border border-stone-200">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">سؤال المقال / التأمل:</label>
                      <input
                        type="text"
                        value={saPrompt}
                        onChange={(e) => setSaPrompt(e.target.value)}
                        placeholder="ماذا نتعلم من..."
                        className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">الإجابة النموذجية للخادم:</label>
                      <textarea
                        rows={2}
                        value={saModelAnswer}
                        onChange={(e) => setSaModelAnswer(e.target.value)}
                        placeholder="الإجابة الصحيحة أو النقاط الجوهرية..."
                        className="w-full p-2 rounded-lg border border-stone-300 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={resetQuestionForm}
                    className="px-4 py-2 rounded-xl border border-stone-300 text-stone-700 text-xs font-bold"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveQuestion}
                    className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm"
                  >
                    تأكيد وإضافة السؤال
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-stone-200">
            <span className="text-xs text-stone-500">
              إجمالي نقاط مسابقة اليوم: <strong className="text-stone-800">{questionsList.reduce((s, q) => s + q.points, 0)} نقطة</strong>
            </span>
            <button
              type="submit"
              className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer text-sm"
            >
              حفظ مسابقة اليوم ونشرها للمتسابقين 🚀
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: Point Logs Audit */}
      {activeTab === 'point_logs' && (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-md divide-y divide-stone-100 overflow-hidden">
          <div className="p-5 border-b border-stone-200 flex items-center justify-between">
            <h3 className="font-bold text-stone-900 text-base">سجل تعديلات النقاط والمكافآت</h3>
            <span className="text-xs text-stone-500">{logs.length} عملية مسجلة</span>
          </div>

          {logs.map((log) => (
            <div key={log.id} className="p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-stone-50">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-stone-900 text-sm">{log.userName}</h4>
                  <span className={`text-xs font-black px-2 py-0.5 rounded font-mono ${
                    log.change > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {log.change > 0 ? `+${log.change}` : log.change} نقطة
                  </span>
                </div>
                <p className="text-xs text-stone-600 mt-1">السبب: {log.reason}</p>
                <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-0.5">
                  <span>بواسطة: {log.adminName}</span>
                  <span>·</span>
                  <span>{log.date}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 5: Database Configuration (Hostinger MySQL & phpMyAdmin) */}
      {activeTab === 'database' && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-gradient-to-r from-stone-900 to-amber-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-stone-800 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-amber-300 bg-amber-900/60 px-3 py-1 rounded-full border border-amber-700/50">
                <Database className="w-3.5 h-3.5" />
                <span>ربط قاعدة بيانات Hostinger MySQL & phpMyAdmin</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-amber-50">
                إعدادات قاعدة البيانات والنسخ الاحتياطي SQL
              </h2>
              <p className="text-stone-300 text-xs sm:text-sm">
                يمكنك توصيل قاعدة بيانات MySQL الخاصة بك على استضافة Hostinger أو تنزيل ملف SQL الجاهز للاستيراد المباشر في phpMyAdmin بنقرة واحدة!
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleDownloadPhpBridge}
                className="flex items-center gap-2 px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-stone-950 font-black rounded-xl text-xs sm:text-sm shadow-md transition-all cursor-pointer whitespace-nowrap"
                title="تنزيل ملف جسر الربط PHP لرفعه داخل public_html في Hostinger"
              >
                <Zap className="w-4 h-4 text-amber-900" />
                <span>تنزيل ملف bible_sync.php (جسر الربط)</span>
              </button>
              <button
                onClick={handleDownloadSql}
                className="flex items-center gap-2 px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-amber-200 font-bold rounded-xl text-xs sm:text-sm border border-stone-700 transition-all cursor-pointer whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>ملف .sql</span>
              </button>
            </div>
          </div>

          {/* Sub Tabs Selector for Database Connection Methods */}
          <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 pb-2">
            <button
              type="button"
              onClick={() => setActiveDbTab('bridge')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                activeDbTab === 'bridge'
                  ? 'bg-amber-500 text-stone-950 shadow-md ring-2 ring-amber-400/50'
                  : 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-200'
              }`}
            >
              <Zap className="w-4 h-4 text-amber-900" />
              <span>1. جسر PHP المباشر (حل مضمون 100% بدون جدار حماية)</span>
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-emerald-600 text-white">موصى به</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveDbTab('direct')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                activeDbTab === 'direct'
                  ? 'bg-amber-500 text-stone-950 shadow-md ring-2 ring-amber-400/50'
                  : 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-200'
              }`}
            >
              <Server className="w-4 h-4" />
              <span>2. الاتصال المباشر (Remote MySQL IP)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveDbTab('phpmyadmin')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                activeDbTab === 'phpmyadmin'
                  ? 'bg-amber-500 text-stone-950 shadow-md ring-2 ring-amber-400/50'
                  : 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-200'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>3. استيراد يدوي في phpMyAdmin</span>
            </button>
          </div>

          {/* Connection Test Results */}
          {dbTestResult && (
            <div className={`p-4 rounded-2xl border text-xs sm:text-sm font-bold flex items-start gap-3 whitespace-pre-line leading-relaxed ${
              dbTestResult.success ? 'bg-emerald-50 text-emerald-900 border-emerald-300' : 'bg-rose-50 text-rose-900 border-rose-300'
            }`}>
              {dbTestResult.success ? <CheckCircle className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />}
              <div>{dbTestResult.message}</div>
            </div>
          )}

          {syncResult && (
            <div className={`p-4 rounded-2xl border text-xs sm:text-sm font-bold flex items-start gap-3 whitespace-pre-line leading-relaxed ${
              syncResult.success ? 'bg-emerald-50 text-emerald-900 border-emerald-300' : 'bg-rose-50 text-rose-900 border-rose-300'
            }`}>
              {syncResult.success ? <CheckCircle className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />}
              <div>{syncResult.message}</div>
            </div>
          )}

          {/* TAB 1: PHP BRIDGE (100% Working on Hostinger, Bypasses Port 3306 Firewall) */}
          {activeDbTab === 'bridge' && (
            <div className="space-y-6">
              {/* Solution Highlights Box */}
              <div className="bg-emerald-50 border-2 border-emerald-300 p-5 rounded-3xl space-y-3 text-xs sm:text-sm text-emerald-950">
                <div className="flex items-center gap-2 font-black text-sm sm:text-base text-emerald-900">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>لماذا هذا الحل يحل خطأ «انتهت مهلة استجابة الخادم» فوراً وبشكل نهائي؟</span>
                </div>
                <p className="text-emerald-900 leading-relaxed font-medium">
                  جدار حماية <strong>Hostinger</strong> يقوم بحجب منفذ <code>3306</code> عن الاتصالات الخارجية المباشرة.
                  <br />
                  ملف <strong>bible_sync.php</strong> يعمل محلياً من داخل استضافتك على Hostinger، فيتصل بقاعدة البيانات عبر <code>localhost</code> بسرعة فائقة وبدون أي حظر أو حاجة لإعدادات معقدة في جدار الحماية!
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-emerald-200">
                    <span className="font-bold block text-emerald-900 mb-1">الخطوة 1: تنزيل الملف</span>
                    <button
                      type="button"
                      onClick={handleDownloadPhpBridge}
                      className="w-full mt-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>تنزيل bible_sync.php</span>
                    </button>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-emerald-200">
                    <span className="font-bold block text-emerald-900 mb-1">الخطوة 2: رفعه إلى Hostinger</span>
                    <p className="text-stone-600">
                      افتح <strong>File Manager</strong> في Hostinger وارفع الملف داخل مجلد <strong>public_html</strong>.
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-emerald-200">
                    <span className="font-bold block text-emerald-900 mb-1">الخطوة 3: وضع الرابط والربط</span>
                    <p className="text-stone-600">
                      الصق الرابط أدناه واضغط «اختبار الاتصال بالجسر» للبدء فوراً!
                    </p>
                  </div>
                </div>
              </div>

              {/* Bridge Configuration Form */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-md space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-stone-200 flex-wrap gap-2">
                  <div>
                    <h3 className="font-extrabold text-stone-900 text-lg">إعدادات جسر الربط (Hostinger Bridge)</h3>
                    <p className="text-xs text-stone-500">
                      الملف يحتوي مسبقاً على بيانات قاعدة بياناتك ورمز أمان سري مشفر خاص بك.
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    dbConfig.isConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'
                  }`}>
                    {dbConfig.isConnected ? 'متصل بنجاح عبر Hostinger ✓' : 'غير متصل بعد'}
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-800 mb-1">
                      رابط ملف الجسر على موقعك (Bridge URL):
                    </label>
                    <div className="relative">
                      <input
                        type="url"
                        value={dbConfig.bridgeUrl || ''}
                        onChange={(e) => setDbConfig({ ...dbConfig, bridgeUrl: e.target.value })}
                        placeholder="مثال: https://yourdomain.com/bible_sync.php"
                        className="w-full p-3.5 pr-10 rounded-xl border border-stone-300 font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        dir="ltr"
                      />
                      <Globe className="w-4 h-4 text-stone-400 absolute right-3 top-3.5" />
                    </div>
                    <p className="text-[11px] text-stone-500 mt-1">
                      اكتب الرابط الكامل للملف بعد رفعه داخل <code>public_html</code> (مثلاً: <code>https://yourdomain.com/bible_sync.php</code>).
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-stone-800 mb-1">
                        رمز الأمان المشفر (Security Token):
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={dbConfig.bridgeSecret || 'cbq_sec_9a7d4f128e'}
                          onChange={(e) => setDbConfig({ ...dbConfig, bridgeSecret: e.target.value })}
                          className="w-full p-3 rounded-xl border border-stone-300 font-mono text-xs bg-stone-50"
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={copyBridgeSecret}
                          className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold shrink-0 transition-colors cursor-pointer"
                        >
                          {copiedSecret ? 'تم النسخ ✓' : 'نسخ'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-800 mb-1">
                        اسم قاعدة البيانات المُضمن بالملف:
                      </label>
                      <input
                        type="text"
                        value={dbConfig.database}
                        onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })}
                        placeholder="u123456789_dbname"
                        className="w-full p-3 rounded-xl border border-stone-300 font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Bridge Actions */}
                <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-stone-200">
                  <button
                    type="button"
                    onClick={handleTestBridge}
                    disabled={isTestingDb}
                    className="px-6 py-3.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-black transition-all shadow-md cursor-pointer flex items-center gap-2"
                  >
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>{isTestingDb ? 'جاري اختبار الجسر...' : 'اختبار الاتصال بالجسر'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePullViaBridge}
                    disabled={isTestingDb}
                    className="px-5 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${isTestingDb ? 'animate-spin' : ''}`} />
                    <span>سحب البيانات من Hostinger ➔ الموقع</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePushViaBridge}
                    disabled={isSyncingTables}
                    className="px-5 py-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    <span>مزامنة ورفع بيانات الموقع ➔ Hostinger</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSyncTablesViaBridge}
                    disabled={isSyncingTables}
                    className="px-4 py-3.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold transition-all border border-stone-300 cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>إنشاء وتحديث الجداول</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DIRECT MYSQL VIA REMOTE MYSQL IP */}
          {activeDbTab === 'direct' && (
            <div className="space-y-6">
              {/* Hostinger Remote MySQL Setup Alert with Exact Server IP */}
              <div className="bg-amber-50 border-2 border-amber-300 p-5 rounded-3xl space-y-3 text-xs sm:text-sm text-amber-950">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 font-black text-sm sm:text-base text-amber-900">
                    <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0" />
                    <span>إعدادات Remote MySQL في Hostinger لحل خطأ مهلة الاتصال:</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-amber-300 shadow-xs">
                    <span className="text-xs text-stone-600 font-bold">IP سيرفر التطبيق:</span>
                    <code className="font-mono text-stone-900 font-bold text-xs bg-stone-100 px-2 py-0.5 rounded">34.96.62.46</code>
                    <button
                      type="button"
                      onClick={copyServerIp}
                      className="text-xs bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-2 py-0.5 rounded transition-colors cursor-pointer"
                    >
                      {copiedIp ? 'تم النسخ ✓' : 'نسخ IP'}
                    </button>
                  </div>
                </div>

                <ol className="list-decimal list-inside space-y-1.5 text-stone-700 pr-1 text-xs sm:text-sm leading-relaxed">
                  <li>افتح لوحة تحكم <strong>Hostinger (hPanel)</strong> &gt; توجه إلى <strong>Databases (قواعد البيانات)</strong> &gt; ثم <strong>Remote MySQL</strong>.</li>
                  <li>في خانة <strong>IP (IPv4 أو IPv6)</strong> اكتب عنوان IP سيرفر التطبيق: <strong className="font-mono text-stone-900 font-bold bg-amber-100 px-1.5 py-0.5 rounded">34.96.62.46</strong> (أو الرمز <code>%</code>).</li>
                  <li>اختر اسم قاعدة بياناتك واضغط <strong>Create (إنشاء)</strong>.</li>
                  <li><strong>هام جداً:</strong> في خانة «عنوان السيرفر» أدناه، لا تكتب <code>localhost</code> ولا اسم موقعك، بل <strong>MySQL Hostname</strong> المخصص من Hostinger (مثال: <code>srv123.main-hosting.eu</code> أو IP السيرفر).</li>
                </ol>
              </div>

              {/* DB Credentials Form */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-md space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-stone-200">
                  <div>
                    <h3 className="font-extrabold text-stone-900 text-lg">بيانات الاتصال المباشر بـ MySQL</h3>
                    <p className="text-xs text-stone-500">
                      تجد هذه البيانات في لوحة تحكم Hostinger &gt; Databases &gt; MySQL Databases
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    dbConfig.isConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'
                  }`}>
                    {dbConfig.isConnected ? 'متصل بقاعدة البيانات ✓' : 'غير متصل بعد'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      عنوان السيرفر الخارجي (MySQL Hostname / Server IP):
                    </label>
                    <input
                      type="text"
                      value={dbConfig.host}
                      onChange={(e) => setDbConfig({ ...dbConfig, host: e.target.value })}
                      placeholder="مثال: srv123.main-hosting.eu أو IP السيرفر الخاص بـ Hostinger"
                      className="w-full p-3 rounded-xl border border-stone-300 font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-amber-800 font-medium mt-1">
                      * تنبيه: لا تضع «localhost»؛ ضع Hostname أو عنوان IP السيرفر الظاهر في صفحة Hostinger MySQL Databases.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      اسم قاعدة البيانات (Database Name):
                    </label>
                    <input
                      type="text"
                      value={dbConfig.database}
                      onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })}
                      placeholder="مثال: u123456789_bible_quiz"
                      className="w-full p-3 rounded-xl border border-stone-300 font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      اسم المستخدم (Database User):
                    </label>
                    <input
                      type="text"
                      value={dbConfig.user}
                      onChange={(e) => setDbConfig({ ...dbConfig, user: e.target.value })}
                      placeholder="مثال: u123456789_kirillos"
                      className="w-full p-3 rounded-xl border border-stone-300 font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      كلمة مرور قاعدة البيانات (Password):
                    </label>
                    <input
                      type="password"
                      value={dbConfig.password}
                      onChange={(e) => setDbConfig({ ...dbConfig, password: e.target.value })}
                      placeholder="••••••••••••"
                      className="w-full p-3 rounded-xl border border-stone-300 font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Direct Action buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-stone-200">
                  <button
                    type="button"
                    onClick={handleTestDatabaseConnection}
                    disabled={isTestingDb}
                    className="px-5 py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-2"
                  >
                    <Server className="w-4 h-4 text-amber-400" />
                    <span>{isTestingDb ? 'جاري الفحص...' : 'اختبار الاتصال المباشر'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePullFromMysql}
                    disabled={isTestingDb}
                    className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${isTestingDb ? 'animate-spin' : ''}`} />
                    <span>سحب البيانات ➔ الموقع</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePushToMysql}
                    disabled={isSyncingTables}
                    className="px-5 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    <span>رفع البيانات ➔ Hostinger</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSyncTables}
                    disabled={isSyncingTables}
                    className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold transition-all border border-stone-300 cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>إنشاء الجداول</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PHPMYADMIN SQL IMPORT */}
          {activeDbTab === 'phpmyadmin' && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-md space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-stone-200 flex-wrap gap-2">
                <div>
                  <h3 className="font-extrabold text-stone-900 text-lg">
                    استيراد الجداول مباشرة في phpMyAdmin على Hostinger
                  </h3>
                  <p className="text-xs text-stone-500">
                    إذا كنت تفضل إدارة الجداول عبر واجهة phpMyAdmin، اتبع الخطوات البسيطة التالية:
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopySql}
                    className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5 text-stone-600" />
                    <span>{copiedSql ? 'تم النسخ بنجاح! ✓' : 'نسخ كود SQL'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadSql}
                    className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تنزيل ملف .sql</span>
                  </button>
                </div>
              </div>

              {/* Steps */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-1.5">
                  <span className="w-6 h-6 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center text-xs">
                    1
                  </span>
                  <h5 className="font-bold text-stone-900">فتح phpMyAdmin</h5>
                  <p className="text-stone-600">
                    سجل الدخول إلى لوحة تحكم Hostinger، توجه إلى Databases ثم انقر على زر <strong>Enter phpMyAdmin</strong>.
                  </p>
                </div>

                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-1.5">
                  <span className="w-6 h-6 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center text-xs">
                    2
                  </span>
                  <h5 className="font-bold text-stone-900">اختيار قاعدة البيانات</h5>
                  <p className="text-stone-600">
                    انقر على اسم قاعدة بياناتك من القائمة اليسرى في phpMyAdmin لتحديدها.
                  </p>
                </div>

                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-1.5">
                  <span className="w-6 h-6 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center text-xs">
                    3
                  </span>
                  <h5 className="font-bold text-stone-900">استيراد (Import)</h5>
                  <p className="text-stone-600">
                    اضغط على تبويب <strong>Import (استيراد)</strong> في الشريط العلوي، واختر ملف <code>bible_quiz.sql</code> الذي قمت بتنزيله.
                  </p>
                </div>

                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-1.5">
                  <span className="w-6 h-6 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center text-xs">
                    4
                  </span>
                  <h5 className="font-bold text-stone-900">تنفيذ وحفظ</h5>
                  <p className="text-stone-600">
                    اضغط على زر <strong>Go / تنفيذ</strong> بالأسفل. سيتم إنشاء الجداول وحساب أدمن كيرلس هلال فوراً!
                  </p>
                </div>
              </div>

              {/* Code Preview snippet */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-stone-700 block">معاينة جزء من سكربت SQL التلقائي:</span>
                <pre className="bg-stone-950 text-amber-200 p-4 rounded-2xl text-xs font-mono overflow-x-auto max-h-48 border border-stone-800" dir="ltr">
{StorageService.generatePhpMyAdminSql().substring(0, 1100)}
...
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
