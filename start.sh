#!/bin/bash

# Inicia el servidor web en segundo plano
node server-baileys.cjs &

# Inicia el bot de WhatsApp en segundo plano
node dist/index.js &

# Espera a que el servidor web esté escuchando antes de soltar el control
while ! nc -z localhost 8080; do   
  sleep 1
done

# Mantiene el proceso principal vivo para que el contenedor no se apague
wait