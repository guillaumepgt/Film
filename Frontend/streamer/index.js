const express = require('express');
const torrentStream = require('torrent-stream');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');

const app = express();
app.use(cors());

const magnetLink = process.env.MAGNET;
const PORT = 9000;

if (!magnetLink) {
	console.error("❌ Erreur : Pas de lien MAGNET fourni.");
	process.exit(1);
}

console.log(`🚀 Démarrage du moteur pour : ${magnetLink}`);

const engine = torrentStream(magnetLink, {
	path: '/downloads',
	verify: false
});

let videoFile = null;

engine.on('ready', () => {
	console.log('✅ Torrent Engine Ready');
	engine.files.forEach((file) => {
		// On cherche les extensions vidéo courantes
		if (file.name.endsWith('.mp4') || file.name.endsWith('.mkv') || file.name.endsWith('.avi')) {
			console.log('Fichier candidat:', file.name);
			if (!videoFile || file.length > videoFile.length) {
				videoFile = file;
			}
		}
	});

	if (videoFile) {
		console.log(`🎬 Fichier vidéo sélectionné : ${videoFile.name}`);
		videoFile.select();
	}
});

app.get('/', (req, res) => {
	if (!videoFile) {
		// Si le fichier n'est pas encore trouvé, on renvoie une erreur temporaire
		// Le frontend (React) devrait gérer cela et réessayer
		return res.status(503).send('Vidéo en cours de recherche...');
	}

	console.log("🔥 Nouvelle connexion client. Démarrage transcodage...");

	const stream = videoFile.createReadStream();

	res.writeHead(200, {
		'Content-Type': 'video/mp4',
		'Access-Control-Allow-Origin': '*',
		'Connection': 'keep-alive'
	});

	ffmpeg(stream)
		// TRANSCODAGE FORCE : On ne copie PAS la vidéo, on la convertit en H.264
		.videoCodec('libx264')
		.audioCodec('aac')
		.audioBitrate(128)
		// Options critiques pour le streaming web
		.outputOptions([
			'-movflags frag_keyframe+empty_moov', // Fragmenter le MP4
			'-preset ultrafast', // Priorité vitesse (moins de CPU)
			'-tune zerolatency', // Streaming temps réel
			'-pix_fmt yuv420p',  // INDISPENSABLE pour la compatibilité Chrome/Firefox
			'-crf 28'            // Qualité un peu plus basse pour soulager le CPU
		])
		.format('mp4')
		// Gestion des erreurs
		.on('start', (cmd) => {
			console.log('Start FFmpeg:', cmd);
		})
		.on('error', (err) => {
			if (!err.message.includes('Output stream closed')) {
				console.error('Erreur FFmpeg:', err.message);
			}
		})
		.on('end', () => {
			console.log('Fin du stream.');
		})
		.pipe(res, { end: true });
});

app.get('/meta', (req, res) => {
	res.json({
		ready: !!videoFile,
		filename: videoFile ? videoFile.name : "Recherche..."
	});
});

app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}`);
});