#!/bin/bash

# Configuration
PORT_STREAM=9000
DIR_DOWNLOAD="/downloads"
LOG_FILE="$DIR_DOWNLOAD/peerflix.log"

# Peerflix a besoin d'un dossier temporaire propre
mkdir -p "$DIR_DOWNLOAD"

# Nettoyage de l'ancien log pour éviter les faux positifs
rm -f "$LOG_FILE"

echo "--- Démarrage avec Peerflix (Mode Log Parsing) ---"
echo "Lien Magnet détecté."

# 1. Lancement de Peerflix en arrière-plan
# On redirige stdout et stderr vers le fichier log
peerflix "$MAGNET" --path "$DIR_DOWNLOAD" -p "$PORT_STREAM" --all > "$LOG_FILE" 2>&1 &

PEERFLIX_PID=$!

echo ">>> Moteur Peerflix lancé (PID: $PEERFLIX_PID)"
echo ">>> Log file: $LOG_FILE"

# 2. Surveillance du téléchargement via les LOGS
echo "Surveillance de la progression (lecture du log)..."

while true; do
    sleep 10

    # On vérifie d'abord si Peerflix est toujours en vie
    if ! kill -0 $PEERFLIX_PID 2>/dev/null; then
        echo "Attention : Le processus Peerflix s'est arrêté prématurément."
        # On vérifie si c'était une fin normale (parfois peerflix quitte à la fin)
        if grep -q "(100%)" "$LOG_FILE"; then
            echo "Arrêt détecté, mais le log indique 100%. On continue."
            break
        else
            echo "Erreur critique : Peerflix a crashé avant la fin."
            tail -n 20 "$LOG_FILE"
            exit 1
        fi
    fi

    # Extraction de la dernière ligne contenant "info downloaded"
    # Exemple de ligne : info downloaded 119.3MB (1%) and uploaded...
    LAST_LINE=$(grep "downloaded" "$LOG_FILE" | tail -n 1)

    if [ -n "$LAST_LINE" ]; then
        # On extrait le motif "(xx%)" puis on nettoie les parenthèses et le %
        # grep -o '([0-9]\+%)' : trouve (1%) ou (100%)
        # tr -d '()%' : garde uniquement le nombre
        PERCENT=$(echo "$LAST_LINE" | grep -o '([0-9]\+%)' | tail -n 1 | tr -d '()%')

        # On récupère aussi la taille téléchargée pour l'affichage (optionnel)
        # awk '{print $3}' prend le 3ème mot (ex: 119.3MB)
        DL_SIZE=$(echo "$LAST_LINE" | awk '{print $3}')

        echo "Progression : $PERCENT% - Téléchargé : $DL_SIZE"

        # Condition de sortie : Si on atteint 100
        if [ "$PERCENT" == "100" ]; then
            echo ">>> Téléchargement terminé (100% détecté dans les logs)."
            break
        fi
    else
        echo "En attente des premières données de téléchargement..."
    fi
done

# 3. Arrêt propre
# On tue le processus s'il tourne encore
kill $PEERFLIX_PID 2>/dev/null
wait $PEERFLIX_PID 2>/dev/null
echo "Stream arrêté."

# 4. Upload vers Google Drive
echo "Démarrage de l'upload..."
# Note : --min-size 10M permet d'éviter d'uploader des fichiers partiels ou corrompus
rclone copy "$DIR_DOWNLOAD" google:Film \
    --drive-chunk-size 128M \
    --transfers 16 \
    --checkers 32 \
    --min-size 10M \
    --verbose

echo "--- Tout est terminé ! ---"