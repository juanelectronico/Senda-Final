<<<<<<< HEAD
import { 
  default as makeWASocket, 
  DisconnectReason, 
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import * as path from 'path';
import qrcode from 'qrcode'; 
import 'dotenv/config';
import { GeminiExtractor } from '../features/fiscal/services/geminiExtractor.js';
import { supabase } from '../config/supabase.js';

// Instancia del extractor de Gemini
const extractor = new GeminiExtractor();

// Almacén en memoria para las imágenes QR y estado de los sockets
export const pairingCodes = new Map<string, string>();
const activeSockets = new Map<string, any>();
const pairingLocks = new Set<string>();

// Control de sesiones de usuario para la máquina de estados fiscal
const userSessions = new Map<string, {
  stage: 'IDLE' | 'WAITING_FISCAL_DATA' | 'WAITING_CONFIRMATION' | 'PROCESSING';
  fiscalData: Record<string, any>;
  attempts: number;
}>();

// Límite de intentos por usuario
const userAttempts = new Map<string, { count: number; lastAttempt: number }>();

const CONFIG = {
  MAX_RETRIES: 5,
  CONNECTION_TIMEOUT_MS: 30000,
  PAIRING_DELAY_MS: 5000,
  MAX_ATTEMPTS: 5,
  ATTEMPT_WINDOW_MS: 300000, // 5 minutos
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// 0. AUTENTICACIÓN PERSISTENTE EN ARCHIVO
// ============================================
async function getAuthState(commerceId: string) {
  const sessionDir = path.join(process.cwd(), 'auth_sessions', commerceId);
  
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  return { state, saveCreds, sessionDir };
}

// ============================================
// UTILIDAD: Obtener nombre del comercio
// ============================================
async function getCommerceName(commerceId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('commerce')
      .select('business_name')
      .eq('id', commerceId)
      .single();
    return data?.business_name || 'Senda';
  } catch {
    return 'Senda';
  }
}

// ============================================
// UTILIDAD: Formatear número de teléfono
// ============================================
function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');

  if (cleaned.length === 10) {
    return '521' + cleaned;
  }
  if (cleaned.length === 12 && cleaned.startsWith('52')) {
    return '521' + cleaned.substring(2);
  }
  if (cleaned.length === 13 && cleaned.startsWith('521')) {
    return cleaned;
  }
  return cleaned;
}

// ============================================
// 4. LIMPIEZA DE SESIÓN
// ============================================
export async function cleanupSession(commerceId: string, force: boolean = false): Promise<void> {
  console.log(`🧹 [${commerceId}] Limpiando sesión...`);
  pairingCodes.delete(commerceId);
  
  const existingSock = activeSockets.get(commerceId);
  if (existingSock) {
    try {
      existingSock.end(new Error('Session cleanup'));
    } catch (e) {
      // Ignorar errores al cerrar
    }
    activeSockets.delete(commerceId);
  }

  if (force) {
    const sessionDir = path.join(process.cwd(), 'auth_sessions', commerceId);
    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(`🗑️ [${commerceId}] Archivos de credenciales eliminados.`);
      } catch (err) {
        console.error(`❌ [${commerceId}] Error al eliminar sesión:`, err);
      }
    }
  }
  
  console.log(`✅ [${commerceId}] Limpieza completada`);
}

// ============================================
// 7. CREAR SOCKET
=======
// src/services/whatsapp.service.ts
import { 
  default as makeWASocket, 
  DisconnectReason, 
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as https from 'https';
import * as path from 'path';
import 'dotenv/config';
import { Firestore } from '@google-cloud/firestore';

// ============================================
// 0. INICIALIZAR FIRESTORE
// ============================================
let firestore: Firestore | null = null;
try {
  firestore = new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || 'project-9a1eb3ec-f78b-469d-bda',
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || undefined,
  });
  console.log('✅ Firestore inicializado para autenticación de WhatsApp');
} catch (error) {
  console.warn('⚠️ Firestore no disponible, usando memoria temporal (solo para pruebas)');
}

// ============================================
// 0b. FUNCIONES DE AUTENTICACIÓN CON FIRESTORE
// ============================================
async function getAuthState(commerceId: string) {
  if (!firestore) {
    // Fallback a memoria (solo para pruebas locales)
    return { creds: null, saveCreds: () => {} };
  }

  const docRef = firestore.collection('whatsapp_auth').doc(commerceId);
  const doc = await docRef.get();
  const creds = doc.exists ? doc.data() : null;

  const saveCreds = async (newCreds: any) => {
    await docRef.set(newCreds, { merge: true });
  };

  return { creds, saveCreds };
}

