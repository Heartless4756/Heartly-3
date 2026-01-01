
import React, { useEffect, useState, useRef } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, onSnapshot, updateDoc, writeBatch, getDocs } from 'firebase/firestore';
import { Auth } from './components/Auth';
import { VoiceRooms } from './components/VoiceRooms';
import { ActiveRoom } from './components/Room';
import { Profile } from './components/Profile';
import { Navigation } from './components/Navigation';
import { Chat } from './components/Chat';
import { CallListeners } from './components/CallListeners';
import { ViewState, UserProfile, ChatMetadata, Room } from './types';

// Cache keys
const CACHE_KEY_AUTH = 'heartly_cached_auth_user';
const CACHE_KEY_PROFILE = 'heartly_cached_profile';

const App: React.FC = () => {
  // 1. Initialize State from Local Storage (INSTANT LOAD)
  // We mock a Firebase User object structure for the initial render
  const [user, setUser] = useState<User | any>(() => {
      const cached = localStorage.getItem(CACHE_KEY_AUTH);
      return cached ? JSON.parse(cached) : null;
  });

  const [dbUser, setDbUser] = useState<UserProfile | null>(() => {
      const cached = localStorage.getItem(CACHE_KEY_PROFILE);
      return cached ? JSON.parse(cached) : null;
  });

  // Only show loading spinner if we have NO cached data
  const [loading, setLoading] = useState(() => {
      return !localStorage.getItem(CACHE_KEY_AUTH);
  });
  
  // -- STATE PERSISTENCE & INITIALIZATION --
  
  // Initialize View from LocalStorage
  const [currentView, setCurrentView] = useState<ViewState>(() => {
      const saved = localStorage.getItem('heartly_currentView');
      return (saved as ViewState) || 'rooms';
  });
  
  // Initialize Room State from LocalStorage
  const [activeRoomId, setActiveRoomId] = useState<string | null>(() => {
      return localStorage.getItem('heartly_activeRoomId');
  });
  
  const [isRoomMinimized, setIsRoomMinimized] = useState<boolean>(() => {
      return localStorage.getItem('heartly_isRoomMinimized') === 'true';
  });

  const [profileVersion, setProfileVersion] = useState(0);
  const [totalUnread, setTotalUnread] = useState(0);
  
  const previousUnreadRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // -- PERSISTENCE EFFECTS --
  
  useEffect(() => {
      localStorage.setItem('heartly_currentView', currentView);
  }, [currentView]);

  useEffect(() => {
      if (activeRoomId) {
          localStorage.setItem('heartly_activeRoomId', activeRoomId);
      } else {
          localStorage.removeItem('heartly_activeRoomId');
      }
  }, [activeRoomId]);

  useEffect(() => {
      localStorage.setItem('heartly_isRoomMinimized', String(isRoomMinimized));
  }, [isRoomMinimized]);

  // -- INITIALIZATION & HISTORY RESTORATION --

  useEffect(() => {
    // Request notification permission on mount
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
    // Preload notification sound (subtle pop)
    audioRef.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2346/2346-preview.mp3");
    
    // HISTORY RECONSTRUCTION
    if (activeRoomId) {
        window.history.replaceState({ view: currentView }, '');
        window.history.pushState({ view: currentView, roomId: activeRoomId }, '');
    } else {
        if (!window.history.state) {
            window.history.replaceState({ view: currentView }, '');
        }
    }
  }, []); 

  // 1. Auth Listener (Network)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // User is logged in
        setUser(currentUser);
        // Update Cache with minimal necessary data
        const serializableUser = {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
            phoneNumber: currentUser.phoneNumber
        };
        localStorage.setItem(CACHE_KEY_AUTH, JSON.stringify(serializableUser));
      } else {
        // User is logged out
        setUser(null);
        setDbUser(null);
        setLoading(false);
        // Clear Cache
        localStorage.removeItem(CACHE_KEY_AUTH);
        localStorage.removeItem(CACHE_KEY_PROFILE);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-time User Profile Listener
  useEffect(() => {
    if (!user?.uid) return;

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribeSnapshot = onSnapshot(userDocRef, async (docSnap) => {
        if (docSnap.exists()) {
            const userData = docSnap.data() as UserProfile;
            
            // CHECK BAN STATUS
            if (userData.isBanned) {
                await signOut(auth);
                alert("This account has been banned by the administrator.");
                setDbUser(null);
                setLoading(false);
                localStorage.removeItem(CACHE_KEY_AUTH);
                localStorage.removeItem(CACHE_KEY_PROFILE);
                return;
            }

            // Legacy check: Ensure uniqueId exists
            if (!userData.uniqueId) {
                const uniqueId = Math.random().toString(36).substring(2, 6).toUpperCase();
                await setDoc(userDocRef, { ...userData, uniqueId }, { merge: true });
            } else {
                setDbUser(userData);
                // Update Profile Cache
                localStorage.setItem(CACHE_KEY_PROFILE, JSON.stringify(userData));
                setLoading(false); // Ensure loading is off once we have data
            }
        } else {
            // Create profile if missing (rare case)
            const uniqueId = Math.random().toString(36).substring(2, 6).toUpperCase();
            const newUserProfile = {
                uid: user.uid,
                displayName: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                uniqueId: uniqueId,
                bio: '',
                followers: [],
                following: [],
                walletBalance: 0
            };
            // Don't await this for the UI update to be faster, but do it
            setDoc(userDocRef, newUserProfile);
            setDbUser(newUserProfile);
            localStorage.setItem(CACHE_KEY_PROFILE, JSON.stringify(newUserProfile));
            setLoading(false);
        }
    }, (error) => {
        console.error("User snapshot error:", error);
        // If network fails but we have cache, we are fine. 
        // If no cache and network fails, stop loading
        if (loading) setLoading(false);
    });

    return () => unsubscribeSnapshot();
  }, [user?.uid]);

  // Global Listener for Unread Messages (Notifications)
  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, 'chats'), 
      where('participants', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let count = 0;
      let hasNewMessage = false;

      snapshot.docs.forEach(doc => {
        const data = doc.data() as ChatMetadata;
        const myUnread = data.unreadCounts?.[user.uid] || 0;
        count += myUnread;
      });

      if (count > previousUnreadRef.current) {
         hasNewMessage = true;
      }
      previousUnreadRef.current = count;
      setTotalUnread(count);

      if (hasNewMessage && currentView !== 'chats' && (!activeRoomId || isRoomMinimized)) {
         audioRef.current?.play().catch(() => {});
         if (document.hidden && Notification.permission === "granted") {
            new Notification("Heartly", {
                body: "You have a new message!",
                icon: "/icon.png" 
            });
         }
      }
    });

    return () => unsubscribe();
  }, [user?.uid, currentView, activeRoomId, isRoomMinimized]);

  // --- Back Button Handling Logic ---
  useEffect(() => {
      const handlePopState = (event: PopStateEvent) => {
          if (activeRoomId) {
              setActiveRoomId(null);
              setIsRoomMinimized(false);
              return;
          }
          const state = event.state;
          if (state && state.view) {
              setCurrentView(state.view);
          } else {
              setCurrentView('rooms');
          }
      };

      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
  }, [activeRoomId]);

  const handleLogout = async () => {
    await signOut(auth);
    setDbUser(null);
    localStorage.removeItem('heartly_currentView');
    localStorage.removeItem('heartly_activeRoomId');
    localStorage.removeItem('heartly_isRoomMinimized');
    localStorage.removeItem(CACHE_KEY_AUTH);
    localStorage.removeItem(CACHE_KEY_PROFILE);
  };

  const handleProfileUpdate = async () => {
    setProfileVersion(prev => prev + 1);
    
    if (!user?.uid) return;

    const userDocRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userDocRef);
    if (!snap.exists()) return;
    const latestData = snap.data() as UserProfile;
    
    // Update local cache immediately
    localStorage.setItem(CACHE_KEY_PROFILE, JSON.stringify(latestData));

    // Update Active Room Participant Data
    if (activeRoomId) {
        const roomRef = doc(db, 'rooms', activeRoomId);
        const roomSnap = await getDoc(roomRef);
        if (roomSnap.exists()) {
            const roomData = roomSnap.data() as Room;
            const updatedParticipants = roomData.participants.map(p => {
                if (p.uid === user.uid) {
                    return { 
                        ...p, 
                        photoURL: latestData.photoURL, 
                        displayName: latestData.displayName || p.displayName 
                    };
                }
                return p;
            });
            await updateDoc(roomRef, { participants: updatedParticipants });
        }
    }

    // Update Chats Participant Details
    const chatsQuery = query(collection(db, 'chats'), where('participants', 'array-contains', user.uid));
    const chatSnaps = await getDocs(chatsQuery);
    const batch = writeBatch(db);
    
    chatSnaps.forEach(c => {
        const data = c.data() as ChatMetadata;
        const newDetails = data.participantDetails.map(p => 
            p.uid === user.uid 
            ? { ...p, photoURL: latestData.photoURL, displayName: latestData.displayName || p.displayName } 
            : p
        );
        batch.update(c.ref, { participantDetails: newDetails });
    });

    if (!chatSnaps.empty) {
        await batch.commit().catch(e => console.error("Batch update failed", e));
    }
  };

  const handleSetCurrentView = (view: ViewState) => {
      if (view === currentView) return;
      window.history.pushState({ view }, '');
      setCurrentView(view);
  };

  const handleJoinRoom = (id: string) => {
      window.history.pushState({ view: currentView, roomId: id }, '');
      setActiveRoomId(id);
      setIsRoomMinimized(false);
  };

  const handleLeaveRoom = () => {
      if (window.history.state && window.history.state.roomId) {
          window.history.back();
      } else {
          setActiveRoomId(null);
          setIsRoomMinimized(false);
      }
  };

  if (loading) {
    return (
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-[#020205] relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-20%] w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[600px] h-[600px] bg-fuchsia-600/10 rounded-full blur-[120px] animate-pulse" />

        <div className="relative z-10 flex flex-col items-center animate-fade-in">
           <div className="relative w-28 h-28 bg-[#0A0A0F] rounded-full border border-white/10 flex items-center justify-center shadow-2xl animate-float">
               <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                   <defs>
                       <linearGradient id="splashLogoGrad" x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse">
                           <stop stopColor="#A78BFA"/>
                           <stop offset="1" stopColor="#F472B6"/>
                       </linearGradient>
                   </defs>
                   <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="url(#splashLogoGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_0_10px_rgba(167,139,250,0.6)]"/>
                   <path d="M12 7V13" stroke="url(#splashLogoGrad)" strokeWidth="1.5" strokeLinecap="round" className="drop-shadow-[0_0_10px_rgba(167,139,250,0.6)]" />
                   <path d="M9 9V11" stroke="url(#splashLogoGrad)" strokeWidth="1.5" strokeLinecap="round" className="drop-shadow-[0_0_10px_rgba(167,139,250,0.6)]" />
                   <path d="M15 9V11" stroke="url(#splashLogoGrad)" strokeWidth="1.5" strokeLinecap="round" className="drop-shadow-[0_0_10px_rgba(167,139,250,0.6)]" />
               </svg>
           </div>
           
           <h1 className="mt-8 text-2xl font-bold text-white tracking-widest uppercase opacity-80 animate-pulse">
               Heartly Voice
           </h1>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  const getEffectiveProfile = (fbUser: User | any): UserProfile => {
    // If we have dbUser (cached or fresh), merge it. Otherwise use auth data.
    return {
        uid: fbUser.uid,
        email: fbUser.email,
        displayName: dbUser?.displayName || fbUser.displayName || 'User',
        photoURL: dbUser?.photoURL || fbUser.photoURL,
        uniqueId: dbUser?.uniqueId,
        bio: dbUser?.bio,
        followers: dbUser?.followers || [],
        following: dbUser?.following || [],
        walletBalance: dbUser?.walletBalance || 0,
        isAuthorizedListener: dbUser?.isAuthorizedListener,
        isBanned: dbUser?.isBanned,
        blockedUsers: dbUser?.blockedUsers || []
    };
  };

  const userProfile = getEffectiveProfile(user);

  const renderView = () => {
    switch (currentView) {
      case 'rooms':
        return (
          <VoiceRooms 
            currentUser={userProfile} 
            onJoinRoom={handleJoinRoom} 
          />
        );
      case 'listeners':
        return (
          <CallListeners
            currentUser={userProfile} 
            onJoinRoom={handleJoinRoom}
          />
        );
      case 'chats':
        return (
          <Chat 
            currentUser={userProfile} 
            onJoinRoom={handleJoinRoom}
          />
        );
      case 'me':
        return (
          <Profile 
            user={userProfile} 
            onLogout={handleLogout} 
            onUpdate={handleProfileUpdate}
            onJoinRoom={handleJoinRoom}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col max-w-md mx-auto bg-[#050505] shadow-2xl shadow-black overflow-hidden relative border-x border-white/5 pt-safe">
      <div className="absolute inset-0 z-0 flex flex-col pt-safe">
          <div className="flex-1 overflow-hidden relative"> 
            {renderView()}
          </div>
          <Navigation currentView={currentView} setView={handleSetCurrentView} unreadCount={totalUnread} />
      </div>

      {activeRoomId && (
        <div className={`absolute inset-0 z-50 transition-all duration-300 flex flex-col pt-safe ${isRoomMinimized ? 'bg-transparent pointer-events-none' : 'bg-[#181818]'}`}>
          <ActiveRoom 
            roomId={activeRoomId} 
            currentUser={userProfile} 
            onLeave={handleLeaveRoom}
            isMinimized={isRoomMinimized}
            onMinimize={() => setIsRoomMinimized(!isRoomMinimized)}
          />
        </div>
      )}
    </div>
  );
};

export default App;
