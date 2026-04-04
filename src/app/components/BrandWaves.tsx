import { motion } from 'motion/react';

interface BrandWavesProps {
  className?: string;
  animated?: boolean;
}

export function BrandWaves({ className = '', animated = true }: BrandWavesProps) {
  const waves = [
    { delay: 0, duration: 2, offset: 0, id: 'wave-0' },
    { delay: 0.2, duration: 2.2, offset: 10, id: 'wave-1' },
    { delay: 0.4, duration: 2.4, offset: 20, id: 'wave-2' },
  ];

  return (
    <div className={`relative ${className}`}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 120 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {waves.map((wave) => (
          <motion.path
            key={wave.id}
            d={`M 0 ${20 + wave.offset} Q 30 ${10 + wave.offset} 60 ${20 + wave.offset} T 120 ${20 + wave.offset}`}
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
            initial={animated ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            animate={
              animated
                ? {
                    pathLength: 1,
                    opacity: 1,
                  }
                : {}
            }
            transition={{
              pathLength: { delay: wave.delay, duration: wave.duration, ease: 'easeInOut' },
              opacity: { delay: wave.delay, duration: 0.3 },
            }}
          />
        ))}
      </svg>
    </div>
  );
}