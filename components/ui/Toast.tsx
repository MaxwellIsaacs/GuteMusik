import React from 'react';

interface ToastProps {
  message: string | null;
}

export const Toast: React.FC<ToastProps> = ({ message }) => {
  return (
    <div className={`fixed bottom-32 left-1/2 -translate-x-1/2 z-[100] transition-opacity duration-300 pointer-events-none ${message ? 'opacity-100' : 'opacity-0'}`}>
      <div className="bg-[#111] text-white border border-white/10 px-6 py-3 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex items-center gap-3 font-medium text-sm">
        <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse shadow-[0_0_10px_#9333ea]"></div>
        {message}
      </div>
    </div>
  );
};