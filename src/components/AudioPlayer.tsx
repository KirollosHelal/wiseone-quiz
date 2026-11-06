import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Gauge, AlertCircle, Headphones } from 'lucide-react';

interface AudioPlayerProps {
  audioUrl: string;
  chapterTitle: string;
  durationHint?: string;
  autoPlay?: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  chapterTitle,
  durationHint = '5:00',
  autoPlay = false,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Reset state when audioUrl changes
    setIsPlaying(false);
    setCurrentTime(0);
    setAudioError(false);
    setIsLoading(true);

    if (audioRef.current) {
      audioRef.current.load();
    }
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        setAudioError(false);
      }).catch((err) => {
        console.warn('Playback error or auto-play restriction:', err);
        setAudioError(true);
      });
    }
  };

  const skipSeconds = (sec: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + sec));
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
      setIsLoading(false);
      setAudioError(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = parseFloat(e.target.value);
    setCurrentTime(target);
    if (audioRef.current) {
      audioRef.current.currentTime = target;
    }
  };

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="w-full max-w-full bg-stone-900 text-stone-100 rounded-2xl p-4 sm:p-5 shadow-lg border border-amber-900/40 my-4 relative overflow-hidden">
      {/* Background soft ambient glow */}
      <div className="absolute top-0 right-0 w-64 h-32 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        onError={() => {
          setIsLoading(false);
          setAudioError(true);
        }}
      />

      {/* Player Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-stone-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <Headphones className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-amber-100 leading-snug">
              التسجيل الصوتي للأصحاح
            </h3>
            <p className="text-xs text-stone-400">
              استمع براحة وبصوت هادئ ونقي (مناسب لضعاف البصر واجتماع الحكماء)
            </p>
          </div>
        </div>

        {/* Speed Controls for Seniors */}
        <div className="flex items-center gap-1 sm:gap-1.5 bg-stone-800/80 p-1 rounded-lg border border-stone-700/60 text-xs self-stretch sm:self-auto justify-center">
          <Gauge className="w-3.5 h-3.5 text-amber-400 mx-1 hidden sm:inline" />
          <span className="text-[11px] text-stone-400 ml-1 hidden sm:inline">السرعة:</span>
          {[
            { rate: 0.75, label: '0.75x بطيء' },
            { rate: 1.0, label: '1.0x عادي' },
            { rate: 1.25, label: '1.25x' },
          ].map((item) => (
            <button
              key={item.rate}
              onClick={() => changeSpeed(item.rate)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                playbackRate === item.rate
                  ? 'bg-amber-500 text-stone-950 font-bold'
                  : 'text-stone-300 hover:text-white hover:bg-stone-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Progress Bar & Times */}
      <div className="space-y-2 mb-4">
        <div className="relative">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-3 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500 focus:outline-none"
            aria-label="شريط تقدم التلاوة الصوتية"
          />
        </div>
        <div className="flex justify-between items-center text-xs text-stone-400 font-mono">
          <span>{formatTime(currentTime)}</span>
          <span className="text-stone-500">من</span>
          <span>{duration > 0 ? formatTime(duration) : durationHint}</span>
        </div>
      </div>

      {/* Main Controls Row */}
      <div className="flex items-center justify-between gap-2 sm:gap-4 flex-wrap sm:flex-nowrap">
        {/* Rewind 10s */}
        <button
          onClick={() => skipSeconds(-10)}
          className="flex items-center gap-1 px-2.5 sm:px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl transition-colors cursor-pointer text-xs font-medium"
          title="رجوع 10 ثوانٍ"
        >
          <RotateCcw className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="hidden xs:inline">-10 ثوانٍ</span>
          <span className="xs:hidden">-10ث</span>
        </button>

        {/* Big Prominent Play/Pause Button for elderly fingers */}
        <button
          onClick={togglePlay}
          className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 sm:px-8 py-3 sm:py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 rounded-2xl font-black text-sm sm:text-base shadow-md transition-all transform active:scale-95 cursor-pointer min-w-[130px]"
          aria-label={isPlaying ? 'إيقاف مؤقت' : 'تشغيل التسجيل الصوتي'}
        >
          {isPlaying ? (
            <>
              <Pause className="w-5 h-5 sm:w-6 sm:h-6 fill-current shrink-0" />
              <span>إيقاف مؤقت</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current shrink-0" />
              <span>تشغيل الصوت</span>
            </>
          )}
        </button>

        {/* Forward 10s */}
        <button
          onClick={() => skipSeconds(10)}
          className="flex items-center gap-1 px-2.5 sm:px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl transition-colors cursor-pointer text-xs font-medium"
          title="تقديم 10 ثوانٍ"
        >
          <span className="hidden xs:inline">+10 ثوانٍ</span>
          <span className="xs:hidden">+10ث</span>
          <RotateCw className="w-4 h-4 text-amber-400 shrink-0" />
        </button>

        {/* Mute / Unmute */}
        <button
          onClick={toggleMute}
          className="p-2 sm:p-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-xl transition-colors cursor-pointer"
          title={isMuted ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
          aria-label={isMuted ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
        >
          {isMuted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />}
        </button>
      </div>

      {/* Fallback / Error note if external stream fails */}
      {audioError && (
        <div className="mt-3 p-2.5 bg-amber-950/60 border border-amber-800/60 rounded-xl flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>يمكنك الاستماع للتسجيل مباشرة أو قراءة النص بوضوح أدناه.</span>
          </div>
          <a
            href={audioUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-bold hover:text-white"
          >
            فتح الملف الصوتي
          </a>
        </div>
      )}
    </div>
  );
};
