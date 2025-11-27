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
let progressInterval = null;
let selectionTime = 0;
// Liste des clients connectés (navigateurs en train de lire)
let activeResponses = [];

// --- TIMEOUTS ---
const SEARCH_TIMEOUT = 20000;
const STALL_TIMEOUT = 12000;

const timeoutTimer = setTimeout(() => {
	if (engineStatus === 'searching') {
		console.error(`❌ Timeout Recherche : Rien trouvé après ${SEARCH_TIMEOUT/1000}s.`);
		engineStatus = 'timeout';
		engine.destroy();
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
		engineStatus = 'ready';
		selectionTime = Date.now();
		videoFile.select();

		// --- MONITORING ---
		clearInterval(progressInterval);
		progressInterval = setInterval(() => {
			const speed = (engine.swarm.downloadSpeed() / 1024).toFixed(0);
			const downloaded = (engine.swarm.downloaded / 1024 / 1024).toFixed(1);
			const peers = engine.swarm.wires.length;

			console.log(`⬇️  Vitesse: ${speed} KB/s | Session: ${downloaded} MB | Peers: ${peers}`);

			// RÈGLE D'ABANDON (STALL)
			const duration = Date.now() - selectionTime;

			if (engine.swarm.downloaded < 100 * 1024 && duration > STALL_TIMEOUT) {
				console.error(`❌ STALL DÉTECTÉ : 0 data après ${STALL_TIMEOUT/1000}s. On passe au suivant.`);
				engineStatus = 'stalled';
				clearInterval(progressInterval);

				// NOUVEAU : On coupe toutes les connexions vidéo actives pour forcer l'erreur côté client
				activeResponses.forEach(res => {
					try { res.end(); } catch(e) {}
				});
				activeResponses = [];

				engine.destroy();
			}

		}, 1000);

	} else {
		console.error('❌ Erreur : Pas de fichier vidéo dans ce torrent.');
		engineStatus = 'no_video';
		engine.destroy();
	}
});

app.get('/', (req, res) => {
	// Enregistrement du client
	activeResponses.push(res);
	res.on('close', () => {
		activeResponses = activeResponses.filter(r => r !== res);
	});

	if (engineStatus === 'timeout') return res.status(408).send('Erreur : Torrent mort (Metadata).');
	if (engineStatus === 'stalled') return res.status(408).send('Erreur : Torrent bloqué (0 Seeds).');
	if (engineStatus === 'no_video') return res.status(404).send('Erreur : Pas de vidéo.');

	if (!videoFile) return res.status(503).send('Initialisation...');

	console.log("🔥 Connexion client. Mode REMUX (Low CPU)...");

	if (engineStatus === 'stalled') {
		return res.status(408).send('Flux coupé (Stalled).');
	}

	const stream = videoFile.createReadStream();

	res.writeHead(200, {
		'Content-Type': 'video/mp4',
		'Access-Control-Allow-Origin': '*',
		'Connection': 'keep-alive'
	});

	ffmpeg(stream)
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
		.on('error', (err) => {
			if(!err.message.includes('Output stream')) console.error('FFmpeg Err:', err.message);
		})
		.pipe(res, { end: true });
});

app.get('/meta', (req, res) => {
	let message = "Recherche...";
	if (engineStatus === 'timeout') message = "Mort (Timeout)";
	if (engineStatus === 'stalled') message = "Bloqué (0 KB/s)";
	if (videoFile) message = videoFile.name;

	res.json({
		ready: !!videoFile && engineStatus !== 'stalled' && engineStatus !== 'timeout',
		status: engineStatus,
		filename: message
	});
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));