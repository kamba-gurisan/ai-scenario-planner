"use client";

import { useState, useEffect, useRef } from "react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User 
} from "firebase/auth";
import { 
  getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, 
  doc, setDoc, updateDoc, increment, getDoc, Timestamp 
} from "firebase/firestore";
import PptxGenJS from "pptxgenjs";

// =================================================================
// ⚠️ 重要: ここをあなたの本物の Firebase Config に書き換えてください！
// =================================================================
const firebaseConfig = {
  apiKey: "AIzaSyD4YzalqlL1wzzLB-zUTFwQCUTMNgyefWY",
  authDomain: "ai-scenario-pro-2026.firebaseapp.com",
  projectId: "ai-scenario-pro-2026",
  storageBucket: "ai-scenario-pro-2026.firebasestorage.app",
  messagingSenderId: "439423354212",
  appId: "1:439423354212:web:62fc734dc452a03082e671"
};

// Firebase初期化
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// --- 💎 プラン定義と制限設定 ---
const PLAN_LIMITS: any = {
  free: {
    scenarios: 3, // 月間シナリオ生成回数
    images: 5,    // 月間画像生成回数
    audios: 5,    // 月間音声生成回数
    pptx: false   // PPTX出力 (false = 不可)
  },
  pro: {
    scenarios: 100,
    images: 100,
    audios: 100,
    pptx: true
  }
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
  Brain: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-1.4 4.5 4.5 0 0 1-3 1.4"/><path d="M12 8v10"/></svg>,
  Image: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>,
  Refresh: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6"/><path d="M2.5 22v-6h6"/><path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8"/><path d="M22 12.5a10 10 0 0 1-18.8 4.2L2.5 16"/></svg>,
  Check: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Close: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Speaker: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>,
  Stop: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect></svg>,
  Download: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Upload: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Save: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  Plus: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>,
  Presentation: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h20v14H2z"></path><path d="M8 21h8"></path><path d="M12 17v4"></path></svg>,
  Lock: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>,
  Loader: () => <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>,
};

const PROMPTS = {
  IMAGE_GENERATION: (imgPrompt: string) => 
    `Papercraft style illustration, isometric view, soft lighting, detailed, 4k. ${imgPrompt}. In the middle ground, slightly positioned to the left or right side (not at the very edge to avoid cropping), subtly place a tiny cute Santa Claus character with a white beard, wearing a green outfit and a green hat, holding a single leaf in one hand. No text, no words.`
};

const RadarChart = ({ scenarios }: any) => {
  const size = 200, center = size/2, radius = 80;
  const getPoint = (val: number, i: number, total: number) => {
    const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
    const r = (val / 5) * radius;
    return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
  };
  const labels = ["イノベーション", "マーケティング", "人材・組織", "既存事業", "財務・リスク"];
  const colors: any = { red: 'rgba(239,68,68,0.3)', yellow: 'rgba(234,179,8,0.3)', gray: 'rgba(107,114,128,0.3)', blue: 'rgba(59,130,246,0.3)' };
  
  return (
    <div className="relative flex justify-center py-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {[1, 2, 3, 4, 5].map(r => (
          <polygon key={r} points={labels.map((_, i) => getPoint(r, i, 5)).join(' ')} fill="none" stroke="#e2e8f0" strokeWidth="1" />
        ))}
        {scenarios.map((s: any) => (
          <polygon key={s.id} points={s.allocation.map((a: any, i: number) => getPoint(a.val, i, 5)).join(' ')} fill={colors[s.colorCode]} stroke={colors[s.colorCode].replace('0.3','1')} strokeWidth="2" />
        ))}
        {labels.map((l, i) => {
          const [x, y] = getPoint(6, i, 5).split(',');
          return <text key={i} x={x} y={y} textAnchor="middle" fontSize="10" className="fill-gray-500 font-bold" dominantBaseline="middle">{l}</text>;
        })}
      </svg>
    </div>
  );
};

