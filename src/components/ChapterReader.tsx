import React from 'react';
import { BookOpen, Heart, CheckCircle2, Bookmark, Lock, Calendar, ArrowRight, ShieldAlert, Sparkles, Volume2 } from 'lucide-react';
import { DailyQuiz, User } from '../types';
import { SeniorSettings, StorageService } from '../services/storage';
import { AudioPlayer } from './AudioPlayer';
import headerBgImage from '../assets/images/coptic_bible_header_1792934497575.jpg';

interface ChapterReaderProps {
  quiz: DailyQuiz;
  settings: SeniorSettings;
  onGoToQuiz: () => void;
  isSolved: boolean;
  score?: number;
  currentUser?: User | null;
  onGoToTodayQuiz?: () => void;
  onGoToPreviousDays?: () => void;
}

export const ChapterReader: React.FC<ChapterReaderProps> = ({
  quiz,
  settings,
  onGoToQuiz,
  isSolved,
  score,
  currentUser,
  onGoToTodayQuiz,
  onGoToPreviousDays,
}) => {
  // Map font scale level to CSS classes
  const fontClassByLevel = [
    'text-lg sm:text-xl leading-relaxed sm:leading-loose',
    'text-xl sm:text-2xl leading-loose',
    'text-2xl sm:text-3xl leading-loose',
    'text-3xl sm:text-4xl leading-loose tracking-wide',
  ][settings.fontSizeLevel] || 'text-xl leading-loose';

  const testamentLabel = quiz.testament === 'new' ? 'العهد الجديد' : 'العهد القديم';

  // Check if this day is locked because its date is strictly ahead of Egypt's current date
  const isFutureLocked = StorageService.isQuizLockedFuture(quiz.date);
  const isAdmin = currentUser?.role === 'admin';
  const shouldBlockContent = isFutureLocked && !isAdmin;

  return (
    <div className="space-y-6 w-full max-w-full overflow-hidden">
      {/* Admin preview notice if viewing a future locked quiz */}
      {isFutureLocked && isAdmin && (
        <div className="bg-amber-500/15 border-2 border-amber-500/80 rounded-2xl p-4 sm:p-5 flex items-start gap-3 text-amber-950">
          <ShieldAlert className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-black text-sm sm:text-base text-amber-950">
              معاينة الخادم المسئول — هذا اليوم متقدم عن تاريخ اليوم الحالي
            </h4>
            <p className="text-xs sm:text-sm text-amber-900 leading-relaxed font-medium">
              تاريخ هذا الأصحاح ({quiz.date}) لم يحن بعد بتوقيت مصر 🇪🇬. الأصحاح والمسابقة مغلقان تماماً أمام المتسابقين لحين حلول تاريخ اليوم، وسيتحول حينها تلقائياً إلى «اليوم الرئيسي الحصري». يمكنك هنا كخادم مراجعة النص والتسجيل الصوتي والأسئلة والتأكد من جاهزيتها.
            </p>
          </div>
        </div>
      )}

      {/* Chapter Banner & Meta with guaranteed dark background and crisp, high-contrast readable text */}
      <div 
        style={{ backgroundColor: '#14120e', color: '#ffffff' }}
        className="isolate relative text-white rounded-2xl sm:rounded-3xl p-5 sm:p-10 shadow-2xl border-2 border-amber-600/70 overflow-hidden min-h-[240px] flex flex-col justify-end w-full"
      >
        {/* Solid fallback background layer */}
        <div className="absolute inset-0 z-0 bg-[#14120e]" style={{ backgroundColor: '#14120e' }} />

        {/* Background photo with high-fidelity scrim */}
        <img
          src={headerBgImage}
          alt="الكتاب المقدس المفتوح في الكنيسة القبطية"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover object-center z-0 opacity-30 mix-blend-luminosity pointer-events-none"
        />

        {/* Dual dark scrims ensuring 100% dark contrast regardless of image loading */}
        <div className="absolute inset-0 bg-stone-950/90 z-0 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/95 to-stone-900/90 z-0 pointer-events-none" />

        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-300 mb-2.5 flex-wrap">
            <span className="bg-amber-400 text-stone-950 font-black px-2.5 py-1 rounded-lg text-xs shadow-md">
              {quiz.dayLabel || `اليوم ${quiz.dayNumber}`}
            </span>

            {isFutureLocked && (
              <span className="bg-rose-500/90 text-white font-extrabold px-2.5 py-1 rounded-lg text-xs shadow-md flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>مغلق حتى حلول تاريخه</span>
              </span>
            )}

            <span className="text-stone-400">·</span>
            <span 
              style={{ color: '#fef08a' }}
              className="font-mono text-amber-200 font-bold bg-stone-900/90 px-2 py-0.5 rounded-md border border-stone-700 shadow-xs"
            >
              {quiz.date}
            </span>
            <span className="text-stone-400">·</span>
            <span className="bg-stone-900/90 px-2.5 py-0.5 rounded-md text-amber-300 text-xs font-bold border border-amber-500/40">
              {testamentLabel}
            </span>
          </div>

          <h1 
            style={{ color: '#fef08a' }}
            className="text-2xl sm:text-4xl font-black text-amber-200 mb-3 tracking-tight drop-shadow-lg"
          >
            {quiz.bookName} - الأصحاح {quiz.chapterNumber}
          </h1>

          <p 
            style={{ color: '#f5f5f4' }}
            className="text-stone-100 text-sm sm:text-base font-semibold mb-5 leading-relaxed drop-shadow-md max-w-2xl"
          >
            {quiz.title}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {shouldBlockContent ? (
              <div className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-stone-800 text-amber-300 rounded-xl font-bold text-xs sm:text-sm border border-amber-500/40 shadow-inner">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>المسابقة مغلقة حتى حلول تاريخ {quiz.date} بتوقيت مصر 🇪🇬</span>
              </div>
            ) : (
              <button
                onClick={onGoToQuiz}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 bg-amber-400 hover:bg-amber-300 text-stone-950 rounded-xl font-black text-sm sm:text-base shadow-lg transition-all cursor-pointer transform active:scale-95"
              >
                {isSolved ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-800" />
                    <span>حللت المسابقة ({score} / {quiz.totalPoints} نقطة) - مراجعة</span>
                  </>
                ) : (
                  <>
                    <BookOpen className="w-5 h-5 text-stone-950" />
                    <span>ابدأ حل مسابقة الأصحاح ({quiz.totalPoints} نقطة)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CONDITIONAL CONTENT: If locked future day for normal users, display the locked state */}
      {shouldBlockContent ? (
        <div className="bg-white rounded-3xl p-6 sm:p-12 border-2 border-amber-200 shadow-xl text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-amber-100 text-amber-800 flex items-center justify-center shadow-md ring-4 ring-amber-200/50">
            <Lock className="w-10 h-10 text-amber-800" />
          </div>

          <div className="max-w-xl mx-auto space-y-2">
            <span className="inline-block px-3 py-1 rounded-full bg-amber-100 text-amber-900 font-bold text-xs">
              مسابقة قادمة مجدولة مسبقاً 📅
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-stone-900">
              الأصحاح والمسابقة مغلقان لحين حلول موعدهما
            </h2>
            <p className="text-stone-600 text-sm sm:text-base leading-relaxed pt-1">
              تم إعداد أصحاح <strong className="text-stone-900 font-extrabold">{quiz.bookName} (الأصحاح {quiz.chapterNumber})</strong> مقدماً من قِبل الخادم المسؤول.
            </p>
          </div>

          {/* Timezone Callout Card */}
          <div className="max-w-md mx-auto bg-amber-50 border-2 border-amber-300/80 rounded-2xl p-5 text-right space-y-2.5">
            <div className="flex items-center gap-2 text-amber-950 font-black text-sm">
              <Calendar className="w-4 h-4 text-amber-700" />
              <span>موعد إتاحة القراءة وسماع الصوت وحل المسابقة:</span>
            </div>
            <p className="text-xl font-black font-mono text-amber-900 dir-ltr text-center py-1">
              {quiz.date}
            </p>
            <p className="text-xs text-amber-800/90 text-center font-medium">
              سيتم الفتح تلقائياً مع بداية هذا اليوم بحسب توقيت جمهورية مصر العربية 🇪🇬، ويصبح حينها هو «اليوم الرئيسي الحصري».
            </p>
          </div>

          {/* Spiritual Encouragement */}
          <div className="max-w-lg mx-auto bg-stone-50 border border-stone-200 rounded-2xl p-4 text-stone-700">
            <p className="font-scripture text-lg sm:text-xl text-amber-950 font-bold">
              «لِكُلِّ شَيْءٍ زَمَانٌ، وَلِكُلِّ أَمْرٍ تَحْتَ السَّمَاوَاتِ وَقْتٌ»
            </p>
            <span className="text-xs text-stone-500 font-bold block mt-1">(سفر الجامعة 3: 1)</span>
          </div>

          {/* Action Navigation Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2 max-w-md mx-auto">
            {onGoToTodayQuiz && (
              <button
                onClick={onGoToTodayQuiz}
                className="w-full sm:w-auto px-6 py-3 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black rounded-xl text-sm shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>العودة لمسابقة اليوم الحالي المتاحة</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {onGoToPreviousDays && (
              <button
                onClick={onGoToPreviousDays}
                className="w-full sm:w-auto px-6 py-3 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold rounded-xl text-sm transition-all cursor-pointer"
              >
                تصفح الأيام السابقة
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Audio Player for Elders & Parishioners */}
          <AudioPlayer
            audioUrl={quiz.audioUrl}
            chapterTitle={`${quiz.bookName} ${quiz.chapterNumber}`}
            durationHint={quiz.audioDuration}
            autoPlay={settings.autoPlayAudio}
          />

          {/* Key Verse Box with Rich Gold & Dark Contrast */}
          {quiz.keyVerse && (
            <div className="bg-amber-50/90 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 shadow-xs w-full">
              <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs sm:text-sm mb-2">
                <Bookmark className="w-4 h-4 text-amber-700 shrink-0" />
                <span>آية اليوم للحفظ والبركة:</span>
              </div>
              <p className="text-stone-950 font-scripture text-lg sm:text-2xl font-bold leading-relaxed text-amber-950">
                «{quiz.keyVerse}»
              </p>
            </div>
          )}

          {/* Scripture Reading Section */}
          <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-10 shadow-md border border-stone-200 w-full">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-stone-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-sm">
                  ☦
                </div>
                <div>
                  <h2 className="text-xl font-bold text-stone-900">نص الأصحاح المقدس للقراءة</h2>
                  <p className="text-xs text-stone-500">اقرأ بتمهل وتأمل قبل الإجابة على الأسئلة</p>
                </div>
              </div>
            </div>

            {/* Verses Container */}
            <div className={`space-y-4 font-scripture ${fontClassByLevel} text-stone-800`}>
              {quiz.verses.map((v) => (
                <div
                  key={v.verse}
                  className="group hover:bg-amber-50/60 p-2.5 rounded-xl transition-colors flex items-start gap-3"
                >
                  <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full bg-amber-100 text-amber-900 font-sans text-xs font-bold border border-amber-200/80 mt-1 shrink-0 select-none">
                    {v.verse}
                  </span>
                  <p className="text-stone-900 font-scripture text-justify">
                    {v.text}
                  </p>
                </div>
              ))}
            </div>

            {/* Post-reading call to action */}
            <div className="mt-10 pt-6 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-4 bg-stone-50 p-6 rounded-2xl">
              <div>
                <h3 className="font-bold text-base text-stone-900">هل انتهيت من قراءة الأصحاح وسماعه؟</h3>
                <p className="text-xs text-stone-600">اختبر فهمك وشارك في مسابقة اليوم واجمع النقاط لاسمك في لوحة الشرف</p>
              </div>
              <button
                onClick={onGoToQuiz}
                className="w-full sm:w-auto px-8 py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer whitespace-nowrap text-base"
              >
                الانتقال للأسئلة الآن ➔
              </button>
            </div>
          </div>

          {/* Father's Spiritual Reflection */}
          {quiz.reflection && (
            <div className="bg-stone-100 border border-stone-300/80 rounded-2xl p-6 text-stone-800 shadow-sm">
              <div className="flex items-center gap-2 text-stone-700 font-bold text-sm mb-2">
                <Heart className="w-4 h-4 text-red-600 fill-current" />
                <span>تأمل روحي في الأصحاح:</span>
              </div>
              <p className="text-sm sm:text-base leading-relaxed text-stone-700">
                {quiz.reflection}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};
