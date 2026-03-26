/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from "motion/react";
import { LogOut, Sun, QrCode, ScanLine, Wallet, X, ArrowLeft, DollarSign, Zap, History, ChevronRight, Plus, Trash2, Check } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, User } from "./firebase";
import { QRCodeCanvas } from "qrcode.react";
import { Html5Qrcode } from "html5-qrcode";

const MERCHANT_WALLET = "HHQh2MtxehN9wQptR5oXSiEPSVe1eLjPiqJhKF6Z1WzJ";
const SOL_PRICE_USD = 150; // Mock price for conversion

interface Transaction {
  id: string;
  type: 'send' | 'receive';
  amount: string;
  currency: 'SOL' | 'USD';
  date: string;
  address: string;
}

const MOCK_TRANSACTIONS: Transaction[] = [
  { id: '1', type: 'receive', amount: '0.5', currency: 'SOL', date: '2026-03-25 14:30', address: '8x...2y' },
  { id: '2', type: 'send', amount: '15.00', currency: 'USD', date: '2026-03-24 09:15', address: '3a...9k' },
  { id: '3', type: 'receive', amount: '1.2', currency: 'SOL', date: '2026-03-23 18:45', address: 'HH...zJ' },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(() => {
    return localStorage.getItem("sollar_wallet");
  });
  const [activeView, setActiveView] = useState<"dashboard" | "request" | "scan">("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Request Payment State
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "SOL">("USD");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (walletAddress) {
      localStorage.setItem("sollar_wallet", walletAddress);
    } else {
      localStorage.removeItem("sollar_wallet");
    }
  }, [walletAddress]);

  const [linkedWallets, setLinkedWallets] = useState<string[]>(() => {
    const saved = localStorage.getItem("sollar_linked_wallets");
    return saved ? JSON.parse(saved) : [];
  });
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

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
                html5QrCode.stop().then(() => {
                  window.location.href = decodedText;
                }).catch(console.error);
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
      setActiveView("dashboard");
      setIsSidebarOpen(false);
    } catch (error) {
      console.error("Logout failed:", error);
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
      <div className="min-h-screen bg-white flex items-center justify-center">
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
    <div className="min-h-screen bg-white flex flex-col font-sans selection:bg-yellow-200 overflow-hidden">
      <AnimatePresence mode="wait">
        {!user ? (
          <motion.div
            key="login"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col items-center justify-center space-y-8"
          >
            <div className="w-24 h-24 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg shadow-yellow-100">
              <Sun className="text-white w-12 h-12" />
            </div>
            <h1 className="text-4xl font-light tracking-tight text-gray-900">Sollar</h1>
            <button
              onClick={handleLogin}
              className="px-8 py-3 bg-yellow-400 text-white font-medium rounded-full shadow-md hover:bg-yellow-500 hover:shadow-lg transition-all active:scale-95 flex items-center space-x-3"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 bg-white rounded-full p-0.5" />
              <span>Sign in with Google</span>
            </button>
          </motion.div>
        ) : (
          <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col h-screen relative">
            
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
                    className="absolute top-0 left-0 bottom-0 w-80 bg-white z-50 shadow-2xl p-6 flex flex-col"
                  >
                    <div className="flex justify-between items-center mb-8">
                      <div className="flex items-center space-x-2">
                        <History className="text-yellow-400 w-6 h-6" />
                        <h2 className="text-xl font-light tracking-tight">History</h2>
                      </div>
                      <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-yellow-50 rounded-full transition-colors">
                        <X size={20} className="text-gray-400" />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                      {MOCK_TRANSACTIONS.map((tx) => (
                        <div key={tx.id} className="p-4 rounded-2xl bg-yellow-50/50 border border-yellow-100 flex items-center justify-between group hover:bg-yellow-50 transition-colors">
                          <div className="flex items-center space-x-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.type === 'receive' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                              {tx.type === 'receive' ? <ArrowLeft size={18} className="rotate-45" /> : <ArrowLeft size={18} className="rotate-[225deg]" />}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900 capitalize">{tx.type}</p>
                              <p className="text-[10px] text-gray-400 font-mono">{tx.address}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-medium ${tx.type === 'receive' ? 'text-green-600' : 'text-red-600'}`}>
                              {tx.type === 'receive' ? '+' : '-'}{tx.amount} {tx.currency}
                            </p>
                            <p className="text-[10px] text-gray-400">{tx.date}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 pt-6 border-t border-yellow-50 flex items-center space-x-3">
                      <img src={user.photoURL || ""} alt="User" className="w-8 h-8 rounded-full border border-yellow-100" referrerPolicy="no-referrer" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{user.displayName}</p>
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                      </div>
                      <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
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
                    className="relative w-full max-w-sm bg-white rounded-[32px] shadow-2xl overflow-hidden"
                  >
                    <div className="p-8">
                      <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-light text-gray-900">Wallets</h2>
                        <button onClick={() => setIsWalletModalOpen(false)} className="p-2 hover:bg-yellow-50 rounded-full transition-colors">
                          <X size={20} className="text-gray-400" />
                        </button>
                      </div>

                      <div className="space-y-3 mb-8 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {linkedWallets.length === 0 ? (
                          <div className="text-center py-8 px-4 bg-yellow-50/50 rounded-2xl border border-dashed border-yellow-200">
                            <Wallet className="text-yellow-300 w-10 h-10 mx-auto mb-3" />
                            <p className="text-sm text-gray-500">No wallets linked yet</p>
                          </div>
                        ) : (
                          linkedWallets.map((addr) => (
                            <div 
                              key={addr}
                              onClick={() => setWalletAddress(addr)}
                              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between group ${walletAddress === addr ? 'border-yellow-400 bg-yellow-50' : 'border-yellow-50 bg-white hover:border-yellow-200'}`}
                            >
                              <div className="flex items-center space-x-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${walletAddress === addr ? 'bg-yellow-400 text-white' : 'bg-yellow-100 text-yellow-600'}`}>
                                  <Zap size={14} />
                                </div>
                                <span className="text-sm font-mono text-gray-600">
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
                                  className="p-1.5 text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <button
                        onClick={handleLinkWallet}
                        className="w-full py-4 bg-yellow-400 text-white font-medium rounded-2xl shadow-lg shadow-yellow-100 hover:bg-yellow-500 transition-all flex items-center justify-center space-x-2 active:scale-[0.98]"
                      >
                        <Plus size={20} />
                        <span>Link New Wallet</span>
                      </button>
                      
                      {walletAddress && (
                        <button
                          onClick={() => {
                            setWalletAddress(null);
                            setIsWalletModalOpen(false);
                          }}
                          className="w-full mt-3 py-3 text-sm text-gray-400 hover:text-red-500 transition-colors font-medium"
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
            <header className="absolute top-0 left-0 right-0 z-30 p-6 flex justify-between items-center bg-white/80 backdrop-blur-md border-b border-yellow-50">
              <div 
                className="flex items-center space-x-2 cursor-pointer group" 
                onClick={() => setIsSidebarOpen(true)}
              >
                <div className="relative p-2 bg-yellow-50 rounded-xl border border-yellow-100 group-hover:bg-yellow-100 transition-colors">
                  <Sun className="text-yellow-500 w-6 h-6 group-hover:rotate-45 transition-transform duration-500" />
                </div>
                <span className="text-xl font-light tracking-tight text-gray-900">Sollar</span>
              </div>
              
              <div className="flex items-center space-x-4">
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
                    className="flex items-center space-x-2 px-3 py-1.5 bg-yellow-50 border border-yellow-100 rounded-full cursor-pointer hover:bg-yellow-100 transition-colors"
                  >
                    <Zap className="text-yellow-500 w-4 h-4" />
                    <span className="text-xs font-mono text-yellow-700">
                      {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
                    </span>
                  </div>
                )}
                
                <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
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
                      className={`flex-1 flex flex-col items-center justify-center p-8 border-b sm:border-b-0 sm:border-r border-yellow-100 transition-all group ${!walletAddress ? "opacity-50 cursor-not-allowed grayscale" : "hover:bg-yellow-50"}`}
                    >
                      <div className="w-20 h-20 bg-yellow-400 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-yellow-100 group-hover:scale-110 transition-transform">
                        <QrCode className="text-white w-10 h-10" />
                      </div>
                      <h3 className="text-2xl font-light text-gray-900 mb-2">Request</h3>
                      <p className="text-gray-400 text-sm max-w-[200px] text-center">Receive Solana via QR code</p>
                      {!walletAddress && <p className="mt-4 text-xs text-yellow-600 font-medium uppercase tracking-widest">Connect wallet first</p>}
                    </button>

                    {/* Pay Button */}
                    <button
                      disabled={!walletAddress}
                      onClick={() => setActiveView("scan")}
                      className={`flex-1 flex flex-col items-center justify-center p-8 transition-all group ${!walletAddress ? "opacity-50 cursor-not-allowed grayscale" : "hover:bg-yellow-50"}`}
                    >
                      <div className="w-20 h-20 bg-yellow-400 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-yellow-100 group-hover:scale-110 transition-transform">
                        <ScanLine className="text-white w-10 h-10" />
                      </div>
                      <h3 className="text-2xl font-light text-gray-900 mb-2">Pay</h3>
                      <p className="text-gray-400 text-sm max-w-[200px] text-center">Scan QR to send Solana</p>
                      {!walletAddress && <p className="mt-4 text-xs text-yellow-600 font-medium uppercase tracking-widest">Connect wallet first</p>}
                    </button>
                  </motion.main>
                )}

                {activeView === "request" && (
                  <motion.div
                    key="request"
                    initial={{ opacity: 0, x: 100 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    className="flex-1 flex flex-col items-center justify-center p-8 bg-white"
                  >
                    <button onClick={() => setActiveView("dashboard")} className="absolute top-28 left-8 flex items-center space-x-2 text-gray-400 hover:text-gray-600 transition-colors">
                      <ArrowLeft size={20} />
                      <span>Back</span>
                    </button>

                    <div className="w-full max-w-sm space-y-8">
                      <div className="text-center space-y-2">
                        <h2 className="text-3xl font-light text-gray-900">Request Payment</h2>
                        <p className="text-gray-400">Enter the amount to receive</p>
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
                          className="w-full pl-12 pr-24 py-4 bg-yellow-50 border-2 border-transparent focus:border-yellow-400 rounded-2xl text-2xl font-light outline-none transition-all"
                        />
                        <button
                          onClick={() => setCurrency(currency === "USD" ? "SOL" : "USD")}
                          className="absolute right-4 top-1/2 -translate-y-1/2 px-3 py-1 bg-white border border-yellow-200 rounded-lg text-xs font-medium text-yellow-600 hover:bg-yellow-50 transition-colors"
                        >
                          {currency}
                        </button>
                      </div>

                      {amount && (
                        <div className="flex flex-col items-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                          <div className="p-6 bg-white rounded-3xl shadow-2xl shadow-yellow-100 border border-yellow-50">
                            <QRCodeCanvas value={generateSolanaPayUrl()} size={200} level="H" includeMargin={true} />
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Solana Pay Link</p>
                            <p className="text-sm font-mono text-yellow-600 break-all max-w-[250px]">{getSolAmount()} SOL</p>
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
                    className="flex-1 flex flex-col items-center p-8 bg-white"
                  >
                    <button 
                      onClick={() => setActiveView("dashboard")} 
                      className="absolute top-28 left-8 flex items-center space-x-2 text-gray-400 hover:text-gray-600 transition-colors z-10"
                    >
                      <ArrowLeft size={20} />
                      <span>Back</span>
                    </button>

                    <div className="flex-1 flex flex-col items-center justify-center w-full">
                      <div className={`w-full max-w-sm aspect-square relative rounded-[40px] overflow-hidden transition-all duration-500 ${isScanning ? 'shadow-2xl shadow-yellow-400/10 bg-gray-900' : 'bg-white'}`}>
                        <div id="reader" className="w-full h-full scale-110"></div>
                        
                        {scannerError && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-white z-20">
                            <div className="flex-1 flex flex-col items-center justify-center">
                              <Zap className="text-yellow-400 w-12 h-12 mb-4 opacity-20" />
                              <p className="text-gray-400 font-light text-sm max-w-[200px]">{scannerError}</p>
                            </div>
                            <button 
                              onClick={() => setActiveView("dashboard")}
                              className="w-full py-4 bg-yellow-400 text-white rounded-2xl text-sm font-medium shadow-lg shadow-yellow-100 active:scale-95 transition-all"
                            >
                              Return to Dashboard
                            </button>
                          </div>
                        )}

                        {!scannerError && !isScanning && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
                            <motion.div
                              animate={{ scale: [1, 1.1, 1] }}
                              transition={{ duration: 2, repeat: Infinity }}
                            >
                              <Zap className="text-yellow-400 w-8 h-8 mb-4" />
                            </motion.div>
                            <p className="text-gray-400 text-xs tracking-widest uppercase">Initializing</p>
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
              </AnimatePresence>
            </div>

            {/* Footer */}
            <footer className="p-6 flex justify-center items-center space-x-3 opacity-50">
              <img src={user.photoURL || ""} alt={user.displayName || "User"} className="w-6 h-6 rounded-full border border-white shadow-sm" referrerPolicy="no-referrer" />
              <span className="text-xs text-gray-500">{user.displayName}</span>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
