import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ChevronDown,
  MessageSquare,
  Send,
  Users,
  X,
  BriefcaseBusiness,
} from "lucide-react";
import { PageTransition } from "../components/PageTransition";
import { AssetIcon } from "../components/AssetIcon";
import { useFavorites } from "../contexts/FavoritesContext";
import { useAuth } from "../contexts/AuthContext";
import { apiService, type GroupAsset, type GroupMessage } from "../services/api";
import { mockAssets, type AssetType } from "../data/mockAssets";

interface ChatMessage {
  id: string;
  user: string;
  message: string;
  timestamp: Date;
  roomId: string;
}

interface ChatRoom {
  id: string;
  name: string;
  type: "general" | "asset";
  assetId?: string;
}

interface DeskMember {
  id: string;
  label: string;
  role: "owner" | "member";
}

interface Group {
  id: string;
  name: string;
  role: "owner" | "member";
  members: DeskMember[];
}

interface PortfolioAsset {
  id: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  logo: string;
  currentPrice?: number;
}



function inferAssetType(symbol: string): AssetType {
  const normalized = symbol.toUpperCase();

  if (normalized.includes("/")) {
    if (
      normalized.includes("BTC") ||
      normalized.includes("ETH") ||
      normalized.includes("SOL") ||
      normalized.includes("XRP") ||
      normalized.includes("BNB")
    ) {
      return "crypto";
    }

    return "forex";
  }

  if (["SPY", "QQQ", "VTI", "IVV", "VT", "IWM", "DIA", "XLK"].includes(normalized)) {
    return "etf";
  }

  return "stock";
}

function findAssetByFavoriteId(assetId: string): PortfolioAsset {
  const mockAsset = mockAssets.find(
    (asset) => asset.id === assetId || asset.symbol === assetId
  );

  if (mockAsset) {
    return {
      id: mockAsset.id,
      symbol: mockAsset.symbol,
      name: mockAsset.name,
      assetType: mockAsset.assetType,
      logo: mockAsset.logo?.includes("logo.clearbit.com") ? "" : mockAsset.logo,
      currentPrice: mockAsset.currentPrice,
    };
  }

  return {
    id: assetId,
    symbol: assetId,
    name: assetId,
    assetType: inferAssetType(assetId),
    logo: "",
  };
}

function mapGroupAssetToPortfolioAsset(groupAsset: GroupAsset): PortfolioAsset {
  return {
    id: groupAsset.symbol,
    symbol: groupAsset.symbol,
    name: groupAsset.name || groupAsset.symbol,
    assetType: inferAssetType(groupAsset.symbol),
    logo: groupAsset.logo || "",
  };
}

function mapGroupMessageToChatMessage(groupMessage: GroupMessage): ChatMessage {
  return {
    id: groupMessage.id,
    user: groupMessage.user_email || groupMessage.user_id || "Utilisateur",
    message: groupMessage.message,
    timestamp: new Date(groupMessage.created_at),
    roomId: groupMessage.room_id,
  };
}

function getInitials(email: string) {
  if (!email) return "?";
  return email.charAt(0).toUpperCase();
}

function getUserLabel(email: string) {
  if (!email) return "Utilisateur";
  return email.replace(/^Membre\s+/i, "").split("@")[0];
}

function getAvatarColor(email: string) {
  const colors = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-purple-500",
    "bg-pink-500",
    "bg-indigo-500",
    "bg-amber-500",
  ];

  const index = email ? email.charCodeAt(0) % colors.length : 0;
  return colors[index];
}

