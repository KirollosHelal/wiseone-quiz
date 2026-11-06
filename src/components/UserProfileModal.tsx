import React from 'react';
import { X, Award, Flame, CheckCircle, Calendar, Phone, Heart, LogOut } from 'lucide-react';
import { User, DailyQuiz } from '../types';

interface UserProfileModalProps {
  user: User;
  quizzes: DailyQuiz[];
  onClose: () => void;
  onSelectQuiz: (quiz: DailyQuiz) => void;
  onLogout?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  quizzes,
  onClose,
  onSelectQuiz,
  onLogout,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-stone-200 relative animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 left-5 p-2 rounded-full hover:bg-stone-100 text-stone-500 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* User Avatar & Info */}
        <div className="text-center space-y-3 mb-6 pb-6 border-b border-stone-200">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-600 to-amber-400 text-white flex items-center justify-center mx-auto text-3xl font-extrabold shadow-md border-4 border-amber-100">
            ☦
          </div>
          <h2 className="text-2xl font-extrabold text-stone-900">{user.fullName}</h2>
          <div className="flex items-center justify-center gap-2 text-xs text-stone-500">
            <span>{user.ageGroup === 'senior' ? 'اجتماع الحكماء' : user.role === 'admin' ? 'خادم مسؤول (المشرف العام)' : 'عضو بالمسابقة'}</span>
            <span>·</span>
            <span className="flex items-center gap-1 font-mono">
              <Phone className="w-3 h-3" />
              {user.phone}
            </span>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-2 pt-3">
            <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 text-center">
              <span className="text-2xl font-black text-amber-900 font-mono block">{user.totalPoints}</span>
              <span className="text-[11px] font-bold text-amber-800">إجمالي النقاط</span>
            </div>
            <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200 text-center">
              <span className="text-2xl font-black text-stone-900 font-mono block">{user.quizzesSolved}</span>
              <span className="text-[11px] font-bold text-stone-600">أصحاح مكتمل</span>
            </div>
            <div className="bg-rose-50 p-3 rounded-2xl border border-rose-200 text-center">
              <span className="text-2xl font-black text-rose-800 font-mono block flex items-center justify-center gap-1">
                <Flame className="w-4 h-4 fill-current text-rose-500" />
                {user.currentStreak}
              </span>
              <span className="text-[11px] font-bold text-rose-800">أيام متتالية</span>
            </div>
          </div>
        </div>

        {/* Servant Notes if registered by admin */}
        {user.servantNotes && (
          <div className="bg-amber-50/80 p-4 rounded-2xl border border-amber-200 mb-6 text-xs text-amber-900 space-y-1">
            <span className="font-bold flex items-center gap-1.5 text-amber-800">
              <Heart className="w-3.5 h-3.5 text-amber-600 fill-current" />
              متابعة وملاحظة الخادم:
            </span>
            <p>{user.servantNotes}</p>
          </div>
        )}

        {/* Solved Quizzes History */}
        <div className="space-y-3">
          <h3 className="font-bold text-stone-900 text-sm">سجل حل المسابقات:</h3>
          {user.submissions.length > 0 ? (
            <div className="space-y-2">
              {user.submissions.map((sub, idx) => {
                const targetQuiz = quizzes.find(q => q.id === sub.quizId);
                return (
                  <div
                    key={idx}
                    className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between text-xs hover:bg-stone-100 transition-colors"
                  >
                    <div>
                      <h4 className="font-bold text-stone-900">
                        {targetQuiz ? `${targetQuiz.bookName} - أصحاح ${targetQuiz.chapterNumber}` : sub.quizId}
                      </h4>
                      <span className="text-stone-500">{sub.date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
                        {sub.score} / {sub.maxScore} نقطة
                      </span>
                      {targetQuiz && (
                        <button
                          onClick={() => {
                            onSelectQuiz(targetQuiz);
                            onClose();
                          }}
                          className="text-amber-700 hover:text-amber-900 font-bold underline cursor-pointer"
                        >
                          مراجعة
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center p-6 text-stone-500 text-xs bg-stone-50 rounded-2xl">
              لم تحل مسابقات حتى الآن. ابدأ بقراءة أصحاح اليوم وحل الأسئلة لتجمع النقاط!
            </div>
          )}
        </div>

        <div className="pt-6 mt-6 border-t border-stone-200 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
          {onLogout && (
            <button
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="w-full sm:w-auto px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-300 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <LogOut className="w-4 h-4 text-rose-600" />
              <span>تسجيل الخروج من الحساب</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-xl cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
