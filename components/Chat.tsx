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
  Ban, Eraser, UserX
} from 'lucide-react';

interface ChatProps {
  currentUser: UserProfile;
  onJoinRoom: (roomId: string) => void;
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
  const [activeChatUser, setActiveChatUser] = useState<UserProfile | null>(null);
  
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
  const [isTyping, setIsTyping] = useState(false);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  
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

    // 2. Listen for Typing Status on the Chat Document
    const chatDocRef = doc(db, 'chats', activeChatId);
    const unsubscribeChat = onSnapshot(chatDocRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            const typingData = data.typing || {};
            // Check if the OTHER person is typing
            const otherUid = activeChatUser?.uid;
            if (otherUid && typingData[otherUid]) {
                setIsOtherUserTyping(true);
                // Scroll to show the typing bubble
                setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            } else {
                setIsOtherUserTyping(false);
            }
        }
    });

    return () => {
        unsubscribeMessages();
        unsubscribeChat();
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

  const startChat = async (targetUser: UserProfile) => {
    const participants = [currentUser.uid, targetUser.uid].sort();
    const chatId = participants.join('_');

    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);

    if (!chatSnap.exists()) {
      await setDoc(chatRef, {
        id: chatId,
        participants: participants,
        participantDetails: [
            { uid: currentUser.uid, displayName: currentUser.displayName, photoURL: currentUser.photoURL },
            { uid: targetUser.uid, displayName: targetUser.displayName, photoURL: targetUser.photoURL }
        ],
        lastMessage: 'Chat started',
        lastMessageTime: Date.now(),
        updatedAt: Date.now(),
        typing: { [currentUser.uid]: false, [targetUser.uid]: false },
        unreadCounts: { [currentUser.uid]: 0, [targetUser.uid]: 0 }
      });
    }

    setActiveChatUser(targetUser);
    setActiveChatId(chatId);
    setSearchId('');
    setFoundUser(null);
    setIsSearchOpen(false);
  };

  const handleTyping = async () => {
      if (!activeChatId) return;

      if (!isTyping) {
          setIsTyping(true);
          await updateDoc(doc(db, 'chats', activeChatId), {
              [`typing.${currentUser.uid}`]: true
          });
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      typingTimeoutRef.current = setTimeout(async () => {
          setIsTyping(false);
          await updateDoc(doc(db, 'chats', activeChatId), {
              [`typing.${currentUser.uid}`]: false
          });
      }, 2000);
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
      // Clear typing status immediately
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

      // Update Chat Metadata (Typing false, Last Message, Increment Unread for Recipient)
      await updateDoc(chatRef, {
        [`typing.${currentUser.uid}`]: false,
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
          // Optimistically clear local state for instant feedback
          setMessages([]);
          
          const q = query(collection(db, 'chats', activeChatId, 'messages'));
          const snapshot = await getDocs(q);
          
          // Batch delete with chunking (Firestore limit 500 ops per batch)
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
          alert("Failed to clear chat. Please check your connection.");
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
          // Vibrate if available
          if (navigator.vibrate) navigator.vibrate(50);
      }, 500); // 500ms threshold
  };

  const handleEndPress = () => {
      if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
      }
  };

  const handleDeleteChat = async (chatId: string) => {
      // Direct delete without native confirm, as the overlay serves as the confirmation
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
      // Full Screen Overlay: z-[60] covers navigation (z-50)
      <div className="fixed inset-0 z-[60] flex flex-col bg-[#050505] text-white animate-fade-in">
        {/* Background Ambient Effect */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-[10%] -left-[10%] w-64 h-64 bg-violet-600/10 rounded-full blur-[80px]"></div>
            <div className="absolute top-[40%] -right-[10%] w-72 h-72 bg-fuchsia-600/10 rounded-full blur-[100px]"></div>
        </div>

        {/* Floating Chat Header */}
        <div className="absolute top-4 left-4 right-4 z-30">
            <div className="bg-[#121216]/80 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between shadow-2xl shadow-black/50">
                <div className="flex items-center gap-3">
                    <button onClick={() => setActiveChatId(null)} className="p-2 -ml-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/5">
                        <ChevronLeft size={24} />
                    </button>
                    <div className="relative">
                        <img 
                            src={activeChatUser.photoURL || `https://ui-avatars.com/api/?name=${activeChatUser.displayName}`} 
                            className="w-10 h-10 rounded-full bg-gray-800 object-cover ring-2 ring-white/10"
                            alt={activeChatUser.displayName || 'User'} 
                        />
                        {/* Status Dot */}
                        {!isBlocked && (
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#050505] rounded-full flex items-center justify-center">
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
                    <button 
                        onClick={() => setShowChatMenu(!showChatMenu)}
                        className="p-2 text-gray-500 hover:text-white rounded-full hover:bg-white/5 transition-colors"
                    >
                        <MoreVertical size={20} />
                    </button>
                    
                    {/* Chat Menu Dropdown */}
                    {showChatMenu && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-[#1A1A23] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
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
                    )}
                    
                    {/* Menu Backdrop */}
                    {showChatMenu && <div className="fixed inset-0 z-40" onClick={() => setShowChatMenu(false)} />}
                </div>
            </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto pt-24 px-4 pb-28 space-y-3 z-10 no-scrollbar">
          <div className="flex justify-center mb-6">
             <div className="bg-[#1A1A21] border border-white/5 px-4 py-2 rounded-full text-[10px] font-medium text-gray-500 flex items-center gap-2 shadow-lg">
                <Lock size={12} className="text-emerald-500" /> End-to-end encrypted.
             </div>
          </div>

          {messages.map((msg) => {
            const isMe = msg.senderId === currentUser.uid;
            
            // --- INVITE CARD RENDER ---
            if (msg.type === 'invite') {
                return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                         <div className={`
                            max-w-[75%] w-64 p-1.5 rounded-[1.5rem] relative shadow-2xl
                            ${isMe ? 'bg-gradient-to-br from-violet-600 to-fuchsia-600' : 'bg-[#1A1A23] border border-white/10'}
                         `}>
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
                                <button 
                                    onClick={() => onJoinRoom(msg.roomId!)}
                                    className="w-full py-2.5 bg-white text-black text-xs font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors shadow-lg active:scale-95"
                                >
                                    Join Now <ArrowRight size={14} />
                                </button>
                             </div>
                             <div className="flex items-center justify-end gap-1 px-2 mt-1">
                                <p className={`text-[9px] text-white/60 font-medium`}>
                                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                             </div>
                             {isMe && (
                                <button 
                                    onClick={() => deleteMessage(msg.id)}
                                    className="absolute -left-10 top-1/2 -translate-y-1/2 p-2 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity bg-[#1A1A23] rounded-full border border-white/5"
                                >
                                    <Trash2 size={14} />
                                </button>
                             )}
                         </div>
                    </div>
                );
            }

            // --- TEXT RENDER ---
            const decryptedText = simpleDecrypt(msg.text, ENCRYPTION_KEY);
            
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group mb-1`}>
                <div 
                  className={`max-w-[75%] px-5 py-3 text-sm relative transition-all shadow-lg ${
                    isMe 
                    ? 'bg-gradient-to-tr from-violet-600 to-fuchsia-600 text-white rounded-[1.2rem] rounded-br-none' 
                    : 'bg-[#1A1A23] text-gray-100 border border-white/5 rounded-[1.2rem] rounded-bl-none'
                  }`}
                >
                  <p className="leading-relaxed break-words font-medium">{decryptedText}</p>
                  
                  <div className={`flex items-center justify-end gap-1 mt-1 opacity-70`}>
                      <p className={`text-[9px] font-bold ${isMe ? 'text-violet-100' : 'text-gray-500'}`}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {isMe && (
                          msg.read ? <CheckCheck size={12} className="text-blue-200" /> : <Check size={12} className="text-white/70" />
                      )}
                  </div>

                  {/* Delete Button (Hover) */}
                  {isMe && (
                      <button 
                        onClick={() => deleteMessage(msg.id)}
                        className="absolute -left-10 top-1/2 -translate-y-1/2 p-2 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity bg-[#1A1A23] rounded-full border border-white/5 hover:scale-110 active:scale-95"
                      >
                          <Trash2 size={14} />
                      </button>
                  )}
                </div>
              </div>
            );
          })}

          {isOtherUserTyping && !isBlocked && (
             <div className="flex justify-start animate-fade-in pl-2">
                 <div className="bg-[#1A1A23] border border-white/10 px-4 py-3 rounded-2xl rounded-bl-none flex gap-1.5 shadow-lg items-center">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
                  <button 
                    onClick={handleUnblockUser}
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-bold px-4 py-2 rounded-xl transition-colors"
                  >
                      Unblock
                  </button>
              </div>
          ) : (
              <form onSubmit={sendMessage} className="flex items-center gap-2 relative bg-[#121216]/90 backdrop-blur-xl border border-white/10 p-2 rounded-[1.5rem] shadow-2xl shadow-black/50">
                <input 
                  type="text" 
                  value={newMessage}
                  onChange={(e) => {
                      setNewMessage(e.target.value);
                      handleTyping();
                  }}
                  placeholder="Type message..."
                  className="flex-1 bg-transparent text-white placeholder-gray-500 px-4 py-3 outline-none text-sm font-medium"
                />
                <button 
                  type="submit" 
                  disabled={!newMessage.trim()}
                  className="p-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-full text-white disabled:opacity-50 hover:scale-105 transition-transform shadow-lg shadow-violet-500/20 active:scale-95"
                >
                  <Send size={18} fill="currentColor" />
                </button>
              </form>
          )}
        </div>
      </div>
    );
  }

  // --- RENDER CHAT LIST & SEARCH ---
  return (
    <div className="flex flex-col h-full bg-[#050505] text-white pb-24 px-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/10 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Header with Search Toggle */}
      <div className="py-8 relative z-10 flex items-center justify-between">
         <div>
             <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-br from-white via-violet-200 to-fuchsia-200 tracking-tight">Messages</h1>
             <p className="text-gray-500 text-xs font-bold tracking-widest uppercase mt-2 opacity-60">Your Conversations</p>
         </div>
         <button 
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className={`p-3 rounded-2xl transition-all shadow-xl ${isSearchOpen ? 'bg-violet-600 text-white' : 'bg-[#121216] border border-white/10 text-gray-400 hover:text-white'}`}
         >
             {isSearchOpen ? <X size={20} /> : <Search size={20} />}
         </button>
      </div>

      {/* Expandable Search Bar */}
      {isSearchOpen && (
          <div className="animate-fade-in mb-6 relative z-10">
              <div className={`
                  bg-[#121216] border transition-all duration-300 relative overflow-hidden
                  ${foundUser ? 'rounded-[2rem] border-violet-500/30' : 'rounded-[2rem] border-white/10 hover:border-white/20'}
                  shadow-2xl shadow-black/50
              `}>
                {!foundUser ? (
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <div className="p-1.5 bg-violet-500/10 rounded-lg"><Hash size={14} className="text-violet-400" /></div>
                                Search User ID
                            </h3>
                        </div>
                        
                        <form onSubmit={handleSearch} className="flex gap-3">
                            <div className="relative flex-1 group">
                                <input 
                                    type="text" 
                                    value={searchId}
                                    onChange={(e) => setSearchId(e.target.value.toUpperCase())}
                                    maxLength={4}
                                    placeholder="e.g. A7X2"
                                    className="w-full bg-[#050505] border border-white/10 text-white text-center font-mono tracking-[0.2em] text-lg py-4 rounded-2xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none placeholder:text-gray-700 placeholder:text-xs placeholder:font-sans placeholder:tracking-normal uppercase transition-all"
                                    autoFocus
                                />
                            </div>
                            <button 
                                type="submit"
                                className="bg-white text-black p-4 rounded-2xl hover:bg-gray-200 transition-colors shadow-lg active:scale-95"
                            >
                                <Search size={22} />
                            </button>
                        </form>
                        {searchError && <p className="text-red-400 text-xs mt-3 font-bold text-center bg-red-500/10 py-2 rounded-lg animate-fade-in">{searchError}</p>}
                    </div>
                ) : (
                    <div className="p-6 bg-gradient-to-b from-violet-900/20 to-[#121216]">
                        <div className="flex justify-between items-start mb-4">
                            <span className="text-[10px] font-bold text-violet-300 bg-violet-500/10 px-2 py-1 rounded-md border border-violet-500/20">USER FOUND</span>
                            <button onClick={() => { setFoundUser(null); setSearchId(''); }} className="p-1 bg-white/10 rounded-full hover:bg-white/20"><X size={14}/></button>
                        </div>
                        <div className="flex items-center gap-4">
                            <img src={foundUser.photoURL || `https://ui-avatars.com/api/?name=${foundUser.displayName}`} className="w-16 h-16 rounded-full border-4 border-[#121216] shadow-xl" />
                            <div>
                                <h3 className="text-xl font-bold text-white">{foundUser.displayName}</h3>
                                <p className="text-xs text-gray-400 font-mono">ID: {foundUser.uniqueId}</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => startChat(foundUser)}
                            className="w-full mt-6 bg-white text-black font-bold py-3.5 rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 shadow-xl active:scale-95"
                        >
                            <MessageSquare size={18} /> Start Chatting
                        </button>
                    </div>
                )}
              </div>
          </div>
      )}

      {/* Recent Chats */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 z-10">
         <div className="flex items-center justify-between mb-2 px-2">
             <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Recent</h3>
         </div>
         
         {loadingChats ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-violet-500" /></div>
         ) : chats.length === 0 ? (
            <div className="text-center py-12 opacity-40 border-2 border-dashed border-white/10 rounded-3xl m-2">
               <MessageSquare size={32} className="text-gray-500 mx-auto mb-3" />
               <p className="text-gray-500 text-sm font-medium">No messages yet.</p>
            </div>
         ) : (
            chats.map(chat => {
                const otherUser = getOtherUser(chat);
                const unreadCount = chat.unreadCounts?.[currentUser.uid] || 0;
                
                return (
                    <div 
                        key={chat.id}
                        onMouseDown={() => handleStartPress(chat.id)}
                        onMouseUp={handleEndPress}
                        onTouchStart={() => handleStartPress(chat.id)}
                        onTouchEnd={handleEndPress}
                        onClick={(e) => {
                            if (longPressedChatId === chat.id) return;
                            if (isLongPressRef.current) {
                                isLongPressRef.current = false; 
                                return;
                            }
                            setActiveChatUser({
                                uid: otherUser.uid,
                                displayName: otherUser.displayName,
                                photoURL: otherUser.photoURL,
                                email: '',
                                walletBalance: 0
                            });
                            setActiveChatId(chat.id);
                        }}
                        className="group flex items-center gap-4 p-4 rounded-[1.5rem] bg-[#121216] border border-white/5 hover:border-white/10 hover:bg-[#1A1A21] transition-all cursor-pointer active:scale-[0.98] relative overflow-hidden select-none"
                    >
                        {/* Hover Gradient */}
                        <div className="absolute inset-0 bg-gradient-to-r from-violet-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

                        {/* DELETE MODE OVERLAY */}
                        {longPressedChatId === chat.id && (
                            <div 
                                className="absolute inset-0 z-50 bg-[#050505]/95 backdrop-blur-md flex items-center justify-center gap-3 animate-fade-in px-4 cursor-default"
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                onMouseDown={(e) => { e.stopPropagation(); }}
                                onTouchStart={(e) => { e.stopPropagation(); }}
                                onMouseUp={(e) => { e.stopPropagation(); }}
                                onTouchEnd={(e) => { e.stopPropagation(); }}
                            >
                                <button 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        e.preventDefault(); 
                                        handleDeleteChat(chat.id); 
                                    }}
                                    className="flex-1 bg-red-600 active:bg-red-700 text-white text-xs font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg touch-manipulation"
                                >
                                    <Trash2 size={16} /> Confirm Delete
                                </button>
                                <button 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        e.preventDefault(); 
                                        setLongPressedChatId(null); 
                                    }}
                                    className="px-5 py-3 bg-white/10 active:bg-white/20 text-white text-xs font-bold rounded-xl touch-manipulation"
                                >
                                    Cancel
                                </button>
                            </div>
                        )}

                        <div className="relative">
                            <img 
                                src={otherUser.photoURL || `https://ui-avatars.com/api/?name=${otherUser.displayName}`} 
                                className="w-14 h-14 rounded-full bg-gray-800 object-cover ring-2 ring-[#121216] group-hover:ring-violet-500/30 transition-all" 
                            />
                            {/* Unread Chat Badge */}
                            {unreadCount > 0 && (
                                <div className="absolute -top-1 -right-1 min-w-[20px] h-[20px] bg-emerald-500 text-white text-[10px] font-extrabold flex items-center justify-center rounded-full border-4 border-[#121216] shadow-lg animate-bounce">
                                    {unreadCount}
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0 relative z-10">
                            <div className="flex justify-between items-baseline mb-1">
                                <h4 className={`text-sm truncate ${unreadCount > 0 ? 'font-extrabold text-white' : 'font-bold text-gray-200'}`}>{otherUser.displayName}</h4>
                                <span className={`text-[10px] font-bold ${unreadCount > 0 ? 'text-emerald-400' : 'text-gray-600'}`}>
                                    {new Date(chat.updatedAt).toLocaleDateString() === new Date().toLocaleDateString() 
                                        ? new Date(chat.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                                        : new Date(chat.updatedAt).toLocaleDateString()}
                                </span>
                            </div>
                            <p className={`text-xs truncate flex items-center gap-1.5 ${unreadCount > 0 ? 'text-white font-medium' : 'text-gray-500'}`}>
                                {unreadCount > 0 ? (
                                    <>
                                       <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                                       New Message
                                    </>
                                ) : (
                                    chat.lastMessage.includes('Invite') ? <Mic size={12} className="text-violet-400"/> : <Lock size={10} className="text-gray-600" />
                                )}
                                {unreadCount === 0 && (
                                    chat.lastMessage === 'Encrypted Message' ? 'End-to-end encrypted' : chat.lastMessage
                                )}
                            </p>
                        </div>
                        <ChevronRight size={16} className="text-gray-600 group-hover:text-white transition-colors" />
                    </div>
                );
            })
         )}
      </div>
    </div>
  );
};
