
import React, { useEffect, useState, useRef } from 'react';
import { db } from '../firebase';
import { 
  doc, 
  onSnapshot, 
  updateDoc, 
  arrayUnion, 
  arrayRemove, 
  collection, 
  addDoc, 
  query, 
  where,
  deleteDoc,
  orderBy,
  writeBatch,
  getDoc,
  getDocs,
  increment
} from 'firebase/firestore';
import { UserProfile, Room as RoomType, Participant, ChatMetadata, Sticker, RoomBackground, GiftItem } from '../types';
import { 
  Mic, MicOff, Crown, Send, 
  Lock, Unlock, LogOut, UserPlus, X as XIcon, 
  MoreHorizontal, Volume2, Gift, Plus, Eye,
  Share2, Minimize2, Loader2,
  Trash2, RotateCcw, Power, Users,
  Play, Upload, Disc3, Music2, Pause, SkipForward,
  ShieldAlert, ShieldCheck, VolumeX, UserCheck, Ban, Maximize2, Search, Settings, Smile, CheckCircle2,
  ArrowDownToLine, Coins
} from 'lucide-react';

interface RoomProps {
  roomId: string;
  currentUser: UserProfile;
  onLeave: () => void;
  isMinimized: boolean;
  onMinimize: () => void;
  isAuthReady: boolean;
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderPhoto: string | null;
  createdAt: number;
  type?: 'user' | 'system' | 'gift'; 
  giftIcon?: string;
  giftName?: string;
  giftAnimationUrl?: string; // New: Animation URL for SVGA
}

interface Invite {
  id: string;
  to: string;
  seatIndex: number;
  from: string;
  fromName: string;
}

interface EntryNotification {
  id: string;
  text: string;
  senderId?: string; 
}

interface Song {
  id: string;
  url: string;
  name: string;
  artist?: string;
  duration?: number;
  addedBy: string;
  addedByName: string;
}

// Extend RoomType locally 
interface ExtendedRoomType extends RoomType {
  musicState?: {
    isEnabled: boolean;
    musicUrl: string | null;     
    currentSongName: string | null;
    playedBy: string | null;
    isPlaying: boolean;
    musicTime: number;           
    queue?: Song[];              
  };
}

const ICE_SERVERS = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
  ],
};

const RemoteAudio: React.FC<{ stream: any, muted: boolean }> = ({ stream, muted }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
      const audioEl = audioRef.current;
      if (!audioEl || !stream) return;
      audioEl.srcObject = stream;
      const playAudio = async () => {
          try {
              if (audioEl.paused && !muted) await audioEl.play();
          } catch (e: any) {
              if (e.name !== 'AbortError' && e.name !== 'NotAllowedError') console.warn("Audio prevented", e);
          }
      };
      playAudio();
      return () => { if (audioEl) { audioEl.srcObject = null; audioEl.load(); } };
  }, [stream]); 
  useEffect(() => {
     const audioEl = audioRef.current;
     if (audioEl && stream) {
         audioEl.muted = muted;
         if (!muted && audioEl.paused) audioEl.play().catch(() => {});
     }
  }, [muted, stream]);
  return <audio ref={audioRef} autoPlay playsInline muted={muted} />;
};

