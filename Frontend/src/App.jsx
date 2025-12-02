// ... (Imports inchangés) ...
import React, { useState, useRef, useEffect } from 'react';
import { Search, Play, Loader, Film, Tv, CheckCircle, AlertCircle, Globe, List, Download, Copy, ExternalLink, X, Maximize, Minimize, WifiOff, RefreshCw, SkipForward, ArrowRightLeft, MonitorOff } from 'lucide-react';

export default function App() {
	// ... (États inchangés) ...
	const [query, setQuery] = useState('');
	const [movies, setMovies] = useState([]);
	const [loading, setLoading] = useState(false);
	const [downloading, setDownloading] = useState(null);

	const [streamUrl, setStreamUrl] = useState(null);
	const [isStreamReady, setIsStreamReady] = useState(false);
	const [torrentResults, setTorrentResults] = useState([]);
	const [activeTorrent, setActiveTorrent] = useState(null);
	const [error, setError] = useState(null);
	const [streamError, setStreamError] = useState(null);

	const [videoCodec, setVideoCodec] = useState(null);
	const [videoDuration, setVideoDuration] = useState(0);
	const [currentTime, setCurrentTime] = useState(0);
	const [serverTimeOffset, setServerTimeOffset] = useState(0);
	const [isFullscreen, setIsFullscreen] = useState(false);

	// Valeur par défaut : Bluray (le top qualité)
	const [searchQuality, setSearchQuality] = useState('Bluray');
	const [currentMovie, setCurrentMovie] = useState(null);
	const [currentLang, setCurrentLang] = useState(null);
	const [currentStreamId, setCurrentStreamId] = useState(null);

	const videoRef = useRef(null);
	const playerRef = useRef(null);
	const pollingRef = useRef(null);

	const torrentsRef = useRef([]);
	const activeTorrentRef = useRef(null);
	const qualityRef = useRef('Bluray');
	const movieRef = useRef(null);
	const langRef = useRef(null);
	const streamIdRef = useRef(null);

	useEffect(() => { torrentsRef.current = torrentResults; }, [torrentResults]);
	useEffect(() => { activeTorrentRef.current = activeTorrent; }, [activeTorrent]);
	useEffect(() => { qualityRef.current = searchQuality; }, [searchQuality]);
	useEffect(() => { movieRef.current = currentMovie; }, [currentMovie]);
	useEffect(() => { langRef.current = currentLang; }, [currentLang]);
	useEffect(() => { streamIdRef.current = currentStreamId; }, [currentStreamId]);

	// ... (useEffect fullscreen, cleanTitle, formatTime, toggleFullscreen, waitForStream inchangés) ...
	useEffect(() => {
		const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
		document.addEventListener('fullscreenchange', handleFullscreenChange);
		return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
	}, []);

	const cleanTitle = (text) => { if (!text) return ''; return text.replace(/[^a-zA-Z0-9\s\u00C0-\u017F]/g, ' ').replace(/\s+/g, ' ').trim(); };
	const formatTime = (seconds) => { const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = Math.floor(seconds % 60); if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`; return `${m}:${s.toString().padStart(2, '0')}`; };
	const toggleFullscreen = () => { if (!playerRef.current) return; if (!document.fullscreenElement) playerRef.current.requestFullscreen().catch(err => console.error(err)); else document.exitFullscreen(); };

	const waitForStream = (id) => {
		setIsStreamReady(false);
		setVideoCodec(null);
		setServerTimeOffset(0);
		setCurrentTime(0);
		if (pollingRef.current) clearInterval(pollingRef.current);

		pollingRef.current = setInterval(async () => {
			try {
				const res = await fetch(`/api/stream/${id}/meta`);
				const data = await res.json();

				// LOGIQUE DE RETRY AVEC NOUVELLES ÉTAPES x264
				if (data.status === 'timeout' || data.status === 'no_video' || data.status === 'stalled') {
					const cause = data.status === 'stalled' ? "bloquée" : "morte";
					console.log(`❌ Source ${cause}.`);

					const currentList = torrentsRef.current;
					const currentTorrent = activeTorrentRef.current;
					const currentIndex = currentList.findIndex(t => t.href === currentTorrent?.href);

					// 1. Essayer le lien suivant
					if (currentIndex !== -1 && currentIndex < currentList.length - 1) {
						const nextTorrent = currentList[currentIndex + 1];
						setStreamError(`Source HS. Essai ${currentIndex + 2}/${currentList.length}...`);
						clearInterval(pollingRef.current);
						setTimeout(() => forceDownload(nextTorrent, true), 1000);
						return;
					}
					// 2. Cascade de Qualité (Bluray -> 1080p x264 -> 1080p -> 720p)
					else if (qualityRef.current === 'Bluray') {
						setStreamError("Bluray HS. Test 1080p x264...");
						clearInterval(pollingRef.current);
						setTimeout(() => launchSearch(movieRef.current, langRef.current, '1080p x264'), 1500);
						return;
					}
					else if (qualityRef.current === '1080p x264') {
						setStreamError("1080p x264 HS. Test 1080p Standard...");
						clearInterval(pollingRef.current);
						setTimeout(() => launchSearch(movieRef.current, langRef.current, '1080p'), 1500);
						return;
					}
					else if (qualityRef.current === '1080p') {
						setStreamError("1080p HS. Test 720p...");
						clearInterval(pollingRef.current);
						setTimeout(() => launchSearch(movieRef.current, langRef.current, '720p'), 1500);
						return;
					}
					else {
						setStreamError("Échec : Aucune source valide.");
						clearInterval(pollingRef.current);
						return;
					}
				}

				if (data.ready) {
					if (data.duration) setVideoDuration(data.duration);
					if (data.codec) setVideoCodec(data.codec);
					if (!isStreamReady) {
						setStreamUrl(`/api/stream/${id}/video`);
						setIsStreamReady(true);
						setStreamError(null);
					}
				}
			} catch (err) {}
		}, 2000);
	};

	const seekTo = (seconds) => {
		if (seconds < 0) seconds = 0;
		if (videoDuration > 0 && seconds > videoDuration) seconds = videoDuration - 10;
		setServerTimeOffset(seconds);
		const baseUrl = streamUrl.split('?')[0];
		setStreamUrl(`${baseUrl}?start=${seconds}&t=${Date.now()}`);
	};

	useEffect(() => { return () => { if (pollingRef.current) clearInterval(pollingRef.current); }; }, []);

	const searchMovies = async (e) => {
		e.preventDefault();
		if (!query.trim()) return;
		setLoading(true);
		setError(null);
		setMovies([]);
		setStreamUrl(null);
		try {
			const res = await fetch(`/api/search_tmdb?query=${encodeURIComponent(query)}`);
			if (!res.ok) throw new Error("Erreur");
			const data = await res.json();
			setMovies(data);
		} catch (err) { setError("Serveur injoignable"); }
		finally { setLoading(false); }
	};

	// --- NOUVELLE FONCTION DE RECHERCHE OPTIMISÉE x264 ---
	const launchSearch = async (movie, lang, quality) => {
		setCurrentMovie(movie);
		setCurrentLang(lang);
		setSearchQuality(quality);

		let titleToSearch = lang === 'fr' ? (movie.title || movie.original_title) : movie.original_title;
		if (titleToSearch) titleToSearch = cleanTitle(titleToSearch);

		// Nettoyage des termes techniques
		titleToSearch = titleToSearch.replace(/(1080p|720p|4k|hdlight|bluray|x264|h264|x265)/gi, '').trim();

		const dateStr = movie.release_date || movie.first_air_date;
		if (dateStr) titleToSearch += ` ${dateStr.split('-')[0]}`;

		// Ajout de la qualité demandée (ex: "1080p x264")
		titleToSearch += ` ${quality}`;

		console.log(`🔎 Recherche : "${titleToSearch}"`);

		setStreamUrl(null);
		setStreamError(null);
		setIsStreamReady(false);

		if (downloading) setStreamError(`Recherche ${quality}...`);
		else setDownloading({ id: movie.id, lang: lang });

		try {
			const endpoint = lang === 'fr' ? '/api/search_fr' : '/api/search_en';
			console.log(`${endpoint}?query=${encodeURIComponent(titleToSearch)}`);
			const res = await fetch(`${endpoint}?query=${encodeURIComponent(titleToSearch)}`);
			const data = await res.json();

			if (data && data.length > 0) {
				setTorrentResults(data);
				forceDownload(data[0], true);
			} else {
				// Logique de Fallback si rien trouvé à cette étape
				if (quality === 'Bluray') {
					launchSearch(movie, lang, '1080p x264');
				} else if (quality === '1080p x264') {
					launchSearch(movie, lang, '1080p');
				} else if (quality === '1080p') {
					launchSearch(movie, lang, '720p');
				} else {
					setError(`Aucun torrent trouvé.`);
					setDownloading(null);
				}
			}
		} catch (err) {
			setError("Erreur technique");
			setDownloading(null);
		}
	};

	const handleStream = (movie, lang) => {
		// Démarrage par défaut en Bluray
		launchSearch(movie, lang, 'Bluray x264');
	};

	const forceDownload = async (torrent, isAutoRetry = false) => {
		setActiveTorrent(torrent);
		setStreamUrl("loading");
		setIsStreamReady(false);
		if (!isAutoRetry) setStreamError(null);

		try {
			const res = await fetch('/api/download', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({magnet: torrent.href})
			});
			const data = await res.json();
			if (data.stream_id) {
				setCurrentStreamId(data.stream_id);
				waitForStream(data.stream_id);
			}
		} catch (err) { setError("Erreur démarrage download"); }
	};

	const isCodecSupported = () => {
		if (!videoCodec) return true;
		if (videoCodec.includes('hevc') || videoCodec.includes('h265') || videoCodec.includes('vp9')) return false;
		if (videoCodec.includes('10-bit') || videoCodec.includes('10le')) return false;
		return true;
	};

	return (
		<div className="min-h-screen bg-gray-900 text-white font-sans">
			{/* ... Le JSX reste identique (Player, Header, Liste...) ... */}
			{streamUrl && activeTorrent && (
				<div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center animate-in fade-in duration-300">
					{!isFullscreen && (
						<div className="absolute top-0 w-full p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-50">
							<div className="flex items-center gap-4">
								<button onClick={() => { setStreamUrl(null); if(pollingRef.current) clearInterval(pollingRef.current); setDownloading(null); }} className="p-2 hover:bg-white/20 rounded-full transition text-white"> <X size={32} /> </button>
								<div>
									<div className="flex items-center gap-2">
										<h2 className="font-bold text-xl">{cleanTitle(activeTorrent.title)}</h2>
										<span className="text-xs bg-gray-700/80 px-2 py-0.5 rounded text-gray-200 border border-gray-500">{searchQuality}</span>
										{videoCodec && <span className="text-xs bg-blue-900/80 px-2 py-0.5 rounded text-blue-200">{videoCodec.toUpperCase()}</span>}
									</div>
									{streamError ? ( <span className="text-sm text-orange-400 flex items-center gap-1 animate-pulse"> {streamError.includes("720p") ? <ArrowRightLeft size={14}/> : <SkipForward size={14} />} {streamError} </span> ) : isStreamReady && ( <span className="text-sm text-green-400 flex items-center gap-1"><CheckCircle size={14}/> Prêt</span> )}
								</div>
							</div>
						</div>
					)}

					<div ref={playerRef} className={`w-full ${isFullscreen ? 'h-screen' : 'max-w-6xl aspect-video'} bg-black shadow-2xl relative group flex flex-col items-center justify-center`}>
						{!isStreamReady ? (
							<div className="text-center space-y-4"> <Loader className="w-16 h-16 text-red-600 animate-spin mx-auto" /> <p className="text-xl font-bold">Chargement...</p> </div>
						) : !isCodecSupported() ? (
							<div className="text-center space-y-6 p-8 bg-gray-800/50 rounded-xl border border-yellow-600/50 max-w-lg"> <MonitorOff className="w-20 h-20 text-yellow-500 mx-auto" /> <div> <h3 className="text-2xl font-bold text-white mb-2">Format Vidéo Incompatible</h3> <p className="text-gray-300">Codec: <strong>{videoCodec?.toUpperCase()}</strong></p> </div> <a href={`vlc://${window.location.protocol}//${window.location.host}${streamUrl}`} className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-3 transition-transform hover:scale-105"> <Play size={20} fill="currentColor"/> Ouvrir dans VLC </a> </div>
						) : (
							<>
								<video ref={videoRef} className="w-full h-full object-contain" controls={true} autoPlay src={streamUrl} onError={() => setStreamError('PLAYBACK_ERROR')} onDoubleClick={toggleFullscreen} style={{ maxHeight: '100vh', maxWidth: '100vw' }}> Browser not supported. </video>
								{streamError === 'PLAYBACK_ERROR' && ( <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/95 z-50"> <AlertCircle className="w-16 h-16 text-yellow-500 mb-4" /> <h3 className="text-2xl font-bold text-white mb-2">Erreur de lecture</h3> <a href={`vlc://${window.location.protocol}//${window.location.host}${streamUrl}`} className="bg-orange-600 px-6 py-3 rounded font-bold flex gap-2"> <Play size={20}/> Ouvrir dans VLC </a> </div> )}
							</>
						)}
					</div>

					{!isFullscreen && (
						<div className="absolute bottom-10 w-full max-w-4xl px-4 z-50"> {torrentResults.length > 1 && ( <div className="bg-black/80 backdrop-blur rounded-xl p-4 border border-gray-700 max-h-40 overflow-y-auto"> <p className="text-xs text-gray-400 mb-2 uppercase font-bold tracking-wider">Autres sources</p> {torrentResults.map((t, idx) => ( <div key={idx} onClick={() => forceDownload(t)} className={`flex justify-between items-center p-2 rounded cursor-pointer hover:bg-white/10 ${t.href === activeTorrent.href ? 'text-green-400 font-bold' : 'text-gray-300'}`}> <span className="truncate text-xs w-3/4">{cleanTitle(t.title)}</span> </div> ))} </div> )} </div>
					)}
				</div>
			)}

			{/* Reste de l'interface inchangée */}
			<nav className="fixed top-0 w-full z-40 bg-gradient-to-b from-black/90 to-transparent p-6"> <div className="max-w-7xl mx-auto flex items-center justify-between"> <div className="flex items-center gap-2 text-red-600 font-bold text-3xl tracking-tighter cursor-pointer" onClick={() => window.location.reload()}> <Film size={32}/> <span>RUSTFLIX</span> </div> </div> </nav> <div className="relative w-full h-[50vh] flex flex-col items-center justify-center bg-[url('https://images.unsplash.com/photo-1574267432553-4b4628081c31?ixlib=rb-1.2.1&auto=format&fit=crop&w=1950&q=80')] bg-cover bg-center"> <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div> <div className="relative z-10 w-full max-w-2xl px-4 text-center"> <h1 className="text-4xl md:text-6xl font-extrabold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500"> Le Cinéma, Compilé en Rust. </h1> <form onSubmit={searchMovies} className="relative group"> <input type="text" className="w-full bg-black/50 border-2 border-gray-700 rounded-full py-4 pl-12 pr-4 text-xl text-white focus:outline-none focus:border-red-600 transition-all backdrop-blur-md shadow-xl" placeholder="Rechercher..." value={query} onChange={(e) => setQuery(e.target.value)}/> <button type="submit" className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-red-600 hover:bg-red-700 text-white p-2 rounded-full transition-all"> {loading ? <Loader className="animate-spin"/> : <Search/>} </button> </form> </div> </div> <div className="max-w-7xl mx-auto px-6 py-12"> {error && <div className="text-red-500 mb-4">{error}</div>} <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6"> {movies.map((movie) => ( <div key={movie.id} className="group relative bg-gray-800 rounded-xl overflow-hidden shadow-lg hover:scale-105 transition-transform duration-300"> <div className="aspect-[2/3] w-full overflow-hidden bg-gray-900 relative"> {movie.poster_path ? ( <img src={movie.poster_path} className="w-full h-full object-cover"/> ) : <div className="w-full h-full flex items-center justify-center bg-gray-800">No Image</div>} <div className="absolute inset-0 bg-black/90 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 p-4"> <button onClick={() => handleStream(movie, 'fr')} disabled={downloading?.id === movie.id} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-full flex items-center justify-center gap-2"> {downloading?.id === movie.id && downloading?.lang === 'fr' ? <Loader className="animate-spin"/> : <Globe size={16}/>} FR </button> <button onClick={() => handleStream(movie, 'en')} disabled={downloading?.id === movie.id} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-full flex items-center justify-center gap-2"> {downloading?.id === movie.id && downloading?.lang === 'en' ? <Loader className="animate-spin"/> : <Globe size={16}/>} EN </button> </div> </div> <div className="p-4"> <h3 className="font-bold text-sm truncate">{movie.title || movie.name}</h3> </div> </div> ))} </div> </div>
		</div>
	);
}