import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { BrandWaves } from '../components/BrandWaves';
import { AppLogo } from '../components/AppLogo';
import { useWebHaptics } from "web-haptics/react";


export function Landing() {
  const { trigger } = useWebHaptics();
  const triggerTap = () => trigger("success");

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-gray-50 flex items-center justify-center px-4 overflow-hidden">
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
          <h1 className="text-4xl font-semibold text-gray-900 tracking-tight" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif' }}>
            CBPR Quant
          </h1>
          <p className="text-gray-600 text-lg leading-relaxed">
            Répondez à la question essentielle :<br />
            <span className="font-semibold text-gray-900">Quand acheter ?</span>
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
          className="text-xs text-gray-500 px-8 leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.8 }}
        >
          Cette application ne fournit pas de conseils d'investissement.
          Elle vous aide à identifier les opportunités d'achat potentielles.
        </motion.p>

        {/* Floating brand elements */}
        <motion.div
          className="absolute top-20 left-10 opacity-10"
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
          <BrandWaves className="w-20 h-20 text-blue-500" animated={false} />
        </motion.div>

        <motion.div
          className="absolute bottom-20 right-10 opacity-10"
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
          <BrandWaves className="w-16 h-16 text-blue-500" animated={false} />
        </motion.div>
      </div>
    </div>
  );
}