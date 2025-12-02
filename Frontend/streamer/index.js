const express = require('express');
const torrentStream = require('torrent-stream');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');

const app = express();
app.use(cors());

const magnetLink = process.env.MAGNET;
const PORT = 9000;

if (!magnetLink) {
	console.error("❌ Erreur : Pas de lien MAGNET.");
	process.exit(1);
}

console.log(`🚀 Démarrage : ${magnetLink}`);

const engine = torrentStream(magnetLink, {
	path: '/downloads',
	verify: false,
	connections: 100,
	uploads: 0
});

let videoFile = null;
let engineStatus = 'searching';
let videoCodecInfo = 'unknown';
let totalDuration = 0;
let activeResponses = [];
let selectionTime = 0;

// --- TIMEOUTS ---
const SEARCH_TIMEOUT = 25000;
const STALL_TIMEOUT = 20000; // Un peu plus tolérant (20s)

const timeoutTimer = setTimeout(() => {
	if (engineStatus === 'searching') {
		console.error(`❌ Timeout Recherche.`);
		engineStatus = 'timeout';
		engine.destroy();
	}
}, SEARCH_TIMEOUT);

// --- FONCTION DE TÉLÉCHARGEMENT SÉQUENTIEL ---
// C'est ce qui rend le fichier lisible pendant qu'il télécharge !
const startSequentialDownload = (file) => {
	const pieceLength = engine.torrent.pieceLength;
	const startPiece = Math.floor(file.offset / pieceLength);
	const endPiece = Math.floor((file.offset + file.length) / pieceLength);

	console.log(`⚡ Mode Séquentiel Activé : Pièces ${startPiece} à ${endPiece}`);

	let currentPiece = startPiece;

	// On vérifie toutes les secondes si on doit demander la suite
	const seqInterval = setInterval(() => {
		if (!engine || !engine.swarm) {
			clearInterval(seqInterval);
			return;
		}

		// On maintient un "Buffer" de 15 pièces prioritaires en avant
		// Cela assure que VLC/FFmpeg a toujours de la matière à manger
		for (let i = 0; i < 15; i++) {
			if (currentPiece + i <= endPiece) {
				engine.critical(currentPiece + i);
			}
		}

		// Si la pièce actuelle est finie, on avance le curseur
		// (On vérifie grossièrement si on a le début du buffer)
		// Note: engine.bitfield n'est pas toujours dispo, on force juste la demande.
		currentPiece++;

		if (currentPiece > endPiece) clearInterval(seqInterval);
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

		// Lancement du séquentiel
		startSequentialDownload(videoFile);

		// Analyse FFprobe
		ffmpeg.ffprobe(videoFile.createReadStream(), (err, metadata) => {
			if (!err && metadata) {
				if (metadata.format?.duration) totalDuration = metadata.format.duration;
				const vStream = metadata.streams?.find(s => s.codec_type === 'video');
				if (vStream) {
					videoCodecInfo = vStream.codec_name;
					if (vStream.pix_fmt?.includes('10le')) videoCodecInfo += ' (10-bit)';
				}
			}
			engineStatus = 'ready';
			selectionTime = Date.now();
			videoFile.select();
		});

		// Monitoring
		setInterval(() => {
			const speed = (engine.swarm.downloadSpeed() / 1024).toFixed(0);
			const downloaded = (engine.swarm.downloaded / 1024 / 1024).toFixed(1);

			console.log(`⬇️  ${speed} KB/s | ${downloaded} MB`);

			if (engine.swarm.downloaded < 200 * 1024 && (Date.now() - selectionTime > STALL_TIMEOUT)) {
				console.error(`❌ STALL.`);
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
	console.log(`🔥 Stream start: ${startTime}s`);

	const stream = videoFile.createReadStream();

	res.writeHead(200, {
		'Content-Type': 'video/mp4',
		'Access-Control-Allow-Origin': '*',
		'Connection': 'keep-alive'
	});

	// FFmpeg avec gestion d'erreur améliorée
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
		// LOGS D'ERREUR IMPORTANTS
		.on('stderr', (stderrLine) => {
			// Affiche les erreurs internes de FFmpeg si ça plante
			if (stderrLine.includes('Error') || stderrLine.includes('Invalid')) {
				console.error('FFmpeg Log:', stderrLine);
			}
		})
		.on('error', (err) => {
			if(!err.message.includes('Output stream')) console.error('FFmpeg Critical:', err.message);
		})
		.pipe(res, { end: true });
});

app.get('/meta', (req, res) => {
	res.json({
		ready: engineStatus === 'ready',
		status: engineStatus,
		filename: videoFile ? videoFile.name : "...",
		codec: videoCodecInfo,
		duration: totalDuration
	});
});

app.listen(PORT, () => console.log(`Server port ${PORT}`));