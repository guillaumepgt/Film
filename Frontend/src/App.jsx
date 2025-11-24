import React, { useState } from 'react';
import { Search, Play, Download, Loader, Film, Tv, Info, CheckCircle, AlertCircle } from 'lucide-react';

export default function App() {
	const [query, setQuery] = useState('');
	const [movies, setMovies] = useState([]);
	const [loading, setLoading] = useState(false);
	const [downloading, setDownloading] = useState(null);
	const [streamReady, setStreamReady] = useState(null);
	const [error, setError] = useState(null);

	const searchMovies = async (e) => {
		e.preventDefault();
		if (!query.trim()) return;

		setLoading(true);
		setError(null);
		setMovies([]);
		setStreamReady(null);

		try {
			// On passe par le proxy Nginx /api/ qui redirige vers le backend Rust
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

	// Lance le téléchargement via le scraping (Ton endpoint /search_en)
	// Rappel: Ton backend a été modifié pour lancer le docker automatiquement sur /search_en
	const handleStream = async (movie) => {
		const titleToSearch = movie.original_title || movie.title || movie.name;
		setDownloading(movie.id);
		setStreamReady(null);
		setError(null);

		try {
			// On cherche le film en EN/VOSTFR sur PirateBay via ton backend
			const res = await fetch(`/api/search_en?query=${encodeURIComponent(titleToSearch)}`);
			const data = await res.json();

			if (data && data.length > 0) {
				// Si le backend renvoie des données, c'est qu'il a lancé le docker (selon ta logique backend)
				const hostname = window.location.hostname;
				setStreamReady(`http://${hostname}:9000`);
			} else {
				setError("Aucun torrent trouvé pour ce film.");
			}
		} catch (err) {
			setError("Erreur lors du lancement du stream.");
		} finally {
			setDownloading(null);
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

			{/* Hero / Search Section */}
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

			{/* Status Messages */}
			<div className="max-w-7xl mx-auto px-6 mt-8">
				{error && (
					<div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-xl flex items-center gap-3 animate-pulse">
						<AlertCircle /> {error}
					</div>
				)}

				{streamReady && (
					<div className="bg-green-500/10 border border-green-500 text-green-400 p-6 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
						<div className="flex items-center gap-3">
							<CheckCircle className="w-8 h-8" />
							<div>
								<h3 className="font-bold text-lg">Prêt à diffuser !</h3>
								<p className="text-sm opacity-80">Le conteneur de streaming est actif.</p>
							</div>
						</div>
						<a
							href={streamReady}
							target="_blank"
							rel="noopener noreferrer"
							className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-6 rounded-lg flex items-center gap-2 transition-transform hover:scale-105 shadow-lg shadow-green-900/20"
						>
							<Play fill="currentColor" /> Ouvrir le Player (Port 9000)
						</a>
					</div>
				)}
			</div>

			{/* Results Grid */}
			<div className="max-w-7xl mx-auto px-6 py-12">
				{movies.length > 0 && <h2 className="text-2xl font-bold mb-8 flex items-center gap-2"><Tv /> Résultats trouvés</h2>}

				<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
					{movies.map((movie) => (
						<div key={movie.id} className="group relative bg-gray-800 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl hover:shadow-red-900/20 transition-all duration-300 hover:-translate-y-2">
							{/* Poster Image */}
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

								{/* Overlay au survol */}
								<div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-4 p-4 text-center">
									<button
										onClick={() => handleStream(movie)}
										disabled={downloading === movie.id}
										className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-full flex items-center gap-2 transform transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed w-full justify-center"
									>
										{downloading === movie.id ? (
											<Loader className="animate-spin w-5 h-5" />
										) : (
											<Download className="w-5 h-5" />
										)}
										{downloading === movie.id ? 'Recherche...' : 'Lancer le Stream'}
									</button>
									<p className="text-xs text-gray-400 mt-2">Cherche un torrent & lance Docker</p>
								</div>
							</div>

							{/* Movie Info */}
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