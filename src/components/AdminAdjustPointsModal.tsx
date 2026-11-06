import React, { useState } from 'react';
import { X, Award, PlusCircle, MinusCircle, AlertCircle, Check } from 'lucide-react';
import { User } from '../types';
import { StorageService } from '../services/storage';

interface AdminAdjustPointsModalProps {
  user: User | null;
  adminUser: User;
  onClose: () => void;
  onPointsAdjusted: () => void;
}

export const AdminAdjustPointsModal: React.FC<AdminAdjustPointsModalProps> = ({
  user,
  adminUser,
  onClose,
  onPointsAdjusted,
}) => {
  if (!user) return null;

  const [pointsChange, setPointsChange] = useState<number>(10);
  const [reason, setReason] = useState<string>('مكافأة تشجيعية لحفظ الأصحاح وتسميعه في الكنيسة');
  const [isDeducting, setIsDeducting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const quickReasons = [
    'مكافأة تشجيعية لاجتماع الحكماء لمواظبتهم',
    'حفظ وتسميع آية اليوم في القداس',
    'إجابة مقالية متميزة في الأصحاح',
    'مشاركة الأسرة وحل المسابقة جماعياً',
    'تصحيح رصيد النقاط يدوياً',
  ];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pointsChange || pointsChange === 0) return;

    try {
      const delta = isDeducting ? -Math.abs(pointsChange) : Math.abs(pointsChange);
      await StorageService.adjustUserPoints(
        user.id,
        delta,
        reason.trim() || 'تعديل بواسطة الخادم المشرف',
        adminUser.fullName || 'الخادم المشرف'
      );

      setSuccessMessage(`تم ${delta > 0 ? 'إضافة' : 'خصم'} ${Math.abs(delta)} نقطة بنجاح في قاعدة البيانات!`);
      setTimeout(() => {
        onPointsAdjusted();
        onClose();
      }, 1200);
    } catch (err: any) {
      setSuccessMessage(null);
      alert(err?.message || 'تعذر تعديل النقاط في قاعدة البيانات.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-stone-200 relative animate-in fade-in zoom-in-95 duration-200">
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
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-900">تعديل نقاط المتسابق</h2>
            <p className="text-xs text-stone-500">
              صلاحية الخادم لإضافة أو خصم درجات تشجيعية أو تقييم إجابات يدوية
            </p>
          </div>
        </div>

        {/* User Card Info */}
        <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 mb-6 flex items-center justify-between">
          <div>
            <h4 className="font-bold text-stone-900 text-base">{user.fullName}</h4>
            <span className="text-xs text-stone-500">{user.phone}</span>
          </div>
          <div className="text-left font-mono">
            <span className="text-xs text-stone-500 block">الرصيد الحالي:</span>
            <span className="text-2xl font-black text-amber-900">{user.totalPoints} نقطة</span>
          </div>
        </div>

        {successMessage ? (
          <div className="bg-emerald-50 text-emerald-800 p-6 rounded-2xl border border-emerald-200 text-center font-bold flex items-center justify-center gap-2">
            <Check className="w-5 h-5" />
            <span>{successMessage}</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            {/* Action Type Toggle (Add vs Deduct) */}
            <div className="grid grid-cols-2 gap-3 p-1 bg-stone-100 rounded-xl">
              <button
                type="button"
                onClick={() => setIsDeducting(false)}
                className={`py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  !isDeducting ? 'bg-emerald-600 text-white shadow-sm' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <PlusCircle className="w-4 h-4" />
                <span>إضافة نقاط (+)</span>
              </button>
              <button
                type="button"
                onClick={() => setIsDeducting(true)}
                className={`py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  isDeducting ? 'bg-rose-600 text-white shadow-sm' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <MinusCircle className="w-4 h-4" />
                <span>خصم نقاط (-)</span>
              </button>
            </div>

            {/* Points Amount */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                مقدار النقاط:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={pointsChange}
                  onChange={(e) => setPointsChange(Math.max(1, parseInt(e.target.value) || 0))}
                  className="w-full p-3 rounded-xl border border-stone-300 font-mono text-xl font-bold text-stone-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                />
                <span className="text-sm font-bold text-stone-500 shrink-0">نقطة</span>
              </div>
            </div>

            {/* Quick Reason Suggestions */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                سبب التعديل أو المكافأة:
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {quickReasons.map((qr, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setReason(qr)}
                    className="text-[11px] bg-stone-100 hover:bg-stone-200 text-stone-700 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                  >
                    {qr}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="اكتب السبب بالتفصيل ليظهر في سجل العضو..."
                className="w-full p-3 rounded-xl border border-stone-300 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                required
              />
            </div>

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
                className={`px-6 py-2.5 rounded-xl text-white text-sm font-bold shadow-md cursor-pointer ${
                  isDeducting ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                تأكيد وحفظ الرصيد
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
