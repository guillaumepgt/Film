import React, { useState, useRef, useEffect } from 'react';
import { Search, Play, Loader, Film, Tv, CheckCircle, AlertCircle, Globe, List, Download, Copy, ExternalLink, X, Maximize, WifiOff, RefreshCw, SkipForward, ArrowRightLeft } from 'lucide-react';

export default function App() {
	const [query, setQuery] = useState('');
	const [movies, setMovies] = useState([]);
	const [loading, setLoading] = useState(false);
	const [downloading, setDownloading] = useState(null); // { id: 123, lang: 'fr' }

	const [streamUrl, setStreamUrl] = useState(null);
	const [isStreamReady, setIsStreamReady] = useState(false);
	const [torrentResults, setTorrentResults] = useState([]);
	const [activeTorrent, setActiveTorrent] = useState(null);
	const [error, setError] = useState(null);
	const [streamError, setStreamError] = useState(null);

	// Nouveaux états pour la gestion de la qualité (Défaut : Bluray)
	const [searchQuality, setSearchQuality] = useState('Bluray');
	const [currentMovie, setCurrentMovie] = useState(null);
	const [currentLang, setCurrentLang] = useState(null);

	const videoRef = useRef(null);
	const pollingRef = useRef(null);

	// Refs pour accéder aux états frais dans les callbacks asynchrones
	const torrentsRef = useRef([]);
	const activeTorrentRef = useRef(null);
	const qualityRef = useRef('Bluray');
	const movieRef = useRef(null);
	const langRef = useRef(null);

	// Synchronisation des Refs
	useEffect(() => { torrentsRef.current = torrentResults; }, [torrentResults]);
	useEffect(() => { activeTorrentRef.current = activeTorrent; }, [activeTorrent]);
	useEffect(() => { qualityRef.current = searchQuality; }, [searchQuality]);
	useEffect(() => { movieRef.current = currentMovie; }, [currentMovie]);
	useEffect(() => { langRef.current = currentLang; }, [currentLang]);

	const cleanTitle = (text) => {
		if (!text) return '';
		return text.replace(/[^a-zA-Z0-9\s\u00C0-\u017F]/g, ' ').replace(/\s+/g, ' ').trim();
	};

	const waitForStream = () => {
		setIsStreamReady(false);

		if (pollingRef.current) clearInterval(pollingRef.current);

		pollingRef.current = setInterval(async () => {
			try {
				const res = await fetch(`/api/stream/meta`);
				const data = await res.json();

				console.log("Statut Streamer:", data);

				// --- LOGIQUE DE RETRY & FALLBACK QUALITÉ ---
				if (data.status === 'timeout' || data.status === 'no_video' || data.status === 'stalled') {
					const cause = data.status === 'stalled' ? "bloquée (0 KB/s)" : "morte";
					console.log(`❌ Source ${cause}.`);

					const currentList = torrentsRef.current;
					const currentTorrent = activeTorrentRef.current;
					const currentIndex = currentList.findIndex(t => t.href === currentTorrent?.href);

					// 1. Essayer le lien suivant dans la liste actuelle
					if (currentIndex !== -1 && currentIndex < currentList.length - 1) {
						const nextTorrent = currentList[currentIndex + 1];
						const nextIndex = currentIndex + 2;
						setStreamError(`Source ${currentIndex + 1} ${cause}. Essai source ${nextIndex}/${currentList.length} (${qualityRef.current})...`);

						clearInterval(pollingRef.current);
						setTimeout(() => forceDownload(nextTorrent, true), 1000);
						return;
					}
					// 2. CASCADE DE QUALITÉ (Bluray -> 1080p -> 720p)
					else if (qualityRef.current === 'Bluray') {
						setStreamError("Sources Bluray épuisées. Tentative en 1080p...");
						console.log("⚠️ Fallback 1080p activé");
						clearInterval(pollingRef.current);
						setTimeout(() => {
							launchSearch(movieRef.current, langRef.current, '1080p');
						}, 1500);
						return;
					}
					else if (qualityRef.current === '1080p') {
						setStreamError("Sources 1080p épuisées. Tentative en 720p...");
						console.log("⚠️ Fallback 720p activé");
						clearInterval(pollingRef.current);
						setTimeout(() => {
							launchSearch(movieRef.current, langRef.current, '720p');
						}, 1500);
						return;
					}
					// 3. Echec total
					else {
						setStreamError("Échec : Aucune source valide trouvée (Bluray, 1080p & 720p).");
						clearInterval(pollingRef.current);
						return;
					}
				}

				if (data.ready) {
					// IMPORTANT : On ne clear PAS l'intervalle ici pour continuer à détecter les stalls
					if (!isStreamReady) {
						setStreamUrl(`/api/stream/video`);
						setIsStreamReady(true);
						setStreamError(null);
					}
				}
			} catch (err) {
				console.log("Attente du démarrage du conteneur...");
			}
		}, 2000);
	};

	useEffect(() => {
		return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
	}, []);

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

	// --- NOUVELLE FONCTION DE RECHERCHE UNIFIÉE ---
	const launchSearch = async (movie, lang, quality) => {
		// Mise à jour des états globaux pour le fallback
		setCurrentMovie(movie);
		setCurrentLang(lang);
		setSearchQuality(quality);

		// Construction du titre : Titre + Année + Qualité
		let titleToSearch = lang === 'fr' ? (movie.title || movie.original_title) : movie.original_title;
		if (titleToSearch) titleToSearch = cleanTitle(titleToSearch);

		// --- CORRECTION ICI : NETTOYAGE PRÉVENTIF ---
		// On enlève toute mention de qualité qui pourrait traîner dans le titre de base
		titleToSearch = titleToSearch.replace(/(1080p|720p|4k|hdlight|bluray)/gi, '').trim();

		const dateStr = movie.release_date || movie.first_air_date;
		if (dateStr) titleToSearch += ` ${dateStr.split('-')[0]}`;

		// Ajout explicite de la qualité pour guider le scraper
		titleToSearch += ` ${quality}`;

		console.log(`🔎 Recherche [${lang.toUpperCase()}] [${quality}] : "${titleToSearch}"`);

		// Reset UI pour une nouvelle recherche
		setStreamUrl(null);
		setStreamError(null);
		setIsStreamReady(false);

		// Si c'est un fallback (déjà en cours de download), on met à jour le message
		if (downloading) {
			setStreamError(`Recherche de nouvelles sources en ${quality}...`);
		} else {
			setDownloading({ id: movie.id, lang: lang });
		}

		try {
			const endpoint = lang === 'fr' ? '/api/search_fr' : '/api/search_en';
			const res = await fetch(`${endpoint}?query=${encodeURIComponent(titleToSearch)}`);
			const data = await res.json();

			if (data && data.length > 0) {
				setTorrentResults(data);
				setActiveTorrent(data[0]);
				setStreamUrl("loading");
				// On lance la surveillance
				const hostname = window.location.hostname;
				waitForStream(hostname);
			} else {
				// Aucun résultat trouvé pour cette qualité
				if (quality === 'Bluray') {
					console.log("⚠️ Aucun Bluray trouvé. Essai immédiat en 1080p...");
					launchSearch(movie, lang, '1080p'); // Récursion immédiate
				} else if (quality === '1080p') {
					console.log("⚠️ Aucun 1080p trouvé. Essai immédiat en 720p...");
					launchSearch(movie, lang, '720p'); // Récursion immédiate
				} else {
					setError(`Aucun torrent trouvé (ni Bluray, ni 1080p, ni 720p) pour "${titleToSearch}"`);
					setDownloading(null);
				}
			}
		} catch (err) {
			setError("Erreur technique lors de la recherche");
			setDownloading(null);
		}
	};

	const handleStream = (movie, lang) => {
		// Démarrage par défaut en Bluray
		launchSearch(movie, lang, 'Bluray');
	};

	const forceDownload = async (torrent, isAutoRetry = false) => {
		setActiveTorrent(torrent);
		setStreamUrl("loading");
		setIsStreamReady(false);

		if (!isAutoRetry) {
			setStreamError(null);
		}

		try {
			await fetch('/api/download', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({magnet: torrent.href}) });
			waitForStream();
		} catch (err) { setError("Erreur changement torrent"); }
	};

	return (
		<div className="min-h-screen bg-gray-900 text-white font-sans">
			{/* --- OVERLAY PLAYER --- */}
			{streamUrl && activeTorrent && (
				<div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center animate-in fade-in duration-300">
					<div className="absolute top-0 w-full p-4 flex justify-between items-center bg-gradient-to-b from-black to-transparent z-50">
						<div className="flex items-center gap-4">
							<button onClick={() => { setStreamUrl(null); if(pollingRef.current) clearInterval(pollingRef.current); setDownloading(null); }} className="p-2 hover:bg-white/20 rounded-full transition">
								<X size={32} />
							</button>
							<div>
								<div className="flex items-center gap-2">
									<h2 className="font-bold text-xl">{cleanTitle(activeTorrent.title)}</h2>
									<span className="text-xs bg-gray-700 px-2 py-0.5 rounded text-gray-300 border border-gray-600">{searchQuality}</span>
								</div>

								{streamError ? (
									<span className="text-sm text-orange-400 flex items-center gap-1 animate-pulse">
                                {streamError.includes("720p") ? <ArrowRightLeft size={14}/> : <SkipForward size={14} />}
										{streamError}
                            </span>
								) : isStreamReady ? (
									<span className="text-sm text-green-400 flex items-center gap-1"><CheckCircle size={14}/> Lecture prête</span>
								) : (
									<span className="text-sm text-yellow-400 flex items-center gap-1"><Loader className="animate-spin" size={14}/> Recherche de sources...</span>
								)}
							</div>
						</div>
					</div>

					<div className="w-full max-w-6xl aspect-video bg-black shadow-2xl relative group flex items-center justify-center">
						{streamError && streamError.startsWith("Échec") ? (
							<div className="text-center space-y-4 p-8 bg-red-900/20 rounded-xl border border-red-500/50">
								<WifiOff className="w-16 h-16 text-red-500 mx-auto" />
								<h3 className="text-xl font-bold text-red-400">Aucun lien valide</h3>
								<p className="text-gray-300">Impossible de lire ce film en Bluray, 1080p ou 720p.</p>
								<button onClick={() => setStreamUrl(null)} className="mt-4 px-6 py-2 bg-red-600 rounded-lg hover:bg-red-700">Fermer</button>
							</div>
						) : !isStreamReady ? (
							<div className="text-center space-y-4">
								{streamError ? <RefreshCw className="w-16 h-16 text-orange-500 animate-spin mx-auto" /> : <Loader className="w-16 h-16 text-red-600 animate-spin mx-auto" />}
								<p className="text-xl font-bold">
									{streamError ? "Changement de source..." : "Préparation du film..."}
								</p>
								<p className="text-gray-400">
									{streamError || "Connexion aux pairs en cours..."}
								</p>
							</div>
						) : (
							<video
								ref={videoRef}
								className="w-full h-full"
								controls
								autoPlay
								src={`${streamUrl}?t=${Date.now()}`}
								onError={(e) => console.log("Erreur video", e)}
							>
								Votre navigateur ne supporte pas la lecture vidéo.
							</video>
						)}
					</div>

					<div className="absolute bottom-10 w-full max-w-4xl px-4 z-50">
						{torrentResults.length > 1 && (
							<div className="bg-gray-900/80 backdrop-blur rounded-xl p-4 border border-gray-700 max-h-40 overflow-y-auto">
								<p className="text-xs text-gray-400 mb-2 uppercase font-bold tracking-wider">
									Sources trouvées ({searchQuality})
								</p>
								{torrentResults.map((t, idx) => (
									<div key={idx}
											 onClick={() => forceDownload(t)}
											 className={`flex justify-between items-center p-2 rounded cursor-pointer hover:bg-white/10 ${t.href === activeTorrent.href ? 'bg-white/5 border-l-4 border-red-500' : 'text-gray-300'}`}>
                            <span className={`truncate text-sm w-3/4 ${t.href === activeTorrent.href ? 'text-white font-bold' : ''}`}>
                                {cleanTitle(t.title)}
                            </span>
										{t.href === activeTorrent.href && (
											<span className="text-xs bg-red-600 text-white px-2 py-1 rounded flex items-center gap-1">
                                    {streamError ? <Loader size={10} className="animate-spin"/> : <Play size={10}/>}
												{streamError ? 'Test...' : 'Actif'}
                                </span>
										)}
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			)}

			{/* RESTE DE L'INTERFACE (Navbar, Recherche, Grille) */}
			<nav className="fixed top-0 w-full z-40 bg-gradient-to-b from-black/90 to-transparent p-6">
				<div className="max-w-7xl mx-auto flex items-center justify-between">
					<div className="flex items-center gap-2 text-red-600 font-bold text-3xl tracking-tighter cursor-pointer" onClick={() => window.location.reload()}>
						<Film size={32} />
						<span>RUSTFLIX</span>
					</div>
				</div>
			</nav>

			<div className="relative w-full h-[50vh] flex flex-col items-center justify-center bg-[url('https://images.unsplash.com/photo-1574267432553-4b4628081c31?ixlib=rb-1.2.1&auto=format&fit=crop&w=1950&q=80')] bg-cover bg-center">
				<div className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
				<div className="relative z-10 w-full max-w-2xl px-4 text-center">
					<h1 className="text-4xl md:text-6xl font-extrabold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">
						Le Cinéma, Compilé en Rust.
					</h1>
					<form onSubmit={searchMovies} className="relative group">
						<input type="text" className="w-full bg-black/50 border-2 border-gray-700 rounded-full py-4 pl-12 pr-4 text-xl text-white focus:outline-none focus:border-red-600 transition-all backdrop-blur-md shadow-xl" placeholder="Rechercher..." value={query} onChange={(e) => setQuery(e.target.value)} />
						<button type="submit" className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-red-600 hover:bg-red-700 text-white p-2 rounded-full transition-all">
							{loading ? <Loader className="animate-spin" /> : <Search />}
						</button>
					</form>
				</div>
			</div>

			<div className="max-w-7xl mx-auto px-6 py-12">
				{error && <div className="text-red-500 mb-4">{error}</div>}
				<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
					{movies.map((movie) => (
						<div key={movie.id} className="group relative bg-gray-800 rounded-xl overflow-hidden shadow-lg hover:scale-105 transition-transform duration-300">
							<div className="aspect-[2/3] w-full overflow-hidden bg-gray-900 relative">
								{movie.poster_path ? (
									<img src={movie.poster_path} className="w-full h-full object-cover" />
								) : <div className="w-full h-full flex items-center justify-center bg-gray-800">No Image</div>}

								<div className="absolute inset-0 bg-black/90 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 p-4">
									<button onClick={() => handleStream(movie, 'fr')} disabled={downloading?.id === movie.id} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-full flex items-center justify-center gap-2">
										{downloading?.id === movie.id && downloading?.lang === 'fr' ? <Loader className="animate-spin" /> : <Globe size={16}/>} FR
									</button>
									<button onClick={() => handleStream(movie, 'en')} disabled={downloading?.id === movie.id} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-full flex items-center justify-center gap-2">
										{downloading?.id === movie.id && downloading?.lang === 'en' ? <Loader className="animate-spin" /> : <Globe size={16}/>} EN
									</button>
								</div>
							</div>
							<div className="p-4">
								<h3 className="font-bold text-sm truncate">{movie.title || movie.name}</h3>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}