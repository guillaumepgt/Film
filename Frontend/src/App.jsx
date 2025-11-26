import React, { useState, useRef, useEffect } from 'react';
import { Search, Play, Loader, Film, Tv, CheckCircle, AlertCircle, Globe, List, Download, Copy, ExternalLink, X, Maximize, WifiOff, RefreshCw } from 'lucide-react';

export default function App() {
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

	const videoRef = useRef(null);
	const pollingRef = useRef(null);
	// Ref pour accéder à l'état actuel dans le setInterval sans problème de closure
	const torrentsRef = useRef([]);
	const activeTorrentRef = useRef(null);

	// Mise à jour des Refs quand les états changent
	useEffect(() => { torrentsRef.current = torrentResults; }, [torrentResults]);
	useEffect(() => { activeTorrentRef.current = activeTorrent; }, [activeTorrent]);

	const cleanTitle = (text) => {
		if (!text) return '';
		return text.replace(/[^a-zA-Z0-9\s\u00C0-\u017F]/g, ' ').replace(/\s+/g, ' ').trim();
	};

	const waitForStream = (hostname) => {
		setIsStreamReady(false);
		setStreamError(null);

		if (pollingRef.current) clearInterval(pollingRef.current);

		pollingRef.current = setInterval(async () => {
			try {
				const res = await fetch(`http://${hostname}:9000/meta`);
				const data = await res.json();
				console.log("Statut Streamer:", data);

				// --- LOGIQUE DE RETRY AUTOMATIQUE ---
				if (data.status === 'timeout' || data.status === 'no_video') {
					console.log("❌ Échec source actuelle. Tentative suivante...");

					const currentList = torrentsRef.current;
					const currentTorrent = activeTorrentRef.current;

					// Trouver l'index du torrent actuel
					const currentIndex = currentList.findIndex(t => t.href === currentTorrent?.href);

					// S'il reste des torrents après celui-ci
					if (currentIndex !== -1 && currentIndex < currentList.length - 1) {
						const nextTorrent = currentList[currentIndex + 1];

						// Affichage visuel de la tentative
						setStreamError(`Source morte. Essai automatique ${currentIndex + 2}/${currentList.length}...`);

						// On arrête ce polling ci
						clearInterval(pollingRef.current);

						// On lance le suivant
						forceDownload(nextTorrent);
						return;
					} else {
						// Plus de liens disponibles
						setStreamError("Tous les liens ont été testés sans succès.");
						clearInterval(pollingRef.current);
						return;
					}
				}

				if (data.ready) {
					clearInterval(pollingRef.current);
					setStreamUrl(`http://${hostname}:9000/`);
					setIsStreamReady(true);
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

	const handleStream = async (movie, lang) => {
		let titleToSearch = lang === 'fr' ? (movie.title || movie.original_title) : movie.original_title;
		if (titleToSearch) titleToSearch = cleanTitle(titleToSearch);
		const dateStr = movie.release_date || movie.first_air_date;
		if (dateStr) titleToSearch += ` ${dateStr.split('-')[0]}`;

		setDownloading({ id: movie.id, lang: lang });
		setStreamUrl(null);
		setStreamError(null);
		setIsStreamReady(false);

		try {
			const endpoint = lang === 'fr' ? '/api/search_fr' : '/api/search_en';
			const res = await fetch(`${endpoint}?query=${encodeURIComponent(titleToSearch)}`);
			const data = await res.json();
			if (data && data.length > 0) {
				setTorrentResults(data);
				setActiveTorrent(data[0]);
				const hostname = window.location.hostname;
				waitForStream(hostname);
				setStreamUrl("loading");
			} else {
				setError(`Aucun résultat pour "${titleToSearch}"`);
			}
		} catch (err) { setError("Erreur technique"); }
		finally { setDownloading(null); }
	};

	const forceDownload = async (torrent) => {
		setActiveTorrent(torrent);
		setStreamUrl("loading");
		setIsStreamReady(false);
		// On ne reset PAS streamError ici si on est en auto-retry, pour garder le message "Essai 2/5..."
		// Mais on peut afficher un petit loader

		try {
			await fetch('/api/download', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({magnet: torrent.href}) });
			const hostname = window.location.hostname;
			waitForStream(hostname);
		} catch (err) { setError("Erreur changement torrent"); }
	};

	return (
		<div className="min-h-screen bg-gray-900 text-white font-sans">
			{/* --- OVERLAY PLAYER --- */}
			{streamUrl && activeTorrent && (
				<div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center animate-in fade-in duration-300">
					<div className="absolute top-0 w-full p-4 flex justify-between items-center bg-gradient-to-b from-black to-transparent z-50">
						<div className="flex items-center gap-4">
							<button onClick={() => { setStreamUrl(null); if(pollingRef.current) clearInterval(pollingRef.current); }} className="p-2 hover:bg-white/20 rounded-full transition">
								<X size={32} />
							</button>
							<div>
								<h2 className="font-bold text-xl">{cleanTitle(activeTorrent.title)}</h2>
								{streamError ? (
									<span className="text-sm text-orange-400 flex items-center gap-1 animate-pulse"><RefreshCw size={14} className="animate-spin"/> {streamError}</span>
								) : isStreamReady ? (
									<span className="text-sm text-green-400 flex items-center gap-1"><CheckCircle size={14}/> Lecture prête</span>
								) : (
									<span className="text-sm text-yellow-400 flex items-center gap-1"><Loader className="animate-spin" size={14}/> Recherche de sources...</span>
								)}
							</div>
						</div>
					</div>

					<div className="w-full max-w-6xl aspect-video bg-black shadow-2xl relative group flex items-center justify-center">
						{streamError && !streamError.startsWith("Source morte") && !streamError.startsWith("Aucun") ? (
							/* Erreur Finale */
							<div className="text-center space-y-4 p-8 bg-red-900/20 rounded-xl border border-red-500/50">
								<WifiOff className="w-16 h-16 text-red-500 mx-auto" />
								<h3 className="text-xl font-bold text-red-400">Échec Streaming</h3>
								<p className="text-gray-300">{streamError}</p>
							</div>
						) : !isStreamReady ? (
							/* Chargement / Retry en cours */
							<div className="text-center space-y-4">
								<Loader className="w-16 h-16 text-red-600 animate-spin mx-auto" />
								<p className="text-xl font-bold">Chargement du flux...</p>
								<p className="text-gray-400">
									{streamError || "Connexion aux pairs (Peers)..."}
								</p>
							</div>
						) : (
							/* VIDEO */
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
								<p className="text-xs text-gray-400 mb-2 uppercase font-bold tracking-wider">Liste des sources</p>
								{torrentResults.map((t, idx) => (
									<div key={idx}
											 onClick={() => forceDownload(t)}
											 className={`flex justify-between items-center p-2 rounded cursor-pointer hover:bg-white/10 ${t.href === activeTorrent.href ? 'text-red-500 font-bold' : 'text-gray-300'}`}>
										<span className="truncate text-sm w-3/4">{cleanTitle(t.title)}</span>
										{t.href === activeTorrent.href && <span className="text-xs border border-red-500 px-2 rounded">En cours</span>}
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			)}

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