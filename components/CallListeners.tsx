
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { 
  collection, query, where, onSnapshot, setDoc, doc, deleteDoc, updateDoc, addDoc, getDoc 
} from 'firebase/firestore';
import { UserProfile, ActiveListener, CallRequest } from '../types';
import { 
  Phone, PhoneIncoming, PhoneOff, User, Power, Loader2, Clock, ShieldAlert,
  Coins, X, Zap, Sparkles, Star
} from 'lucide-react';

interface CallListenersProps {
  currentUser: UserProfile;
  onJoinRoom: (roomId: string) => void;
  isAuthReady: boolean;
}

export const CallListeners: React.FC<CallListenersProps> = ({ currentUser, onJoinRoom, isAuthReady }) => {
  const [isOnline, setIsOnline] = useState(false);
  const [activeListeners, setActiveListeners] = useState<ActiveListener[]>([]);
  
  // Interaction State
  const [selectedListener, setSelectedListener] = useState<ActiveListener | null>(null);

  // Call States
  const [outgoingRequest, setOutgoingRequest] = useState<CallRequest | null>(null);
  const [incomingRequest, setIncomingRequest] = useState<CallRequest | null>(null);
  
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
      // Ringtone
      audioRef.current = new Audio("https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3");
      audioRef.current.loop = true;
  }, []);

  // 1. Monitor My Online Status
  useEffect(() => {
    if (!isAuthReady) return;
    const listenerRef = doc(db, 'activeListeners', currentUser.uid);
    const unsub = onSnapshot(listenerRef, (snap) => {
        setIsOnline(snap.exists());
    });
    return () => unsub();
  }, [currentUser.uid, isAuthReady]);

  // 2. Fetch All Active Listeners (excluding self)
  useEffect(() => {
    if (!isAuthReady) return;
    const q = query(collection(db, 'activeListeners'));
    const unsub = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs
            .map(d => d.data() as ActiveListener)
            .filter(l => l.uid !== currentUser.uid);
        setActiveListeners(list);
    });
    return () => unsub();
  }, [currentUser.uid, isAuthReady]);

  // 3. Listen for Incoming Calls (If Online)
  useEffect(() => {
    if (!isOnline || !isAuthReady) return;

    const q = query(
        collection(db, 'callRequests'),
        where('listenerId', '==', currentUser.uid),
        where('status', '==', 'pending')
    );

    const unsub = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
            const req = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as CallRequest;
            // Only take the newest one
            if (!incomingRequest) {
                setIncomingRequest(req);
                audioRef.current?.play().catch(() => {});
                
                // RESET INACTIVITY TIMER on incoming call
                // Update lastActive timestamp to now
                updateDoc(doc(db, 'activeListeners', currentUser.uid), {
                    lastActive: Date.now()
                }).catch(err => console.error("Failed to update activity", err));
            }
        } else {
            setIncomingRequest(null);
            audioRef.current?.pause();
            if (audioRef.current) audioRef.current.currentTime = 0;
        }
    });

    return () => {
        unsub();
        audioRef.current?.pause();
    };
  }, [isOnline, currentUser.uid, incomingRequest, isAuthReady]);

  // 4. Listen for Outgoing Call Updates
  useEffect(() => {
      if (!outgoingRequest || !isAuthReady) return;

      const unsub = onSnapshot(doc(db, 'callRequests', outgoingRequest.id), (snap) => {
          if (!snap.exists()) {
              setOutgoingRequest(null);
              return;
          }
          const data = { id: snap.id, ...snap.data() } as CallRequest;
          
          if (data.status === 'accepted' && data.roomId) {
              setOutgoingRequest(null);
              onJoinRoom(data.roomId); // Join the room!
          } else if (data.status === 'rejected' || data.status === 'timeout') {
              // Wait a sec then clear
              setTimeout(() => setOutgoingRequest(null), 2000);
          } else {
              setOutgoingRequest(data);
          }
      });

      return () => unsub();
  }, [outgoingRequest?.id, isAuthReady]);

  // 5. Auto-Offline Logic (5 Minutes Inactivity)
  useEffect(() => {
      if (!isOnline || !isAuthReady) return;

      const checkInactivity = async () => {
          try {
              const docRef = doc(db, 'activeListeners', currentUser.uid);
              const snap = await getDoc(docRef);
              
              if (snap.exists()) {
                  const data = snap.data() as ActiveListener;
                  const lastActive = data.lastActive || 0;
                  const FIVE_MINUTES = 5 * 60 * 1000; 
                  
                  if (Date.now() - lastActive > FIVE_MINUTES) {
                      await deleteDoc(docRef); // This will trigger the isOnline listener to set state to false
                      alert("You have been marked offline because you haven't received a call in 5 minutes.");
                  }
              }
          } catch (e) {
              console.error("Auto-offline check failed", e);
          }
      };

      // Check every 1 minute
      const interval = setInterval(checkInactivity, 60 * 1000);
      return () => clearInterval(interval);
  }, [isOnline, currentUser.uid, isAuthReady]);

  const toggleOnline = async () => {
      if (!currentUser.isAuthorizedListener) {
          alert("You must be an authorized listener to go online.");
          return;
      }

      const ref = doc(db, 'activeListeners', currentUser.uid);
      if (isOnline) {
          await deleteDoc(ref);
      } else {
          await setDoc(ref, {
              uid: currentUser.uid,
              displayName: currentUser.displayName || 'Listener',
              photoURL: currentUser.photoURL,
              frameUrl: currentUser.frameUrl, // Include frameUrl
              bio: currentUser.bio || 'Ready to listen.',
              lastActive: Date.now(),
              isBusy: false
          });
      }
  };

  const initiateCall = async () => {
      if (!selectedListener) return;
      if (outgoingRequest) return; // Already calling

      // Check balance before calling
      if ((currentUser.walletBalance || 0) < 6) {
          alert("Insufficient coins! You need at least 6 coins to start a call.");
          return;
      }

      // Close Toggle
      setSelectedListener(null);

      try {
          const docRef = await addDoc(collection(db, 'callRequests'), {
              callerId: currentUser.uid,
              callerName: currentUser.displayName,
              callerPhoto: currentUser.photoURL,
              listenerId: selectedListener.uid,
              status: 'pending',
              createdAt: Date.now()
          });

          setOutgoingRequest({
              id: docRef.id,
              callerId: currentUser.uid,
              callerName: currentUser.displayName || '',
              callerPhoto: currentUser.photoURL,
              listenerId: selectedListener.uid,
              status: 'pending',
              createdAt: Date.now()
          });

          // 10 Second Timeout Logic
          timeoutRef.current = setTimeout(async () => {
              // Check if still pending
              const currentDoc = await getDoc(docRef);
              if (currentDoc.exists() && currentDoc.data().status === 'pending') {
                  await updateDoc(docRef, { status: 'timeout' });
              }
          }, 10000);

      } catch (e) {
          console.error("Call failed", e);
      }
  };

  const cancelCall = async () => {
      if (outgoingRequest) {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          await deleteDoc(doc(db, 'callRequests', outgoingRequest.id));
          setOutgoingRequest(null);
      }
  };

  const acceptCall = async () => {
      if (!incomingRequest) return;
      audioRef.current?.pause();

      try {
          // 1. Create a Private Room with Paid Flag
          const roomRef = await addDoc(collection(db, 'rooms'), {
              name: "Private Call",
              createdBy: incomingRequest.listenerId, // Listener creates it
              creatorName: currentUser.displayName,
              createdAt: Date.now(),
              participants: [],
              lockedSeats: [],
              active: true,
              admins: [incomingRequest.callerId], // Make caller admin too
              password: Math.random().toString().slice(2, 6), // Auto-lock
              backgroundImage: "https://images.unsplash.com/photo-1614850523060-8da1d56ae167?q=80&w=2070&auto=format&fit=crop",
              isPaidCall: true // Flag this as a paid session
          });

          // 2. Update Call Request to Accepted with Room ID
          await updateDoc(doc(db, 'callRequests', incomingRequest.id), {
              status: 'accepted',
              roomId: roomRef.id
          });

          // 3. Set Listener Busy
          await updateDoc(doc(db, 'activeListeners', currentUser.uid), { isBusy: true });

          // 4. Join Room
          onJoinRoom(roomRef.id);
          setIncomingRequest(null);

      } catch (e) {
          console.error("Accept failed", e);
      }
  };

  const rejectCall = async () => {
      if (!incomingRequest) return;
      audioRef.current?.pause();
      await updateDoc(doc(db, 'callRequests', incomingRequest.id), { status: 'rejected' });
      setIncomingRequest(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#050505] text-white pb-24 px-6 relative">
      {/* Background Decor */}
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />
      
      {/* Header */}
      <div className="py-8 flex justify-between items-center relative z-10">
         <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
                Listeners <span className="text-emerald-400 text-lg">●</span>
            </h1>
            <p className="text-gray-500 text-xs font-medium tracking-wide mt-1">Connect 1-on-1 instantly</p>
         </div>
         
         {currentUser.isAuthorizedListener ? (
             <button 
                onClick={toggleOnline}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs transition-all shadow-lg ${
                    isOnline 
                    ? 'bg-emerald-500 text-black shadow-emerald-500/20' 
                    : 'bg-[#1A1A23] text-gray-400 border border-white/10 hover:bg-white/5'
                }`}
             >
                <Power size={14} />
                {isOnline ? 'Online' : 'Go Online'}
             </button>
         ) : (
             <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/5 text-[10px] font-bold text-gray-400 cursor-not-allowed opacity-70">
                 <ShieldAlert size={12} /> Listener Access Required
             </div>
         )}
      </div>

      {/* Online Listeners Grid - Added min-h-0 */}
      <div className="flex-1 overflow-y-auto space-y-4 native-scroll relative z-10 pb-4 no-scrollbar min-h-0">
          {activeListeners.length === 0 ? (
              <div className="text-center py-24 opacity-60">
                  <div className="w-24 h-24 bg-[#121216] border border-dashed border-white/10 rounded-full flex items-center justify-center mx-auto mb-6">
                      <User size={32} className="text-gray-600" />
                  </div>
                  <p className="text-gray-300 font-bold">No listeners online.</p>
                  <p className="text-gray-600 text-xs mt-1">Be the first to go online!</p>
              </div>
          ) : (
              activeListeners.map(listener => (
                  <div 
                    key={listener.uid} 
                    className="group relative bg-[#121216] p-5 rounded-[2rem] border border-white/5 overflow-hidden transition-all duration-300 hover:border-emerald-500/30"
                  >
                      {/* Hover Gradient */}
                      <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                      <div className="flex items-start justify-between relative z-10">
                          <div className="flex items-center gap-4">
                              <div className="relative w-14 h-14">
                                  {/* Avatar Ring */}
                                  <div className={`absolute -inset-1 rounded-full ${listener.isBusy ? 'bg-yellow-500/20' : 'bg-emerald-500/20'} blur-sm`}></div>
                                  <img src={listener.photoURL || ''} className="w-full h-full rounded-full bg-gray-800 object-cover border-2 border-[#121216] relative z-10" />
                                  
                                  {/* Frame Overlay - Perfect Fit Update */}
                                  {listener.frameUrl && <img src={listener.frameUrl} className="absolute inset-0 w-full h-full scale-[1.35] object-contain pointer-events-none z-20" />}
                                  
                                  <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-[#121216] z-30 flex items-center justify-center ${listener.isBusy ? 'bg-yellow-500' : 'bg-emerald-500'}`}>
                                      {listener.isBusy ? <Clock size={8} className="text-black"/> : <Zap size={8} className="text-black" fill="black"/>}
                                  </div>
                              </div>
                              <div>
                                  <h3 className="font-bold text-white text-base flex items-center gap-2">
                                      {listener.displayName}
                                      <Star size={12} className="text-yellow-500" fill="currentColor"/>
                                  </h3>
                                  <p className="text-xs text-gray-400 line-clamp-1 w-40 mt-0.5">{listener.bio}</p>
                                  <div className="flex items-center gap-2 mt-2">
                                      <span className="text-[10px] font-bold bg-white/5 px-2 py-0.5 rounded text-gray-400">English</span>
                                      <span className="text-[10px] font-bold bg-white/5 px-2 py-0.5 rounded text-gray-400">Hindi</span>
                                  </div>
                              </div>
                          </div>
                          
                          <button 
                            onClick={() => setSelectedListener(listener)}
                            disabled={listener.isBusy}
                            className={`p-3.5 rounded-2xl transition-all shadow-lg active:scale-95 ${
                                listener.isBusy 
                                ? 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/5' 
                                : 'bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-emerald-500/20 hover:scale-105 hover:shadow-emerald-500/30'
                            }`}
                          >
                              {listener.isBusy ? <PhoneOff size={20} /> : <Phone size={20} fill="currentColor" />}
                          </button>
                      </div>
                  </div>
              ))
          )}
      </div>

      {/* Call Confirmation Toggle (Bottom Sheet) */}
      {selectedListener && (
          <div className="fixed inset-0 z-[60] flex flex-col justify-end">
              {/* Backdrop */}
              <div 
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
                  onClick={() => setSelectedListener(null)}
              ></div>

              {/* Toggle Content */}
              <div className="bg-[#18181B] w-full rounded-t-[2.5rem] p-6 border-t border-white/10 relative z-10 animate-[fadeIn_0.3s_ease-out_forwards] translate-y-0 shadow-2xl">
                  {/* Handle Bar */}
                  <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-6"></div>

                  <div className="flex flex-col items-center mb-6">
                      <div className="relative mb-3 w-20 h-20">
                          <img src={selectedListener.photoURL || ''} className="w-full h-full rounded-full bg-gray-800 object-cover border-4 border-[#202025]" />
                          {selectedListener.frameUrl && <img src={selectedListener.frameUrl} className="absolute inset-0 w-full h-full scale-[1.35] object-contain pointer-events-none" />}
                          <div className="absolute bottom-0 right-0 bg-emerald-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full border border-[#202025] flex items-center gap-1 z-20">
                              <Zap size={10} fill="black"/> Live
                          </div>
                      </div>
                      <h3 className="text-xl font-bold text-white">{selectedListener.displayName}</h3>
                      <p className="text-xs text-gray-400">Voice Call</p>
                  </div>

                  {/* Pricing Info Card */}
                  <div className="bg-[#202025] rounded-2xl p-4 flex items-center justify-between border border-white/5 mb-6">
                      <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-500">
                              <Coins size={20} />
                          </div>
                          <div>
                              <p className="text-sm font-bold text-white">Call Rate</p>
                              <p className="text-[10px] text-gray-400">Commission included</p>
                          </div>
                      </div>
                      <div className="text-right">
                           <span className="text-lg font-bold text-yellow-500">6 Coins</span>
                           <span className="text-xs text-gray-500 block">/ min</span>
                      </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="flex items-center gap-3">
                      <div className="flex-1">
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Your Balance</p>
                          <div className="flex items-center gap-1.5">
                              <Coins size={16} className="text-yellow-500" />
                              <span className="text-lg font-bold text-white">{currentUser.walletBalance || 0}</span>
                          </div>
                      </div>
                      
                      <button 
                          onClick={initiateCall}
                          className="flex-[2] bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-bold py-4 rounded-2xl shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                      >
                          <Phone size={18} fill="currentColor" /> Call Now
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Outgoing Call Modal (Overlay) */}
      {outgoingRequest && (
          <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-6 animate-fade-in">
              <div className="w-40 h-40 rounded-full border border-white/10 flex items-center justify-center mb-8 relative">
                  <div className="absolute inset-0 rounded-full border border-emerald-500/50 animate-[ping_2s_linear_infinite]"></div>
                  <div className="absolute inset-0 rounded-full border border-emerald-500/30 animate-[ping_2s_linear_infinite_0.5s]"></div>
                  <div className="relative w-36 h-36 z-10">
                      <img src={activeListeners.find(l => l.uid === outgoingRequest.listenerId)?.photoURL || ''} className="w-full h-full rounded-full object-cover" />
                      {activeListeners.find(l => l.uid === outgoingRequest.listenerId)?.frameUrl && <img src={activeListeners.find(l => l.uid === outgoingRequest.listenerId)?.frameUrl} className="absolute inset-0 w-full h-full scale-[1.35] object-contain pointer-events-none" />}
                  </div>
              </div>
              
              <h2 className="text-3xl font-bold text-white mb-2">{outgoingRequest.callerName}</h2>
              <p className="text-emerald-400 text-sm font-bold tracking-widest uppercase mb-12 animate-pulse">Calling...</p>

              {outgoingRequest.status === 'timeout' ? (
                  <div className="text-red-400 font-bold mb-4 flex items-center gap-2">
                      <PhoneOff size={20} /> No answer
                  </div>
              ) : outgoingRequest.status === 'rejected' ? (
                  <div className="text-red-400 font-bold mb-4 flex items-center gap-2">
                      <PhoneOff size={20} /> Call Declined
                  </div>
              ) : (
                  <button onClick={cancelCall} className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center text-white shadow-2xl hover:bg-red-600 transition-colors active:scale-90">
                      <PhoneOff size={32} />
                  </button>
              )}
          </div>
      )}

      {/* Incoming Call Modal (Overlay) */}
      {incomingRequest && (
          <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-6 animate-fade-in">
              <div className="w-36 h-36 rounded-full border-4 border-white/10 flex items-center justify-center mb-6 relative animate-bounce">
                  <img src={incomingRequest.callerPhoto || ''} className="w-32 h-32 rounded-full object-cover" />
              </div>
              
              <h2 className="text-2xl font-bold text-white mb-1">{incomingRequest.callerName}</h2>
              <p className="text-emerald-400 text-sm font-bold tracking-widest uppercase mb-12 animate-pulse">Incoming Call...</p>

              <div className="flex items-center gap-10">
                  <button onClick={rejectCall} className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-white shadow-xl hover:bg-red-600 transition-transform hover:scale-110">
                      <PhoneOff size={28} />
                  </button>
                  <div className="flex flex-col items-center gap-2">
                      <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-[0_0_50px_rgba(16,185,129,0.5)] animate-pulse cursor-pointer hover:scale-110 transition-transform" onClick={acceptCall}>
                          <PhoneIncoming size={32} />
                      </div>
                      <span className="text-xs font-bold text-gray-400">Accept</span>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
