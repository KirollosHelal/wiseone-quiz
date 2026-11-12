import React, { useState } from 'react';
import { X, Lock, Mail, Phone, User, Check, ShieldCheck, HeartHandshake, Eye, EyeOff } from 'lucide-react';
import { StorageService } from '../services/storage';
import { AgeGroup, User as UserType } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (user: UserType) => void;
  initialMode?: 'signin' | 'signup';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthenticated,
  initialMode = 'signin',
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  
  // Sign In fields
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Sign Up fields
  const [fullName, setFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('senior');
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const res = await StorageService.authenticate(identifier, password);
    if (res.success && res.user) {
      setSuccessNotice(res.message || `أهلاً بك يا «${res.user.fullName}»! جاري الدخول...`);
      setTimeout(() => {
        onAuthenticated(res.user!);
        onClose();
        setSuccessNotice(null);
      }, res.message ? 3200 : 700);
    } else {
      setAuthError(res.error || 'فشل تسجيل الدخول');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (!fullName.trim() || (!newEmail.trim() && !newPhone.trim())) {
      setAuthError('يرجى كتابة الاسم ورقم الهاتف أو البريد الإلكتروني');
      return;
    }

    const newUser: UserType = {
      id: 'user-' + Date.now(),
      fullName: fullName.trim(),
      email: newEmail.trim() || undefined,
      password: newPassword.trim() || '123',
      phone: newPhone.trim() || '01000000000',
      ageGroup,
      role: 'user',
      totalPoints: 10, // 10 welcome points
      quizzesSolved: 0,
      currentStreak: 0,
      registeredBy: 'self',
      createdAt: new Date().toISOString().split('T')[0],
      submissions: [],
    };

    try {
      const created = await StorageService.addUser(newUser);
      StorageService.setCurrentUser(created || newUser);

      setSuccessNotice(`تم إنشاء حسابك بنجاح في قاعدة البيانات ومنحك 10 نقاط ترحيبية!`);
      setTimeout(() => {
        onAuthenticated(created || newUser);
        onClose();
        setSuccessNotice(null);
      }, 900);
    } catch (err: any) {
      setAuthError(err?.message || 'تعذر إنشاء الحساب في قاعدة البيانات. حاول مرة أخرى.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-8 shadow-2xl border border-stone-200 relative animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 left-5 p-2 rounded-full hover:bg-stone-100 text-stone-500 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon & Title */}
        <div className="text-center space-y-2 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-500 text-white flex items-center justify-center mx-auto shadow-md">
            <span className="text-2xl font-black">☦</span>
          </div>
          <h2 className="text-2xl font-black text-stone-900">
            {mode === 'signin' ? 'تسجيل الدخول للمسابقة' : 'إنشاء حساب متسابق جديد'}
          </h2>
          <p className="text-xs text-stone-500">
            {mode === 'signin'
              ? 'سجل دخولك لحفظ درجاتك والمنافسة في لوحة الشرف اليومية'
              : 'انضم لفرسان كلمة الله واجمع النقاط يومياً'}
          </p>
        </div>

        {/* Tab switch */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-stone-100 rounded-2xl mb-6 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setAuthError(null);
            }}
            className={`py-2.5 rounded-xl transition-all cursor-pointer ${
              mode === 'signin' ? 'bg-amber-600 text-white shadow-sm' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            تسجيل الدخول
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setAuthError(null);
            }}
            className={`py-2.5 rounded-xl transition-all cursor-pointer ${
              mode === 'signup' ? 'bg-amber-600 text-white shadow-sm' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            حساب جديد
          </button>
        </div>

        {successNotice && (
          <div className="mb-4 p-4 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200 text-center font-bold text-xs flex items-center justify-center gap-2">
            <Check className="w-4 h-4" />
            <span>{successNotice}</span>
          </div>
        )}

        {authError && (
          <div className="mb-4 p-3 bg-rose-50 text-rose-800 rounded-xl border border-rose-200 text-xs font-semibold">
            {authError}
          </div>
        )}

        {/* MODE 1: SIGN IN */}
        {mode === 'signin' ? (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                الاسم أو البريد الإلكتروني أو رقم الموبايل:
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="الاسم أو البريد أو رقم الموبايل"
                  className="w-full pl-3 pr-10 py-3 rounded-xl border border-stone-300 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                />
                <Mail className="w-4 h-4 text-stone-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                كلمة المرور أو رقم الدخول (4 أرقام):
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="كلمة المرور أو رقم الدخول"
                  className="w-full pl-10 pr-10 py-3 rounded-xl border border-stone-300 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono"
                  required
                />
                <Lock className="w-4 h-4 text-stone-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-sm shadow-md transition-all cursor-pointer"
            >
              تسجيل الدخول الآن ➔
            </button>
          </form>
        ) : (
          /* MODE 2: SIGN UP */
          <form onSubmit={handleSignUp} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">الاسم بالكامل: *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="مثال: مريم بطرس غطاس"
                className="w-full p-2.5 rounded-xl border border-stone-300 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">رقم الموبايل: *</label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="01234567890"
                  className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">البريد (اختياري):</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="name@email.com"
                  className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">كلمة المرور: *</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="أدخل كلمة مرور سهلة التذكر"
                className="w-full p-2.5 rounded-xl border border-stone-300 text-sm font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">الفئة العمرية:</label>
              <select
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
                className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                <option value="senior">👴 اجتماع الحكماء</option>
                <option value="youth">👦 الشباب والخريجون</option>
                <option value="family">👨‍👩‍👧‍👦 أسرة مسيحية</option>
              </select>
              <p className="text-[10px] text-stone-500 mt-1">
                * ملاحظة: تسجيل الخدام والمسؤولين يتم من خلال المشرف العام فقط.
              </p>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-sm shadow-md transition-all cursor-pointer mt-2"
            >
              إنشاء الحساب وبدء المسابقة ➔
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
