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
  ArrowDownToLine
} from 'lucide-react';

interface RoomProps {
  roomId: string;
  currentUser: UserProfile;
  onLeave: () => void;
  isMinimized: boolean;
  onMinimize: () => void;
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

export const ActiveRoom: React.FC<RoomProps> = ({ roomId, currentUser, onLeave, isMinimized, onMinimize }) => {
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
    }, []);

    useEffect(() => {
        if (!showSettingsModal) return;
        const q = query(collection(db, 'roomBackgrounds'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setAvailableBackgrounds(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RoomBackground)));
        });
        return () => unsubscribe();
    }, [showSettingsModal]);

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
        if (!roomData?.isPaidCall) return;
        const isHost = roomData.createdBy === currentUser.uid;
        if (isHost) return; 
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
    }, [roomData?.isPaidCall, roomData?.createdBy, currentUser.uid]);

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
            if (document.visibilityState === 'visible') {
                await updateParticipantData(currentUser.uid, { lastSeen: Date.now() });
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, [currentUser.uid]);

    useEffect(() => {
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
              if (!myPart) {
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
              } else {
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
    }, [roomId]);
    
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
    const togglePlayPause = async () => { if (roomData?.musicState?.musicUrl && (isHost || isAdmin)) { const isPlaying = roomData.musicState.isPlaying; const cur = musicAudioRef.current?.currentTime || 0; await updateDoc(doc(db, 'rooms', roomId), { 'musicState.isPlaying': !isPlaying, 'musicState.musicTime': isPlaying ? cur * 1000 : (Date.now() - (cur * 1000)) }); } };
    
    const saveRoomSettings = async () => { if(!roomData) return; await updateDoc(doc(db, 'rooms', roomId), { name: settingsName, password: settingsPassword, backgroundImage: settingsBg }); setShowSettingsModal(false); };
    const toggleSeatLock = async (seatIndex: number) => { const isLocked = roomData?.lockedSeats?.includes(seatIndex); if (isLocked) await updateDoc(doc(db, 'rooms', roomId), { lockedSeats: arrayRemove(seatIndex) }); else await updateDoc(doc(db, 'rooms', roomId), { lockedSeats: arrayUnion(seatIndex) }); setPopupInfo(null); };
    const handleInviteToSeat = (seatIndex: number) => { setInviteSeatIndex(seatIndex); setPopupInfo(null); setShowInviteList(true); };
    
    const handleGiftClick = async (gift: GiftItem) => { 
        if ((currentUser.walletBalance || 0) < gift.price) { alert("Not enough coins!"); return; } 
        if (!giftRecipientId) { alert("Select a recipient."); return; }
        const recipient = participants.find(p => p.uid === giftRecipientId);
        if (!recipient) return;
        if (roomData) { 
            const batch = writeBatch(db); 
            batch.update(doc(db, 'users', currentUser.uid), { walletBalance: increment(-gift.price) }); 
            batch.update(doc(db, 'users', recipient.uid), { walletBalance: increment(gift.price) }); 
            await batch.commit(); 
            
            await addDoc(collection(db, 'rooms', roomId, 'messages'), { 
                text: `sent a ${gift.name} to ${recipient.displayName} (${gift.price} coins)`, 
                senderId: currentUser.uid, 
                senderName: currentUser.displayName, 
                senderPhoto: currentUser.photoURL, 
                createdAt: Date.now(), 
                type: 'gift', 
                giftIcon: gift.iconUrl, 
                giftName: gift.name,
                giftAnimationUrl: gift.animationUrl 
            }); 
            setShowGiftModal(false); 
        } 
    };
    
    const hostSeatOccupant = participants.find(p => p.seatIndex === 999);
    const isHost = roomData ? currentUser.uid === roomData.createdBy : false;
    const isAdmin = roomData?.admins?.includes(currentUser.uid) || false;
    const myPart = participants.find(p => p.uid === currentUser.uid);
    const isOnSeat = myPart && (myPart.seatIndex >= 0 || myPart.seatIndex === 999);
    const gridSeats = Array.from({ length: 8 }).map((_, i) => ({ index: i, occupant: participants.find(p => p.seatIndex === i) }));
    const musicEnabled = roomData?.musicState?.isEnabled || false;
    const musicPlaying = roomData?.musicState?.isPlaying || false;
    const sortedViewerList = [...participants].sort((a, b) => { if (a.uid === roomData?.createdBy) return -1; if (b.uid === roomData?.createdBy) return 1; const aOnSeat = a.seatIndex >= 0; const bOnSeat = b.seatIndex >= 0; if (aOnSeat && !bOnSeat) return -1; if (!aOnSeat && bOnSeat) return 1; return (a.displayName || "").localeCompare(b.displayName || ""); });

    const renderPopupContent = () => {
        if (!popupInfo) return null;
        const index = popupInfo.index;
        const occupant = participants.find(p => p.seatIndex === index);
        const isLocked = roomData?.lockedSeats?.includes(index);
        
        if (occupant) {
             if (occupant.uid === currentUser.uid) return (<div className="bg-[#2A2A35] border border-white/10 rounded-xl shadow-2xl p-2 flex flex-col gap-1 w-48 text-white animate-fade-in"><button onClick={() => { setViewingProfileUid(occupant.uid); setPopupInfo(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-xs font-medium rounded-lg text-left"><Eye size={14} className="text-violet-400" /> View Profile</button><button onClick={() => { updateParticipantData(occupant.uid, { seatIndex: -1 }); setPopupInfo(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-red-500/10 text-xs font-medium text-red-400 rounded-lg text-left"><LogOut size={14} /> Leave Seat</button></div>);
             
             const isTargetHost = occupant.uid === roomData?.createdBy;
             if ((isHost || (isAdmin && !isTargetHost)) && occupant.uid !== currentUser.uid) {
                 return (
                    <div className="bg-[#2A2A35] border border-white/10 rounded-xl shadow-2xl p-2 flex flex-col gap-1 w-48 text-white">
                        <button onClick={() => { setViewingProfileUid(occupant.uid); setPopupInfo(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-xs font-medium rounded-lg text-left"><Eye size={14} className="text-violet-400" /> View Profile</button>
                        <button onClick={() => handleMutePeer(occupant.uid, occupant.isMuted, !!occupant.isHostMuted)} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-xs font-medium rounded-lg text-left">{occupant.isHostMuted ? <Mic size={14} className="text-emerald-400" /> : <MicOff size={14} className="text-red-400" />} {occupant.isHostMuted ? 'Unlock Mic' : 'Mute Mic (Lock)'}</button>
                        <button onClick={() => { updateParticipantData(occupant.uid, { seatIndex: -1 }); setPopupInfo(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-red-500/10 text-xs font-medium text-red-400 rounded-lg text-left"><LogOut size={14} /> Move to Audience</button>
                    </div>
                 );
             }
             return <button onClick={() => { setViewingProfileUid(occupant.uid); setPopupInfo(null); }} className="bg-[#2A2A35] text-white px-4 py-2 rounded-xl text-xs font-bold border border-white/10 hover:bg-white/5 transition-colors">View Profile</button>;
        }

        if (!occupant && (isHost || isAdmin)) { 
            const myCurrentSeat = participants.find(p => p.uid === currentUser.uid)?.seatIndex;
            const isOnAnySeat = myCurrentSeat !== undefined && myCurrentSeat >= 0;

            return (
                <div className="flex flex-col gap-1 bg-[#25252D] p-2 rounded-xl border border-white/10 shadow-xl w-32 animate-fade-in">
                    <button onClick={() => handleTakeSeat(index)} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-xs font-bold text-white rounded-lg text-left transition-colors">
                        {isOnAnySeat ? <RotateCcw size={14} className="text-blue-400"/> : <ArrowDownToLine size={14} className="text-blue-400"/>} 
                        {isOnAnySeat ? 'Switch Seat' : 'Take Seat'}
                    </button>
                    <button onClick={() => handleInviteToSeat(index)} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-xs font-bold text-white rounded-lg text-left transition-colors"><UserPlus size={14} className="text-emerald-400"/> Invite User</button>
                    <button onClick={() => toggleSeatLock(index)} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-xs font-bold text-white rounded-lg text-left transition-colors">{isLocked ? <Unlock size={14} className="text-green-400" /> : <Lock size={14} className="text-red-400" />}{isLocked ? 'Unlock' : 'Lock Seat'}</button>
                </div>
            ); 
        }

        if (index === 999) return isHost ? (<button onClick={() => handleTakeSeat(999)} className="bg-gradient-to-r from-yellow-500 to-amber-600 text-black text-xs font-bold px-4 py-2 rounded-xl shadow-xl flex items-center justify-center gap-2 whitespace-nowrap active:scale-95"><Crown size={14} /> Take Host Seat</button>) : <div className="bg-[#2A2A35] text-gray-400 px-3 py-2 rounded-xl text-xs font-bold border border-white/10">Host Only</div>;
        
        const myP = participants.find(p => p.uid === currentUser.uid);
        if (myP?.seatIndex === undefined || myP.seatIndex < 0) return (<button onClick={() => handleTakeSeat(index)} className="bg-gradient-to-tr from-violet-600 to-fuchsia-600 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-lg flex items-center justify-center gap-2 active:scale-95">Take Seat</button>);
        return <div className="bg-[#2A2A35] text-gray-400 px-3 py-2 rounded-xl text-xs font-bold border border-white/10">Already Seated</div>;
    };

    const renderSeatItem = (seat: typeof gridSeats[0]) => (
        <div key={seat.index} className="flex flex-col items-center gap-1 cursor-pointer relative" onClick={(e) => handleSeatClick(seat.index, e)}>
            <div className="relative w-14 h-14">
                <div className="w-full h-full rounded-full bg-white/5 border border-white/10 flex items-center justify-center relative overflow-hidden transition-all active:scale-95">
                    {roomData?.lockedSeats?.includes(seat.index) ? (
                        <Lock size={16} className="text-white/20" />
                    ) : seat.occupant ? (
                        <>
                            <img src={seat.occupant.photoURL || ''} className="w-full h-full object-cover" />
                            {(seat.occupant.isMuted || seat.occupant.isHostMuted) && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><MicOff size={14} className="text-white"/></div>}
                            {speakingUsers[seat.occupant.uid] && !seat.occupant.isMuted && <div className="absolute inset-0 border-2 border-green-500 rounded-full animate-pulse"></div>}
                        </>
                    ) : (
                        <Plus size={16} className="text-white/20" />
                    )}
                </div>
                {/* Avatar Frame for Grid Seats - Perfect Fit Update */}
                {seat.occupant && seat.occupant.frameUrl && (
                    <img src={seat.occupant.frameUrl} className="absolute inset-0 w-full h-full scale-[1.4] object-contain pointer-events-none z-30" />
                )}
                {seat.occupant && seat.occupant.reaction && seat.occupant.reaction.expiresAt > Date.now() && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                        <img src={seat.occupant.reaction.url} className="w-24 h-24 drop-shadow-[0_8px_16px_rgba(0,0,0,0.8)] filter brightness-110 object-contain" />
                    </div>
                )}
            </div>
            <span className="text-[10px] text-gray-200 font-bold drop-shadow-md truncate w-14 text-center">{seat.occupant ? seat.occupant.displayName : `${seat.index + 1}`}</span>
        </div>
    );
    
    return (
        <div className={`h-full w-full bg-[#050505] flex flex-col relative transition-all duration-300 ${isMinimized ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-transparent z-0 pointer-events-none" />
            <img 
                src={roomData?.backgroundImage || "https://images.unsplash.com/photo-1614850523060-8da1d56ae167?q=80&w=2070&auto=format&fit=crop"} 
                className="absolute inset-0 w-full h-full object-cover opacity-60 z-0 pointer-events-none" 
            />
            
            <div className={`absolute inset-0 z-50 pointer-events-none flex items-center justify-center bg-transparent ${currentSvga ? 'block' : 'hidden'}`}>
                <div id="svga-canvas" className="w-full h-full max-w-[500px] max-h-[500px] object-contain"></div>
            </div>

            {/* Header - Updated Padding for Notch */}
            <div className="flex items-center justify-between px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] relative z-20">
                <div className="flex items-center gap-2">
                    <button onClick={onMinimize} className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10"><Minimize2 size={20}/></button>
                    <div className="text-left flex flex-col justify-center">
                        <h2 className="text-white font-bold text-sm flex items-center gap-2">
                            {roomData?.name} 
                            {roomData?.isPaidCall && <span className="text-[10px] bg-yellow-500 text-black px-1.5 rounded font-bold uppercase">PAID</span>}
                        </h2>
                        <button onClick={() => setShowViewerList(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-black/20 rounded-full hover:bg-black/40 transition-colors border border-white/5 w-fit mt-1">
                            <Eye size={12} className="text-violet-400" />
                            <span className="text-[10px] font-bold text-white">{participants.length} Online</span>
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowRoomMenu(true)} className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors"><MoreHorizontal size={20}/></button>
                    <button onClick={() => { setShowRoomMenu(false); onLeave(); }} className="p-2 text-red-400 hover:text-red-300 rounded-full hover:bg-red-500/10"><Power size={20}/></button>
                </div>
            </div>
            <div className="relative flex-1 overflow-hidden z-10 flex flex-col">
                 <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none px-4 space-y-2">{entryNotifications.map(n => (<div key={n.id} className="animate-fade-in bg-black/40 backdrop-blur-md text-white text-[10px] px-3 py-1.5 rounded-full w-fit mx-auto border border-white/5 flex items-center gap-2 shadow-lg"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"/> {n.text}</div>))}</div>
                 {giftAnimation && (<div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none overflow-hidden"><div className="absolute inset-0 bg-radial-gradient from-violet-600/30 to-transparent animate-pulse duration-700"></div><div className="absolute inset-0 flex items-center justify-center">{[...Array(12)].map((_, i) => (<div key={i} className="absolute w-2 h-2 bg-yellow-400 rounded-full animate-[ping_1.5s_infinite]" style={{ transform: `rotate(${i * 30}deg) translate(120px) scale(${Math.random()})`, animationDelay: `${Math.random() * 0.5}s` }}></div>))}</div><div className="relative flex flex-col items-center animate-[fadeIn_0.5s_ease-out_forwards]"><div className="w-32 h-32 mb-4 filter drop-shadow-[0_20px_30px_rgba(0,0,0,0.6)] animate-[bounce_2s_infinite]"><img src={giftAnimation.icon} className="w-full h-full object-contain" /></div><div className="mt-8 bg-black/60 backdrop-blur-xl border border-white/20 px-6 py-3 rounded-full shadow-2xl animate-fade-in text-center transform scale-110"><p className="text-white font-bold text-lg leading-tight bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 via-orange-300 to-yellow-300 animate-pulse">{giftAnimation.senderName}</p><p className="text-white/80 text-xs font-medium uppercase tracking-widest mt-1">sent {giftAnimation.name}</p></div></div></div>)}
                 
                 <div className="flex-shrink-0 flex flex-col items-center mt-1 px-4 max-w-md mx-auto w-full z-10">
                    <div className="flex justify-center mb-8 relative">
                        <div className="relative group cursor-pointer w-20 h-20" onClick={(e) => handleSeatClick(999, e)}>
                            <div className="w-full h-full rounded-full border-4 border-yellow-500/30 bg-black/40 flex items-center justify-center relative overflow-hidden shadow-[0_0_30px_rgba(234,179,8,0.2)] transition-all active:scale-95">
                                {hostSeatOccupant ? (
                                    <>
                                        <img src={hostSeatOccupant.photoURL || ''} className="w-full h-full object-cover" />
                                        {(hostSeatOccupant.isMuted && !hostSeatOccupant.isHostMuted) && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><MicOff size={24} className="text-white"/></div>}
                                        {hostSeatOccupant.isHostMuted && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Lock size={24} className="text-red-500"/></div>}
                                        {speakingUsers[hostSeatOccupant.uid] && !hostSeatOccupant.isMuted && <div className="absolute inset-0 border-4 border-green-500 rounded-full animate-pulse"></div>}
                                    </>
                                ) : (
                                    <Plus size={24} className="text-yellow-500/50" />
                                )}
                            </div>
                            {/* Avatar Frame for Host Seat - Perfect Fit Update */}
                            {hostSeatOccupant && hostSeatOccupant.frameUrl && (
                                <img src={hostSeatOccupant.frameUrl} className="absolute inset-0 w-full h-full scale-[1.4] object-contain pointer-events-none z-30" />
                            )}
                            {hostSeatOccupant && hostSeatOccupant.reaction && hostSeatOccupant.reaction.expiresAt > Date.now() && (
                                <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
                                    <img src={hostSeatOccupant.reaction.url} className="w-32 h-32 drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] filter brightness-110 object-contain" />
                                </div>
                            )}
                            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg z-20 whitespace-nowrap"><Crown size={10} fill="black" /> {hostSeatOccupant ? hostSeatOccupant.displayName : 'Host Seat'}</div>
                        </div>
                    </div>
                    
                    <div className="flex justify-between w-full gap-10 px-2">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                            {[0, 1, 4, 5].map(i => renderSeatItem(gridSeats[i]))}
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                            {[2, 3, 6, 7].map(i => renderSeatItem(gridSeats[i]))}
                        </div>
                    </div>
                 </div>
                 
                 <div className="flex-1 px-4 pb-2 mt-2 mask-gradient-top overflow-y-auto no-scrollbar native-scroll space-y-2 min-h-0">{messages.map((msg) => (<div key={msg.id} className={`text-xs animate-fade-in ${msg.type === 'system' ? 'text-yellow-400 font-medium text-center bg-yellow-400/5 py-1 rounded-lg' : msg.type === 'gift' ? 'text-center my-2' : 'text-white'}`}>{msg.type === 'system' ? (msg.text) : msg.type === 'gift' ? (<div className="inline-block bg-gradient-to-r from-violet-600/80 to-fuchsia-600/80 px-3 py-1.5 rounded-full border border-white/20 backdrop-blur-sm shadow-lg"><span className="font-bold text-white">{msg.senderName}</span> <span className="text-white/90">{msg.text}</span></div>) : (<div className="flex items-start gap-2 bg-black/40 p-2 rounded-xl w-fit max-w-[85%] backdrop-blur-sm border border-white/5"><div className="relative w-5 h-5"><img src={msg.senderPhoto || `https://ui-avatars.com/api/?name=${msg.senderName}`} className="w-full h-full rounded-full object-cover" /></div><div><span className="font-bold text-gray-400 mr-1.5 block leading-tight mb-0.5">{msg.senderName}</span><span className="text-gray-100 leading-snug">{msg.text}</span></div></div>)}</div>))}<div ref={chatEndRef} /></div>
            </div>
            {showStickerPicker && (<div className="absolute bottom-20 left-4 right-4 z-40 bg-[#18181B] border border-white/10 rounded-2xl p-4 shadow-2xl animate-fade-in"><div className="flex justify-between items-center mb-3"><h3 className="text-xs font-bold text-white uppercase tracking-wider">Stickers</h3><button onClick={() => setShowStickerPicker(false)}><XIcon size={16} className="text-gray-400"/></button></div>{stickers.length === 0 ? (<p className="text-center text-gray-500 text-xs py-4">No stickers available.</p>) : (<div className="grid grid-cols-5 gap-3 max-h-40 overflow-y-auto no-scrollbar native-scroll">{stickers.map(sticker => (<button key={sticker.id} onClick={() => handleSendSticker(sticker)} className="hover:bg-white/5 p-1 rounded-lg transition-colors flex items-center justify-center"><img src={sticker.url} className="w-10 h-10 object-contain" alt={sticker.name} /></button>))}</div>)}</div>)}
            <div className="px-3 pb-4 pt-2 relative z-30 flex items-center gap-2">
                <button onClick={() => setShowGiftModal(true)} className="p-2.5 bg-black/40 backdrop-blur-md border border-white/10 text-pink-400 rounded-full active:scale-95 flex-shrink-0 shadow-lg"><Gift size={20} /></button>
                <button onClick={toggleSpeaker} className={`p-2.5 rounded-full flex-shrink-0 backdrop-blur-md shadow-lg transition-all ${isSpeakerOn ? 'bg-white text-black' : 'bg-black/40 text-white border border-white/10'}`}>
                    {isSpeakerOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
                </button>
                
                {roomData?.musicState?.isEnabled && (<button onClick={() => setShowMusicModal(true)} className={`p-2.5 rounded-full flex-shrink-0 transition-all backdrop-blur-md shadow-lg ${roomData.musicState.isPlaying ? 'bg-violet-500 shadow-[0_0_15px_rgba(139,92,246,0.5)] animate-pulse-glow text-white' : 'bg-black/40 border border-white/10 text-white'}`}><Music2 size={20} /></button>)}
                <div className="flex-1 relative shadow-lg flex items-center bg-black/40 backdrop-blur-md border border-white/10 rounded-full pl-2 pr-2 py-1.5"><button onClick={() => setShowStickerPicker(!showStickerPicker)} className="p-1.5 text-yellow-400 hover:text-yellow-300 rounded-full transition-colors active:scale-95"><Smile size={20} /></button><form onSubmit={handleSendMessage} className="flex-1 flex items-center"><input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Say something..." className="w-full bg-transparent border-none outline-none pl-2 pr-2 py-1 text-xs text-white placeholder-gray-400" /><button type="submit" disabled={!newMessage.trim()} className="p-1.5 bg-violet-600 rounded-full text-white disabled:opacity-50 flex-shrink-0 ml-1"><Send size={12} fill="currentColor" /></button></form></div>{isOnSeat && (<button onClick={toggleMute} disabled={myPart?.isHostMuted} className={`p-2.5 rounded-full transition-all active:scale-95 border flex-shrink-0 shadow-lg backdrop-blur-md ${isMuted ? 'bg-black/40 text-white border-white/10' : 'bg-white text-black border-white shadow-[0_0_10px_rgba(255,255,255,0.4)]'}`}>{myPart?.isHostMuted ? <Lock size={20} className="text-red-500" /> : isMuted ? <MicOff size={20} /> : <Mic size={20} />}</button>)}</div>
            
            {showViewerList && (<div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md p-4 animate-fade-in" onClick={() => setShowViewerList(false)}><div className="bg-[#18181B] h-full w-full max-w-sm mx-auto rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}><div className="p-4 border-b border-white/5 flex justify-between items-center"><h3 className="font-bold text-white flex items-center gap-2"><Users size={18} /> Viewers ({participants.length})</h3><button onClick={() => setShowViewerList(false)}><XIcon size={20} className="text-gray-400" /></button></div><div className="flex-1 overflow-y-auto p-2 space-y-2 native-scroll">{sortedViewerList.map(p => (<div key={p.uid} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5" onClick={() => setViewingProfileUid(p.uid)}><div className="flex items-center gap-3"><div className="relative w-10 h-10"><img src={p.photoURL || ''} className="w-full h-full rounded-full bg-gray-800 object-cover" /></div><div><p className="font-bold text-sm text-white flex items-center gap-1">{p.displayName}{p.uid === roomData?.createdBy && <Crown size={12} className="text-yellow-500" fill="currentColor" />}{roomData?.admins?.includes(p.uid) && <ShieldCheck size={12} className="text-violet-500" />}</p><p className="text-[10px] text-gray-400">{p.seatIndex === 999 ? 'Host' : p.seatIndex >= 0 ? `Seat ${p.seatIndex + 1}` : 'Audience'}</p></div></div>{(isHost || isAdmin) && p.uid !== currentUser.uid && p.uid !== roomData?.createdBy && (<div className="flex gap-2">{p.seatIndex >= 0 && (<button onClick={(e) => { e.stopPropagation(); updateParticipantData(p.uid, { seatIndex: -1 }); }} className="p-2 bg-red-500/10 text-red-500 rounded-lg"><LogOut size={14}/></button>)}<button onClick={(e) => { e.stopPropagation(); setViewingProfileUid(p.uid); }} className="p-2 bg-white/10 text-white rounded-lg"><MoreHorizontal size={14}/></button></div>)}</div>))}</div></div></div>)}
            {viewingProfileUid && currentUser && (<UserProfileModal targetUid={viewingProfileUid} currentUser={currentUser} onClose={() => setViewingProfileUid(null)} isViewerHost={isHost} isViewerAdmin={isAdmin} roomAdmins={roomData?.admins || []} roomId={roomId} currentParticipants={participants} roomCreatorId={roomData?.createdBy || ''} />)}
            {/* ... Other modals are assumed to be here as standard ... */}
            {/* Re-injecting showShareModal, showSettingsModal, showGiftModal, showRoomMenu, showMusicModal, popupInfo, showInviteList, incomingInvite for file completeness as requested */}
            {showShareModal && (<div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowShareModal(false)}><div className="bg-[#18181B] w-full max-w-sm rounded-[2rem] border border-white/10 p-6 shadow-2xl" onClick={e => e.stopPropagation()}><div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-6"></div><h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Share2 size={20} className="text-violet-400"/> Share Room</h3><div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 native-scroll">{recentChats.length === 0 ? (<p className="text-center text-gray-500 text-sm py-4">No recent chats.</p>) : (recentChats.map(chat => { const otherUser = chat.participantDetails.find(p => p.uid !== currentUser.uid); return (<button key={chat.id} onClick={() => inviteUserToRoom(chat.id)} className="w-full flex items-center justify-between p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"><div className="flex items-center gap-3"><div className="relative w-10 h-10"><img src={otherUser?.photoURL || ''} className="w-full h-full rounded-full bg-gray-800 object-cover" /></div><div className="text-left"><p className="font-bold text-sm text-white">{otherUser?.displayName}</p><p className="text-[10px] text-gray-400">Send Invite</p></div></div><div className="p-2 bg-violet-500/20 text-violet-400 rounded-lg"><Send size={16}/></div></button>) }))}</div></div></div>)}
            {showSettingsModal && (<div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowSettingsModal(false)}><div className="bg-[#18181B] w-full max-w-sm rounded-[2rem] border border-white/10 p-6 shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}><div className="flex justify-between items-center mb-6"><h3 className="text-lg font-bold text-white flex items-center gap-2"><Settings size={20} className="text-gray-400"/> Room Settings</h3><button onClick={() => setShowSettingsModal(false)}><XIcon size={20} className="text-gray-500"/></button></div><div className="space-y-6 overflow-y-auto pr-2 no-scrollbar native-scroll"><div><label className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Room Name</label><input type="text" value={settingsName} onChange={(e) => setSettingsName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 mt-1 text-sm text-white outline-none focus:border-violet-500" /></div><div><label className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Password (Optional)</label><input type="text" value={settingsPassword} onChange={(e) => setSettingsPassword(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 mt-1 text-sm text-white outline-none focus:border-violet-500" placeholder="4-digit code" /></div><div><label className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-2 block">Choose Background</label><div className="grid grid-cols-2 gap-3">{availableBackgrounds.map(bg => (<button key={bg.id} onClick={() => setSettingsBg(bg.url)} className={`relative rounded-xl overflow-hidden border-2 aspect-video transition-all ${settingsBg === bg.url ? 'border-violet-500 scale-95 ring-2 ring-violet-500/30' : 'border-transparent hover:border-white/20'}`}><img src={bg.url} className="w-full h-full object-cover" />{settingsBg === bg.url && <div className="absolute inset-0 bg-violet-600/20 flex items-center justify-center"><CheckCircle2 size={24} className="text-white drop-shadow-lg" /></div>}</button>))}</div></div></div><button onClick={saveRoomSettings} className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-4 rounded-xl mt-6 shadow-lg shadow-violet-500/20">Save Changes</button></div></div>)}
            {showGiftModal && (<div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end animate-fade-in" onClick={() => setShowGiftModal(false)}><div className="bg-[#18181B] rounded-t-[2rem] border-t border-white/10 p-6 shadow-2xl" onClick={e => e.stopPropagation()}><div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-6"></div><div className="flex justify-between items-end mb-4"><div><h3 className="text-lg font-bold text-white">Send Gift</h3><p className="text-xs text-gray-400">To: {participants.find(p => p.uid === giftRecipientId)?.displayName || 'Select User'}</p></div><div className="bg-yellow-500/10 px-3 py-1.5 rounded-full border border-yellow-500/20 text-yellow-500 text-xs font-bold flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500"></span>{currentUser.walletBalance || 0}</div></div><div className="flex gap-4 overflow-x-auto pb-4 mb-4 no-scrollbar native-scroll">{participants.map(p => (<button key={p.uid} onClick={() => setGiftRecipientId(p.uid)} className={`flex flex-col items-center gap-2 min-w-[60px] transition-all ${giftRecipientId === p.uid ? 'opacity-100 scale-105' : 'opacity-50 hover:opacity-80'}`}><div className={`relative p-0.5 rounded-full ${giftRecipientId === p.uid ? 'bg-gradient-to-tr from-pink-500 to-violet-500' : 'bg-transparent'}`}><div className="relative w-12 h-12"><img src={p.photoURL || ''} className="w-full h-full rounded-full bg-gray-800 object-cover border-2 border-[#18181B]" /></div></div><span className="text-[10px] text-white font-medium truncate w-14 text-center">{p.displayName}</span></button>))}</div><div className="grid grid-cols-4 gap-3 max-h-[40vh] overflow-y-auto p-1 native-scroll">{gifts.length > 0 ? gifts.map(gift => (<button key={gift.id} onClick={() => handleGiftClick(gift)} className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/10 active:scale-95"><img src={gift.iconUrl} className="w-10 h-10 object-contain mb-1 filter drop-shadow-lg" /><span className="text-[10px] font-bold text-gray-300">{gift.name}</span><span className="text-[10px] font-mono text-yellow-500">{gift.price}</span></button>)) : <p className="col-span-4 text-center text-gray-500 text-xs">No gifts available.</p>}</div></div></div>)}
            {showRoomMenu && (<div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex justify-end" onClick={() => setShowRoomMenu(false)}><div className="w-64 h-full bg-[#18181B] border-l border-white/10 p-6 animate-fade-in shadow-2xl" onClick={e => e.stopPropagation()}><h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Room Menu</h3><div className="space-y-2">{(isHost || isAdmin) && (<MenuButton icon={musicEnabled ? <VolumeX size={20} /> : <Volume2 size={20} />} label={musicEnabled ? "Disable Music" : "Enable Music"} onClick={toggleMusicVisibility} />)}<MenuButton icon={<Share2 size={20} />} label="Share Room" onClick={handleShareClick} />{(isHost || isAdmin) && (<MenuButton icon={<Lock size={20} />} label="Room Settings" onClick={() => { setShowSettingsModal(true); setShowRoomMenu(false); }} />)}</div></div></div>)}
            {showMusicModal && roomData?.musicState?.isEnabled && (<div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end animate-fade-in" onClick={() => setShowMusicModal(false)}><div className="bg-[#18181B] rounded-t-[2rem] border-t border-white/10 p-6 shadow-2xl h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}><div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-6"></div><div className="flex bg-black/40 rounded-xl p-1 mb-6"><button onClick={() => setMusicTab('player')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${musicTab === 'player' ? 'bg-violet-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Player</button><button onClick={() => setMusicTab('queue')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${musicTab === 'queue' ? 'bg-violet-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Queue</button>{(isHost || isAdmin) && <button onClick={() => setMusicTab('search')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${musicTab === 'search' ? 'bg-violet-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Search</button>}</div><div className="flex-1 overflow-y-auto native-scroll">{musicTab === 'player' && (<div className="flex flex-col items-center justify-center h-full pb-10"><div className={`w-48 h-48 rounded-full border-8 border-[#25252D] bg-gradient-to-tr from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-[0_0_50px_rgba(139,92,246,0.3)] mb-8 relative ${musicPlaying ? 'animate-[spin_10s_linear_infinite]' : ''}`}><div className="w-16 h-16 bg-[#18181B] rounded-full border-4 border-[#25252D] z-10"></div><Disc3 size={100} className="absolute text-white/20" /></div><h3 className="text-xl font-bold text-white text-center px-4 line-clamp-1">{roomData.musicState.currentSongName || "No song"}</h3><p className="text-xs text-gray-400 mb-8">Added by {participants.find(p => p.uid === roomData?.musicState?.playedBy)?.displayName || 'Unknown'}</p>{(isHost || isAdmin) && (<div className="flex items-center gap-6"><button onClick={togglePlayPause} className="w-16 h-16 bg-white text-black rounded-full flex items-center justify-center shadow-xl hover:scale-105 transition-transform active:scale-95">{musicPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}</button><button onClick={playNextSong} className="p-4 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"><SkipForward size={24} /></button></div>)}</div>)}{musicTab === 'queue' && (<div className="space-y-2">{(!roomData.musicState.queue || roomData.musicState.queue.length === 0) ? (<p className="text-center text-gray-500 text-xs py-10">Queue empty.</p>) : (roomData.musicState.queue.map((song, i) => (<div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5"><div className="flex items-center gap-3 overflow-hidden"><div className="w-8 h-8 rounded bg-violet-500/20 flex items-center justify-center text-violet-400 text-xs font-bold">{i + 1}</div><div className="min-w-0"><p className="text-sm font-bold text-white truncate">{song.name}</p><p className="text-[10px] text-gray-400 truncate">by {song.addedByName}</p></div></div>{(isHost || isAdmin) && (<button onClick={() => removeFromQueue(song)} className="p-2 text-red-400 hover:bg-white/5 rounded-lg"><XIcon size={14}/></button>)}</div>)))}</div>)}{musicTab === 'search' && (<div className="space-y-4"><form onSubmit={searchMusic} className="flex gap-2"><input type="text" value={musicSearchQuery} onChange={(e) => setMusicSearchQuery(e.target.value)} placeholder="Search..." className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none" /><button type="submit" disabled={isSearchingMusic} className="bg-violet-600 px-4 rounded-xl text-white disabled:opacity-50"><Search size={20}/></button></form><div className="flex items-center gap-2"><div className="h-px bg-white/10 flex-1"></div><span className="text-[10px] text-gray-500 uppercase">OR</span><div className="h-px bg-white/10 flex-1"></div></div><button onClick={() => musicInputRef.current?.click()} disabled={isUploadingMusic} className="w-full py-3 bg-white/5 border border-white/10 border-dashed rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center gap-2">{isUploadingMusic ? <Loader2 className="animate-spin" size={16}/> : <Upload size={16}/>} Upload MP3</button><input type="file" ref={musicInputRef} accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if(f) uploadAndPlaySong(f); }} /><div className="space-y-2 mt-4">{musicSearchResults.map(track => (<div key={track.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5"><div className="flex items-center gap-3 overflow-hidden"><img src={track.image} className="w-10 h-10 rounded bg-gray-800 object-cover" /><div className="min-w-0"><p className="text-sm font-bold text-white truncate">{track.name}</p><p className="text-[10px] text-gray-400 truncate">{track.artist_name}</p></div></div><button onClick={() => addTrackToQueue(track)} className="p-2 bg-violet-600 text-white rounded-lg hover:bg-violet-500"><Plus size={16}/></button></div>))}</div></div>)}</div></div></div>)}
            {popupInfo && (<div className="fixed inset-0 z-[100] bg-transparent" onClick={() => setPopupInfo(null)}><div className="absolute z-[100]" style={{ top: popupInfo.rect.bottom + 8, left: popupInfo.rect.left + (popupInfo.rect.width / 2), transform: 'translateX(-50%)' }} onClick={(e) => e.stopPropagation()}>{renderPopupContent()}</div></div>)}
            {showInviteList && (<div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowInviteList(false)}><div className="bg-[#18181B] w-full max-w-sm rounded-[2rem] border border-white/10 p-6 shadow-2xl" onClick={e => e.stopPropagation()}><h3 className="text-lg font-bold text-white mb-4">Invite to Seat</h3><div className="space-y-2 max-h-[50vh] overflow-y-auto native-scroll">{participants.filter(p => p.seatIndex < 0 && p.uid !== currentUser.uid).length === 0 ? (<p className="text-center text-gray-500 text-xs py-4">No users in audience.</p>) : (participants.filter(p => p.seatIndex < 0 && p.uid !== currentUser.uid).map(p => (<button key={p.uid} onClick={() => sendInvite(p.uid)} className="w-full flex items-center justify-between p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"><div className="flex items-center gap-3"><div className="relative w-10 h-10"><img src={p.photoURL || ''} className="w-full h-full rounded-full bg-gray-800 object-cover" /></div><span className="font-bold text-sm text-white">{p.displayName}</span></div><div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg"><Plus size={16}/></div></button>)))}</div></div></div>)}
            {incomingInvite && (<div className="absolute top-20 left-4 right-4 z-50 bg-[#1A1A21] border border-violet-500/50 p-4 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-4"><div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400"><Crown size={20} /></div><div><p className="font-bold text-white text-sm">Seat Invitation</p><p className="text-xs text-gray-400">{incomingInvite.fromName} invited you to Seat {incomingInvite.seatIndex + 1}</p></div></div><div className="flex gap-3"><button onClick={acceptInvite} className="flex-1 bg-violet-600 hover:bg-violet-500 text-white py-2 rounded-xl text-xs font-bold">Accept</button><button onClick={declineInvite} className="flex-1 bg-white/5 hover:bg-white/10 text-gray-400 py-2 rounded-xl text-xs font-bold">Decline</button></div></div>)}
            <div className="hidden">{Object.entries(remoteStreams).map(([uid, stream]) => { const p = participants.find(part => part.uid === uid); const shouldMute = p ? (p.isMuted || p.isHostMuted || !isSpeakerOn) : true; return <RemoteAudio key={uid} stream={stream} muted={shouldMute} />; })}</div>
        </div>
    );
};