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
	verify: false,
	connections: 100,
	uploads: 0
});

let videoFile = null;
let engineStatus = 'searching';
let videoCodecInfo = 'unknown'; // Nouveau : Stocke le codec détecté (h264, hevc...)
let progressInterval = null;

// --- TIMEOUT RAPIDE ---
const SEARCH_TIMEOUT = 25000;

const timeoutTimer = setTimeout(() => {
	if (engineStatus === 'searching') {
		console.error(`❌ Timeout : Aucune source trouvée après ${SEARCH_TIMEOUT/1000}s.`);
		engineStatus = 'timeout';
		engine.destroy(() => console.log('Moteur arrêté (Timeout).'));
	}
}, SEARCH_TIMEOUT);

engine.on('ready', () => {
	clearTimeout(timeoutTimer);
	console.log('✅ Torrent Engine Ready');

	engine.files.forEach((file) => {
		if (file.name.endsWith('.mp4') || file.name.endsWith('.mkv') || file.name.endsWith('.avi')) {
			console.log('Fichier candidat:', file.name);
			if (!videoFile || file.length > videoFile.length) {
				videoFile = file;
			}
		}
	});

	if (videoFile) {
		console.log(`🎬 Fichier vidéo sélectionné : ${videoFile.name}`);

		// --- ANALYSE DU CODEC (FFPROBE) ---
		// On lance une analyse rapide pour savoir si c'est du H265 ou H264 10bit
		// Cela permet au Frontend d'avertir l'utilisateur
		ffmpeg.ffprobe(videoFile.createReadStream(), (err, metadata) => {
			if (!err && metadata && metadata.streams) {
				const videoStream = metadata.streams.find(s => s.codec_type === 'video');
				if (videoStream) {
					videoCodecInfo = videoStream.codec_name; // ex: 'h264', 'hevc' (h265)
					// Détection 10-bit (pix_fmt: yuv420p10le)
					if (videoStream.pix_fmt && videoStream.pix_fmt.includes('10le')) {
						videoCodecInfo += ' (10-bit)';
					}
					console.log(`🔍 Codec détecté : ${videoCodecInfo}`);
				}
			}
			// On marque le moteur comme prêt après l'analyse (même si elle échoue)
			engineStatus = 'ready';
			videoFile.select();
		});

		// Logs de progression
		clearInterval(progressInterval);
		progressInterval = setInterval(() => {
			const speed = (engine.swarm.downloadSpeed() / 1024).toFixed(0);
			const downloaded = (engine.swarm.downloaded / 1024 / 1024).toFixed(1);
			const peers = engine.swarm.wires.length;
			console.log(`⬇️  Vitesse: ${speed} KB/s | Session: ${downloaded} MB | Peers: ${peers}`);
		}, 2000);

	} else {
		console.error('❌ Erreur : Pas de fichier vidéo dans ce torrent.');
		engineStatus = 'no_video';
		engine.destroy();
	}
});

app.get('/', (req, res) => {
	if (engineStatus === 'timeout') return res.status(408).send('Erreur : Torrent mort (0 Seeds).');
	if (engineStatus === 'no_video') return res.status(404).send('Erreur : Pas de vidéo trouvée.');

	if (!videoFile) {
		return res.status(503).send('Vidéo en cours de recherche...');
	}

	console.log("🔥 Nouvelle connexion client. Mode REMUX (Low CPU)...");
	const stream = videoFile.createReadStream();

	res.writeHead(200, {
		'Content-Type': 'video/mp4',
		'Access-Control-Allow-Origin': '*',
		'Connection': 'keep-alive'
	});

	let command = ffmpeg(stream)
		.videoCodec('copy')
		.audioCodec('aac')
		.audioBitrate(128)
		.audioChannels(2)
		.outputOptions([
			'-movflags frag_keyframe+empty_moov',
			'-preset ultrafast',
			'-tune zerolatency'
		])
		.format('mp4')
		.on('start', (cmd) => console.log('Start FFmpeg:', cmd))
		.on('error', (err) => {
			if (!err.message.includes('Output stream closed')) {
				console.error('Erreur FFmpeg:', err.message);
			}
		})
		.on('end', () => console.log('Fin du stream.'));

	command.pipe(res, { end: true });
});

app.get('/meta', (req, res) => {
	let message = "Recherche en cours...";
	if (engineStatus === 'timeout') message = "Torrent Mort (0 Seeds)";
	if (engineStatus === 'no_video') message = "Aucun fichier vidéo";
	if (videoFile) message = videoFile.name;

	res.json({
		ready: engineStatus === 'ready', // On attend que le probe soit fini
		status: engineStatus,
		filename: message,
		codec: videoCodecInfo // On envoie l'info au frontend
	});
});

app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}`);
});