import React from 'react';
import { ViewState } from '../types';
import { Mic, MessageSquare, User } from 'lucide-react';

interface NavigationProps {
  currentView: ViewState;
  setView: (view: ViewState) => void;
  unreadCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({ currentView, setView, unreadCount = 0 }) => {
  return (
    // Added pb-safe to handle iPhone Home Bar, removed max-w-md mx-auto for full width preference
    <div className="fixed bottom-0 left-0 right-0 z-50 px-6 pb-6 pb-safe pointer-events-none flex justify-center w-full">
      <div className="bg-[#121216]/90 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] px-6 py-2 flex items-center gap-4 shadow-[0_20px_50px_rgba(0,0,0,0.6)] pointer-events-auto ring-1 ring-white/10">
        <NavButton 
          isActive={currentView === 'rooms'} 
          onClick={() => setView('rooms')}
          icon={<Mic size={20} />}
          label="Voice Rooms"
        />

        <NavButton 
          isActive={currentView === 'chats'} 
          onClick={() => setView('chats')}
          icon={<MessageSquare size={20} />}
          label="Chats"
          badge={unreadCount > 0 ? unreadCount : undefined}
        />
        
        <NavButton 
          isActive={currentView === 'me'} 
          onClick={() => setView('me')}
          icon={<User size={20} />}
          label="Me"
        />
      </div>
    </div>
  );
};

const NavButton = ({ isActive, onClick, icon, badge, label }: { isActive: boolean; onClick: () => void; icon: React.ReactNode, badge?: number, label: string }) => (
  <button
    onClick={onClick}
    className={`
      relative group flex flex-col items-center justify-center min-w-[70px] h-14 rounded-[1.8rem] transition-all duration-400 touch-manipulation
      ${isActive ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}
    `}
  >
    <div className={`
        transition-all duration-300 mb-1
        ${isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]' : ''}
    `}>
        {icon}
    </div>
    
    <span className={`text-[9px] font-bold uppercase tracking-wider transition-all ${isActive ? 'opacity-100' : 'opacity-60'}`}>
        {label}
    </span>

    {badge && (
      <div className="absolute top-1 right-3 min-w-[16px] h-[16px] bg-gradient-to-r from-red-500 to-pink-600 text-white text-[9px] font-bold flex items-center justify-center rounded-full border-2 border-[#121216] shadow-lg animate-bounce z-10">
        {badge > 9 ? '9+' : badge}
      </div>
    )}
  </button>
);