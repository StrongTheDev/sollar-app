/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from "motion/react";
import { LogOut, Sun, Moon, QrCode, ScanLine, Wallet, X, ArrowLeft, DollarSign, Zap, History, ChevronRight, Plus, Trash2, Check } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, User, db, collection, doc, setDoc, getDoc, getDocs, onSnapshot, query, orderBy, limit, addDoc, serverTimestamp, getDocFromServer } from "./firebase";
import { QRCodeCanvas } from "qrcode.react";
import { Html5Qrcode } from "html5-qrcode";

// Solana Wallet Adapter Imports
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

// Default styles that can be overridden by your app
import '@solana/wallet-adapter-react-ui/styles.css';

const MERCHANT_WALLET = "HHQh2MtxehN9wQptR5oXSiEPSVe1eLjPiqJhKF6Z1WzJ";
const SOL_PRICE_USD = 150; // Mock price for conversion

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo?: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface Transaction {
  id: string;
  uid: string;
  type: 'send' | 'receive';
  amount: string;
  currency: 'SOL' | 'USD';
  date: string;
  address: string;
  status: 'pending' | 'completed' | 'failed';
}

export function SollarApp() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [walletAddress, setWalletAddress] = useState<string | null>(() => {
    return localStorage.getItem("sollar_wallet");
  });
  const [activeView, setActiveView] = useState<"dashboard" | "request" | "scan" | "confirm">("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("sollar_theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    localStorage.setItem("sollar_theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);
  
  // Solana Wallet Adapter
  const { publicKey, disconnect, wallets, select, connecting, wallet } = useWallet();

  const [linkedWallets, setLinkedWallets] = useState<string[]>(() => {
    const saved = localStorage.getItem("sollar_linked_wallets");
    return saved ? JSON.parse(saved) : [];
  });

  // Payment Confirmation State
  const [pendingPayment, setPendingPayment] = useState<{
    recipient: string;
    amount: string;
    label?: string;
    message?: string;
  } | null>(null);

  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    if (publicKey) {
      const addr = publicKey.toBase58();
      if (!linkedWallets.includes(addr)) {
        setLinkedWallets(prev => [...prev, addr]);
      }
      setWalletAddress(addr);
    }
  }, [publicKey, linkedWallets]);

  // Request Payment State
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "SOL">("USD");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Sync user profile to Firestore
        const userRef = doc(db, "users", currentUser.uid);
        try {
          await setDoc(userRef, {
            uid: currentUser.uid,
            displayName: currentUser.displayName,
            email: currentUser.email,
            photoURL: currentUser.photoURL,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Transactions from Firestore
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/transactions`),
      orderBy("date", "desc"),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Transaction[];
      setTransactions(txs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/transactions`);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (walletAddress) {
      localStorage.setItem("sollar_wallet", walletAddress);
    } else {
      localStorage.removeItem("sollar_wallet");
    }
  }, [walletAddress]);

  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  // Back Button Handling Logic
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (isSidebarOpen) {
        setIsSidebarOpen(false);
        // Prevent default back behavior by pushing state back if we want to stay on dashboard
        // But wait, the browser already popped. We just need to ensure we don't exit the app.
        window.history.pushState({ main: true }, "");
      } else if (isWalletModalOpen) {
        setIsWalletModalOpen(false);
        window.history.pushState({ main: true }, "");
      } else if (activeView !== "dashboard") {
        setActiveView("dashboard");
        setPendingPayment(null);
        window.history.pushState({ main: true }, "");
      }
    };

    window.addEventListener("popstate", handlePopState);

    // Initial push to enable back button handling
    if (window.history.state === null) {
      window.history.pushState({ main: true }, "");
    }

    return () => window.removeEventListener("popstate", handlePopState);
  }, [isSidebarOpen, isWalletModalOpen, activeView]);

  // Push state when overlays open or view changes to "catch" the back button
  useEffect(() => {
    if (isSidebarOpen || isWalletModalOpen || activeView !== "dashboard") {
      // If we are entering an overlay/view, we push a state so the next 'back' pops it
      // instead of exiting the app.
      // We check if the current state is already an overlay to avoid double pushing
      if (window.history.state?.overlay !== true) {
        window.history.pushState({ overlay: true }, "");
      }
    }
  }, [isSidebarOpen, isWalletModalOpen, activeView]);

  useEffect(() => {
    localStorage.setItem("sollar_linked_wallets", JSON.stringify(linkedWallets));
  }, [linkedWallets]);

  const scannerInstanceRef = useRef<Html5Qrcode | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // QR Scanner Logic
  useEffect(() => {
    if (activeView === "scan") {
      setScannerError(null);
      setIsScanning(false);
      
      const timer = setTimeout(async () => {
        const element = document.getElementById("reader");
        if (!element) {
          setScannerError("Camera container not found.");
          return;
        }

        try {
          const html5QrCode = new Html5Qrcode("reader");
          scannerInstanceRef.current = html5QrCode;

          const config = { 
            fps: 10, 
            aspectRatio: 1.0
          };

          // Try to start with environment camera (back camera)
          await html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
              if (decodedText.toLowerCase().includes("solana:")) {
                // Parse Solana Pay URL
                try {
                  const url = new URL(decodedText);
                  const recipient = url.pathname;
                  const amount = url.searchParams.get("amount") || "";
                  const label = url.searchParams.get("label") || "";
                  const message = url.searchParams.get("message") || "";
                  
                  setPendingPayment({ recipient, amount, label, message });
                  setActiveView("confirm");
                  
                  html5QrCode.stop().catch(console.error);
                } catch (e) {
                  console.error("Invalid Solana Pay URL", e);
                }
              }
            },
            (errorMessage) => {
              // Ignore common scan errors
            }
          );
          setIsScanning(true);
        } catch (err: any) {
          console.error("Failed to start camera:", err);
          if (err?.message?.includes("Permission denied")) {
            setScannerError("Camera permission denied. Please enable it in settings.");
          } else {
            setScannerError("No camera found or access restricted.");
          }
        }
      }, 600);

      return () => {
        clearTimeout(timer);
        if (scannerInstanceRef.current && scannerInstanceRef.current.isScanning) {
          scannerInstanceRef.current.stop().catch(() => {});
        }
      };
    }
  }, [activeView]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setWalletAddress(null);
      setTransactions([]);
      setActiveView("dashboard");
      setIsSidebarOpen(false);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleConfirmPayment = async () => {
    if (!user || !pendingPayment) return;

    try {
      // Simulate transaction record in Firestore
      const txId = Math.random().toString(36).substring(7);
      const txRef = collection(db, `users/${user.uid}/transactions`);
      
      await addDoc(txRef, {
        id: txId,
        uid: user.uid,
        type: 'send',
        amount: pendingPayment.amount,
        currency: 'SOL',
        date: new Date().toISOString(),
        address: pendingPayment.recipient,
        status: 'completed'
      });

      setPendingPayment(null);
      setActiveView("dashboard");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/transactions`);
    }
  };

  const handleLinkWallet = () => {
    if (!linkedWallets.includes(MERCHANT_WALLET)) {
      setLinkedWallets(prev => [...prev, MERCHANT_WALLET]);
    }
    setWalletAddress(MERCHANT_WALLET);
    setIsWalletModalOpen(false);
  };

  const handleRemoveWallet = (addr: string) => {
    const updated = linkedWallets.filter(w => w !== addr);
    setLinkedWallets(updated);
    if (walletAddress === addr) {
      setWalletAddress(updated.length > 0 ? updated[0] : null);
    }
  };

  const getSolAmount = () => {
    if (!amount) return "0";
    if (currency === "SOL") return amount;
    return (parseFloat(amount) / SOL_PRICE_USD).toFixed(4);
  };

  const generateSolanaPayUrl = () => {
    const solAmount = getSolAmount();
    return `solana:${walletAddress || MERCHANT_WALLET}?amount=${solAmount}&label=Sollar%20Payment&message=Thanks%20for%20using%20Sollar`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center transition-colors duration-300">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Sun className="text-yellow-400 w-12 h-12" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col font-sans selection:bg-yellow-200 dark:selection:bg-yellow-900/30 overflow-hidden transition-colors duration-300">
      <AnimatePresence mode="wait">
        {!user ? (
          <motion.div
            key="login"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col items-center justify-center space-y-8 bg-white dark:bg-gray-950"
          >
            <div className="w-24 h-24 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg shadow-yellow-100 dark:shadow-yellow-900/20">
              <Sun className="text-white w-12 h-12" />
            </div>
            <h1 className="text-4xl font-light tracking-tight text-gray-900 dark:text-white">Sollar</h1>
            <button
              onClick={handleLogin}
              className="px-8 py-3 bg-yellow-400 text-white font-medium rounded-full shadow-md hover:bg-yellow-500 hover:shadow-lg transition-all active:scale-95 flex items-center space-x-3"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 bg-white rounded-full p-0.5" />
              <span>Sign in with Google</span>
            </button>
          </motion.div>
        ) : (
          <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col h-screen relative bg-white dark:bg-gray-950">
            
            {/* Sidebar Overlay */}
            <AnimatePresence>
              {isSidebarOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsSidebarOpen(false)}
                    className="absolute inset-0 bg-black/20 backdrop-blur-sm z-40"
                  />
                  <motion.div
                    initial={{ x: "-100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "-100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="absolute top-0 left-0 bottom-0 w-80 bg-white dark:bg-gray-900 z-50 shadow-2xl p-6 flex flex-col border-r border-yellow-50 dark:border-yellow-900/10"
                  >
                    <div className="flex justify-between items-center mb-8">
                      <div className="flex items-center space-x-2">
                        <History className="text-yellow-400 w-6 h-6" />
                        <h2 className="text-xl font-light tracking-tight text-gray-900 dark:text-white">History</h2>
                      </div>
                      <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-yellow-50 dark:hover:bg-yellow-900/10 rounded-full transition-colors">
                        <X size={20} className="text-gray-400 dark:text-gray-500" />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                      {transactions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-600 space-y-4">
                          <History size={48} className="opacity-20" />
                          <p className="text-sm font-light">No transactions yet</p>
                        </div>
                      ) : (
                        transactions.map((tx) => (
                          <div key={tx.id} className="p-4 rounded-2xl bg-yellow-50/50 dark:bg-yellow-900/5 border border-yellow-100 dark:border-yellow-900/10 flex items-center justify-between group hover:bg-yellow-50 dark:hover:bg-yellow-900/10 transition-colors">
                            <div className="flex items-center space-x-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.type === 'receive' ? 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
                                {tx.type === 'receive' ? <ArrowLeft size={18} className="rotate-45" /> : <ArrowLeft size={18} className="rotate-[225deg]" />}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{tx.type}</p>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">{tx.address.slice(0, 6)}...{tx.address.slice(-6)}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`text-sm font-medium ${tx.type === 'receive' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {tx.type === 'receive' ? '+' : '-'}{tx.amount} {tx.currency}
                              </p>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500">{new Date(tx.date).toLocaleDateString()}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="mt-6 pt-6 border-t border-yellow-50 dark:border-yellow-900/10 flex items-center space-x-3">
                      <img src={user.photoURL || ""} alt="User" className="w-8 h-8 rounded-full border border-yellow-100 dark:border-yellow-900/20" referrerPolicy="no-referrer" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user.displayName}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{user.email}</p>
                      </div>
                      <button onClick={handleLogout} className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                        <LogOut size={18} />
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>

            {/* Wallet Modal */}
            <AnimatePresence>
              {isWalletModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsWalletModalOpen(false)}
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-[32px] shadow-2xl overflow-hidden border border-yellow-50 dark:border-yellow-900/10"
                  >
                    <div className="p-8">
                      <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-light text-gray-900 dark:text-white">Wallets</h2>
                        <button onClick={() => setIsWalletModalOpen(false)} className="p-2 hover:bg-yellow-50 dark:hover:bg-yellow-900/10 rounded-full transition-colors">
                          <X size={20} className="text-gray-400 dark:text-gray-500" />
                        </button>
                      </div>

                      <div className="space-y-4 mb-8">
                        <div className="flex flex-col space-y-3">
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] font-medium mb-1 px-2">Available Wallets</p>
                          {wallets.map((w) => (
                            <button
                              key={w.adapter.name}
                              disabled={connecting && wallet?.adapter.name !== w.adapter.name}
                              onClick={async () => {
                                try {
                                  // If a wallet is already selected but not connected, reset it first
                                  if (wallet && !publicKey) {
                                    await disconnect();
                                    select(null);
                                  }
                                  
                                  if (wallet?.adapter.name === w.adapter.name && !publicKey) {
                                    await w.adapter.connect();
                                  } else {
                                    select(w.adapter.name);
                                  }
                                } catch (err) {
                                  console.error('Wallet connection error:', err);
                                  // Reset on error to allow retry
                                  select(null);
                                }
                              }}
                              className={`w-full p-5 rounded-[24px] border-2 transition-all flex items-center justify-between group active:scale-[0.98] ${wallet?.adapter.name === w.adapter.name ? 'border-yellow-400 bg-yellow-50/50 dark:bg-yellow-900/10' : 'border-gray-50 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 hover:border-yellow-200 dark:hover:border-yellow-900/30 hover:bg-white dark:hover:bg-gray-800'}`}
                            >
                              <div className="flex items-center space-x-4">
                                <div className="w-12 h-12 rounded-2xl bg-white dark:bg-gray-700 shadow-sm border border-gray-100 dark:border-gray-600 flex items-center justify-center overflow-hidden p-2.5">
                                  <img src={w.adapter.icon} alt={w.adapter.name} className="w-full h-full object-contain" />
                                </div>
                                <div className="text-left">
                                  <p className="text-base font-semibold text-gray-800 dark:text-gray-100">{w.adapter.name}</p>
                                  <p className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">
                                    {w.readyState === 'Installed' ? 'Installed' : 'Web Wallet'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center">
                                {wallet?.adapter.name === w.adapter.name ? (
                                  connecting ? (
                                    <div className="flex items-center space-x-2 bg-yellow-100 dark:bg-yellow-900/30 px-3 py-1.5 rounded-full">
                                      <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                      >
                                        <Zap size={14} className="text-yellow-600 dark:text-yellow-400" />
                                      </motion.div>
                                      <span className="text-[10px] font-bold text-yellow-700 dark:text-yellow-500 uppercase tracking-tight">Connecting</span>
                                    </div>
                                  ) : publicKey ? (
                                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                                      <Check size={18} className="text-green-600 dark:text-green-400" />
                                    </div>
                                  ) : (
                                    <ChevronRight size={20} className="text-yellow-400" />
                                  )
                                ) : (
                                  <ChevronRight size={20} className="text-gray-200 dark:text-gray-700 group-hover:text-yellow-300 transition-colors" />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>

                        {(connecting || (wallet && !publicKey)) && (
                          <button
                            onClick={async () => {
                              await disconnect();
                              // Force clear the wallet selection if it's stuck
                              select(null);
                            }}
                            className="w-full py-3 text-xs text-yellow-600 dark:text-yellow-500 font-medium hover:text-yellow-700 dark:hover:text-yellow-400 transition-colors"
                          >
                            Cancel & Reset Connection
                          </button>
                        )}

                        <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] font-medium mb-3 px-2">Linked Addresses</p>
                          <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                          {linkedWallets.length === 0 ? (
                            <div className="text-center py-6 px-4">
                              <p className="text-sm text-gray-400 dark:text-gray-600">No wallets linked yet</p>
                            </div>
                          ) : (
                            linkedWallets.map((addr) => (
                              <div 
                                key={addr}
                                onClick={() => setWalletAddress(addr)}
                                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between group ${walletAddress === addr ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/10' : 'border-yellow-50 dark:border-gray-800 bg-white dark:bg-gray-800/30 hover:border-yellow-200 dark:hover:border-yellow-900/30'}`}
                              >
                                <div className="flex items-center space-x-3">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${walletAddress === addr ? 'bg-yellow-400 text-white' : 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400'}`}>
                                    <Zap size={14} />
                                  </div>
                                  <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                                    {addr.slice(0, 6)}...{addr.slice(-6)}
                                  </span>
                                </div>
                                <div className="flex items-center space-x-2">
                                  {walletAddress === addr && <Check size={18} className="text-yellow-500" />}
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveWallet(addr);
                                    }}
                                    className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                      
                      {walletAddress && (
                        <button
                          onClick={async () => {
                            if (publicKey && walletAddress === publicKey.toBase58()) {
                              await disconnect();
                            }
                            setWalletAddress(null);
                            setIsWalletModalOpen(false);
                          }}
                          className="w-full py-3 text-sm text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors font-medium"
                        >
                          Disconnect Current
                        </button>
                      )}
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* App Bar */}
            <header className="absolute top-0 left-0 right-0 z-30 p-6 flex justify-between items-center bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-yellow-50 dark:border-yellow-900/20 transition-colors">
              <div 
                className="flex items-center space-x-2 cursor-pointer group" 
                onClick={() => setIsSidebarOpen(true)}
              >
                <div className="relative p-2 bg-yellow-50 dark:bg-yellow-900/10 rounded-xl border border-yellow-100 dark:border-yellow-900/20 group-hover:bg-yellow-100 dark:group-hover:bg-yellow-900/20 transition-colors">
                  <Sun className="text-yellow-500 w-6 h-6 group-hover:rotate-45 transition-transform duration-500" />
                </div>
                <span className="text-xl font-light tracking-tight text-gray-900 dark:text-white">Sollar</span>
              </div>
              
              <div className="flex items-center space-x-4">
                <button 
                  onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                  className="p-2 text-gray-400 hover:text-yellow-500 dark:hover:text-yellow-400 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
                </button>

                {!walletAddress ? (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsWalletModalOpen(true)}
                    className="px-4 py-2 bg-yellow-400 text-white rounded-full text-sm font-medium shadow-sm hover:bg-yellow-500 transition-all flex items-center space-x-2"
                  >
                    <Wallet size={16} />
                    <span>Link Wallet</span>
                  </motion.button>
                ) : (
                  <div 
                    onClick={() => setIsWalletModalOpen(true)}
                    className="flex items-center space-x-2 px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-900/20 rounded-full cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/20 transition-colors"
                  >
                    <Zap className="text-yellow-500 w-4 h-4" />
                    <span className="text-xs font-mono text-yellow-700 dark:text-yellow-500">
                      {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
                    </span>
                  </div>
                )}
                
                <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                  <LogOut size={20} />
                </button>
              </div>
            </header>

            {/* View Switcher */}
            <div className="flex-1 flex flex-col pt-24">
              <AnimatePresence mode="wait">
                {activeView === "dashboard" && (
                  <motion.main
                    key="dashboard"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.02 }}
                    className="flex-1 flex flex-col sm:flex-row"
                  >
                    {/* Request Button */}
                    <button
                      disabled={!walletAddress}
                      onClick={() => setActiveView("request")}
                      className={`flex-1 flex flex-col items-center justify-center p-8 border-b sm:border-b-0 sm:border-r border-yellow-100 dark:border-yellow-900/20 transition-all group ${!walletAddress ? "opacity-50 cursor-not-allowed grayscale" : "hover:bg-yellow-50 dark:hover:bg-yellow-900/10"}`}
                    >
                      <div className="w-20 h-20 bg-yellow-400 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-yellow-100 dark:shadow-yellow-900/20 group-hover:scale-110 transition-transform">
                        <QrCode className="text-white w-10 h-10" />
                      </div>
                      <h3 className="text-2xl font-light text-gray-900 dark:text-white mb-2">Request</h3>
                      <p className="text-gray-400 dark:text-gray-500 text-sm max-w-[200px] text-center">Receive Solana via QR code</p>
                      {!walletAddress && <p className="mt-4 text-xs text-yellow-600 dark:text-yellow-500 font-medium uppercase tracking-widest">Connect wallet first</p>}
                    </button>

                    {/* Pay Button */}
                    <button
                      disabled={!walletAddress}
                      onClick={() => setActiveView("scan")}
                      className={`flex-1 flex flex-col items-center justify-center p-8 transition-all group ${!walletAddress ? "opacity-50 cursor-not-allowed grayscale" : "hover:bg-yellow-50 dark:hover:bg-yellow-900/10"}`}
                    >
                      <div className="w-20 h-20 bg-yellow-400 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-yellow-100 dark:shadow-yellow-900/20 group-hover:scale-110 transition-transform">
                        <ScanLine className="text-white w-10 h-10" />
                      </div>
                      <h3 className="text-2xl font-light text-gray-900 dark:text-white mb-2">Pay</h3>
                      <p className="text-gray-400 dark:text-gray-500 text-sm max-w-[200px] text-center">Scan QR to send Solana</p>
                      {!walletAddress && <p className="mt-4 text-xs text-yellow-600 dark:text-yellow-500 font-medium uppercase tracking-widest">Connect wallet first</p>}
                    </button>

                    {/* Recent Activity (Dashboard Overlay) */}
                    {transactions.length > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 p-6 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-t border-yellow-50 dark:border-yellow-900/20 sm:hidden">
                        <div className="flex justify-between items-center mb-4">
                          <h4 className="text-xs font-bold text-gray-400 dark:text-gray-600 uppercase tracking-widest">Recent Activity</h4>
                          <button onClick={() => setIsSidebarOpen(true)} className="text-xs text-yellow-600 dark:text-yellow-500 font-medium">View All</button>
                        </div>
                        <div className="space-y-3">
                          {transactions.slice(0, 2).map((tx) => (
                            <div key={tx.id} className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${tx.type === 'receive' ? 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
                                  {tx.type === 'receive' ? <ArrowLeft size={12} className="rotate-45" /> : <ArrowLeft size={12} className="rotate-[225deg]" />}
                                </div>
                                <span className="text-sm text-gray-900 dark:text-white font-medium capitalize">{tx.type}</span>
                              </div>
                              <span className={`text-sm font-medium ${tx.type === 'receive' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {tx.type === 'receive' ? '+' : '-'}{tx.amount} {tx.currency}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.main>
                )}

                {activeView === "request" && (
                  <motion.div
                    key="request"
                    initial={{ opacity: 0, x: 100 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    className="flex-1 flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-950"
                  >
                    <button onClick={() => setActiveView("dashboard")} className="absolute top-28 left-8 flex items-center space-x-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                      <ArrowLeft size={20} />
                      <span>Back</span>
                    </button>

                    <div className="w-full max-w-sm space-y-8">
                      <div className="text-center space-y-2">
                        <h2 className="text-3xl font-light text-gray-900 dark:text-white">Request Payment</h2>
                        <p className="text-gray-400 dark:text-gray-500">Enter the amount to receive</p>
                      </div>

                      <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-yellow-400">
                          {currency === "USD" ? <DollarSign size={24} /> : <Zap size={24} />}
                        </div>
                        <input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-12 pr-24 py-4 bg-yellow-50 dark:bg-yellow-900/10 border-2 border-transparent focus:border-yellow-400 rounded-2xl text-2xl font-light outline-none transition-all text-gray-900 dark:text-white"
                        />
                        <button
                          onClick={() => setCurrency(currency === "USD" ? "SOL" : "USD")}
                          className="absolute right-4 top-1/2 -translate-y-1/2 px-3 py-1 bg-white dark:bg-gray-800 border border-yellow-200 dark:border-yellow-900/30 rounded-lg text-xs font-medium text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          {currency}
                        </button>
                      </div>

                      {amount && (
                        <div className="flex flex-col items-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                          <div className="p-6 bg-white dark:bg-white rounded-3xl shadow-2xl shadow-yellow-100 dark:shadow-none border border-yellow-50 dark:border-yellow-900/20">
                            <QRCodeCanvas value={generateSolanaPayUrl()} size={200} level="H" includeMargin={true} />
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest mb-1">Solana Pay Link</p>
                            <p className="text-sm font-mono text-yellow-600 dark:text-yellow-400 break-all max-w-[250px]">{getSolAmount()} SOL</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {activeView === "scan" && (
                  <motion.div
                    key="scan"
                    initial={{ opacity: 0, x: 100 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    className="flex-1 flex flex-col items-center p-8 bg-white dark:bg-gray-950"
                  >
                    <button 
                      onClick={() => setActiveView("dashboard")} 
                      className="absolute top-28 left-8 flex items-center space-x-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors z-10"
                    >
                      <ArrowLeft size={20} />
                      <span>Back</span>
                    </button>

                    <div className="flex-1 flex flex-col items-center justify-center w-full">
                      <div className={`w-full max-w-sm aspect-square relative rounded-[40px] overflow-hidden transition-all duration-500 ${isScanning ? 'shadow-2xl shadow-yellow-400/10 bg-gray-900' : 'bg-white dark:bg-gray-900'}`}>
                        <div id="reader" className="w-full h-full scale-110"></div>
                        
                        {scannerError && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-gray-900 z-20">
                            <div className="flex-1 flex flex-col items-center justify-center">
                              <Zap className="text-yellow-400 w-12 h-12 mb-4 opacity-20" />
                              <p className="text-gray-400 dark:text-gray-500 font-light text-sm max-w-[200px]">{scannerError}</p>
                            </div>
                            <button 
                              onClick={() => setActiveView("dashboard")}
                              className="w-full py-4 bg-yellow-400 text-white rounded-2xl text-sm font-medium shadow-lg shadow-yellow-100 dark:shadow-none active:scale-95 transition-all"
                            >
                              Return to Dashboard
                            </button>
                          </div>
                        )}

                        {!scannerError && !isScanning && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white dark:bg-gray-900 z-10">
                            <motion.div
                              animate={{ scale: [1, 1.1, 1] }}
                              transition={{ duration: 2, repeat: Infinity }}
                            >
                              <Zap className="text-yellow-400 w-8 h-8 mb-4" />
                            </motion.div>
                            <p className="text-gray-400 dark:text-gray-600 text-xs tracking-widest uppercase">Initializing</p>
                          </div>
                        )}

                        {isScanning && (
                          <div className="absolute inset-0 pointer-events-none">
                            <div className="absolute inset-12">
                              {/* Top Left */}
                              <div className="absolute top-0 left-0 w-10 h-10 border-t-[3px] border-l-[3px] border-yellow-400 rounded-tl-3xl" />
                              {/* Top Right */}
                              <div className="absolute top-0 right-0 w-10 h-10 border-t-[3px] border-r-[3px] border-yellow-400 rounded-tr-3xl" />
                              {/* Bottom Left */}
                              <div className="absolute bottom-0 left-0 w-10 h-10 border-b-[3px] border-l-[3px] border-yellow-400 rounded-bl-3xl" />
                              {/* Bottom Right */}
                              <div className="absolute bottom-0 right-0 w-10 h-10 border-b-[3px] border-r-[3px] border-yellow-400 rounded-br-3xl" />
                              
                              {/* Scanning Line Animation */}
                              <motion.div 
                                initial={{ top: "0%" }}
                                animate={{ top: "100%" }}
                                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-yellow-400/50 to-transparent z-10"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {isScanning && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="py-8"
                      >
                        <p className="text-gray-400 text-[10px] uppercase tracking-[0.3em] font-medium">
                          Scanning for QR Code
                        </p>
                      </motion.div>
                    )}
                  </motion.div>
                )}

                {activeView === "confirm" && pendingPayment && (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    className="flex-1 flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-950"
                  >
                    <div className="w-full max-w-sm space-y-8">
                      <div className="text-center space-y-4">
                        <div className="w-20 h-20 bg-yellow-50 dark:bg-yellow-900/10 rounded-full flex items-center justify-center mx-auto">
                          <Zap className="text-yellow-400 w-10 h-10" />
                        </div>
                        <h2 className="text-3xl font-light text-gray-900 dark:text-white">Confirm Payment</h2>
                        <p className="text-gray-400 dark:text-gray-500">Review the details before sending</p>
                      </div>

                      <div className="bg-yellow-50 dark:bg-yellow-900/10 rounded-3xl p-6 space-y-4 border border-yellow-100 dark:border-yellow-900/20">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-widest">Amount</span>
                          <span className="text-xl font-medium text-gray-900 dark:text-white">{pendingPayment.amount} SOL</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-widest">Recipient</span>
                          <span className="text-xs font-mono text-gray-600 dark:text-gray-400">{pendingPayment.recipient.slice(0, 8)}...{pendingPayment.recipient.slice(-8)}</span>
                        </div>
                        {pendingPayment.label && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-widest">Label</span>
                            <span className="text-sm text-gray-600 dark:text-gray-400">{pendingPayment.label}</span>
                          </div>
                        )}
                        {pendingPayment.message && (
                          <div className="pt-4 border-t border-yellow-100 dark:border-yellow-900/20">
                            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Message</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400 italic">"{pendingPayment.message}"</p>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <button
                          onClick={handleConfirmPayment}
                          className="w-full py-4 bg-yellow-400 text-white rounded-2xl font-medium shadow-lg shadow-yellow-100 dark:shadow-none hover:bg-yellow-500 transition-all active:scale-95"
                        >
                          Confirm & Pay
                        </button>
                        <button
                          onClick={() => {
                            setPendingPayment(null);
                            setActiveView("dashboard");
                          }}
                          className="w-full py-4 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-sm font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <footer className="p-6 flex justify-center items-center space-x-3 opacity-50">
              <img src={user.photoURL || ""} alt={user.displayName || "User"} className="w-6 h-6 rounded-full border border-white dark:border-gray-800 shadow-sm" referrerPolicy="no-referrer" />
              <span className="text-xs text-gray-500 dark:text-gray-400">{user.displayName}</span>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], [network]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <SollarApp />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
