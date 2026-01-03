
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, Room, Report, Sticker, RoomBackground, GiftItem, Frame } from '../types';
import { updateProfile } from 'firebase/auth';
import { doc, updateDoc, increment, getDoc, arrayRemove, arrayUnion, collection, query, where, getDocs, deleteDoc, orderBy, addDoc, setDoc, limit, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { 
  LogOut, 
  Edit2, 
  ChevronRight, 
  Shield, 
  Loader2, 
  Copy, 
  CheckCircle2, 
  Camera, 
  Coins, 
  Wallet, 
  X, 
  CreditCard, 
  Users, 
  UserCheck, 
  UserPlus, 
  ShieldAlert, 
  ShieldCheck,
  Search,
  Ban,
  Lock,
  Unlock,
  Save,
  LayoutDashboard,
  Mic,
  Headphones,
  Trash2,
  Megaphone,
  Send,
  Plus,
  Minus,
  Banknote,
  Landmark,
  AlertTriangle,
  RotateCw,
  Flag,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  UserX,
  Smile,
  Image as ImageIcon,
  Gift,
  ShoppingBag,
  Frame as FrameIcon
} from 'lucide-react';

interface ProfileProps {
  user: UserProfile;
  onLogout: () => void;
  onUpdate: () => void;
  onJoinRoom: (roomId: string) => void;
}

const ADMIN_EMAIL = "sv116774@gmail.com";

type AdminTab = 'dashboard' | 'users' | 'rooms' | 'listeners' | 'reports' | 'stickers' | 'backgrounds' | 'gifts' | 'frames';

interface SettingsItemProps {
  onClick: () => void;
  icon: React.ReactNode;
  color: string;
  bg: string;
  label: string;
  badge?: string;
}

const SettingsItem: React.FC<SettingsItemProps> = ({ onClick, icon, color, bg, label, badge }) => (
  <button 
    onClick={onClick}
    className="w-full bg-[#121216]/60 backdrop-blur-md border border-white/5 p-3 rounded-2xl flex items-center justify-between hover:bg-white/5 transition-all active:scale-[0.98] group"
  >
    <div className="flex items-center gap-3">
      <div className={`p-2.5 rounded-xl ${bg} ${color} group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <span className="font-bold text-sm text-gray-200 group-hover:text-white transition-colors">{label}</span>
    </div>
    <div className="flex items-center gap-2">
      {badge && (
        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${badge === 'ACCESS' ? 'bg-red-500 text-white' : 'bg-white/10 text-white'}`}>
          {badge}
        </span>
      )}
      <ChevronRight size={16} className="text-gray-600 group-hover:text-white transition-colors" />
    </div>
  </button>
);

const StatCard = ({ label, value, icon: Icon, color }: { label: string, value: string | number, icon: any, color: string }) => (
    <div className="bg-[#18181B] p-5 rounded-2xl border border-white/5 shadow-lg relative overflow-hidden group">
        <div className={`absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity ${color}`}>
            <Icon size={64} />
        </div>
        <div className="flex items-center gap-3 mb-2 relative z-10">
            <div className={`p-2 rounded-lg bg-white/5 ${color}`}>
                <Icon size={18} />
            </div>
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">{label}</h3>
        </div>
        <p className="text-3xl font-extrabold text-white relative z-10">{value}</p>
    </div>
);

// --- Razorpay Helper ---
const loadRazorpay = () => {
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
};