const ScenarioDetails = ({ scenario, onGenerateImage, isImageLoading, playingScenarioId, onSpeak, isAudioLoading, audioUrl }: any) => {
  const isPlaying = playingScenarioId === scenario.id;
  
  return (
    <div className={`p-6 rounded-xl border-l-4 ${
      scenario.colorCode === 'red' ? 'border-red-500 bg-red-50/50' : 
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
        <div className="text-sm space-y-3">
          <div className="bg-white/60 p-4 rounded-lg relative">
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
        <div className="text-sm space-y-3">
          <div className="bg-indigo-50/50 p-3 rounded border border-indigo-100"><span className="font-bold text-xs text-indigo-600 block mb-1">💡 BUSINESS INSIGHT</span>{scenario.insight.breakthrough}</div>
          <div><span className="font-bold text-xs text-green-600 block">✅ ACTION</span><p className="text-gray-700">{scenario.actionAdvice}</p></div>
          <div><span className="font-bold text-xs text-orange-600 block">📡 EARLY SIGNS</span><ul className="list-disc list-inside text-gray-600 text-xs pl-1">{scenario.earlySigns.map((s:string, i:number) => <li key={i}>{s}</li>)}</ul></div>
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
  // ★追加: ユーザーのプラン・利用状況
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
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- ログイン & ユーザーデータ監視 ---
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // ユーザー情報をFirestoreに保存/取得
        const userRef = doc(db, "users", u.uid);
        
        // 初回ログイン時にドキュメントがなければ作成
        // (merge: true なので既存データは消えない)
        await setDoc(userRef, {
          email: u.email,
          lastLogin: serverTimestamp(),
          // planがなければfreeを設定
        }, { merge: true });

        // リアルタイムで利用状況を監視
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
    const plan = userData.plan || 'free';
    const limit = PLAN_LIMITS[plan][type];
    
    // PPTXのようなブール値制限の場合
    if (typeof limit === 'boolean') {
      if (!limit) {
        alert("🔒 この機能はProプラン限定です。\nアップグレードして利用してください。");
        return false;
      }
      return true;
    }

    // 回数制限の場合
    const current = userData.usage[type] || 0;
    if (current >= limit) {
      alert(`⚠️ ${plan.toUpperCase()}プランの上限に達しました。\n(今月: ${current}/${limit}回)\n\n制限解除にはProプランへのアップグレードが必要です。`);
      return false;
    }
    return true;
  };

  const incrementUsage = async (type: 'scenarios' | 'images' | 'audios') => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, {
      [`usage.${type}`]: increment(1)
    });
  };

  const generateScenarios = async () => {
    if (!theme) return;
    // ★制限チェック
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
        // ★使用回数カウントアップ
        await incrementUsage('scenarios');
        
        const docRef = await addDoc(collection(db, "scenarios"), {
          userId: user.uid,
          theme,
          context: details,
          result: finalResult,
          createdAt: serverTimestamp(),
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
    // ★制限チェック
    if (!checkLimit('images')) return;

    try {
      setImageLoading(scenario.id, true);
      const basePrompt = scenario.imgPrompt || scenario.title;
      const prompt = PROMPTS.IMAGE_GENERATION(basePrompt);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: 'image', prompt }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // ★使用回数カウントアップ
      await incrementUsage('images');

      const imageUrl = `data:image/png;base64,${data.base64}`;
      setResult((prev: any) => ({
        ...prev,
        scenarios: prev.scenarios.map((s: any) => s.id === scenario.id ? { ...s, imageUrl: imageUrl } : s)
      }));
    } catch (e: any) {
      alert("画像生成エラー: " + e.message);
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

    // ★制限チェック
    if (!checkLimit('audios')) return;

    try {
      setAudioLoading(scenario.id, true);
      const textToSpeak = scenario.audioTone ? `${scenario.audioTone} ${scenario.story}` : scenario.story;
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: 'speech', text: textToSpeak }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // ★使用回数カウントアップ
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
    // ★制限チェック (Proプランのみ)
    if (!checkLimit('pptx')) return;

    if (!result) return;
    setIsLoading(true);
    setIsExporting(true);

    try {
      const pres = new PptxGenJS();
      
      // 共通レイアウト設定
      const LAYOUT = {
        W: 10.0,
        H: 5.625,
        MARGIN: 0.4,
        COLOR: {
          MAIN: "1E293B", // Slate-800
          SUB: "64748B",  // Slate-500
          ACCENT: "4F46E5", // Indigo-600
          BG: "F8FAFC",   // 背景色
          WHITE: "FFFFFF",
          AXIS_LINE: "CBD5E1" // Slate-300
        }
      };

      // シナリオ別テーマカラー定義
      const SCENARIO_STYLES: any = {
        A: { color: "EAB308", bg: "FEFCE8" }, // Yellow
        B: { color: "EF4444", bg: "FEF2F2" }, // Red
        C: { color: "6B7280", bg: "F9FAFB" }, // Gray
        D: { color: "3B82F6", bg: "EFF6FF" }  // Blue
      };

      // 0. AIによるコンテキスト要約の取得
      let summaryDetails = details;
      if (details && details.length > 100) {
        try {
          const res = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: 'summarize', text: details }),
          });
          const data = await res.json();
          if (data.summary) summaryDetails = data.summary;
        } catch (e) {
          console.error("Summary failed", e);
        }
      }

      // --- 1. 表紙スライド (Cover) ---
      let slide = pres.addSlide();
      slide.background = { color: LAYOUT.COLOR.BG };
      slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.15, fill: { color: LAYOUT.COLOR.ACCENT } });
      
      slide.addText("AI Scenario Planner Report", { 
        x: 0.5, y: 1.5, w: 9, fontSize: 14, color: LAYOUT.COLOR.ACCENT, bold: true, align: "center", charSpacing: 3 
      });
      slide.addText(theme, { 
        x: 0.5, y: 2.0, w: 9, fontSize: 36, color: LAYOUT.COLOR.MAIN, bold: true, align: "center", fontFace: "Meiryo UI", shrinkText: true 
      });

      if (summaryDetails) {
        slide.addShape(pres.ShapeType.rect, { 
          x: 1.5, y: 3.2, w: 7, h: 1.8, 
          fill: { color: LAYOUT.COLOR.WHITE }, 
          line: { color: "E2E8F0", width: 1 }, 
          rectRadius: 0.05, 
          shadow: { type: "outer", color: "000000", opacity: 0.1, blur: 5, offset: 3, angle: 90 } 
        } as any); 

        slide.addText("前提条件 / コンテキスト", { 
          x: 1.7, y: 3.4, w: 6.6, fontSize: 10, color: LAYOUT.COLOR.SUB, bold: true 
        });
        slide.addText(summaryDetails, { 
          x: 1.7, y: 3.7, w: 6.6, h: 1.1, 
          fontSize: 11, color: LAYOUT.COLOR.MAIN, align: "left", valign: "top", 
          lineSpacing: 18, shrinkText: true
        });
      }
      slide.addText(`Generated on ${new Date().toLocaleDateString()}`, { x: 0.5, y: 5.3, w: 9, fontSize: 9, color: "94A3B8", align: "center" });


      // --- 2. マトリクススライド (L字軸) ---
      slide = pres.addSlide();
      slide.background = { color: LAYOUT.COLOR.BG };
      slide.addText("不確実性マトリクス", { x: 0.4, y: 0.3, fontSize: 20, bold: true, color: LAYOUT.COLOR.MAIN, fontFace: "Meiryo UI" });

      const chartX = 1.2;
      const chartY = 1.0;
      const chartW = 8.2;
      const chartH = 4.0;
      const centerX = chartX + chartW / 2;
      const centerY = chartY + chartH / 2;

      // 軸線
      slide.addShape(pres.ShapeType.line, { x: chartX, y: chartY, w: 0, h: chartH, line: { color: LAYOUT.COLOR.AXIS_LINE, width: 3 } });
      slide.addShape(pres.ShapeType.line, { x: chartX, y: chartY + chartH, w: chartW, h: 0, line: { color: LAYOUT.COLOR.AXIS_LINE, width: 3 } });
      slide.addShape(pres.ShapeType.line, { x: centerX, y: chartY, w: 0, h: chartH, line: { color: "E2E8F0", width: 1, dashType: "dash" } });
      slide.addShape(pres.ShapeType.line, { x: chartX, y: centerY, w: chartW, h: 0, line: { color: "E2E8F0", width: 1, dashType: "dash" } });

      const valStyle = { fontSize: 10, color: LAYOUT.COLOR.ACCENT, bold: true };

      // Y軸ラベル
      slide.addText(result.axisY.label, { 
        x: 0.3, y: chartY, w: 0.6, h: chartH, 
        fontSize: 12, color: LAYOUT.COLOR.MAIN, bold: true, 
        align: "center", valign: "middle", vert: "vert270" 
      } as any); 
      
      slide.addText(result.axisY.max, { x: chartX - 2.0, y: chartY - 0.15, w: 1.9, align: "right", ...valStyle });
      slide.addText(result.axisY.min, { x: chartX - 2.0, y: chartY + chartH - 0.15, w: 1.9, align: "right", ...valStyle });

      // X軸ラベル
      slide.addText(result.axisX.label, { x: centerX - 2.0, y: chartY + chartH + 0.4, w: 4.0, align: "center", fontSize: 12, color: LAYOUT.COLOR.MAIN, bold: true });
      slide.addText(result.axisX.min, { x: chartX, y: chartY + chartH + 0.1, w: 2.5, align: "left", ...valStyle });
      slide.addText(result.axisX.max, { x: chartX + chartW - 2.5, y: chartY + chartH + 0.1, w: 2.5, align: "right", ...valStyle });

      // 4象限カード
      const cardW = 3.9;
      const cardH = 1.8;
      const cardPaddingX = 0.15;
      const cardPaddingY = 0.15;

      const drawCard = (posId: string, x: number, y: number) => {
        const s = result.scenarios.find((sc:any) => sc.id.includes(posId));
        if(!s) return;
        const style = SCENARIO_STYLES[posId] || SCENARIO_STYLES.C;

        slide.addShape(pres.ShapeType.rect, { 
          x: x, y: y, w: cardW, h: cardH, 
          fill: { color: LAYOUT.COLOR.WHITE }, 
          line: { color: "E2E8F0", width: 1 }, 
          rectRadius: 0.05,
          shadow: { type: "outer", color: "000000", opacity: 0.1, blur: 5, offset: 3, angle: 90 } 
        } as any);
        slide.addShape(pres.ShapeType.rect, { 
          x: x, y: y, w: cardW, h: 0.08, 
          fill: { color: style.color }, 
          rectRadius: 0.02 
        } as any);
        slide.addText(`Scenario ${posId}`, { x: x + 0.2, y: y + 0.3, w: 2.0, fontSize: 10, bold: true, color: style.color });
        slide.addText(`${s.probability}%`, { x: x + cardW - 1.2, y: y + 0.3, w: 1.0, align: "right", fontSize: 10, bold: true, color: LAYOUT.COLOR.SUB });
        slide.addText(s.title, { 
          x: x + 0.2, y: y + 0.5, w: cardW - 0.4, h: 0.6, 
          fontSize: 12, bold: true, color: LAYOUT.COLOR.MAIN, valign: "top", shrinkText: true 
        });
        slide.addText(s.headline, { 
          x: x + 0.2, y: y + 1.0, w: cardW - 0.4, h: 0.7, 
          fontSize: 9, color: LAYOUT.COLOR.SUB, valign: "top", shrinkText: true 
        });
      };

      drawCard("A", centerX - cardW - cardPaddingX, centerY - cardH - cardPaddingY);
      drawCard("B", centerX + cardPaddingX, centerY - cardH - cardPaddingY);
      drawCard("C", centerX - cardW - cardPaddingX, centerY + cardPaddingY);
      drawCard("D", centerX + cardPaddingX, centerY + cardPaddingY);


      // --- 3. 各シナリオ詳細 (2ページ構成) ---
      for (const s of result.scenarios) {
        let sid = "C";
        if (s.id.includes("A")) sid = "A";
        else if (s.id.includes("B")) sid = "B";
        else if (s.id.includes("D")) sid = "D";
        const style = SCENARIO_STYLES[sid];

        // === Page 1: ビジュアル & ストーリー ===
        const p1 = pres.addSlide();
        p1.background = { color: LAYOUT.COLOR.BG };

        // ヘッダー
        p1.addShape(pres.ShapeType.rect, { 
          x: 0.5, y: 0.3, w: 9.0, h: 0.8, 
          fill: { color: LAYOUT.COLOR.WHITE }, 
          rectRadius: 0.05, 
          shadow: { type: "outer", opacity: 0.05, blur: 3, offset: 2, angle: 90 } 
        } as any);
        p1.addShape(pres.ShapeType.rect, { x: 0.5, y: 0.3, w: 0.15, h: 0.8, fill: { color: style.color } });
        p1.addText(`${s.id}: ${s.title}`, { x: 0.8, y: 0.3, w: 7.0, h: 0.8, fontSize: 20, bold: true, color: LAYOUT.COLOR.MAIN, fontFace: "Meiryo UI", valign: "middle" });
        p1.addText(`確率: ${s.probability}%`, { x: 8.0, y: 0.3, w: 1.3, h: 0.8, fontSize: 12, align: "center", color: style.color, bold: true, valign: "middle" });

        // メインコンテンツカード
        p1.addShape(pres.ShapeType.rect, { 
          x: 0.5, y: 1.3, w: 9.0, h: 4.0, 
          fill: { color: LAYOUT.COLOR.WHITE }, 
          rectRadius: 0.05, 
          shadow: { type: "outer", opacity: 0.05, blur: 3, offset: 2, angle: 90 } 
        } as any);

        // 画像
        if (s.imageUrl && s.imageUrl.startsWith("data:image")) {
          p1.addImage({ data: s.imageUrl, x: 0.8, y: 1.6, w: 2.8, h: 1.58 }); 
        } else {
          p1.addShape(pres.ShapeType.rect, { x: 0.8, y: 1.6, w: 2.8, h: 1.58, fill: { color: "F1F5F9" } });
          p1.addText("No Image", { x: 0.8, y: 2.2, w: 2.8, align: "center", color: "94A3B8" });
        }

        // ヘッドライン
        p1.addText(s.headline, { 
          x: 3.8, y: 1.6, w: 5.4, h: 1.5, 
          fontSize: 16, bold: true, color: LAYOUT.COLOR.MAIN, valign: "top", shrinkText: true 
        });

        // ストーリー
        p1.addText("STORY", { x: 0.8, y: 3.3, fontSize: 10, bold: true, color: "94A3B8" });
        
        // 音声
        const targetAudioUrl = s.audioUrl || audioCache[s.id];
        if (targetAudioUrl) {
          try {
            const audioBase64 = await urlToBase64(targetAudioUrl);
            p1.addMedia({ 
              type: "audio", 
              data: `data:audio/wav;base64,${audioBase64}`, 
              x: 1.5, y: 3.25, w: 0.3, h: 0.3 
            });
            p1.addText("🔊 音声を再生", { x: 1.8, y: 3.25, fontSize: 9, color: LAYOUT.COLOR.ACCENT });
          } catch (e) {
            console.error("Audio embed failed", e);
          }
        }

        p1.addText(s.story, { 
          x: 0.8, y: 3.5, w: 8.4, h: 1.6, 
          fontSize: 11, color: "374151", align: "justify", valign: "top", 
          shrinkText: true, lineSpacing: 15 
        });


        // === Page 2: 戦略分析 (Strategy) ===
        const p2 = pres.addSlide();
        p2.background = { color: LAYOUT.COLOR.BG };

        // ヘッダー
        p2.addShape(pres.ShapeType.rect, { 
          x: 0.5, y: 0.3, w: 9.0, h: 0.5, 
          fill: { color: LAYOUT.COLOR.WHITE }, 
          rectRadius: 0.05 
        } as any);
        p2.addText(`${s.id} - Strategy & Analysis`, { x: 0.7, y: 0.3, h: 0.5, fontSize: 12, bold: true, color: LAYOUT.COLOR.SUB, valign: "middle" });

        // 左: チャートカード
        p2.addShape(pres.ShapeType.rect, { 
          x: 0.5, y: 1.0, w: 3.5, h: 4.2, 
          fill: { color: LAYOUT.COLOR.WHITE }, 
          rectRadius: 0.05, 
          shadow: { type: "outer", opacity: 0.05, blur: 3, offset: 2, angle: 90 } 
        } as any);
        p2.addText("リソース配分", { x: 0.5, y: 1.2, w: 3.5, align: "center", fontSize: 11, bold: true, color: LAYOUT.COLOR.MAIN });
        
        const chartData = [{
          name: s.title,
          labels: ["イノベーション", "マーケティング", "人材・組織", "既存事業", "財務・リスク"],
          values: s.allocation.map((a: any) => a.val)
        }];
        p2.addChart(pres.ChartType.radar, chartData, { 
          x: 0.6, y: 1.5, w: 3.3, h: 3.3, 
          radarStyle: "marker", 
          chartColors: [style.color], 
          chartColorsOpacity: 40,
          valAxisHidden: true, legend: { show: false },
          catAxisLabelFontSize: 9,
          catAxisLabelColor: "64748B"
        } as any);

        // 右: テキストカード群
        const rightX = 4.2;
        const rightW = 5.3;
        const boxH = 1.3;

        // 1. Business Insight
        p2.addShape(pres.ShapeType.rect, { 
          x: rightX, y: 1.0, w: rightW, h: boxH, 
          fill: { color: LAYOUT.COLOR.WHITE }, 
          rectRadius: 0.05, 
          shadow: { type: "outer", opacity: 0.05, offset: 2, angle: 90 } 
        } as any);
        p2.addText("BUSINESS INSIGHT", { x: rightX + 0.2, y: 1.1, fontSize: 9, bold: true, color: LAYOUT.COLOR.ACCENT });
        p2.addText(s.insight.breakthrough, { 
          x: rightX + 0.2, y: 1.3, w: rightW - 0.4, h: boxH - 0.4, 
          fontSize: 10, color: "1F2937", valign: "top", shrinkText: true 
        });

        // 2. Action
        p2.addShape(pres.ShapeType.rect, { 
          x: rightX, y: 1.0 + boxH + 0.15, w: rightW, h: boxH, 
          fill: { color: LAYOUT.COLOR.WHITE }, 
          rectRadius: 0.05, 
          shadow: { type: "outer", opacity: 0.05, offset: 2, angle: 90 } 
        } as any);
        p2.addText("STRATEGIC ACTION", { x: rightX + 0.2, y: 1.0 + boxH + 0.25, fontSize: 9, bold: true, color: "059669" });
        p2.addText(s.actionAdvice, { 
          x: rightX + 0.2, y: 1.0 + boxH + 0.45, w: rightW - 0.4, h: boxH - 0.4, 
          fontSize: 10, color: "1F2937", valign: "top", shrinkText: true 
        });

        // 3. Early Signs
        p2.addShape(pres.ShapeType.rect, { 
          x: rightX, y: 1.0 + (boxH + 0.15) * 2, w: rightW, h: boxH, 
          fill: { color: LAYOUT.COLOR.WHITE }, 
          rectRadius: 0.05, 
          shadow: { type: "outer", opacity: 0.05, offset: 2, angle: 90 } 
        } as any);
        p2.addText("EARLY SIGNS (兆候)", { x: rightX + 0.2, y: 1.0 + (boxH + 0.15) * 2 + 0.1, fontSize: 9, bold: true, color: "D97706" });
        const signsList = s.earlySigns.map((es: string) => `• ${es}`).join("\n");
        p2.addText(signsList, { 
          x: rightX + 0.2, y: 1.0 + (boxH + 0.15) * 2 + 0.3, w: rightW - 0.4, h: boxH - 0.4, 
          fontSize: 10, color: "4B5563", valign: "top", shrinkText: true 
        });
      }

      pres.writeFile({ fileName: `${theme.replace(/\s+/g, '_')}_ScenarioReport.pptx` });

    } catch (e) {
      console.error(e);
      alert("PPTX生成中にエラーが発生しました");
    } finally {
      setIsExporting(false);
      setIsLoading(false);
    }
  };

  const handleSaveProject = async () => {
    if (!result) return;
    try {
      const scenariosToSave = await Promise.all(result.scenarios.map(async (s: any) => {
        let imageBase64 = null;
        let audioBase64 = null;
        if (s.imageUrl) {
          if (s.imageUrl.startsWith('data:')) imageBase64 = s.imageUrl.split(',')[1];
          else imageBase64 = await urlToBase64(s.imageUrl);
        }
        if (s.audioUrl) {
          audioBase64 = await urlToBase64(s.audioUrl);
        }
        return { ...s, savedImage: imageBase64, savedAudio: audioBase64 };
      }));

      const saveData = {
        theme,
        details,
        result: { ...result, scenarios: scenariosToSave },
        timestamp: new Date().toISOString(),
        customAxes: customAxes
      };

      const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: "application/json" });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${theme.replace(/\s+/g, '_')}_project.json`;
      link.click();
    } catch (e) {
      console.error(e);
      alert("保存に失敗しました");
    }
  };

  const handleLoadProject = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event: any) => {
      try {
        const data = JSON.parse(event.target.result);
        setTheme(data.theme);
        setDetails(data.details);
        
        if (data.customAxes) {
          setCustomAxes(data.customAxes);
          setIsCustomAxesMode(true);
        }

        const restoredScenarios = data.result.scenarios.map((s: any) => ({
          ...s,
          imageUrl: s.savedImage ? `data:image/png;base64,${s.savedImage}` : null,
          audioUrl: s.savedAudio ? URL.createObjectURL(base64ToBlob(s.savedAudio, 'audio/wav')) : null
        }));

        setResult({ ...data.result, scenarios: restoredScenarios });
        setAudioCache({});
        setIsDetailsExpanded(false);
      } catch (err) {
        alert("ファイルの読み込みに失敗しました");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const loadHistory = (item: any) => {
    setTheme(item.theme);
    setDetails(item.context);
    
    if (item.result?.axisX && item.result?.axisY) {
      setCustomAxes({
        x: { 
          label: item.result.axisX.label || "", 
          min: item.result.axisX.min || "", 
          max: item.result.axisX.max || "" 
        },
        y: { 
          label: item.result.axisY.label || "", 
          min: item.result.axisY.min || "", 
          max: item.result.axisY.max || "" 
        }
      });
      setIsCustomAxesMode(true);
    }

    setResult(item.result);
    setAudioCache({});
    setIsDetailsExpanded(false);
    setCurrentDocId(item.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen pb-12 font-sans selection:bg-indigo-100 selection:text-indigo-800 text-gray-800 bg-[#f0f4f8]" style={{ backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
      
      <input type="file" ref={fileInputRef} onChange={handleLoadProject} className="hidden" accept=".json" />

      {/* Header */}
      <header className="fixed top-0 w-full z-40 bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-16 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧭</span>
            <h1 className="font-bold text-xl tracking-tight text-gray-800">AI Scenario Planner <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full font-normal">Pro</span></h1>
          </div>
          <div className="flex items-center gap-3">
            {result && (
              <>
                <button onClick={() => setResult(null)} className="flex items-center gap-1 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg transition" title="新しい分析を始める">
                  <Icons.Plus /> 新規
                </button>

                {/* ★変更: Pro/Freeで出し分け */}
                {userData.plan === 'pro' ? (
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
            
            <div className="h-6 w-px bg-gray-300 mx-1"></div>

            {user ? (
              <div className="flex items-center gap-4">
                {/* ★変更: プラン情報表示 */}
                <div className="text-right hidden sm:block">
                  <div className={`text-xs font-bold ${userData.plan==='pro' ? 'text-indigo-600':'text-gray-500'}`}>
                    {userData.plan === 'pro' ? 'Pro Plan' : 'Free Plan'}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    残り: {userData.plan==='pro' ? '∞' : 3 - userData.usage.scenarios}回
                  </div>
                </div>
                <img src={user.photoURL || ""} className="w-8 h-8 rounded-full border border-gray-300" alt="user" />
                <button onClick={() => auth.signOut()} className="text-xs text-gray-500 hover:text-red-500">Logout</button>
              </div>
            ) : (
              <button onClick={handleLogin} className="text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-lg hover:bg-indigo-100 transition">Google Login</button>
            )}
          </div>
        </div>
      </header>

      {/* Loading Overlay */}
      {(isLoading || isExporting) && (
        <div className="fixed inset-0 bg-white/90 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
          <h2 className="text-xl font-bold text-gray-800 animate-pulse">
            {isExporting ? "Exporting..." : "Thinking..."}
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            {isExporting ? "Creating your PowerPoint presentation." : "AI is planning the future."}
          </p>
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
                  <textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="前提条件や課題など..." className="w-full p-4 bg-white/50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none" />
                </div>
                
                <div className="pt-2">
                  <label className="flex items-center gap-2 mb-3 cursor-pointer text-sm font-bold text-gray-700">
                    <input type="checkbox" checked={isCustomAxesMode} onChange={e => setIsCustomAxesMode(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded" />
                    分析軸を手動で設定する
                  </label>
                  {isCustomAxesMode && (
                    <div className="grid md:grid-cols-2 gap-4 bg-white/60 p-4 rounded-xl border border-gray-200 mb-4 animate-fade-in">
                      <div>
                        <p className="text-xs font-bold text-indigo-600 mb-1">X軸 (横)</p>
                        <input type="text" placeholder="ラベル (空欄可: AI提案)" value={customAxes.x.label} onChange={e => setCustomAxes({...customAxes, x: {...customAxes.x, label: e.target.value}})} className="w-full p-2 mb-2 border rounded text-sm placeholder-indigo-300" />
                        <div className="grid grid-cols-2 gap-2"><input type="text" placeholder="Min (空欄可)" value={customAxes.x.min} onChange={e => setCustomAxes({...customAxes, x: {...customAxes.x, min: e.target.value}})} className="w-full p-2 border rounded text-sm placeholder-gray-300" /><input type="text" placeholder="Max (空欄可)" value={customAxes.x.max} onChange={e => setCustomAxes({...customAxes, x: {...customAxes.x, max: e.target.value}})} className="w-full p-2 border rounded text-sm placeholder-gray-300" /></div>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-indigo-600 mb-1">Y軸 (縦)</p>
                        <input type="text" placeholder="ラベル (空欄可: AI提案)" value={customAxes.y.label} onChange={e => setCustomAxes({...customAxes, y: {...customAxes.y, label: e.target.value}})} className="w-full p-2 mb-2 border rounded text-sm placeholder-indigo-300" />
                        <div className="grid grid-cols-2 gap-2"><input type="text" placeholder="Min (空欄可)" value={customAxes.y.min} onChange={e => setCustomAxes({...customAxes, y: {...customAxes.y, min: e.target.value}})} className="w-full p-2 border rounded text-sm placeholder-gray-300" /><input type="text" placeholder="Max (空欄可)" value={customAxes.y.max} onChange={e => setCustomAxes({...customAxes, y: {...customAxes.y, max: e.target.value}})} className="w-full p-2 border rounded text-sm placeholder-gray-300" /></div>
                      </div>
                    </div>
                  )}
                </div>

                <button onClick={generateScenarios} disabled={!theme.trim() || !user} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  <Icons.Brain /> {user ? "分析・シナリオ生成" : "ログインしてください"}
                </button>
              </div>
            </div>

            {user && history.length > 0 && (
              <div className="max-w-2xl mx-auto mt-12">
                <h3 className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-widest text-center">History (Text Only)</h3>
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
            <div className="text-center space-y-2 border-b border-gray-200 pb-6 mb-8">
              <div className="inline-block bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold mb-2">Scenario Report</div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{theme}</h1>
              
              <div className="max-w-2xl mx-auto mt-4 text-left">
                {details && (
                  <div className="relative">
                    <div className={`text-gray-500 text-sm bg-white/50 border border-gray-100 p-4 rounded-xl transition-all duration-300 ${isDetailsExpanded ? '' : 'max-h-24 overflow-hidden'}`}>
                      {details.split('\n').map((line: string, i: number) => (
                        <span key={i}>{line}<br /></span>
                      ))}
                    </div>
                    {details.length > 100 && (
                      <>
                        {!isDetailsExpanded && (
                          <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-white/90 to-transparent pointer-events-none rounded-b-xl"></div>
                        )}
                        <button 
                          onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                          className="mt-2 text-xs font-bold text-indigo-500 hover:text-indigo-700 flex items-center justify-center w-full focus:outline-none"
                        >
                          {isDetailsExpanded ? "▲ 閉じる" : "▼ 全文を表示"}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl shadow-sm relative lg:col-span-2 border border-white/60">
                <div className="absolute top-0 left-0 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-br-lg z-20">不確実性マトリクス</div>
                <div className="grid grid-cols-[50px_1fr] h-full gap-2 pt-6">
                  <div className="flex flex-col items-center justify-between py-4 h-full">
                    <div className="text-xs font-bold text-gray-500">{result.axisY.max}</div>
                    <div className="flex-1 w-full flex flex-col items-center justify-center my-2 relative">
                      <div className="w-0.5 h-full bg-indigo-100 absolute top-0 left-1/2 -translate-x-1/2"></div>
                      <div className="bg-white py-3 px-1 border border-indigo-100 rounded-full shadow-sm relative z-10 flex flex-col items-center"><span className="text-xs font-bold text-indigo-700" style={{ writingMode: 'vertical-rl' }}>{result.axisY.label}</span></div>
                    </div>
                    <div className="text-xs font-bold text-gray-500">{result.axisY.min}</div>
                  </div>
                  <div className="flex flex-col h-full">
                    <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-4 relative z-10 h-[500px]">
                      {['Scenario A', 'Scenario B', 'Scenario C', 'Scenario D'].map(id => {
                        const s = result.scenarios.find((sc:any) => sc.id === id);
                        return (
                          <div key={id} className={`p-4 rounded-xl border flex flex-col relative bg-white/90 shadow-sm z-10 overflow-hidden h-full ${
                            s.colorCode === 'red' ? 'border-red-200' : s.colorCode === 'blue' ? 'border-blue-200' : s.colorCode === 'yellow' ? 'border-yellow-200' : 'border-gray-200'
                          }`}>
                            <div className={`absolute top-0 right-0 text-xs font-bold px-3 py-1.5 rounded-bl-xl text-white ${
                              s.colorCode === 'red' ? 'bg-red-500' : s.colorCode === 'blue' ? 'bg-blue-500' : s.colorCode === 'yellow' ? 'bg-yellow-500' : 'bg-gray-500'
                            }`}>{s.probability}%</div>
                            <span className="text-[10px] font-bold text-gray-400 mb-1 block">{s.id}</span>
                            <h4 className="font-bold text-sm leading-tight mb-2 text-gray-900 border-b border-gray-100 pb-2">{s.title}</h4>
                            <p className="text-xs font-bold text-gray-700 leading-snug mb-2">{s.headline}</p>
                            <p className="text-xs text-gray-500 leading-relaxed overflow-y-auto">{s.insight.context}</p>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between mt-2 px-2">
                      <div className="text-xs font-bold text-gray-500 w-24 text-left">{result.axisX.min}</div>
                      <div className="flex-1 flex items-center justify-center px-2 relative h-8">
                        <div className="h-0.5 bg-indigo-100 w-full absolute top-1/2 left-0 -translate-y-1/2"></div>
                        <div className="bg-white px-4 py-1 border border-indigo-100 rounded-full shadow-sm relative z-10"><span className="text-xs font-bold text-indigo-700">{result.axisX.label}</span></div>
                      </div>
                      <div className="text-xs font-bold text-gray-500 w-24 text-right">{result.axisX.max}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl shadow-sm flex flex-col lg:col-span-1 border border-white/60">
                <h3 className="font-bold text-gray-700 mb-4 text-center">戦略ポートフォリオ比較</h3>
                <div className="flex justify-center"><RadarChart scenarios={result.scenarios} /></div>
                <div className="mt-4 space-y-2">
                  {result.scenarios.map((s:any) => (
                    <div key={s.id} className="flex items-center text-xs gap-2">
                      <span className={`w-3 h-3 rounded-full ${s.colorCode==='red'?'bg-red-400':s.colorCode==='yellow'?'bg-yellow-400':s.colorCode==='blue'?'bg-blue-400':'bg-gray-400'}`}></span>
                      <span className="font-bold">{s.id}</span>
                      <span className="text-gray-500 truncate">{s.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2"><Icons.Check /> Detailed Scenarios</h2>
              <div className="grid grid-cols-1 gap-6">
                {result.scenarios.map((s:any) => (
                  <ScenarioDetails 
                    key={s.id} 
                    scenario={s} 
                    onGenerateImage={handleGenerateImage} 
                    isImageLoading={loadingStates.images[s.id]} 
                    playingScenarioId={playingScenarioId} 
                    onSpeak={handleSpeak} 
                    isAudioLoading={loadingStates.audios[s.id]} 
                    audioUrl={s.audioUrl || audioCache[s.id]} 
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
      <footer className="w-full py-8 text-center text-gray-400 text-sm font-medium">© 2026 GURISAN. All Rights Reserved</footer>
    </div>
  );
}