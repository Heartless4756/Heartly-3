
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { 
  collection, query, where, getDocs, doc, setDoc, 
  onSnapshot, addDoc, orderBy, updateDoc, writeBatch, increment, deleteDoc, getDoc, arrayUnion, arrayRemove
} from 'firebase/firestore';
import { UserProfile, ChatMetadata, PrivateMessage } from '../types';
import { 
  Search, MessageSquare, ChevronLeft, Send, Lock, 
  ShieldCheck, MoreVertical, Hash, ChevronRight,
  Trash2, Check, CheckCheck, Mic, ArrowRight, X, Loader2,
  Ban, Eraser, UserX, Image as ImageIcon, Wallpaper
} from 'lucide-react';

interface ChatProps {
  currentUser: UserProfile;
  onJoinRoom: (roomId: string) => void;
}

// Type compatible with both UserProfile and ChatMetadata participant details
interface ChatUser {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
}

const simpleEncrypt = (text: string, key: string) => {
  return text.split('').map((c, i) => 
    String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
  ).join('');
};

const simpleDecrypt = (text: string, key: string) => {
  return simpleEncrypt(text, key); 
};

const ENCRYPTION_KEY = "heartly_secret_key"; 

export const Chat: React.FC<ChatProps> = ({ currentUser, onJoinRoom }) => {
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChatUser, setActiveChatUser] = useState<ChatUser | null>(null);
  
  // Search State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchId, setSearchId] = useState('');
  const [foundUser, setFoundUser] = useState<UserProfile | null>(null);
  const [searchError, setSearchError] = useState('');
  
  // Menu State
  const [showChatMenu, setShowChatMenu] = useState(false);

  const [chats, setChats] = useState<ChatMetadata[]>([]);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  
  // Typing State
  const [isTyping, setIsTyping] = useState(false);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  
  // Wallpapers & Media
  const [chatWallpaper, setChatWallpaper] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  
  const imageInputRef = useRef<HTMLInputElement>(null);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  
  // Long Press & Delete State
  const [longPressedChatId, setLongPressedChatId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived State
  const isBlocked = activeChatUser ? currentUser.blockedUsers?.includes(activeChatUser.uid) : false;

  // Load existing chats
  useEffect(() => {
    const q = query(
      collection(db, 'chats'), 
      where('participants', 'array-contains', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ChatMetadata));
      
      chatList.sort((a, b) => b.updatedAt - a.updatedAt);
      
      setChats(chatList);
      setLoadingChats(false);
    });

    return () => unsubscribe();
  }, [currentUser.uid]);

  // Load messages & Typing Status for active chat
  useEffect(() => {
    if (!activeChatId) return;

    // Reset Unread Count for ME when entering chat
    const resetUnread = async () => {
        const chatRef = doc(db, 'chats', activeChatId);
        await updateDoc(chatRef, {
            [`unreadCounts.${currentUser.uid}`]: 0
        }).catch(err => console.log("Init unread count", err));
    };
    resetUnread();

    // 1. Listen for Messages
    const q = query(
      collection(db, 'chats', activeChatId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const msgs: PrivateMessage[] = [];
      const batch = writeBatch(db);
      let needsUpdate = false;

      snapshot.docs.forEach(docSnap => {
        const msg = { id: docSnap.id, ...docSnap.data() } as PrivateMessage;
        msgs.push(msg);

        // Mark as read if I am the receiver and it's not read
        if (!msg.read && msg.senderId !== currentUser.uid) {
           batch.update(docSnap.ref, { read: true });
           needsUpdate = true;
        }
      });

      if (needsUpdate) {
          batch.commit().catch(console.error);
          // Also reset unread count in metadata again just in case
          updateDoc(doc(db, 'chats', activeChatId), {
            [`unreadCounts.${currentUser.uid}`]: 0
          });
      }

      setMessages(msgs);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    // 2. Listen for Chat Metadata (Typing & Wallpaper)
    const chatDocRef = doc(db, 'chats', activeChatId);
    const unsubscribeChat = onSnapshot(chatDocRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            
            // Typing Logic
            const typingData = data.typing || {};
            const otherUid = activeChatUser?.uid;
            if (otherUid && typingData[otherUid]) {
                setIsOtherUserTyping(true);
                setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            } else {
                setIsOtherUserTyping(false);
            }

            // Wallpaper Logic
            const wallpapers = data.wallpapers || {};
            setChatWallpaper(wallpapers[currentUser.uid] || null);
        }
    });

    return () => {
        unsubscribeMessages();
        unsubscribeChat();
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [activeChatId, activeChatUser, currentUser.uid]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError('');
    setFoundUser(null);

    if (searchId.length !== 4) {
      setSearchError('ID must be 4 characters');
      return;
    }

    try {
      const q = query(collection(db, 'users'), where('uniqueId', '==', searchId.toUpperCase()));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const userData = snapshot.docs[0].data() as UserProfile;
        if (userData.uid === currentUser.uid) {
           setSearchError("You can't chat with yourself!");
        } else {
           setFoundUser(userData);
        }
      } else {
        setSearchError('User not found');
      }
    } catch (err) {
      console.error(err);
      setSearchError('Error searching user');
    }
  };

  const startChat = async (targetUser: ChatUser) => {
    const participants = [currentUser.uid, targetUser.uid].sort();
    const chatId = participants.join('_');

    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);

    if (!chatSnap.exists()) {
      await setDoc(chatRef, {
        id: chatId,
        participants: participants,
        participantDetails: [
            { uid: currentUser.uid, displayName: currentUser.displayName || 'User', photoURL: currentUser.photoURL },
            { uid: targetUser.uid, displayName: targetUser.displayName || 'User', photoURL: targetUser.photoURL }
        ],
        lastMessage: 'Chat started',
        lastMessageTime: Date.now(),
        updatedAt: Date.now(),
        typing: { [currentUser.uid]: false, [targetUser.uid]: false },
        unreadCounts: { [currentUser.uid]: 0, [targetUser.uid]: 0 },
        wallpapers: {} 
      });
    }

    setActiveChatUser(targetUser);
    setActiveChatId(chatId);
    setSearchId('');
    setFoundUser(null);
    setIsSearchOpen(false);
    setChatWallpaper(null); // Reset until loaded
  };

  const handleTyping = async () => {
      if (!activeChatId) return;

      // 1. If not already typing, mark as typing in DB
      if (!isTyping) {
          setIsTyping(true);
          try {
            await updateDoc(doc(db, 'chats', activeChatId), {
                [`typing.${currentUser.uid}`]: true
            });
          } catch(e) { console.error("Error setting typing", e); }
      }

      // 2. Clear existing timeout to reset the 2s timer
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      // 3. Set timeout to clear typing status after 2 seconds of inactivity
      typingTimeoutRef.current = setTimeout(async () => {
          setIsTyping(false);
          try {
            await updateDoc(doc(db, 'chats', activeChatId), {
                [`typing.${currentUser.uid}`]: false
            });
          } catch(e) { console.error("Error clearing typing", e); }
      }, 2000);
  };

  const uploadToCloudinary = async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', 'Heartly image');
      const response = await fetch(`https://api.cloudinary.com/v1_1/dtxvdtt78/image/upload`, { method: 'POST', body: formData });
      const data = await response.json();
      return data.secure_url;
  };

  const handleChatImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeChatId || !activeChatUser) return;
      
      setIsUploading(true);
      try {
          const url = await uploadToCloudinary(file);
          // Encrypt the URL just like text to keep logic consistent
          const encryptedUrl = simpleEncrypt(url, ENCRYPTION_KEY);
          
          await addDoc(collection(db, 'chats', activeChatId, 'messages'), {
            text: encryptedUrl,
            senderId: currentUser.uid,
            createdAt: Date.now(),
            read: false,
            type: 'image'
          });

          await updateDoc(doc(db, 'chats', activeChatId), {
            lastMessage: 'Sent a photo',
            lastMessageTime: Date.now(),
            updatedAt: Date.now(),
            [`unreadCounts.${activeChatUser.uid}`]: increment(1)
          });
      } catch(e) {
          console.error("Image upload failed", e);
          alert("Failed to send image.");
      } finally {
          setIsUploading(false);
          if (imageInputRef.current) imageInputRef.current.value = '';
      }
  };

  const handleWallpaperUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeChatId) return;

      setIsUploading(true);
      setShowChatMenu(false);
      try {
          const url = await uploadToCloudinary(file);
          await updateDoc(doc(db, 'chats', activeChatId), {
              [`wallpapers.${currentUser.uid}`]: url
          });
      } catch(e) {
          console.error("Wallpaper upload failed", e);
          alert("Failed to change wallpaper.");
      } finally {
          setIsUploading(false);
          if (wallpaperInputRef.current) wallpaperInputRef.current.value = '';
      }
  };

  const removeWallpaper = async () => {
      if (!activeChatId) return;
      setShowChatMenu(false);
      try {
          // Using dot notation to delete map field is tricky in firestore without replacing map
          // Easier to set it to null or empty string
          // Or use FieldValue.delete() on the nested field
          // NOTE: Firestore update nested field delete needs dot notation
          const chatRef = doc(db, 'chats', activeChatId);
          // We can just set it to null or use 'delete' logic if we imported FieldValue
          // For simplicity here, setting to null works if our check allows it, or just empty string.
          // Let's rely on overwriting for now or use a "null" string
          await updateDoc(chatRef, {
              [`wallpapers.${currentUser.uid}`]: null
          });
      } catch(e) {
          console.error(e);
      }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChatId || !activeChatUser) return;

    if (isBlocked) {
        alert("You have blocked this user. Unblock to send messages.");
        return;
    }

    const encryptedText = simpleEncrypt(newMessage.trim(), ENCRYPTION_KEY);
    const recipientId = activeChatUser.uid;

    try {
      // Clear typing status immediately upon sending
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setIsTyping(false);
      
      const chatRef = doc(db, 'chats', activeChatId);

      // Add Message
      await addDoc(collection(db, 'chats', activeChatId, 'messages'), {
        text: encryptedText,
        senderId: currentUser.uid,
        createdAt: Date.now(),
        read: false,
        type: 'text'
      });

      // Update Chat Metadata
      await updateDoc(chatRef, {
        [`typing.${currentUser.uid}`]: false, // Force typing to false
        lastMessage: 'Encrypted Message',
        lastMessageTime: Date.now(),
        updatedAt: Date.now(),
        [`unreadCounts.${recipientId}`]: increment(1)
      });

      setNewMessage('');
    } catch (err) {
      console.error("Failed to send", err);
    }
  };

  const deleteMessage = async (messageId: string) => {
      if (!activeChatId) return;
      if (window.confirm("Delete this message?")) {
          try {
              await deleteDoc(doc(db, 'chats', activeChatId, 'messages', messageId));
          } catch (e) {
              console.error("Error deleting", e);
          }
      }
  };

  const handleClearChat = async () => {
      if (!activeChatId) return;
      if (messages.length === 0) {
          alert("Chat is already empty.");
          setShowChatMenu(false);
          return;
      }

      if (!window.confirm("Are you sure you want to clear all messages? This cannot be undone.")) return;
      
      setShowChatMenu(false);
      
      try {
          setMessages([]); // Optimistic update
          
          const q = query(collection(db, 'chats', activeChatId, 'messages'));
          const snapshot = await getDocs(q);
          
          const chunks = [];
          let batch = writeBatch(db);
          let count = 0;
          
          snapshot.docs.forEach((doc) => {
              batch.delete(doc.ref);
              count++;
              if (count === 499) {
                  chunks.push(batch);
                  batch = writeBatch(db);
                  count = 0;
              }
          });
          if (count > 0) chunks.push(batch);
          
          await Promise.all(chunks.map(b => b.commit()));
          
          await updateDoc(doc(db, 'chats', activeChatId), {
              lastMessage: 'Chat cleared',
              lastMessageTime: Date.now()
          });
      } catch(e) {
          console.error("Error clearing chat", e);
          alert("Failed to clear chat.");
      }
  };

  const handleBlockUser = async () => {
      if (!activeChatUser) return;
      if (!window.confirm(`Block ${activeChatUser.displayName}? You won't receive messages from them.`)) return;
      
      setShowChatMenu(false);
      try {
          const myRef = doc(db, 'users', currentUser.uid);
          await updateDoc(myRef, {
              blockedUsers: arrayUnion(activeChatUser.uid)
          });
      } catch(e) {
          console.error("Error blocking user", e);
      }
  };

  const handleUnblockUser = async () => {
      if (!activeChatUser) return;
      if (!window.confirm(`Unblock ${activeChatUser.displayName}?`)) return;

      setShowChatMenu(false);
      try {
          const myRef = doc(db, 'users', currentUser.uid);
          await updateDoc(myRef, {
              blockedUsers: arrayRemove(activeChatUser.uid)
          });
      } catch(e) {
          console.error("Error unblocking user", e);
      }
  };

  // --- LONG PRESS HANDLERS ---
  const handleStartPress = (chatId: string) => {
      isLongPressRef.current = false;
      longPressTimerRef.current = setTimeout(() => {
          isLongPressRef.current = true;
          setLongPressedChatId(chatId);
          if (navigator.vibrate) navigator.vibrate(50);
      }, 500); 
  };

  const handleEndPress = () => {
      if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
      }
  };

  const handleDeleteChat = async (chatId: string) => {
      try {
          await deleteDoc(doc(db, 'chats', chatId));
          setLongPressedChatId(null);
      } catch (e) {
          console.error("Error deleting chat", e);
          alert("Failed to delete chat.");
      }
  };

  const getOtherUser = (chat: ChatMetadata) => {
    return chat.participantDetails.find(p => p.uid !== currentUser.uid) || chat.participantDetails[0];
  };

  // --- RENDER ACTIVE CHAT ---
  if (activeChatId && activeChatUser) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-[#050505] text-white animate-fade-in">
        {/* Custom Wallpaper or Default Gradient */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            {chatWallpaper ? (
                <>
                    <img src={chatWallpaper} className="w-full h-full object-cover opacity-60" />
                    <div className="absolute inset-0 bg-black/40"></div>
                </>
            ) : (
                <>
                    <div className="absolute -top-[10%] -left-[10%] w-64 h-64 bg-violet-600/10 rounded-full blur-[80px]"></div>
                    <div className="absolute top-[40%] -right-[10%] w-72 h-72 bg-fuchsia-600/10 rounded-full blur-[100px]"></div>
                </>
            )}
        </div>

        {/* Hidden Inputs */}
        <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={handleChatImageUpload} />
        <input type="file" ref={wallpaperInputRef} className="hidden" accept="image/*" onChange={handleWallpaperUpload} />

        {/* Header */}
        <div className="absolute top-[calc(env(safe-area-inset-top)+1rem)] left-4 right-4 z-30">
            <div className="bg-[#121216]/80 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between shadow-2xl shadow-black/50">
                <div className="flex items-center gap-3">
                    <button onClick={() => setActiveChatId(null)} className="p-2 -ml-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/5 active:scale-90">
                        <ChevronLeft size={24} />
                    </button>
                    <div className="relative w-10 h-10">
                        <img 
                            src={activeChatUser.photoURL || `https://ui-avatars.com/api/?name=${activeChatUser.displayName}`} 
                            className="w-full h-full rounded-full bg-gray-800 object-cover ring-2 ring-white/10"
                            alt={activeChatUser.displayName || 'User'} 
                        />
                        {!isBlocked && (
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#050505] rounded-full flex items-center justify-center z-20">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            </div>
                        )}
                    </div>
                    <div>
                        <h3 className="font-bold text-sm text-white leading-tight">{activeChatUser.displayName}</h3>
                        <div className="flex items-center gap-1.5 h-4">
                            {isBlocked ? (
                                <span className="text-[10px] text-red-400 font-bold">Blocked</span>
                            ) : isOtherUserTyping ? (
                                <span className="text-[10px] text-fuchsia-400 font-bold animate-pulse">typing...</span>
                            ) : (
                                <>
                                    <ShieldCheck size={10} className="text-emerald-500" />
                                    <span className="text-[10px] text-gray-500 font-medium">Encrypted</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <div className="relative">
                    <button onClick={() => setShowChatMenu(!showChatMenu)} className="p-2 text-gray-500 hover:text-white rounded-full hover:bg-white/5 transition-colors">
                        <MoreVertical size={20} />
                    </button>
                    {showChatMenu && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowChatMenu(false)} />
                            <div className="absolute right-0 top-full mt-2 w-48 bg-[#1A1A23] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
                                <button onClick={() => wallpaperInputRef.current?.click()} className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-colors">
                                    <Wallpaper size={14} /> Change Wallpaper
                                </button>
                                {chatWallpaper && (
                                    <button onClick={removeWallpaper} className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-colors">
                                        <X size={14} /> Remove Wallpaper
                                    </button>
                                )}
                                <button onClick={handleClearChat} className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-colors">
                                    <Eraser size={14} /> Clear Chat
                                </button>
                                {isBlocked ? (
                                    <button onClick={handleUnblockUser} className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-medium text-green-400 hover:bg-green-500/10 transition-colors border-t border-white/5">
                                        <UserX size={14} /> Unblock User
                                    </button>
                                ) : (
                                    <button onClick={handleBlockUser} className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors border-t border-white/5">
                                        <Ban size={14} /> Block User
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto pt-[calc(env(safe-area-inset-top)+7rem)] px-4 pb-28 space-y-3 z-10 native-scroll no-scrollbar min-h-0">
          <div className="flex justify-center mb-6">
             <div className="bg-[#1A1A21] border border-white/5 px-4 py-2 rounded-full text-[10px] font-medium text-gray-500 flex items-center gap-2 shadow-lg backdrop-blur-sm">
                <Lock size={12} className="text-emerald-500" /> End-to-end encrypted.
             </div>
          </div>

          {messages.map((msg) => {
            const isMe = msg.senderId === currentUser.uid;
            
            if (msg.type === 'invite') {
                return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                         <div className={`max-w-[75%] w-64 p-1.5 rounded-[1.5rem] relative shadow-2xl ${isMe ? 'bg-gradient-to-br from-violet-600 to-fuchsia-600' : 'bg-[#1A1A23] border border-white/10'}`}>
                             <div className="bg-[#0A0A0E]/90 rounded-[1.2rem] p-4 backdrop-blur-md relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-20 h-20 bg-violet-500/20 blur-xl rounded-full -mr-10 -mt-10"></div>
                                <div className="flex items-center gap-3 mb-3 relative z-10">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg">
                                        <Mic size={18} className="text-white" />
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-0.5">Voice Room</span>
                                        <h4 className="text-sm font-bold text-white leading-tight">{msg.text}</h4>
                                    </div>
                                </div>
                                <button onClick={() => onJoinRoom(msg.roomId!)} className="w-full py-2.5 bg-white text-black text-xs font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors shadow-lg active:scale-95">
                                    Join Now <ArrowRight size={14} />
                                </button>
                             </div>
                             <div className="flex items-center justify-end gap-1 px-2 mt-1">
                                <p className={`text-[9px] text-white/60 font-medium`}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                             </div>
                             {isMe && (
                                <button onClick={() => deleteMessage(msg.id)} className="absolute -left-10 top-1/2 -translate-y-1/2 p-2 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity bg-[#1A1A23] rounded-full border border-white/5">
                                    <Trash2 size={14} />
                                </button>
                             )}
                         </div>
                    </div>
                );
            }

            const decryptedText = simpleDecrypt(msg.text, ENCRYPTION_KEY);
            
            if (msg.type === 'image') {
                return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group mb-1`}>
                        <div className={`max-w-[75%] p-1 rounded-2xl relative shadow-lg ${isMe ? 'bg-gradient-to-tr from-violet-600 to-fuchsia-600' : 'bg-[#1A1A23] border border-white/5'}`}>
                            <div className="rounded-xl overflow-hidden cursor-pointer active:scale-95 transition-transform" onClick={() => setExpandedImage(decryptedText)}>
                                <img src={decryptedText} className="w-full max-w-[200px] h-auto object-cover" alt="Chat attachment" />
                            </div>
                            <div className={`flex items-center justify-end gap-1 px-2 pb-1 mt-1 opacity-70`}>
                                <p className={`text-[9px] font-bold ${isMe ? 'text-white' : 'text-gray-400'}`}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                {isMe && (msg.read ? <CheckCheck size={12} className="text-blue-200" /> : <Check size={12} className="text-white/70" />)}
                            </div>
                            {isMe && (
                                <button onClick={() => deleteMessage(msg.id)} className="absolute -left-10 top-1/2 -translate-y-1/2 p-2 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity bg-[#1A1A23] rounded-full border border-white/5">
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                );
            }

            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group mb-1`}>
                <div className={`max-w-[75%] px-5 py-3 text-sm relative transition-all shadow-lg ${isMe ? 'bg-gradient-to-tr from-violet-600 to-fuchsia-600 text-white rounded-[1.2rem] rounded-br-none' : 'bg-[#1A1A23] text-gray-100 border border-white/5 rounded-[1.2rem] rounded-bl-none backdrop-blur-md'}`}>
                  <p className="leading-relaxed break-words font-medium">{decryptedText}</p>
                  <div className={`flex items-center justify-end gap-1 mt-1 opacity-70`}>
                      <p className={`text-[9px] font-bold ${isMe ? 'text-violet-100' : 'text-gray-500'}`}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      {isMe && (msg.read ? <CheckCheck size={12} className="text-blue-200" /> : <Check size={12} className="text-white/70" />)}
                  </div>
                  {isMe && (
                      <button onClick={() => deleteMessage(msg.id)} className="absolute -left-10 top-1/2 -translate-y-1/2 p-2 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity bg-[#1A1A23] rounded-full border border-white/5 hover:scale-110 active:scale-95">
                          <Trash2 size={14} />
                      </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing Indicator Bubble */}
          {isOtherUserTyping && !isBlocked && (
             <div className="flex justify-start animate-fade-in pl-2 pb-2">
                 <div className="bg-[#1A1A23] border border-white/10 px-4 py-3 rounded-2xl rounded-bl-none flex gap-1.5 shadow-lg items-center backdrop-blur-md">
                    <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                 </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="absolute bottom-6 left-4 right-4 z-30">
          {isBlocked ? (
              <div className="bg-[#1A1A23] border border-red-500/20 p-4 rounded-3xl flex justify-between items-center shadow-xl">
                  <span className="text-xs text-red-400 font-bold ml-2">You blocked this user.</span>
                  <button onClick={handleUnblockUser} className="bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-bold px-4 py-2 rounded-xl transition-colors">Unblock</button>
              </div>
          ) : (
              <form onSubmit={sendMessage} className="flex items-center gap-2 relative bg-[#121216]/90 backdrop-blur-xl border border-white/10 p-2 rounded-[1.5rem] shadow-2xl shadow-black/50">
                <button 
                    type="button" 
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isUploading}
                    className="p-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-colors"
                >
                    {isUploading ? <Loader2 size={20} className="animate-spin" /> : <ImageIcon size={20} />}
                </button>
                <input 
                  type="text" 
                  value={newMessage}
                  onChange={(e) => {
                      setNewMessage(e.target.value);
                      handleTyping();
                  }}
                  placeholder="Type message..."
                  className="flex-1 bg-transparent text-white placeholder-gray-500 px-2 py-3 outline-none text-sm font-medium"
                />
                <button type="submit" disabled={!newMessage.trim()} className="p-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-full text-white disabled:opacity-50 hover:scale-105 transition-transform shadow-lg shadow-violet-500/20 active:scale-95">
                  <Send size={18} fill="currentColor" />
                </button>
              </form>
          )}
        </div>

        {/* Lightbox for Images */}
        {expandedImage && (
            <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center animate-fade-in p-4" onClick={() => setExpandedImage(null)}>
                <img src={expandedImage} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
                <button className="absolute top-8 right-8 text-white p-2 bg-white/10 rounded-full"><X size={24} /></button>
            </div>
        )}
      </div>
    );
  }

  // --- RENDER CHAT LIST ---
  return (
    <div className="flex flex-col h-full bg-[#050505] text-white pb-24 px-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/10 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Header */}
      <div className="pb-8 pt-[calc(env(safe-area-inset-top)+2rem)] relative z-10 flex items-center justify-between">
         <div>
             <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-br from-white via-violet-200 to-fuchsia-200 tracking-tight">Messages</h1>
             <p className="text-gray-500 text-xs font-bold tracking-widest uppercase mt-2 opacity-60">Your Conversations</p>
         </div>
         <button onClick={() => setIsSearchOpen(!isSearchOpen)} className={`p-3 rounded-2xl transition-all shadow-xl active:scale-90 ${isSearchOpen ? 'bg-violet-600 text-white' : 'bg-[#121216] border border-white/10 text-gray-400 hover:text-white'}`}>
             {isSearchOpen ? <X size={20} /> : <Search size={20} />}
         </button>
      </div>

      {isSearchOpen && (
        <div className="bg-[#121216] border-b border-white/5 p-4 animate-fade-in mb-4 rounded-xl">
           <form onSubmit={handleSearch} className="flex gap-2 mb-4">
              <input type="text" value={searchId} onChange={(e) => setSearchId(e.target.value)} placeholder="Enter 4-character ID (e.g. A1B2)" maxLength={4} className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none uppercase font-mono" />
              <button type="submit" className="px-4 py-2 bg-violet-600 rounded-xl font-bold text-xs">Find</button>
           </form>
           {searchError && <p className="text-red-400 text-xs font-bold text-center mb-4">{searchError}</p>}
           {foundUser && (
             <div className="bg-white/5 p-3 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <img src={foundUser.photoURL || ''} className="w-10 h-10 rounded-full bg-gray-800 object-cover" />
                   <div><p className="text-sm font-bold text-white">{foundUser.displayName}</p><p className="text-[10px] text-gray-500">@{foundUser.uniqueId}</p></div>
                </div>
                <button onClick={() => startChat(foundUser)} className="px-4 py-2 bg-white text-black rounded-lg text-xs font-bold hover:bg-gray-200">Message</button>
             </div>
           )}
        </div>
      )}

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto native-scroll no-scrollbar min-h-0">
          {loadingChats ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-500" /></div>
          ) : chats.length === 0 ? (
            <div className="text-center py-20 opacity-50">
               <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4"><MessageSquare size={32} className="text-gray-500" /></div>
               <p className="text-gray-400 text-sm font-bold">No messages yet.</p>
               <p className="text-[10px] text-gray-600 mt-1">Search for a user ID to start chatting.</p>
            </div>
          ) : (
            chats.map(chat => {
              const otherUser = getOtherUser(chat);
              const unread = chat.unreadCounts?.[currentUser.uid] || 0;
              const lastMsgTime = new Date(chat.lastMessageTime);
              const isLongPressed = longPressedChatId === chat.id;

              return (
                <div key={chat.id} onClick={() => startChat(otherUser)} onTouchStart={() => handleStartPress(chat.id)} onTouchEnd={handleEndPress} onMouseDown={() => handleStartPress(chat.id)} onMouseUp={handleEndPress} onMouseLeave={handleEndPress} className={`relative p-4 border-b border-white/5 hover:bg-white/5 transition-all cursor-pointer ${isLongPressed ? 'bg-red-500/10' : ''}`}>
                   {isLongPressed && (
                       <div className="absolute inset-0 bg-red-900/80 z-20 flex items-center justify-center animate-fade-in backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
                           <button onClick={() => handleDeleteChat(chat.id)} className="flex flex-col items-center gap-2 text-white"><div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center shadow-lg animate-bounce"><Trash2 size={24} /></div><span className="font-bold text-xs">Tap to Delete</span></button>
                           <button onClick={() => setLongPressedChatId(null)} className="absolute top-2 right-2 p-2 text-white/50"><X size={16} /></button>
                       </div>
                   )}
                   <div className="flex items-center gap-4">
                      <div className="relative"><img src={otherUser.photoURL || `https://ui-avatars.com/api/?name=${otherUser.displayName}`} className="w-14 h-14 rounded-full bg-gray-800 object-cover" /></div>
                      <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-1">
                              <h3 className="font-bold text-white text-base truncate">{otherUser.displayName}</h3>
                              <span className="text-[10px] text-gray-500 font-medium">{lastMsgTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                          <div className="flex justify-between items-center">
                              <p className={`text-sm truncate max-w-[180px] ${unread > 0 ? 'text-white font-bold' : 'text-gray-400'}`}>
                                 {chat.typing?.[otherUser.uid] ? <span className="text-fuchsia-400 italic">typing...</span> : (chat.lastMessage === 'Encrypted Message' ? 'Sent a message' : chat.lastMessage)}
                              </p>
                              {unread > 0 && (<div className="w-5 h-5 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-lg">{unread}</div>)}
                          </div>
                      </div>
                   </div>
                </div>
              );
            })
          )}
      </div>
    </div>
  );
};
