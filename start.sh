#!/bin/bash

# Inicia el servidor web en segundo plano
node server-baileys.cjs &

# Inicia el bot de WhatsApp en segundo plano
node dist/index.js &

# Mantén el contenedor abierto para siempre
tail -f /dev/null