import React from 'react';
import { Type, Eye, Shield, Sparkles, User as UserIcon, LogIn } from 'lucide-react';
import { SeniorSettings } from '../services/storage';
import { User } from '../types';

interface SeniorToolbarProps {
  settings: SeniorSettings;
  onUpdateSettings: (newSettings: SeniorSettings) => void;
  currentUser: User | null;
  onOpenAuth: () => void;
}

export const SeniorToolbar: React.FC<SeniorToolbarProps> = ({
  settings,
  onUpdateSettings,
  currentUser,
  onOpenAuth,
}) => {
  const fontSizes = [
    { level: 0, label: 'عادي (أ)' },
    { level: 1, label: 'كبير (أ+)' },
    { level: 2, label: 'كبير جداً (أ++)' },
    { level: 3, label: 'أكبر حجم (أ+++)' },
  ];

  const handleNextFontSize = () => {
    const nextLevel = (settings.fontSizeLevel + 1) % fontSizes.length;
    onUpdateSettings({ ...settings, fontSizeLevel: nextLevel });
  };

  const handleToggleContrast = () => {
    onUpdateSettings({ ...settings, highContrast: !settings.highContrast });
  };

  return (
    <aside aria-label="شريط إمكانية الوصول لاجتماع الحكماء" className="bg-amber-950 text-amber-100 border-b border-amber-900/60 px-3 sm:px-4 py-1.5 sm:py-2 text-xs shadow-xs">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        {/* Left: Accessibility Controls for Ejtimaa Al-Hokamaa */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <span className="text-amber-300 font-bold text-[11px] sm:text-xs flex items-center gap-1 whitespace-nowrap">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden xs:inline">تسهيلات</span> اجتماع الحكماء:
          </span>

          {/* Font Size button */}
          <button
            onClick={handleNextFontSize}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 bg-amber-900/80 hover:bg-amber-800 text-amber-100 rounded-lg border border-amber-700/50 transition-colors text-[11px] sm:text-xs font-medium cursor-pointer"
            title="انقر لتكبير أو تصغير حجم الخط"
            aria-label="تغيير حجم الخط"
          >
            <Type className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden sm:inline">الخط:</span>
            <span className="text-amber-300 font-bold">{fontSizes[settings.fontSizeLevel].label}</span>
          </button>

          {/* High Contrast */}
          <button
            onClick={handleToggleContrast}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] sm:text-xs font-medium transition-colors cursor-pointer ${
              settings.highContrast
                ? 'bg-amber-400 text-amber-950 border-amber-300 font-bold'
                : 'bg-amber-900/80 hover:bg-amber-800 text-amber-100 border-amber-700/50'
            }`}
            title="تبديل وضع التباين العالي لقراءة أوضح"
            aria-label="تبديل التباين العالي"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{settings.highContrast ? 'تباين عالي ✓' : 'تباين عالي'}</span>
          </button>
        </div>

        {/* Right: User status (Guest vs Authenticated) */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap text-xs">
          {currentUser ? (
            <>
              <div className="flex items-center gap-1.5 bg-amber-900/80 px-2 sm:px-2.5 py-1 rounded-lg border border-amber-800/80">
                <UserIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="font-bold text-amber-100 text-[11px] sm:text-xs truncate max-w-[80px] xs:max-w-[120px] sm:max-w-none">
                  {currentUser.fullName}
                </span>
                <span className="font-mono text-amber-300 font-bold text-[11px]">({currentUser.totalPoints}ن)</span>

                {currentUser.role === 'admin' && (
                  <span className="bg-amber-400 text-stone-950 text-[10px] px-1.5 py-0.2 rounded font-black whitespace-nowrap flex items-center gap-0.5">
                    <Shield className="w-2.5 h-2.5" />
                    مشرف
                  </span>
                )}
              </div>

              {/* Explicit Mobile/Tablet switch & Logout button in toolbar */}
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-1 text-amber-300 hover:text-white text-[11px] font-semibold bg-amber-900/60 hover:bg-amber-900 px-2 py-1 rounded-lg border border-amber-700/50 transition-colors cursor-pointer"
                title="تبديل الحساب أو تسجيل الدخول بحساب آخر"
              >
                <LogIn className="w-3 h-3 text-amber-400" />
                <span>تبديل</span>
              </button>
            </>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1 text-amber-300 hover:text-white text-[11px] font-bold bg-amber-900/60 hover:bg-amber-900 px-2.5 py-1 rounded-lg border border-amber-700/50 transition-colors cursor-pointer"
            >
              <LogIn className="w-3 h-3 text-amber-400" />
              <span>تسجيل الدخول للحل</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
