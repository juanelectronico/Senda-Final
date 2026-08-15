#!/bin/bash
node server-baileys.cjs &
node dist/index.js &
wait