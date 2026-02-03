"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
// ✅ 共通のFirebase設定を読み込む
import { db, auth } from "../lib/firebase";

// ✅ 必要な機能だけをインポート
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, doc, setDoc, updateDoc, increment, getDoc, Timestamp } from "firebase/firestore";
import PptxGenJS from "pptxgenjs";
import CheckoutButton from "./CheckoutButton";

// ==========================================
// ⚙ SYSTEM CONFIGURATION
// ==========================================
const SYSTEM_CONFIG = {
  APP_NAME: "AI Scenario Planner",
  VERSION: "v.0.1.7",
  COPYRIGHT: "© 2026 GURISAN. All Rights Reserved"
};

// --- 💎 プラン定義と制限設定 ---
const PLAN_LIMITS: any = {
  free: {
    scenarios: 3,
    images: 5,
    audios: 5,
    pptx: false
  },
  pro: {
    scenarios: Infinity, // 無制限
    images: 100,
    audios: 100,
    pptx: true
  }
};

const DEV_UNLIMITED_GLOBAL = process.env.NEXT_PUBLIC_DEV_UNLIMITED === "true";
const DEV_UNLIMITED_EMAILS = (process.env.NEXT_PUBLIC_DEV_UNLIMITED_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const normalizePlan = (plan: any): "free" | "pro" => {
  const raw = String(plan || "free").toLowerCase().trim();
  if (raw === "pro" || raw === "pro plan" || raw === "premium" || raw === "paid") {
    return "pro";
  }
  return "free";
};

// --- ヘルパー関数 ---
const base64ToBlob = (base64: string, mimeType = 'audio/wav') => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
};

const urlToBase64 = async (url: string): Promise<string> => {
  const blob = await fetch(url).then(r => r.blob());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const pcmToWav = (base64Pcm: string, sampleRate = 24000) => {
  const binaryString = atob(base64Pcm);
  const len = binaryString.length;
  const buffer = new ArrayBuffer(len);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < len; i++) {
    view[i] = binaryString.charCodeAt(i);
  }
  const pcmData = new Int16Array(buffer);
  const wavBuffer = new ArrayBuffer(44 + pcmData.length * 2);
  const viewWav = new DataView(wavBuffer);
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  };
  writeString(viewWav, 0, 'RIFF');
  viewWav.setUint32(4, 36 + pcmData.length * 2, true);
  writeString(viewWav, 8, 'WAVE');
  writeString(viewWav, 12, 'fmt ');
  viewWav.setUint32(16, 16, true);
  viewWav.setUint16(20, 1, true);
  viewWav.setUint16(22, 1, true);
  viewWav.setUint32(24, sampleRate, true);
  viewWav.setUint32(28, sampleRate * 2, true);
  viewWav.setUint16(32, 2, true);
  viewWav.setUint16(34, 16, true);
  writeString(viewWav, 36, 'data');
  viewWav.setUint32(40, pcmData.length * 2, true);
  const pcmView = new Int16Array(wavBuffer, 44);
  pcmView.set(pcmData);
  return new Blob([wavBuffer], { type: 'audio/wav' });
};

// --- アイコン ---
const Icons = {
  Brain: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" /><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" /><path d="M15 13a4.5 4.5 0 0 1-3-1.4 4.5 4.5 0 0 1-3 1.4" /><path d="M12 8v10" /></svg>,
  Image: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>,
  Refresh: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6" /><path d="M2.5 22v-6h6" /><path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8" /><path d="M22 12.5a10 10 0 0 1-18.8 4.2L2.5 16" /></svg>,
  Check: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
  Close: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  Speaker: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>,
  Stop: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect></svg>,
  Download: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
  Upload: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
  Save: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>,
  Plus: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>,
  Presentation: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h20v14H2z"></path><path d="M8 21h8"></path><path d="M12 17v4"></path></svg>,
  Lock: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>,
  Loader: () => <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>,
  Help: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  Send: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>,
};

const PROMPTS = {
  IMAGE_GENERATION: (imgPrompt: string) =>
    `A breathtaking cinematic film still from a movie, dramatic lighting, atmospheric, highly detailed, wide angle shot, realistic texture, ar 16:9, 2k resolution. ${imgPrompt}. No text, no words.`
};

