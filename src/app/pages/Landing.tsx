import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { AppLogo } from '../components/AppLogo';
import { useWebHaptics } from "web-haptics/react";


export function Landing() {
  const { trigger } = useWebHaptics();
  const triggerTap = () => trigger("success");

  return (
    <div className="relative min-h-screen bg-[#061a3a] flex items-center justify-center px-4 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(59,130,246,0.35)_0%,rgba(15,60,130,0.22)_24%,rgba(6,26,58,0)_58%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#071b3c_0%,#06152f_52%,#030b1b_100%)] pointer-events-none" />
      <div className="absolute left-1/2 top-[38%] h-[980px] w-[1600px] -translate-x-1/2 rounded-[50%] bg-[#061225] border-t border-blue-300/50 shadow-[0_-18px_45px_rgba(59,130,246,0.65)] pointer-events-none" />
      <div className="absolute left-[18%] top-[14%] h-1.5 w-1.5 rounded-full bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.9)] pointer-events-none" />
      <div className="absolute right-[18%] top-[11%] h-1.5 w-1.5 rounded-full bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.9)] pointer-events-none" />
      <div className="absolute right-[30%] top-[23%] h-2 w-2 rounded-full bg-white/90 shadow-[0_0_16px_rgba(255,255,255,0.95)] pointer-events-none" />
      <div className="absolute left-[10%] top-[32%] h-2 w-2 rotate-45 bg-white/80 shadow-[0_0_18px_rgba(255,255,255,0.95)] pointer-events-none" />
      <div className="absolute left-[22%] top-[30%] h-1 w-1 rotate-45 bg-white/80 shadow-[0_0_18px_rgba(255,255,255,0.95)] pointer-events-none" />
      <div className="absolute right-[13%] top-[30%] h-0.5 w-0.5 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.9)] pointer-events-none" />
      <div className="absolute right-[30%] top-[10%] h-0.5 w-0.5 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.9)] pointer-events-none" />
      <div className="absolute right-[70%] top-[12%] h-0.5 w-0.5 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.9)] pointer-events-none" />
      <div className="absolute right-[62%] top-[10%] h-0.5 w-0.5 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.9)] pointer-events-none" />
      <div className="absolute left-[35%] top-[8%] h-0.5 w-0.5 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.9)] pointer-events-none" />
      <div className="absolute left-[50%] top-[18%] h-0.5 w-0.5 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.9)] pointer-events-none" />
      <div className="absolute right-[40%] top-[26%] h-0.5 w-0.5 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.9)] pointer-events-none" />
      <div className="absolute left-[15%] top-[40%] h-0.5 w-0.5 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.9)] pointer-events-none" />

      
      <div className="relative z-10 max-w-md w-full text-center space-y-10">
        {/* Animated Logo */}
        <motion.div
          className="flex justify-center"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <AppLogo size={96} rounded="rounded-[28px]" shadow />
        </motion.div>

        {/* Title */}
        <motion.div
          className="space-y-4"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          <h1 className="text-4xl font-semibold text-white tracking-tight" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif' }}>
            CBPR Quant
          </h1>
          <p className="text-white/80 text-lg leading-relaxed">
            Répondez à la question essentielle :<br />
            <span className="font-semibold text-white">Quand acheter ?</span>
          </p>
        </motion.div>

        {/* CTA Button */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
        >
          <Link to="/auth">
            <motion.button
              onClick={triggerTap}
              className="w-full bg-blue-500 text-white py-4 px-6 rounded-2xl font-medium text-lg shadow-lg shadow-blue-500/25 relative overflow-hidden"
              whileHover={{ scale: 1.02, boxShadow: '0 20px 25px -5px rgb(59 130 246 / 0.3)' }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <span className="relative z-10">Commencer</span>
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-500"
                initial={{ x: '-100%' }}
                whileHover={{ x: 0 }}
                transition={{ duration: 0.3 }}
              />
            </motion.button>
          </Link>
        </motion.div>

        {/* Disclaimer */}
        <motion.p
          className="text-xs text-white/60 px-8 leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.8 }}
        >
          Cette application ne fournit pas de conseils d'investissement.
          Elle vous aide à identifier les opportunités d'achat potentielles.
        </motion.p>
      </div>
    </div>
  );
}