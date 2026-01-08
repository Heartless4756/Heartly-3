import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { Room, UserProfile, Participant } from '../types';
import { 
  Mic, MicOff, Power, Users, MessageSquare, Gift, Minimize2, 
  Crown, UserMinus, Share2, Settings, Lock, Music, Volume2
} from 'lucide-react';

interface ActiveRoomProps {
  roomId: string;
  currentUser: UserProfile;
  onLeave: () => void;
  isMinimized: boolean;
  onMinimize: () => void;
}

export const ActiveRoom: React.FC<ActiveRoomProps> = ({ 
  roomId, 
  currentUser, 
  onLeave,
  isMinimized,
  onMinimize 
}) => {
  const [roomData, setRoomData] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  
  // Music State
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const playlist = [
      "https://assets.mixkit.co/active_storage/sfx/2346/2346-preview.mp3",
      "https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3"
  ];

  const updateParticipantData = async (uid: string, data: Partial<Participant>) => {
    if (!roomData) return;
    const updatedParticipants = roomData.participants.map(p => 
      p.uid === uid ? { ...p, ...data } : p
    );
    await updateDoc(doc(db, 'rooms', roomId), { participants: updatedParticipants });
  };

  const playNextSong = () => {
      const next = (currentSongIndex + 1) % playlist.length;
      setCurrentSongIndex(next);
      if (musicAudioRef.current) {
          musicAudioRef.current.src = playlist[next];
          musicAudioRef.current.play().catch(() => {});
      }
  };

  const toggleMusic = () => {
      if (musicAudioRef.current) {
          if (isPlaying) {
              musicAudioRef.current.pause();
          } else {
              musicAudioRef.current.play();
          }
          setIsPlaying(!isPlaying);
      }
  };

  useEffect(() => {
    musicAudioRef.current = new Audio(playlist[0]);
    musicAudioRef.current.crossOrigin = "anonymous";
    musicAudioRef.current.loop = false;
    musicAudioRef.current.volume = 0.3; // Lower volume for background
    musicAudioRef.current.onended = () => { 
        if (roomData && roomData.createdBy === currentUser.uid) playNextSong(); 
    };

    // Auto-play only for host initially or if synchronized (simplified here)
    if (currentUser.uid) { // Simple check
       // In a real app, we'd sync playback state via Firestore
       // musicAudioRef.current.play().catch(e => console.log("Autoplay blocked", e));
    }

    return () => {
        if (musicAudioRef.current) {
            musicAudioRef.current.pause();
            musicAudioRef.current = null;
        }
    };
  }, []);

  // Sync Room Data
  useEffect(() => {
      const unsub = onSnapshot(doc(db, 'rooms', roomId), (docSnap) => {
          if (docSnap.exists()) {
              const data = docSnap.data() as Room;
              // Ensure we have the ID from the document snapshot
              const roomWithId = { ...data, id: docSnap.id };
              setRoomData(roomWithId);
              setParticipants(data.participants || []);
              
              if (data.kickedUsers && data.kickedUsers[currentUser.uid]) {
                  onLeave();
                  alert("You have been kicked from the room.");
              }

              if (!data.active && data.createdBy !== currentUser.uid) {
                  onLeave();
                  alert("Room ended by host.");
              }
          } else {
              onLeave();
          }
      });
      return () => unsub();
  }, [roomId, currentUser.uid, onLeave]);

  // Join Room Logic
  useEffect(() => {
    const joinRoom = async () => {
        const roomRef = doc(db, 'rooms', roomId);
        const roomSnap = await getDoc(roomRef);
        
        if (roomSnap.exists()) {
            const data = roomSnap.data() as Room;
            const isAlreadyIn = data.participants.find(p => p.uid === currentUser.uid);
            
            if (!isAlreadyIn) {
                const isHost = data.createdBy === currentUser.uid;
                const newParticipant: Participant = {
                    uid: currentUser.uid,
                    displayName: currentUser.displayName || 'User',
                    photoURL: currentUser.photoURL,
                    isMuted: true,
                    seatIndex: isHost ? 999 : -1,
                    joinedAt: Date.now(),
                    lastSeen: Date.now(),
                    frameUrl: currentUser.frameUrl
                };
                
                await updateDoc(roomRef, {
                    participants: arrayUnion(newParticipant)
                });
            } else {
                 // Just update lastSeen, DO NOT force re-add if logic was buggy before
                 // The previous loop issue was likely due to aggressive re-adding here.
                 // We will update local presence but rely on the main snapshot to keep us in sync.
                 const updatedParticipants = data.participants.map(p => 
                    p.uid === currentUser.uid ? { ...p, lastSeen: Date.now() } : p
                 );
                 await updateDoc(roomRef, { participants: updatedParticipants });
            }
        }
    };
    joinRoom();
  }, [roomId, currentUser.uid]); // Removed dependency on displayName/photoURL to prevent effect re-firing loop

  // Visibility Handling
  useEffect(() => {
    const handleVisibilityChange = async () => {
        if (document.visibilityState === 'visible' && roomData) {
            await updateParticipantData(currentUser.uid, { lastSeen: Date.now() });
        }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [currentUser.uid, roomData]);

  const handleLeave = async () => {
      if (!roomData) return;
      if (roomData.createdBy === currentUser.uid) {
          if (window.confirm("End the room for everyone?")) {
             await updateDoc(doc(db, 'rooms', roomId), { active: false });
          } else {
              return;
          }
      } else {
           const updatedParticipants = roomData.participants.filter(p => p.uid !== currentUser.uid);
           await updateDoc(doc(db, 'rooms', roomId), { participants: updatedParticipants });
      }
      onLeave();
  };

  const handleMuteToggle = async () => {
      const me = participants.find(p => p.uid === currentUser.uid);
      if (me) {
          await updateParticipantData(currentUser.uid, { isMuted: !me.isMuted });
      }
  };

  const handleSeatClick = async (index: number) => {
      const me = participants.find(p => p.uid === currentUser.uid);
      if (!me) return;

      const occupant = participants.find(p => p.seatIndex === index);
      
      // If I am Host (999), I can kick people from seats? 
      // For now, let's keep it simple: Click empty seat to move.
      if (occupant) {
          if (roomData?.createdBy === currentUser.uid && occupant.uid !== currentUser.uid) {
               if(window.confirm(`Move ${occupant.displayName} to audience?`)) {
                   await updateParticipantData(occupant.uid, { seatIndex: -1, isMuted: true });
               }
          }
          return;
      }

      if (me.seatIndex === -1) {
          await updateParticipantData(currentUser.uid, { seatIndex: index, isMuted: true });
      } else {
          // Move from one seat to another or Host seat to grid
          await updateParticipantData(currentUser.uid, { seatIndex: index });
      }
  };

  const handleTakeSeat = () => {
      const occupiedIndices = participants.map(p => p.seatIndex);
      for(let i=0; i<8; i++) {
          if(!occupiedIndices.includes(i)) {
              handleSeatClick(i);
              return;
          }
      }
      alert("No seats available!");
  };

  const handleMoveToAudience = async () => {
       await updateParticipantData(currentUser.uid, { seatIndex: -1, isMuted: true });
  };

  if (!roomData) return <div className="flex items-center justify-center h-full text-white bg-[#050505]"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-violet-500"></div></div>;

  const host = participants.find(p => p.seatIndex === 999);
  const me = participants.find(p => p.uid === currentUser.uid);
  const seats = Array.from({ length: 8 }, (_, i) => participants.find(p => p.seatIndex === i) || null);

  return (
    <div className="flex flex-col h-full relative text-white overflow-hidden bg-[#050505]">
        {/* Dynamic Background */}
        <div className="absolute inset-0 z-0">
             <img 
                src={roomData.backgroundImage || "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2070&auto=format&fit=crop"} 
                className="w-full h-full object-cover opacity-40 blur-2xl scale-110" 
                alt="Room Background"
             />
             <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-[#050505]"></div>
             <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between p-4 pt-[calc(env(safe-area-inset-top)+1rem)] z-20 relative">
             <button onClick={onMinimize} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition-colors border border-white/5">
                 <Minimize2 size={20} />
             </button>
             
             <div className="flex flex-col items-center">
                 <div className="flex items-center gap-2 mb-0.5">
                     <h2 className="font-bold text-lg text-shadow-sm">{roomData.name}</h2>
                     {roomData.password && <Lock size={12} className="text-yellow-500" />}
                 </div>
                 <div className="flex items-center gap-2 text-[10px] text-gray-300 font-medium bg-black/30 px-2 py-0.5 rounded-full backdrop-blur-md border border-white/5">
                     <span>ID: {roomData.id ? roomData.id.slice(0,6) : '...'}</span>
                     <span className="w-px h-2 bg-white/20"></span>
                     <span className="flex items-center gap-1"><Users size={10} /> {participants.length}</span>
                 </div>
             </div>

             <div className="flex items-center gap-2">
                 <button onClick={toggleMusic} className={`p-2.5 rounded-full transition-colors backdrop-blur-md border border-white/5 ${isPlaying ? 'bg-violet-500/20 text-violet-300' : 'bg-white/10 text-gray-400'}`}>
                     {isPlaying ? <Volume2 size={20} /> : <Music size={20} />}
                 </button>
                 <button onClick={handleLeave} className="p-2.5 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-colors backdrop-blur-md border border-red-500/10">
                     <Power size={20} />
                 </button>
             </div>
        </div>

        {/* Room Content */}
        <div className="flex-1 overflow-y-auto native-scroll no-scrollbar p-4 min-h-0 relative z-10 flex flex-col items-center justify-start pt-6">
             
             {/* Host Section */}
             <div className="mb-12 relative group cursor-pointer transform transition-transform hover:scale-105" onClick={() => handleSeatClick(999)}>
                 <div className="relative">
                     {/* Host Glow */}
                     <div className="absolute -inset-4 bg-gradient-to-t from-yellow-600/20 to-transparent rounded-full blur-xl animate-pulse-glow"></div>
                     
                     <div className="w-28 h-28 rounded-full p-[3px] bg-gradient-to-tr from-[#FFD700] via-[#FDB931] to-[#FFD700] shadow-[0_0_20px_rgba(255,215,0,0.3)] relative z-10">
                         <img src={host?.photoURL || 'https://ui-avatars.com/api/?name=Host'} className="w-full h-full rounded-full object-cover bg-gray-900" />
                         
                         {/* Host Frame if available */}
                         {host?.frameUrl && <img src={host.frameUrl} className="absolute inset-0 w-full h-full scale-[1.35] object-contain pointer-events-none" />}
                     </div>
                     
                     <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-600 to-yellow-500 text-black text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-lg z-20 border border-yellow-300/50">
                         <Crown size={10} fill="black" /> HOST
                     </div>
                     
                     {host?.isMuted && (
                         <div className="absolute bottom-1 right-1 bg-black/80 rounded-full p-1.5 border border-white/10 z-20">
                             <MicOff size={12} className="text-red-500" />
                         </div>
                     )}
                 </div>
                 <p className="text-center mt-4 text-sm font-bold text-white drop-shadow-md">{host?.displayName || 'Host'}</p>
                 {/* Visualizer (Fake) */}
                 {!host?.isMuted && host && (
                     <div className="flex justify-center gap-1 mt-1 h-3 items-end opacity-80">
                         <div className="w-0.5 bg-yellow-400 h-2 animate-[bounce_0.5s_infinite]"></div>
                         <div className="w-0.5 bg-yellow-400 h-3 animate-[bounce_0.7s_infinite]"></div>
                         <div className="w-0.5 bg-yellow-400 h-1 animate-[bounce_0.4s_infinite]"></div>
                     </div>
                 )}
             </div>

             {/* Speakers Grid */}
             <div className="grid grid-cols-4 gap-x-4 gap-y-8 w-full max-w-sm px-2">
                 {seats.map((speaker, index) => (
                     <div key={index} className="flex flex-col items-center">
                         <button 
                             onClick={() => handleSeatClick(index)}
                             className={`w-[4.5rem] h-[4.5rem] rounded-[1.6rem] flex items-center justify-center relative transition-all duration-300 ${speaker ? 'shadow-lg scale-100' : 'bg-white/5 border border-white/5 hover:bg-white/10 scale-95'}`}
                         >
                             {speaker ? (
                                 <>
                                     <div className="w-full h-full rounded-[1.6rem] p-[2px] bg-gradient-to-br from-violet-500/50 to-fuchsia-500/50">
                                        <img src={speaker.photoURL || ''} className="w-full h-full rounded-[1.4rem] object-cover bg-gray-800" />
                                     </div>
                                     
                                     {speaker.frameUrl && <img src={speaker.frameUrl} className="absolute inset-0 w-full h-full scale-[1.35] object-contain pointer-events-none" />}
                                     
                                     {speaker.isMuted ? (
                                         <div className="absolute -bottom-1 -right-1 bg-black/80 rounded-full p-1 border border-white/10 z-20">
                                             <MicOff size={10} className="text-red-500" />
                                         </div>
                                     ) : (
                                         <div className="absolute -bottom-1 -right-1 bg-green-500/90 rounded-full p-1 border border-black/20 z-20 shadow-[0_0_10px_rgba(34,197,94,0.5)]">
                                             <Mic size={10} className="text-white" fill="white" />
                                         </div>
                                     )}
                                     
                                     {/* Speaking Indicator Ring */}
                                     {!speaker.isMuted && (
                                         <div className="absolute -inset-1 rounded-[1.8rem] border-2 border-green-500/30 animate-pulse"></div>
                                     )}
                                 </>
                             ) : (
                                 <div className="flex flex-col items-center justify-center opacity-40">
                                     <Users size={18} />
                                     <span className="text-[8px] font-bold mt-1">{index + 1}</span>
                                 </div>
                             )}
                         </button>
                         <span className="text-[10px] text-gray-300 mt-2 font-medium truncate w-16 text-center drop-shadow-sm">
                             {speaker ? speaker.displayName : 'Empty'}
                         </span>
                     </div>
                 ))}
             </div>
        </div>

        {/* Footer Controls */}
        <div className="p-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] bg-[#121216]/80 backdrop-blur-2xl border-t border-white/10 relative z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between gap-6 max-w-sm mx-auto">
                <button className="flex flex-col items-center gap-1 group">
                    <div className="p-3 rounded-2xl bg-white/5 text-gray-400 group-hover:text-white group-hover:bg-white/10 transition-all border border-white/5">
                        <MessageSquare size={20} />
                    </div>
                    <span className="text-[9px] font-bold text-gray-500 group-hover:text-gray-300">Chat</span>
                </button>

                <div className="flex items-center justify-center -mt-6">
                    {me && me.seatIndex !== -1 ? (
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={handleMuteToggle}
                                className={`w-16 h-16 rounded-full shadow-2xl flex items-center justify-center transition-all transform active:scale-95 border-4 ${me.isMuted ? 'bg-[#1A1A21] border-[#2A2A35] text-white' : 'bg-white border-violet-200 text-black'}`}
                            >
                                {me.isMuted ? <MicOff size={28} /> : <Mic size={28} />}
                            </button>
                            
                            <button onClick={handleMoveToAudience} className="w-10 h-10 rounded-full bg-[#1A1A21] border border-white/10 flex items-center justify-center text-red-400 shadow-lg active:scale-90">
                                <UserMinus size={18} />
                            </button>
                        </div>
                    ) : (
                        <button 
                            onClick={handleTakeSeat}
                            className="h-14 px-8 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold text-sm shadow-[0_10px_20px_rgba(124,58,237,0.3)] hover:scale-105 active:scale-95 transition-all flex items-center gap-2 border border-white/10"
                        >
                            <Mic size={18} fill="currentColor" /> Take a Seat
                        </button>
                    )}
                </div>

                <button className="flex flex-col items-center gap-1 group">
                    <div className="p-3 rounded-2xl bg-white/5 text-yellow-500 group-hover:text-yellow-400 group-hover:bg-yellow-500/10 transition-all border border-white/5">
                        <Gift size={20} />
                    </div>
                    <span className="text-[9px] font-bold text-gray-500 group-hover:text-gray-300">Gift</span>
                </button>
            </div>
        </div>
    </div>
  );
};