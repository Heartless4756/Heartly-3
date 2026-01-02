import React, { useState, useEffect } from 'react';
import { 
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { 
  AlertCircle, 
  Loader2
} from 'lucide-react';

export const Auth: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); // Start true to check for redirect result

  // Handle successful auth (create user in DB if needed)
  const handleAuthSuccess = async (user: User) => {
      try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);

          if (!userDoc.exists()) {
              const uniqueId = Math.random().toString(36).substring(2, 6).toUpperCase();
              await setDoc(userDocRef, {
                  uid: user.uid,
                  displayName: user.displayName || 'User',
                  email: user.email,
                  phoneNumber: user.phoneNumber || null,
                  photoURL: user.photoURL,
                  uniqueId: uniqueId,
                  createdAt: Date.now(),
                  walletBalance: 100, // Starter Coins
                  followers: [],
                  following: [],
                  bio: 'Hey there! I am using Heartly.'
              });
          }
      } catch (e: any) {
          console.error("DB Error:", e);
          setError("Failed to create profile: " + e.message);
      }
  };

  useEffect(() => {
    const checkRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
            await handleAuthSuccess(result.user);
        }
      } catch (err: any) {
        console.error("Redirect Login Error:", err);
        // Don't show error for no-redirect, just clear loading
      } finally {
        setLoading(false);
      }
    };
    
    checkRedirect();
  }, []);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      // Force account selection prompt to show all logged-in Google accounts
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      // Using redirect as requested
      await signInWithRedirect(auth, provider);
    } catch (err: any) {
      console.error("Google Login Error:", err);
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] flex flex-col items-center justify-center bg-[#050505] relative overflow-hidden px-6">
      {/* Premium Ambient Background - White Texture */}
      <div className="absolute top-[-10%] left-[-20%] w-[600px] h-[600px] bg-white/5 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-20%] w-[600px] h-[600px] bg-white/5 rounded-full blur-[120px] animate-pulse" />
      
      <div className="w-full max-w-sm relative z-10">
        
        {/* Header */}
        <div className="mb-10 flex flex-col items-center animate-fade-in">
             <div className="relative mb-6">
                  <div className="absolute -inset-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-full blur-2xl opacity-20 animate-pulse"></div>
                  <div className="relative w-24 h-24 bg-white/5 rounded-3xl border border-white/10 flex items-center justify-center shadow-2xl backdrop-blur-md rotate-12 group transition-transform hover:rotate-0 duration-500">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="drop-shadow-[0_0_15px_rgba(167,139,250,0.8)]">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="url(#authGrad)"/>
                          <defs>
                              <linearGradient id="authGrad" x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse">
                                  <stop stopColor="#A78BFA"/>
                                  <stop offset="1" stopColor="#F472B6"/>
                              </linearGradient>
                          </defs>
                      </svg>
                  </div>
             </div>
             
             <h1 className="text-4xl font-black text-white tracking-tighter text-center">
                 Heartly <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">Voice</span>
             </h1>
             <p className="text-gray-500 text-sm mt-2 font-medium">Premium Social Audio Experience</p>
        </div>

        {/* Content Card */}
        <div className="glass-card rounded-[2.5rem] p-8 shadow-2xl relative animate-fade-in bg-[#121216]/50 border border-white/5 backdrop-blur-xl">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl text-xs flex items-center gap-3 mb-6 animate-fade-in break-words">
              <AlertCircle size={18} className="shrink-0" />
              <span className="font-bold">{error}</span>
            </div>
          )}

          <button 
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-[#1A1A21] border border-white/10 hover:bg-white/5 text-white font-bold py-4 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-3 group relative overflow-hidden"
          >
              <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              {loading ? (
                <div className="flex items-center gap-2">
                    <Loader2 className="animate-spin" size={20} />
                    <span>Please wait...</span>
                </div>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
          </button>
        </div>

        <p className="mt-8 text-center text-[10px] font-bold text-gray-600 uppercase tracking-widest leading-loose">
            Secure • Encrypted • Premium<br/>
            By signing in you agree to our Terms
        </p>
      </div>
    </div>
  );
};
