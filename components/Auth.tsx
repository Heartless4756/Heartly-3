
import React, { useState, useEffect } from 'react';
import { 
  signInWithPhoneNumber, 
  RecaptchaVerifier, 
  ConfirmationResult,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { 
  Phone, 
  MessageSquare, 
  User as UserIcon, 
  AlertCircle, 
  ArrowRight, 
  Sparkles,
  ChevronLeft,
  Loader2,
  CheckCircle2
} from 'lucide-react';

type AuthStep = 'phone' | 'otp' | 'profile';

declare global {
  interface Window {
    recaptchaVerifier: any;
  }
}

export const Auth: React.FC = () => {
  const [step, setStep] = useState<AuthStep>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  // Initialize Recaptcha on Mount
  useEffect(() => {
    if (!window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          'size': 'invisible',
          'callback': () => {
            // reCAPTCHA solved, allow signInWithPhoneNumber.
          },
          'expired-callback': () => {
            // Response expired. Ask user to solve reCAPTCHA again.
            setError('Recaptcha expired. Please try again.');
          }
        });
      } catch (err) {
        console.error("Recaptcha Init Error:", err);
      }
    }
    
    // Cleanup on unmount is tricky with Firebase Recaptcha as it attaches to window,
    // usually best to leave it or carefully clear if needed. 
    // For this flow, we keep it to prevent "reCAPTCHA has already been rendered" errors.
  }, []);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user exists in Firestore
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      // If new user, create their document immediately
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
      // App.tsx listener handles the state change and redirection
    } catch (err: any) {
      console.error("Google Login Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (phoneNumber.length < 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }

    setLoading(true);
    try {
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`;
      
      if (!window.recaptchaVerifier) {
          throw new Error("Recaptcha not initialized. Please refresh.");
      }

      const appVerifier = window.recaptchaVerifier;
      
      const result = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      setConfirmationResult(result);
      setStep('otp');
    } catch (err: any) {
      console.error("Send OTP Error:", err);
      
      // Reset recaptcha on error so user can try again
      if (window.recaptchaVerifier) {
          try {
             // We don't clear here to avoid render issues, just handle the error
             // window.recaptchaVerifier.clear(); 
          } catch(e) {}
      }

      if (err.message.includes('too-many-requests')) {
          setError('Too many attempts. Please try again later.');
      } else if (err.message.includes('invalid-phone-number')) {
          setError('Invalid phone number format.');
      } else {
          setError('Failed to send OTP. ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (otp.length !== 6) {
      setError('Enter 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      if (!confirmationResult) {
          throw new Error("Session expired. Please send OTP again.");
      }

      const userCredential = await confirmationResult.confirm(otp);
      const user = userCredential.user;
      
      // Check if user exists in Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (!userDoc.exists()) {
        setStep('profile');
      }
      // If user exists, App.tsx listener handles the rest
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-verification-code') {
          setError('Invalid OTP code. Please check and try again.');
      } else {
          setError('Verification failed. ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) return;

      await updateProfile(user, { displayName: name });
      
      const uniqueId = Math.random().toString(36).substring(2, 6).toUpperCase();
      await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          displayName: name,
          email: user.email, // Often null for phone auth
          phoneNumber: user.phoneNumber,
          photoURL: null,
          uniqueId: uniqueId,
          createdAt: Date.now(),
          walletBalance: 100, // Starter Coins
          followers: [],
          following: [],
          bio: 'Hey there! I am using Heartly.'
      });
      // App state will update via onAuthStateChanged
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] flex flex-col items-center justify-center bg-[#050505] relative overflow-hidden px-6">
      {/* Premium Ambient Background */}
      <div className="absolute top-[-10%] left-[-20%] w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-20%] w-[600px] h-[600px] bg-fuchsia-600/10 rounded-full blur-[120px] animate-pulse" />
      
      {/* Invisible Recaptcha Container */}
      <div id="recaptcha-container"></div>

      <div className="w-full max-w-sm relative z-10">
        
        {/* Step-based Header */}
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
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl text-xs flex items-center gap-3 mb-6 animate-fade-in">
              <AlertCircle size={18} className="shrink-0" />
              <span className="font-bold">{error}</span>
            </div>
          )}

          {step === 'phone' && (
            <>
              <form onSubmit={handleSendOtp} className="space-y-6">
                  <div>
                      <h2 className="text-xl font-bold text-white mb-1">Welcome Back</h2>
                      <p className="text-xs text-gray-500 mb-6">Enter your phone to get started</p>
                      <div className="relative group">
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 border-r border-white/10 pr-3">
                              <span className="text-sm font-bold text-gray-400">+91</span>
                          </div>
                          <input
                              type="tel"
                              className="w-full pl-16 pr-4 py-4 bg-black/40 border border-white/10 rounded-2xl focus:border-violet-500/50 outline-none transition-all text-base font-bold text-white tracking-widest placeholder-gray-700"
                              placeholder="Phone Number"
                              value={phoneNumber}
                              onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                              autoFocus
                          />
                      </div>
                  </div>
                  <button
                      type="submit"
                      disabled={loading || phoneNumber.length < 10}
                      className="w-full bg-white text-black font-black py-4 rounded-2xl shadow-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 group"
                  >
                      {loading ? <Loader2 className="animate-spin" size={20} /> : <>Next Step <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></>}
                  </button>
              </form>

              <div className="relative my-6">
                 <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                 <div className="relative flex justify-center"><span className="bg-[#121216] px-4 text-[10px] text-gray-500 font-bold uppercase tracking-wider">OR</span></div>
              </div>

              <button 
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full bg-[#1A1A21] border border-white/10 hover:bg-white/5 text-white font-bold py-4 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-3 group"
              >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  <span>Continue with Google</span>
              </button>
            </>
          )}

          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div>
                    <button 
                        type="button" 
                        onClick={() => {
                            setStep('phone');
                            setError(null);
                        }}
                        className="flex items-center gap-1 text-[10px] font-black uppercase text-gray-500 mb-4 hover:text-white transition-colors"
                    >
                        <ChevronLeft size={14} /> Edit Number
                    </button>
                    <h2 className="text-xl font-bold text-white mb-1">Verification</h2>
                    <p className="text-xs text-gray-500 mb-6">Sent to +91 {phoneNumber}</p>
                    <input
                        type="text"
                        maxLength={6}
                        className="w-full py-4 bg-black/40 border border-white/10 rounded-2xl text-center text-3xl font-black text-white tracking-[0.5em] focus:border-violet-500/50 outline-none transition-all"
                        placeholder="••••••"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                        autoFocus
                    />
                </div>
                <button
                    type="submit"
                    disabled={loading || otp.length < 6}
                    className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-violet-600/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <>Verify OTP <CheckCircle2 size={18} /></>}
                </button>
            </form>
          )}

          {step === 'profile' && (
            <form onSubmit={handleCompleteProfile} className="space-y-6">
                <div className="text-center mb-2">
                    <div className="w-20 h-20 bg-violet-600/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-violet-500/20">
                        <Sparkles size={32} className="text-violet-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white">Almost There!</h2>
                    <p className="text-xs text-gray-500">How should we call you?</p>
                </div>
                <div className="relative">
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input
                        type="text"
                        className="w-full pl-12 pr-4 py-4 bg-black/40 border border-white/10 rounded-2xl focus:border-violet-500/50 outline-none transition-all text-sm font-bold text-white"
                        placeholder="Your Display Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                    />
                </div>
                <button
                    type="submit"
                    disabled={loading || !name.trim()}
                    className="w-full bg-white text-black font-black py-4 rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : "Finish Setup"}
                </button>
            </form>
          )}
        </div>

        <p className="mt-8 text-center text-[10px] font-bold text-gray-600 uppercase tracking-widest leading-loose">
            Secure • Encrypted • Premium<br/>
            By signing in you agree to our Terms
        </p>
      </div>
    </div>
  );
};