const UserProfileModal: React.FC<{ 
    targetUid: string, 
    currentUser: UserProfile, 
    onClose: () => void,
    isViewerHost: boolean,
    isViewerAdmin: boolean,
    roomAdmins: string[],
    roomId: string,
    currentParticipants: Participant[],
    roomCreatorId: string
}> = ({ targetUid, currentUser, onClose, isViewerHost, isViewerAdmin, roomAdmins, roomId, currentParticipants, roomCreatorId }) => {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isFollowing, setIsFollowing] = useState(false);
    const [isBlocked, setIsBlocked] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showAdminMenu, setShowAdminMenu] = useState(false);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const userDoc = await getDoc(doc(db, 'users', targetUid));
                if (userDoc.exists()) {
                    const data = userDoc.data() as UserProfile;
                    setProfile(data);
                    setIsFollowing(currentUser.following?.includes(targetUid) || false);
                    setIsBlocked(currentUser.blockedUsers?.includes(targetUid) || false);
                }
            } catch (e) { console.error(e); } finally { setLoading(false); }
        };
        fetchUser();
    }, [targetUid, currentUser]);

    const toggleFollow = async () => {
        if (!profile) return;
        const myRef = doc(db, 'users', currentUser.uid);
        const targetRef = doc(db, 'users', targetUid);
        try {
            if (isFollowing) {
                await updateDoc(myRef, { following: arrayRemove(targetUid) });
                await updateDoc(targetRef, { followers: arrayRemove(currentUser.uid) });
                setIsFollowing(false);
            } else {
                await updateDoc(myRef, { following: arrayUnion(targetUid) });
                await updateDoc(targetRef, { followers: arrayUnion(currentUser.uid) });
                setIsFollowing(true);
            }
        } catch (e) { console.error("Follow error", e); }
    };

    const toggleBlock = async () => {
        const myRef = doc(db, 'users', currentUser.uid);
        try {
            if (isBlocked) {
                await updateDoc(myRef, { blockedUsers: arrayRemove(targetUid) });
                setIsBlocked(false);
            } else {
                if(window.confirm("Block this user?")) {
                    await updateDoc(myRef, { blockedUsers: arrayUnion(targetUid) });
                    setIsBlocked(true);
                }
            }
        } catch(e) { console.error("Block error", e); }
    };

    const toggleAdminStatus = async () => {
        if (!isViewerHost) return;
        const roomRef = doc(db, 'rooms', roomId);
        const isAdmin = roomAdmins.includes(targetUid);
        if (isAdmin) await updateDoc(roomRef, { admins: arrayRemove(targetUid) });
        else await updateDoc(roomRef, { admins: arrayUnion(targetUid) });
        setShowAdminMenu(false);
        onClose();
    };

    const handleKick = async () => {
        if (!window.confirm("Are you sure you want to kick this user?")) return;
        try {
            const roomRef = doc(db, 'rooms', roomId);
            const targetParticipant = currentParticipants.find(p => p.uid === targetUid);
            await updateDoc(roomRef, { participants: arrayRemove(targetParticipant), [`kickedUsers.${targetUid}`]: Date.now() });
            onClose();
        } catch (e) { console.error("Kick failed", e); }
    };

    if (loading || !profile) return null;
    const isTargetAdmin = roomAdmins.includes(targetUid);
    const isTargetHost = targetUid === roomCreatorId;

    return (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-[#1A1A21] w-full max-w-sm rounded-[2rem] p-6 border border-white/10 shadow-2xl animate-fade-in relative" onClick={e => e.stopPropagation()}>
                {currentUser.uid !== targetUid && (
                    <div className="absolute top-4 right-12 z-20">
                         <button onClick={() => setShowAdminMenu(!showAdminMenu)} className="p-2 text-white hover:bg-white/10 rounded-full"><MoreHorizontal size={20} /></button>
                         {showAdminMenu && (
                             <div className="absolute right-0 mt-2 w-40 bg-[#25252D] border border-white/10 rounded-xl shadow-xl overflow-hidden z-[60]">
                                 {isViewerHost && (<button onClick={toggleAdminStatus} className="w-full text-left px-4 py-3 text-xs font-bold text-white hover:bg-white/5 flex items-center gap-2">{isTargetAdmin ? <ShieldAlert size={14} className="text-red-400" /> : <ShieldCheck size={14} className="text-emerald-400" />}{isTargetAdmin ? 'Dismiss Admin' : 'Set Admin'}</button>)}
                                 <button onClick={toggleBlock} className="w-full text-left px-4 py-3 text-xs font-bold text-white hover:bg-white/5 flex items-center gap-2">{isBlocked ? <UserCheck size={14} className="text-green-400"/> : <Ban size={14} className="text-red-400"/>}{isBlocked ? 'Unblock User' : 'Block User'}</button>
                             </div>
                         )}
                    </div>
                )}
                <div className="absolute top-4 right-4 text-gray-400 hover:text-white cursor-pointer" onClick={onClose}><XIcon size={20} /></div>
                <div className="flex flex-col items-center">
                    <div className="relative mb-4 w-24 h-24">
                        <img src={profile.photoURL || ''} className="w-full h-full rounded-full border-4 border-[#25252D] bg-gray-800 object-cover" />
                        {/* Profile Modal Frame Fix */}
                        {profile.frameUrl && <img src={profile.frameUrl} className="absolute inset-0 w-full h-full scale-[1.4] object-contain pointer-events-none" />}
                        {isTargetAdmin && (<div className="absolute bottom-0 right-0 bg-violet-600 text-white p-1 rounded-full border-2 border-[#1A1A21] z-20" title="Admin"><ShieldCheck size={14} /></div>)}
                        {isTargetHost && (<div className="absolute bottom-0 right-0 bg-yellow-500 text-black p-1 rounded-full border-2 border-[#1A1A21] z-20" title="Host"><Crown size={14} /></div>)}
                    </div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">{profile.displayName}
                        {isTargetAdmin && <span className="text-[10px] bg-violet-600 px-1.5 py-0.5 rounded text-white font-bold tracking-wide">ADMIN</span>}
                        {isTargetHost && <span className="text-[10px] bg-yellow-500 text-black px-1.5 py-0.5 rounded font-bold tracking-wide">HOST</span>}
                    </h2>
                    <p className="text-violet-400 text-xs font-mono tracking-wider mb-2">ID: {profile.uniqueId || '....'}</p>
                    <p className="text-gray-400 text-sm text-center mb-6 px-4">{profile.bio || "No bio yet."}</p>
                    <div className="flex gap-8 mb-6 text-center w-full justify-center"><div><span className="block font-bold text-white text-lg">{profile.following?.length || 0}</span><span className="text-[10px] text-gray-500 uppercase font-bold">Following</span></div><div><span className="block font-bold text-white text-lg">{profile.followers?.length || 0}</span><span className="text-[10px] text-gray-500 uppercase font-bold">Followers</span></div></div>
                    {currentUser.uid !== targetUid && (<div className="w-full space-y-3"><button onClick={toggleFollow} className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${isFollowing ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:opacity-90'}`}>{isFollowing ? <UserCheck size={18} /> : <UserPlus size={18} />}{isFollowing ? 'Following' : 'Follow'}</button>{(isViewerHost || isViewerAdmin) && !isTargetAdmin && !isTargetHost && (<button onClick={handleKick} className="w-full py-3 rounded-xl font-bold bg-red-500/10 text-red-500 hover:bg-red-500/20 flex items-center justify-center gap-2"><Ban size={18} /> Kick from Room</button>)}</div>)}
                </div>
            </div>
        </div>
    );
};

const MenuButton: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; color?: string }> = ({ icon, label, onClick, color }) => (
   <button onClick={onClick} className="flex flex-col items-center gap-2 group w-full"><div className={`w-14 h-14 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center transition-all group-hover:bg-white/10 group-active:scale-95 ${color || 'text-white'}`}>{icon}</div><span className="text-xs font-medium text-gray-400 group-hover:text-white">{label}</span></button>
);

export const ActiveRoom: React.FC<RoomProps> = ({ roomId, currentUser, onLeave, isMinimized, onMinimize, isAuthReady }) => {
    const [roomData, setRoomData] = useState<ExtendedRoomType | null>(null);
    const [isMuted, setIsMuted] = useState(true);
    const [isSpeakerOn, setIsSpeakerOn] = useState(true);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
    const [speakingUsers, setSpeakingUsers] = useState<Record<string, boolean>>({});
    const [popupInfo, setPopupInfo] = useState<{ index: number; rect: DOMRect } | null>(null);
    const [inviteSeatIndex, setInviteSeatIndex] = useState<number | null>(null);
    const [showInviteList, setShowInviteList] = useState(false);
    const [showViewerList, setShowViewerList] = useState(false);
    const [showRoomMenu, setShowRoomMenu] = useState(false);
    const [incomingInvite, setIncomingInvite] = useState<Invite | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [viewingProfileUid, setViewingProfileUid] = useState<string | null>(null);
    const [showShareModal, setShowShareModal] = useState(false);
    const [recentChats, setRecentChats] = useState<ChatMetadata[]>([]);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    
    // Settings State
    const [settingsName, setSettingsName] = useState('');
    const [settingsPassword, setSettingsPassword] = useState('');
    const [settingsBg, setSettingsBg] = useState('');
    const [availableBackgrounds, setAvailableBackgrounds] = useState<RoomBackground[]>([]);

    const [isUploadingMusic, setIsUploadingMusic] = useState(false);
    const [showMusicModal, setShowMusicModal] = useState(false);
    const [musicTab, setMusicTab] = useState<'player' | 'queue' | 'search'>('player');
    const [musicSearchQuery, setMusicSearchQuery] = useState('');
    const [musicSearchResults, setMusicSearchResults] = useState<any[]>([]);
    const [isSearchingMusic, setIsSearchingMusic] = useState(false);
    const [showGiftModal, setShowGiftModal] = useState(false);
    const [giftRecipientId, setGiftRecipientId] = useState<string | null>(null);
    const [gifts, setGifts] = useState<GiftItem[]>([]);
    
    // Stickers State
    const [showStickerPicker, setShowStickerPicker] = useState(false);
    const [stickers, setStickers] = useState<Sticker[]>([]);

    // Gift Animation State
    const [giftAnimation, setGiftAnimation] = useState<{ icon: string; name: string; senderName: string } | null>(null);
    const [currentSvga, setCurrentSvga] = useState<string | null>(null);
    const animationQueueRef = useRef<string[]>([]);
    const isPlayingSvgaRef = useRef(false);
    const playerRef = useRef<any>(null); // SVGA Player instance
    const svgaTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const musicAudioRef = useRef<HTMLAudioElement | null>(null);
    const musicInputRef = useRef<HTMLInputElement>(null);
  
    const [entryNotifications, setEntryNotifications] = useState<EntryNotification[]>([]);
    const prevParticipantsRef = useRef<Participant[]>([]);
    const isInitialLoadRef = useRef(true);
  
    const chatEndRef = useRef<HTMLDivElement>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const pcsRef = useRef<Record<string, RTCPeerConnection>>({});
    const unsubscribersRef = useRef<(() => void)[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analysersRef = useRef<Record<string, AnalyserNode>>({});
    const audioIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const participantsRef = useRef<Participant[]>([]);
    const candidateQueueRef = useRef<Record<string, RTCIceCandidateInit[]>>({});
    const initialChargeProcessed = useRef(false);

    // Derived Variables for room roles and status
    const isHost = roomData?.createdBy === currentUser.uid;
    const isAdmin = (roomData?.admins?.includes(currentUser.uid) || isHost) ?? false;
    const myParticipant = participants.find(p => p.uid === currentUser.uid);
    const isOnSeat = myParticipant ? (myParticipant.seatIndex >= 0 || myParticipant.seatIndex === 999) : false;

    // Initial Join Logic - Run Once
    useEffect(() => {
        const joinRoom = async () => {
            if (!roomId || !currentUser || !isAuthReady) return;
            try {
                const roomRef = doc(db, 'rooms', roomId);
                const roomSnap = await getDoc(roomRef);
                if (roomSnap.exists()) {
                    const data = roomSnap.data() as ExtendedRoomType;
                    const isAlreadyJoined = data.participants?.some(p => p.uid === currentUser.uid);
                    
                    if (!isAlreadyJoined) {
                        const isCreator = data.createdBy === currentUser.uid;
                        const participant: Participant = { 
                             uid: currentUser.uid, 
                             displayName: currentUser.displayName || 'Guest', 
                             photoURL: currentUser.photoURL, 
                             isMuted: true, 
                             isHostMuted: false, 
                             seatIndex: isCreator ? 999 : -1, 
                             joinedAt: Date.now(), 
                             lastSeen: Date.now(), 
                             frameUrl: currentUser.frameUrl || null
                        };
                        await updateDoc(roomRef, { participants: arrayUnion(participant) });
                    }
                }
            } catch (e) {
                console.error("Error joining room:", e);
            }
        };
        joinRoom();
    }, [roomId, currentUser.uid, isAuthReady]);

    useEffect(() => {
        participantsRef.current = participants;
        if (!isInitialLoadRef.current) {
           const newJoiners = participants.filter(p => !prevParticipantsRef.current.find(prev => prev.uid === p.uid));
           if (newJoiners.length > 0) {
               newJoiners.forEach(joiner => {
                   if (joiner.uid !== currentUser.uid) {
                       const notifId = Date.now().toString() + Math.random();
                       setEntryNotifications(prev => [...prev, { id: notifId, text: `${joiner.displayName} entered the room`, senderId: joiner.uid }]);
                       setTimeout(() => { setEntryNotifications(prev => prev.filter(n => n.id !== notifId)); }, 3000);
                   }
               });
           }
        } else { if (participants.length > 0) isInitialLoadRef.current = false; }
        prevParticipantsRef.current = participants;
    }, [participants, currentUser.uid]);

    useEffect(() => {
        if (!isAuthReady) return;
        const qStickers = query(collection(db, 'stickers'), orderBy('createdAt', 'desc'));
        const unsubStickers = onSnapshot(qStickers, (snapshot) => {
            setStickers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sticker)));
        });

        const qGifts = query(collection(db, 'gifts'), orderBy('price', 'asc'));
        const unsubGifts = onSnapshot(qGifts, (snapshot) => {
            setGifts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GiftItem)));
        });

        return () => {
            unsubStickers();
            unsubGifts();
        };
    }, [isAuthReady]);

    useEffect(() => {
        if (!showSettingsModal || !isAuthReady) return;
        const q = query(collection(db, 'roomBackgrounds'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setAvailableBackgrounds(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RoomBackground)));
        });
        return () => unsubscribe();
    }, [showSettingsModal, isAuthReady]);

    useEffect(() => {
        if(roomData && !showSettingsModal) {
            setSettingsName(roomData.name);
            setSettingsPassword(roomData.password || '');
            setSettingsBg(roomData.backgroundImage || '');
        }
    }, [roomData, showSettingsModal]);

    useEffect(() => {
        if (!currentSvga) {
            if (playerRef.current) {
                playerRef.current.clear();
            }
            return;
        }

        if (!(window as any).SVGA) {
            console.warn("SVGA Library not loaded");
            setCurrentSvga(null);
            isPlayingSvgaRef.current = false;
            return;
        }
        
        try {
            if (!playerRef.current) {
                playerRef.current = new (window as any).SVGA.Player('#svga-canvas');
                playerRef.current.loops = 1; 
                playerRef.current.clearsAfterStop = true; 
                playerRef.current.fillMode = 'Clear'; 
            }
            
            const parser = new (window as any).SVGA.Parser();
            
            if (svgaTimeoutRef.current) clearTimeout(svgaTimeoutRef.current);
            svgaTimeoutRef.current = setTimeout(() => {
                console.log("SVGA Timeout: Force clearing");
                if (playerRef.current) {
                    playerRef.current.stopAnimation();
                    playerRef.current.clear();
                }
                isPlayingSvgaRef.current = false;
                setCurrentSvga(null);
            }, 7000);

            parser.load(currentSvga, (videoItem: any) => {
                if (!playerRef.current) return;
                
                playerRef.current.setVideoItem(videoItem);
                playerRef.current.startAnimation();
                
                playerRef.current.onFinished(() => {
                    if (svgaTimeoutRef.current) clearTimeout(svgaTimeoutRef.current);
                    
                    playerRef.current.clear();
                    isPlayingSvgaRef.current = false;
                    
                    const next = animationQueueRef.current.shift();
                    if (next) {
                        isPlayingSvgaRef.current = true;
                        setCurrentSvga(next);
                    } else {
                        setCurrentSvga(null);
                    }
                });
            }, (err: any) => {
                console.error("SVGA Load Error", err);
                if (svgaTimeoutRef.current) clearTimeout(svgaTimeoutRef.current);
                
                isPlayingSvgaRef.current = false;
                const next = animationQueueRef.current.shift();
                if (next) {
                    isPlayingSvgaRef.current = true;
                    setCurrentSvga(next);
                } else {
                    setCurrentSvga(null);
                }
            });
        } catch (e) {
            console.error("SVGA Init Error", e);
            setCurrentSvga(null);
            isPlayingSvgaRef.current = false;
        }

        return () => {
            if (svgaTimeoutRef.current) clearTimeout(svgaTimeoutRef.current);
        };
    }, [currentSvga]);

    useEffect(() => {
        if (!roomData?.isPaidCall || !isAuthReady) return;
        const isHostLocal = roomData.createdBy === currentUser.uid;
        if (isHostLocal) return; 
        const processBilling = async () => {
            try {
                const userRef = doc(db, 'users', currentUser.uid);
                const userSnap = await getDoc(userRef);
                const currentBalance = userSnap.data()?.walletBalance || 0;
                if (currentBalance < 6) { alert("Insufficient coins."); onLeave(); return; }
                const batch = writeBatch(db);
                batch.update(userRef, { walletBalance: increment(-6) });
                const hostRef = doc(db, 'users', roomData.createdBy);
                batch.update(hostRef, { commissionBalance: increment(2) });
                await batch.commit();
            } catch (e) { console.error(e); }
        };
        if (!initialChargeProcessed.current) { processBilling(); initialChargeProcessed.current = true; }
        const billingInterval = setInterval(() => { processBilling(); }, 60000); 
        return () => clearInterval(billingInterval);
    }, [roomData?.isPaidCall, roomData?.createdBy, currentUser.uid, isAuthReady]);

    useEffect(() => {
      if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const checkAudioLevels = () => {
          const speaking: Record<string, boolean> = {};
          const threshold = 10;
          Object.keys(analysersRef.current).forEach(uid => {
              const analyser = analysersRef.current[uid];
              const dataArray = new Uint8Array(analyser.frequencyBinCount);
              analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for(let i=0; i < dataArray.length; i++) sum += dataArray[i];
              if (sum / dataArray.length > threshold) speaking[uid] = true;
          });
          setSpeakingUsers(speaking);
      };
      audioIntervalRef.current = setInterval(checkAudioLevels, 100);
      return () => { if (audioIntervalRef.current) clearInterval(audioIntervalRef.current); };
    }, []);

    const setupAudioAnalyser = (uid: string, stream: MediaStream) => {
        if (!audioContextRef.current || analysersRef.current[uid]) return;
        try {
            const source = audioContextRef.current.createMediaStreamSource(stream);
            const analyser = audioContextRef.current.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);
            analysersRef.current[uid] = analyser;
        } catch (e) { console.error(e); }
    };
  
    useEffect(() => { if (localStreamRef.current && !analysersRef.current[currentUser.uid]) setupAudioAnalyser(currentUser.uid, localStreamRef.current); }, [localStreamRef.current]);
    useEffect(() => { Object.keys(remoteStreams).forEach(uid => { if (!analysersRef.current[uid]) setupAudioAnalyser(uid, remoteStreams[uid]); }); }, [remoteStreams]);

    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible' && isAuthReady) {
                await updateParticipantData(currentUser.uid, { lastSeen: Date.now() });
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, [currentUser.uid, isAuthReady]);

    useEffect(() => {
        if (!isAuthReady) return;

        musicAudioRef.current = new Audio();
        musicAudioRef.current.crossOrigin = "anonymous";
        musicAudioRef.current.loop = false;
        musicAudioRef.current.onended = () => { if (roomData && roomData.createdBy === currentUser.uid) playNextSong(); };
    
        const init = async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStreamRef.current = stream;
            stream.getAudioTracks().forEach(t => t.enabled = false);
          } catch (err) { console.error(err); }

          const joinTime = Date.now() - 5000;
          const roomRef = doc(db, 'rooms', roomId);
          const unsubRoom = onSnapshot(roomRef, async (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data() as ExtendedRoomType;
              if (data.kickedUsers && data.kickedUsers[currentUser.uid]) { if (Date.now() - data.kickedUsers[currentUser.uid] < 10 * 60 * 1000) { cleanup(); onLeave(); alert("Removed from room."); return; } }
              setRoomData({ id: snapshot.id, ...data });
              const currentParts = data.participants || [];
              setParticipants(currentParts);
              
              const myPart = currentParts.find(p => p.uid === currentUser.uid);
              if (myPart) {
                 const isOnSeat = myPart.seatIndex >= 0 || myPart.seatIndex === 999;
                 if (localStreamRef.current) { if (!isOnSeat || myPart.isHostMuted || (myPart.isMuted && !isMuted)) { localStreamRef.current.getAudioTracks().forEach(t => t.enabled = false); setIsMuted(true); } }
              }
              const currentIds = currentParts.map(p => p.uid);
              Object.keys(pcsRef.current).forEach(pcId => { if (!currentIds.includes(pcId)) closePeerConnection(pcId); });
              currentParts.forEach(p => { if (p.uid !== currentUser.uid && currentUser.uid < p.uid) createPeerConnection(p.uid, true); });
            } else { onLeave(); }
          });
          unsubscribersRef.current.push(unsubRoom);
          
          const signalRef = collection(db, 'rooms', roomId, 'signal');
          const q = query(signalRef, where('to', '==', currentUser.uid));
          const unsubSignal = onSnapshot(q, async (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
              if (change.type === 'added') {
                const data = change.doc.data();
                if (data.from === currentUser.uid) return;
                if (data.type === 'offer') await handleOffer(data.from, data.offer);
                else if (data.type === 'answer') await handleAnswer(data.from, data.answer);
                else if (data.type === 'candidate') await handleCandidate(data.from, data.candidate);
                deleteDoc(change.doc.ref).catch(console.warn);
              }
            });
          });
          unsubscribersRef.current.push(unsubSignal);
          const invitesRef = collection(db, 'rooms', roomId, 'invites');
          const unsubInvites = onSnapshot(query(invitesRef, where('to', '==', currentUser.uid)), (snapshot) => { setIncomingInvite(snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Invite); });
          unsubscribersRef.current.push(unsubInvites);
          const messagesRef = collection(db, 'rooms', roomId, 'messages');
          const unsubMessages = onSnapshot(query(messagesRef, where('createdAt', '>=', joinTime), orderBy('createdAt', 'asc')), (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const data = change.doc.data() as Message;
                    if (data.type === 'gift' && (Date.now() - data.createdAt < 8000)) {
                        if (data.giftAnimationUrl && data.giftAnimationUrl.trim() !== '') {
                            if (!isPlayingSvgaRef.current) {
                                isPlayingSvgaRef.current = true;
                                setCurrentSvga(data.giftAnimationUrl);
                            } else {
                                animationQueueRef.current.push(data.giftAnimationUrl);
                            }
                        } else if (data.giftIcon) {
                            setGiftAnimation({ icon: data.giftIcon, name: data.giftName || 'Gift', senderName: data.senderName });
                            setTimeout(() => setGiftAnimation(null), 4000);
                        }
                    }
                }
            });
            setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
          });
          unsubscribersRef.current.push(unsubMessages);
        };
        init();
        heartbeatIntervalRef.current = setInterval(async () => { await updateParticipantData(currentUser.uid, { lastSeen: Date.now() }); }, 30000); 
        
        return () => { cleanup(); };
    }, [roomId, isAuthReady]);
    
    useEffect(() => {
        if (!roomData?.musicState || !musicAudioRef.current) return;
        const { musicUrl, isPlaying, musicTime } = roomData.musicState;
        const audio = musicAudioRef.current;
        const handleMusicPlayback = async () => {
            if (musicUrl && audio.src !== musicUrl) { audio.src = musicUrl; audio.load(); }
            if (musicUrl) {
                if (isPlaying) {
                    const expectedTime = (Date.now() - musicTime) / 1000;
                    if (Math.abs(audio.currentTime - expectedTime) > 0.5) audio.currentTime = Math.max(0, expectedTime);
                    if (audio.paused) await audio.play().catch(e => { if (e.name !== 'AbortError') console.warn(e); });
                } else { if (!audio.paused) audio.pause(); }
                audio.volume = isSpeakerOn ? 1.0 : 0.0;
            }
        };
        handleMusicPlayback();
    }, [roomData?.musicState, isSpeakerOn]);
    
    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
    useEffect(() => { if (showGiftModal && roomData) setGiftRecipientId(roomData.createdBy); }, [showGiftModal, roomData]);

    const fetchRecentChats = async () => {
        const q = query(collection(db, 'chats'), where('participants', 'array-contains', currentUser.uid));
        const snap = await getDocs(q);
        const chats = snap.docs.map(d => ({id: d.id, ...d.data()} as ChatMetadata));
        setRecentChats(chats.sort((a, b) => b.updatedAt - a.updatedAt));
    };

    const createPeerConnection = async (targetUid: string, isInitiator: boolean) => {
        if (pcsRef.current[targetUid]) return pcsRef.current[targetUid];
        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcsRef.current[targetUid] = pc;
        const streamToSend = localStreamRef.current;
        if (streamToSend) streamToSend.getTracks().forEach(track => pc.addTrack(track, streamToSend));
        pc.onicecandidate = async (event) => { if (event.candidate) await addDoc(collection(db, 'rooms', roomId, 'signal'), { type: 'candidate', from: currentUser.uid, to: targetUid, candidate: event.candidate.toJSON() }); };
        pc.ontrack = (event) => { if (event.streams[0]) setRemoteStreams(prev => ({ ...prev, [targetUid]: event.streams[0] })); };
        if (isInitiator) {
            try {
                const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
                await addDoc(collection(db, 'rooms', roomId, 'signal'), { type: 'offer', from: currentUser.uid, to: targetUid, offer: { type: offer.type, sdp: offer.sdp } });
            } catch (e) { console.error(e); }
        }
        return pc;
    };
    
    const processCandidateQueue = async (uid: string, pc: RTCPeerConnection) => {
          const queue = candidateQueueRef.current[uid] || [];
          if (queue.length > 0) {
              for (const candidate of queue) { try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {} }
              candidateQueueRef.current[uid] = [];
          }
    };
    
    const handleOffer = async (fromUid: string, offer: RTCSessionDescriptionInit) => {
          const pc = await createPeerConnection(fromUid, false); if (!pc) return;
          try { await pc.setRemoteDescription(new RTCSessionDescription(offer)); await processCandidateQueue(fromUid, pc);
              const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
              await addDoc(collection(db, 'rooms', roomId, 'signal'), { type: 'answer', from: currentUser.uid, to: fromUid, answer: { type: answer.type, sdp: answer.sdp } });
          } catch (e) { console.error(e); }
    };
    const handleAnswer = async (fromUid: string, answer: RTCSessionDescriptionInit) => {
          const pc = pcsRef.current[fromUid]; if (!pc || pc.signalingState === 'stable') return;
          try { await pc.setRemoteDescription(new RTCSessionDescription(answer)); await processCandidateQueue(fromUid, pc); } catch (e) { console.error(e); }
    };
    const handleCandidate = async (fromUid: string, candidate: RTCIceCandidateInit) => {
          const pc = pcsRef.current[fromUid];
          if (!pc) { if (!candidateQueueRef.current[fromUid]) candidateQueueRef.current[fromUid] = []; candidateQueueRef.current[fromUid].push(candidate); return; }
          if (pc.remoteDescription && pc.remoteDescription.type) { try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {} } 
          else { if (!candidateQueueRef.current[fromUid]) candidateQueueRef.current[fromUid] = []; candidateQueueRef.current[fromUid].push(candidate); }
    };
    const closePeerConnection = (uid: string) => { if (pcsRef.current[uid]) { pcsRef.current[uid].close(); delete pcsRef.current[uid]; setRemoteStreams(prev => { const newStreams = { ...prev }; delete newStreams[uid]; return newStreams; }); delete analysersRef.current[uid]; } };
    const cleanup = async () => {
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') { try { await audioContextRef.current.close(); } catch(e) {} }
        audioContextRef.current = null;
        unsubscribersRef.current.forEach(u => u()); unsubscribersRef.current = [];
        Object.keys(pcsRef.current).forEach(uid => closePeerConnection(uid));
        if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
        if (musicAudioRef.current) { musicAudioRef.current.pause(); musicAudioRef.current = null; }
        const roomRef = doc(db, 'rooms', roomId);
        try {
            const docSnap = await getDoc(roomRef);
            if (docSnap.exists()) {
                const data = docSnap.data() as ExtendedRoomType;
                if (data.isPaidCall && data.createdBy === currentUser.uid) { try { await updateDoc(doc(db, 'activeListeners', currentUser.uid), { isBusy: false }); } catch (e) {} }
                const remainingParticipants = (data.participants || []).filter(p => p.uid !== currentUser.uid);
                const hasAuthority = remainingParticipants.some(p => p.uid === data.createdBy || (data.admins || []).includes(p.uid));
                const updateData: any = { participants: remainingParticipants };
                if (!hasAuthority) updateData.active = false;
                await updateDoc(roomRef, updateData);
            }
        } catch (error) { console.error(error); }
    };
    const updateParticipantData = async (uid: string, changes: Partial<Participant>) => { if (!participants.find(p => p.uid === uid)) return; await updateDoc(doc(db, 'rooms', roomId), { participants: participants.map(p => p.uid === uid ? { ...p, ...changes } : p) }); };
    
    const handleSeatClick = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const occupant = participants.find(p => p.seatIndex === index);
        const rect = e.currentTarget.getBoundingClientRect();
        if (occupant) { if (isHost || isAdmin || occupant.uid === currentUser.uid) { setPopupInfo({ index, rect }); return; } setViewingProfileUid(occupant.uid); return; }
        const isLocked = roomData?.lockedSeats?.includes(index);
        
        if (isHost || isAdmin) { setPopupInfo({ index, rect }); return; }
        
        let shouldOpen = !isLocked && index !== 999;
        if (shouldOpen) setPopupInfo({ index, rect });
    };
    const sendInvite = async (targetUid: string) => { if (inviteSeatIndex !== null) { await addDoc(collection(db, 'rooms', roomId, 'invites'), { to: targetUid, seatIndex: inviteSeatIndex, from: currentUser.uid, fromName: currentUser.displayName, timestamp: Date.now() }); setInviteSeatIndex(null); setShowInviteList(false); } };
    const acceptInvite = async () => { if (incomingInvite) { await updateParticipantData(currentUser.uid, { seatIndex: incomingInvite.seatIndex, isMuted: true }); await deleteDoc(doc(db, 'rooms', roomId, 'invites', incomingInvite.id)); setIncomingInvite(null); } };
    const declineInvite = async () => { if (incomingInvite) { await deleteDoc(doc(db, 'rooms', roomId, 'invites', incomingInvite.id)); setIncomingInvite(null); } };
    const handleTakeSeat = async (index: number) => { await updateParticipantData(currentUser.uid, { seatIndex: index, isMuted: true }); setPopupInfo(null); };
    const handleMutePeer = async (targetUid: string, currentMuteState: boolean, currentHostMuteState: boolean) => {
        if (currentHostMuteState) await updateParticipantData(targetUid, { isHostMuted: false });
        else await updateParticipantData(targetUid, { isMuted: true, isHostMuted: true });
        setPopupInfo(null);
    };
    const toggleMute = () => { const activeStream = localStreamRef.current; if (activeStream) { activeStream.getAudioTracks().forEach(track => { track.enabled = !(!isMuted); }); setIsMuted(!isMuted); updateParticipantData(currentUser.uid, { isMuted: !isMuted }); } };
    const toggleSpeaker = () => { setIsSpeakerOn(!isSpeakerOn); };
    const handleSendMessage = async (e: React.FormEvent) => { e.preventDefault(); if (newMessage.trim()) { await addDoc(collection(db, 'rooms', roomId, 'messages'), { text: newMessage.trim(), senderId: currentUser.uid, senderName: currentUser.displayName, senderPhoto: currentUser.photoURL, createdAt: Date.now(), type: 'user' }); setNewMessage(''); } };
    const handleSendSticker = async (sticker: Sticker) => { if (!isOnSeat) { alert("You must be on a seat."); setShowStickerPicker(false); return; } await updateParticipantData(currentUser.uid, { reaction: { url: sticker.url, expiresAt: Date.now() + 3000 } }); setShowStickerPicker(false); };
    const handleShareClick = () => { fetchRecentChats(); setShowShareModal(true); setShowRoomMenu(false); };
    const inviteUserToRoom = async (chatId: string) => { if (roomData) { await addDoc(collection(db, 'chats', chatId, 'messages'), { text: roomData.name, type: 'invite', roomId: roomData.id, roomPassword: roomData.password || '', senderId: currentUser.uid, createdAt: Date.now(), read: false }); await updateDoc(doc(db, 'chats', chatId), { lastMessage: `Invite: ${roomData.name}`, lastMessageTime: Date.now(), updatedAt: Date.now() }); alert("Invite sent!"); setShowShareModal(false); } };
    const toggleMusicVisibility = async () => { if (roomData) { const newState = !roomData.musicState?.isEnabled; await updateDoc(doc(db, 'rooms', roomId), { 'musicState.isEnabled': newState, ...( !newState ? { 'musicState.musicUrl': null, 'musicState.isPlaying': false, 'musicState.queue': [], 'musicState.currentSongName': null, 'musicState.playedBy': null } : {} ) }); setShowRoomMenu(false); } };
    const uploadAndPlaySong = async (file: File) => {
          setIsUploadingMusic(true);
          try {
              const formData = new FormData(); formData.append('file', file); formData.append('upload_preset', 'Heartly image'); formData.append('resource_type', 'video');
              const response = await fetch('https://api.cloudinary.com/v1_1/dtxvdtt78/video/upload', { method: 'POST', body: formData });
              const data = await response.json(); if (data.error) throw new Error(data.error.message);
              const newSong: Song = { id: Date.now().toString(), url: data.secure_url, name: file.name, addedBy: currentUser.uid, addedByName: currentUser.displayName || 'Unknown' };
              if (!roomData?.musicState?.isPlaying && !roomData?.musicState?.musicUrl && (isHost || isAdmin)) await updateDoc(doc(db, 'rooms', roomId), { musicState: { isEnabled: true, musicUrl: newSong.url, currentSongName: newSong.name, playedBy: currentUser.uid, isPlaying: true, musicTime: Date.now(), queue: roomData?.musicState?.queue || [] } });
              else await updateDoc(doc(db, 'rooms', roomId), { 'musicState.queue': arrayUnion(newSong) });
          } catch (err: any) { alert("Upload failed."); } finally { setIsUploadingMusic(false); }
    };
    const searchMusic = async (e: React.FormEvent) => { e.preventDefault(); if (!musicSearchQuery.trim()) return; setIsSearchingMusic(true); try { const response = await fetch(`https://api.jamendo.com/v3.0/tracks/?client_id=c9720322&format=jsonpretty&limit=20&imagesize=200&tags=${encodeURIComponent(musicSearchQuery)}&include=musicinfo`); const data = await response.json(); if (data.results) setMusicSearchResults(data.results); } catch (error) { console.error(error); } finally { setIsSearchingMusic(false); } };
    const addTrackToQueue = async (track: any) => {
          const newSong: Song = { id: track.id, url: track.audio, name: track.name, artist: track.artist_name, duration: track.duration, addedBy: currentUser.uid, addedByName: currentUser.displayName || 'User' };
          if (!roomData?.musicState?.isPlaying && !roomData?.musicState?.musicUrl && (isHost || isAdmin)) await updateDoc(doc(db, 'rooms', roomId), { 'musicState.musicUrl': newSong.url, 'musicState.currentSongName': newSong.name, 'musicState.playedBy': newSong.addedBy, 'musicState.isPlaying': true, 'musicState.musicTime': Date.now() });
          else await updateDoc(doc(db, 'rooms', roomId), { 'musicState.queue': arrayUnion(newSong) }); setMusicTab('player');
    };
    const playNextSong = async () => {
          if (!isHost && !isAdmin) return;
          if (!roomData?.musicState?.queue || roomData.musicState.queue.length === 0) { await updateDoc(doc(db, 'rooms', roomId), { 'musicState.isPlaying': false, 'musicState.musicUrl': null, 'musicState.currentSongName': null, 'musicState.playedBy': null }); return; }
          const nextSong = roomData.musicState.queue[0];
          await updateDoc(doc(db, 'rooms', roomId), { 'musicState.musicUrl': nextSong.url, 'musicState.currentSongName': nextSong.name, 'musicState.playedBy': nextSong.addedBy, 'musicState.isPlaying': true, 'musicState.musicTime': Date.now(), 'musicState.queue': arrayRemove(nextSong) });
    };
    const removeFromQueue = async (song: Song) => { if (isHost || isAdmin) await updateDoc(doc(db, 'rooms', roomId), { 'musicState.queue': arrayRemove(song) }); };
    const togglePlayPause = async () => { if (roomData?.musicState?.musicUrl && (isHost || isAdmin)) await updateDoc(doc(db, 'rooms', roomId), { 'musicState.isPlaying': !roomData.musicState.isPlaying, 'musicState.musicTime': Date.now() - (musicAudioRef.current?.currentTime || 0) * 1000 }); };
    
    // ... Render code ... (rest of the component)
    return (
        <div className="flex flex-col h-full bg-[#050505] text-white relative">
            <input type="file" ref={musicInputRef} className="hidden" accept="audio/*" onChange={(e) => { const f = e.target.files?.[0]; if(f) uploadAndPlaySong(f); }} />
            {roomData?.backgroundImage && <div className="absolute inset-0 z-0 bg-cover bg-center opacity-40 blur-sm" style={{ backgroundImage: `url(${roomData.backgroundImage})` }} />}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#050505] z-0 pointer-events-none" />
            <div className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-4 flex items-center justify-between relative z-10">
                <button onClick={isMinimized ? onMinimize : onLeave} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors backdrop-blur-md text-white"><ArrowDownToLine size={20} className="rotate-90" /></button>
                <div className="flex flex-col items-center">
                    <h2 className="text-lg font-bold text-white leading-tight flex items-center gap-2">{roomData?.name || 'Loading...'} {roomData?.password && <Lock size={12} className="text-yellow-500" />}</h2>
                    <div className="flex items-center gap-2 mt-0.5"><span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-gray-300 backdrop-blur-md">ID: {roomData?.id.slice(0,6)}</span>{roomData?.isPaidCall && <span className="text-[10px] bg-yellow-500 text-black px-2 py-0.5 rounded font-bold backdrop-blur-md flex items-center gap-1"><Coins size={8}/> Paid Call</span>}</div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={onMinimize} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors backdrop-blur-md text-white"><Minimize2 size={20} /></button>
                    <button onClick={() => setShowRoomMenu(true)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors backdrop-blur-md text-white"><MoreHorizontal size={20} /></button>
                </div>
            </div>

            {/* Main Grid */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 no-scrollbar relative z-10 min-h-0">
                {/* Host Seat */}
                <div className="flex justify-center mb-8 mt-2">
                    <div className="relative group cursor-pointer" onClick={(e) => handleSeatClick(999, e)}>
                        <div className="w-24 h-24 rounded-[2rem] border-2 border-yellow-500 p-1 relative shadow-[0_0_30px_rgba(234,179,8,0.3)] bg-[#050505]">
                             {participants.find(p => p.seatIndex === 999) ? (
                                <div className="w-full h-full rounded-[1.8rem] overflow-hidden relative">
                                    <img src={participants.find(p => p.seatIndex === 999)?.photoURL || ''} className="w-full h-full object-cover" />
                                    {/* Frame Overlay */}
                                    {participants.find(p => p.seatIndex === 999)?.frameUrl && <img src={participants.find(p => p.seatIndex === 999)?.frameUrl} className="absolute inset-0 w-full h-full scale-[1.35] object-contain pointer-events-none z-20" />}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                                    <div className="absolute bottom-1 left-0 right-0 text-center"><p className="text-[10px] font-bold text-white truncate px-1">{participants.find(p => p.seatIndex === 999)?.displayName}</p></div>
                                    {participants.find(p => p.seatIndex === 999)?.reaction && (<div className="absolute top-0 right-0 w-8 h-8 animate-bounce"><img src={participants.find(p => p.seatIndex === 999)?.reaction?.url} className="w-full h-full object-contain" /></div>)}
                                    {speakingUsers[participants.find(p => p.seatIndex === 999)?.uid || ''] && !participants.find(p => p.seatIndex === 999)?.isMuted && (<div className="absolute -inset-1 border-2 border-green-400 rounded-[2rem] animate-pulse"></div>)}
                                    {participants.find(p => p.seatIndex === 999)?.isMuted && (<div className="absolute top-1 right-1 bg-black/60 rounded-full p-1"><MicOff size={10} className="text-red-500"/></div>)}
                                </div>
                             ) : (
                                <div className="w-full h-full rounded-[1.8rem] bg-[#1A1A21] flex items-center justify-center border border-white/5"><Crown size={24} className="text-yellow-500/50" /></div>
                             )}
                        </div>
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-[9px] font-bold px-2 py-0.5 rounded-full">HOST</div>
                    </div>
                </div>

                {/* Seats Grid */}
                <div className="grid grid-cols-4 gap-3 mb-6">
                    {Array.from({ length: 8 }).map((_, i) => {
                        const occupant = participants.find(p => p.seatIndex === i);
                        const isLocked = roomData?.lockedSeats?.includes(i);
                        return (
                            <div key={i} className="flex flex-col items-center gap-1 group cursor-pointer" onClick={(e) => handleSeatClick(i, e)}>
                                <div className="relative w-16 h-16 rounded-2xl bg-[#1A1A21] border border-white/5 flex items-center justify-center transition-all active:scale-95 shadow-md">
                                    {occupant ? (
                                        <div className="w-full h-full rounded-2xl overflow-hidden relative">
                                            <img src={occupant.photoURL || ''} className="w-full h-full object-cover" />
                                            {/* Frame Overlay */}
                                            {occupant.frameUrl && <img src={occupant.frameUrl} className="absolute inset-0 w-full h-full scale-[1.35] object-contain pointer-events-none z-20" />}
                                            
                                            {occupant.reaction && (<div className="absolute top-0 right-0 w-6 h-6 animate-bounce z-30"><img src={occupant.reaction.url} className="w-full h-full object-contain" /></div>)}
                                            {speakingUsers[occupant.uid] && !occupant.isMuted && (<div className="absolute -inset-1 border-2 border-green-400 rounded-2xl animate-pulse z-30"></div>)}
                                            {occupant.isMuted && (<div className="absolute bottom-0 right-0 bg-black/60 p-0.5 rounded-tl z-30"><MicOff size={8} className="text-red-500"/></div>)}
                                            <div className="absolute bottom-0 left-0 right-0 bg-black/40 backdrop-blur-[1px] text-center py-0.5 z-20"><p className="text-[8px] text-white truncate px-1">{occupant.displayName}</p></div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center w-full h-full">
                                            {isLocked ? <Lock size={14} className="text-gray-600" /> : <div className="w-4 h-4 rounded-full bg-white/5 flex items-center justify-center"><Plus size={10} className="text-gray-600" /></div>}
                                            <span className="absolute -top-1 left-1 text-[8px] text-gray-700 font-mono">{i + 1}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Bottom Controls */}
            <div className="bg-[#121216]/90 backdrop-blur-2xl border-t border-white/10 px-4 py-3 relative z-50 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                 <div className="flex items-center justify-between gap-4">
                     <div className="flex gap-3">
                         <button onClick={toggleMute} className={`p-3 rounded-2xl transition-all active:scale-90 ${!isMuted ? 'bg-white text-black' : 'bg-white/10 text-white'}`}>{!isMuted ? <Mic size={20}/> : <MicOff size={20}/>}</button>
                         <button onClick={toggleSpeaker} className={`p-3 rounded-2xl transition-all active:scale-90 ${isSpeakerOn ? 'bg-green-500 text-black' : 'bg-white/10 text-gray-400'}`}>{isSpeakerOn ? <Volume2 size={20}/> : <VolumeX size={20}/>}</button>
                     </div>
                     <div className="flex-1 bg-[#1A1A21] rounded-2xl flex items-center px-3 border border-white/5 relative">
                         <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Say something..." className="flex-1 bg-transparent border-none outline-none text-xs text-white h-10 placeholder-gray-500" onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage(e); }} />
                         <button onClick={() => setShowStickerPicker(!showStickerPicker)} className="p-1.5 text-gray-400 hover:text-white"><Smile size={16}/></button>
                         <button onClick={handleSendMessage} className="p-1.5 ml-1 bg-white/10 rounded-lg text-white"><Send size={14}/></button>
                         
                         {/* Sticker Picker */}
                         {showStickerPicker && (
                             <div className="absolute bottom-full mb-2 left-0 w-full bg-[#1A1A21] border border-white/10 rounded-2xl p-2 shadow-xl animate-fade-in z-50">
                                 <div className="grid grid-cols-5 gap-2 max-h-40 overflow-y-auto native-scroll">
                                     {stickers.map(sticker => (
                                         <button key={sticker.id} onClick={() => handleSendSticker(sticker)} className="aspect-square flex items-center justify-center hover:bg-white/5 rounded-lg"><img src={sticker.url} className="w-8 h-8 object-contain" /></button>
                                     ))}
                                 </div>
                             </div>
                         )}
                     </div>
                     <button onClick={() => setShowGiftModal(true)} className="p-3 bg-gradient-to-br from-pink-500 to-rose-500 rounded-2xl text-white shadow-lg active:scale-90 animate-pulse"><Gift size={20}/></button>
                 </div>
            </div>

            {/* Popup Menu */}
            {popupInfo && (
                <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" onClick={() => setPopupInfo(null)}>
                    <div 
                        className="absolute bg-[#1A1A21] border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[160px] animate-scale-in"
                        style={{ top: popupInfo.rect.bottom + 10, left: Math.min(window.innerWidth - 170, Math.max(10, popupInfo.rect.left)) }}
                        onClick={e => e.stopPropagation()}
                    >
                        {participants.find(p => p.seatIndex === popupInfo.index) ? (
                            <>
                                <button onClick={() => { setViewingProfileUid(participants.find(p => p.seatIndex === popupInfo.index)?.uid || null); setPopupInfo(null); }} className="w-full text-left px-4 py-3 text-xs font-bold text-white hover:bg-white/5 flex items-center gap-2"><Eye size={14}/> View Profile</button>
                                {(isHost || isAdmin) && (
                                    <>
                                        <button onClick={() => handleMutePeer(participants.find(p => p.seatIndex === popupInfo.index)!.uid, participants.find(p => p.seatIndex === popupInfo.index)!.isMuted, participants.find(p => p.seatIndex === popupInfo.index)!.isHostMuted || false)} className="w-full text-left px-4 py-3 text-xs font-bold text-white hover:bg-white/5 flex items-center gap-2"><MicOff size={14}/> {participants.find(p => p.seatIndex === popupInfo.index)!.isHostMuted ? 'Unmute User' : 'Mute User'}</button>
                                        <button onClick={async () => { await updateParticipantData(participants.find(p => p.seatIndex === popupInfo.index)!.uid, { seatIndex: -1 }); setPopupInfo(null); }} className="w-full text-left px-4 py-3 text-xs font-bold text-red-400 hover:bg-white/5 flex items-center gap-2"><ArrowDownToLine size={14}/> Move to Audience</button>
                                    </>
                                )}
                            </>
                        ) : (
                            <>
                                <button onClick={() => handleTakeSeat(popupInfo.index)} className="w-full text-left px-4 py-3 text-xs font-bold text-white hover:bg-white/5 flex items-center gap-2"><CheckCircle2 size={14}/> Take Seat</button>
                                {(isHost || isAdmin) && (
                                    <>
                                        <button onClick={async () => { if(roomData?.lockedSeats?.includes(popupInfo.index)) await updateDoc(doc(db, 'rooms', roomId), { lockedSeats: arrayRemove(popupInfo.index) }); else await updateDoc(doc(db, 'rooms', roomId), { lockedSeats: arrayUnion(popupInfo.index) }); setPopupInfo(null); }} className="w-full text-left px-4 py-3 text-xs font-bold text-white hover:bg-white/5 flex items-center gap-2">{roomData?.lockedSeats?.includes(popupInfo.index) ? <Unlock size={14}/> : <Lock size={14}/>} {roomData?.lockedSeats?.includes(popupInfo.index) ? 'Unlock Seat' : 'Lock Seat'}</button>
                                        <button onClick={() => { setInviteSeatIndex(popupInfo.index); setShowInviteList(true); setPopupInfo(null); }} className="w-full text-left px-4 py-3 text-xs font-bold text-white hover:bg-white/5 flex items-center gap-2"><UserPlus size={14}/> Invite User</button>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Profile Modal */}
            {viewingProfileUid && <UserProfileModal targetUid={viewingProfileUid} currentUser={currentUser} onClose={() => setViewingProfileUid(null)} isViewerHost={isHost} isViewerAdmin={isAdmin} roomAdmins={roomData?.admins || []} roomId={roomId} currentParticipants={participants} roomCreatorId={roomData?.createdBy || ''} />}

            {/* Room Menu Modal */}
            {showRoomMenu && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowRoomMenu(false)}>
                    <div className="bg-[#121216] w-full max-w-sm rounded-[2rem] p-6 border border-white/10 shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="grid grid-cols-4 gap-4 mb-4">
                            <MenuButton icon={<Share2 size={24}/>} label="Share" onClick={handleShareClick} color="text-violet-400" />
                            {roomData?.musicState?.isEnabled ? (
                                <MenuButton icon={<Disc3 size={24} className={roomData.musicState.isPlaying ? 'animate-spin' : ''}/>} label="Music" onClick={() => { setShowMusicModal(true); setShowRoomMenu(false); }} color="text-fuchsia-400" />
                            ) : (
                                (isHost || isAdmin) && <MenuButton icon={<Music2 size={24}/>} label="Enable Music" onClick={toggleMusicVisibility} color="text-gray-400" />
                            )}
                            <MenuButton icon={<Users size={24}/>} label={`Viewers (${participants.length})`} onClick={() => { setShowViewerList(true); setShowRoomMenu(false); }} color="text-emerald-400" />
                            {(isHost || isAdmin) && <MenuButton icon={<Settings size={24}/>} label="Settings" onClick={() => { setShowSettingsModal(true); setShowRoomMenu(false); }} color="text-gray-400" />}
                        </div>
                        {(isHost || isAdmin) && roomData?.musicState?.isEnabled && (
                            <button onClick={toggleMusicVisibility} className="w-full py-3 mt-2 rounded-xl bg-red-500/10 text-red-400 font-bold text-xs flex items-center justify-center gap-2"><Power size={14}/> Disable Music System</button>
                        )}
                    </div>
                </div>
            )}

            {/* Music Modal */}
            {showMusicModal && roomData?.musicState && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setShowMusicModal(false)}>
                    <div className="bg-[#121216] w-full max-w-sm rounded-[2rem] border border-white/10 shadow-2xl animate-fade-in flex flex-col max-h-[70dvh]" onClick={e => e.stopPropagation()}>
                         <div className="p-4 border-b border-white/5 flex justify-between items-center"><h3 className="text-lg font-bold text-white flex items-center gap-2"><Music2 size={20} className="text-fuchsia-500"/> Music Player</h3><button onClick={() => setShowMusicModal(false)}><XIcon size={20} className="text-gray-400"/></button></div>
                         <div className="flex border-b border-white/5"><button onClick={() => setMusicTab('player')} className={`flex-1 py-3 text-xs font-bold ${musicTab === 'player' ? 'text-white border-b-2 border-fuchsia-500' : 'text-gray-500'}`}>Player</button><button onClick={() => setMusicTab('queue')} className={`flex-1 py-3 text-xs font-bold ${musicTab === 'queue' ? 'text-white border-b-2 border-fuchsia-500' : 'text-gray-500'}`}>Queue ({roomData.musicState.queue?.length || 0})</button><button onClick={() => setMusicTab('search')} className={`flex-1 py-3 text-xs font-bold ${musicTab === 'search' ? 'text-white border-b-2 border-fuchsia-500' : 'text-gray-500'}`}>Search</button></div>
                         <div className="p-4 flex-1 overflow-y-auto min-h-0 native-scroll">
                             {musicTab === 'player' && (
                                 <div className="flex flex-col items-center justify-center h-full">
                                     <div className={`w-32 h-32 rounded-full border-4 border-[#1A1A21] shadow-2xl mb-6 relative flex items-center justify-center bg-gray-900 ${roomData.musicState.isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''}`}><Disc3 size={64} className="text-gray-700"/></div>
                                     <h3 className="text-white font-bold text-center px-4 truncate w-full">{roomData.musicState.currentSongName || 'No song playing'}</h3>
                                     <p className="text-gray-500 text-xs mb-6">Added by: {roomData.musicState.playedBy ? participants.find(p=>p.uid===roomData.musicState?.playedBy)?.displayName : '-'}</p>
                                     {(isHost || isAdmin) && (
                                         <div className="flex items-center gap-6">
                                             <button onClick={togglePlayPause} className="w-14 h-14 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform">{roomData.musicState.isPlaying ? <Pause size={24} fill="black"/> : <Play size={24} fill="black" className="ml-1"/>}</button>
                                             <button onClick={playNextSong} className="p-3 bg-white/10 rounded-full text-white hover:bg-white/20"><SkipForward size={24}/></button>
                                         </div>
                                     )}
                                     <button onClick={() => musicInputRef.current?.click()} disabled={isUploadingMusic} className="mt-8 flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white bg-white/5 px-4 py-2 rounded-full">{isUploadingMusic ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>} Upload MP3</button>
                                 </div>
                             )}
                             {musicTab === 'queue' && (
                                 <div className="space-y-3">{!roomData.musicState.queue?.length ? <p className="text-gray-500 text-center text-xs mt-10">Queue is empty.</p> : roomData.musicState.queue.map((song, i) => (<div key={i} className="flex justify-between items-center bg-white/5 p-3 rounded-xl"><div className="truncate flex-1"><p className="text-sm font-bold text-white truncate">{song.name}</p><p className="text-[10px] text-gray-500">{song.artist || 'Unknown'}</p></div>{(isHost || isAdmin) && <button onClick={() => removeFromQueue(song)} className="text-red-400 p-2"><Trash2 size={16}/></button>}</div>))}</div>
                             )}
                             {musicTab === 'search' && (
                                 <div className="h-full flex flex-col"><form onSubmit={searchMusic} className="flex gap-2 mb-4"><input type="text" value={musicSearchQuery} onChange={e => setMusicSearchQuery(e.target.value)} placeholder="Search songs..." className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white" /><button type="submit" disabled={isSearchingMusic} className="bg-fuchsia-600 px-4 rounded-xl text-white font-bold text-xs">{isSearchingMusic ? '...' : 'Go'}</button></form><div className="flex-1 overflow-y-auto space-y-2">{musicSearchResults.map(track => (<div key={track.id} className="flex justify-between items-center bg-white/5 p-2 rounded-xl"><div className="flex items-center gap-3"><img src={track.image} className="w-10 h-10 rounded-lg bg-gray-800" /><div className="min-w-0 max-w-[120px]"><p className="text-xs font-bold text-white truncate">{track.name}</p><p className="text-[10px] text-gray-500 truncate">{track.artist_name}</p></div></div><button onClick={() => addTrackToQueue(track)} className="bg-white/10 p-2 rounded-full hover:bg-white/20"><Plus size={16} className="text-white"/></button></div>))}</div></div>
                             )}
                         </div>
                    </div>
                </div>
            )}

            {/* SVGA Player Canvas (Hidden but functional) */}
            <div id="svga-canvas" className="fixed inset-0 pointer-events-none z-[80] flex items-center justify-center w-full h-full" style={{ display: currentSvga ? 'flex' : 'none' }}></div>
            
            {/* Gift Animation Overlay (Static fallback) */}
            {giftAnimation && !currentSvga && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center pointer-events-none animate-fade-in">
                     <div className="flex flex-col items-center animate-bounce-in">
                         <img src={giftAnimation.icon} className="w-48 h-48 object-contain drop-shadow-[0_0_30px_rgba(255,255,255,0.4)]" />
                         <div className="bg-black/60 backdrop-blur-md px-6 py-2 rounded-full mt-4 border border-white/10">
                             <p className="text-white font-bold text-sm"><span className="text-yellow-400">{giftAnimation.senderName}</span> sent {giftAnimation.name}!</p>
                         </div>
                     </div>
                </div>
            )}
        </div>
    );
};