const RadarChart = ({ scenarios }: any) => {
  if (!scenarios || !Array.isArray(scenarios)) return null;
  const size = 200, center = size / 2, radius = 80;
  const getPoint = (val: number, i: number, total: number) => {
    const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
    const r = (val / 5) * radius;
    return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
  };
  const labels = ["イノベーション", "マーケティング", "人材・組織", "既存事業", "財務・リスク"];
  const colors: any = { red: 'rgba(239,68,68,0.3)', yellow: 'rgba(234,179,8,0.3)', gray: 'rgba(107,114,128,0.3)', blue: 'rgba(59,130,246,0.3)' };

  return (
    <div className="flex flex-col items-center w-full">
      <div className="relative flex justify-center py-4">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
          {[1, 2, 3, 4, 5].map(r => (
            <polygon key={r} points={labels.map((_, i) => getPoint(r, i, 5)).join(' ')} fill="none" stroke="#e2e8f0" strokeWidth="1" />
          ))}
          {scenarios.map((s: any) => (
            <polygon key={s.id} points={s.allocation.map((a: any, i: number) => getPoint(a.val, i, 5)).join(' ')} fill={colors[s.colorCode]} stroke={colors[s.colorCode].replace('0.3', '1')} strokeWidth="2" />
          ))}
          {labels.map((l, i) => {
            const [x, y] = getPoint(6, i, 5).split(',');
            return <text key={i} x={x} y={y} textAnchor="middle" fontSize="10" className="fill-gray-500 font-bold" dominantBaseline="middle">{l}</text>;
          })}
        </svg>
      </div>

      {/* 凡例 / Legend */}
      <div className="flex flex-col gap-2 mt-2 px-4 mb-4 w-full">
        {scenarios.map((s: any) => (
          <div key={s.id} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${s.colorCode === 'red' ? 'bg-red-500' :
              s.colorCode === 'blue' ? 'bg-blue-500' :
                s.colorCode === 'yellow' ? 'bg-yellow-500' : 'bg-gray-500'
              }`}></div>
            <span className="text-[10px] font-bold text-gray-600">{s.id}: {s.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ScenarioDetails = ({ scenario, onGenerateImage, isImageLoading, playingScenarioId, onSpeak, isAudioLoading, audioUrl }: any) => {
  const isPlaying = playingScenarioId === scenario.id;

  return (
    <div className={`p-6 rounded-xl border-l-4 ${scenario.colorCode === 'red' ? 'border-red-500 bg-red-50/50' :
      scenario.colorCode === 'blue' ? 'border-blue-500 bg-blue-50/50' :
        scenario.colorCode === 'yellow' ? 'border-yellow-400 bg-yellow-50/50' : 'border-gray-500 bg-gray-50/50'
      } mb-6`}>
      <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
        <div className="flex-1">
          <span className="text-xs font-bold uppercase tracking-wider opacity-60">{scenario.id} ({scenario.probability}%)</span>
          <h3 className="text-2xl font-bold text-gray-900 mt-1 mb-2">{scenario.title}</h3>
          <p className="text-sm font-bold text-gray-600 leading-relaxed">{scenario.headline}</p>
        </div>

        {scenario.imageUrl ? (
          <div className="w-full md:w-72 aspect-video rounded-lg overflow-hidden shadow-md shrink-0 border border-gray-200 bg-gray-100 relative group">
            <img src={scenario.imageUrl} alt={scenario.title} className="w-full h-full object-cover hover:scale-105 transition duration-700" />
            <button onClick={() => onGenerateImage(scenario)} disabled={isImageLoading} className="absolute bottom-2 right-2 p-2 bg-white/90 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition hover:text-indigo-600 text-gray-500">
              {isImageLoading ? <Icons.Loader /> : <Icons.Refresh />}
            </button>
          </div>
        ) : (
          <div className="w-full md:w-72 aspect-video rounded-lg border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center text-center">
            <button onClick={() => onGenerateImage(scenario)} disabled={isImageLoading} className={`px-4 py-2 bg-white border border-gray-300 rounded-full text-xs font-bold text-gray-600 hover:text-indigo-600 transition flex items-center gap-2 ${isImageLoading ? "opacity-70 cursor-wait" : ""}`}>
              {isImageLoading ? <><Icons.Loader /> 生成中...</> : <><Icons.Image /> 画像を生成</>}
            </button>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">

        {/* 左側: ビジネスインサイト・アクション・兆候 */}
        <div className="text-sm space-y-3">
          <div className="bg-indigo-50/50 p-3 rounded border border-indigo-100">
            <span className="font-bold text-xs text-indigo-600 block mb-1">💡 BUSINESS INSIGHT</span>
            {scenario.insight?.breakthrough || "インサイト情報が生成されていません。再生成をお試しください。"}
          </div>
          <div>
            <span className="font-bold text-xs text-green-600 block">✅ ACTION</span>
            <p className="text-gray-700">{scenario.actionAdvice || "アクション情報が生成されていません。再生成をお試しください。"}</p>
          </div>
          <div>
            <span className="font-bold text-xs text-orange-600 block">📡 EARLY SIGNS</span>
            <ul className="list-disc list-inside text-gray-600 text-xs pl-1">
              {(scenario.earlySigns && scenario.earlySigns.length > 0) ? scenario.earlySigns.map((s: string, i: number) => <li key={i}>{s}</li>) : <li>予兆情報が生成されていません。</li>}
            </ul>
          </div>
        </div>

        {/* 右側: ストーリー・音声操作 */}
        <div className="text-sm space-y-3">
          <div className="bg-white/60 p-4 rounded-lg relative h-full">
            <div className="flex justify-between items-center mb-2">
              <p className="font-bold text-xs text-gray-500">STORY</p>
              <div className="flex gap-1 items-center">
                {audioUrl && (
                  <>
                    <a href={audioUrl} download={`story_${scenario.id}.wav`} className="p-1.5 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-gray-100 transition" title="ダウンロード"><Icons.Download /></a>
                    <button onClick={() => onSpeak(scenario, true)} disabled={isAudioLoading} className="p-1.5 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-gray-100 transition" title="音声を再生成">
                      {isAudioLoading ? <Icons.Loader /> : <Icons.Refresh />}
                    </button>
                  </>
                )}
                <button onClick={() => onSpeak(scenario, false)} disabled={isAudioLoading && !isPlaying} className={`p-1.5 rounded-full transition ${isPlaying ? 'bg-indigo-100 text-indigo-600' : 'text-gray-400 hover:bg-gray-100'}`} title="読み上げ / 生成">
                  {(isAudioLoading && !audioUrl) ? <Icons.Loader /> : isPlaying ? <Icons.Stop /> : <Icons.Speaker />}
                </button>
              </div>
            </div>
            <p className="leading-relaxed text-gray-800 font-serif whitespace-pre-wrap">{scenario.story}</p>
          </div>
        </div>

      </div>
    </div>
  );
};


export default function Home() {
  const [theme, setTheme] = useState("");
  const [details, setDetails] = useState("");
  const [isCustomAxesMode, setIsCustomAxesMode] = useState(false);
  const [customAxes, setCustomAxes] = useState({ x: { label: '', min: '', max: '' }, y: { label: '', min: '', max: '' } });

  const [result, setResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>({ plan: 'free', usage: { scenarios: 0, images: 0, audios: 0 } });

  const [history, setHistory] = useState<any[]>([]);

  const [audioCache, setAudioCache] = useState<any>({});
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const [playingScenarioId, setPlayingScenarioId] = useState<string | null>(null);

  const [loadingStates, setLoadingStates] = useState<{
    images: Record<string, boolean>;
    audios: Record<string, boolean>;
  }>({ images: {}, audios: {} });

  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);

  // --- Help Dialog States ---
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [helpMessages, setHelpMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([
    { role: 'ai', text: 'お手伝いします。このアプリについて何か知りたいことはありますか？' }
  ]);
  const [helpInput, setHelpInput] = useState("");
  const [isHelpLoading, setIsHelpLoading] = useState(false);
  const helpEndRef = useRef<HTMLDivElement>(null);

  const plan = normalizePlan(userData.plan);
  const devUnlimited = DEV_UNLIMITED_GLOBAL
    || (DEV_UNLIMITED_EMAILS.length > 0
      && !!user?.email
      && DEV_UNLIMITED_EMAILS.includes(user.email.toLowerCase()));

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- ログイン & ユーザーデータ監視 ---
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, "users", u.uid);
        await setDoc(userRef, {
          email: u.email,
          lastLogin: serverTimestamp(),
        }, { merge: true });

        const unsubscribeSnapshot = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserData({
              plan: data.plan || 'free',
              usage: {
                scenarios: data.usage?.scenarios || 0,
                images: data.usage?.images || 0,
                audios: data.usage?.audios || 0,
              }
            });
          }
        });
        return () => unsubscribeSnapshot();
      } else {
        setUserData({ plan: 'free', usage: { scenarios: 0, images: 0, audios: 0 } });
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) { setHistory([]); return; }
    const q = query(collection(db, "scenarios"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { alert("Login Error"); }
  };

  const setImageLoading = (id: string, isLoading: boolean) => {
    setLoadingStates(prev => ({ ...prev, images: { ...prev.images, [id]: isLoading } }));
  };
  const setAudioLoading = (id: string, isLoading: boolean) => {
    setLoadingStates(prev => ({ ...prev, audios: { ...prev.audios, [id]: isLoading } }));
  };

  // --- 制限チェック関数 ---
  const checkLimit = (type: 'scenarios' | 'images' | 'audios' | 'pptx') => {
    if (!user) return false;
    if (devUnlimited) return true;
    const limit = PLAN_LIMITS[plan][type];

    if (typeof limit === 'boolean') {
      if (!limit) {
        alert("🔒 この機能はProプラン限定です。\nアップグレードして利用してください。");
        return false;
      }
      return true;
    }

    const current = userData.usage[type] || 0;
    if (current >= limit) {
      const overMsg = plan === "pro"
        ? "制限解除には上限の引き上げが必要です。必要であればサポートにご連絡ください。"
        : "制限解除にはProプランへのアップグレードが必要です。";
      alert(`⚠️ ${plan.toUpperCase()}プランの上限に達しました。\n(今月: ${current}/${limit}回)\n\n${overMsg}`);
      return false;
    }
    return true;
  };

  const incrementUsage = async (type: 'scenarios' | 'images' | 'audios') => {
    if (!user) return;
    if (devUnlimited) return;
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, {
      [`usage.${type}`]: increment(1)
    });
  };

  const generateScenarios = async () => {
    if (!theme) return;
    if (!checkLimit('scenarios')) return;

    setIsLoading(true);
    setLoadingStates({ images: {}, audios: {} });
    setResult(null);
    setAudioCache({});
    setIsDetailsExpanded(false);
    setCurrentDocId(null);

    try {
      const axesToUse = isCustomAxesMode ? customAxes : null;
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: 'scenario', theme, details, axes: axesToUse }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const parsed = JSON.parse(data.text);
      const scenarios = parsed.scenarios.map((s: any) => {
        let color = 'gray';
        if (s.id.includes('A')) color = 'yellow';
        else if (s.id.includes('B')) color = 'red';
        else if (s.id.includes('C')) color = 'gray';
        else if (s.id.includes('D')) color = 'blue';
        return { ...s, colorCode: color, imageUrl: null, audioUrl: null };
      });

      const finalResult = { ...parsed, scenarios };
      setResult(finalResult);

      if (user) {
        await incrementUsage('scenarios');

        const docRef = await addDoc(collection(db, "scenarios"), {
          userId: user.uid,
          theme,
          context: details,
          result: finalResult,
          createdAt: serverTimestamp(),
          appVersion: SYSTEM_CONFIG.VERSION
        });
        setCurrentDocId(docRef.id);
      }
    } catch (e: any) {
      alert("生成エラー: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateImage = async (scenario: any) => {
    if (!checkLimit('images')) return;

    try {
      setImageLoading(scenario.id, true);
      const basePrompt = scenario.imgPrompt || scenario.story;
      const prompt = PROMPTS.IMAGE_GENERATION(basePrompt);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: 'image', prompt }),
      });

      const data = await res.json();

      if (data.error) {
        if (data.error.includes("429") || data.error.includes("Quota")) {
          throw new Error("⚠️ AIサービスの1日の利用上限に達しました。\n(Google API Limit)\n\nしばらく待つか、明日再度お試しください。");
        } else {
          throw new Error(data.error);
        }
      }

      await incrementUsage('images');

      const imageUrl = `data:image/png;base64,${data.base64}`;
      setResult((prev: any) => ({
        ...prev,
        scenarios: prev.scenarios.map((s: any) => s.id === scenario.id ? { ...s, imageUrl: imageUrl } : s)
      }));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setImageLoading(scenario.id, false);
    }
  };

  const handleSpeak = async (scenario: any, forceRegenerate = false) => {
    if (playingScenarioId === scenario.id) {
      audioRef.current?.pause();
      setPlayingScenarioId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();

    if (!forceRegenerate) {
      const existingUrl = scenario.audioUrl || audioCache[scenario.id];
      if (existingUrl) {
        const audio = new Audio(existingUrl);
        audioRef.current = audio;
        audio.onended = () => setPlayingScenarioId(null);
        audio.play();
        setPlayingScenarioId(scenario.id);
        return;
      }
    }

    if (!checkLimit('audios')) return;

    try {
      setAudioLoading(scenario.id, true);

      const textToSpeak = scenario.audioTone
        ? `${scenario.audioTone.replace(/:$/, '')}, but maintain a moderate and steady speaking pace: ${scenario.story}`
        : `Speak in a clear tone at a moderate and steady speaking pace: ${scenario.story}`;

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: 'speech', text: textToSpeak }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      await incrementUsage('audios');

      const blob = pcmToWav(data.audioData);
      const url = URL.createObjectURL(blob);

      setResult((prev: any) => ({
        ...prev,
        scenarios: prev.scenarios.map((s: any) => s.id === scenario.id ? { ...s, audioUrl: url } : s)
      }));
      setAudioCache((prev: any) => ({ ...prev, [scenario.id]: url }));

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlayingScenarioId(null);
      audio.play();
      setPlayingScenarioId(scenario.id);
    } catch (e: any) {
      alert("音声生成エラー: " + e.message);
    } finally {
      setAudioLoading(scenario.id, false);
    }
  };

  // --- PPTXエクスポート機能 ---
  const handleExportPptx = async () => {
    if (!checkLimit('pptx')) return;
    if (!result) return;
    setIsLoading(true);
    setIsExporting(true);

    try {
      const pres = new PptxGenJS();
      const LAYOUT = {
        W: 10.0, H: 5.625, MARGIN: 0.4,
        COLOR: { MAIN: "1E293B", SUB: "64748B", ACCENT: "4F46E5", BG: "F8FAFC", WHITE: "FFFFFF", AXIS_LINE: "CBD5E1" }
      };
      const JP_FONT = { fontFace: "Meiryo UI" };
      const COPYRIGHT_STYLE = { x: 0, y: 5.4, w: "100%", align: "right", fontSize: 8, color: "94A3B8", margin: 0.2, ...JP_FONT };
      const SCENARIO_STYLES: any = { A: { color: "EAB308", bg: "FEFCE8" }, B: { color: "EF4444", bg: "FEF2F2" }, C: { color: "6B7280", bg: "F9FAFB" }, D: { color: "3B82F6", bg: "EFF6FF" } };

      let summaryDetails = details;
      if (details && details.length > 100) {
        try {
          const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: 'summarize', text: details }), });
          const data = await res.json();
          if (data.summary) summaryDetails = data.summary;
        } catch (e) { console.error("Summary failed", e); }
      }

      // 1. 表紙
      let slide = pres.addSlide();
      slide.background = { color: LAYOUT.COLOR.BG };
      slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.15, fill: { color: LAYOUT.COLOR.ACCENT } });
      slide.addText(SYSTEM_CONFIG.APP_NAME, { x: 0.5, y: 1.5, w: 9, fontSize: 14, color: LAYOUT.COLOR.ACCENT, bold: true, align: "center", charSpacing: 3, ...JP_FONT });
      slide.addText(theme, { x: 0.5, y: 2.0, w: 9, fontSize: 36, color: LAYOUT.COLOR.MAIN, bold: true, align: "center", fontFace: "Meiryo UI", shrinkText: true });
      if (summaryDetails) {
        slide.addShape(pres.ShapeType.rect, { x: 1.5, y: 3.2, w: 7, h: 1.8, fill: { color: LAYOUT.COLOR.WHITE }, line: { color: "E2E8F0", width: 1 }, rectRadius: 0.05, shadow: { type: "outer", color: "000000", opacity: 0.1, blur: 5, offset: 3, angle: 90 } } as any);
        slide.addText("前提条件 / コンテキスト", { x: 1.7, y: 3.4, w: 6.6, fontSize: 10, color: LAYOUT.COLOR.SUB, bold: true, ...JP_FONT });
        slide.addText(summaryDetails, { x: 1.7, y: 3.7, w: 6.6, h: 1.1, fontSize: 11, color: LAYOUT.COLOR.MAIN, align: "left", valign: "top", lineSpacing: 18, shrinkText: true, ...JP_FONT });
      }
      slide.addText(`Generated on ${new Date().toLocaleDateString()} | Ver: ${SYSTEM_CONFIG.VERSION}`, { x: 0.5, y: 5.2, w: 9, fontSize: 9, color: "94A3B8", align: "center" });
      slide.addText(SYSTEM_CONFIG.COPYRIGHT, { ...COPYRIGHT_STYLE, align: "center", y: 5.4 } as any);

      // 2. マトリクス
      slide = pres.addSlide();
      slide.background = { color: LAYOUT.COLOR.BG };
      slide.addText("シナリオマトリクス", { x: 0.4, y: 0.3, fontSize: 20, bold: true, color: LAYOUT.COLOR.MAIN, fontFace: "Meiryo UI" });
      const chartX = 1.2, chartY = 1.0, chartW = 8.2, chartH = 4.0;
      const centerX = chartX + chartW / 2;
      const centerY = chartY + chartH / 2;
      slide.addShape(pres.ShapeType.line, { x: chartX, y: chartY, w: 0, h: chartH, line: { color: LAYOUT.COLOR.AXIS_LINE, width: 3 } });
      slide.addShape(pres.ShapeType.line, { x: chartX, y: chartY + chartH, w: chartW, h: 0, line: { color: LAYOUT.COLOR.AXIS_LINE, width: 3 } });
      slide.addShape(pres.ShapeType.line, { x: centerX, y: chartY, w: 0, h: chartH, line: { color: "E2E8F0", width: 1, dashType: "dash" } });
      slide.addShape(pres.ShapeType.line, { x: chartX, y: centerY, w: chartW, h: 0, line: { color: "E2E8F0", width: 1, dashType: "dash" } });
      const valStyle = { fontSize: 10, color: LAYOUT.COLOR.ACCENT, bold: true, ...JP_FONT };
      slide.addText(result.axisY.label, { x: 0.3, y: chartY, w: 0.6, h: chartH, fontSize: 12, color: LAYOUT.COLOR.MAIN, bold: true, align: "center", valign: "middle", vert: "vert270", ...JP_FONT } as any);
      slide.addText(result.axisY.max, { x: chartX - 2.0, y: chartY - 0.15, w: 1.9, align: "right", ...valStyle });
      slide.addText(result.axisY.min, { x: chartX - 2.0, y: chartY + chartH - 0.15, w: 1.9, align: "right", ...valStyle });
      slide.addText(result.axisX.label, { x: centerX - 2.0, y: chartY + chartH + 0.4, w: 4.0, align: "center", fontSize: 12, color: LAYOUT.COLOR.MAIN, bold: true, ...JP_FONT });
      slide.addText(result.axisX.min, { x: chartX, y: chartY + chartH + 0.1, w: 2.5, align: "left", ...valStyle });
      slide.addText(result.axisX.max, { x: chartX + chartW - 2.5, y: chartY + chartH + 0.1, w: 2.5, align: "right", ...valStyle });

      const cardW = 3.9, cardH = 1.8, cardPaddingX = 0.15, cardPaddingY = 0.15;
      const drawCard = (posId: string, x: number, y: number) => {
        const s = result.scenarios.find((sc: any) => sc.id.includes(posId));
        if (!s) return;
        const style = SCENARIO_STYLES[posId] || SCENARIO_STYLES.C;
        slide.addShape(pres.ShapeType.rect, { x: x, y: y, w: cardW, h: cardH, fill: { color: LAYOUT.COLOR.WHITE }, line: { color: "E2E8F0", width: 1 }, rectRadius: 0.05, shadow: { type: "outer", color: "000000", opacity: 0.1, blur: 5, offset: 3, angle: 90 } } as any);
        slide.addShape(pres.ShapeType.rect, { x: x, y: y, w: cardW, h: 0.08, fill: { color: style.color }, rectRadius: 0.02 } as any);
        slide.addText(`Scenario ${posId}`, { x: x + 0.2, y: y + 0.3, w: 2.0, fontSize: 10, bold: true, color: style.color });
        slide.addText(`${s.probability}%`, { x: x + cardW - 1.2, y: y + 0.3, w: 1.0, align: "right", fontSize: 10, bold: true, color: LAYOUT.COLOR.SUB });
        slide.addText(s.title, { x: x + 0.2, y: y + 0.5, w: cardW - 0.4, h: 0.6, fontSize: 12, bold: true, color: LAYOUT.COLOR.MAIN, valign: "top", shrinkText: true, ...JP_FONT });
        slide.addText(s.headline, { x: x + 0.2, y: y + 1.0, w: cardW - 0.4, h: 0.7, fontSize: 9, color: LAYOUT.COLOR.SUB, valign: "top", shrinkText: true, ...JP_FONT });
      };
      drawCard("A", centerX - cardW - cardPaddingX, centerY - cardH - cardPaddingY);
      drawCard("B", centerX + cardPaddingX, centerY - cardH - cardPaddingY);
      drawCard("C", centerX - cardW - cardPaddingX, centerY + cardPaddingY);
      drawCard("D", centerX + cardPaddingX, centerY + cardPaddingY);
      slide.addText(SYSTEM_CONFIG.COPYRIGHT, { ...COPYRIGHT_STYLE } as any);

      // 3. 戦略ポートフォリオ比較 (Combined Radar & Analysis)
      let pPortfolio = pres.addSlide();
      pPortfolio.background = { color: LAYOUT.COLOR.BG };
      pPortfolio.addText("戦略ポートフォリオ比較", { x: 0.4, y: 0.3, fontSize: 20, bold: true, color: LAYOUT.COLOR.MAIN, fontFace: "Meiryo UI" });

      // Combined Radar Chart
      const combinedChartData = result.scenarios.map((s: any) => ({
        name: s.id,
        labels: ["イノベーション", "マーケティング", "人材・組織", "既存事業", "財務・リスク"],
        values: s.allocation.map((a: any) => a.val)
      }));
      // Assign custom colors based on scenario ID
      const radarColors = result.scenarios.map((s: any) =>
        s.colorCode === 'red' ? "EF4444" :
          s.colorCode === 'blue' ? "3B82F6" :
            s.colorCode === 'yellow' ? "EAB308" : "6B7280"
      );

      pPortfolio.addChart(pres.ChartType.radar, combinedChartData, {
        x: 0.5, y: 1.2, w: 4.5, h: 4.0,
        radarStyle: "marker",
        chartColors: radarColors,
        chartColorsOpacity: 25,
        catAxisLabelFontSize: 8,
        catAxisLabelColor: "64748B",
        catAxisLabelFontFace: "Meiryo UI",
        legend: { x: 0.5, y: 5.2, fontSize: 8, color: "475569" }
      } as any);

      // Portfolio Analysis Text
      pPortfolio.addShape(pres.ShapeType.rect, { x: 5.2, y: 1.2, w: 4.4, h: 3.8, fill: { color: LAYOUT.COLOR.WHITE }, rectRadius: 0.05, shadow: { type: "outer", opacity: 0.05, blur: 3, offset: 2, angle: 90 } } as any);
      pPortfolio.addText("📊 戦略ポートフォリオ分析", { x: 5.4, y: 1.4, fontSize: 11, bold: true, color: LAYOUT.COLOR.MAIN, fontFace: "Meiryo UI" });
      pPortfolio.addText(result.portfolioAnalysis || "No analysis data.", { x: 5.4, y: 1.8, w: 4.0, h: 3.0, fontSize: 10, color: "374151", align: "justify", valign: "top", lineSpacing: 16, shrinkText: true, ...JP_FONT });

      pPortfolio.addText(SYSTEM_CONFIG.COPYRIGHT, { ...COPYRIGHT_STYLE } as any);

      // 3. 各シナリオ詳細
      for (const s of result.scenarios) {
        let sid = s.id.includes("A") ? "A" : s.id.includes("B") ? "B" : s.id.includes("D") ? "D" : "C";
        const style = SCENARIO_STYLES[sid];
        const p1 = pres.addSlide();
        p1.background = { color: LAYOUT.COLOR.BG };
        p1.addShape(pres.ShapeType.rect, { x: 0.5, y: 0.3, w: 9.0, h: 0.8, fill: { color: LAYOUT.COLOR.WHITE }, rectRadius: 0.05, shadow: { type: "outer", opacity: 0.05, blur: 3, offset: 2, angle: 90 } } as any);
        p1.addShape(pres.ShapeType.rect, { x: 0.5, y: 0.3, w: 0.15, h: 0.8, fill: { color: style.color } });
        p1.addText(`${s.id}: ${s.title}`, { x: 0.8, y: 0.3, w: 7.0, h: 0.8, fontSize: 20, bold: true, color: LAYOUT.COLOR.MAIN, fontFace: "Meiryo UI", valign: "middle" });
        p1.addText(`確率: ${s.probability}%`, { x: 8.0, y: 0.3, w: 1.3, h: 0.8, fontSize: 12, align: "center", color: style.color, bold: true, valign: "middle", ...JP_FONT });
        p1.addShape(pres.ShapeType.rect, { x: 0.5, y: 1.3, w: 9.0, h: 4.0, fill: { color: LAYOUT.COLOR.WHITE }, rectRadius: 0.05, shadow: { type: "outer", opacity: 0.05, blur: 3, offset: 2, angle: 90 } } as any);
        if (s.imageUrl && s.imageUrl.startsWith("data:image")) { p1.addImage({ data: s.imageUrl, x: 0.8, y: 1.6, w: 2.8, h: 1.58 }); }
        p1.addText(s.headline, { x: 3.8, y: 1.6, w: 5.4, h: 1.5, fontSize: 16, bold: true, color: LAYOUT.COLOR.MAIN, valign: "top", shrinkText: true, ...JP_FONT });
        p1.addText("STORY", { x: 0.8, y: 3.3, fontSize: 10, bold: true, color: "94A3B8" });
        p1.addText(s.story, { x: 0.8, y: 3.5, w: 8.4, h: 1.6, fontSize: 9, color: "374151", align: "justify", valign: "top", shrinkText: false, lineSpacing: 14, ...JP_FONT });
        if (s.audioUrl) {
          try {
            const audioB64 = await urlToBase64(s.audioUrl);
            p1.addMedia({ data: `data:audio/wav;base64,${audioB64}`, x: 3.7, y: 2.7, w: 0.5, h: 0.5, type: "audio" });
          } catch (e) {
            console.error("Audio embed failed", e);
          }
        }
        p1.addText(SYSTEM_CONFIG.COPYRIGHT, { ...COPYRIGHT_STYLE } as any);

        const p2 = pres.addSlide();
        p2.background = { color: LAYOUT.COLOR.BG };
        p2.addShape(pres.ShapeType.rect, { x: 0.5, y: 0.3, w: 9.0, h: 0.5, fill: { color: LAYOUT.COLOR.WHITE }, rectRadius: 0.05 } as any);
        p2.addText(`${s.id} - Strategy & Analysis`, { x: 0.7, y: 0.3, h: 0.5, fontSize: 12, bold: true, color: LAYOUT.COLOR.SUB, valign: "middle" });
        p2.addShape(pres.ShapeType.rect, { x: 0.5, y: 1.0, w: 3.5, h: 4.2, fill: { color: LAYOUT.COLOR.WHITE }, rectRadius: 0.05, shadow: { type: "outer", opacity: 0.05, blur: 3, offset: 2, angle: 90 } } as any);
        const chartData = [{ name: s.title, labels: ["イノベーション", "マーケティング", "人材・組織", "既存事業", "財務・リスク"], values: s.allocation.map((a: any) => a.val) }];
        p2.addChart(pres.ChartType.radar, chartData, { x: 0.6, y: 1.5, w: 3.3, h: 3.3, radarStyle: "marker", chartColors: [style.color], chartColorsOpacity: 40, valAxisHidden: true, legend: { show: false }, catAxisLabelFontSize: 9, catAxisLabelColor: "64748B", catAxisLabelFontFace: "Meiryo UI" } as any);

        const layoutY = { insight: 1.1, action: 2.6, signs: 4.1 };
        const contentX = 4.4;
        const colW = 5.2;

        // BUSINESS INSIGHT
        p2.addText("BUSINESS INSIGHT", { x: contentX, y: layoutY.insight, fontSize: 10, bold: true, color: LAYOUT.COLOR.ACCENT });
        p2.addText(s.insight.breakthrough, { x: contentX, y: layoutY.insight + 0.25, w: colW, h: 1.1, fontSize: 10, color: "1F2937", valign: "top", shrinkText: true, ...JP_FONT });

        // ACTION
        p2.addText("ACTION", { x: contentX, y: layoutY.action, fontSize: 10, bold: true, color: LAYOUT.COLOR.ACCENT });
        p2.addText(s.actionAdvice, { x: contentX, y: layoutY.action + 0.25, w: colW, h: 1.1, fontSize: 10, color: "1F2937", valign: "top", shrinkText: true, ...JP_FONT });

        // EARLY SIGNS
        p2.addText("EARLY SIGNS (予兆)", { x: contentX, y: layoutY.signs, fontSize: 10, bold: true, color: LAYOUT.COLOR.ACCENT });
        const signsText = s.earlySigns.map((sign: string) => `• ${sign}`).join("\n");
        p2.addText(signsText, { x: contentX, y: layoutY.signs + 0.25, w: colW, h: 1.0, fontSize: 10, color: "4B5563", valign: "top", shrinkText: true, lineSpacing: 14, ...JP_FONT });

        p2.addText(SYSTEM_CONFIG.COPYRIGHT, { ...COPYRIGHT_STYLE } as any);
      }
      pres.writeFile({ fileName: `${theme.replace(/\s+/g, '_')}_ScenarioReport.pptx` });
    } catch (e) { alert("PPTX生成失敗"); } finally { setIsExporting(false); setIsLoading(false); }
  };

  const handleSaveProject = async () => {
    if (!result) return;
    try {
      const scenariosToSave = await Promise.all(result.scenarios.map(async (s: any) => {
        let imageBase64 = null; let audioBase64 = null;
        if (s.imageUrl) imageBase64 = s.imageUrl.startsWith('data:') ? s.imageUrl.split(',')[1] : await urlToBase64(s.imageUrl);
        if (s.audioUrl) audioBase64 = await urlToBase64(s.audioUrl);
        return { ...s, savedImage: imageBase64, savedAudio: audioBase64 };
      }));
      const saveData = { meta: { appVersion: SYSTEM_CONFIG.VERSION, copyright: SYSTEM_CONFIG.COPYRIGHT, savedAt: new Date().toISOString() }, theme, details, result: { ...result, scenarios: scenariosToSave }, customAxes: customAxes };
      const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: "application/json" });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${theme.replace(/\s+/g, '_')}_project.json`;
      link.click();
    } catch (e) { alert("保存に失敗しました"); }
  };

  const handleExportHtml = async () => {
    if (!result) return;
    try {
      const scenarios = await Promise.all(result.scenarios.map(async (s: any) => {
        const imageData = s.imageUrl
          ? (s.imageUrl.startsWith("data:") ? s.imageUrl : `data:image/png;base64,${await urlToBase64(s.imageUrl)}`)
          : null;
        const audioData = s.audioUrl
          ? (s.audioUrl.startsWith("data:") ? s.audioUrl : `data:audio/wav;base64,${await urlToBase64(s.audioUrl)}`)
          : null;
        return { ...s, imageData, audioData };
      }));

      const axisX = result.axisX || { label: "", min: "", max: "" };
      const axisY = result.axisY || { label: "", min: "", max: "" };
      const labels = ["イノベーション", "マーケティング", "人材・組織", "既存事業", "財務・リスク"];
      const colorMap: Record<string, string> = {
        red: "#ef4444",
        blue: "#3b82f6",
        yellow: "#eab308",
        gray: "#6b7280",
      };

      const chartSize = 200;
      const chartCenter = chartSize / 2;
      const chartRadius = 80;
      const getPoint = (val: number, i: number, total: number) => {
        const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
        const r = (val / 5) * chartRadius;
        return `${chartCenter + r * Math.cos(angle)},${chartCenter + r * Math.sin(angle)}`;
      };
      const getLabelPoint = (i: number, total: number) => {
        const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
        const r = chartRadius + 22;
        return `${chartCenter + r * Math.cos(angle)},${chartCenter + r * Math.sin(angle)}`;
      };
      const radarRings = [1, 2, 3, 4, 5].map((r) => {
        const pts = labels.map((_, i) => getPoint(r, i, labels.length)).join(" ");
        return `<polygon points="${pts}" fill="none" stroke="#e2e8f0" stroke-width="1" />`;
      }).join("");
      const radarPolygons = scenarios.map((s: any) => {
        const pts = (s.allocation || []).map((a: any, i: number) => getPoint(a.val || 0, i, labels.length)).join(" ");
        const color = colorMap[s.colorCode] || colorMap.gray;
        return `<polygon points="${pts}" fill="${color}4D" stroke="${color}" stroke-width="2" />`;
      }).join("");
      const radarLabels = labels.map((l, i) => {
        const [x, y] = getLabelPoint(i, labels.length).split(",");
        return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#6b7280" font-weight="700">${escapeHtml(l)}</text>`;
      }).join("");
      const radarLegend = scenarios.map((s: any) => {
        const color = colorMap[s.colorCode] || colorMap.gray;
        return `<div class="legend-row">
          <span class="legend-dot" style="background:${color};"></span>
          <span class="legend-text">${escapeHtml(s.id)}: ${escapeHtml(s.title || "")}</span>
        </div>`;
      }).join("");

      const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(theme)} - AI Scenario Planner</title>
  <style>
    :root {
      --bg: #f0f4f8;
      --card: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --accent: #4f46e5;
      --accent-2: #7c3aed;
      --border: #e2e8f0;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Segoe UI", sans-serif;
      background: radial-gradient(#cbd5e1 1px, transparent 1px), var(--bg);
      background-size: 24px 24px;
      color: var(--text);
    }
    .wrap { max-width: 1040px; margin: 0 auto; padding: 28px 18px 80px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 20px; padding: 24px; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08); }
    .title { font-size: 32px; font-weight: 800; text-align: center; color: #5b4bff; }
    .version { margin-top: 6px; text-align: center; font-size: 11px; font-weight: 700; color: #64748b; }
    .version-badge { display: inline-block; margin-left: 6px; background: #eef2ff; color: #4f46e5; padding: 2px 6px; border-radius: 999px; font-size: 10px; }
    .desc { margin: 12px auto 0; max-width: 820px; font-size: 12px; line-height: 1.8; color: #64748b; text-align: center; white-space: pre-wrap; }
    .desc-collapsed { max-height: 72px; overflow: hidden; position: relative; }
    .desc-fade { position: absolute; left: 0; right: 0; bottom: 0; height: 24px; background: linear-gradient(180deg, rgba(255,255,255,0), #ffffff); }
    .desc-toggle { margin: 8px auto 0; display: block; background: none; border: none; color: #4f46e5; font-size: 12px; font-weight: 700; cursor: pointer; }
    .section-pill { display: inline-flex; padding: 8px 22px; border-radius: 999px; background: linear-gradient(90deg, #4f46e5, #7c3aed); box-shadow: 0 8px 20px rgba(79, 70, 229, 0.25); font-weight: 700; color: #fff; font-size: 13px; }
    .section-title { display: flex; justify-content: center; margin: 12px 0 14px; }
    .matrix-wrap { margin-top: 18px; }
    .matrix { display: grid; grid-template-columns: 70px 1fr; gap: 12px; }
    .matrix-core { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 12px; min-height: 380px; }
    .axis { color: var(--muted); font-size: 12px; font-weight: 700; }
    .axis-pill { background: #fff; border: 1px solid #dfe3ff; border-radius: 999px; padding: 6px 10px; color: #4f46e5; font-weight: 700; font-size: 11px; position: relative; z-index: 2; }
    .axis-line { background: #dfe3ff; position: relative; z-index: 1; }
    .scenario-card { border: 1px solid var(--border); border-radius: 12px; padding: 14px; background: #fff; position: relative; box-shadow: 0 4px 10px rgba(15,23,42,0.04); }
    .scenario-prob { position: absolute; top: 0; right: 0; color: #fff; font-weight: 700; font-size: 11px; padding: 6px 12px; border-bottom-left-radius: 10px; }
    .scenario-id { font-size: 10px; font-weight: 700; color: #9ca3af; margin-bottom: 6px; display: block; }
    .headline { font-size: 12px; color: var(--muted); margin-top: 6px; }
    .detail { font-size: 13px; line-height: 1.7; white-space: pre-wrap; }
    .grid { display: grid; gap: 16px; }
    .grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .panel { background: #fff; border: 1px solid var(--border); border-radius: 20px; padding: 24px; box-shadow: 0 6px 20px rgba(15, 23, 42, 0.08); }
    .radar-wrap { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .radar-svg { overflow: visible; }
    .legend { width: 100%; display: grid; gap: 6px; margin-top: 6px; }
    .legend-row { display: flex; align-items: center; gap: 8px; }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
    .legend-text { font-size: 10px; font-weight: 700; color: #4b5563; }
    .analysis-box { position: relative; background: #fff; border: 1px solid var(--border); border-radius: 16px; padding: 16px 16px 16px 20px; min-height: 100%; }
    .analysis-bar { position: absolute; left: 0; top: 0; width: 4px; height: 100%; background: linear-gradient(180deg, #6366f1, #9333ea); border-radius: 20px 0 0 20px; }
    .analysis-title { font-size: 12px; font-weight: 800; color: #1f2937; display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
    .detail-header { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 20px; color: #1f2937; margin: 18px 0 12px; }
    .scenario-detail { border-left: 4px solid #e5e7eb; border-radius: 18px; padding: 24px; background: rgba(255,255,255,0.9); }
    .scenario-detail-title { font-size: 22px; font-weight: 800; margin: 6px 0 10px; }
    .story-box { background: #fff; border-radius: 12px; padding: 16px; border: 1px solid #e5e7eb; }
    .audio-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #e5e7eb; background: #f8fafc; padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; color: #0f172a; cursor: pointer; }
    .audio-btn[data-state="playing"] { background: #e0e7ff; border-color: #c7d2fe; color: #4338ca; }
    .story { font-family: "Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", serif; }
    .pill-blue { background: #eef2ff; border: 1px solid #dfe3ff; border-radius: 10px; padding: 10px; }
    .section-tag { font-weight: 800; font-size: 12px; margin-bottom: 6px; }
    footer { color: var(--muted); font-size: 12px; margin-top: 40px; text-align: center; }
    @media (max-width: 820px) {
      .grid-2 { grid-template-columns: 1fr; }
      .matrix { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="title">${escapeHtml(theme)}</div>
      <div class="version">${escapeHtml(SYSTEM_CONFIG.APP_NAME)} <span class="version-badge">${escapeHtml(SYSTEM_CONFIG.VERSION)}</span></div>
      <div class="desc desc-collapsed" id="details">
        ${escapeHtml(details || "")}
        <div class="desc-fade" id="detailsFade"></div>
      </div>
      <button class="desc-toggle" id="detailsToggle">▼ 全文を表示</button>
    </div>

    <div class="matrix-wrap card" style="margin-top:20px;">
      <div class="section-title"><span class="section-pill">シナリオマトリクス</span></div>
      <div class="matrix">
        <div class="axis" style="display:flex; flex-direction:column; justify-content:space-between; padding: 8px 0;">
          <div>${escapeHtml(axisY.max || "")}</div>
          <div style="display:flex; align-items:center; justify-content:center; flex:1; position:relative; margin: 8px 0;">
            <div class="axis-line" style="position:absolute; width:2px; height:100%; left:50%; transform:translateX(-50%); z-index:1;"></div>
            <div class="axis-pill" style="writing-mode: vertical-rl;">${escapeHtml(axisY.label || "")}</div>
          </div>
          <div>${escapeHtml(axisY.min || "")}</div>
        </div>
        <div>
          <div class="matrix-core">
            ${scenarios.map((s: any) => {
              const color = colorMap[s.colorCode] || colorMap.gray;
              return `
              <div class="scenario-card" style="border-color:${color}33;">
                <div class="scenario-prob" style="background:${color};">${escapeHtml(String(s.probability || ""))}%</div>
                <span class="scenario-id">${escapeHtml(s.id)}</span>
                <div style="font-weight:800; font-size:14px;">${escapeHtml(s.title || "")}</div>
                <div class="headline">${escapeHtml(s.headline || "")}</div>
              </div>
            `; }).join("")}
          </div>
          <div style="display:flex; align-items:center; gap:8px; margin-top:12px;">
            <div class="axis">${escapeHtml(axisX.min || "")}</div>
            <div style="flex:1; display:flex; align-items:center; justify-content:center; position:relative;">
              <div class="axis-line" style="position:absolute; width:100%; height:2px; z-index:1;"></div>
              <div class="axis-pill">${escapeHtml(axisX.label || "")}</div>
            </div>
            <div class="axis" style="text-align:right;">${escapeHtml(axisX.max || "")}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="panel grid grid-2" style="gap:24px; margin-top:20px;">
      <div class="radar-wrap">
        <div style="font-weight:700; color:#374151; margin-bottom:8px;">戦略ポートフォリオ比較</div>
        <svg class="radar-svg" width="${chartSize}" height="${chartSize}" viewBox="0 0 ${chartSize} ${chartSize}">
          ${radarRings}
          ${radarPolygons}
          ${radarLabels}
        </svg>
        <div class="legend">${radarLegend}</div>
      </div>
      <div class="analysis-box">
        <div class="analysis-bar"></div>
        <div class="analysis-title">📊 戦略ポートフォリオ分析</div>
        <div class="detail">${escapeHtml(result.portfolioAnalysis || "分析データがありません。")}</div>
      </div>
    </div>

    <div class="detail-header">✓ Detailed Scenarios</div>
    <div class="grid">
      ${scenarios.map((s: any) => {
        const color = colorMap[s.colorCode] || colorMap.gray;
        return `
        <div class="scenario-detail" style="border-left-color:${color}; background:${color}0D;">
          <div style="display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap;">
            <div style="flex:1; min-width: 240px;">
              <div class="meta" style="text-transform:uppercase; font-weight:700; opacity:0.7;">${escapeHtml(s.id)} (${escapeHtml(String(s.probability || ""))}%)</div>
              <div class="scenario-detail-title">${escapeHtml(s.title || "")}</div>
              <div class="headline" style="font-weight:700;">${escapeHtml(s.headline || "")}</div>
            </div>
            <div style="width: 300px;">
              ${s.imageData ? `<img src="${s.imageData}" alt="${escapeHtml(s.title || "")}" style="width:100%; border-radius:12px; border:1px solid #e5e7eb;" />` : ""}
            </div>
          </div>

          <div class="grid grid-2" style="gap: 16px; margin-top: 16px;">
            <div>
              <div class="pill-blue">
                <div class="section-tag" style="color:#4f46e5;">💡 BUSINESS INSIGHT</div>
                <div class="detail">${escapeHtml(s.insight?.breakthrough || "")}</div>
              </div>
              <div style="margin-top:12px;">
                <div class="section-tag" style="color:#16a34a;">✅ ACTION</div>
                <div class="detail">${escapeHtml(s.actionAdvice || "")}</div>
              </div>
              <div style="margin-top:12px;">
                <div class="section-tag" style="color:#f97316;">📡 EARLY SIGNS</div>
                <div class="detail">${escapeHtml((s.earlySigns || []).map((sign: string) => `• ${sign}`).join("\n"))}</div>
              </div>
            </div>
            <div class="story-box">
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                <div class="meta" style="font-weight:700;">STORY</div>
                ${s.audioData ? `<button class="audio-btn" data-audio-id="audio-${escapeHtml(s.id)}" data-state="paused">▶ 再生</button>` : ""}
              </div>
              <div class="detail story">${escapeHtml(s.story || "")}</div>
              ${s.audioData ? `<audio id="audio-${escapeHtml(s.id)}" src="${s.audioData}" preload="auto"></audio>` : ""}
            </div>
          </div>
        </div>
      `; }).join("")}
    </div>

    <footer>${escapeHtml(SYSTEM_CONFIG.COPYRIGHT)}</footer>
  </div>
</body>
<script>
  const buttons = document.querySelectorAll(".audio-btn");
  buttons.forEach((btn) => {
    const audioId = btn.getAttribute("data-audio-id");
    const audio = audioId ? document.getElementById(audioId) : null;
    if (!audio) return;
    btn.addEventListener("click", () => {
      if (audio.paused) {
        document.querySelectorAll("audio").forEach((a) => { if (a !== audio) { a.pause(); } });
        document.querySelectorAll(".audio-btn").forEach((b) => { if (b !== btn) { b.textContent = "▶ 再生"; b.setAttribute("data-state", "paused"); } });
        audio.play();
        btn.textContent = "■ 停止";
        btn.setAttribute("data-state", "playing");
      } else {
        audio.pause();
        btn.textContent = "▶ 再生";
        btn.setAttribute("data-state", "paused");
      }
    });
    audio.addEventListener("ended", () => {
      btn.textContent = "▶ 再生";
      btn.setAttribute("data-state", "paused");
    });
  });
</script>
<script>
  (function () {
    const details = document.getElementById("details");
    const toggle = document.getElementById("detailsToggle");
    const fade = document.getElementById("detailsFade");
    if (!details || !toggle) return;
    let expanded = false;
    toggle.addEventListener("click", () => {
      expanded = !expanded;
      if (expanded) {
        details.classList.remove("desc-collapsed");
        if (fade) fade.style.display = "none";
        toggle.textContent = "▲ 閉じる";
      } else {
        details.classList.add("desc-collapsed");
        if (fade) fade.style.display = "block";
        toggle.textContent = "▼ 全文を表示";
      }
    });
  })();
</script>
</html>`;

      const blob = new Blob([html], { type: "text/html" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${theme.replace(/\s+/g, "_")}_view.html`;
      link.click();
    } catch (e) {
      alert("HTML書き出しに失敗しました");
    }
  };

  const handleLoadProject = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event: any) => {
      try {
        const data = JSON.parse(event.target.result);
        setTheme(data.theme); setDetails(data.details);
        if (data.customAxes) { setCustomAxes(data.customAxes); setIsCustomAxesMode(true); }
        const restoredScenarios = data.result.scenarios.map((s: any) => ({
          ...s,
          imageUrl: s.savedImage ? `data:image/png;base64,${s.savedImage}` : null,
          audioUrl: s.savedAudio ? URL.createObjectURL(base64ToBlob(s.savedAudio, 'audio/wav')) : null
        }));
        setResult({ ...data.result, scenarios: restoredScenarios });
        setAudioCache({}); setIsDetailsExpanded(false);
      } catch (err) { alert("読込失敗"); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const loadHistory = (item: any) => {
    setTheme(item.theme); setDetails(item.context);
    if (item.result?.axisX && item.result?.axisY) { setCustomAxes({ x: { label: item.result.axisX.label || "", min: item.result.axisX.min || "", max: item.result.axisX.max || "" }, y: { label: item.result.axisY.label || "", min: item.result.axisY.min || "", max: item.result.axisY.max || "" } }); setIsCustomAxesMode(true); }
    setResult(item.result); setAudioCache({}); setIsDetailsExpanded(false); setCurrentDocId(item.id); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleHelpSend = async () => {
    if (!helpInput.trim() || isHelpLoading) return;
    const userText = helpInput;
    setHelpInput("");
    setHelpMessages(prev => [...prev, { role: 'user', text: userText }]);
    setIsHelpLoading(true);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: 'help', text: userText, history: helpMessages }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setHelpMessages(prev => [...prev, { role: 'ai', text: data.text }]);
    } catch (e: any) {
      setHelpMessages(prev => [...prev, { role: 'ai', text: "すみません、エラーが発生しました。" }]);
    } finally {
      setIsHelpLoading(false);
    }
  };

  useEffect(() => {
    helpEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [helpMessages, isHelpOpen]);

  return (
    <div className="min-h-screen pb-12 font-sans selection:bg-indigo-100 selection:text-indigo-800 text-gray-800 bg-[#f0f4f8]" style={{ backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)", backgroundSize: "24px 24px" }}>

      <input type="file" ref={fileInputRef} onChange={handleLoadProject} className="hidden" accept=".json" />

      {/* Header */}
      <header className="fixed top-0 w-full z-40 bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-16 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧭</span>
            <h1 className="font-bold text-xl tracking-tight text-gray-800">
              {SYSTEM_CONFIG.APP_NAME} <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full font-normal">{SYSTEM_CONFIG.VERSION}</span>
            </h1>
          </div>
          <div className="flex items-center gap-3 text-gray-400">
            <button
              onClick={() => setIsHelpOpen(true)}
              className="flex items-center gap-1 text-[10px] sm:text-xs font-bold text-indigo-500 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 sm:px-3 sm:py-2 rounded-lg transition border border-indigo-200"
              title="ヘルプを表示"
            >
              <Icons.Help /> HELP
            </button>
            <div className="h-4 w-px bg-gray-200"></div>
            {result && (
              <>
                <button onClick={() => {
                  if (result?.axisX && result?.axisY) {
                    setCustomAxes({
                      x: { label: result.axisX.label || '', min: result.axisX.min || '', max: result.axisX.max || '' },
                      y: { label: result.axisY.label || '', min: result.axisY.min || '', max: result.axisY.max || '' }
                    });
                    setIsCustomAxesMode(true);
                  }
                  setResult(null);
                }} className="flex items-center gap-1 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg transition" title="新しい分析を始める">
                  <Icons.Plus /> 新規
                </button>

                {plan === 'pro' ? (
                  <button onClick={handleExportPptx} className="flex items-center gap-1 text-xs font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 px-3 py-2 rounded-lg transition" title="PowerPointで書き出し">
                    <Icons.Presentation /> PPTX
                  </button>
                ) : (
                  <button onClick={() => alert("🔒 Proプラン限定機能です。")} className="flex items-center gap-1 text-xs font-bold text-gray-400 bg-gray-100 px-3 py-2 rounded-lg cursor-not-allowed" title="Proプランで利用可能">
                    <Icons.Lock /> PPTX
                  </button>
                )}
              </>
            )}

            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg transition" title="ファイルを開く">
              <Icons.Upload /> 読込
            </button>
            <button onClick={handleSaveProject} disabled={!result} className={`flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-lg transition ${!result ? 'opacity-50 cursor-not-allowed' : ''}`} title="プロジェクトを保存">
              <Icons.Save /> 保存
            </button>
            <button onClick={handleExportHtml} disabled={!result} className={`flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-2 rounded-lg transition ${!result ? 'opacity-50 cursor-not-allowed' : ''}`} title="閲覧用HTMLを書き出し">
              <Icons.Download /> HTML
            </button>

            <div className="h-6 w-px bg-gray-300 mx-1"></div>

            {user ? (
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <div className={`text-xs font-bold ${plan === 'pro' ? 'text-indigo-600' : 'text-gray-500'}`}>
                    {plan === 'pro' ? 'Pro Plan' : 'Free Plan'}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    残り: {devUnlimited || (plan === 'pro' && PLAN_LIMITS.pro.scenarios === Infinity) ? '∞' : (PLAN_LIMITS[plan].scenarios - userData.usage.scenarios)}回
                  </div>
                  <div className="text-[10px] text-gray-400">
                    画像: {devUnlimited ? '∞' : (PLAN_LIMITS[plan].images - userData.usage.images)}回 / 音声: {devUnlimited ? '∞' : (PLAN_LIMITS[plan].audios - userData.usage.audios)}回
                  </div>
                </div>

                {/* 🚀 アップグレードボタンを追加 (Free Planの場合のみ) */}
                {plan !== 'pro' && (
                  <div className="scale-75 origin-right">
                    <CheckoutButton />
                  </div>
                )}

                <img src={user.photoURL || ""} className="w-8 h-8 rounded-full border border-gray-300" alt="user" />
                <button onClick={() => auth.signOut()} className="text-xs text-gray-500 hover:text-red-500">Logout</button>
              </div>
            ) : (
              <button onClick={handleLogin} className="text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-lg hover:bg-indigo-100 transition">Google Login</button>
            )}
          </div>
        </div>
      </header>

      {(isLoading || isExporting) && (
        <div className="fixed inset-0 bg-white/90 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
          <h2 className="text-xl font-bold text-gray-800 animate-pulse">{isExporting ? "Exporting..." : "Thinking..."}</h2>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 pt-24">
        {!result ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="max-w-2xl w-full text-center space-y-8">
              <h2 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">Future Scenarios</h2>
              <div className="bg-white/80 backdrop-blur-md p-8 rounded-2xl shadow-xl text-left space-y-6 border border-white/60">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">事業テーマ</label>
                  <input type="text" value={theme} onChange={e => setTheme(e.target.value)} placeholder="例: 2035年の自動車保険" className="w-full p-4 bg-white/50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-lg" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">詳細コンテキスト</label>
                  <textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="前提条件や課題など..." className="w-full p-4 bg-white/50 border border-gray-200 rounded-xl h-24" />
                </div>

                {/* Optional Axis Settings */}
                <div className="border-t border-gray-200 pt-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={isCustomAxesMode} onChange={e => setIsCustomAxesMode(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                    <span className="text-sm font-bold text-gray-600">軸設定（オプション）</span>
                  </label>

                  {isCustomAxesMode && (
                    <div className="mt-4 space-y-4 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                      <p className="text-xs text-gray-500">空欄の項目はAIが自動的に決定します。</p>

                      {/* X軸 (横軸) */}
                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-2">X軸（横軸）</label>
                        <div className="grid grid-cols-3 gap-2">
                          <input type="text" value={customAxes.x.min} onChange={e => setCustomAxes({ ...customAxes, x: { ...customAxes.x, min: e.target.value } })} placeholder="← 左端" className="p-2 text-sm bg-white border border-gray-200 rounded-lg text-center" />
                          <input type="text" value={customAxes.x.label} onChange={e => setCustomAxes({ ...customAxes, x: { ...customAxes.x, label: e.target.value } })} placeholder="軸の項目名" className="p-2 text-sm bg-indigo-50 border border-indigo-200 rounded-lg text-center font-bold" />
                          <input type="text" value={customAxes.x.max} onChange={e => setCustomAxes({ ...customAxes, x: { ...customAxes.x, max: e.target.value } })} placeholder="右端 →" className="p-2 text-sm bg-white border border-gray-200 rounded-lg text-center" />
                        </div>
                      </div>

                      {/* Y軸 (縦軸) */}
                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-2">Y軸（縦軸）</label>
                        <div className="grid grid-cols-3 gap-2">
                          <input type="text" value={customAxes.y.min} onChange={e => setCustomAxes({ ...customAxes, y: { ...customAxes.y, min: e.target.value } })} placeholder="↓ 下端" className="p-2 text-sm bg-white border border-gray-200 rounded-lg text-center" />
                          <input type="text" value={customAxes.y.label} onChange={e => setCustomAxes({ ...customAxes, y: { ...customAxes.y, label: e.target.value } })} placeholder="軸の項目名" className="p-2 text-sm bg-indigo-50 border border-indigo-200 rounded-lg text-center font-bold" />
                          <input type="text" value={customAxes.y.max} onChange={e => setCustomAxes({ ...customAxes, y: { ...customAxes.y, max: e.target.value } })} placeholder="上端 ↑" className="p-2 text-sm bg-white border border-gray-200 rounded-lg text-center" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <button onClick={generateScenarios} disabled={!theme.trim() || !user} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition flex items-center justify-center gap-2">
                  <Icons.Brain /> {user ? "分析・シナリオ生成" : "ログインしてください"}
                </button>
              </div>
            </div>
            {user && history.length > 0 && (
              <div className="max-w-2xl mx-auto mt-12 w-full">
                <h3 className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-widest text-center">History</h3>
                <div className="space-y-2">
                  {history.map((item) => (
                    <button key={item.id} onClick={() => loadHistory(item)} className="w-full text-left bg-white px-4 py-3 rounded border border-gray-200 hover:bg-gray-50 transition flex justify-between items-center">
                      <span className="font-bold text-gray-700">{item.theme}</span>
                      <span className="text-xs text-gray-400">{item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : ""}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8 pb-12 animate-fade-in">
            {/* 分析結果エリア */}
            <div className="text-center space-y-2 border-b border-gray-200 pb-6 mb-8">
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{theme}</h1>
              <div className="max-w-2xl mx-auto mt-4 text-left">
                <div className={`text-gray-500 text-sm bg-white/50 border border-gray-100 p-4 rounded-xl transition-all duration-300 ${isDetailsExpanded ? '' : 'max-h-24 overflow-hidden relative'}`}>
                  {details}
                  {!isDetailsExpanded && <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-white/90 to-transparent pointer-events-none"></div>}
                </div>
                <button onClick={() => setIsDetailsExpanded(!isDetailsExpanded)} className="mt-2 text-xs font-bold text-indigo-500 w-full text-center">
                  {isDetailsExpanded ? "▲ 閉じる" : "▼ 全文を表示"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-8">
              <div className="bg-white/80 backdrop-blur-md p-6 pb-20 rounded-2xl shadow-sm relative border border-white/60">
                <div className="flex justify-center mb-4">
                  <h3 className="font-bold text-base text-white px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full shadow-md">
                    シナリオマトリクス
                  </h3>
                </div>
                <div className="grid grid-cols-[50px_1fr] h-full gap-2 pt-2">
                  <div className="flex flex-col items-center justify-between py-4 h-full">
                    <div className="text-xs font-bold text-gray-500">{result.axisY.max}</div>
                    <div className="flex-1 w-full flex flex-col items-center justify-center my-2 relative">
                      <div className="w-0.5 h-full bg-indigo-100 absolute top-0 left-1/2 -translate-x-1/2"></div>
                      <div className="bg-white py-3 px-1 border border-indigo-100 rounded-full shadow-sm relative z-10"><span className="text-xs font-bold text-indigo-700" style={{ writingMode: 'vertical-rl' }}>{result.axisY.label}</span></div>
                    </div>
                    <div className="text-xs font-bold text-gray-500">{result.axisY.min}</div>
                  </div>
                  <div className="flex flex-col h-full">
                    <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-4 relative z-10 h-[500px]">
                      {result.scenarios.map((s: any) => (
                        <div key={s.id} className={`p-4 rounded-xl border flex flex-col relative bg-white/90 shadow-sm z-10 overflow-hidden h-full ${s.colorCode === 'red' ? 'border-red-200' : s.colorCode === 'blue' ? 'border-blue-200' : s.colorCode === 'yellow' ? 'border-yellow-200' : 'border-gray-200'}`}>
                          <div className={`absolute top-0 right-0 text-xs font-bold px-3 py-1.5 rounded-bl-xl text-white ${s.colorCode === 'red' ? 'bg-red-500' : s.colorCode === 'blue' ? 'bg-blue-500' : s.colorCode === 'yellow' ? 'bg-yellow-500' : 'bg-gray-500'}`}>{s.probability}%</div>
                          <span className="text-[10px] font-bold text-gray-400 mb-1 block">{s.id}</span>
                          <h4 className="font-bold text-sm leading-tight mb-2 text-gray-900">{s.title}</h4>
                          <p className="text-xs text-gray-500 leading-relaxed overflow-y-auto">{s.headline}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-2 px-2">
                      <div className="text-xs font-bold text-gray-500 w-24">{result.axisX.min}</div>
                      <div className="flex-1 flex items-center justify-center relative h-8">
                        <div className="h-0.5 bg-indigo-100 w-full absolute top-1/2 left-0 -translate-y-1/2"></div>
                        <div className="bg-white px-4 py-1 border border-indigo-100 rounded-full shadow-sm relative z-10"><span className="text-xs font-bold text-indigo-700">{result.axisX.label}</span></div>
                      </div>
                      <div className="text-xs font-bold text-gray-500 w-24 text-right">{result.axisX.max}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl shadow-sm flex flex-col md:flex-row gap-6 border border-white/60">
                {/* 左側: レーダーチャート */}
                <div className="flex-1 flex flex-col items-center">
                  <h3 className="font-bold text-gray-700 mb-4 text-center">戦略ポートフォリオ比較</h3>
                  <RadarChart scenarios={result.scenarios} />
                </div>

                {/* 右側: 分析要約 */}
                <div className="flex-1 flex flex-col">
                  <div className="h-full bg-white/60 p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500 to-purple-500"></div>
                    <h4 className="font-bold text-sm text-gray-800 mb-3 flex items-center gap-2">
                      <span>📊</span> 戦略ポートフォリオ分析
                    </h4>
                    <p className="text-sm text-gray-700 leading-relaxed font-medium text-justify">
                      {result.portfolioAnalysis || "分析データがありません。"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2"><Icons.Check /> Detailed Scenarios</h2>
              <div className="grid grid-cols-1 gap-6">
                {result.scenarios.map((s: any) => (
                  <ScenarioDetails key={s.id} scenario={s} onGenerateImage={handleGenerateImage} isImageLoading={loadingStates.images[s.id]} playingScenarioId={playingScenarioId} onSpeak={handleSpeak} isAudioLoading={loadingStates.audios[s.id]} audioUrl={s.audioUrl || audioCache[s.id]} />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="w-full py-8 text-center text-gray-400 text-sm font-medium">
        {SYSTEM_CONFIG.COPYRIGHT}
      </footer>

      {/* Help Dialog */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[600px] border border-gray-200">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white flex justify-between items-center shadow-md">
              <div className="flex items-center gap-2">
                <Icons.Help />
                <span className="font-bold tracking-wider">AI ASSISTANT</span>
              </div>
              <button onClick={() => {
                setIsHelpOpen(false);
                setHelpMessages([{ role: 'ai', text: 'お手伝いします。このアプリについて何か知りたいことはありますか？' }]);
              }} className="hover:bg-white/20 p-1 rounded-full transition">
                <Icons.Close />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
              {helpMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm ${msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-tr-none'
                    : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                    }`}>
                    {msg.role === 'user' ? (
                      msg.text
                    ) : (
                      <ReactMarkdown
                        components={{
                          p: ({ ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                          ul: ({ ...props }) => <ul className="list-disc ml-4 mb-2" {...props} />,
                          ol: ({ ...props }) => <ol className="list-decimal ml-4 mb-2" {...props} />,
                          li: ({ ...props }) => <li className="mb-1" {...props} />,
                          strong: ({ ...props }) => <strong className="font-bold text-indigo-700" {...props} />,
                          code: ({ ...props }) => <code className="bg-gray-100 px-1 rounded text-xs font-mono" {...props} />,
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              ))}
              {isHelpLoading && (
                <div className="flex justify-start">
                  <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-2">
                    <Icons.Loader />
                    <span className="text-xs text-gray-500 font-medium">Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={helpEndRef} />
            </div>

            <div className="p-4 bg-white border-t border-gray-100">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={helpInput}
                  onChange={e => setHelpInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      handleHelpSend();
                    }
                  }}
                  placeholder="アプリについて質問する..."
                  className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
                <button
                  onClick={handleHelpSend}
                  disabled={isHelpLoading || !helpInput.trim()}
                  className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition disabled:opacity-50 shadow-md"
                >
                  <Icons.Send />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
