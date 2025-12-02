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
let videoCodecInfo = 'unknown';
// On a retiré needsTranscoding pour rester en mode Low CPU strict
let totalDuration = 0;
let activeResponses = [];
let selectionTime = 0;
let sequentialInterval = null;

const SEARCH_TIMEOUT = 20000;
const STALL_TIMEOUT = 20000;

const timeoutTimer = setTimeout(() => {
	if (engineStatus === 'searching') {
		console.error(`❌ Timeout Recherche.`);
		engineStatus = 'timeout';
		engine.destroy();
	}
}, SEARCH_TIMEOUT);

const startSequentialDownload = (file) => {
	if (sequentialInterval) return;
	const pieceLength = engine.torrent.pieceLength;
	const startPiece = Math.floor(file.offset / pieceLength);
	const endPiece = Math.floor((file.offset + file.length) / pieceLength);
	let currentPiece = startPiece;

	sequentialInterval = setInterval(() => {
		if (!engine || !engine.swarm) return;
		if (activeResponses.length > 0) return; // Pause si streaming actif

		for (let i = 0; i < 5; i++) {
			if (currentPiece + i <= endPiece) engine.critical(currentPiece + i);
		}
		currentPiece++;
		if (currentPiece > endPiece) clearInterval(sequentialInterval);
	}, 1000);
};

engine.on('ready', () => {
	clearTimeout(timeoutTimer);
	console.log('✅ Engine Ready');

	engine.files.forEach((file) => {
		if (file.name.endsWith('.mp4') || file.name.endsWith('.mkv') || file.name.endsWith('.avi')) {
			if (!videoFile || file.length > videoFile.length) {
				videoFile = file;
			}
		}
	});

	if (videoFile) {
		console.log(`🎬 Fichier : ${videoFile.name}`);
		startSequentialDownload(videoFile);

		// ANALYSE DU CODEC
		ffmpeg.ffprobe(videoFile.createReadStream(), (err, metadata) => {
			if (!err && metadata) {
				if (metadata.format?.duration) totalDuration = metadata.format.duration;

				const vStream = metadata.streams?.find(s => s.codec_type === 'video');
				if (vStream) {
					videoCodecInfo = vStream.codec_name;
					if (vStream.pix_fmt && vStream.pix_fmt.includes('10le')) {
						videoCodecInfo += ' (10-bit)';
					}
					console.log(`🔍 Codec détecté : ${videoCodecInfo}`);
				}
			}
			engineStatus = 'ready';
			selectionTime = Date.now();
			videoFile.select();
		});

		// Monitoring (Logs réactivés ici)
		setInterval(() => {
			// Calcul de la vitesse et du téléchargement
			const speed = (engine.swarm.downloadSpeed() / 1024).toFixed(0);
			const downloaded = (engine.swarm.downloaded / 1024 / 1024).toFixed(1);
			const peers = engine.swarm.wires.length;

			// AJOUT DU LOG
			console.log(`⬇️  Vitesse: ${speed} KB/s | DL: ${downloaded} MB | Peers: ${peers}`);

			if (engine.swarm.downloaded < 200 * 1024 && (Date.now() - selectionTime > STALL_TIMEOUT)) {
				console.error(`❌ STALL DÉTECTÉ (0 data).`);
				engineStatus = 'stalled';
				engine.destroy();
			}
		}, 2000);

	} else {
		engineStatus = 'no_video';
		engine.destroy();
	}
});

app.get('/', (req, res) => {
	activeResponses.push(res);
	res.on('close', () => { activeResponses = activeResponses.filter(r => r !== res); });

	if (engineStatus !== 'ready') return res.status(503).send('Not ready');

	const startTime = parseInt(req.query.start) || 0;
	const stream = videoFile.createReadStream();

	res.writeHead(200, {
		'Content-Type': 'video/mp4',
		'Access-Control-Allow-Origin': '*',
		'Connection': 'keep-alive'
	});

	// MODE REMUX STRICT
	ffmpeg(stream)
		.seekInput(startTime)
		.inputOptions(['-probesize 20M', '-analyzeduration 20M'])
		.videoCodec('copy')
		.audioCodec('aac')
		.audioBitrate(128)
		.audioChannels(2)
		.outputOptions([
			'-movflags frag_keyframe+empty_moov+default_base_moof',
			'-preset ultrafast',
			'-tune zerolatency'
		])
		.format('mp4')
		.on('error', (err) => { if(!err.message.includes('Output stream')) console.error('FFmpeg:', err.message); })
		.pipe(res, { end: true });
});

app.get('/meta', (req, res) => {
	res.json({
		ready: engineStatus === 'ready',
		status: engineStatus,
		filename: videoFile ? videoFile.name : "...",
		codec: videoCodecInfo,
		duration: totalDuration,
		transcoding: false
	});
});

app.listen(PORT, () => console.log(`Server port ${PORT}`));