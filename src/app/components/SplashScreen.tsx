import { motion } from 'motion/react';
import { AppLogo } from './AppLogo';

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 flex items-center justify-center"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
      onAnimationComplete={() => {
        setTimeout(onComplete, 2500);
      }}
    >
      <div className="text-center">
        {/* Logo Container */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
          className="mb-8"
        >
          <div className="w-28 h-28 mx-auto flex items-center justify-center">
            <AppLogo
              size={112}
              rounded="rounded-[32px]"
              shadow={false}
            />
          </div>
        </motion.div>

        {/* App Name */}
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="text-4xl font-semibold text-white tracking-tight mb-3"
          style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif' }}
        >
          CBPR Quant
        </motion.h1>

        {/* Tagline */}
        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="text-blue-100 text-lg"
        >
          Quand acheter ?
        </motion.p>

        {/* Loading Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.4 }}
          className="mt-12"
        >
          <div className="flex gap-1.5 justify-center">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 bg-white rounded-full"
                animate={{
                  scale: [1, 1.4, 1],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.15,
                }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