export const Profile: React.FC<ProfileProps> = ({ user, onLogout, onUpdate, onJoinRoom }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(user.displayName || '');
  const [editedBio, setEditedBio] = useState(user.bio || '');
  const [editedPhoto, setEditedPhoto] = useState(user.photoURL || '');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Wallet State
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState(100);
  const [isProcessing, setIsProcessing] = useState(false);
  const [walletTab, setWalletTab] = useState<'recharge' | 'earnings'>('recharge');

  // Bag / Inventory State
  const [showBagModal, setShowBagModal] = useState(false);

  // Help & Support State
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [supportTab, setSupportTab] = useState<'faq' | 'contact'>('faq');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [supportMessage, setSupportMessage] = useState('');
  const [sendingSupport, setSendingSupport] = useState(false);

  // Privacy & Security State
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [blockedProfiles, setBlockedProfiles] = useState<UserProfile[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);

  // Social Lists State
  const [showUserList, setShowUserList] = useState<'followers' | 'following' | null>(null);
  const [userList, setUserList] = useState<UserProfile[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [visitingProfile, setVisitingProfile] = useState<UserProfile | null>(null);
  const [isFollowingVisitor, setIsFollowingVisitor] = useState(false);

  // Admin State
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard');
  
  // Admin: User Management
  const [adminTargetEmail, setAdminTargetEmail] = useState('');
  const [fetchedAdminUser, setFetchedAdminUser] = useState<UserProfile | null>(null);
  const [recentUsers, setRecentUsers] = useState<UserProfile[]>([]);
  const [adminCoinAmount, setAdminCoinAmount] = useState<string>('');
  const [adminEditName, setAdminEditName] = useState('');
  const [adminEditBio, setAdminEditBio] = useState('');
  const [adminNotification, setAdminNotification] = useState('');
  const [showAssignFrameModal, setShowAssignFrameModal] = useState(false);
  
  // Admin: Rooms Management
  const [adminRooms, setAdminRooms] = useState<Room[]>([]);
  const [showAdminCreateRoom, setShowAdminCreateRoom] = useState(false);
  const [adminNewRoomName, setAdminNewRoomName] = useState('');
  const [adminNewRoomOwnerId, setAdminNewRoomOwnerId] = useState('');
  
  // Admin: Listeners Management
  const [adminListeners, setAdminListeners] = useState<UserProfile[]>([]);

  // Admin: Reports
  const [adminReports, setAdminReports] = useState<Report[]>([]);

  // Admin: Stickers, Gifts, Frames
  const [adminStickers, setAdminStickers] = useState<Sticker[]>([]);
  const [adminGifts, setAdminGifts] = useState<GiftItem[]>([]);
  const [adminFrames, setAdminFrames] = useState<Frame[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  
  // Gift Form
  const [newGiftName, setNewGiftName] = useState('');
  const [newGiftPrice, setNewGiftPrice] = useState(10);
  const [giftIconUploading, setGiftIconUploading] = useState(false);
  const [giftAnimUploading, setGiftAnimUploading] = useState(false);
  const [tempGiftIcon, setTempGiftIcon] = useState('');
  const [tempGiftAnim, setTempGiftAnim] = useState('');

  const stickerInputRef = useRef<HTMLInputElement>(null);
  const giftIconInputRef = useRef<HTMLInputElement>(null);
  const giftAnimInputRef = useRef<HTMLInputElement>(null);
  const frameInputRef = useRef<HTMLInputElement>(null);

  // Admin: Backgrounds
  const [adminBackgrounds, setAdminBackgrounds] = useState<RoomBackground[]>([]);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  // Admin: Dashboard
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  
  // Admin: Stats
  const [stats, setStats] = useState({ totalUsers: 0, activeRooms: 0, onlineListeners: 0, totalCoins: 0, pendingReports: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const adminFileInputRef = useRef<HTMLInputElement>(null);

  const faqs = [
    { q: "How do I buy coins?", a: "Go to your Wallet in the profile tab, select an amount, and click 'Pay Now'." },
    { q: "How do I create a room?", a: "Currently, room creation is restricted. Please contact support or an admin to request a room assignment." },
    { q: "How do I report a user?", a: "Click on a user's avatar in a room or chat, then select 'Report' from the menu." },
    { q: "Can I change my username?", a: "Yes, go to your Profile and click the 'Edit' button." },
    { q: "How do I become a listener?", a: "Listener status is granted by admins. Apply by contacting support." }
  ];

  // MISSING VARIABLES & FUNCTIONS
  const isAdmin = user.email === ADMIN_EMAIL;
  const canEditProfile = true; 

  const copyId = () => {
    if (user.uniqueId) {
      navigator.clipboard.writeText(user.uniqueId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFileToCloudinary(file);
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { photoURL: url });
      setEditedPhoto(url);
      onUpdate();
    } catch (error) {
      console.error("Error uploading image:", error);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!editedName.trim()) {
        alert("Name cannot be empty");
        return;
    }
    setLoading(true);
    try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
            displayName: editedName,
            bio: editedBio
        });
        setIsEditing(false);
        onUpdate();
    } catch (e) {
        console.error("Error saving profile:", e);
    } finally {
        setLoading(false);
    }
  };

  const handleShowList = async (type: 'followers' | 'following') => {
      setShowUserList(type);
      setLoadingList(true);
      const ids = type === 'followers' ? user.followers : user.following;
      
      if (ids && ids.length > 0) {
          try {
              // Fetching users in batches of 10
              const profiles: UserProfile[] = [];
              for (let i = 0; i < ids.length; i += 10) {
                  const chunk = ids.slice(i, i + 10);
                  const q = query(collection(db, 'users'), where('uid', 'in', chunk));
                  const snapshot = await getDocs(q);
                  snapshot.forEach(doc => profiles.push(doc.data() as UserProfile));
              }
              setUserList(profiles);
          } catch (e) {
              console.error("Error fetching list:", e);
          }
      } else {
          setUserList([]);
      }
      setLoadingList(false);
  };

  const handleAdminImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !fetchedAdminUser) return;
      try {
          const url = await uploadFileToCloudinary(file);
          const userRef = doc(db, 'users', fetchedAdminUser.uid);
          await updateDoc(userRef, { photoURL: url });
          setFetchedAdminUser(prev => prev ? { ...prev, photoURL: url } : null);
          alert("User image updated.");
      } catch (e) {
          console.error(e);
          alert("Update failed.");
      }
  };

  const handleAdminSearchUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminTargetEmail) return;
    setLoading(true);
    try {
        const q = query(collection(db, 'users'), where('email', '==', adminTargetEmail));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const data = snap.docs[0].data() as UserProfile;
            setFetchedAdminUser(data);
            setAdminEditName(data.displayName || '');
            setAdminEditBio(data.bio || '');
        } else {
            setFetchedAdminUser(null);
            alert("User not found");
        }
    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  const handleAdminUpdateUser = async () => {
    if (!fetchedAdminUser) return;
    try {
        const userRef = doc(db, 'users', fetchedAdminUser.uid);
        await updateDoc(userRef, {
            displayName: adminEditName || fetchedAdminUser.displayName,
            bio: adminEditBio || fetchedAdminUser.bio
        });
        setFetchedAdminUser(prev => prev ? { ...prev, displayName: adminEditName, bio: adminEditBio } : null);
        alert("User updated.");
    } catch (e) {
        console.error(e);
        alert("Update failed.");
    }
  };

  const handleAdminAddCoins = async () => {
    if (!fetchedAdminUser || !adminCoinAmount) return;
    const amount = parseInt(adminCoinAmount);
    if (isNaN(amount)) return;
    
    try {
        const userRef = doc(db, 'users', fetchedAdminUser.uid);
        await updateDoc(userRef, { walletBalance: increment(amount) });
        setFetchedAdminUser(prev => prev ? { ...prev, walletBalance: (prev.walletBalance || 0) + amount } : null);
        setAdminCoinAmount('');
        alert("Coins added.");
    } catch (e) {
        console.error(e);
        alert("Failed.");
    }
  };

  const renderAdminDashboard = () => (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in">
          <StatCard label="Total Users" value={stats.totalUsers} icon={Users} color="text-violet-500" />
          <StatCard label="Active Rooms" value={stats.activeRooms} icon={Mic} color="text-emerald-500" />
          <StatCard label="Online Listeners" value={stats.onlineListeners} icon={Headphones} color="text-cyan-500" />
          <StatCard label="Total Coins" value={stats.totalCoins} icon={Coins} color="text-yellow-500" />
          
          <div className="col-span-2 bg-[#1A1A21] p-5 rounded-2xl border border-white/5 flex items-center justify-between">
              <div>
                  <h3 className="text-white font-bold flex items-center gap-2"><AlertTriangle size={18} className="text-orange-500"/> Maintenance Mode</h3>
                  <p className="text-xs text-gray-500">Disable app access for non-admins</p>
              </div>
              <button 
                onClick={async () => {
                    const newValue = !maintenanceMode;
                    await setDoc(doc(db, 'system', 'general'), { maintenanceMode: newValue }, { merge: true });
                    setMaintenanceMode(newValue);
                }}
                className={`w-12 h-6 rounded-full p-1 transition-colors ${maintenanceMode ? 'bg-orange-500' : 'bg-gray-700'}`}
              >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${maintenanceMode ? 'translate-x-6' : ''}`} />
              </button>
          </div>
          
          <div className="col-span-2 bg-[#1A1A21] p-5 rounded-2xl border border-white/5">
               <h3 className="text-white font-bold mb-2 flex items-center gap-2"><Megaphone size={16}/> System Broadcast</h3>
               <div className="flex gap-2">
                   <input 
                      type="text" 
                      value={broadcastMessage} 
                      onChange={(e) => setBroadcastMessage(e.target.value)}
                      placeholder="Send alert to all users..." 
                      className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                   />
                   <button 
                      onClick={() => {
                          alert(`Broadcast sent: ${broadcastMessage}`);
                          setBroadcastMessage('');
                      }}
                      className="px-4 bg-violet-600 rounded-xl text-xs font-bold"
                   >
                       Send
                   </button>
               </div>
          </div>
      </div>
  );

  useEffect(() => {
    setEditedName(user.displayName || '');
    setEditedPhoto(user.photoURL || '');
    setEditedBio(user.bio || '');
  }, [user]);

  useEffect(() => {
      if (visitingProfile) {
          setIsFollowingVisitor(user.following?.includes(visitingProfile.uid) || false);
      }
  }, [visitingProfile, user.following]);

  useEffect(() => {
      if (showPrivacyModal && user.blockedUsers && user.blockedUsers.length > 0) {
          setLoadingBlocked(true);
          const fetchBlocked = async () => {
              try {
                  const profiles: UserProfile[] = [];
                  for (const uid of user.blockedUsers!) {
                      const docSnap = await getDoc(doc(db, 'users', uid));
                      if (docSnap.exists()) {
                          profiles.push(docSnap.data() as UserProfile);
                      }
                  }
                  setBlockedProfiles(profiles);
              } catch (e) {
                  console.error(e);
              } finally {
                  setLoadingBlocked(false);
              }
          };
          fetchBlocked();
      } else {
          setBlockedProfiles([]);
      }
  }, [showPrivacyModal, user.blockedUsers]);

  useEffect(() => {
    if (showAdminPanel && user.email === ADMIN_EMAIL) {
      fetchAdminStats();
    }
  }, [showAdminPanel, adminTab]);

  const fetchAdminStats = async () => {
    setLoading(true);
    try {
      const roomsQuery = query(collection(db, 'rooms'), orderBy('createdAt', 'desc'));
      const roomsSnap = await getDocs(roomsQuery);
      const roomsData = roomsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Room));
      setAdminRooms(roomsData);

      const listenersQuery = query(collection(db, 'users'), where('isAuthorizedListener', '==', true));
      const listenersSnap = await getDocs(listenersQuery);
      const listenersData = listenersSnap.docs.map(d => ({ ...d.data(), uid: d.id } as UserProfile));
      setAdminListeners(listenersData);

      const activeListenersSnap = await getDocs(collection(db, 'activeListeners'));

      const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(20));
      const usersSnap = await getDocs(usersQuery);
      const recentUsersData = usersSnap.docs.map(d => ({ ...d.data(), uid: d.id } as UserProfile));
      setRecentUsers(recentUsersData);

      const reportsQuery = query(collection(db, 'reports'), orderBy('timestamp', 'desc'));
      const reportsSnap = await getDocs(reportsQuery);
      const reportsData = reportsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Report));
      setAdminReports(reportsData);

      const stickersQuery = query(collection(db, 'stickers'), orderBy('createdAt', 'desc'));
      const stickersSnap = await getDocs(stickersQuery);
      const stickersData = stickersSnap.docs.map(d => ({ ...d.data(), id: d.id } as Sticker));
      setAdminStickers(stickersData);

      const giftsQuery = query(collection(db, 'gifts'), orderBy('price', 'asc'));
      const giftsSnap = await getDocs(giftsQuery);
      const giftsData = giftsSnap.docs.map(d => ({ ...d.data(), id: d.id } as GiftItem));
      setAdminGifts(giftsData);

      const bgQuery = query(collection(db, 'roomBackgrounds'), orderBy('createdAt', 'desc'));
      const bgSnap = await getDocs(bgQuery);
      const bgData = bgSnap.docs.map(d => ({ ...d.data(), id: d.id } as RoomBackground));
      setAdminBackgrounds(bgData);
      
      const framesQuery = query(collection(db, 'frames'), orderBy('createdAt', 'desc'));
      const framesSnap = await getDocs(framesQuery);
      const framesData = framesSnap.docs.map(d => ({ ...d.data(), id: d.id } as Frame));
      setAdminFrames(framesData);

      const sysDoc = await getDoc(doc(db, 'system', 'general'));
      if (sysDoc.exists()) {
          setMaintenanceMode(sysDoc.data().maintenanceMode || false);
      }

      setStats({
        totalUsers: 100 + recentUsersData.length, 
        activeRooms: roomsData.filter(r => r.active).length,
        onlineListeners: activeListenersSnap.size,
        totalCoins: recentUsersData.reduce((acc, curr) => acc + (curr.walletBalance || 0), 0),
        pendingReports: reportsData.filter(r => r.status === 'pending').length
      });

    } catch (e) {
      console.error("Admin fetch error", e);
    } finally {
      setLoading(false);
    }
  };

  const uploadFileToCloudinary = async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', 'Heartly image');
      const resourceType = file.name.endsWith('.svga') ? 'raw' : 'image';
      const response = await fetch(`https://api.cloudinary.com/v1_1/dtxvdtt78/${resourceType}/upload`, { method: 'POST', body: formData });
      const data = await response.json();
      return data.secure_url;
  };

  const handleStickerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setLoading(true);
      try {
          const url = await uploadFileToCloudinary(file);
          await addDoc(collection(db, 'stickers'), { url, name: file.name, createdAt: Date.now() });
          alert("Sticker added!");
          fetchAdminStats();
      } catch (e) { console.error(e); alert("Failed"); } finally { setLoading(false); }
  };
  
  const handleFrameUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setLoading(true);
      try {
          const url = await uploadFileToCloudinary(file);
          await addDoc(collection(db, 'frames'), { url, name: file.name.split('.')[0], createdAt: Date.now() });
          alert("Frame added!");
          fetchAdminStats();
      } catch (e) { console.error(e); alert("Failed to upload frame"); } finally { setLoading(false); }
  };

  const handleDeleteFrame = async (e: React.MouseEvent, frameId: string) => {
      e.stopPropagation();
      if(!window.confirm("Permanently delete this frame?")) return;
      try {
          await deleteDoc(doc(db, 'frames', frameId));
          setAdminFrames(prev => prev.filter(f => f.id !== frameId));
      } catch(e) { console.error(e); }
  };

  const handleAssignFrame = async (frame: Frame) => {
      if (!fetchedAdminUser) return;
      setLoading(true);
      try {
          const userRef = doc(db, 'users', fetchedAdminUser.uid);
          await updateDoc(userRef, {
              ownedFrames: arrayUnion(frame)
          });
          alert(`Assigned ${frame.name} to ${fetchedAdminUser.displayName}`);
          setShowAssignFrameModal(false);
      } catch (e) { console.error(e); alert("Failed to assign"); } finally { setLoading(false); }
  };

  const handleEquipFrame = async (frame: Frame) => {
      try {
          const userRef = doc(db, 'users', user.uid);
          await updateDoc(userRef, { frameUrl: frame.url });
          onUpdate();
          setShowBagModal(false);
      } catch (e) { console.error(e); }
  };

  const handleUnequipFrame = async () => {
      try {
          const userRef = doc(db, 'users', user.uid);
          await updateDoc(userRef, { frameUrl: null });
          onUpdate();
          setShowBagModal(false);
      } catch (e) { console.error(e); }
  };

  const renderAdminFrames = () => (
      <div className="h-full flex flex-col animate-fade-in">
           <div className="flex justify-between items-center mb-6">
               <h2 className="text-xl font-bold text-white">Avatar Frames</h2>
               <div className="flex gap-2">
                   <input type="file" ref={frameInputRef} className="hidden" accept="image/png, image/webp, image/gif" onChange={handleFrameUpload} />
                   <button onClick={() => frameInputRef.current?.click()} disabled={loading} className="px-4 py-2 bg-white text-black rounded-xl hover:bg-gray-200 text-xs font-bold flex items-center gap-2">
                       {loading ? <Loader2 size={16} className="animate-spin"/> : <Plus size={16}/>} Upload Frame
                   </button>
               </div>
           </div>

           <div className="grid grid-cols-3 md:grid-cols-5 gap-4 overflow-y-auto pb-4">
               {adminFrames.map(frame => (
                   <div key={frame.id} className="relative group bg-[#1A1A21] rounded-xl p-4 border border-white/5 flex flex-col items-center">
                       <div className="relative w-20 h-20 mb-2">
                           <div className="absolute inset-2 bg-gray-700 rounded-full opacity-50"></div>
                           <img src={frame.url} className="absolute inset-0 w-full h-full object-contain z-10" />
                       </div>
                       <p className="text-xs font-bold text-white truncate w-full text-center">{frame.name}</p>
                       <button onClick={(e) => handleDeleteFrame(e, frame.id)} className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity transform scale-75">
                           <X size={12}/>
                       </button>
                   </div>
               ))}
           </div>
      </div>
  );

  const renderAdminUsers = () => (
      <div className="h-full flex flex-col animate-fade-in">
          <form onSubmit={handleAdminSearchUser} className="flex gap-2 mb-6">
              <input 
                 type="text" 
                 value={adminTargetEmail}
                 onChange={(e) => setAdminTargetEmail(e.target.value)}
                 placeholder="User Email..."
                 className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white"
              />
              <button type="submit" disabled={loading} className="bg-violet-600 px-6 rounded-xl text-white font-bold">Search</button>
          </form>
          
          {fetchedAdminUser ? (
              <div className="bg-[#121216] border border-white/10 rounded-2xl p-6 flex-1 overflow-y-auto">
                   <div className="flex flex-col md:flex-row items-start justify-between mb-8 gap-6 border-b border-white/5 pb-8">
                       <div className="flex items-center gap-6">
                           <div className="relative group w-24 h-24">
                                <div className="relative w-full h-full">
                                    <img src={fetchedAdminUser.photoURL || ''} className="w-full h-full rounded-2xl bg-gray-800 object-cover border-4 border-[#25252D] shadow-2xl" />
                                    {fetchedAdminUser.frameUrl && <img src={fetchedAdminUser.frameUrl} className="absolute -inset-2 w-[120%] h-[120%] object-contain z-10" />}
                                </div>
                                <input type="file" ref={adminFileInputRef} className="hidden" onChange={handleAdminImageUpload} accept="image/*" />
                                <button onClick={() => adminFileInputRef.current?.click()} className="absolute -bottom-2 -right-2 p-2 bg-white text-black rounded-full shadow-lg hover:scale-110 transition-transform z-20"><Camera size={14}/></button>
                           </div>
                           <div>
                               <h3 className="text-2xl font-bold text-white">{fetchedAdminUser.displayName}</h3>
                               <p className="text-gray-500 text-sm">{fetchedAdminUser.email}</p>
                               <p className="text-violet-400 font-mono mt-1">ID: {fetchedAdminUser.uniqueId}</p>
                           </div>
                       </div>
                   </div>
                   
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                       <div className="space-y-4">
                           <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2"><Edit2 size={14}/> Edit Profile</h4>
                           <input type="text" value={adminEditName} onChange={(e) => setAdminEditName(e.target.value)} placeholder="Display Name" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white" />
                           <textarea value={adminEditBio} onChange={(e) => setAdminEditBio(e.target.value)} placeholder="Bio" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white h-24 resize-none" />
                           <button onClick={handleAdminUpdateUser} className="w-full bg-violet-600 hover:bg-violet-500 py-3 rounded-xl font-bold text-white shadow-lg">Update Profile</button>
                       </div>
                       
                       <div className="space-y-6">
                           <div>
                               <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2"><Wallet size={14}/> Wallet Balance: {fetchedAdminUser.walletBalance || 0}</h4>
                               <div className="flex gap-2">
                                   <input type="number" value={adminCoinAmount} onChange={(e) => setAdminCoinAmount(e.target.value)} placeholder="Amount" className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white" />
                                   <button onClick={handleAdminAddCoins} className="bg-yellow-500 text-black px-6 rounded-xl font-bold">Add</button>
                               </div>
                           </div>

                           <div>
                               <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2"><Gift size={14}/> Items</h4>
                               <button onClick={() => setShowAssignFrameModal(true)} className="w-full py-3 bg-fuchsia-600/10 text-fuchsia-400 border border-fuchsia-600/20 rounded-xl font-bold hover:bg-fuchsia-600/20 flex items-center justify-center gap-2">
                                   <FrameIcon size={16} /> Give Frame
                               </button>
                           </div>
                       </div>
                   </div>
              </div>
          ) : (
             <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                 <Search size={48} className="mb-4 opacity-50"/>
                 <p>Search for a user by email to manage them</p>
             </div>
          )}

          {showAssignFrameModal && (
              <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4">
                  <div className="bg-[#1A1A21] w-full max-w-md rounded-2xl border border-white/10 p-6 shadow-2xl">
                      <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-bold text-white">Select Frame to Give</h3>
                          <button onClick={() => setShowAssignFrameModal(false)}><X size={20} className="text-gray-400"/></button>
                      </div>
                      <div className="grid grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto p-2">
                          {adminFrames.map(frame => (
                              <button key={frame.id} onClick={() => handleAssignFrame(frame)} className="flex flex-col items-center bg-black/40 p-3 rounded-xl hover:bg-white/5 border border-white/5">
                                  <img src={frame.url} className="w-16 h-16 object-contain mb-2" />
                                  <span className="text-xs text-white truncate w-full">{frame.name}</span>
                              </button>
                          ))}
                      </div>
                  </div>
              </div>
          )}
      </div>
  );

  return (
    <div className="flex flex-col h-full bg-transparent text-white relative">
      <input type="file" ref={fileInputRef} className="hidden" accept="image/png, image/jpeg, image/jpg, image/webp" onChange={handleImageUpload} />
      
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-violet-900/20 to-transparent pointer-events-none z-0" />

      <div className="flex-1 overflow-y-auto pb-24 px-4 pt-6 space-y-5 no-scrollbar relative z-10">
        
        <div className="bg-[#121216]/80 backdrop-blur-xl border border-white/10 rounded-[2rem] p-5 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-40 h-40 bg-violet-600/10 rounded-full blur-[60px] pointer-events-none -mr-10 -mt-10"></div>
            
            <div className="flex gap-5 relative z-10">
                <div className="relative flex-shrink-0 w-20 h-20">
                    <div className="w-full h-full rounded-[1.2rem] p-[2px] bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg relative z-0">
                        <img 
                            src={isEditing ? editedPhoto : (user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`)} 
                            className="w-full h-full rounded-[1rem] object-cover bg-gray-900"
                            alt="Profile"
                        />
                    </div>
                    {user.frameUrl && (
                        <div className="absolute -inset-3 z-10 pointer-events-none">
                            <img src={user.frameUrl} className="w-full h-full object-contain" />
                        </div>
                    )}

                    {canEditProfile && isEditing && !uploading && (
                         <button onClick={() => fileInputRef.current?.click()} className="absolute -bottom-2 -right-2 p-1.5 bg-white text-black rounded-full shadow-lg hover:scale-110 transition-transform z-30"><Camera size={12} /></button>
                     )}
                </div>

                <div className="flex-1 min-w-0 pt-0.5">
                    {isEditing && canEditProfile ? (
                        <div className="space-y-2">
                             <input type="text" value={editedName} onChange={(e) => setEditedName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm font-bold text-white outline-none focus:border-violet-500" placeholder="Display Name" />
                             <input type="text" value={editedBio} onChange={(e) => setEditedBio(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-gray-300 outline-none focus:border-violet-500" placeholder="Bio" maxLength={60} />
                        </div>
                    ) : (
                        <>
                            <div className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-lg font-bold text-white leading-tight truncate flex items-center gap-1.5">
                                        {user.displayName}
                                        {user.isAuthorizedListener && <ShieldCheck size={14} className="text-emerald-400" />}
                                    </h2>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] bg-white/5 border border-white/5 px-1.5 py-0.5 rounded text-gray-400 font-mono tracking-wide">@{user.uniqueId}</span>
                                        <button onClick={copyId} className="text-gray-500 hover:text-white transition-colors">{copied ? <CheckCircle2 size={12} className="text-green-500"/> : <Copy size={12}/>}</button>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    {canEditProfile && (
                                        <button onClick={() => setIsEditing(true)} className="p-2 bg-white/5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                                            <Edit2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <p className="text-xs text-gray-400 mt-2 line-clamp-1 leading-relaxed">{user.bio || 'No bio yet.'}</p>
                        </>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-3 mt-5 relative z-10">
                 <button onClick={() => handleShowList('following')} className="flex-1 bg-[#0A0A0F]/50 rounded-xl p-3 flex flex-col items-center border border-white/5 group active:scale-95 transition-transform hover:bg-white/5">
                     <span className="text-sm font-extrabold text-white group-hover:text-violet-300 transition-colors">{user.following?.length || 0}</span>
                     <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Following</span>
                 </button>
                 <button onClick={() => handleShowList('followers')} className="flex-1 bg-[#0A0A0F]/50 rounded-xl p-3 flex flex-col items-center border border-white/5 group active:scale-95 transition-transform hover:bg-white/5">
                     <span className="text-sm font-extrabold text-white group-hover:text-fuchsia-300 transition-colors">{user.followers?.length || 0}</span>
                     <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Followers</span>
                 </button>
                 
                 <button onClick={() => { setShowRechargeModal(true); setWalletTab('recharge'); }} className="flex-1 bg-gradient-to-br from-yellow-500/10 to-amber-500/10 rounded-xl p-3 flex flex-col items-center border border-yellow-500/20 group active:scale-95 transition-transform hover:bg-yellow-500/20">
                     <span className="text-sm font-extrabold text-yellow-500">{user.walletBalance || 0}</span>
                     <span className="text-[9px] text-yellow-600/70 uppercase font-bold tracking-wider">Coins</span>
                 </button>
            </div>
            
            <div className="mt-3">
                <button onClick={() => setShowBagModal(true)} className="w-full bg-[#1A1A21] border border-white/10 rounded-xl py-2 flex items-center justify-center gap-2 text-xs font-bold text-gray-300 hover:text-white hover:bg-white/5 transition-all">
                    <ShoppingBag size={14} className="text-violet-400" /> My Bag
                </button>
            </div>

            {isEditing && (
                 <div className="flex gap-3 mt-4 pt-4 border-t border-white/5 animate-fade-in">
                     <button onClick={() => { setIsEditing(false); }} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 font-bold rounded-xl text-xs transition-colors">Cancel</button>
                     <button onClick={handleSave} disabled={loading || uploading} className="flex-1 py-2.5 bg-white text-black font-bold rounded-xl text-xs shadow-lg transition-colors flex items-center justify-center gap-2">{loading ? <Loader2 className="animate-spin" size={14} /> : 'Save Changes'}</button>
                 </div>
            )}
        </div>

        <div>
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 ml-2">Menu</h3>
            <div className="space-y-3">
                {isAdmin && (
                    <SettingsItem onClick={() => setShowAdminPanel(true)} icon={<ShieldAlert size={18} />} color="text-red-500" bg="bg-red-500/10" label="Admin Dashboard" badge="ACCESS" />
                )}
                 <SettingsItem onClick={() => setShowPrivacyModal(true)} icon={<Shield size={18} />} color="text-emerald-400" bg="bg-emerald-400/10" label="Privacy Center" />
                 <SettingsItem onClick={() => setShowHelpModal(true)} icon={<HelpCircle size={18} />} color="text-cyan-400" bg="bg-cyan-400/10" label="Help & Support" />
            </div>
        </div>
        
        <button onClick={onLogout} className="w-full bg-[#121216]/50 border border-red-500/10 p-4 rounded-2xl flex items-center justify-center gap-2 text-red-400 font-bold text-xs hover:bg-red-500/10 transition-all active:scale-[0.98]">
            <LogOut size={16} />Sign Out
        </button>
        
        <p className="text-center text-[10px] text-gray-700 pb-4">Heartly Voice v2.6</p>
      </div>

      {showBagModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setShowBagModal(false)}>
              <div className="bg-[#121216] w-full max-w-sm rounded-[2rem] border border-white/10 shadow-2xl animate-fade-in flex flex-col max-h-[70vh]" onClick={e => e.stopPropagation()}>
                  <div className="p-4 border-b border-white/5 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2"><ShoppingBag size={20} className="text-violet-400"/> My Bag</h3>
                      <button onClick={() => setShowBagModal(false)}><X size={20} className="text-gray-400"/></button>
                  </div>
                  <div className="p-6 overflow-y-auto">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Frames</h4>
                      {!user.ownedFrames || user.ownedFrames.length === 0 ? (
                          <p className="text-center text-gray-500 text-xs py-8">No frames owned yet.</p>
                      ) : (
                          <div className="grid grid-cols-3 gap-4">
                              <button onClick={handleUnequipFrame} className="flex flex-col items-center bg-white/5 p-3 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                                  <div className="w-16 h-16 rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center mb-2 text-gray-500">
                                      <Ban size={20} />
                                  </div>
                                  <span className="text-[10px] text-gray-400">None</span>
                              </button>
                              
                              {user.ownedFrames.map(frame => (
                                  <button 
                                    key={frame.id} 
                                    onClick={() => handleEquipFrame(frame)}
                                    className={`flex flex-col items-center p-3 rounded-xl border transition-all relative ${user.frameUrl === frame.url ? 'bg-violet-600/20 border-violet-500' : 'bg-black/40 border-white/5 hover:bg-white/10'}`}
                                  >
                                      <div className="relative w-16 h-16 mb-2">
                                          <div className="absolute inset-1 bg-gray-700 rounded-full opacity-50"></div>
                                          <img src={frame.url} className="absolute inset-0 w-full h-full object-contain z-10" />
                                      </div>
                                      <span className="text-[10px] text-white truncate w-full text-center">{frame.name}</span>
                                      {user.frameUrl === frame.url && (
                                          <div className="absolute top-2 right-2 bg-green-500 rounded-full p-0.5"><CheckCircle2 size={10} className="text-black"/></div>
                                      )}
                                  </button>
                              ))}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {showAdminPanel && isAdmin && (
        <div className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-xl flex flex-col md:flex-row overflow-hidden animate-fade-in">
            <div className="md:hidden flex items-center justify-between p-4 border-b border-white/5">
                <h2 className="text-lg font-bold text-white flex items-center gap-2"><ShieldAlert size={18} className="text-red-500"/> Admin Panel</h2>
                <button onClick={() => setShowAdminPanel(false)}><X size={24} className="text-gray-400"/></button>
            </div>
            
            <div className="md:w-64 bg-[#121216] border-b md:border-b-0 md:border-r border-white/5 flex flex-row md:flex-col flex-shrink-0 overflow-x-auto md:overflow-visible no-scrollbar p-2 gap-1 md:gap-2">
                <div className="hidden md:flex items-center gap-3 p-4 mb-2">
                    <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center text-red-500"><ShieldAlert size={20}/></div>
                    <div>
                        <h3 className="font-bold text-white text-sm">Admin Panel</h3>
                        <p className="text-[10px] text-gray-500">System Management</p>
                    </div>
                </div>
                
                {[
                    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
                    { id: 'users', label: 'User Mgmt', icon: Users },
                    { id: 'rooms', label: 'Rooms', icon: Mic },
                    { id: 'reports', label: 'Reports', icon: Flag },
                    { id: 'gifts', label: 'Gifts', icon: Gift },
                    { id: 'listeners', label: 'Listeners', icon: Headphones },
                    { id: 'stickers', label: 'Stickers', icon: Smile },
                    { id: 'backgrounds', label: 'Backgrounds', icon: ImageIcon },
                    { id: 'frames', label: 'Frames', icon: FrameIcon },
                ].map(item => (
                    <button 
                        key={item.id}
                        onClick={() => setAdminTab(item.id as AdminTab)} 
                        className={`
                            flex items-center gap-3 px-4 py-3 rounded-xl transition-all whitespace-nowrap min-w-[140px] md:min-w-0
                            ${adminTab === item.id 
                                ? 'bg-white text-black font-extrabold shadow-lg transform scale-105' 
                                : 'text-gray-400 hover:text-white hover:bg-white/5 font-medium'}
                        `}
                    >
                        <item.icon size={18} className={adminTab === item.id ? 'text-black' : ''} /> 
                        <span className="text-sm">{item.label}</span>
                    </button>
                ))}
                
                <button onClick={() => setShowAdminPanel(false)} className="md:mt-auto flex items-center gap-3 px-4 py-3 rounded-xl text-gray-500 hover:text-white hover:bg-white/5 transition-all">
                    <LogOut size={18} />
                    <span className="text-sm font-bold">Exit Panel</span>
                </button>
            </div>

            <div className="flex-1 bg-[#0A0A0F] relative flex flex-col min-w-0 overflow-hidden">
                 <div className="hidden md:flex items-center justify-between px-8 py-6 border-b border-white/5">
                     <h2 className="text-2xl font-extrabold text-white capitalize">{adminTab}</h2>
                     <div className="flex items-center gap-4">
                         <div className="flex items-center gap-2 bg-[#1A1A21] px-3 py-1.5 rounded-full border border-white/5">
                             <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                             <span className="text-xs font-bold text-gray-400">System Online</span>
                         </div>
                     </div>
                 </div>

                 <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
                     {adminTab === 'dashboard' && renderAdminDashboard()}
                     {adminTab === 'users' && renderAdminUsers()}
                     {adminTab === 'frames' && renderAdminFrames()}
                 </div>
            </div>
        </div>
      )}

      {showUserList && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setShowUserList(null)}>
            <div className="bg-[#121216] w-full max-w-sm rounded-[2rem] border border-white/10 shadow-2xl animate-fade-in flex flex-col max-h-[70vh]" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-white/5 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white capitalize">{showUserList}</h3>
                    <button onClick={() => setShowUserList(null)}><X size={20} className="text-gray-400"/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {loadingList ? (
                        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-500" /></div>
                    ) : userList.length === 0 ? (
                        <p className="text-center text-gray-500 text-sm py-8">No users found.</p>
                    ) : (
                        userList.map(u => (
                            <div key={u.uid} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                                <div className="flex items-center gap-3">
                                    <img src={u.photoURL || ''} className="w-10 h-10 rounded-full bg-gray-800 object-cover" />
                                    <div>
                                        <p className="text-sm font-bold text-white">{u.displayName}</p>
                                        <p className="text-[10px] text-gray-500">@{u.uniqueId}</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
      )}
      
      {showHelpModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setShowHelpModal(false)}>
            <div className="bg-[#121216] w-full max-w-sm rounded-[2rem] border border-white/10 shadow-2xl animate-fade-in flex flex-col max-h-[70vh]" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-white/5 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2"><HelpCircle size={20} className="text-cyan-400"/> Help & Support</h3>
                    <button onClick={() => setShowHelpModal(false)}><X size={20} className="text-gray-400"/></button>
                </div>
                <div className="p-4 space-y-4">
                     {faqs.map((faq, i) => (
                         <div key={i} className="border border-white/5 rounded-xl overflow-hidden">
                             <button onClick={() => setExpandedFaq(expandedFaq === i ? null : i)} className="w-full flex justify-between items-center p-3 bg-white/5 text-left">
                                 <span className="text-xs font-bold text-white">{faq.q}</span>
                                 {expandedFaq === i ? <ChevronUp size={14} className="text-gray-400"/> : <ChevronDown size={14} className="text-gray-400"/>}
                             </button>
                             {expandedFaq === i && <div className="p-3 text-xs text-gray-400 bg-black/20">{faq.a}</div>}
                         </div>
                     ))}
                     <div className="pt-4 border-t border-white/5">
                         <p className="text-xs text-gray-400 mb-2">Still need help?</p>
                         <button className="w-full py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-colors">Contact Support</button>
                     </div>
                </div>
            </div>
        </div>
      )}

      {showPrivacyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setShowPrivacyModal(false)}>
            <div className="bg-[#121216] w-full max-w-sm rounded-[2rem] border border-white/10 shadow-2xl animate-fade-in flex flex-col max-h-[70vh]" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-white/5 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2"><Shield size={20} className="text-emerald-400"/> Privacy Center</h3>
                    <button onClick={() => setShowPrivacyModal(false)}><X size={20} className="text-gray-400"/></button>
                </div>
                <div className="p-4 space-y-4 overflow-y-auto">
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Blocked Users</h4>
                        {loadingBlocked ? (
                             <div className="flex justify-center py-4"><Loader2 className="animate-spin text-gray-500" /></div>
                        ) : blockedProfiles.length === 0 ? (
                             <p className="text-gray-500 text-xs italic">No blocked users.</p>
                        ) : (
                             <div className="space-y-2">
                                 {blockedProfiles.map(p => (
                                     <div key={p.uid} className="flex justify-between items-center bg-white/5 p-2 rounded-lg">
                                         <span className="text-xs text-white font-bold">{p.displayName}</span>
                                         <button className="text-[10px] text-red-400 hover:text-white">Unblock</button>
                                     </div>
                                 ))}
                             </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
      )}

      {showRechargeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setShowRechargeModal(false)}>
            <div className="bg-[#121216] w-full max-w-sm rounded-[2rem] border border-white/10 shadow-2xl animate-fade-in flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-white/5 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2"><Wallet size={20} className="text-yellow-500"/> Wallet</h3>
                    <button onClick={() => setShowRechargeModal(false)}><X size={20} className="text-gray-400"/></button>
                </div>
                <div className="p-6 text-center">
                    <p className="text-gray-400 text-xs mb-2">Current Balance</p>
                    <h2 className="text-4xl font-extrabold text-white mb-6 flex justify-center items-center gap-2"><Coins size={32} className="text-yellow-500"/> {user.walletBalance || 0}</h2>
                    <div className="grid grid-cols-3 gap-3 mb-6">
                        {[100, 500, 1000, 2000, 5000, 10000].map(amt => (
                            <button key={amt} onClick={() => setRechargeAmount(amt)} className={`py-3 rounded-xl border font-bold text-sm transition-all ${rechargeAmount === amt ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'}`}>
                                ₹{amt}
                            </button>
                        ))}
                    </div>
                    <button className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-4 rounded-xl shadow-lg shadow-yellow-500/20 transition-all active:scale-95 flex items-center justify-center gap-2">
                        <CreditCard size={18}/> Recharge Now
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};