export function Desk() {
  const { favorites } = useFavorites();
  const { user } = useAuth();

  const userEmail = user?.email || "utilisateur@cbprcapital.com";

  const [groupAssets, setGroupAssets] = useState<GroupAsset[]>([]);
  const [isGroupAssetsLoading, setIsGroupAssetsLoading] = useState(false);
  const [selectedChat, setSelectedChat] = useState("general");
  const [chatMessage, setChatMessage] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [isGroupsLoading, setIsGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [messageError, setMessageError] = useState("");

  const currentGroup = groups.find((group) => group.id === selectedGroup) || groups[0];

  const watchedAssets = useMemo(
    () => favorites.map((assetId) => findAssetByFavoriteId(assetId)),
    [favorites]
  );

  const portfolioAssets = useMemo(
    () => groupAssets.map((asset) => mapGroupAssetToPortfolioAsset(asset)),
    [groupAssets]
  );

  const chatRooms: ChatRoom[] = useMemo(
    () => [
      {
        id: "general",
        name: "Général",
        type: "general",
      },
      ...portfolioAssets.map((asset) => ({
        id: asset.symbol,
        name: asset.symbol,
        type: "asset" as const,
        assetId: asset.symbol,
      })),
    ],
    [portfolioAssets]
  );

  const activeMessages = messages.filter((message) => message.roomId === selectedChat);

  const isCurrentUserGroupOwner = currentGroup?.role === "owner";
  const currentGroupOwner = currentGroup?.members.find((member) => member.role === "owner");

  useEffect(() => {
    const loadGroups = async () => {
      setIsGroupsLoading(true);
      setGroupsError("");

      try {
        const loadedGroups = await apiService.getGroups();

        setGroups(loadedGroups);
        setSelectedGroup(loadedGroups[0]?.id || "");
      } catch (error) {
        console.error("Erreur chargement Desk:", error);
        setGroupsError("Impossible de charger les groupes du Desk.");
      } finally {
        setIsGroupsLoading(false);
      }
    };

    loadGroups();
  }, [userEmail]);

  useEffect(() => {
    let isCancelled = false;

    const loadGroupAssets = async () => {
      if (!currentGroup?.id) {
        setGroupAssets([]);
        return;
      }

      setIsGroupAssetsLoading(true);
      setGroupsError("");

      try {
        const assets = await apiService.getGroupAssets(currentGroup.id);

        if (!isCancelled) {
          setGroupAssets(assets);
        }
      } catch (error) {
        console.error("Erreur chargement portefeuille groupe:", error);
        if (!isCancelled) {
          setGroupAssets([]);
          setGroupsError("Impossible de charger le portefeuille du groupe.");
        }
      } finally {
        if (!isCancelled) {
          setIsGroupAssetsLoading(false);
        }
      }
    };

    loadGroupAssets();

    return () => {
      isCancelled = true;
    };
  }, [currentGroup?.id]);

  useEffect(() => {
    let isCancelled = false;

    const loadMessages = async (showLoader = false) => {
      if (!currentGroup?.id || !selectedChat) {
        setMessages([]);
        return;
      }

      if (showLoader) {
        setIsMessagesLoading(true);
      }

      setMessageError("");

      try {
        const loadedMessages = await apiService.getGroupMessages(currentGroup.id, selectedChat);

        if (!isCancelled) {
          setMessages(loadedMessages.map((message) => mapGroupMessageToChatMessage(message)));
        }
      } catch (error) {
        console.error("Erreur chargement messages Desk:", error);
        if (!isCancelled) {
          setMessageError("Impossible de charger les messages du Desk.");
        }
      } finally {
        if (!isCancelled && showLoader) {
          setIsMessagesLoading(false);
        }
      }
    };

    loadMessages(true);
    const intervalId = window.setInterval(() => loadMessages(false), 4000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [currentGroup?.id, selectedChat]);

  const removeFromPortfolio = async (symbol: string) => {
    if (!currentGroup) return;

    setGroupsError("");

    try {
      await apiService.removeGroupAsset(currentGroup.id, symbol);
      setGroupAssets((previousAssets) =>
        previousAssets.filter((asset) => asset.symbol !== symbol),
      );
    } catch (error) {
      console.error("Erreur suppression actif groupe:", error);
      setGroupsError("Impossible de retirer cet actif du portefeuille du groupe.");
    }
  };

  const removeGroupMember = async (memberId: string) => {
    if (!currentGroup) return;

    const targetMember = currentGroup.members.find((member) => member.id === memberId);

    if (targetMember?.role === "owner") {
      setGroupsError("L'admin ne peut pas être retiré du groupe. Supprimez le groupe si nécessaire.");
      return;
    }

    setGroupsError("");

    try {
      await apiService.removeGroupMember(currentGroup.id, memberId);

      const updatedGroups = groups.map((group) => {
        if (group.id !== currentGroup.id) return group;

        return {
          ...group,
          members: group.members.filter((member) => member.id !== memberId),
        };
      });

      setGroups(updatedGroups);
    } catch (error) {
      console.error("Erreur suppression membre Desk:", error);
      setGroupsError("Impossible de modifier les membres du groupe.");
    }
  };

  const deleteCurrentGroup = async () => {
    if (!currentGroup || !currentGroupOwner || !isCurrentUserGroupOwner) return;

    setGroupsError("");

    try {
      await apiService.removeGroupMember(currentGroup.id, currentGroupOwner.id);

      const updatedGroups = groups.filter((group) => group.id !== currentGroup.id);
      setGroups(updatedGroups);
      setSelectedGroup(updatedGroups[0]?.id || "");
    } catch (error) {
      console.error("Erreur suppression groupe Desk:", error);
      setGroupsError("Impossible de supprimer le groupe pour le moment.");
    }
  };

  const sendMessage = async () => {
    const trimmedMessage = chatMessage.trim();

    if (!trimmedMessage || !currentGroup?.id) return;

    setMessageError("");

    try {
      const sentMessage = await apiService.sendGroupMessage(currentGroup.id, {
        roomId: selectedChat,
        message: trimmedMessage,
      });

      setMessages((previousMessages) => [
        ...previousMessages.filter((message) => message.id !== sentMessage.id),
        mapGroupMessageToChatMessage(sentMessage),
      ]);
      setChatMessage("");
    } catch (error) {
      console.error("Erreur envoi message Desk:", error);
      setMessageError("Impossible d'envoyer le message.");
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <motion.div
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mb-6"
          >

            
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <h1 className="text-3xl font-semibold tracking-tight">Desk</h1>

              <div className="relative w-[250px] flex-shrink-0">
                <select
                  value={selectedGroup}
                  onChange={(event) => setSelectedGroup(event.target.value)}
                  disabled={groups.length === 0 || isGroupsLoading}
                  className="w-full flex items-center gap-2 appearance-none bg-blue-500 rounded-2xl border border-white/5 active:bg-[#1f2937] transition-colors shadow-sm shadow-blue-500/20 py-2 pl-4 pr-9 text-sm font-medium text-white focus:outline-none disabled:opacity-60"
                >
                  {groups.length === 0 ? (
                    <option value="" className="text-white">
                      Aucun groupe
                    </option>
                  ) : (
                    groups.map((group) => (
                      <option key={group.id} value={group.id} className="text-white">
                        {group.name}
                      </option>
                    ))
                  )}
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                  <ChevronDown className="h-4 w-4 text-gray-200" />
                </div>
              </div>
            </div>


          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div
              className="bg-[#1E2939] rounded-3xl p-6 border border-white/10 shadow-sm"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <div className="flex items-center gap-2 mb-4">
                <BriefcaseBusiness className="w-5 h-5 text-blue-300" />
                <h2 className="text-lg font-semibold tracking-tight">
                  Portefeuille du Desk
                </h2>
              </div>

              {isGroupAssetsLoading ? (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-500">
                    Chargement du portefeuille groupe...
                  </p>
                </div>
              ) : portfolioAssets.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-500">
                    Aucun actif dans le portefeuille de ce groupe.
                  </p>
                  <p className="text-xs text-slate-600 mt-2">
                    Ajoute des actifs depuis la page détail d’un actif.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {portfolioAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="bg-white/[0.06] rounded-2xl p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <AssetIcon
                          logo={asset.logo}
                          name={asset.name}
                          assetType={asset.assetType}
                          size="sm"
                        />

                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate">
                            {asset.symbol}
                          </div>
                          <div className="text-sm text-slate-400 truncate">
                            {asset.currentPrice
                              ? `${asset.currentPrice.toFixed(2)} €`
                              : asset.name}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => removeFromPortfolio(asset.symbol)}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                        aria-label="Retirer du portefeuille"
                      >
                        <X className="w-4 h-4 text-slate-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            <motion.div
              className="bg-[#1E2939] rounded-3xl p-6 border border-white/10 shadow-sm"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-300" />
                  <h2 className="text-lg font-semibold tracking-tight">
                    Membres du Desk
                  </h2>
                </div>

                {isCurrentUserGroupOwner && currentGroup && (
                  <button
                    type="button"
                    onClick={deleteCurrentGroup}
                    className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-semibold text-red-300 hover:bg-red-500/15 transition-colors"
                  >
                    Supprimer le groupe
                  </button>
                )}
              </div>

              {isGroupsLoading && (
                <p className="text-sm text-slate-400">Chargement des groupes...</p>
              )}

              {groupsError && (
                <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">
                  {groupsError}
                </div>
              )}

              {!isGroupsLoading && !groupsError && !currentGroup && (
                <div className="rounded-2xl bg-blue-500/10 border border-blue-400/20 p-4">
                  <p className="text-sm text-blue-100">
                    Aucun groupe pour le moment.
                  </p>
                </div>
              )}

              {currentGroup && (
                <>
                  <div className="flex flex-wrap gap-4">
                    {currentGroup.members.map((member, index) => (
                      <motion.div
                        key={member.id}
                        className="relative text-center group"
                        initial={{ scale: 0.85, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.15 + index * 0.06 }}
                      >
                        <div
                          className={`w-16 h-16 rounded-full ${getAvatarColor(
                            member.label
                          )} flex items-center justify-center text-white text-xl font-semibold`}
                        >
                          {getInitials(member.label)}
                        </div>

                        {member.role !== "owner" && (isCurrentUserGroupOwner || member.label === userEmail) && (
                          <button
                            type="button"
                            onClick={() => removeGroupMember(member.id)}
                            className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gray-800 border border-white/20 flex items-center justify-center shadow-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                            aria-label={member.label === userEmail ? "Quitter le groupe" : "Supprimer le membre"}
                            title={member.label === userEmail ? "Quitter le groupe" : "Supprimer le membre"}
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                        )}

                        <div className="text-xs text-slate-400 mt-2 max-w-[110px] truncate">
                          {getUserLabel(member.label)}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>

            <motion.div
              className="bg-[#1E2939] rounded-3xl overflow-hidden border border-white/10 shadow-sm lg:col-span-2"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <div className="grid grid-cols-1 md:grid-cols-12 md:h-[560px]">
                <div className="md:col-span-4 border-b md:border-b-0 md:border-r border-white/10 overflow-y-auto max-h-[220px] md:max-h-none">
                  <div className="p-4 md:p-4 border-b border-white/10">
                    <h3 className="font-semibold text-white">Conversations</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Général + actifs du groupe
                    </p>
                  </div>

                  <div className="p-2">
                    {chatRooms.map((room) => (
                      <button
                        key={room.id}
                        onClick={() => setSelectedChat(room.id)}
                        className={`w-full text-left px-4 py-2.5 md:py-3 rounded-2xl transition-colors mb-1 ${selectedChat === room.id
                          ? "bg-blue-500/15 text-blue-300"
                          : "hover:bg-white/[0.05] text-slate-300"
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          {room.type === "general" ? (
                            <MessageSquare className="w-4 h-4" />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-slate-600" />
                          )}

                          <span className="font-medium truncate">{room.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-8 flex flex-col h-[420px] md:h-auto min-h-0">
                  <div className="p-4 border-b border-white/10">
                    <h3 className="font-semibold text-white">
                      {chatRooms.find((room) => room.id === selectedChat)?.name ||
                        "Chat"}
                    </h3>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                    {isMessagesLoading && (
                      <div className="h-full flex items-center justify-center text-center">
                        <p className="text-sm text-slate-500">
                          Chargement des messages...
                        </p>
                      </div>
                    )}

                    {!isMessagesLoading && messageError && (
                      <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">
                        {messageError}
                      </div>
                    )}

                    {!isMessagesLoading && !messageError && activeMessages.map((message) => (
                      <div key={message.id} className="flex items-start gap-3">
                        <div
                          className={`w-8 h-8 rounded-full ${getAvatarColor(
                            message.user
                          )} flex items-center justify-center text-white text-sm font-semibold flex-shrink-0`}
                        >
                          {getInitials(message.user)}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm text-white">
                              {getUserLabel(message.user)}
                            </span>
                            <span className="text-xs text-slate-500">
                              {message.timestamp.toLocaleTimeString("fr-FR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>

                          <div className="text-sm text-slate-200 bg-white/[0.05] rounded-2xl px-4 py-2">
                            {message.message}
                          </div>
                        </div>
                      </div>
                    ))}

                    {!isMessagesLoading && !messageError && activeMessages.length === 0 && (
                      <div className="h-full flex items-center justify-center text-center">
                        <p className="text-sm text-slate-500">
                          Aucun message dans cette conversation.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="p-4 border-t border-white/10">
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={chatMessage}
                        onChange={(event) => setChatMessage(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            void sendMessage();
                          }
                        }}
                        placeholder="Votre message..."
                        disabled={!currentGroup}
                        className="flex-1 px-4 py-2 bg-white/[0.04] border border-white/10 rounded-2xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />

                      <button
                        onClick={() => void sendMessage()}
                        disabled={!currentGroup || !chatMessage.trim()}
                        className="px-4 md:px-5 py-2 bg-blue-500 text-white rounded-2xl hover:bg-blue-600 transition-colors flex items-center gap-2 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Envoyer le message"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              className="bg-[#1E2939] rounded-3xl p-6 border border-white/10 shadow-sm lg:col-span-2"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between mb-5">
                <div>
                  <h2 className="text-lg font-semibold text-white tracking-tight">
                    Synthèse du Desk
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Vue rapide du groupe actif et de son activité.
                  </p>
                </div>

                <div className="text-sm text-slate-400">
                  {currentGroup?.name || "Aucun groupe sélectionné"}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                  <div className="flex items-center gap-2 text-blue-300 mb-3">
                    <Users className="w-4 h-4" />
                    <span className="font-semibold">Membres</span>
                  </div>
                  <div className="text-2xl font-semibold text-white">
                    {currentGroup?.members.length || 0}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Utilisateurs dans le groupe.
                  </p>
                </div>

                <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                  <div className="flex items-center gap-2 text-emerald-300 mb-3">
                    <BriefcaseBusiness className="w-4 h-4" />
                    <span className="font-semibold">Actifs</span>
                  </div>
                  <div className="text-2xl font-semibold text-white">
                    {portfolioAssets.length}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Actifs suivis par ce Desk.
                  </p>
                </div>

                <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                  <div className="flex items-center gap-2 text-violet-300 mb-3">
                    <MessageSquare className="w-4 h-4" />
                    <span className="font-semibold">Rooms</span>
                  </div>
                  <div className="text-2xl font-semibold text-white">
                    {chatRooms.length}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Général + conversations actifs.
                  </p>
                </div>

                <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                  <div className="flex items-center gap-2 text-amber-300 mb-3">
                    <MessageSquare className="w-4 h-4" />
                    <span className="font-semibold">Messages</span>
                  </div>
                  <div className="text-2xl font-semibold text-white">
                    {activeMessages.length}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Dans la conversation ouverte.
                  </p>
                </div>
              </div>
            </motion.div>

            
          </div>
        </div>
      </div>
    </PageTransition>
  );
}