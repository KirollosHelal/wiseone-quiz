import React, { useState } from 'react';
import { X, UserPlus, HeartHandshake, ShieldCheck, Check } from 'lucide-react';
import { User, AgeGroup } from '../types';
import { StorageService } from '../services/storage';

interface AdminRegisterUserModalProps {
  currentUser: User | null;
  onClose: () => void;
  onUserRegistered: (newUser: User) => void;
}

export const AdminRegisterUserModal: React.FC<AdminRegisterUserModalProps> = ({
  currentUser,
  onClose,
  onUserRegistered,
}) => {
  const isAdmin = currentUser?.role === 'admin';

  const [registerMode, setRegisterMode] = useState<'admin_proxy' | 'self'>(
    isAdmin ? 'admin_proxy' : 'self'
  );

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('senior');
  const [servantNotes, setServantNotes] = useState('');
  const [initialPoints, setInitialPoints] = useState<number>(10);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;

    const newUser: User = {
      id: 'user-' + Date.now(),
      fullName: fullName.trim(),
      phone: phone.trim() || '01000000000',
      ageGroup,
      role: 'user',
      totalPoints: 0,
      quizzesSolved: 0,
      currentStreak: 0,
      registeredBy: registerMode === 'admin_proxy' ? 'admin' : 'self',
      servantNotes: servantNotes.trim() || undefined,
      createdAt: new Date().toISOString().split('T')[0],
      submissions: [],
    };

    try {
      const created = await StorageService.addUser(newUser);

      if (initialPoints > 0) {
        await StorageService.adjustUserPoints(
          created?.id || newUser.id,
          initialPoints,
          'نقاط ترحيبية وتشجيعية عند التسجيل',
          currentUser?.fullName || 'الخادم المشرف'
        );
      }

      setSuccessMessage(`تم تسجيل «${newUser.fullName}» بنجاح في قاعدة البيانات وإضافته لقائمة المتسابقين!`);
      setTimeout(() => {
        onUserRegistered(created || newUser);
        onClose();
      }, 1200);
    } catch (err: any) {
      alert(err?.message || 'تعذر تسجيل المستخدم في قاعدة البيانات.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-stone-200 relative animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 left-5 p-2 rounded-full hover:bg-stone-100 text-stone-500 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center shrink-0">
            <UserPlus className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-900">
              {isAdmin ? 'تسجيل متسابق / مخدوم جديد' : 'تسجيل متسابق جديد'}
            </h2>
            <p className="text-xs text-stone-500">
              {isAdmin
                ? 'خاص بالخادم: تسجيل أعضاء اجتماع الحكماء أو المخدومين الذين لا يستطيعون التسجيل بأنفسهم'
                : 'انضم لمسابقة الكتاب المقدس اليومية واجمع النقاط'}
            </p>
          </div>
        </div>

        {/* Tab switch if Admin */}
        {isAdmin && (
          <div className="flex gap-2 p-1 bg-stone-100 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => {
                setRegisterMode('admin_proxy');
                setAgeGroup('senior');
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                registerMode === 'admin_proxy'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <HeartHandshake className="w-4 h-4" />
              <span>تسجيل نيابة عن مخدوم (اجتماع الحكماء)</span>
            </button>
            <button
              type="button"
              onClick={() => setRegisterMode('self')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                registerMode === 'self'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>تسجيل متسابق جديد</span>
            </button>
          </div>
        )}

        {successMessage ? (
          <div className="bg-emerald-50 text-emerald-800 p-6 rounded-2xl border border-emerald-200 text-center font-bold flex items-center justify-center gap-2">
            <Check className="w-5 h-5" />
            <span>{successMessage}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                الاسم بالكامل (ثلاثي أو رباعي): *
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="مثال: عم مرقص حنا فرج"
                className="w-full p-3 rounded-xl border border-stone-300 text-base font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                required
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                رقم الموبايل / الواتساب للتواصل:
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="مثال: 01234567890"
                className="w-full p-3 rounded-xl border border-stone-300 font-mono text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            {/* Age Group */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                الفئة العمرية / الاجتماع:
              </label>
              <select
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
                className="w-full p-3 rounded-xl border border-stone-300 text-sm font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                <option value="senior">👴 اجتماع الحكماء</option>
                <option value="youth">👦 الشباب والخريجون</option>
                <option value="family">👨‍👩‍👧‍👦 أفراد الأسرة</option>
                <option value="servant">☦ خادم كنسي (صلاحية خاصة للخادم)</option>
              </select>
            </div>

            {/* Initial Points if Admin */}
            {isAdmin && (
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  نقاط تشجيعية أولية كهدية تسجيل:
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={initialPoints}
                  onChange={(e) => setInitialPoints(parseInt(e.target.value) || 0)}
                  className="w-full p-3 rounded-xl border border-stone-300 font-mono text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            )}

            {/* Servant Notes */}
            {registerMode === 'admin_proxy' && (
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  ملاحظات الخادم للمتابعة:
                </label>
                <textarea
                  rows={2}
                  value={servantNotes}
                  onChange={(e) => setServantNotes(e.target.value)}
                  placeholder="مثال: يتابع معه الخادم يوسف هاتفياً، يسمع الأصحاح بصوت عالٍ..."
                  className="w-full p-3 rounded-xl border border-stone-300 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            )}

            {/* Submit Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl border border-stone-300 hover:bg-stone-100 text-stone-700 text-sm font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold shadow-md cursor-pointer"
              >
                تأكيد وتسجيل الحساب
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
