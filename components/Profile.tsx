
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, Room, Report, Sticker, RoomBackground } from '../types';
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
  Image as ImageIcon
} from 'lucide-react';

interface ProfileProps {
  user: UserProfile;
  onLogout: () => void;
  onUpdate: () => void;
  onJoinRoom: (roomId: string) => void;
}

const ADMIN_EMAIL = "sv116774@gmail.com";

type AdminTab = 'dashboard' | 'users' | 'rooms' | 'listeners' | 'reports' | 'stickers' | 'backgrounds';

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
  
  // Admin: Rooms Management
  const [adminRooms, setAdminRooms] = useState<Room[]>([]);
  const [showAdminCreateRoom, setShowAdminCreateRoom] = useState(false);
  const [adminNewRoomName, setAdminNewRoomName] = useState('');
  const [adminNewRoomOwnerId, setAdminNewRoomOwnerId] = useState('');
  
  // Admin: Listeners Management
  const [adminListeners, setAdminListeners] = useState<UserProfile[]>([]);

  // Admin: Reports
  const [adminReports, setAdminReports] = useState<Report[]>([]);

  // Admin: Stickers
  const [adminStickers, setAdminStickers] = useState<Sticker[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);

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
      // 1. Rooms
      const roomsQuery = query(collection(db, 'rooms'), orderBy('createdAt', 'desc'));
      const roomsSnap = await getDocs(roomsQuery);
      const roomsData = roomsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Room));
      setAdminRooms(roomsData);

      // 2. Listeners
      const listenersQuery = query(collection(db, 'users'), where('isAuthorizedListener', '==', true));
      const listenersSnap = await getDocs(listenersQuery);
      const listenersData = listenersSnap.docs.map(d => ({ ...d.data(), uid: d.id } as UserProfile));
      setAdminListeners(listenersData);

      // 3. Online Listeners
      const activeListenersSnap = await getDocs(collection(db, 'activeListeners'));

      // 4. Recent Users (Last 20)
      const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(20));
      const usersSnap = await getDocs(usersQuery);
      const recentUsersData = usersSnap.docs.map(d => ({ ...d.data(), uid: d.id } as UserProfile));
      setRecentUsers(recentUsersData);

      // 5. Reports
      const reportsQuery = query(collection(db, 'reports'), orderBy('timestamp', 'desc'));
      const reportsSnap = await getDocs(reportsQuery);
      const reportsData = reportsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Report));
      setAdminReports(reportsData);

      // 6. Stickers
      const stickersQuery = query(collection(db, 'stickers'), orderBy('createdAt', 'desc'));
      const stickersSnap = await getDocs(stickersQuery);
      const stickersData = stickersSnap.docs.map(d => ({ ...d.data(), id: d.id } as Sticker));
      setAdminStickers(stickersData);

      // 7. Backgrounds
      const bgQuery = query(collection(db, 'roomBackgrounds'), orderBy('createdAt', 'desc'));
      const bgSnap = await getDocs(bgQuery);
      const bgData = bgSnap.docs.map(d => ({ ...d.data(), id: d.id } as RoomBackground));
      setAdminBackgrounds(bgData);

      // 8. System Config
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

  const handleStickerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setLoading(true);
      try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('upload_preset', 'Heartly image');
          const response = await fetch('https://api.cloudinary.com/v1_1/dtxvdtt78/image/upload', { method: 'POST', body: formData });
          const data = await response.json();
          
          await addDoc(collection(db, 'stickers'), {
              url: data.secure_url,
              name: file.name,
              createdAt: Date.now()
          });
          
          alert("Sticker added!");
          fetchAdminStats();
      } catch (e) { console.error(e); alert("Failed to upload sticker"); } finally { setLoading(false); }
  };

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setLoading(true);
      try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('upload_preset', 'Heartly image');
          const response = await fetch('https://api.cloudinary.com/v1_1/dtxvdtt78/image/upload', { method: 'POST', body: formData });
          const data = await response.json();
          
          await addDoc(collection(db, 'roomBackgrounds'), {
              url: data.secure_url,
              name: file.name,
              createdAt: Date.now()
          });
          
          alert("Background added!");
          fetchAdminStats();
      } catch (e) { console.error(e); alert("Failed to upload background"); } finally { setLoading(false); }
  };

  const handleDeleteSticker = async (e: React.MouseEvent, stickerId: string) => {
      e.stopPropagation();
      if(!window.confirm("Permanently delete this sticker?")) return;
      try {
          await deleteDoc(doc(db, 'stickers', stickerId));
          setAdminStickers(prev => prev.filter(s => s.id !== stickerId));
          if (selectedStickerId === stickerId) setSelectedStickerId(null);
      } catch(e) { console.error("Error deleting sticker", e); }
  };

  const handleDeleteBackground = async (bgId: string) => {
      if(!window.confirm("Permanently delete this background?")) return;
      try {
          await deleteDoc(doc(db, 'roomBackgrounds', bgId));
          setAdminBackgrounds(prev => prev.filter(b => b.id !== bgId));
      } catch(e) { console.error("Error deleting background", e); }
  };

  const adminCreateRoom = async () => {
      const inputId = adminNewRoomOwnerId.trim();
      if (!adminNewRoomName.trim() || !inputId) {
          alert("Please fill in Room Name and Owner ID/Unique ID.");
          return;
      }
      setLoading(true);
      try {
          let targetUid = inputId;
          let userData: any = null;

          const userDocRef = doc(db, 'users', inputId);
          const userSnap = await getDoc(userDocRef);

          if (userSnap.exists()) {
              userData = userSnap.data();
              targetUid = userSnap.id;
          } else {
              const q = query(collection(db, 'users'), where('uniqueId', '==', inputId.toUpperCase()));
              const querySnap = await getDocs(q);
              
              if (!querySnap.empty) {
                  const doc = querySnap.docs[0];
                  userData = doc.data();
                  targetUid = doc.id;
              }
          }

          if (!userData) {
              alert("User not found! Please check the ID.");
              setLoading(false);
              return;
          }

          await addDoc(collection(db, 'rooms'), {
              name: adminNewRoomName,
              createdBy: targetUid,
              creatorName: userData.displayName || 'User',
              createdAt: Date.now(),
              participants: [],
              lockedSeats: [],
              active: false,
              admins: [],
              password: '',
              backgroundImage: '',
              kickedUsers: {}
          });

          setAdminNewRoomName('');
          setAdminNewRoomOwnerId('');
          setShowAdminCreateRoom(false);
          alert(`Room assigned to ${userData.displayName} (ID: ${userData.uniqueId})`);
          fetchAdminStats(); 
      } catch (e: any) {
          alert("Failed: " + e.message);
      } finally {
          setLoading(false);
      }
  };

  const handleDeleteRoomClick = async (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    if(!window.confirm("PERMANENTLY delete this room?")) return;
    setAdminRooms(prev => prev.filter(r => r.id !== roomId));
    try {
      await deleteDoc(doc(db, 'rooms', roomId));
    } catch (e: any) {
      alert(`Failed: ${e.message}`);
      fetchAdminStats();
    }
  };

  const handleUnlockRoom = async (e: React.MouseEvent, roomId: string) => {
      e.stopPropagation();
      try {
          await updateDoc(doc(db, 'rooms', roomId), { password: "" });
          alert("Room Unlocked!");
          fetchAdminStats();
      } catch (e) { console.error(e); }
  };

  const handleRevokeListenerClick = async (e: React.MouseEvent, uid: string) => {
    e.stopPropagation();
    if(!window.confirm("Revoke listener status?")) return;
    setAdminListeners(prev => prev.filter(u => u.uid !== uid));
    try {
      await updateDoc(doc(db, 'users', uid), { isAuthorizedListener: false });
    } catch (e) { console.error(e); }
  };

  const handleResolveReport = async (reportId: string) => {
      try {
          await updateDoc(doc(db, 'reports', reportId), { status: 'resolved' });
          setAdminReports(prev => prev.map(r => r.id === reportId ? { ...r, status: 'resolved' } : r));
      } catch(e) { console.error(e); }
  };

  const handleDeleteReport = async (reportId: string) => {
      if(!window.confirm("Delete this report log?")) return;
      try {
          await deleteDoc(doc(db, 'reports', reportId));
          setAdminReports(prev => prev.filter(r => r.id !== reportId));
      } catch(e) { console.error(e); }
  };

  const sendGlobalAlert = async () => {
    if (!broadcastMessage.trim()) return;
    setLoading(true);
    try {
        const q = query(collection(db, 'rooms'), where('active', '==', true));
        const snapshot = await getDocs(q);
        if (snapshot.empty) { alert("No active rooms."); return; }
        const promises = snapshot.docs.map(roomDoc => 
            addDoc(collection(db, 'rooms', roomDoc.id, 'messages'), {
                text: `📢 SYSTEM: ${broadcastMessage}`,
                senderId: 'system',
                senderName: 'System',
                createdAt: Date.now(),
                type: 'system'
            })
        );
        await Promise.all(promises);
        setBroadcastMessage('');
        alert("Broadcast sent.");
    } catch (e) { alert("Broadcast failed."); } finally { setLoading(false); }
  };

  const toggleMaintenanceMode = async () => {
      const newState = !maintenanceMode;
      if (newState && !window.confirm("Enable Maintenance Mode? Users might experience issues.")) return;
      setMaintenanceMode(newState);
      await setDoc(doc(db, 'system', 'general'), { maintenanceMode: newState }, { merge: true });
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: editedName, photoURL: editedPhoto });
      }
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { displayName: editedName, photoURL: editedPhoto, bio: editedBio, updatedAt: Date.now() });
      onUpdate();
      setIsEditing(false);
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', 'Heartly image');
        const response = await fetch('https://api.cloudinary.com/v1_1/dtxvdtt78/image/upload', { method: 'POST', body: formData });
        const data = await response.json();
        setEditedPhoto(data.secure_url);
    } catch (error) { console.error(error); alert("Upload failed."); } finally { setUploading(false); }
  };

  const handleAdminImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fetchedAdminUser) return;
    setLoading(true);
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', 'Heartly image');
        const response = await fetch('https://api.cloudinary.com/v1_1/dtxvdtt78/image/upload', { method: 'POST', body: formData });
        const data = await response.json();
        const userRef = doc(db, 'users', fetchedAdminUser.uid);
        await updateDoc(userRef, { photoURL: data.secure_url, updatedAt: Date.now() });
        setFetchedAdminUser(prev => prev ? { ...prev, photoURL: data.secure_url } : null);
        alert("Profile picture updated.");
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  // --- RAZORPAY INTEGRATION ---
  const handleRecharge = async () => {
      setIsProcessing(true);
      
      // 1. Load Razorpay SDK
      const res = await loadRazorpay();
      if (!res) {
          alert('Razorpay SDK failed to load. Check connection.');
          setIsProcessing(false);
          return;
      }

      try {
          // 2. Call our Vercel API to create Order
          const response = await fetch('/api/create-order', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ amount: rechargeAmount })
          });
          const order = await response.json();

          if (!order.id) {
             throw new Error(order.error || "Order creation failed");
          }

          // 3. Open Razorpay Modal
          const options = {
              key: order.key, // Use the key returned from the backend
              amount: order.amount,
              currency: order.currency,
              name: "Heartly Voice",
              description: "Wallet Recharge",
              order_id: order.id,
              handler: async function (response: any) {
                  // 4. Verify Payment on Backend
                  const verifyRes = await fetch('/api/verify-payment', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          razorpay_order_id: response.razorpay_order_id,
                          razorpay_payment_id: response.razorpay_payment_id,
                          razorpay_signature: response.razorpay_signature,
                          userId: user.uid,
                          amount: rechargeAmount
                      })
                  });

                  const verifyData = await verifyRes.json();
                  if (verifyData.success) {
                      alert('Payment Successful! Coins added.');
                      setShowRechargeModal(false);
                      onUpdate(); // Refresh profile
                  } else {
                      alert('Payment verification failed.');
                  }
                  setIsProcessing(false);
              },
              prefill: {
                  name: user.displayName || 'User',
                  email: user.email || 'user@example.com',
                  contact: '9999999999'
              },
              theme: {
                  color: "#7C3AED" // Violet color matches app
              }
          };

          const rzp = new (window as any).Razorpay(options);
          rzp.on('payment.failed', function (response: any) {
              alert("Payment Failed: " + response.error.description);
              setIsProcessing(false);
          });
          rzp.open();

      } catch (e: any) { 
          console.error(e); 
          alert("Error: " + (e.message || "Something went wrong")); 
          setIsProcessing(false); 
      }
  };

  const handleWithdraw = async () => {
      const balance = user.commissionBalance || 0;
      if (balance < 100) { alert("Min withdrawal 100."); return; }
      setIsProcessing(true);
      await new Promise(resolve => setTimeout(resolve, 1500));
      try {
          const userRef = doc(db, 'users', user.uid);
          await updateDoc(userRef, { commissionBalance: 0 });
          alert("Request submitted!");
          setIsProcessing(false);
          setShowRechargeModal(false);
      } catch(e) { setIsProcessing(false); }
  };

  const handleSendSupport = async () => {
    if(!supportMessage.trim()) return;
    setSendingSupport(true);
    try {
        await addDoc(collection(db, 'supportTickets'), { uid: user.uid, email: user.email, message: supportMessage, createdAt: Date.now(), status: 'open' });
        alert("Support request sent! We will get back to you shortly.");
        setSupportMessage('');
        setShowHelpModal(false);
    } catch(e) { console.error(e); alert("Failed to send message."); } finally { setSendingSupport(false); }
  };

  const handleUnblock = async (blockedUid: string) => {
      if (!window.confirm("Unblock this user?")) return;
      try {
          const userRef = doc(db, 'users', user.uid);
          await updateDoc(userRef, { blockedUsers: arrayRemove(blockedUid) });
          setBlockedProfiles(prev => prev.filter(p => p.uid !== blockedUid));
          alert("User unblocked.");
      } catch (e) { console.error(e); }
  };

  const handleDeleteAccount = () => {
      const confirmation = prompt("Type 'DELETE' to confirm account deletion. This action is irreversible.");
      if (confirmation === 'DELETE') {
          alert("Account deletion request submitted. Support will process this within 24 hours.");
          setShowPrivacyModal(false);
      }
  };

  const copyId = () => {
      if (user.uniqueId) {
          navigator.clipboard.writeText(user.uniqueId);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
      }
  };

  const handleShowList = async (type: 'followers' | 'following') => {
      setShowUserList(type);
      setLoadingList(true);
      const uids = type === 'followers' ? user.followers : user.following;
      if (!uids || uids.length === 0) { setUserList([]); setLoadingList(false); return; }
      try {
          const fetchedUsers: UserProfile[] = [];
          for (const uid of uids) {
              const snap = await getDoc(doc(db, 'users', uid));
              if (snap.exists()) fetchedUsers.push(snap.data() as UserProfile);
          }
          setUserList(fetchedUsers);
      } catch (e) { console.error(e); } finally { setLoadingList(false); }
  };

  const toggleFollowVisitor = async () => {
      if (!visitingProfile) return;
      const myRef = doc(db, 'users', user.uid);
      const targetRef = doc(db, 'users', visitingProfile.uid);
      try {
          if (isFollowingVisitor) {
              await updateDoc(myRef, { following: arrayRemove(visitingProfile.uid) });
              await updateDoc(targetRef, { followers: arrayRemove(user.uid) });
              setIsFollowingVisitor(false);
          } else {
              await updateDoc(myRef, { following: arrayUnion(visitingProfile.uid) });
              await updateDoc(targetRef, { followers: arrayUnion(user.uid) });
              setIsFollowingVisitor(true);
          }
          onUpdate(); 
      } catch (e) { console.error(e); }
  };

  const searchAdminUser = async () => {
      if (!adminTargetEmail) return;
      setLoading(true);
      setFetchedAdminUser(null);
      try {
          let q = query(collection(db, 'users'), where('email', '==', adminTargetEmail));
          let snap = await getDocs(q);
          if (snap.empty) {
              q = query(collection(db, 'users'), where('uniqueId', '==', adminTargetEmail.toUpperCase()));
              snap = await getDocs(q);
          }
          if (!snap.empty) {
              const userData = snap.docs[0].data() as UserProfile;
              setFetchedAdminUser(userData);
              setAdminEditName(userData.displayName || '');
              setAdminEditBio(userData.bio || '');
          } else { alert("User not found."); }
      } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const toggleListener = async () => {
      if (!fetchedAdminUser) return;
      setLoading(true);
      try {
          const newState = !fetchedAdminUser.isAuthorizedListener;
          await updateDoc(doc(db, 'users', fetchedAdminUser.uid), { isAuthorizedListener: newState });
          setFetchedAdminUser({ ...fetchedAdminUser, isAuthorizedListener: newState });
      } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const toggleBan = async () => {
      if (!fetchedAdminUser) return;
      const newState = !fetchedAdminUser.isBanned;
      if (newState && !window.confirm("BAN this user?")) return;
      setLoading(true);
      try {
          await updateDoc(doc(db, 'users', fetchedAdminUser.uid), { isBanned: newState });
          setFetchedAdminUser(prev => prev ? { ...prev, isBanned: newState } : null);
          alert(newState ? "User BANNED." : "User UNBANNED.");
      } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const saveTargetProfile = async () => {
      if (!fetchedAdminUser) return;
      setLoading(true);
      try {
          await updateDoc(doc(db, 'users', fetchedAdminUser.uid), { displayName: adminEditName, bio: adminEditBio });
          setFetchedAdminUser(prev => prev ? { ...prev, displayName: adminEditName, bio: adminEditBio } : null);
          alert("Updated.");
      } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const sendNotification = async () => {
      if (!fetchedAdminUser || !adminNotification.trim()) return;
      setLoading(true);
      try {
         const chatId = `system_${fetchedAdminUser.uid}`;
         await setDoc(doc(db, 'chats', chatId), { id: chatId, participants: ['system', fetchedAdminUser.uid], participantDetails: [{uid: 'system', displayName: 'System', photoURL: null}], lastMessage: 'System Notification', lastMessageTime: Date.now(), updatedAt: Date.now(), unreadCounts: {[fetchedAdminUser.uid]: 1} }, {merge: true});
         await addDoc(collection(db, 'chats', chatId, 'messages'), { text: adminNotification, senderId: 'system', createdAt: Date.now(), read: false, type: 'text' });
         alert("Notification sent!");
         setAdminNotification('');
      } catch(e) { console.error(e); } finally { setLoading(false); }
  };

  const manageCoins = async (action: 'add' | 'remove') => {
      if (!fetchedAdminUser || !adminCoinAmount) return;
      const amt = parseInt(adminCoinAmount);
      if (isNaN(amt) || amt <= 0) return;
      setLoading(true);
      try {
          const finalAmt = action === 'add' ? amt : -amt;
          await updateDoc(doc(db, 'users', fetchedAdminUser.uid), { walletBalance: increment(finalAmt) });
          setFetchedAdminUser({ ...fetchedAdminUser, walletBalance: (fetchedAdminUser.walletBalance || 0) + finalAmt });
          setAdminCoinAmount('');
          alert("Balance Updated!");
      } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const isAdmin = user.email === ADMIN_EMAIL;
  const canEditProfile = !user.isAuthorizedListener || isAdmin;

  const renderAdminBackgrounds = () => (
      <div className="h-full flex flex-col animate-fade-in">
          <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
              <h2 className="text-xl font-bold text-white">Backgrounds Gallery</h2>
              <div className="flex gap-2">
                  <input type="file" ref={backgroundInputRef} className="hidden" accept="image/*" onChange={handleBackgroundUpload} />
                  <button onClick={() => backgroundInputRef.current?.click()} disabled={loading} className="px-4 py-2 bg-white text-black rounded-xl hover:bg-gray-200 text-xs font-bold flex items-center gap-2">
                      {loading ? <Loader2 size={16} className="animate-spin"/> : <Plus size={16}/>} New Image
                  </button>
              </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 overflow-y-auto pb-4">
              {adminBackgrounds.map(bg => (
                  <div key={bg.id} className="group relative bg-[#1A1A21] rounded-2xl border border-white/5 overflow-hidden aspect-video shadow-lg hover:shadow-2xl transition-all">
                      <img src={bg.url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button onClick={() => handleDeleteBackground(bg.id)} className="p-3 bg-red-600 text-white rounded-full hover:bg-red-500 shadow-xl transform scale-90 group-hover:scale-100 transition-transform"><Trash2 size={20}/></button>
                      </div>
                  </div>
              ))}
              {adminBackgrounds.length === 0 && <p className="text-gray-500 col-span-full text-center py-20 bg-white/5 rounded-2xl border border-dashed border-white/10">No backgrounds uploaded yet.</p>}
          </div>
      </div>
  );

  const renderAdminStickers = () => (
      <div className="h-full flex flex-col animate-fade-in">
          <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Sticker Pack</h2>
              <div className="flex gap-2">
                  <input type="file" ref={stickerInputRef} className="hidden" accept="image/gif, image/png, image/webp" onChange={handleStickerUpload} />
                  <button onClick={() => stickerInputRef.current?.click()} disabled={loading} className="px-4 py-2 bg-white text-black rounded-xl hover:bg-gray-200 text-xs font-bold flex items-center gap-2">
                      {loading ? <Loader2 size={16} className="animate-spin"/> : <Plus size={16}/>} Upload
                  </button>
              </div>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3 overflow-y-auto pb-4">
              {adminStickers.map(sticker => (
                  <div 
                      key={sticker.id} 
                      onClick={() => setSelectedStickerId(prev => prev === sticker.id ? null : sticker.id)}
                      className={`relative group bg-[#1A1A21] rounded-xl p-2 border transition-all cursor-pointer aspect-square flex items-center justify-center ${selectedStickerId === sticker.id ? 'border-red-500 bg-red-500/10' : 'border-white/5 hover:border-white/20'}`}
                  >
                      <img src={sticker.url} className={`w-full h-full object-contain transition-all duration-300 ${selectedStickerId === sticker.id ? 'opacity-40 scale-75' : 'group-hover:scale-110'}`} alt={sticker.name} />
                      {selectedStickerId === sticker.id && (
                          <button 
                            onClick={(e) => handleDeleteSticker(e, sticker.id)} 
                            className="absolute inset-0 flex items-center justify-center z-10 text-red-500 font-bold text-[10px] uppercase bg-black/50 backdrop-blur-sm"
                          >
                             Delete
                          </button>
                      )}
                  </div>
              ))}
          </div>
      </div>
  );

  const renderAdminUsers = () => (
      <div className="h-full flex flex-col animate-fade-in">
          <div className="bg-[#121216] p-4 rounded-2xl border border-white/10 mb-6 flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                  <Search className="absolute left-4 top-3.5 text-gray-500" size={18} />
                  <input type="text" value={adminTargetEmail} onChange={(e) => setAdminTargetEmail(e.target.value)} placeholder="Search User by Unique ID or Email..." className="w-full bg-[#050505] border border-white/10 pl-12 pr-4 py-3 rounded-xl text-white outline-none focus:border-violet-500 text-sm font-medium" />
              </div>
              <button onClick={searchAdminUser} disabled={loading} className="px-8 bg-white text-black hover:bg-gray-200 font-bold rounded-xl disabled:opacity-50 text-sm">
                  {loading ? <Loader2 className="animate-spin" /> : "Find User"}
              </button>
          </div>

          {fetchedAdminUser ? (
              <div className="bg-[#121216] border border-white/10 rounded-2xl p-6 flex-1 overflow-y-auto">
                   <div className="flex flex-col md:flex-row items-start justify-between mb-8 gap-6 border-b border-white/5 pb-8">
                       <div className="flex items-center gap-6">
                           <div className="relative group">
                                <img src={fetchedAdminUser.photoURL || ''} className="w-24 h-24 rounded-2xl bg-gray-800 object-cover border-4 border-[#25252D] shadow-2xl" />
                                <input type="file" ref={adminFileInputRef} className="hidden" onChange={handleAdminImageUpload} accept="image/*" />
                                <button onClick={() => adminFileInputRef.current?.click()} className="absolute -bottom-2 -right-2 p-2 bg-white text-black rounded-full shadow-lg hover:scale-110 transition-transform"><Camera size={14}/></button>
                           </div>
                           <div>
                               <h3 className="text-2xl font-bold text-white">{fetchedAdminUser.displayName}</h3>
                               <p className="text-gray-400 text-xs font-mono bg-white/5 px-2 py-1 rounded-lg inline-block mt-1">ID: {fetchedAdminUser.uniqueId}</p>
                               <p className="text-gray-500 text-xs mt-1">{fetchedAdminUser.email}</p>
                               <div className="flex gap-2 mt-3">
                                   {fetchedAdminUser.isBanned && <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded">BANNED</span>}
                                   {fetchedAdminUser.isAuthorizedListener && <span className="bg-emerald-500 text-black text-[10px] font-bold px-2 py-1 rounded">LISTENER</span>}
                               </div>
                           </div>
                       </div>
                       <div className="flex flex-wrap gap-2 w-full md:w-auto">
                           <button onClick={toggleBan} className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all ${fetchedAdminUser.isBanned ? 'bg-green-500 text-white shadow-lg' : 'bg-red-500 text-white shadow-lg'}`}>{fetchedAdminUser.isBanned ? 'Unban Account' : 'Ban Account'}</button>
                           <button onClick={toggleListener} className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all ${fetchedAdminUser.isAuthorizedListener ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}>{fetchedAdminUser.isAuthorizedListener ? 'Revoke Listener' : 'Approve Listener'}</button>
                       </div>
                   </div>
                   
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                       {/* Profile Edit */}
                       <div className="space-y-4">
                           <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2"><Edit2 size={14}/> Profile Details</h4>
                           <div className="bg-[#0A0A0E] p-4 rounded-xl space-y-3 border border-white/5">
                                <div><label className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">Display Name</label><input type="text" value={adminEditName} onChange={(e) => setAdminEditName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" /></div>
                                <div><label className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">Bio</label><textarea value={adminEditBio} onChange={(e) => setAdminEditBio(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none h-24" /></div>
                                <button onClick={saveTargetProfile} disabled={loading} className="w-full py-3 bg-white text-black font-bold rounded-lg text-xs hover:bg-gray-200">Save Changes</button>
                           </div>
                       </div>
                       
                       {/* Wallet & Notifications */}
                       <div className="space-y-6">
                           <div>
                               <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2"><Wallet size={14}/> Wallet</h4>
                               <div className="bg-gradient-to-br from-yellow-900/20 to-amber-900/20 rounded-xl p-5 border border-yellow-500/20">
                                   <div className="flex justify-between items-end mb-4">
                                       <div>
                                           <p className="text-[10px] text-yellow-500 font-bold uppercase">Balance</p>
                                           <p className="text-3xl font-bold text-white">{fetchedAdminUser.walletBalance || 0}</p>
                                       </div>
                                       <Coins size={32} className="text-yellow-500/20" />
                                   </div>
                                   <div className="flex gap-2">
                                       <input type="number" value={adminCoinAmount} onChange={(e) => setAdminCoinAmount(e.target.value)} placeholder="0" className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none font-bold" />
                                       <button onClick={() => manageCoins('add')} className="px-4 bg-green-500 text-black hover:bg-green-400 rounded-lg font-bold"><Plus size={16}/></button>
                                       <button onClick={() => manageCoins('remove')} className="px-4 bg-red-500 text-white hover:bg-red-400 rounded-lg font-bold"><Minus size={16}/></button>
                                   </div>
                               </div>
                           </div>
                           
                           <div>
                               <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2"><Megaphone size={14}/> Notify User</h4>
                               <div className="flex gap-2">
                                   <input type="text" value={adminNotification} onChange={(e) => setAdminNotification(e.target.value)} placeholder="System message..." className="flex-1 bg-[#0A0A0E] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
                                   <button onClick={sendNotification} className="px-4 bg-violet-600 text-white rounded-lg text-xs font-bold hover:bg-violet-500"><Send size={14}/></button>
                               </div>
                           </div>
                       </div>
                   </div>
              </div>
          ) : (
              <div className="bg-[#121216] border border-white/10 rounded-2xl p-6 flex-1 overflow-y-auto">
                  <h3 className="text-sm font-bold text-gray-400 mb-6 uppercase tracking-wider">Recently Joined</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {recentUsers.map(u => (
                          <div key={u.uid} onClick={() => { setFetchedAdminUser(u); setAdminEditName(u.displayName || ''); setAdminEditBio(u.bio || ''); }} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl hover:bg-white/10 cursor-pointer transition-colors border border-transparent hover:border-white/10">
                              <img src={u.photoURL || ''} className="w-10 h-10 rounded-full bg-gray-800 object-cover" />
                              <div className="min-w-0">
                                  <p className="text-sm font-bold text-white truncate">{u.displayName}</p>
                                  <p className="text-[10px] text-gray-500 font-mono">{u.uniqueId}</p>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}
      </div>
  );

  const renderAdminRooms = () => (
      <div className="h-full flex flex-col animate-fade-in">
          <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Active Rooms</h2>
              <button onClick={() => setShowAdminCreateRoom(!showAdminCreateRoom)} className="px-4 py-2 bg-white text-black hover:bg-gray-200 rounded-xl text-xs font-bold flex items-center gap-2">
                  {showAdminCreateRoom ? <Minus size={16}/> : <Plus size={16}/>} Create Room
              </button>
          </div>
          
          {showAdminCreateRoom && (
              <div className="bg-gradient-to-r from-violet-900/20 to-fuchsia-900/20 p-6 rounded-2xl border border-white/10 mb-8 space-y-4 shadow-xl">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Create New Room</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><label className="text-[10px] font-bold text-gray-500 uppercase">Room Title</label><input type="text" value={adminNewRoomName} onChange={(e) => setAdminNewRoomName(e.target.value)} placeholder="e.g. Chill Vibes" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white mt-1" /></div>
                      <div><label className="text-[10px] font-bold text-gray-500 uppercase">Owner ID</label><input type="text" value={adminNewRoomOwnerId} onChange={(e) => setAdminNewRoomOwnerId(e.target.value)} placeholder="Unique ID or UID" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white mt-1" /></div>
                  </div>
                  <div className="flex justify-end pt-2">
                      <button onClick={adminCreateRoom} disabled={loading} className="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-violet-500/20">Create Room</button>
                  </div>
              </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 overflow-y-auto pb-4">
              {adminRooms.map(room => (
                  <div key={room.id} className="bg-[#18181B] border border-white/5 rounded-2xl p-5 relative group hover:border-white/10 transition-all shadow-lg">
                      <div className="flex justify-between items-start mb-3">
                          <h3 className="font-bold text-white text-lg truncate w-3/4">{room.name}</h3>
                          {room.password && <div className="p-1.5 bg-yellow-500/10 rounded-lg"><Lock size={14} className="text-yellow-500" /></div>}
                      </div>
                      
                      <div className="flex items-center gap-2 mb-4">
                           <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-violet-500 to-fuchsia-500 flex items-center justify-center text-[10px] font-bold text-white">
                                {room.creatorName.charAt(0)}
                           </div>
                           <p className="text-xs text-gray-400">By {room.creatorName}</p>
                      </div>

                      <div className="flex justify-between items-center mt-auto pt-4 border-t border-white/5">
                          <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wide flex items-center gap-1.5 ${room.active ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-gray-700/30 text-gray-500'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${room.active ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></span>
                              {room.active ? 'Online' : 'Offline'}
                          </span>
                          <div className="flex gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                              {room.password && (
                                  <button onClick={(e) => handleUnlockRoom(e, room.id)} className="p-2 bg-yellow-500/10 text-yellow-500 rounded-xl hover:bg-yellow-500/20" title="Remove Password">
                                      <Unlock size={16} />
                                  </button>
                              )}
                              <button onClick={(e) => handleDeleteRoomClick(e, room.id)} className="p-2 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 shadow-lg">
                                  <Trash2 size={16} />
                              </button>
                          </div>
                      </div>
                  </div>
              ))}
              {adminRooms.length === 0 && <p className="text-gray-500 col-span-full text-center py-20 bg-white/5 rounded-2xl border border-dashed border-white/10">No rooms created.</p>}
          </div>
      </div>
  );

  const renderAdminListeners = () => (
      <div className="h-full flex flex-col animate-fade-in">
          <h2 className="text-xl font-bold text-white mb-6">Authorized Listeners</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pb-4">
              {adminListeners.map(l => (
                  <div key={l.uid} className="bg-[#18181B] border border-white/5 rounded-2xl p-4 flex items-center gap-4 hover:bg-white/5 transition-colors group">
                      <img src={l.photoURL || ''} className="w-14 h-14 rounded-full bg-gray-800 object-cover border-2 border-[#25252D]" />
                      <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-white truncate">{l.displayName}</h3>
                          <p className="text-xs text-gray-500 truncate">{l.email}</p>
                          <div className="flex gap-2 mt-1">
                              <span className="text-[9px] bg-emerald-900 text-emerald-400 px-1.5 py-0.5 rounded font-bold">VERIFIED</span>
                          </div>
                      </div>
                      <button onClick={(e) => handleRevokeListenerClick(e, l.uid)} className="p-2 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-opacity" title="Revoke Status">
                          <UserX size={18} />
                      </button>
                  </div>
              ))}
              {adminListeners.length === 0 && <p className="text-gray-500 col-span-full text-center py-10">No authorized listeners found.</p>}
          </div>
      </div>
  );

  const renderAdminReports = () => (
      <div className="h-full flex flex-col animate-fade-in">
          <h2 className="text-xl font-bold text-white mb-6">Reports Console</h2>
          <div className="space-y-4 overflow-y-auto pb-4">
              {adminReports.length === 0 ? (
                  <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
                      <ShieldCheck size={48} className="text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400 font-bold">All Clean!</p>
                      <p className="text-gray-600 text-xs">No pending reports.</p>
                  </div>
              ) : (
                  adminReports.map(report => (
                      <div key={report.id} className="bg-[#18181B] border border-white/5 rounded-2xl p-5 shadow-lg">
                          <div className="flex justify-between items-start mb-3">
                              <div className="flex items-center gap-3">
                                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase ${report.status === 'resolved' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                                      {report.status}
                                  </span>
                                  <span className="text-xs text-gray-500 font-mono">{new Date(report.timestamp).toLocaleString()}</span>
                              </div>
                              <div className="flex gap-2">
                                  {report.status !== 'resolved' && (
                                      <button onClick={() => handleResolveReport(report.id)} className="px-3 py-1.5 bg-green-500/10 text-green-500 rounded-lg hover:bg-green-500/20 text-xs font-bold transition-colors">
                                          Mark Resolved
                                      </button>
                                  )}
                                  <button onClick={() => handleDeleteReport(report.id)} className="p-1.5 bg-white/5 text-gray-400 rounded-lg hover:bg-white/10 hover:text-white transition-colors">
                                      <Trash2 size={16}/>
                                  </button>
                              </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                                <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Target User</p>
                                    <p className="text-sm font-bold text-white">{report.targetName}</p>
                                </div>
                                <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Reported By</p>
                                    <p className="text-sm font-bold text-gray-300">{report.reporterName}</p>
                                </div>
                          </div>
                          
                          <div className="bg-red-500/5 border border-red-500/10 p-3 rounded-xl">
                              <p className="text-[10px] text-red-400 uppercase font-bold mb-1">Reason</p>
                              <p className="text-sm text-gray-300">{report.reason}</p>
                          </div>
                      </div>
                  ))
              )}
          </div>
      </div>
  );

  const renderAdminDashboard = () => (
      <div className="space-y-8 animate-fade-in pb-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              <StatCard label="Total Users" value={stats.totalUsers} icon={Users} color="text-violet-500" />
              <StatCard label="Active Rooms" value={stats.activeRooms} icon={Mic} color="text-yellow-500" />
              <StatCard label="Reports" value={stats.pendingReports} icon={Flag} color="text-red-500" />
              <StatCard label="Coins" value={stats.totalCoins > 1000 ? (stats.totalCoins/1000).toFixed(1) + 'k' : stats.totalCoins} icon={Coins} color="text-emerald-500" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Global Alert System */}
              <div className="bg-[#121216] border border-white/5 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                  <div className="relative z-10">
                      <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                          <Megaphone size={20} className="text-red-500"/> Global Broadcast
                      </h3>
                      <p className="text-xs text-gray-400 mb-6 max-w-sm">Send a system-wide alert to all active chat rooms immediately.</p>
                      
                      <div className="flex gap-3">
                          <input 
                              type="text" 
                              value={broadcastMessage} 
                              onChange={(e) => setBroadcastMessage(e.target.value)} 
                              placeholder="Type alert message..." 
                              className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-5 py-3 text-white text-sm outline-none focus:border-red-500 transition-colors" 
                          />
                          <button 
                              onClick={sendGlobalAlert} 
                              disabled={loading || !broadcastMessage.trim()} 
                              className="px-6 bg-red-600 hover:bg-red-500 text-white font-bold rounded-2xl disabled:opacity-50 transition-colors flex items-center justify-center shadow-lg shadow-red-600/20"
                          >
                              {loading ? <Loader2 className="animate-spin" /> : <Send size={20} />}
                          </button>
                      </div>
                  </div>
              </div>

              {/* System Controls */}
              <div className="bg-[#121216] border border-white/5 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
                  <div>
                      <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                          <AlertTriangle size={20} className="text-yellow-500"/> System Status
                      </h3>
                      <p className="text-xs text-gray-400 mb-4">Maintenance mode restricts user access.</p>
                  </div>
                  
                  <div className="flex items-center justify-between bg-black/30 p-4 rounded-2xl border border-white/5">
                      <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase">Current State</p>
                          <p className={`text-sm font-bold ${maintenanceMode ? 'text-red-500' : 'text-green-500'}`}>
                              {maintenanceMode ? 'MAINTENANCE MODE' : 'OPERATIONAL'}
                          </p>
                      </div>
                      <button 
                          onClick={toggleMaintenanceMode} 
                          className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg ${maintenanceMode ? 'bg-white text-black hover:bg-gray-200' : 'bg-red-600 text-white hover:bg-red-500'}`}
                      >
                          {maintenanceMode ? 'Deactivate' : 'Activate Maintenance'}
                      </button>
                  </div>
              </div>
          </div>
      </div>
  );

  return (
    <div className="flex flex-col h-full bg-transparent text-white relative">
      <input type="file" ref={fileInputRef} className="hidden" accept="image/png, image/jpeg, image/jpg, image/webp" onChange={handleImageUpload} />
      
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-violet-900/20 to-transparent pointer-events-none z-0" />

      <div className="flex-1 overflow-y-auto pb-24 px-4 pt-6 space-y-5 no-scrollbar relative z-10">
        
        {/* Compact Profile Card */}
        <div className="bg-[#121216]/80 backdrop-blur-xl border border-white/10 rounded-[2rem] p-5 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-40 h-40 bg-violet-600/10 rounded-full blur-[60px] pointer-events-none -mr-10 -mt-10"></div>
            
            <div className="flex gap-5 relative z-10">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                    <div className="w-20 h-20 rounded-[1.2rem] p-[2px] bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg">
                        <img 
                            src={isEditing ? editedPhoto : (user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`)} 
                            className="w-full h-full rounded-[1rem] object-cover bg-gray-900"
                            alt="Profile"
                        />
                    </div>
                    {canEditProfile && isEditing && !uploading && (
                         <button onClick={() => fileInputRef.current?.click()} className="absolute -bottom-2 -right-2 p-1.5 bg-white text-black rounded-full shadow-lg hover:scale-110 transition-transform"><Camera size={12} /></button>
                     )}
                </div>

                {/* Info */}
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
                                {canEditProfile && (
                                    <button onClick={() => setIsEditing(true)} className="p-2 bg-white/5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                                        <Edit2 size={16} />
                                    </button>
                                )}
                            </div>
                            <p className="text-xs text-gray-400 mt-2 line-clamp-1 leading-relaxed">{user.bio || 'No bio yet.'}</p>
                        </>
                    )}
                </div>
            </div>

            {/* Stats Row */}
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

            {isEditing && (
                 <div className="flex gap-3 mt-4 pt-4 border-t border-white/5 animate-fade-in">
                     <button onClick={() => { setIsEditing(false); }} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 font-bold rounded-xl text-xs transition-colors">Cancel</button>
                     <button onClick={handleSave} disabled={loading || uploading} className="flex-1 py-2.5 bg-white text-black font-bold rounded-xl text-xs shadow-lg transition-colors flex items-center justify-center gap-2">{loading ? <Loader2 className="animate-spin" size={14} /> : 'Save Changes'}</button>
                 </div>
            )}
        </div>

        {/* Menu Items */}
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
        
        <p className="text-center text-[10px] text-gray-700 pb-4">Heartly Voice v2.5</p>
      </div>

      {showPrivacyModal && (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"><div className="bg-[#121216] w-full max-w-sm rounded-[2rem] border border-white/10 shadow-2xl animate-fade-in overflow-hidden relative flex flex-col max-h-[70vh]"><div className="px-6 py-5 flex items-center justify-between border-b border-white/5"><h3 className="text-lg font-bold text-white flex items-center gap-2"><Shield size={20} className="text-emerald-400" /> Privacy</h3><button onClick={() => setShowPrivacyModal(false)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-gray-400 transition-colors"><X size={18} /></button></div><div className="flex-1 overflow-y-auto p-6 space-y-6"><div><h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">Blocked Users</h4>{loadingBlocked ? (<div className="flex justify-center py-4"><Loader2 className="animate-spin text-gray-500" /></div>) : blockedProfiles.length === 0 ? (<div className="text-center py-6 bg-white/5 rounded-2xl border border-white/5"><p className="text-gray-500 text-xs">No blocked users.</p></div>) : (<div className="space-y-2">{blockedProfiles.map(p => (<div key={p.uid} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5"><div className="flex items-center gap-3"><img src={p.photoURL || ''} className="w-8 h-8 rounded-full bg-gray-800" /><span className="text-sm font-bold text-white">{p.displayName}</span></div><button onClick={() => handleUnblock(p.uid)} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-gray-300 transition-colors" title="Unblock"><UserX size={16} /></button></div>))}</div>)}</div><div className="pt-6 border-t border-white/5"><h4 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-4 flex items-center gap-2">Danger Zone</h4><button onClick={handleDeleteAccount} className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"><Trash2 size={16} /> Request Account Deletion</button><p className="text-[10px] text-gray-600 mt-2 text-center">Deletion requests are processed manually within 24 hours.</p></div></div></div></div>)}
      {showAdminPanel && isAdmin && (
        <div className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-xl flex flex-col md:flex-row overflow-hidden animate-fade-in">
            {/* Mobile Header with Close */}
            <div className="md:hidden flex items-center justify-between p-4 border-b border-white/10 bg-[#121216]">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <ShieldAlert size={20} className="text-red-500"/> Admin Panel
                </h2>
                <button onClick={() => setShowAdminPanel(false)} className="p-2 bg-white/10 rounded-full text-gray-400">
                    <X size={20}/>
                </button>
            </div>

            {/* Navigation */}
            <div className="md:w-64 bg-[#121216] border-b md:border-b-0 md:border-r border-white/5 flex flex-row md:flex-col flex-shrink-0 overflow-x-auto md:overflow-visible no-scrollbar p-2 gap-1 md:gap-2">
                <div className="hidden md:flex items-center gap-3 px-4 py-6 mb-2">
                     <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center shadow-lg">
                        <ShieldAlert size={24} className="text-white"/>
                     </div>
                     <div>
                        <h2 className="font-bold text-white text-lg leading-none">Admin</h2>
                        <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Control Center</span>
                     </div>
                </div>
                
                {[
                    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
                    { id: 'users', label: 'User Mgmt', icon: Users },
                    { id: 'rooms', label: 'Rooms', icon: Mic },
                    { id: 'reports', label: 'Reports', icon: Flag },
                    { id: 'listeners', label: 'Listeners', icon: Headphones },
                    { id: 'stickers', label: 'Stickers', icon: Smile },
                    { id: 'backgrounds', label: 'Backgrounds', icon: ImageIcon },
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
                
                <div className="hidden md:block mt-auto p-4">
                     <button onClick={() => setShowAdminPanel(false)} className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors">
                        <LogOut size={18} /> Exit Panel
                     </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-[#0A0A0F] relative flex flex-col min-w-0 overflow-hidden">
                 {/* Desktop Header */}
                 <div className="hidden md:flex items-center justify-between px-8 py-6 border-b border-white/5 bg-[#0A0A0F]/50 backdrop-blur-md sticky top-0 z-20">
                     <h2 className="text-2xl font-bold text-white capitalize">{adminTab}</h2>
                     <div className="flex gap-3">
                         <button onClick={fetchAdminStats} className="p-2.5 bg-white/5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors" title="Refresh Data">
                            <RotateCw size={20} className={loading ? 'animate-spin' : ''} />
                         </button>
                     </div>
                 </div>

                 <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
                     {adminTab === 'dashboard' && renderAdminDashboard()}
                     {adminTab === 'users' && renderAdminUsers()}
                     {adminTab === 'rooms' && renderAdminRooms()}
                     {adminTab === 'listeners' && renderAdminListeners()}
                     {adminTab === 'reports' && renderAdminReports()}
                     {adminTab === 'stickers' && renderAdminStickers()}
                     {adminTab === 'backgrounds' && renderAdminBackgrounds()}
                 </div>
            </div>
        </div>
      )}
      {showRechargeModal && (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"><div className="bg-[#121216] w-full max-w-sm rounded-[2rem] border border-white/10 shadow-2xl animate-fade-in overflow-hidden relative"><div className="px-6 py-5 flex items-center justify-between border-b border-white/5"><h3 className="text-lg font-bold text-white flex items-center gap-2"><Wallet size={20} className="text-yellow-400" /> Wallet</h3><button onClick={() => !isProcessing && setShowRechargeModal(false)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-gray-400 transition-colors"><X size={18} /></button></div><div className="flex border-b border-white/5 bg-black/20"><button onClick={() => setWalletTab('recharge')} className={`flex-1 py-4 text-xs font-bold transition-colors ${walletTab === 'recharge' ? 'text-yellow-400 border-b-2 border-yellow-400 bg-white/5' : 'text-gray-500 hover:text-white'}`}>Buy Coins</button><button onClick={() => setWalletTab('earnings')} className={`flex-1 py-4 text-xs font-bold transition-colors ${walletTab === 'earnings' ? 'text-green-400 border-b-2 border-green-400 bg-white/5' : 'text-gray-500 hover:text-white'}`}>Earnings</button></div><div className="p-6">{walletTab === 'recharge' ? (<><div className="text-center mb-8"><p className="text-gray-500 text-[10px] uppercase font-bold tracking-wider mb-2">Current Balance</p><h2 className="text-4xl font-extrabold text-white tracking-tight">{user.walletBalance || 0} <span className="text-lg font-medium text-yellow-500">Coins</span></h2></div><div className="space-y-4"><div className="relative"><div className="relative flex items-center"><Coins size={20} className="absolute left-4 text-yellow-400" /><input type="number" min="1" value={rechargeAmount} onChange={(e) => setRechargeAmount(Math.max(1, parseInt(e.target.value) || 0))} className="w-full bg-black/30 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white font-bold text-lg outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all placeholder-gray-600" /></div></div><div className="grid grid-cols-4 gap-2">{[10, 50, 100, 500].map(amt => (<button key={amt} onClick={() => setRechargeAmount(amt)} className={`py-2 rounded-lg text-xs font-bold transition-all border ${rechargeAmount === amt ? 'bg-yellow-500 border-yellow-500 text-black shadow-[0_0_10px_rgba(234,179,8,0.4)]' : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'}`}>+{amt}</button>))}</div><div className="bg-gradient-to-r from-emerald-900/30 to-teal-900/30 border border-emerald-500/20 rounded-xl p-4 flex justify-between items-center mt-4"><div className="flex items-center gap-2"><div className="p-2 bg-emerald-500/10 rounded-full"><CreditCard size={16} className="text-emerald-400" /></div><div><p className="text-xs font-bold text-gray-300">Total Price</p><p className="text-[10px] text-gray-500">1 Coin = ₹1.00</p></div></div><div className="text-xl font-bold text-white">₹{rechargeAmount.toFixed(2)}</div></div><button onClick={handleRecharge} disabled={isProcessing} className="w-full bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black font-bold py-4 rounded-xl shadow-lg shadow-yellow-500/20 transition-all active:scale-[0.98] mt-2 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">{isProcessing ? <Loader2 className="animate-spin" size={20} /> : <><Coins size={20} /> Pay Now</>}</button></div></>) : (<><div className="bg-gradient-to-br from-green-900/40 to-emerald-900/40 border border-green-500/20 rounded-2xl p-6 text-center mb-6 relative overflow-hidden"><div className="absolute top-0 right-0 p-4 opacity-10"><Banknote size={64} className="text-green-400" /></div><p className="text-green-400 text-[10px] font-bold uppercase tracking-widest mb-1">Commission Earned</p><h2 className="text-4xl font-extrabold text-white mb-1">{user.commissionBalance || 0}</h2><p className="text-[10px] text-gray-400">Withdrawable Balance</p></div><div className="space-y-3"><div className="bg-[#0A0A0E] p-4 rounded-xl border border-white/5 flex items-center gap-3"><div className="bg-white/10 p-2 rounded-lg"><Landmark size={20} className="text-gray-300"/></div><div><p className="text-xs font-bold text-white">Bank Withdrawal</p><p className="text-[10px] text-gray-500">Min. 100 coins required</p></div></div><button onClick={handleWithdraw} disabled={isProcessing || (user.commissionBalance || 0) < 100} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-green-600/20 transition-all active:scale-[0.98] mt-4 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">{isProcessing ? <Loader2 className="animate-spin" size={20} /> : "Withdraw Funds"}</button><p className="text-center text-[10px] text-gray-500 mt-2">Withdrawals are processed within 24 hours.</p></div></>)}</div></div></div>)}
      {showHelpModal && (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"><div className="bg-[#121216] w-full max-w-sm rounded-[2rem] border border-white/10 shadow-2xl animate-fade-in overflow-hidden relative flex flex-col max-h-[70vh]"><div className="px-6 py-5 flex items-center justify-between border-b border-white/5"><h3 className="text-lg font-bold text-white flex items-center gap-2"><HelpCircle size={20} className="text-cyan-400" /> Help & Support</h3><button onClick={() => setShowHelpModal(false)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-gray-400 transition-colors"><X size={18} /></button></div><div className="flex border-b border-white/5 bg-black/20"><button onClick={() => setSupportTab('faq')} className={`flex-1 py-4 text-xs font-bold transition-colors ${supportTab === 'faq' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-white/5' : 'text-gray-500 hover:text-white'}`}>FAQ</button><button onClick={() => setSupportTab('contact')} className={`flex-1 py-4 text-xs font-bold transition-colors ${supportTab === 'contact' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-white/5' : 'text-gray-500 hover:text-white'}`}>Contact Us</button></div><div className="flex-1 overflow-y-auto p-6">{supportTab === 'faq' ? (<div className="space-y-3">{faqs.map((faq, i) => (<div key={i} className="bg-white/5 rounded-xl overflow-hidden border border-white/5"><button onClick={() => setExpandedFaq(expandedFaq === i ? null : i)} className="w-full px-4 py-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors"><span className="text-sm font-bold text-white">{faq.q}</span>{expandedFaq === i ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}</button>{expandedFaq === i && (<div className="px-4 pb-4 pt-1 text-xs text-gray-400 leading-relaxed border-t border-white/5">{faq.a}</div>)}</div>))}</div>) : (<div className="space-y-4"><div className="bg-cyan-900/20 border border-cyan-500/20 p-4 rounded-xl"><p className="text-cyan-200 text-xs">Having trouble? Send us a message and our support team will reach out to you directly.</p></div><textarea value={supportMessage} onChange={(e) => setSupportMessage(e.target.value)} placeholder="Describe your issue..." className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-sm text-white outline-none focus:border-cyan-500 min-h-[150px] resize-none" /><button onClick={handleSendSupport} disabled={sendingSupport || !supportMessage.trim()} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50">{sendingSupport ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />} Send Message</button></div>)}</div></div></div>)}
      {showUserList && (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setShowUserList(null)}><div className="bg-[#121216] w-full max-w-sm rounded-[2rem] border border-white/10 shadow-2xl animate-fade-in flex flex-col max-h-[60vh]" onClick={e => e.stopPropagation()}><div className="p-4 border-b border-white/5 flex items-center justify-between"><h3 className="text-lg font-bold text-white capitalize flex items-center gap-2"><Users size={18} className="text-violet-400"/> {showUserList}</h3><button onClick={() => setShowUserList(null)} className="p-1.5 bg-white/5 rounded-full hover:bg-white/10"><X size={18} /></button></div><div className="flex-1 overflow-y-auto p-2 space-y-2">{loadingList ? (<div className="flex justify-center py-8"><Loader2 className="animate-spin text-violet-500" /></div>) : userList.length === 0 ? (<div className="text-center py-8 text-gray-500 text-xs">No users found.</div>) : (userList.map(u => (<button key={u.uid} onClick={() => setVisitingProfile(u)} className="w-full flex items-center gap-3 p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors text-left border border-transparent hover:border-white/10"><img src={u.photoURL || ''} className="w-10 h-10 rounded-full bg-gray-800 object-cover" /><div><p className="font-bold text-sm text-white">{u.displayName}</p><p className="text-[10px] text-gray-400 truncate w-40">{u.bio || 'No bio'}</p></div></button>)))}</div></div></div>)}
      {visitingProfile && (<div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setVisitingProfile(null)}><div className="bg-[#1A1A21] w-full max-w-sm rounded-[2rem] p-6 border border-white/10 shadow-2xl animate-fade-in relative" onClick={e => e.stopPropagation()}><div className="absolute top-4 right-4 text-gray-400 hover:text-white cursor-pointer" onClick={() => setVisitingProfile(null)}><X size={20} /></div><div className="flex flex-col items-center"><div className="relative mb-4"><img src={visitingProfile.photoURL || ''} className="w-24 h-24 rounded-full border-4 border-[#25252D] bg-gray-800 object-cover shadow-2xl" /></div><h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">{visitingProfile.displayName}{visitingProfile.isAuthorizedListener && <ShieldCheck size={16} className="text-emerald-400" title="Authorized Listener" />}</h2><p className="text-violet-400 text-xs font-mono tracking-wider mb-2">ID: {visitingProfile.uniqueId || '....'}</p><p className="text-gray-400 text-sm text-center mb-6 px-4">{visitingProfile.bio || "No bio yet."}</p><div className="flex gap-8 mb-6 text-center w-full justify-center"><div><span className="block font-bold text-white text-lg">{visitingProfile.following?.length || 0}</span><span className="text-[10px] text-gray-500 uppercase font-bold">Following</span></div><div><span className="block font-bold text-white text-lg">{visitingProfile.followers?.length || 0}</span><span className="text-[10px] text-gray-500 uppercase font-bold">Followers</span></div></div>{user.uid !== visitingProfile.uid && (<button onClick={toggleFollowVisitor} className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${isFollowingVisitor ? 'bg-white/10 text-white hover:bg-white/20 border border-white/10' : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:opacity-90 shadow-lg'}`}>{isFollowingVisitor ? <UserCheck size={18} /> : <UserPlus size={18} />}{isFollowingVisitor ? 'Following' : 'Follow'}</button>)}</div></div></div>)}
    </div>
  );
};
