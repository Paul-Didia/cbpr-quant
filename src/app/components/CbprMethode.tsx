import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useMemo, useState } from "react";

type CbprMethodeProps = {
  isOpen: boolean;
  onClose: () => void;
};

type Slide = {
  title: string;
  paragraphs: string[];
  highlight?: string;
};

const slides: Slide[] = [
  {
    title: "Comment fonctionne l’analyse CBPR ?",
    paragraphs: [
      "Imagine le prix d’un actif comme un élastique attaché à un point central : sa moyenne de long terme.",
      "La plupart du temps, le prix évolue autour de ce point de manière équilibrée.",
      "Mais sous l’effet de la peur ou de l’euphorie, il peut s’en éloigner fortement — trop haut ou trop bas.",
    ],
    highlight:
      "💡 Plus l’élastique est étiré, plus la force de rappel vers le centre devient importante.",
  },
  {
    title: "Ce que cherche l’outil",
    paragraphs: [
      "L’analyse CBPR consiste à repérer ces zones d’excès, là où le prix s’est éloigné de manière anormale de sa moyenne.",
      "Ce sont des zones où un retour devient statistiquement plus probable.",
      "Mais l’outil va plus loin.",
      "Il ne regarde pas seulement la distance au centre, mais aussi le comportement du marché.",
    ],
  },
  {
    title: "Ce que CBPR observe",
    paragraphs: [
      "Le mouvement est-il encore en accélération ?",
      "Ou commence-t-il à ralentir ?",
      "Le prix se trouve-t-il sur une zone où il a déjà réagi dans le passé ?",
      "C’est cette combinaison qui permet d’identifier une zone d'opportunité.",
    ],
  },
  {
    title: "Ce que l’outil ne fait pas",
    paragraphs: [
      "CBPR ne prédit pas l’avenir.",
      "Il ne dit pas “achète” ou “vends”.",
      "Il identifie simplement des zones où les conditions sont réunies pour qu’un mouvement devienne intéressant à surveiller.",
    ],
  },
];

export function CbprMethode({ isOpen, onClose }: CbprMethodeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentSlide = useMemo(() => slides[currentIndex], [currentIndex]);

  const goPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
  };

  const goNext = () => {
    setCurrentIndex((prev) => (prev === slides.length - 1 ? 0 : prev + 1));
  };

  const handleClose = () => {
    setCurrentIndex(0);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.98 }}
          transition={{ duration: 0.22 }}
          className="w-full max-w-2xl rounded-[32px] bg-white shadow-2xl border border-gray-100 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 pt-6 pb-2 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-1 h-10 rounded-full bg-[#3590F3]" />
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-gray-400">
                  CBPR™ methodology
                </p>
                <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
                  {currentSlide.title}
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-700 transition-colors"
              aria-label="Fermer"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="px-6 pb-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.22 }}
                className="rounded-[28px] bg-[#f8f9fb] px-6 py-6"
              >
                <div className="space-y-5">
                  {currentSlide.paragraphs.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="text-[18px] leading-[1.35] text-gray-700 tracking-tight"
                    >
                      {paragraph}
                    </p>
                  ))}

                  {currentSlide.highlight ? (
                    <div className="rounded-2xl bg-[#eef3ff] px-4 py-4">
                      <p className="text-[18px] leading-[1.35] text-[#27408f] font-medium tracking-tight">
                        {currentSlide.highlight}
                      </p>
                    </div>
                  ) : null}
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="mt-5 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={goPrevious}
                className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Précédent
              </button>

              <div className="flex items-center gap-2">
                {slides.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    className={`h-2.5 rounded-full transition-all ${
                      index === currentIndex ? "w-7 bg-[#27408f]" : "w-2.5 bg-gray-300"
                    }`}
                    aria-label={`Aller à la slide ${index + 1}`}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#27408f] px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-[#203678] transition-colors"
              >
                Suivant
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}