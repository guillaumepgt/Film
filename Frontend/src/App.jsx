import React, { useState } from 'react';
import { Search, Play, Loader, Film, Tv, CheckCircle, AlertCircle, Globe, List, Download, Copy, ExternalLink } from 'lucide-react';

export default function App() {
	const [query, setQuery] = useState('');
	const [movies, setMovies] = useState([]);
	const [loading, setLoading] = useState(false);
	const [downloading, setDownloading] = useState(null);
	const [streamReady, setStreamReady] = useState(null);
	const [torrentResults, setTorrentResults] = useState([]);
	const [activeTorrent, setActiveTorrent] = useState(null);
	const [error, setError] = useState(null);
	const [copied, setCopied] = useState(false);

	// --- FONCTION DE NETTOYAGE PARTAGÉE ---
	// Garde uniquement : Lettres (avec accents), Chiffres, Espaces.
	// Supprime : Points, tirets, underscores, crochets, etc.
	const cleanTitle = (text) => {
		if (!text) return '';
		return text
			.replace(/[^a-zA-Z0-9\s\u00C0-\u017F]/g, ' ') // Remplace ponctuation par espace
			.replace(/\s+/g, ' ') // Fusionne les espaces multiples
			.trim();
	};

	// Recherche visuelle via TMDB
	const searchMovies = async (e) => {
		e.preventDefault();
		if (!query.trim()) return;

		setLoading(true);
		setError(null);
		setMovies([]);
		setStreamReady(null);
		setTorrentResults([]);
		setActiveTorrent(null);

		try {
			const res = await fetch(`/api/search_tmdb?query=${encodeURIComponent(query)}`);
			if (!res.ok) throw new Error("Erreur lors de la recherche TMDB");
			const data = await res.json();
			setMovies(data);
		} catch (err) {
			setError("Impossible de contacter le serveur.");
			console.error(err);
		} finally {
			setLoading(false);
		}
	};

	// Lance le téléchargement selon la langue choisie
	const handleStream = async (movie, lang) => {
		// Logique de sélection du titre selon la langue cible
		let titleToSearch;

		if (lang === 'fr') {
			titleToSearch = movie.title || movie.name || movie.original_title || movie.original_name;
		} else {
			titleToSearch = movie.original_title || movie.original_name || movie.title || movie.name;
		}

		// --- 1. NETTOYAGE POUR LA RECHERCHE ---
		if (titleToSearch) {
			titleToSearch = cleanTitle(titleToSearch);
		}

		// Ajout de l'année pour préciser la recherche
		const dateStr = movie.release_date || movie.first_air_date;
		if (dateStr) {
			const year = dateStr.split('-')[0];
			if (year) titleToSearch += ` ${year}`;
		}

		console.log(`Recherche [${lang.toUpperCase()}] pour : "${titleToSearch}"`);

		setDownloading({ id: movie.id, lang: lang });
		setStreamReady(null);
		setTorrentResults([]);
		setActiveTorrent(null);
		setError(null);

		const endpoint = lang === 'fr' ? '/api/search_fr' : '/api/search_en';

		try {
			const res = await fetch(`${endpoint}?query=${encodeURIComponent(titleToSearch)}`);
			const data = await res.json();

			if (data && data.length > 0) {
				const hostname = window.location.hostname;
				setStreamReady(`http://${hostname}:9000`);
				setTorrentResults(data);
				setActiveTorrent(data[0]);
			} else {
				setError(`Aucun torrent trouvé pour "${titleToSearch}" (${lang.toUpperCase()}).`);
			}
		} catch (err) {
			setError("Erreur technique lors du lancement.");
		} finally {
			setDownloading(null);
		}
	};

	// Force le téléchargement d'un autre torrent de la liste
	const forceDownload = async (torrent) => {
		setError(null);
		setActiveTorrent(torrent);

		try {
			await fetch('/api/download', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ magnet: torrent.href })
			});
			const hostname = window.location.hostname;
			setStreamReady(`http://${hostname}:9000`);
		} catch (err) {
			setError("Impossible de changer le torrent.");
		}
	};

	// Copie le lien de stream dans le presse-papier
	const copyToClipboard = () => {
		if (streamReady) {
			navigator.clipboard.writeText(streamReady);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	return (
		<div className="min-h-screen bg-gray-900 text-white font-sans selection:bg-red-500 selection:text-white">
			{/* Navbar */}
			<nav className="fixed top-0 w-full z-50 bg-gradient-to-b from-black/90 to-transparent p-6">
				<div className="max-w-7xl mx-auto flex items-center justify-between">
					<div className="flex items-center gap-2 text-red-600 font-bold text-3xl tracking-tighter cursor-pointer" onClick={() => window.location.reload()}>
						<Film size={32} />
						<span>RUSTFLIX</span>
					</div>
				</div>
			</nav>

			{/* Hero */}
			<div className="relative w-full h-[50vh] flex flex-col items-center justify-center bg-[url('https://images.unsplash.com/photo-1574267432553-4b4628081c31?ixlib=rb-1.2.1&auto=format&fit=crop&w=1950&q=80')] bg-cover bg-center">
				<div className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
				<div className="relative z-10 w-full max-w-2xl px-4 text-center">
					<h1 className="text-4xl md:text-6xl font-extrabold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">
						Le Cinéma, Compilé en Rust.
					</h1>
					<form onSubmit={searchMovies} className="relative group">
						<input
							type="text"
							className="w-full bg-black/50 border-2 border-gray-700 rounded-full py-4 pl-12 pr-4 text-xl text-white focus:outline-none focus:border-red-600 transition-all backdrop-blur-md shadow-xl"
							placeholder="Quel film cherchez-vous aujourd'hui ?"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
						<Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-red-500 transition-colors" />
						<button type="submit" className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-red-600 hover:bg-red-700 text-white p-2 rounded-full transition-all">
							{loading ? <Loader className="animate-spin" /> : <Search />}
						</button>
					</form>
				</div>
			</div>

			{/* Status Messages & Torrent Selection */}
			<div className="max-w-7xl mx-auto px-6 mt-8 space-y-4">
				{error && (
					<div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-xl flex items-center gap-3 animate-pulse">
						<AlertCircle /> {error}
					</div>
				)}

				{streamReady && activeTorrent && (
					<div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500 shadow-2xl">
						{/* Header: Stream Actif */}
						<div className="bg-gray-900/50 p-6 flex flex-col gap-4">
							<div className="flex items-center gap-3 border-b border-gray-700 pb-4">
								<CheckCircle className="w-8 h-8 text-green-500" />
								<div>
									<h3 className="font-bold text-xl text-green-400">Flux prêt !</h3>
									{/* --- 2. NETTOYAGE AFFICHAGE ACTIF --- */}
									<p className="text-sm text-gray-300">
										Fichier : <span className="font-mono text-white">{cleanTitle(activeTorrent.title)}</span>
									</p>
								</div>
							</div>

							{/* Barre d'outils de lecture */}
							<div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-black/40 p-4 rounded-lg">
								<div className="flex-1 text-sm text-gray-400">
									<p>⚠️ Les fichiers <strong>.MKV</strong> ne se lisent pas dans le navigateur.</p>
									<p>Utilisez VLC : <span className="text-white font-mono">Fichier &gt; Ouvrir un flux réseau</span></p>
								</div>

								<div className="flex gap-2">
									{/* Bouton VLC Protocol */}
									<a
										href={`vlc://${streamReady}`}
										className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
									>
										<Play size={18} fill="currentColor" /> Ouvrir VLC
									</a>

									{/* Bouton Copier */}
									<button
										onClick={copyToClipboard}
										className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
									>
										{copied ? <CheckCircle size={18} /> : <Copy size={18} />}
										{copied ? 'Copié !' : 'Copier le lien'}
									</button>

									{/* Bouton Navigateur (Fallback) */}
									<a
										href={streamReady}
										target="_blank"
										rel="noopener noreferrer"
										className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
									>
										<ExternalLink size={18} /> Navigateur
									</a>
								</div>
							</div>
						</div>

						{/* Liste Alternative */}
						{torrentResults.length > 1 && (
							<div className="p-4 bg-gray-900/50 border-t border-gray-700">
								<p className="text-sm text-gray-400 mb-3 flex items-center gap-2">
									<List size={16} /> Autres versions disponibles :
								</p>
								<div className="max-h-60 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-gray-700">
									{torrentResults.map((torrent, idx) => (
										<button
											key={idx}
											onClick={() => forceDownload(torrent)}
											disabled={activeTorrent.href === torrent.href}
											className={`w-full text-left p-3 rounded-lg text-sm flex items-center justify-between transition-colors ${
												activeTorrent.href === torrent.href
													? 'bg-red-500/20 border border-red-500/50 text-white cursor-default'
													: 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white'
											}`}
										>
											{/* --- 3. NETTOYAGE AFFICHAGE LISTE --- */}
											<span className="truncate flex-1 mr-4">{cleanTitle(torrent.title)}</span>
											{activeTorrent.href === torrent.href ? (
												<span className="text-xs bg-red-600 px-2 py-1 rounded text-white font-bold">ACTIF</span>
											) : (
												<Download size={16} />
											)}
										</button>
									))}
								</div>
							</div>
						)}
					</div>
				)}
			</div>

			{/* Results Grid */}
			<div className="max-w-7xl mx-auto px-6 py-12">
				{movies.length > 0 && <h2 className="text-2xl font-bold mb-8 flex items-center gap-2"><Tv /> Résultats trouvés</h2>}

				<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
					{movies.map((movie) => (
						<div key={movie.id} className="group relative bg-gray-800 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl hover:shadow-red-900/20 transition-all duration-300 hover:-translate-y-2">
							<div className="aspect-[2/3] w-full overflow-hidden bg-gray-900 relative">
								{movie.poster_path ? (
									<img
										src={movie.poster_path}
										alt={movie.title}
										className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700"
									/>
								) : (
									<div className="w-full h-full flex items-center justify-center text-gray-600 bg-gray-900">Pas d'image</div>
								)}

								<div className="absolute inset-0 bg-black/90 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-3 p-4 text-center">
									<p className="font-bold text-lg mb-2">Choisir la version</p>

									<button
										onClick={() => handleStream(movie, 'fr')}
										disabled={downloading?.id === movie.id}
										className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-full flex items-center justify-center gap-2 transform transition-all hover:scale-105 disabled:opacity-50"
									>
										{downloading?.id === movie.id && downloading?.lang === 'fr' ? (
											<Loader className="animate-spin w-4 h-4" />
										) : (
											<Globe className="w-4 h-4" />
										)}
										Version FR
									</button>

									<button
										onClick={() => handleStream(movie, 'en')}
										disabled={downloading?.id === movie.id}
										className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-full flex items-center justify-center gap-2 transform transition-all hover:scale-105 disabled:opacity-50"
									>
										{downloading?.id === movie.id && downloading?.lang === 'en' ? (
											<Loader className="animate-spin w-4 h-4" />
										) : (
											<Globe className="w-4 h-4" />
										)}
										Version EN
									</button>
								</div>
							</div>

							<div className="p-4">
								<h3 className="font-bold text-lg truncate" title={movie.title || movie.name}>
									{movie.title || movie.name}
								</h3>
								<div className="flex justify-between items-center mt-2 text-sm text-gray-400">
									<span>{(movie.release_date || movie.first_air_date || '').split('-')[0]}</span>
									<span className="border border-gray-600 px-2 py-0.5 rounded text-xs uppercase">{movie.media_type || 'Film'}</span>
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}