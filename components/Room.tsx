import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { Room, UserProfile, Participant } from '../types';
import { 
  Mic, MicOff, Power, Users, MessageSquare, Gift, Minimize2, 
  Crown, UserMinus 
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

  useEffect(() => {
    musicAudioRef.current = new Audio(playlist[0]);
    musicAudioRef.current.crossOrigin = "anonymous";
    musicAudioRef.current.loop = false;
    musicAudioRef.current.onended = () => { 
        if (roomData && roomData.createdBy === currentUser.uid) playNextSong(); 
    };

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
              setRoomData(data);
              setParticipants(data.participants);
              
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
                // Update presence directly to avoid roomData dependency race condition
                 const updatedParticipants = data.participants.map(p => 
                    p.uid === currentUser.uid ? { ...p, lastSeen: Date.now() } : p
                 );
                 await updateDoc(roomRef, { participants: updatedParticipants });
            }
        }
    };
    joinRoom();
  }, [roomId, currentUser.uid, currentUser.displayName, currentUser.photoURL, currentUser.frameUrl]);

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
      if (occupant) return;

      if (me.seatIndex === -1) {
          await updateParticipantData(currentUser.uid, { seatIndex: index, isMuted: true });
      } else {
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

  if (!roomData) return <div className="flex items-center justify-center h-full text-white bg-[#18181B]"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-violet-500"></div></div>;

  const host = participants.find(p => p.seatIndex === 999);
  const me = participants.find(p => p.uid === currentUser.uid);
  const seats = Array.from({ length: 8 }, (_, i) => participants.find(p => p.seatIndex === i) || null);

  return (
    <div className="flex flex-col h-full bg-[#18181B] relative text-white">
        {/* Header */}
        <div className="flex items-center justify-between p-4 pt-[calc(env(safe-area-inset-top)+1rem)] z-20 relative bg-gradient-to-b from-black/50 to-transparent">
             <button onClick={onMinimize} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                 <Minimize2 size={20} />
             </button>
             <div className="text-center">
                 <h2 className="font-bold text-lg">{roomData.name}</h2>
                 <p className="text-xs text-gray-400">ID: {roomData.id.slice(0,6)}</p>
             </div>
             <button onClick={handleLeave} className="p-2 rounded-full bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-colors">
                 <Power size={20} />
             </button>
        </div>

        {/* Room Content */}
        <div className="flex-1 overflow-y-auto native-scroll no-scrollbar p-4 min-h-0">
             {/* Host Section */}
             <div className="flex justify-center mb-8">
                 <div className="relative">
                     <div className="w-24 h-24 rounded-full p-[3px] bg-gradient-to-tr from-yellow-500 via-orange-500 to-red-500 shadow-[0_0_30px_rgba(234,179,8,0.3)]">
                         <img src={host?.photoURL || 'https://ui-avatars.com/api/?name=Host'} className="w-full h-full rounded-full object-cover bg-gray-900" />
                     </div>
                     <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                         <Crown size={10} fill="black" /> HOST
                     </div>
                     {host?.isMuted && (
                         <div className="absolute top-0 right-0 bg-black/60 rounded-full p-1">
                             <MicOff size={14} className="text-red-500" />
                         </div>
                     )}
                     <p className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-sm font-bold whitespace-nowrap">{host?.displayName || 'Host'}</p>
                 </div>
             </div>

             {/* Speakers Grid */}
             <div className="grid grid-cols-4 gap-4 mb-8">
                 {seats.map((speaker, index) => (
                     <div key={index} className="flex flex-col items-center">
                         <button 
                             onClick={() => handleSeatClick(index)}
                             className={`w-16 h-16 rounded-[1.5rem] border-2 flex items-center justify-center relative transition-all ${speaker ? 'border-transparent' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                         >
                             {speaker ? (
                                 <>
                                     <img src={speaker.photoURL || ''} className="w-full h-full rounded-[1.5rem] object-cover bg-gray-800" />
                                     {speaker.frameUrl && <img src={speaker.frameUrl} className="absolute inset-0 w-full h-full scale-[1.3] object-contain pointer-events-none" />}
                                     {speaker.isMuted && (
                                         <div className="absolute bottom-0 right-0 bg-black/60 rounded-full p-1 m-1">
                                             <MicOff size={10} className="text-red-500" />
                                         </div>
                                     )}
                                 </>
                             ) : (
                                 <Users size={20} className="text-white/20" />
                             )}
                         </button>
                         <span className="text-[10px] text-gray-400 mt-1 font-medium truncate w-16 text-center">
                             {speaker ? speaker.displayName : `Seat ${index + 1}`}
                         </span>
                     </div>
                 ))}
             </div>
        </div>

        {/* Footer Controls */}
        <div className="p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] bg-[#121216]/90 backdrop-blur-xl border-t border-white/10">
            <div className="flex items-center justify-between gap-4">
                <button className="p-3 rounded-2xl bg-white/5 text-gray-400 hover:text-white">
                    <MessageSquare size={20} />
                </button>

                <div className="flex items-center gap-4">
                    {me && me.seatIndex !== -1 ? (
                        <>
                            <button 
                                onClick={handleMuteToggle}
                                className={`p-4 rounded-full shadow-lg transition-transform active:scale-95 ${me.isMuted ? 'bg-red-500 text-white' : 'bg-white text-black'}`}
                            >
                                {me.isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                            </button>
                            <button onClick={handleMoveToAudience} className="p-3 rounded-2xl bg-white/5 text-red-400 hover:bg-red-500/10">
                                <UserMinus size={20} />
                            </button>
                        </>
                    ) : (
                        <button 
                            onClick={handleTakeSeat}
                            className="px-6 py-3 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold text-sm shadow-lg shadow-violet-500/20"
                        >
                            Take a Seat
                        </button>
                    )}
                </div>

                <button className="p-3 rounded-2xl bg-white/5 text-yellow-500 hover:text-yellow-400">
                    <Gift size={20} />
                </button>
            </div>
        </div>
    </div>
  );
};