/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from "motion/react";
import { LogOut, Sun, QrCode, ScanLine, Wallet, X, ArrowLeft, DollarSign, Zap } from "lucide-react";
import { useState, useEffect } from "react";
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, User } from "./firebase";
import { QRCodeCanvas } from "qrcode.react";
import { QrReader } from "@blackbox-vision/react-qr-reader";

const MERCHANT_WALLET = "HHQh2MtxehN9wQptR5oXSiEPSVe1eLjPiqJhKF6Z1WzJ";
const SOL_PRICE_USD = 150; // Mock price for conversion

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"dashboard" | "request" | "scan">("dashboard");
  
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
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleLinkWallet = () => {
    // For now, link the requested wallet address
    setWalletAddress(MERCHANT_WALLET);
  };

  const getSolAmount = () => {
    if (!amount) return "0";
    if (currency === "SOL") return amount;
    return (parseFloat(amount) / SOL_PRICE_USD).toFixed(4);
  };

  const generateSolanaPayUrl = () => {
    const solAmount = getSolAmount();
    return `solana:${MERCHANT_WALLET}?amount=${solAmount}&label=Sollar%20Payment&message=Thanks%20for%20using%20Sollar`;
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
            
            {/* App Bar */}
            <header className="absolute top-0 left-0 right-0 z-30 p-6 flex justify-between items-center bg-white/80 backdrop-blur-md border-b border-yellow-50">
              <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setActiveView("dashboard")}>
                <Sun className="text-yellow-400 w-6 h-6" />
                <span className="text-xl font-light tracking-tight text-gray-900">Sollar</span>
              </div>
              
              <div className="flex items-center space-x-4">
                {!walletAddress ? (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleLinkWallet}
                    className="px-4 py-2 bg-yellow-400 text-white rounded-full text-sm font-medium shadow-sm hover:bg-yellow-500 transition-all flex items-center space-x-2"
                  >
                    <Wallet size={16} />
                    <span>Link Wallet</span>
                  </motion.button>
                ) : (
                  <div className="flex items-center space-x-2 px-3 py-1.5 bg-yellow-50 border border-yellow-100 rounded-full">
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
                    className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-900"
                  >
                    <button onClick={() => setActiveView("dashboard")} className="absolute top-28 left-8 flex items-center space-x-2 text-white/60 hover:text-white transition-colors z-10">
                      <ArrowLeft size={20} />
                      <span>Back</span>
                    </button>

                    <div className="w-full max-w-sm aspect-square relative rounded-3xl overflow-hidden border-4 border-yellow-400 shadow-2xl shadow-yellow-400/20">
                      <QrReader
                        onResult={(result, error) => {
                          if (result) {
                            const text = result.getText();
                            if (text.startsWith("solana:")) {
                              window.location.href = text; // Deeplink to wallet
                            }
                          }
                        }}
                        constraints={{ facingMode: "environment" }}
                        containerStyle={{ width: "100%", height: "100%" }}
                        videoStyle={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                      <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none">
                        <div className="w-full h-full border-2 border-yellow-400/50 rounded-xl" />
                      </div>
                      <div className="absolute bottom-8 left-0 right-0 text-center">
                        <p className="text-white text-sm font-light bg-black/40 backdrop-blur-md py-2 px-4 rounded-full inline-block">
                          Align QR code within frame
                        </p>
                      </div>
                    </div>
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