// ============================================
// 0c. UTILIDAD: Formatear número de teléfono
// ============================================
function formatPhoneNumber(raw: string): string {
  let clean = raw.replace(/\D/g, '');
  if (clean.startsWith('52') && clean.length === 12) return clean;
  if (clean.startsWith('52') && clean.length === 11) return '52' + '1' + clean.slice(2);
  if (clean.length === 10) return '52' + '1' + clean;
  return clean;
}

// ============================================
// 1. INTERFACES Y TIPOS
// ============================================
interface SessionInstance {
  sock: any;
  isPairing: boolean;
  createdAt: Date;
  sessionPath: string;
  cleanupTimeout: NodeJS.Timeout | null;
}

interface PairingRequest {
  commerceId: string;
  phoneNumber: string;
  timestamp: Date;
  resolving: boolean;
}

// ============================================
// 2. ALMACENES EN MEMORIA
// ============================================
export const pairingCodes = new Map<string, string>();
const activeSessions = new Map<string, SessionInstance>();
const pairingLocks = new Map<string, Promise<string>>();
const pendingPairings = new Map<string, PairingRequest>();

// ============================================
// 3. CONFIGURACIÓN
// ============================================
const CONFIG = {
  MAX_RETRIES: 5,
  PAIRING_DELAY_MS: 5000,
  RECONNECT_DELAY_MS: 5000,
  SESSION_CLEANUP_DELAY_MS: 2000,
  MAX_PAIRING_ATTEMPTS: 3,
  CONNECTION_TIMEOUT_MS: 60000,
};

const geminiApiKey = process.env.GEMINI_API_KEY;

// ============================================
// 4. FUNCIÓN GEMINI
// ============================================
async function callGemini(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
    const data = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data).toString()
      }
    };
    const request = https.request(url, options, (response) => {
      let body = '';
      response.on('data', (chunk) => body += chunk);
      response.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const respuesta = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
          resolve(respuesta);
        } catch (err) {
          reject(err);
        }
      });
    });
    request.on('error', reject);
    request.write(data);
    request.end();
  });
}

// ============================================
// 5. FUNCIÓN PRINCIPAL
// ============================================
export async function startWhatsAppBotForCommerce(
  commerceId: string,
  phoneNumber: string,
  forceNew: boolean = false
): Promise<string> {
  if (!commerceId) throw new Error('commerceId es requerido');
  if (!phoneNumber) throw new Error('phoneNumber es requerido');

  const cleanPhone = formatPhoneNumber(phoneNumber);
  if (cleanPhone.length < 10) throw new Error(`Número inválido: ${phoneNumber}`);

  console.log(`🤖 [${commerceId}] Iniciando sesión de WhatsApp para ${cleanPhone}...`);

  // Si forceNew, limpiar sesión en memoria y Firestore
  if (forceNew) {
    const existingSession = activeSessions.get(commerceId);
    if (existingSession) {
      console.log(`🧹 [${commerceId}] Eliminando sesión anterior por forceNew...`);
      await cleanupSession(commerceId, true);
    }
    // Eliminar credenciales de Firestore
    if (firestore) {
      await firestore.collection('whatsapp_auth').doc(commerceId).delete().catch(() => {});
      console.log(`🗑️ [${commerceId}] Credenciales eliminadas de Firestore`);
    }
    pairingCodes.delete(commerceId);
  }

  // Verificar sesión activa
  const existingSession = activeSessions.get(commerceId);
  if (!forceNew && existingSession && existingSession.sock?.user) {
    console.log(`✅ [${commerceId}] Sesión activa encontrada, usando existente`);
    const existingCode = pairingCodes.get(commerceId);
    if (existingCode) return existingCode;
  }

  // Control de concurrencia
  const lockKey = `${commerceId}:${cleanPhone}`;
  if (pairingLocks.has(lockKey)) {
    console.log(`🔄 [${commerceId}] Emparejamiento ya en progreso, esperando resultado...`);
    return await pairingLocks.get(lockKey)!;
  }

  console.log(`🔒 [${commerceId}] Adquiriendo lock para emparejamiento...`);
  
  // ===== EL CAMBIO CRUCIAL =====
  // Esto es lo que realmente arranca el bot y genera el QR
  const pairingPromise = performPairingWithLock(commerceId, cleanPhone, true)
    .finally(() => {
      pairingLocks.delete(lockKey);
      console.log(`🔓 [${commerceId}] Lock liberado`);
    });
    
  pairingLocks.set(lockKey, pairingPromise);
  const qrCode = await pairingPromise;
  
  // Guardar el QR en el mapa para que la API lo encuentre
  if (qrCode) {
    pairingCodes.set(commerceId, qrCode);
    console.log(`📱 [${commerceId}] QR guardado en pairingCodes`);
  }

  return qrCode;
}
// ============================================
// 6. PERFORM PAIRING
// ============================================
async function performPairingWithLock(
  commerceId: string,
  cleanPhone: string,
  forceNew: boolean
): Promise<string> {
  console.log(`🚀 [${commerceId}] Iniciando proceso de emparejamiento...`);

  // Limpiar sesión en memoria (no borra Firestore)
  await cleanupSession(commerceId, forceNew);

  try {
    // Obtener estado de autenticación desde Firestore (o memoria)
    const authState = await getAuthState(commerceId);

    const sock = await createSocketWithRetry(commerceId, cleanPhone, authState);
    activeSessions.set(commerceId, {
      sock,
      isPairing: true,
      createdAt: new Date(),
      sessionPath: 'firestore',
      cleanupTimeout: null
    });

    setupEventListeners(sock, commerceId, cleanPhone);

    const code = await requestPairingCodeWithRetry(sock, commerceId, cleanPhone);

    if (code !== 'ALREADY_AUTHENTICATED') {
      pairingCodes.set(commerceId, code);
      console.log(`💾 [${commerceId}] Código guardado. Tamaño: ${pairingCodes.size}`);
    }

    const instance = activeSessions.get(commerceId);
    if (instance) instance.isPairing = false;

    if (code === 'ALREADY_AUTHENTICATED') {
      console.log(`✅ [${commerceId}] Sesión ya autenticada, no se necesita código`);
    } else {
      console.log(`✅ [${commerceId}] Código generado exitosamente`);
    }
    return code;
  } catch (error) {
    console.error(`❌ [${commerceId}] Error en emparejamiento:`, error);
    await cleanupSession(commerceId, true);
    throw error;
  }
}

