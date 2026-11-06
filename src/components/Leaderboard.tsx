import React, { useState } from 'react';
import { Trophy, Medal, Award, Flame, Search, UserPlus, SlidersHorizontal, CheckCircle2, Heart } from 'lucide-react';
import { User, AgeGroup } from '../types';

interface LeaderboardProps {
  users: User[];
  currentUser: User | null;
  onOpenAdjustPoints: (user: User) => void;
  onOpenRegisterModal: () => void;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({
  users,
  currentUser,
  onOpenAdjustPoints,
  onOpenRegisterModal,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<'all' | AgeGroup>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Sort descending by totalPoints
  const sortedUsers = [...users].sort((a, b) => b.totalPoints - a.totalPoints);

  const filteredUsers = sortedUsers.filter((u) => {
    const matchesFilter = selectedFilter === 'all' || u.ageGroup === selectedFilter;
    const matchesSearch = u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || u.phone.includes(searchQuery);
    return matchesFilter && matchesSearch;
  });

  const top3 = sortedUsers.slice(0, 3);

  const getAgeGroupLabel = (group: AgeGroup) => {
    switch (group) {
      case 'senior':
        return 'اجتماع الحكماء';
      case 'youth':
        return 'شباب';
      case 'family':
        return 'أسرة مسيحية';
      case 'servant':
        return 'خادم';
      default:
        return 'عام';
    }
  };

  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="space-y-6 sm:space-y-8 w-full max-w-5xl mx-auto overflow-hidden">
      {/* Header Banner */}
      <div className="w-full bg-gradient-to-r from-amber-900 via-stone-900 to-amber-950 text-white rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-xl border border-amber-800/40 flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">
        <div className="space-y-2 text-center sm:text-right">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-amber-300 bg-amber-900/60 px-3 py-1 rounded-full border border-amber-700/50">
            <Trophy className="w-3.5 h-3.5" />
            <span>لوحة الشرف ومراكز الأوائل</span>
          </div>
          <h1 className="text-xl sm:text-3xl font-extrabold text-amber-50">
            فرسان كلمة الله ومسابقة الكتاب المقدس
          </h1>
          <p className="text-stone-300 text-xs sm:text-sm">
            «طُوبَى لِلَّذِي يَقْرَأُ وَلِلَّذِينَ يَسْمَعُونَ كَلِمَاتِ النُّبُوَّةِ» (رؤيا 1: 3)
          </p>
        </div>

        {/* Action Button for Admin / Registration */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={onOpenRegisterModal}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            <span>تسجيل مخدوم / عضو جديد</span>
          </button>
        </div>
      </div>

      {/* Top 3 Podium Cards */}
      {top3.length > 0 && selectedFilter === 'all' && !searchQuery && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          {/* 2nd Place */}
          {top3[1] && (
            <div className="order-2 sm:order-1 bg-white rounded-2xl p-5 border border-stone-200 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
              <div className="w-12 h-12 rounded-full bg-slate-100 border-2 border-slate-300 flex items-center justify-center text-slate-700 font-extrabold text-lg mb-2">
                2
              </div>
              <Medal className="w-6 h-6 text-slate-400 mb-1" />
              <h3 className="font-bold text-stone-900 text-base mb-1 truncate max-w-full">
                {top3[1].fullName}
              </h3>
              <span className="text-xs text-stone-500 mb-3">{getAgeGroupLabel(top3[1].ageGroup)}</span>
              <div className="text-2xl font-extrabold text-stone-800 font-mono">
                {top3[1].totalPoints} <span className="text-xs font-sans text-stone-500">نقطة</span>
              </div>
              {isAdmin && (
                <button
                  onClick={() => onOpenAdjustPoints(top3[1])}
                  className="mt-3 text-xs text-amber-700 hover:text-amber-800 font-bold underline cursor-pointer"
                >
                  تعديل النقاط
                </button>
              )}
            </div>
          )}

          {/* 1st Place */}
          {top3[0] && (
            <div className="order-1 sm:order-2 bg-gradient-to-b from-amber-50 to-white rounded-3xl p-6 border-2 border-amber-400 shadow-md flex flex-col items-center text-center relative overflow-hidden sm:-translate-y-2">
              <div className="absolute top-2 right-2 bg-amber-400 text-stone-950 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full">
                المركز الأول 👑
              </div>
              <div className="w-16 h-16 rounded-full bg-amber-400 border-4 border-amber-200 flex items-center justify-center text-stone-950 font-extrabold text-2xl mb-2 shadow-inner">
                1
              </div>
              <Trophy className="w-8 h-8 text-amber-500 mb-1" />
              <h3 className="font-extrabold text-stone-900 text-lg mb-1 truncate max-w-full">
                {top3[0].fullName}
              </h3>
              <span className="text-xs text-amber-800 font-medium mb-3">{getAgeGroupLabel(top3[0].ageGroup)}</span>
              <div className="text-3xl font-extrabold text-amber-900 font-mono">
                {top3[0].totalPoints} <span className="text-sm font-sans text-amber-700">نقطة</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold mt-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>حل {top3[0].quizzesSolved} أصحاح</span>
              </div>
              {isAdmin && (
                <button
                  onClick={() => onOpenAdjustPoints(top3[0])}
                  className="mt-3 text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 px-3 py-1 rounded-lg font-bold cursor-pointer"
                >
                  تعديل النقاط
                </button>
              )}
            </div>
          )}

          {/* 3rd Place */}
          {top3[2] && (
            <div className="order-3 bg-white rounded-2xl p-5 border border-stone-200 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
              <div className="w-12 h-12 rounded-full bg-amber-100 border-2 border-amber-300 flex items-center justify-center text-amber-800 font-extrabold text-lg mb-2">
                3
              </div>
              <Award className="w-6 h-6 text-amber-600 mb-1" />
              <h3 className="font-bold text-stone-900 text-base mb-1 truncate max-w-full">
                {top3[2].fullName}
              </h3>
              <span className="text-xs text-stone-500 mb-3">{getAgeGroupLabel(top3[2].ageGroup)}</span>
              <div className="text-2xl font-extrabold text-stone-800 font-mono">
                {top3[2].totalPoints} <span className="text-xs font-sans text-stone-500">نقطة</span>
              </div>
              {isAdmin && (
                <button
                  onClick={() => onOpenAdjustPoints(top3[2])}
                  className="mt-3 text-xs text-amber-700 hover:text-amber-800 font-bold underline cursor-pointer"
                >
                  تعديل النقاط
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Category Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto p-1 bg-stone-100 rounded-xl">
          {[
            { id: 'all', label: 'الجميع' },
            { id: 'senior', label: '👴 اجتماع الحكماء' },
            { id: 'youth', label: 'شباب' },
            { id: 'family', label: 'أسر' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedFilter(tab.id as any)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                selectedFilter === tab.id
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="بحث بالاسم أو الهاتف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-9 pl-3 py-2 rounded-xl border border-stone-200 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Full Leaderboard Table / Cards */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-md overflow-hidden">
        <div className="p-5 border-b border-stone-200 flex items-center justify-between">
          <h2 className="font-bold text-stone-900 text-base">ترتيب المتسابقين ({filteredUsers.length} مشارك)</h2>
          <span className="text-xs text-stone-500">تحديث فوري للنقاط</span>
        </div>

        <div className="divide-y divide-stone-100">
          {filteredUsers.map((user, index) => {
            const isMe = currentUser ? user.id === currentUser.id : false;
            return (
              <div
                key={user.id}
                className={`p-3.5 sm:p-5 flex items-center justify-between gap-3 sm:gap-4 transition-colors ${
                  isMe ? 'bg-amber-50/70 border-r-4 border-amber-600' : 'hover:bg-stone-50'
                }`}
              >
                {/* Rank & User Info */}
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <span className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 ${
                    index === 0
                      ? 'bg-amber-400 text-stone-950'
                      : index === 1
                      ? 'bg-slate-300 text-stone-900'
                      : index === 2
                      ? 'bg-amber-700 text-white'
                      : 'bg-stone-100 text-stone-600'
                  }`}>
                    {index + 1}
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <h4 className="font-bold text-stone-900 text-sm sm:text-base truncate">
                        {user.fullName}
                      </h4>
                      {isMe && (
                        <span className="bg-amber-200 text-amber-900 text-[10px] px-1.5 py-0.2 rounded font-bold">
                          أنت
                        </span>
                      )}
                      {user.registeredBy === 'admin' && (
                        <span className="text-[10px] bg-stone-100 text-stone-600 px-1.5 py-0.2 rounded hidden xs:inline" title="سجله الخادم">
                          سجله الخادم
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs text-stone-500 mt-0.5 flex-wrap">
                      <span>{getAgeGroupLabel(user.ageGroup)}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1 text-amber-700 font-medium">
                        <Flame className="w-3 h-3 fill-current shrink-0" />
                        <span>{user.currentStreak} يوم</span>
                      </span>
                      <span className="hidden sm:inline">·</span>
                      <span className="hidden sm:inline">{user.quizzesSolved} أصحاح</span>
                    </div>
                  </div>
                </div>

                {/* Points & Admin Action */}
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <div className="text-left font-mono">
                    <span className="text-lg sm:text-2xl font-black text-amber-900">
                      {user.totalPoints}
                    </span>
                    <span className="text-[11px] sm:text-xs font-sans text-stone-500 mr-1 block sm:inline">نقطة</span>
                  </div>

                  {isAdmin && (
                    <button
                      onClick={() => onOpenAdjustPoints(user)}
                      className="px-2.5 py-1.5 sm:px-3 bg-stone-100 hover:bg-amber-100 text-stone-800 hover:text-amber-950 text-xs font-bold rounded-lg border border-stone-200 transition-colors cursor-pointer flex items-center gap-1"
                      title="إضافة أو تعديل نقاط المتسابق"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">تعديل</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {filteredUsers.length === 0 && (
            <div className="p-8 text-center text-stone-500 text-sm">
              لا توجد نتائج مطابقة لبحثك.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
