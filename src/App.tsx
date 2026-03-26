/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from "motion/react";
import { LogOut, Sun } from "lucide-react";
import { useState, useEffect } from "react";
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, User } from "./firebase";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
    } catch (error) {
      console.error("Logout failed:", error);
    }
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
    <div className="min-h-screen bg-white flex flex-col items-center justify-center font-sans selection:bg-yellow-200">
      <AnimatePresence mode="wait">
        {!user ? (
          <motion.div
            key="login"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center space-y-8"
          >
            {/* Logo: Minimal Sun/Solar icon */}
            <div className="w-24 h-24 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg shadow-yellow-100">
              <Sun className="text-white w-12 h-12" />
            </div>

            <h1 className="text-4xl font-light tracking-tight text-gray-900">
              Sollar
            </h1>

            <button
              onClick={handleLogin}
              className="px-8 py-3 bg-yellow-400 text-white font-medium rounded-full shadow-md hover:bg-yellow-500 hover:shadow-lg transition-all active:scale-95 flex items-center space-x-3"
            >
              <img 
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
                alt="Google" 
                className="w-5 h-5 bg-white rounded-full p-0.5"
              />
              <span>Sign in with Google</span>
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center space-y-6 p-8 bg-yellow-50 rounded-3xl border border-yellow-100"
          >
            <div className="relative">
              <img
                src={user.photoURL || ""}
                alt={user.displayName || "User"}
                className="w-20 h-20 rounded-full border-4 border-white shadow-sm"
                referrerPolicy="no-referrer"
              />
              <div className="absolute -bottom-1 -right-1 bg-yellow-400 p-1.5 rounded-full border-2 border-white">
                <Sun className="text-white w-3 h-3" />
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm text-yellow-600 font-medium uppercase tracking-widest mb-1">Welcome to</p>
              <h2 className="text-3xl font-light text-gray-900">Sollar</h2>
              <p className="text-gray-500 mt-2">{user.displayName}</p>
            </div>

            <button
              onClick={handleLogout}
              className="mt-4 flex items-center space-x-2 text-gray-400 hover:text-gray-600 transition-colors text-sm"
            >
              <LogOut size={16} />
              <span>Sign out</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