// ============================================
// 7. CREAR SOCKET CON FIRESTORE
>>>>>>> 9982343a0714c4a282235e500e86481e4627361f
// ============================================
async function createSocketWithRetry(
  commerceId: string,
  cleanPhone: string,
<<<<<<< HEAD
  retries: number = CONFIG.MAX_RETRIES
): Promise<any> {
  let lastError: Error | null = null;
  
=======
  authState: any,
  retries: number = CONFIG.MAX_RETRIES
): Promise<any> {
  let lastError: Error | null = null;
>>>>>>> 9982343a0714c4a282235e500e86481e4627361f
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔄 [${commerceId}] Intento ${attempt}/${retries} de conexión...`);
      const { version, isLatest } = await fetchLatestBaileysVersion();
      console.log(`📱 [${commerceId}] Versión: ${version.join('.')}, ¿Última?: ${isLatest}`);

<<<<<<< HEAD
      const { state, saveCreds } = await getAuthState(commerceId);

      const sock = makeWASocket({
        version,
        auth: state,
        browser: ["Senda App", "Chrome", "20.0.04"],
=======
      const { creds, saveCreds } = authState;

      const sock = makeWASocket({
        version,
        auth: creds || undefined,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
>>>>>>> 9982343a0714c4a282235e500e86481e4627361f
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        connectTimeoutMs: CONFIG.CONNECTION_TIMEOUT_MS,
        defaultQueryTimeoutMs: CONFIG.CONNECTION_TIMEOUT_MS,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        fireInitQueries: true,
        generateHighQualityLinkPreview: false,
        getMessage: async () => null
      });

      sock.ev.on('creds.update', saveCreds);

<<<<<<< HEAD
      // ============================================
      // OYENTE DE MENSAJES ENTRANTES (Motor Fiscal con Gemini)
      // ============================================
      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
          if (!msg.message || msg.key.fromMe) continue;

          const senderJid = msg.key.remoteJid;
          const messageContent = 
            msg.message.conversation || 
            msg.message.extendedTextMessage?.text || '';

          if (!messageContent.trim()) continue;

          console.log(`📩 [${commerceId}] Mensaje recibido de ${senderJid}: "${messageContent}"`);

          // ===== CONTROL DE INTENTOS =====
          const now = Date.now();
          const attemptData = userAttempts.get(senderJid) || { count: 0, lastAttempt: now };
          
          if (attemptData.lastAttempt < now - CONFIG.ATTEMPT_WINDOW_MS) {
            attemptData.count = 0;
          }
          
          if (attemptData.count >= CONFIG.MAX_ATTEMPTS) {
            await sock.sendMessage(senderJid, { 
              text: '⏳ Has superado el límite de intentos. Por favor, espera 5 minutos y vuelve a intentarlo.' 
            });
            continue;
          }

          // Inicializar sesión del usuario si no existe
          if (!userSessions.has(senderJid)) {
            userSessions.set(senderJid, { 
              stage: 'IDLE', 
              fiscalData: {},
              attempts: 0 
            });
          }
          const session = userSessions.get(senderJid)!;

          try {
            const textLower = messageContent.toLowerCase();

            // ===== 1. SALUDO INICIAL =====
            if (session.stage === 'IDLE') {
              if (textLower.includes('factura') || 
                  textLower.includes('facturar') || 
                  textLower.includes('quiero mi factura') ||
                  textLower.includes('necesito factura')) {
                
                session.stage = 'WAITING_FISCAL_DATA';
                session.fiscalData = {};
                session.attempts = 0;
                
                const commerceName = await getCommerceName(commerceId);
                await sock.sendMessage(senderJid, { 
                  text: `👋 Hola, soy el asistente de *${commerceName}*. 
                  
Para generar tu factura, necesito:

📋 RFC:
🏢 Razón Social:
⚖️ Régimen Fiscal (ej. 601, 612):
📄 Uso CFDI (ej. G01, G03):
📮 Código Postal:
📧 Correo electrónico:
💵 Monto:

Envía todos los datos en un SOLO mensaje.` 
                });
                continue;
              }
              
              // Si no es intención de factura
              const commerceName = await getCommerceName(commerceId);
              await sock.sendMessage(senderJid, { 
                text: `👋 Hola, soy el asistente de *${commerceName}*. 
                
Escribe *"Quiero mi factura"* para comenzar a generar tu CFDI.` 
              });
              continue;
            }

            // ===== 2. PROCESAR DATOS FISCALES CON GEMINI =====
            if (session.stage === 'WAITING_FISCAL_DATA') {
              // Incrementar intentos
              session.attempts = (session.attempts || 0) + 1;
              attemptData.count += 1;
              attemptData.lastAttempt = now;
              userAttempts.set(senderJid, attemptData);

              const extracted = await extractor.extractFiscalData(messageContent);
              console.log(`🤖 [${commerceId}] Datos extraídos por Gemini:`, extracted);

              if (!extracted || Object.keys(extracted).length === 0) {
                await sock.sendMessage(senderJid, { 
                  text: '❌ No pude entender los datos fiscales. Por favor, escríbelos claramente en el formato solicitado.' 
                });
                continue;
              }

              // Fusionar datos
              session.fiscalData = {
                ...session.fiscalData,
                ...(extracted?.rfc ? { rfc: extracted.rfc.toUpperCase().trim() } : {}),
                ...(extracted?.razonSocial ? { razonSocial: extracted.razonSocial } : {}),
                ...(extracted?.regimenFiscal ? { regimenFiscal: extracted.regimenFiscal } : {}),
                ...(extracted?.usoCFDI ? { usoCFDI: extracted.usoCFDI.toUpperCase().trim() } : {}),
                ...(extracted?.codigoPostal ? { codigoPostal: extracted.codigoPostal } : {}),
                ...(extracted?.email ? { email: extracted.email.toLowerCase().trim() } : {}),
                ...(extracted?.monto !== null && extracted?.monto !== undefined ? { monto: extracted.monto } : {})
              };

              const currentData = session.fiscalData;

              // Validar campos faltantes
              const missingFields: string[] = [];
              if (!currentData.rfc) missingFields.push('RFC');
              if (!currentData.razonSocial) missingFields.push('Razón Social');
              if (!currentData.regimenFiscal) missingFields.push('Régimen Fiscal');
              if (!currentData.usoCFDI) missingFields.push('Uso CFDI');
              if (!currentData.codigoPostal) missingFields.push('Código Postal');
              if (!currentData.email) missingFields.push('Correo electrónico');
              if (currentData.monto === null || currentData.monto === undefined || isNaN(currentData.monto)) missingFields.push('Monto');

              if (missingFields.length > 0) {
                // Verificar si el usuario envió solo un dato faltante
                const singleField = messageContent.trim();
                if (missingFields.length === 1) {
                  const field = missingFields[0];
                  // Intentar asignar el dato al campo faltante
                  if (field === 'RFC' && singleField.match(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/)) {
                    session.fiscalData.rfc = singleField.toUpperCase();
                    missingFields.pop();
                  } else if (field === 'Monto' && !isNaN(Number(singleField))) {
                    session.fiscalData.monto = Number(singleField);
                    missingFields.pop();
                  } else if (field === 'Correo electrónico' && singleField.includes('@')) {
                    session.fiscalData.email = singleField.toLowerCase();
                    missingFields.pop();
                  } else if (field === 'Código Postal' && singleField.match(/^\d{5}$/)) {
                    session.fiscalData.codigoPostal = singleField;
                    missingFields.pop();
                  }
                }

                if (missingFields.length > 0) {
                  await sock.sendMessage(senderJid, { 
                    text: `📝 Solo me falta: *${missingFields.join(', ')}*.
                    
¿Me lo proporcionas por favor?` 
                  });
                  continue;
                }
              }

              // Si todos los datos están completos
              session.stage = 'WAITING_CONFIRMATION';
              await sock.sendMessage(senderJid, { 
                text: `📋 *Por favor confirma tus datos para la factura:*\n\n` +
                      `🔹 RFC: ${currentData.rfc}\n` +
                      `🔹 Razón Social: ${currentData.razonSocial}\n` +
                      `🔹 Régimen Fiscal: ${currentData.regimenFiscal}\n` +
                      `🔹 Uso CFDI: ${currentData.usoCFDI}\n` +
                      `🔹 Código Postal: ${currentData.codigoPostal}\n` +
                      `🔹 Correo: ${currentData.email}\n` +
                      `🔹 Monto: $${currentData.monto}\n\n` +
                      `¿Son correctos? Responde *"SÍ"* para confirmar o *"NO"* para corregirlos.` 
              });
              continue;
            }

            // ===== 3. CONFIRMACIÓN DEL CLIENTE =====
            if (session.stage === 'WAITING_CONFIRMATION') {
              if (textLower === 'sí' || textLower === 'si' || textLower === 'correcto' || textLower === 'confirmo') {
                session.stage = 'PROCESSING';
                
                await sock.sendMessage(senderJid, { 
                  text: `✅ Datos confirmados correctamente.
                  
⏳ Tu factura está siendo procesada...` 
                });

                // Notificar al comercio
                const ownerJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : senderJid;
                await sock.sendMessage(ownerJid, {
                  text: `🔔 *Nueva Factura Solicitada*\n\n` +
                        `👤 Cliente: ${senderJid}\n` +
                        `🔹 RFC: ${session.fiscalData.rfc}\n` +
                        `🔹 Razón Social: ${session.fiscalData.razonSocial}\n` +
                        `🔹 Régimen Fiscal: ${session.fiscalData.regimenFiscal}\n` +
                        `🔹 Uso CFDI: ${session.fiscalData.usoCFDI}\n` +
                        `🔹 Código Postal: ${session.fiscalData.codigoPostal}\n` +
                        `🔹 Correo: ${session.fiscalData.email}\n` +
                        `🔹 Monto: $${session.fiscalData.monto}\n\n` +
                        `Responde *CONFIRMAR* para timbrar o *RECHAZAR* para cancelar.`
                });

                // Simular proceso de facturación (aquí iría Facturapi)
                // Por ahora, simulamos que se timbra exitosamente
                setTimeout(async () => {
                  try {
                    await sock.sendMessage(senderJid, {
                      text: `✅ *¡Factura emitida con éxito!*
                      
📄 Tu CFDI ha sido generado correctamente.
📧 Te hemos enviado el PDF y XML a: ${session.fiscalData.email}

Gracias por confiar en *Senda*. 🚀`
                    });
                  } catch (e) {
                    console.error('❌ Error enviando confirmación:', e);
                  }
                }, 3000);

                // Resetear sesión después de procesar
                setTimeout(() => {
                  session.stage = 'IDLE';
                  session.fiscalData = {};
                  session.attempts = 0;
                }, 5000);

              } else if (textLower === 'no' || textLower.includes('no')) {
                session.stage = 'WAITING_FISCAL_DATA';
                session.fiscalData = {};
                await sock.sendMessage(senderJid, { 
                  text: `Entendido. Por favor envíame de nuevo todos tus datos fiscales y el monto en un SOLO mensaje.` 
                });
              } else {
                await sock.sendMessage(senderJid, { 
                  text: `⚠️ Por favor responde *"SÍ"* para confirmar o *"NO"* para corregir tus datos.` 
                });
              }
              continue;
            }

            // ===== 4. ESTADO PROCESSING =====
            if (session.stage === 'PROCESSING') {
              await sock.sendMessage(senderJid, { 
                text: `⏳ Tu factura ya está siendo procesada. Te notificaremos en breve.` 
              });
              continue;
            }

          } catch (err) {
            console.error(`❌ [${commerceId}] Error procesando mensaje:`, err);
            await sock.sendMessage(senderJid, { 
              text: "❌ Ocurrió un error procesando tu solicitud. Por favor, inténtalo de nuevo." 
            });
          }
        }
      });

      console.log(`✅ [${commerceId}] Socket creado correctamente`);
=======
      console.log(`⏳ [${commerceId}] Esperando 8 segundos para que Baileys estabilice...`);
      await sleep(8000);
      console.log(`✅ [${commerceId}] Socket creado (con espera fija de 8s)`);
>>>>>>> 9982343a0714c4a282235e500e86481e4627361f
      return sock;
    } catch (error) {
      lastError = error as Error;
      console.error(`❌ [${commerceId}] Error en intento ${attempt}:`, error);
      if (attempt === retries) throw new Error(`Fallo después de ${retries} intentos: ${lastError.message}`);
      const delay = Math.min(Math.pow(2, attempt) * 1000 + Math.random() * 1000, CONFIG.PAIRING_DELAY_MS * 2);
      console.log(`⏳ [${commerceId}] Esperando ${delay}ms antes de reintentar...`);
      await sleep(delay);
    }
  }
  throw new Error(`[${commerceId}] No se pudo crear el socket después de todos los intentos`);
}

// ============================================
<<<<<<< HEAD
// 8. CAPTURAR Y GENERAR CÓDIGO QR VISUAL
// ============================================
async function waitForQRCode(sock: any, commerceId: string, phoneNumber: string): Promise<void> {
  let resolved = false;

  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Timeout esperando código QR de WhatsApp'));
      }
    }, 60000);

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(`📸 [${commerceId}] ¡Código QR recibido! Generando imagen...`);
        try {
          const qrDataUrl = await qrcode.toDataURL(qr, {
            errorCorrectionLevel: 'L',
            margin: 2,
            width: 300
          });
          pairingCodes.set(commerceId, qrDataUrl);
          
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve();
          }
        } catch (err) {
          console.error(`❌ [${commerceId}] Error al renderizar QR:`, err);
        }
      }

      if (connection === 'open') {
        console.log(`✅ [${commerceId}] ¡Conectado exitosamente a WhatsApp!`);
        pairingCodes.delete(commerceId);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve();
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        console.log(`🔌 [${commerceId}] Conexión cerrada. Código: ${statusCode}`);

        if (statusCode === 515 || statusCode === DisconnectReason.restartRequired) {
          console.log(`🔄 [${commerceId}] Reiniciando conexión...`);
          setTimeout(() => {
            startWhatsAppBotForCommerce(commerceId, phoneNumber, false);
          }, 2000);
        }
      }
    });

    if (sock.user) {
      console.log(`✅ [${commerceId}] Usuario ya existente: ${sock.user.id}`);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve();
      }
      return;
=======
// 8. SOLICITAR CÓDIGO (QR o PAIRING CODE)
// ============================================
async function requestPairingCodeWithRetry(
  sock: any,
  commerceId: string,
  cleanPhone: string,
  maxAttempts: number = CONFIG.MAX_PAIRING_ATTEMPTS
): Promise<string> {
  console.log(`🔑 [${commerceId}] Esperando código de vinculación...`);

  return new Promise((resolve, reject) => {
    let resolved = false;
    let timeoutId: NodeJS.Timeout;

    timeoutId = setTimeout(() => {
      if (!resolved) {
        sock.ev.off('connection.update', handler);
        reject(new Error(`Timeout esperando código después de ${CONFIG.CONNECTION_TIMEOUT_MS}ms`));
      }
    }, CONFIG.CONNECTION_TIMEOUT_MS);

    const handler = (update: any) => {
      console.log(`📡 [${commerceId}] Estado:`, {
        connection: update.connection,
        hasPairingCode: !!update.pairingCode,
        hasQR: !!update.qr,
        hasUser: !!sock.user
      });

      if (sock.user) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          sock.ev.off('connection.update', handler);
          console.log(`✅ [${commerceId}] Ya autenticado`);
          resolve('ALREADY_AUTHENTICATED');
        }
        return;
      }

      const code = update.pairingCode || update.qr;
      if (code && !resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        sock.ev.off('connection.update', handler);

        const type = update.pairingCode ? 'pairing' : 'qr';
        console.log(`📱 [${commerceId}] Código ${type} generado (longitud: ${code.length})`);
        console.log('='.repeat(100));
        if (type === 'pairing') {
          console.log('📱 PAIRING CODE - INGRESA ESTE CÓDIGO EN WHATSAPP:');
          console.log(`👉 ${code}`);
        } else {
          console.log('📱 QR - COPIA ESTE TEXTO PARA GENERAR LA IMAGEN:');
          console.log(code);
        }
        console.log('='.repeat(100));

        pairingCodes.set(commerceId, code);
        console.log(`💾 [${commerceId}] Código guardado. Tamaño: ${pairingCodes.size}`);
        resolve(code);
      }

      if (update.connection === 'close' && !resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        sock.ev.off('connection.update', handler);
        const error = update.lastDisconnect?.error;
        const statusCode = (error as any)?.output?.statusCode;
        reject(new Error(`Conexión cerrada: ${error?.message || 'Error desconocido'} (${statusCode})`));
      }
    };

    sock.ev.on('connection.update', handler);

    if (sock.user && !resolved) {
      resolved = true;
      clearTimeout(timeoutId);
      sock.ev.off('connection.update', handler);
      console.log(`✅ [${commerceId}] Usuario ya existente: ${sock.user.id}`);
      resolve('ALREADY_AUTHENTICATED');
    }

    if (!resolved && !sock.user) {
      console.log(`🔑 [${commerceId}] Solicitando código...`);
      sock.requestPairingCode(cleanPhone).catch((err: any) => {
        console.log(`⚠️ [${commerceId}] Pairing code no disponible, esperando QR...`, err.message);
      });
>>>>>>> 9982343a0714c4a282235e500e86481e4627361f
    }
  });
}

// ============================================
<<<<<<< HEAD
// 9. FUNCIONES AUXILIARES
// ============================================
export function detectCodeType(code: string): 'pairing' | 'qr' | 'unknown' {
  if (!code) return 'unknown';
  if (code.startsWith('data:image')) return 'qr'; 
  return 'unknown';
}

export function formatPairingCode(code: string): string {
  return code;
}

export function getCodeWithType(commerceId: string): { code: string | null, type: 'pairing' | 'qr' | 'unknown' } {
  const code = pairingCodes.get(commerceId);
  if (!code) return { code: null, type: 'unknown' };
  return { code, type: 'qr' };
}

export function getFormattedCode(commerceId: string): string | null {
  return pairingCodes.get(commerceId) || null;
}

=======
// 9. EVENT LISTENERS
// ============================================
function setupEventListeners(sock: any, commerceId: string, cleanPhone: string): void {
  sock.ev.on('connection.update', async (update: any) => {
    const { connection, lastDisconnect } = update;

    if (update.pairingCode) {
      console.log(`🔑 [${commerceId}] Pairing code recibido en event listener: ${update.pairingCode}`);
      pairingCodes.set(commerceId, update.pairingCode);
    }
    if (update.qr) {
      console.log(`📱 [${commerceId}] QR generado (longitud: ${update.qr.length})`);
      if (!pairingCodes.has(commerceId)) {
        pairingCodes.set(commerceId, update.qr);
      }
    }

    if (connection === 'close') {
      const error = lastDisconnect?.error;
      const statusCode = error?.output?.statusCode;
      const errorMessage = error?.message || 'Error desconocido';
      console.log(`⚠️ [${commerceId}] Conexión cerrada. Código: ${statusCode}, Error: ${errorMessage}`);
      if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 428) {
        console.log(`🔒 [${commerceId}] Sesión cerrada (${statusCode}). Limpiando...`);
        pairingCodes.delete(commerceId);
        await cleanupSession(commerceId, true);
      } else {
        console.log(`⚠️ [${commerceId}] Error temporal (${statusCode}). Reconectando...`);
        const instance = activeSessions.get(commerceId);
        if (instance?.cleanupTimeout) clearTimeout(instance.cleanupTimeout);
        const timeout = setTimeout(() => {
          console.log(`🔄 [${commerceId}] Ejecutando reconexión programada...`);
          startWhatsAppBotForCommerce(commerceId, cleanPhone, true).catch(console.error);
        }, CONFIG.RECONNECT_DELAY_MS);
        if (instance) instance.cleanupTimeout = timeout;
      }
    } else if (connection === 'open') {
      console.log(`✅ [${commerceId}] ¡WhatsApp conectado exitosamente!`);
      if (sock.user) pairingCodes.delete(commerceId);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }: any) => {
    try {
      const m = messages[0];
      if (!m.message || m.key.fromMe) return;
      const messageType = Object.keys(m.message)[0];
      const sender = m.key.remoteJid;
      let textMessage = '';
      if (messageType === 'conversation') textMessage = m.message.conversation;
      else if (messageType === 'extendedTextMessage') textMessage = m.message.extendedTextMessage.text;
      if (textMessage && sender) {
        console.log(`📩 [${commerceId}] Mensaje recibido de ${sender}: ${textMessage}`);
        const prompt = `Eres Senda Bot, un asistente virtual experto en facturación electrónica en México (SAT) y alta de comercios. Responde de forma amable, clara y concisa a la siguiente duda del usuario: "${textMessage}"`;
        const respuestaIA = await callGemini(prompt);
        await sock.sendMessage(sender, { text: respuestaIA });
        console.log(`✅ [${commerceId}] Respuesta enviada a ${sender}`);
      }
    } catch (error) {
      console.error(`❌ [${commerceId}] Error procesando mensaje:`, error);
    }
  });

  let presenceCount = 0;
  let lastPresenceLog = Date.now();
  sock.ev.on('presence.update', () => {
    presenceCount++;
    const now = Date.now();
    if (now - lastPresenceLog > 60000) {
      console.log(`👤 [${commerceId}] ${presenceCount} actualizaciones de presencia`);
      presenceCount = 0;
      lastPresenceLog = now;
    }
  });
}

// ============================================
// 10. LIMPIEZA DE SESIONES (memoria y Firestore)
// ============================================
async function cleanupSession(commerceId: string, deleteState: boolean = true): Promise<void> {
  console.log(`🧹 [${commerceId}] Limpiando sesión...`);
  const instance = activeSessions.get(commerceId);
  if (instance?.cleanupTimeout) {
    clearTimeout(instance.cleanupTimeout);
    instance.cleanupTimeout = null;
  }
  if (instance?.sock) {
    try {
      await instance.sock.end(undefined);
      console.log(`✅ [${commerceId}] Socket cerrado`);
    } catch (error) {
      console.warn(`⚠️ [${commerceId}] Error al cerrar socket:`, error);
    }
  }
  activeSessions.delete(commerceId);
  pairingCodes.delete(commerceId);
  if (deleteState && firestore) {
    try {
      await firestore.collection('whatsapp_auth').doc(commerceId).delete();
      console.log(`🗑️ [${commerceId}] Credenciales eliminadas de Firestore`);
    } catch (error) {
      console.warn(`⚠️ [${commerceId}] Error eliminando credenciales de Firestore:`, error);
    }
  }
  await sleep(CONFIG.SESSION_CLEANUP_DELAY_MS);
  console.log(`✅ [${commerceId}] Limpieza completada`);
}

// ============================================
// 11. UTILIDADES
// ============================================
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// 12. EXPORTACIONES
// ============================================
>>>>>>> 9982343a0714c4a282235e500e86481e4627361f
export function getPairingCode(commerceId: string): string | undefined {
  return pairingCodes.get(commerceId);
}

export function getSessionStatus(commerceId: string): {
  exists: boolean;
  isPairing: boolean;
  hasCode: boolean;
  createdAt: Date | null;
} {
<<<<<<< HEAD
  const instance = activeSockets.get(commerceId);
  return {
    exists: !!instance,
    isPairing: pairingLocks.has(commerceId),
    hasCode: pairingCodes.has(commerceId),
    createdAt: null
  };
}

export async function forceReconnect(commerceId: string, phoneNumber: string): Promise<void> {
  console.log(`🔄 [${commerceId}] Forzando reconexión QR...`);
  return await startWhatsAppBotForCommerce(commerceId, phoneNumber, true);
}

// ============================================
// 10. FUNCIÓN PRINCIPAL DE INICIO
// ============================================
export async function startWhatsAppBotForCommerce(
  commerceId: string, 
  phoneNumber: string, 
  forceNew: boolean = false
): Promise<void> {
  if (pairingLocks.has(commerceId)) {
    console.log(`🔒 [${commerceId}] Ya hay un proceso de vinculación en curso.`);
    return;
  }

  pairingLocks.add(commerceId);
  const cleanPhone = formatPhoneNumber(phoneNumber);

  try {
    console.log(`🤖 [${commerceId}] Iniciando sesión de WhatsApp para ${cleanPhone}...`);
    
    await cleanupSession(commerceId, forceNew);

    const sock = await createSocketWithRetry(commerceId, cleanPhone);
    activeSockets.set(commerceId, sock);

    console.log(`📸 [${commerceId}] Esperando evento de QR...`);
    await waitForQRCode(sock, commerceId, phoneNumber);

  } catch (error) {
    console.error(`❌ [${commerceId}] Error en proceso QR:`, error);
    await cleanupSession(commerceId, true);
    throw error;
  } finally {
    pairingLocks.delete(commerceId);
    console.log(`🔓 [${commerceId}] Lock liberado`);
  }
=======
  const instance = activeSessions.get(commerceId);
  return {
    exists: !!instance,
    isPairing: instance?.isPairing || false,
    hasCode: pairingCodes.has(commerceId),
    createdAt: instance?.createdAt || null
  };
}

export function detectCodeType(code: string): 'pairing' | 'qr' | 'unknown' {
  if (!code) return 'unknown';
  if (code.startsWith('https://wa.me/settings/linked_devices') ||
      code.includes('wa.me') ||
      code.length > 500) return 'pairing';
  if (code.length < 500 && !code.startsWith('http')) return 'qr';
  return 'unknown';
}

export function formatPairingCode(code: string): string {
  if (code.startsWith('https://wa.me/')) return code;
  if (/^\d+$/.test(code)) return `https://wa.me/settings/linked_devices?pairing=${code}`;
  if (code.startsWith('http')) return code;
  return `https://wa.me/settings/linked_devices?code=${encodeURIComponent(code)}`;
}

export function getCodeWithType(commerceId: string): { code: string | null, type: 'pairing' | 'qr' | 'unknown' } {
  const code = pairingCodes.get(commerceId);
  if (!code) return { code: null, type: 'unknown' };
  const type = detectCodeType(code);
  return { code, type };
}

export function getFormattedCode(commerceId: string): string | null {
  const code = pairingCodes.get(commerceId);
  if (!code) return null;
  const type = detectCodeType(code);
  if (type === 'pairing') return formatPairingCode(code);
  return code;
}

export async function forceReconnect(commerceId: string, phoneNumber: string): Promise<string> {
  console.log(`🔄 [${commerceId}] Forzando reconexión...`);
  return await startWhatsAppBotForCommerce(commerceId, phoneNumber, true);
>>>>>>> 9982343a0714c4a282235e500e86481e4627361f
}