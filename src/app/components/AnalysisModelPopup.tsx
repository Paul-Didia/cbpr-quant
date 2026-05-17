import { useEffect, useState } from "react";
import { X, Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import cbprMethodeSvg from "../assets/cbpr_methode.svg";
import volatilityBreakoutMethodeSvg from "../assets/volatility_breakout_methode.svg";
import meanReversionMethodeSvg from "../assets/mean_reversion_methode.svg";

export type AnalysisModel = "cbpr" | "volatility_breakout" | "mean_reversion";

export const ANALYSIS_MODELS: Array<{
  id: AnalysisModel;
  label: string;
  shortLabel: string;
  description: string;
  image: string;
}> = [
  {
    id: "cbpr",
    label: "CBPR Quant",
    shortLabel: "CBPR Analysis",
    description:
      "Le modèle CBPR combine le prix, la moyenne long terme, les zones d'excès, les pivots et le RSI pour identifier les phases où le marché devient lisible. Il cherche surtout à répondre à une question simple : est-ce le bon moment pour agir ou faut-il attendre ?",
    image: cbprMethodeSvg,
  },
  {
    id: "volatility_breakout",
    label: "Rupture volatilité",
    shortLabel: "Breakout",
    description:
      "Le modèle de rupture analyse les moments où le prix sort d'un range récent avec une volatilité en hausse et une tendance courte cohérente. Il cherche les débuts de mouvement, lorsque le marché quitte une zone calme pour accélérer dans une direction.",
    image: volatilityBreakoutMethodeSvg,
  },
  {
    id: "mean_reversion",
    label: "Retour à la moyenne",
    shortLabel: "Mean Reversion",
    description:
      "Le modèle de retour à la moyenne observe l'écart entre le prix actuel et sa moyenne long terme. Il cherche les situations où le prix semble trop éloigné de son équilibre, comme un élastique trop tendu susceptible de revenir vers son centre.",
    image: meanReversionMethodeSvg,
  },
];

type AnalysisModelPopupProps = {
  isOpen: boolean;
  selectedModel: AnalysisModel;
  onApply: (model: AnalysisModel) => void;
  onClose: () => void;
};

export function AnalysisModelPopup({
  isOpen,
  selectedModel,
  onApply,
  onClose,
}: AnalysisModelPopupProps) {
  const [draftModel, setDraftModel] = useState<AnalysisModel>(selectedModel);

  useEffect(() => {
    if (isOpen) {
      setDraftModel(selectedModel);
    }
  }, [isOpen, selectedModel]);

  const draftModelInfo =
    ANALYSIS_MODELS.find((model) => model.id === draftModel) || ANALYSIS_MODELS[0];

  const handleApply = () => {
    onApply(draftModel);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/45 px-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-4xl max-h-[86vh] overflow-hidden rounded-[28px] border border-white/10 bg-[#1E2939] shadow-2xl shadow-black/40"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.22 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4 sm:px-6">
              <div>
                <div className="text-xs uppercase tracking-wide text-white/45">
                  Modèle d'analyse
                </div>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
                  Choisir une méthode
                </h2>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[260px_1fr]">
              <div className="border-b border-white/5 p-4 md:border-b-0 md:border-r md:p-5">
                <div className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
                  {ANALYSIS_MODELS.map((model) => {
                    const isSelected = draftModel === model.id;

                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => setDraftModel(model.id)}
                        className={`flex min-w-max items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-all md:min-w-0 ${
                          isSelected
                            ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                            : "bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <span>{model.shortLabel}</span>
                        {isSelected && <Check className="h-4 w-4" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="max-h-[72vh] overflow-y-auto p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                      {draftModelInfo.label}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={handleApply}
                    className="rounded-2xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-400 active:scale-95"
                  >
                    Appliquer
                  </button>
                </div>

                <p className="mt-5 text-base leading-relaxed text-white/70">
                  {draftModelInfo.description}
                </p>
                

                <div className="mt-6 mb-5 flex min-h-[220px] items-center justify-center overflow-hidden">
                  <img
                    key={draftModelInfo.id}
                    src={draftModelInfo.image}
                    alt={`Méthode graphique ${draftModelInfo.label}`}
                    loading="eager"
                  />
                </div>

              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
