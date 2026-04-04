import { motion } from "motion/react";
import { AssetIcon } from "./AssetIcon";

interface AssetLoadingTransitionProps {
  assetName: string;
  assetLogo?: string;
  assetType: "stock" | "etf" | "forex" | "crypto";
}

export function AssetLoadingTransition({
  assetName,
  assetLogo,
  assetType,
}: AssetLoadingTransitionProps) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Animated Waves Background */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute left-1/2 top-1/2"
            initial={{ scale: 0, opacity: 0.6 }}
            animate={{
              scale: [0, 2.5, 3],
              opacity: [0.6, 0.3, 0],
            }}
            transition={{
              duration: 2,
              delay: i * 0.3,
              repeat: Infinity,
              ease: "easeOut",
            }}
            style={{
              transform: "translate(-50%, -50%)",
            }}
          >
            <svg
              width="800"
              height="800"
              viewBox="0 0 800 800"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M400 100 Q300 150 400 200 T400 300 T400 400 T400 500 T400 600 T400 700"
                stroke="url(#waveGradient)"
                strokeWidth="2"
                fill="none"
                opacity="0.4"
              />
              <path
                d="M100 400 Q150 300 200 400 T300 400 T400 400 T500 400 T600 400 T700 400"
                stroke="url(#waveGradient)"
                strokeWidth="2"
                fill="none"
                opacity="0.4"
              />
              <circle
                cx="400"
                cy="400"
                r="300"
                stroke="url(#waveGradient)"
                strokeWidth="2"
                fill="none"
                opacity="0.3"
              />
              <defs>
                <linearGradient
                  id="waveGradient"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6" />
                  <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#ec4899" stopOpacity="0.2" />
                </linearGradient>
              </defs>
            </svg>
          </motion.div>
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Asset Icon with pulse animation */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            duration: 0.5,
            ease: "easeOut",
          }}
        >
          <motion.div
            animate={{
              scale: [1, 1.05, 1],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <AssetIcon
              logo={assetLogo ?? ''}
              name={assetName}
              assetType={assetType}
              size="xl"
            />
          </motion.div>
        </motion.div>

        {/* Loading text */}
        <motion.div
          className="mt-8 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <h2
            className="text-xl font-semibold text-gray-900 tracking-tight mb-2"
            style={{
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
            }}
          >
            Analyse en cours
          </h2>
          <p className="text-sm text-gray-600">
            Chargement des données de {assetName}
          </p>
        </motion.div>

        {/* Animated dots */}
        <div className="flex gap-2 mt-6">
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="w-2 h-2 bg-blue-500 rounded-full"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.3, 1, 0.3],
              }}
              transition={{
                duration: 1.5,
                delay: i * 0.2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
