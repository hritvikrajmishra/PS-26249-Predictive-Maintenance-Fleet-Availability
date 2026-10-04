import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  Clock,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export const DEMO_BOOKMARKS = [
  { label: 'T-20d Base', date: '2025-11-05', desc: 'Baseline nominal operations' },
  { label: 'T-10d Anom', date: '2025-11-15', desc: 'First sustained anomaly' },
  { label: 'Hero State', date: '2025-11-25', desc: 'AC-017 hydraulic degradation' },
  { label: 'Year-End', date: '2025-12-31', desc: 'Full cycle year-end' },
];

export const TimeReplayControl: React.FC = () => {
  const { asOfDate, setAsOfDate } = useAuth();
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const playTimerRef = useRef<number | null>(null);

  const currentDate = asOfDate || '2025-11-25';

  const adjustDate = (days: number) => {
    const d = new Date(currentDate);
    if (isNaN(d.getTime())) return;
    d.setDate(d.getDate() + days);
    const newStr = d.toISOString().split('T')[0];
    setAsOfDate(newStr);
  };

  // Play / Pause loop cycling through bookmarks or day-by-day
  useEffect(() => {
    if (!isPlaying) {
      if (playTimerRef.current) {
        window.clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
      return;
    }

    playTimerRef.current = window.setInterval(() => {
      // Step through bookmarks in sequence
      const currentIndex = DEMO_BOOKMARKS.findIndex((b) => b.date === asOfDate);
      const nextIndex = (currentIndex + 1) % DEMO_BOOKMARKS.length;
      setAsOfDate(DEMO_BOOKMARKS[nextIndex].date);
    }, 2500);

    return () => {
      if (playTimerRef.current) {
        window.clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    };
  }, [isPlaying, asOfDate, setAsOfDate]);

  return (
    <div className="flex items-center space-x-1 sm:space-x-2 bg-slate-900/90 border border-slate-700/80 rounded-lg px-2 py-1 shadow-inner font-mono text-xs">
      {/* Replay Label / Icon */}
      <div className="hidden lg:flex items-center space-x-1 text-slate-400 pr-1 border-r border-slate-800">
        <Clock className="w-3.5 h-3.5 text-cyan-400" />
        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-300">Replay</span>
      </div>

      {/* Quick Jump Bookmarks */}
      <div className="hidden md:flex items-center space-x-1">
        {DEMO_BOOKMARKS.map((bm) => {
          const isActive = asOfDate === bm.date;
          return (
            <button
              key={bm.date}
              onClick={() => {
                setIsPlaying(false);
                setAsOfDate(bm.date);
              }}
              title={`${bm.label} (${bm.date}): ${bm.desc}`}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition ${
                isActive
                  ? 'bg-blue-600 text-white font-bold shadow-sm'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {bm.label}
            </button>
          );
        })}
      </div>

      {/* Date Stepper Controls: -1d, Input, +1d */}
      <div className="flex items-center space-x-0.5">
        <button
          onClick={() => {
            setIsPlaying(false);
            adjustDate(-1);
          }}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
          title="Previous Day (-1d)"
          aria-label="Previous Day"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center space-x-1 px-1 bg-slate-950/60 border border-slate-800 rounded">
          <Calendar className="w-3 h-3 text-blue-400 shrink-0" />
          <input
            type="date"
            value={currentDate}
            onChange={(e) => {
              setIsPlaying(false);
              setAsOfDate(e.target.value || '2025-11-25');
            }}
            className="bg-transparent text-slate-200 text-xs font-mono focus:outline-none w-[105px] cursor-pointer"
            title="Time-replay cutoff date"
          />
        </div>

        <button
          onClick={() => {
            setIsPlaying(false);
            adjustDate(1);
          }}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
          title="Next Day (+1d)"
          aria-label="Next Day"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Play / Pause Toggle */}
      <button
        onClick={() => setIsPlaying(!isPlaying)}
        className={`p-1 rounded transition flex items-center gap-1 text-[11px] ${
          isPlaying
            ? 'bg-amber-600/80 hover:bg-amber-500 text-white'
            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
        }`}
        title={isPlaying ? 'Pause replay tour' : 'Play replay tour (cycles key demo dates)'}
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      </button>

      {/* Reset to Hero Default */}
      {asOfDate !== '2025-11-25' && (
        <button
          onClick={() => {
            setIsPlaying(false);
            setAsOfDate('2025-11-25');
          }}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition"
          title="Reset to Hero Baseline Date (2025-11-25)"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
