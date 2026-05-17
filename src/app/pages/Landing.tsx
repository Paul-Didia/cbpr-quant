import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { AppLogo } from '../components/AppLogo';
import { useWebHaptics } from "web-haptics/react";


export function Landing() {
  const { trigger } = useWebHaptics();
  const triggerTap = () => trigger("success");

  return (
    <div className="min-h-screen bg-[#0e1117] flex items-center justify-center px-4 overflow-hidden">
      <div className="max-w-md w-full text-center space-y-10">
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
          <p className="text-[#a3aab8] text-lg leading-relaxed">
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
              className="w-full bg-[#262730] border border-white/15 text-white py-4 px-6 rounded-2xl font-medium text-lg shadow-lg shadow-black/30 relative overflow-hidden"
              whileHover={{ scale: 1.02, boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.45)' }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <span className="relative z-10">Commencer</span>
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-[#1f2937] to-[#262730]"
                initial={{ x: '-100%' }}
                whileHover={{ x: 0 }}
                transition={{ duration: 0.3 }}
              />
            </motion.button>
          </Link>
        </motion.div>

        {/* Disclaimer */}
        <motion.div
          className="space-y-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.8 }}
        >
          <p className="text-xs text-[#a3aab8] px-8 leading-relaxed">
            Cette application ne fournit pas de conseils d'investissement.
            Elle vous aide à identifier les opportunités d'achat potentielles.
          </p>

          <Link
            to="/enterprise-login"
            className="inline-block text-[10px] text-[#5f6673] hover:text-[#a3aab8] transition-colors"
          >
            Accès entreprise
          </Link>
        </motion.div>

        {/* Floating brand elements */}
        <motion.div
          className="absolute top-20 left-10 opacity-10 pointer-events-none"
          animate={{
            y: [0, -20, 0],
            rotate: [0, 5, 0],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <AppLogo
            size={96}
            rounded="rounded-[28px]"
            shadow={false}
          />
        </motion.div>

        <motion.div
          className="absolute bottom-20 right-10 opacity-10 pointer-events-none"
          animate={{
            y: [0, 20, 0],
            rotate: [0, -5, 0],
          }}
          transition={{
            duration: 7,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <AppLogo
            size={72}
            rounded="rounded-[24px]"
            shadow={false}
          />
        </motion.div>
      </div>
    </div>
  );
}