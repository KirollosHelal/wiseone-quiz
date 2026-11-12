import React, { useState } from 'react';
import {
  Award, CheckCircle2, Lock, Send, HelpCircle, LogOut, User as UserIcon,
  AlertCircle, BookOpen, Headphones, Check,
} from 'lucide-react';
import { DailyQuiz, Question, User, UserQuizSubmission } from '../types';
import { StorageService } from '../services/storage';
import { AudioPlayer } from './AudioPlayer';

interface EasySolvePageProps {
  quiz: DailyQuiz;
  currentUser: User | null;
  /** Lift a successful inline login up to App state */
  onAuthenticated: (user: User) => void;
  onLogout: () => void;
}

/**
 * اجتماع الحكماء (الوضع السهل للمسنّين) — صفحة واحدة فقط:
 * 1) الاسم + الرقم السري (بيانات يعطيها الخادم لكل مخدوم)
 * 2) تسجيل الأصحاح (صوت + نص)
 * 3) الأسئلة كلها في نموذج واحد ثم زر إرسال واحد كبير
 */
export const EasySolvePage: React.FC<EasySolvePageProps> = ({
  quiz,
  currentUser,
  onAuthenticated,
  onLogout,
}) => {
  // --- Login state ---
  const [identifier, setIdentifier] = useState<string>('');
  const [passcode, setPasscode] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginNotice, setLoginNotice] = useState<string | null>(null);

  // --- Quiz form state ---
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submissionResult, setSubmissionResult] = useState<UserQuizSubmission | null>(
    currentUser?.submissions?.find(s => s.quizId === quiz.id) || null
  );

  const questions: Question[] = quiz.questions || [];
  const isFutureLocked = StorageService.isQuizLockedFuture(quiz.date);
  const isAdmin = currentUser?.role === 'admin';

  // --- Inline login handler ---
  const handleLogin = async () => {
    setLoginError(null);
    setLoginNotice(null);
    if (!identifier.trim() || !passcode.trim()) {
      setLoginError('من فضلك اكتب الاسم أو رقم الهاتف والرقم السري الذي أعطاه لك الخادم.');
      return;
    }
    setIsLoggingIn(true);
    const res = await StorageService.authenticate(identifier.trim(), passcode.trim());
    setIsLoggingIn(false);
    if (res.success && res.user) {
      setLoginNotice(res.message || `أهلاً بك يا «${res.user.fullName}»! تفضل الآن في الاستماع والقراءة ثم حل الأسئلة.`);
      onAuthenticated(res.user);
    } else {
      setLoginError(res.error || 'تعذر تسجيل الدخول. تأكد من الاسم والرقم السري أو اطلب من الخادم مساعدتك.');
    }
  };

  const handleSelect = (qId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [qId]: value }));
  };

  // Same scoring logic as the full QuizEngine
  const calculateResults = (): UserQuizSubmission => {
    let earnedPoints = 0;
    let maxPoints = 0;
    let hasShortAnswer = false;

    questions.forEach((q) => {
      maxPoints += q.points;
      const userAns = answers[q.id];

      if (q.type === 'multiple_choice') {
        if (userAns === q.correctAnswerIndex) earnedPoints += q.points;
      } else if (q.type === 'true_false') {
        if (userAns === q.isCorrect) earnedPoints += q.points;
      } else if (q.type === 'complete') {
        if (typeof userAns === 'string' && userAns.trim()) {
          const normUser = userAns.trim().replace(/[ًٌٍَُِّْ]/g, '').toLowerCase();
          const normCorrect = q.blankAnswer.trim().replace(/[ًٌٍَُِّْ]/g, '').toLowerCase();
          if (normUser === normCorrect || normCorrect.includes(normUser) || normUser.includes(normCorrect)) {
            earnedPoints += q.points;
          }
        }
      } else if (q.type === 'short_answer') {
        hasShortAnswer = true;
        if (typeof userAns === 'string' && userAns.trim().length >= 3) {
          const userText = userAns.trim().replace(/[ًٌٍَُِّْ]/g, '').toLowerCase();
          const matched = q.keywords.some(k => userText.includes(k.replace(/[ًٌٍَُِّْ]/g, '').toLowerCase()));
          earnedPoints += matched ? q.points : Math.ceil(q.points / 2);
        }
      }
    });

    return {
      quizId: quiz.id,
      dayNumber: quiz.dayNumber,
      date: quiz.date,
      submittedAt: new Date().toISOString(),
      score: earnedPoints,
      maxScore: maxPoints,
      answers,
      status: hasShortAnswer ? 'needs_review' : 'graded',
      adminNotes: hasShortAnswer ? 'تم تسجيل الإجابة تلقائياً ومتاحة لمراجعة الخادم' : undefined,
    };
  };

  const handleSubmit = async () => {
    if (!currentUser) return;
    setIsConfirming(false);
    setIsSubmitting(true);
    setSubmitError(null);
    const result = calculateResults();
    try {
      await StorageService.submitQuiz(currentUser.id, result);
      setSubmissionResult(result);
    } catch (err: any) {
      setSubmitError(err?.message || 'تعذر حفظ إجاباتك في قاعدة البيانات. تواصل مع الخادم.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const answeredCount = questions.filter(q => answers[q.id] !== undefined && answers[q.id] !== '').length;

  // ============================================================
  // Locked (future date) state — one simple card
  // ============================================================
  if (isFutureLocked && !isAdmin) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-3xl p-8 border-2 border-amber-300 shadow-xl text-center space-y-5">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shadow-md">
          <Lock className="w-8 h-8 text-amber-800" />
        </div>
        <h2 className="text-2xl font-black text-stone-900">مسابقة {quiz.bookName} لم يحن يومها بعد</h2>
        <p className="text-stone-600 text-lg font-medium leading-relaxed">
          ستفتح المسابقة يوم <strong className="font-mono text-amber-900">{quiz.date}</strong>. تفضل بالعودة يومها للاستماع والحل.
        </p>
      </div>
    );
  }

  // ============================================================
  // Already solved — one simple thank-you card
  // ============================================================
  if (submissionResult) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-3xl p-8 border-2 border-emerald-200 shadow-xl text-center space-y-5">
        <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center shadow-md">
          <CheckCircle2 className="w-9 h-9 text-emerald-700" />
        </div>
        <h2 className="text-2xl font-black text-stone-900">بركة كلمة الله معك! تم حفظ إجاباتك</h2>
        <p className="text-stone-600 text-lg font-medium">
          حصلت على <strong className="font-mono text-2xl text-amber-900">{submissionResult.score}</strong> من{' '}
          <strong className="font-mono text-2xl text-amber-900">{submissionResult.maxScore}</strong> نقطة في مسابقة
          ({quiz.bookName} - الأصحاح {quiz.chapterNumber}).
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-950 text-sm font-bold">
          تم اعتماد إجابتك من المحاولة الأولى فقط (قاعدة العدالة) — لا يمكن إعادة الحل.
        </div>
        {currentUser && (
          <button
            onClick={onLogout}
            className="px-6 py-3 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold rounded-xl text-sm cursor-pointer"
          >
            تسجيل خروج ({currentUser.fullName})
          </button>
        )}
      </div>
    );
  }

  // ============================================================
  // The one-page form
  // ============================================================
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* ---------- SECTION 1: الاسم والرقم السري ---------- */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-stone-200 shadow-lg space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b-2 border-stone-100">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-stone-950 flex items-center justify-center text-2xl font-black shadow-md shrink-0">
            1
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-stone-900">اكتب اسمك ورقمك السري</h2>
            <p className="text-stone-500 text-sm font-medium">استخدم البيانات التي أعطاه لك الخادم المسؤول</p>
          </div>
        </div>

        {currentUser ? (
          <div className="flex items-center justify-between flex-wrap gap-3 bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <UserIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="font-black text-emerald-900 text-base">{currentUser.fullName}</p>
                <p className="text-emerald-700 text-xs font-bold">
                  نقاطك: {currentUser.totalPoints} • تم تسجيل دخولك بنجاح ✓
                </p>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="px-4 py-2.5 bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 font-bold rounded-xl text-xs flex items-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>خروج</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="easy-name" className="block text-lg font-black text-stone-800 mb-2">
                الاسم (أو رقم الهاتف المسجل)
              </label>
              <input
                id="easy-name"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="مثال: مريم جورج أو 01012345678"
                className="w-full p-4 text-lg font-bold rounded-2xl border-2 border-stone-300 focus:border-amber-500 focus:ring-4 focus:ring-amber-200 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="easy-pass" className="block text-lg font-black text-stone-800 mb-2">
                الرقم السري
              </label>
              <input
                id="easy-pass"
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
                placeholder="الرقم السري الذي أعطاه لك الخادم"
                className="w-full p-4 text-lg font-bold rounded-2xl border-2 border-stone-300 focus:border-amber-500 focus:ring-4 focus:ring-amber-200 focus:outline-none"
              />
            </div>

            {loginError && (
              <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
                <p className="text-rose-800 font-bold text-base leading-relaxed">{loginError}</p>
              </div>
            )}
            {loginNotice && (
              <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                <p className="text-emerald-800 font-bold text-base leading-relaxed">{loginNotice}</p>
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="w-full py-4 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-400 text-white text-lg font-black rounded-2xl shadow-md cursor-pointer transition-colors"
            >
              {isLoggingIn ? 'جاري الدخول...' : 'دخول'}
            </button>
          </div>
        )}
      </div>

      {/* ---------- SECTION 2: الصوت ونص الأصحاح ---------- */}
      <div className="bg-white rounded-3xl border-2 border-stone-200 shadow-lg overflow-hidden">
        <div className="bg-stone-900 p-5 sm:p-6 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-stone-950 flex items-center justify-center text-2xl font-black shadow-md shrink-0">
            2
          </div>
          <div className="text-white">
            <h2 className="text-xl sm:text-2xl font-black">اسمع واقرأ الأصحاح</h2>
            <p className="text-amber-200 text-sm font-bold">
              {quiz.dayLabel || `اليوم ${quiz.dayNumber}`} — {quiz.bookName} (الأصحاح {quiz.chapterNumber})
            </p>
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          {/* Audio */}
          {quiz.audioUrl && (
            <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4">
              <div className="flex items-center gap-2 mb-2 text-amber-900 font-bold text-sm">
                <Headphones className="w-5 h-5" />
                <span>اضغط زر التشغيل واسمع الأصحاح كاملاً</span>
              </div>
              <AudioPlayer audioUrl={quiz.audioUrl} chapterTitle={quiz.title} durationHint={quiz.audioDuration} />
            </div>
          )}

          {/* Chapter text */}
          <div>
            <div className="flex items-center gap-2 text-stone-500 font-bold text-sm mb-2">
              <BookOpen className="w-5 h-5" />
              <span>نص الأصحاح المبارك</span>
            </div>
            <div className="space-y-3 bg-stone-50 rounded-2xl border border-stone-200 p-5">
              {(quiz.verses || []).map((v) => (
                <p key={v.verse} className="text-xl sm:text-2xl leading-loose text-stone-900 font-medium">
                  <span className="inline-flex w-8 h-8 rounded-full bg-amber-200 text-amber-950 items-center justify-center text-sm font-black mr-2 ml-2 align-middle shrink-0">
                    {v.verse}
                  </span>
                  {v.text}
                </p>
              ))}
              {(!quiz.verses || quiz.verses.length === 0) && (
                <p className="text-stone-500 font-bold">لم يُرفق نص الأصحاح — يمكنك الاستماع من الصوت أعلاه أو قراءته من كتابك المقدس.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---------- SECTION 3: الأسئلة ---------- */}
      <div className="bg-white rounded-3xl border-2 border-stone-200 shadow-lg overflow-hidden">
        <div className="bg-stone-900 p-5 sm:p-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-stone-950 flex items-center justify-center text-2xl font-black shadow-md shrink-0">
              3
            </div>
            <div className="text-white">
              <h2 className="text-xl sm:text-2xl font-black">جاوب على الأسئلة</h2>
              <p className="text-amber-200 text-sm font-bold">اضغط على الإجابة التي تراها مناسبة</p>
            </div>
          </div>
          <div className="bg-amber-400 text-stone-950 font-black px-4 py-2 rounded-xl text-sm whitespace-nowrap">
            جاوبت {answeredCount} من {questions.length}
          </div>
        </div>

        {questions.length === 0 ? (
          <div className="p-8 text-center text-stone-600 font-bold text-lg">
            لا توجد أسئلة مضافة في هذا اليوم حتى الآن.
          </div>
        ) : (
          <div className="p-5 sm:p-6 space-y-5">
            {questions.map((q, idx) => (
              <div key={q.id} className="bg-stone-50 rounded-2xl border-2 border-stone-200 p-5 space-y-4">
                {/* Question header */}
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-full bg-stone-900 text-amber-300 flex items-center justify-center text-lg font-black shrink-0">
                    {idx + 1}
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-stone-900 leading-snug pt-1">{q.title}</h3>
                </div>

                {/* TYPE: multiple choice — big tappable cards */}
                {q.type === 'multiple_choice' && (
                  <div className="space-y-3 pr-2">
                    {q.options.map((option, optIdx) => {
                      const isSelected = answers[q.id] === optIdx;
                      return (
                        <button
                          key={optIdx}
                          onClick={() => handleSelect(q.id, optIdx)}
                          className={`w-full text-right p-4 rounded-2xl border-2 transition-all flex items-center gap-4 cursor-pointer ${
                            isSelected
                              ? 'bg-amber-100 border-amber-600 shadow-md ring-2 ring-amber-300'
                              : 'bg-white hover:bg-amber-50/50 border-stone-300'
                          }`}
                        >
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-base shrink-0 border-2 ${
                            isSelected ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-100 text-stone-600 border-stone-300'
                          }`}>
                            {isSelected ? <Check className="w-5 h-5 stroke-[3]" /> : String.fromCharCode(65 + optIdx)}
                          </span>
                          <span className={`text-lg sm:text-xl font-bold ${isSelected ? 'text-amber-950' : 'text-stone-800'}`}>
                            {option}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* TYPE: true/false — two big buttons */}
                {q.type === 'true_false' && (
                  <div className="grid grid-cols-2 gap-4 pr-2">
                    {[
                      { val: true, label: 'صح ✓', selectedCls: 'bg-emerald-600 border-emerald-600 text-white' },
                      { val: false, label: 'خطأ ✗', selectedCls: 'bg-rose-600 border-rose-600 text-white' },
                    ].map(({ val, label, selectedCls }) => {
                      const isSelected = answers[q.id] === val;
                      return (
                        <button
                          key={String(val)}
                          onClick={() => handleSelect(q.id, val)}
                          className={`py-5 rounded-2xl border-2 text-2xl font-black transition-all cursor-pointer ${
                            isSelected
                              ? selectedCls + ' shadow-md ring-2 ring-amber-300'
                              : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-100'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* TYPE: complete the verse — word bank chips + optional typing */}
                {q.type === 'complete' && (
                  <div className="space-y-3 pr-2">
                    <p className="text-xl sm:text-2xl text-stone-900 font-bold leading-loose text-center bg-amber-50 rounded-2xl border border-amber-200 p-4">
                      «{q.verseWithBlank}»
                    </p>
                    {q.wordBank && q.wordBank.length > 0 && (
                      <div className="flex flex-wrap gap-3">
                        {q.wordBank.map((word, wIdx) => {
                          const isSelected = answers[q.id] === word;
                          return (
                            <button
                              key={wIdx}
                              onClick={() => handleSelect(q.id, word)}
                              className={`px-6 py-3.5 rounded-2xl border-2 text-xl font-black transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-amber-600 text-white border-amber-600 shadow-md'
                                  : 'bg-white hover:bg-amber-50 text-stone-800 border-stone-300'
                              }`}
                            >
                              {word}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <input
                      type="text"
                      value={typeof answers[q.id] === 'string' ? answers[q.id] : ''}
                      onChange={(e) => handleSelect(q.id, e.target.value)}
                      placeholder="أو اكتب الكلمة هنا إن لم تجدها فوق"
                      className="w-full p-4 text-lg font-bold rounded-2xl border-2 border-stone-300 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                )}

                {/* TYPE: short answer — big textarea */}
                {q.type === 'short_answer' && (
                  <textarea
                    value={typeof answers[q.id] === 'string' ? answers[q.id] : ''}
                    onChange={(e) => handleSelect(q.id, e.target.value)}
                    placeholder="اكتب إجابتك هنا بكل بساطة..."
                    rows={3}
                    className="w-full p-4 text-lg font-medium rounded-2xl border-2 border-stone-300 focus:border-amber-500 focus:outline-none leading-relaxed"
                  />
                )}
              </div>
            ))}

            {/* Submit */}
            {!currentUser && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-start gap-3">
                <HelpCircle className="w-6 h-6 text-amber-700 shrink-0" />
                <p className="text-amber-950 font-bold text-base leading-relaxed">
                  اكتب اسمك ورقمك السري في خانة «1» أعلى الصفحة أولاً، ثم اضغط إرسال ليحفظ الخادم نقاطك.
                </p>
              </div>
            )}
            {submitError && (
              <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
                <p className="text-rose-800 font-bold text-base leading-relaxed">{submitError}</p>
              </div>
            )}

            <button
              onClick={() => setIsConfirming(true)}
              disabled={isSubmitting || !currentUser || questions.length === 0}
              className="w-full py-5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-stone-300 text-white text-2xl font-black rounded-2xl shadow-lg cursor-pointer transition-colors flex items-center justify-center gap-3"
            >
              <Send className="w-7 h-7" />
              <span>{isSubmitting ? 'جاري الإرسال...' : 'إرسال إجاباتي'}</span>
            </button>
            {!currentUser && (
              <p className="text-center text-stone-500 font-bold text-sm">الزر يفتح بعد كتابة الاسم والرقم السري</p>
            )}
          </div>
        )}
      </div>

      {/* ---------- Confirm overlay ---------- */}
      {isConfirming && (
        <div className="fixed inset-0 z-50 bg-stone-950/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center space-y-5 shadow-2xl">
            <Award className="w-14 h-14 text-amber-600 mx-auto" />
            <h3 className="text-2xl font-black text-stone-900">هل أنت جاهز للإرسال؟</h3>
            <p className="text-stone-600 text-lg font-medium leading-relaxed">
              جاوبت على <strong className="font-mono text-amber-900">{answeredCount}</strong> من{' '}
              <strong className="font-mono text-amber-900">{questions.length}</strong> سؤال.
              <br />
              لا يمكن تغيير الإجابات بعد الإرسال.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full py-4 bg-emerald-700 hover:bg-emerald-600 text-white text-xl font-black rounded-2xl cursor-pointer"
              >
                نعم، أرسل الآن
              </button>
              <button
                onClick={() => setIsConfirming(false)}
                className="w-full py-3.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-lg font-bold rounded-2xl cursor-pointer"
              >
                عودة للأسئلة (أراجع إجاباتي)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
