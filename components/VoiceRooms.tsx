
import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { Room, UserProfile } from '../types';
import { Search, Users, Gamepad2, Music, Coffee, ArrowLeft, ArrowRight, Zap, Lock, KeyRound, Radio, Power, Coins, Mic, Sparkles, Hash } from 'lucide-react';

interface VoiceRoomsProps {
  currentUser: UserProfile;
  onJoinRoom: (roomId: string) => void;
}

export const VoiceRooms: React.FC<VoiceRoomsProps> = ({ currentUser, onJoinRoom }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Password Prompt State
  const [passwordPromptRoom, setPasswordPromptRoom] = useState<Room | null>(null);
  const [passwordInput, setPasswordInput] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'rooms'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedRooms: Room[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Room));
      setRooms(fetchedRooms);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleRoomClick = async (room: Room) => {
      // Check for Ban (Kick)
      if (room.kickedUsers && room.kickedUsers[currentUser.uid]) {
          const kickTime = room.kickedUsers[currentUser.uid];
          const banDuration = 10 * 60 * 1000; // 10 minutes
          if (Date.now() - kickTime < banDuration) {
              const remaining = Math.ceil((banDuration - (Date.now() - kickTime)) / 60000);
              alert(`You are banned from this room. Try again in ${remaining} minutes.`);
              return;
          }
      }

      const isCreator = room.createdBy === currentUser.uid;
      const isAdmin = room.admins?.includes(currentUser.uid);

      // If Host/Admin joins, ensure room is ACTIVE
      if (isCreator || isAdmin) {
          if (!room.active) {
              await updateDoc(doc(db, 'rooms', room.id), { active: true });
          }
          onJoinRoom(room.id);
          return;
      }

      // Normal User Joining
      if (!room.active) {
          alert("This room is currently offline. Wait for the host to start it.");
          return;
      }

      if (room.password) {
          setPasswordPromptRoom(room);
          setPasswordInput('');
      } else {
          onJoinRoom(room.id);
      }
  };

  const submitPassword = () => {
      if (!passwordPromptRoom) return;
      if (passwordInput === passwordPromptRoom.password) {
          onJoinRoom(passwordPromptRoom.id);
          setPasswordPromptRoom(null);
      } else {
          alert("Incorrect password!");
          setPasswordInput('');
      }
  };

  const handleQuickJoin = () => {
    const activeUnlockedRooms = rooms.filter(r => r.active && !r.password);
    if (activeUnlockedRooms.length === 0) {
      alert("No active open rooms available.");
      return;
    }
    const randomRoom = activeUnlockedRooms[Math.floor(Math.random() * activeUnlockedRooms.length)];
    onJoinRoom(randomRoom.id);
  };

  const getTopicIcon = (topic: string) => {
    switch (topic.toLowerCase()) {
      case 'gaming': return <Gamepad2 size={12} />;
      case 'music': return <Music size={12} />;
      default: return <Hash size={12} />;
    }
  };

  // Only show Active rooms to public
  const publicRooms = rooms.filter(room => {
    if (!room.active) return false; // Hide offline rooms
    if (room.isPaidCall) return false; // Hide 1-on-1 private calls
    
    const q = searchQuery.toLowerCase();
    const nameMatch = room.name.toLowerCase().includes(q);
    const topicMatch = room.topic?.toLowerCase().includes(q);
    return nameMatch || topicMatch;
  });

  // Find the room owned by the current user (excluding paid calls)
  const myRoom = rooms.find(r => r.createdBy === currentUser.uid && !r.isPaidCall);

  return (
    <div className="flex flex-col h-full bg-transparent text-white relative">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-violet-900/20 to-transparent pointer-events-none z-0" />
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-fuchsia-600/10 rounded-full blur-[100px] pointer-events-none z-0" />

      {/* Header */}
      <div className="px-6 py-8 relative z-10 flex flex-col justify-center flex-shrink-0">
        {isSearchOpen ? (
          <div className="flex items-center gap-3 animate-fade-in">
            <button 
              onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
              className="p-3 bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1 bg-[#1A1A21] border border-white/10 flex items-center px-4 py-3 rounded-2xl shadow-inner">
              <Search size={18} className="text-gray-400 mr-3" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find a vibe..."
                className="bg-transparent border-none outline-none w-full text-sm text-white placeholder-gray-600 font-medium"
                autoFocus
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-extrabold text-white tracking-tight leading-none">
                Heartly
              </h1>
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                 <p className="text-xs font-medium text-gray-400">{publicRooms.length} active now</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsSearchOpen(true)}
                className="w-12 h-12 flex items-center justify-center text-white bg-white/5 border border-white/10 rounded-full transition-colors hover:bg-white/10 touch-manipulation"
              >
                <Search size={22} />
              </button>
              
              {myRoom && (
                  <button 
                    onClick={() => handleRoomClick(myRoom)}
                    className="w-12 h-12 flex items-center justify-center text-white bg-gradient-to-tr from-violet-600 to-fuchsia-600 rounded-full shadow-lg shadow-violet-500/25 hover:scale-105 transition-transform touch-manipulation"
                    title="Go to My Room"
                  >
                    <Radio size={22} />
                  </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Room List with Scroll Fix */}
      <div className="flex-1 px-6 space-y-4 overflow-y-auto relative z-10 pb-32 overscroll-y-contain">
        {loading ? (
           <div className="flex justify-center py-20"><div className="w-10 h-10 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin"/></div>
        ) : publicRooms.length === 0 ? (
           <div className="text-center py-24 opacity-60">
             <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/5">
               <Sparkles size={32} className="text-gray-500" />
             </div>
             <p className="text-gray-300 font-bold text-lg">No vibes yet.</p>
             <p className="text-gray-500 text-xs mt-1">Check back later or start your own.</p>
           </div>
        ) : (
          publicRooms.map(room => (
            <div 
              key={room.id}
              onClick={() => handleRoomClick(room)}
              className="group relative bg-[#121216]/60 backdrop-blur-xl rounded-[2rem] border border-white/5 overflow-hidden transition-all hover:border-violet-500/30 active:scale-[0.98] shadow-lg cursor-pointer touch-manipulation"
            >
              {/* Top Accent Gradient */}
              <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-white/5 to-transparent opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none" />
              
              <div className="p-5 relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    {/* Topic Badge */}
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] font-bold text-violet-300 uppercase tracking-wider mb-2 backdrop-blur-md">
                        {getTopicIcon(room.topic || '')}
                        {room.topic || 'General'}
                    </div>
                    <h3 className="text-xl font-bold text-white leading-tight flex items-center gap-2 group-hover:text-violet-200 transition-colors">
                        {room.name}
                        {room.password && <Lock size={14} className="text-yellow-500" />}
                    </h3>
                  </div>
                  
                  {/* Audio Visualizer (Fake) */}
                  <div className="flex items-end gap-0.5 h-4">
                      <div className="w-1 bg-violet-500 rounded-full animate-[bounce_1s_infinite] h-2"></div>
                      <div className="w-1 bg-fuchsia-500 rounded-full animate-[bounce_1.2s_infinite] h-4"></div>
                      <div className="w-1 bg-cyan-500 rounded-full animate-[bounce_0.8s_infinite] h-3"></div>
                  </div>
                </div>

                {/* Footer Info */}
                <div className="flex items-center justify-between mt-6">
                   <div className="flex -space-x-3 items-center">
                      {room.participants.filter(p => p.seatIndex >= 0 || p.seatIndex === 999).slice(0, 4).map((p, i) => (
                         <img 
                           key={i}
                           src={p.photoURL || `https://ui-avatars.com/api/?name=${p.displayName}`} 
                           alt={p.displayName} 
                           className="w-10 h-10 rounded-full border-2 border-[#121216] bg-gray-800 object-cover shadow-md"
                         />
                      ))}
                      {room.participants.length > 4 && (
                        <div className="w-10 h-10 rounded-full border-2 border-[#121216] bg-[#1A1A21] text-[10px] flex items-center justify-center font-bold text-white shadow-md">
                          +{room.participants.length - 4}
                        </div>
                      )}
                   </div>

                   <div className="flex items-center gap-1 text-gray-400 group-hover:text-white transition-colors">
                      <span className="text-xs font-bold mr-1">{room.participants.length}</span>
                      <Users size={14} />
                   </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Password Prompt Modal */}
      {passwordPromptRoom && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
               <div className="bg-[#181818] border border-white/10 w-full max-w-xs rounded-[2rem] p-8 shadow-2xl animate-fade-in text-center relative overflow-hidden">
                   <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-transparent pointer-events-none" />
                   
                   <div className="w-16 h-16 bg-gradient-to-tr from-yellow-400/20 to-yellow-600/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-yellow-500/30">
                       <KeyRound size={32} className="text-yellow-500" />
                   </div>
                   
                   <h3 className="text-xl font-bold text-white mb-2">Private Room</h3>
                   <p className="text-gray-400 text-xs mb-6 font-medium">Enter the 4-digit access code.</p>
                   
                   <input 
                        type="password"
                        maxLength={4}
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        className="w-full text-center text-3xl tracking-[0.5em] bg-black/50 border border-white/10 rounded-2xl py-4 mb-6 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/50 outline-none text-white font-mono shadow-inner"
                        autoFocus
                   />
                   
                   <div className="flex gap-3">
                       <button onClick={() => setPasswordPromptRoom(null)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-gray-400 transition-colors">Cancel</button>
                       <button onClick={submitPassword} className="flex-1 py-3 bg-yellow-500 hover:bg-yellow-400 rounded-xl text-xs font-bold text-black transition-colors shadow-lg shadow-yellow-500/20">Unlock</button>
                   </div>
               </div>
          </div>
      )}
    </div>
  );
};
