import React, { useState } from 'react';
import { CheckCircle2, XCircle, Award, AlertCircle, ArrowRight, ArrowLeft, Send, HelpCircle, Check, Sparkles, Lock, ShieldAlert } from 'lucide-react';
import confetti from 'canvas-confetti';
import { DailyQuiz, Question, User, UserQuizSubmission } from '../types';
import { SeniorSettings, StorageService } from '../services/storage';

interface QuizEngineProps {
  quiz: DailyQuiz;
  currentUser: User | null;
  settings: SeniorSettings;
  onBackToReading: () => void;
  onGoToLeaderboard: () => void;
  onRequireAuth: () => void;
}

export const QuizEngine: React.FC<QuizEngineProps> = ({
  quiz,
  currentUser,
  settings,
  onBackToReading,
  onGoToLeaderboard,
  onRequireAuth,
}) => {
  const isFutureLocked = StorageService.isQuizLockedFuture(quiz.date);
  const isAdmin = currentUser?.role === 'admin';

  // If this quiz is in the future and user is not an admin, block solving
  if (isFutureLocked && !isAdmin) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-3xl p-6 sm:p-12 border-2 border-amber-300 shadow-xl text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-amber-100 text-amber-800 flex items-center justify-center shadow-md ring-4 ring-amber-200">
          <Lock className="w-10 h-10 text-amber-800" />
        </div>
        <div className="space-y-2">
          <span className="inline-block px-3 py-1 rounded-full bg-amber-100 text-amber-900 font-bold text-xs">
            مسابقة مغلقة 🔒
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-stone-900">
            مسابقة {quiz.bookName} (الأصحاح {quiz.chapterNumber}) غير متاحة للحل حالياً
          </h2>
          <p className="text-stone-600 text-sm sm:text-base leading-relaxed">
            هذه المسابقة مجدولة لتاريخ <strong className="font-mono text-amber-900 font-bold">{quiz.date}</strong>. لا يمكن بدء حل الأسئلة إلا بعد بداية هذا اليوم بحسب توقيت جمهورية مصر العربية 🇪🇬.
          </p>
        </div>
        <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 text-xs text-amber-950 font-medium">
          «لِكُلِّ شَيْءٍ زَمَانٌ، وَلِكُلِّ أَمْرٍ تَحْتَ السَّمَاوَاتِ وَقْتٌ» (جامعة 3: 1)
        </div>
        <button
          onClick={onBackToReading}
          className="px-8 py-3.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl text-sm shadow-md transition-all cursor-pointer"
        >
          العودة للأصحاح ➔
        </button>
      </div>
    );
  }

  // Existing submission check
  const existingSub = currentUser?.submissions?.find(s => s.quizId === quiz.id);

  // User answers state: questionId -> answer value
  const [answers, setAnswers] = useState<Record<string, any>>(() => {
    return existingSub?.answers || {};
  });

  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(!!existingSub);
  const [submissionResult, setSubmissionResult] = useState<UserQuizSubmission | null>(existingSub || null);

  const questions = quiz.questions || [];
  const currentQ = questions[currentStepIndex];

  // Font size scale class for questions
  const qFontClass = [
    'text-lg sm:text-xl',
    'text-xl sm:text-2xl',
    'text-2xl sm:text-3xl',
    'text-3xl sm:text-4xl',
  ][settings.fontSizeLevel] || 'text-xl';

  const handleSelectAnswer = (qId: string, val: any) => {
    setAnswers(prev => ({ ...prev, [qId]: val }));
  };

  const handleNext = () => {
    if (currentStepIndex < questions.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const calculateResults = (): UserQuizSubmission => {
    let earnedPoints = 0;
    let maxPoints = 0;
    let hasShortAnswer = false;

    questions.forEach((q) => {
      maxPoints += q.points;
      const userAns = answers[q.id];

      if (q.type === 'multiple_choice') {
        if (userAns === q.correctAnswerIndex) {
          earnedPoints += q.points;
        }
      } else if (q.type === 'true_false') {
        if (userAns === q.isCorrect) {
          earnedPoints += q.points;
        }
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
        // Check keywords
        if (typeof userAns === 'string' && userAns.trim().length >= 3) {
          const userText = userAns.trim().replace(/[ًٌٍَُِّْ]/g, '').toLowerCase();
          const matched = q.keywords.some(k => userText.includes(k.replace(/[ًٌٍَُِّْ]/g, '').toLowerCase()));
          if (matched) {
            earnedPoints += q.points;
          } else {
            // Grant partial points for effort
            earnedPoints += Math.ceil(q.points / 2);
          }
        }
      }
    });

    const submission: UserQuizSubmission = {
      quizId: quiz.id,
      date: quiz.date,
      submittedAt: new Date().toISOString(),
      score: earnedPoints,
      maxScore: maxPoints,
      answers,
      status: hasShortAnswer ? 'needs_review' : 'graded',
      adminNotes: hasShortAnswer ? 'تم تسجيل الإجابة تلقائياً ومتاحة لمراجعة الخادم' : undefined,
    };

    return submission;
  };

  const handleSubmit = () => {
    if (!currentUser) {
      onRequireAuth();
      return;
    }

    // If already solved, do not allow re-calculating or modifying
    if (existingSub) {
      setSubmissionResult(existingSub);
      setIsSubmitted(true);
      return;
    }

    const result = calculateResults();
    setSubmissionResult(result);
    setIsSubmitted(true);

    // Save to the MySQL DB via the API (only first attempt is saved)
    StorageService.submitQuiz(currentUser.id, result).catch(err => {
      console.error('Failed to submit quiz to DB:', err);
    });

    // Launch celebratory confetti
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#D4AF37', '#991B1B', '#F59E0B', '#10B981'],
      });
    } catch {
      // safe fallback
    }
  };

  // If already submitted and showing results
  if (isSubmitted && submissionResult) {
    const isPassing = submissionResult.score >= submissionResult.maxScore * 0.6;
    return (
      <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-lg border border-stone-200 space-y-8 max-w-4xl mx-auto">
        {/* Celebration Header */}
        <div className="text-center space-y-3 py-4 border-b border-stone-200">
          <div className="inline-flex p-4 rounded-full bg-amber-100 text-amber-800 mb-2">
            <Award className="w-12 h-12" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900">
            {isPassing ? 'مبروك! بركة كلمة الله معك' : 'شكراً لمشاركتك المباركة!'}
          </h2>
          <p className="text-stone-600 text-sm sm:text-base">
            تم تسجيل إجاباتك بنجاح في مسابقة ({quiz.bookName} - الأصحاح {quiz.chapterNumber})
          </p>

          <div className="inline-flex items-center gap-3 bg-amber-50 border border-amber-200 px-6 py-3 rounded-2xl">
            <span className="text-stone-700 font-medium">النقاط المكتسبة:</span>
            <span className="text-3xl font-extrabold text-amber-900 font-mono">
              {submissionResult.score} / {submissionResult.maxScore}
            </span>
          </div>

          {/* Single attempt fairness lock notice */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 sm:p-3.5 flex items-center justify-center gap-2 text-amber-950 font-bold text-xs sm:text-sm max-w-xl mx-auto">
            <Lock className="w-4 h-4 text-amber-700 shrink-0" />
            <span>تم اعتماد إجابتك من المحاولة الأولى بنجاح. لا يمكن إعادة حل المسابقة لضمان عدالة ونزاهة لوحة الشرف.</span>
          </div>

          <p className="text-xs text-stone-500">
            {currentUser ? (
              <>تمت إضافة النقاط إلى رصيدك باسم «{currentUser.fullName}» في لوحة الشرف.</>
            ) : (
              <>سجل دخولك لتثبيت نقاطك في لوحة الشرف.</>
            )}
          </p>
        </div>

        {/* Detailed Question Review with Explanations */}
        <div className="space-y-6">
          <h3 className="text-lg font-bold text-stone-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>مراجعة الإجابات وشواهد الآيات:</span>
          </h3>

          {questions.map((q, idx) => {
            const userAns = submissionResult.answers[q.id];
            let isCorrect = false;

            if (q.type === 'multiple_choice') {
              isCorrect = userAns === q.correctAnswerIndex;
            } else if (q.type === 'true_false') {
              isCorrect = userAns === q.isCorrect;
            } else if (q.type === 'complete') {
              const normUser = String(userAns || '').trim().replace(/[ًٌٍَُِّْ]/g, '').toLowerCase();
              const normCorrect = q.blankAnswer.trim().replace(/[ًٌٍَُِّْ]/g, '').toLowerCase();
              isCorrect = normUser === normCorrect || normCorrect.includes(normUser);
            } else if (q.type === 'short_answer') {
              isCorrect = !!userAns;
            }

            return (
              <div
                key={q.id}
                className={`p-5 rounded-2xl border ${
                  isCorrect ? 'bg-emerald-50/50 border-emerald-200' : 'bg-stone-50 border-stone-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-stone-200 text-stone-800 flex items-center justify-center text-xs font-bold shrink-0">
                      {idx + 1}
                    </span>
                    <h4 className="font-bold text-stone-900 text-base">{q.title}</h4>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700'
                  }`}>
                    {isCorrect ? `+${q.points} نقطة` : '0 نقطة'}
                  </span>
                </div>

                {/* Specific answer details */}
                <div className="text-sm text-stone-700 space-y-1.5 my-3 pr-8">
                  {q.type === 'multiple_choice' && (
                    <>
                      <p>إجابتك: <span className="font-bold">{userAns !== undefined ? q.options[userAns] : 'لم تجب'}</span></p>
                      {!isCorrect && (
                        <p className="text-emerald-700 font-bold">الإجابة الصحيحة: {q.options[q.correctAnswerIndex]}</p>
                      )}
                    </>
                  )}

                  {q.type === 'complete' && (
                    <>
                      <p>إجابتك: <span className="font-bold">{userAns || 'فارغ'}</span></p>
                      {!isCorrect && (
                        <p className="text-emerald-700 font-bold">الكلمة الصحيحة: {q.blankAnswer}</p>
                      )}
                    </>
                  )}

                  {q.type === 'true_false' && (
                    <>
                      <p>إجابتك: <span className="font-bold">{userAns === true ? 'صح' : userAns === false ? 'خطأ' : 'لم تجب'}</span></p>
                      {!isCorrect && (
                        <p className="text-emerald-700 font-bold">الصحيح هو: {q.isCorrect ? 'صح (صواب)' : 'خطأ'}</p>
                      )}
                    </>
                  )}

                  {q.type === 'short_answer' && (
                    <>
                      <p>إجابتك: <span className="font-medium bg-white p-2 rounded block mt-1 border border-stone-200">{userAns || 'لم تتم الكتابة'}</span></p>
                      <p className="text-stone-600 text-xs">الإجابة النموذجية: <span className="font-bold">{q.modelAnswer}</span></p>
                    </>
                  )}
                </div>

                {/* Biblical Explanation */}
                {q.explanation && (
                  <div className="bg-white/80 p-3 rounded-xl border border-stone-200 text-xs text-stone-600 space-y-1 mr-8">
                    {q.verseReference && (
                      <span className="font-bold text-amber-800 block">شاهد الآية: ({q.verseReference})</span>
                    )}
                    <p>{q.explanation}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-stone-200">
          <button
            onClick={onBackToReading}
            className="w-full sm:w-auto px-6 py-3 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold rounded-xl transition-colors cursor-pointer text-sm flex items-center justify-center gap-2"
          >
            <span>← العودة لقراءة الأصحاح</span>
          </button>

          <button
            onClick={onGoToLeaderboard}
            className="w-full sm:w-auto px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-md transition-colors cursor-pointer text-sm flex items-center justify-center gap-2"
          >
            <span>عرض لوحة الشرف 🏆</span>
          </button>
        </div>
      </div>
    );
  }

  if (!currentQ) {
    return (
      <div className="bg-white p-10 rounded-3xl text-center text-stone-600">
        <p>لا توجد أسئلة مضافة في هذا الأصحاح حتى الآن.</p>
        <button onClick={onBackToReading} className="mt-4 px-6 py-2 bg-amber-600 text-white rounded-xl">
          العودة
        </button>
      </div>
    );
  }

  // Active Question View
  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-10 shadow-lg border border-stone-200 space-y-5 sm:space-y-8 overflow-hidden">
      {/* Guest Notice Banner if not logged in */}
      {!currentUser && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm shadow-xs animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center font-bold text-base shrink-0 shadow-xs">
              ☦
            </div>
            <div>
              <p className="font-extrabold text-amber-950 text-sm">تنبيه: أنت تتصفح المسابقة الآن كزائر</p>
              <p className="text-amber-800 text-xs">
                يمكنك تجربة الإجابة، ولكن لحفظ درجاتك والمنافسة في لوحة الشرف يجب تسجيل الدخول أو إنشاء حساب.
              </p>
            </div>
          </div>
          <button
            onClick={onRequireAuth}
            className="w-full sm:w-auto px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs sm:text-sm cursor-pointer shadow-sm whitespace-nowrap transition-all"
          >
            تسجيل الدخول / إنشاء حساب ➔
          </button>
        </div>
      )}

      {/* Header with progress */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black text-amber-900 bg-amber-100 px-3 py-1 rounded-full">
              {quiz.dayLabel || `مسابقة اليوم ${quiz.dayNumber}`}
            </span>
            <span className="text-xs text-stone-500">
              السؤال {currentStepIndex + 1} من {questions.length}
            </span>
          </div>
          <h2 className="text-sm text-stone-700 mt-1 font-bold">
            {quiz.bookName} - الأصحاح {quiz.chapterNumber} ({quiz.date})
          </h2>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-stone-700 bg-stone-100 px-3 py-1.5 rounded-xl">
          <Award className="w-4 h-4 text-amber-600" />
          <span>{currentQ.points} نقاط</span>
        </div>
      </div>

      {/* Question Prompt Title */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-amber-700">
          <HelpCircle className="w-4 h-4" />
          {currentQ.type === 'multiple_choice' && <span>سؤال اختيار من متعدد</span>}
          {currentQ.type === 'complete' && <span>سؤال أكمل الآية المباركة</span>}
          {currentQ.type === 'true_false' && <span>سؤال صح أم خطأ</span>}
          {currentQ.type === 'short_answer' && <span>سؤال مقالي وتأملي قصير</span>}
        </div>

        <h3 className={`font-bold text-stone-900 ${qFontClass} leading-snug`}>
          {currentQ.title}
        </h3>
      </div>

      {/* Question Interactive Body based on Type */}
      <div className="pt-2">
        {/* TYPE 1: Multiple Choice */}
        {currentQ.type === 'multiple_choice' && (
          <div className="space-y-3">
            {currentQ.options.map((option, optIdx) => {
              const isSelected = answers[currentQ.id] === optIdx;
              return (
                <button
                  key={optIdx}
                  onClick={() => handleSelectAnswer(currentQ.id, optIdx)}
                  className={`w-full text-right p-4 sm:p-5 rounded-2xl border-2 transition-all flex items-center justify-between gap-4 cursor-pointer ${
                    isSelected
                      ? 'bg-amber-50 border-amber-600 shadow-md ring-2 ring-amber-400/30'
                      : 'bg-white hover:bg-stone-50 border-stone-200'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border ${
                      isSelected ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-100 text-stone-700 border-stone-300'
                    }`}>
                      {String.fromCharCode(65 + optIdx)}
                    </span>
                    <span className={`text-base sm:text-lg font-medium ${isSelected ? 'text-amber-950 font-bold' : 'text-stone-800'}`}>
                      {option}
                    </span>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    isSelected ? 'border-amber-600 bg-amber-600 text-white' : 'border-stone-300'
                  }`}>
                    {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* TYPE 2: Complete the Verse */}
        {currentQ.type === 'complete' && (
          <div className="space-y-6">
            {/* The Verse with Blank Highlight */}
            <div className="bg-amber-50/80 p-6 rounded-2xl border border-amber-200">
              <p className="text-stone-900 font-scripture text-2xl sm:text-3xl font-bold leading-relaxed text-center">
                «{currentQ.verseWithBlank}»
              </p>
            </div>

            {/* Word bank for seniors to tap easily */}
            {currentQ.wordBank && currentQ.wordBank.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs text-stone-500 font-medium">اختر الكلمة الصحيحة لملء الفراغ (أو اكتبها):</span>
                <div className="flex flex-wrap gap-2.5">
                  {currentQ.wordBank.map((word, wIdx) => {
                    const isSelected = answers[currentQ.id] === word;
                    return (
                      <button
                        key={wIdx}
                        onClick={() => handleSelectAnswer(currentQ.id, word)}
                        className={`px-5 py-3 rounded-xl border text-base font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-600 text-white border-amber-600 shadow-md'
                            : 'bg-stone-100 hover:bg-stone-200 text-stone-800 border-stone-300'
                        }`}
                      >
                        {word}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Manual text input */}
            <div className="space-y-2">
              <label className="text-xs text-stone-500 font-medium block">
                الكلمة المكتوبة في الفراغ:
              </label>
              <input
                type="text"
                value={answers[currentQ.id] || ''}
                onChange={(e) => handleSelectAnswer(currentQ.id, e.target.value)}
                placeholder="اكتب الكلمة هنا..."
                className="w-full p-4 rounded-xl border border-stone-300 text-lg font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* TYPE 3: True / False (Huge accessible cards) */}
        {currentQ.type === 'true_false' && (
          <div className="space-y-6">
            <div className="bg-stone-50 p-6 rounded-2xl border border-stone-200">
              <p className="text-stone-900 text-xl sm:text-2xl font-bold leading-relaxed text-center">
                «{currentQ.statement}»
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* TRUE BUTTON */}
              <button
                onClick={() => handleSelectAnswer(currentQ.id, true)}
                className={`p-6 rounded-2xl border-2 flex items-center justify-center gap-4 text-xl font-bold transition-all cursor-pointer ${
                  answers[currentQ.id] === true
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg ring-4 ring-emerald-300'
                    : 'bg-white hover:bg-emerald-50 text-emerald-800 border-emerald-300'
                }`}
              >
                <CheckCircle2 className="w-8 h-8" />
                <span>صـح (صواب)</span>
              </button>

              {/* FALSE BUTTON */}
              <button
                onClick={() => handleSelectAnswer(currentQ.id, false)}
                className={`p-6 rounded-2xl border-2 flex items-center justify-center gap-4 text-xl font-bold transition-all cursor-pointer ${
                  answers[currentQ.id] === false
                    ? 'bg-rose-600 text-white border-rose-600 shadow-lg ring-4 ring-rose-300'
                    : 'bg-white hover:bg-rose-50 text-rose-800 border-rose-300'
                }`}
              >
                <XCircle className="w-8 h-8" />
                <span>خـطـأ</span>
              </button>
            </div>
          </div>
        )}

        {/* TYPE 4: Short Text Answer */}
        {currentQ.type === 'short_answer' && (
          <div className="space-y-4">
            <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200 text-sm text-amber-900">
              <p className="font-semibold mb-1">{currentQ.questionPrompt}</p>
              <p className="text-xs text-amber-700">
                اكتب إجابتك أو تأملك بكلماتك البسيطة، ويراجع الخادم إجاباتك ويمنحك النقاط بالكامل.
              </p>
            </div>

            <textarea
              rows={4}
              value={answers[currentQ.id] || ''}
              onChange={(e) => handleSelectAnswer(currentQ.id, e.target.value)}
              placeholder="اكتب إجابتك هنا بوضوح..."
              className="w-full p-4 rounded-2xl border border-stone-300 text-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="flex items-center justify-between gap-4 pt-6 border-t border-stone-200">
        <button
          onClick={currentStepIndex === 0 ? onBackToReading : handlePrev}
          className="px-5 py-3 rounded-xl border border-stone-300 hover:bg-stone-100 text-stone-700 font-bold text-sm transition-colors cursor-pointer flex items-center gap-2"
        >
          <ArrowRight className="w-4 h-4" />
          <span>{currentStepIndex === 0 ? 'قراءة الأصحاح' : 'السابق'}</span>
        </button>

        {currentStepIndex < questions.length - 1 ? (
          <button
            onClick={handleNext}
            className="px-8 py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer text-base flex items-center gap-2"
          >
            <span>السؤال التالي</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg transition-all cursor-pointer text-base flex items-center gap-2"
          >
            <Send className="w-5 h-5" />
            <span>إرسال الإجابات وتسجيل النقاط</span>
          </button>
        )}
      </div>
    </div>
  );
};
