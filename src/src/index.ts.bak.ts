// ===== WEBSOCKET (Para Baileys) =====
import { WebSocket } from 'ws';
(global as any).WebSocket = WebSocket;

// ===== IMPORTS =====
import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import paymentRoutes from './routes/payment.routes.js';
import { FiscalInterceptor } from './features/fiscal/interceptor.js';

// ===== IMPORTS DE WHATSAPP (UN SOLO BLOQUE) =====
import { 
    startWhatsAppBotForCommerce, 
    pairingCodes, 
    getSessionStatus 
} from './services/whatsapp.service.js';

// ===== DIRECTORIO ACTUAL =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Iniciando Senda API...');

const app = express();

// ===== MIDDLEWARE =====
app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===== INTERCEPTOR FISCAL =====
const fiscalInterceptor = new FiscalInterceptor();

// ===== RUTAS DE PAGO =====
app.use('/api/payment', paymentRoutes);

// ===== STATIC FILES =====
const publicDir = path.join(process.cwd(), 'public');
app.use(express.static(publicDir));

app.get('/', (req, res) => res.redirect('/register.html'));

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        message: 'Senda API funcionando',
        timestamp: new Date().toISOString()
    });
});

// ===== INICIALIZAR MERCADO PAGO =====
let mercadopagoClient: MercadoPagoConfig | null = null;

try {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
        console.warn('⚠️ MP_ACCESS_TOKEN no configurado');
    } else {
        mercadopagoClient = new MercadoPagoConfig({
            accessToken: accessToken
        });
        console.log('✅ MercadoPago inicializado');
    }
} catch (error) {
    console.error('❌ Error MercadoPago:', error);
}

// ===== INICIALIZAR SUPABASE =====
let supabase: any = null;

async function initSupabase() {
    try {
        const module = await import('./config/supabase.js');
        supabase = module.supabase;
        console.log('✅ Supabase inicializado');
        return true;
    } catch (error) {
        console.error('❌ Error Supabase:', error);
        return false;
    }
}

// ===== VALIDACIÓN DE CERTIFICADOS SAT =====
function validarSAT(cer: string, key: string, pass: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!cer || cer.length < 10) errors.push('El .cer es obligatorio y debe tener al menos 10 caracteres');
    if (!key || key.length < 10) errors.push('El .key es obligatorio y debe tener al menos 10 caracteres');
    if (!pass || pass.length < 2) errors.push('La contraseña es obligatoria');

    return { valid: errors.length === 0, errors };
}

// ===== RUTA DE REGISTRO =====
app.post('/api/commerce/register', async (req: Request, res: Response): Promise<any> => {
    try {
        console.log('📝 Registro de comercio');
        
        const { 
            rfc, business_name, tax_regime, zip_code, phone, email,
            csd_cer_base64, csd_key_base64, csd_password 
        } = req.body;

        if (!rfc || !business_name || !tax_regime || !zip_code || !phone || !email) {
            return res.status(400).json({ success: false, error: 'Faltan campos obligatorios' });
        }

        console.log('🔍 Validando certificados SAT...');
        const satValidation = validarSAT(csd_cer_base64, csd_key_base64, csd_password);
        
        if (!satValidation.valid) {
            return res.status(400).json({ success: false, error: 'Certificados SAT inválidos', details: satValidation.errors });
        }

        if (!supabase) {
            await initSupabase();
            if (!supabase) return res.status(503).json({ success: false, error: 'Base de datos no disponible' });
        }

        if (!mercadopagoClient) {
            return res.status(503).json({ success: false, error: 'Servicio de pagos no disponible' });
        }

        console.log('💾 Guardando en Supabase...');
        const { data, error } = await supabase
            .from('commerce')
            .insert({
                rfc, business_name, tax_regime, zip_code, phone, email,
                csd_cer_base64, csd_key_base64, csd_password,
                is_active: false, is_premium: false, invoice_count: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error('❌ Error Supabase:', error);
            return res.status(500).json({ success: false, error: 'Error al guardar en base de datos', details: error.message });
        }

        console.log('✅ Comercio registrado ID:', data.id);

        console.log('🔄 Generando preferencia de pago...');
        let initPoint = null;

        try {
            const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
            const host = req.get('host') || 'localhost:8080';
            const baseUrl = `${protocol}://${host}`;

            const preference = new Preference(mercadopagoClient);
            const result = await preference.create({
                body: {
                    items: [{
                        id: 'senda_register_001',
                        title: 'Registro Senda - Facturación SAT',
                        description: 'Activación de cuenta Senda',
                        quantity: 1,
                        unit_price: 50.00,
                        currency_id: 'MXN'
                    }],
                    payer: { email: email, name: business_name },
                    external_reference: data.id.toString(),
                    back_urls: {
                        success: `${baseUrl}/payment/success?id=${data.id}`,
                        failure: `${baseUrl}/payment/failure`,
                        pending: `${baseUrl}/payment/pending`
                    },
                    notification_url: `${baseUrl}/api/payment/webhook`
                }
            });

            initPoint = result.init_point;
            console.log('✅ Preferencia creada:', result.id);

        } catch (mpError: any) {
            console.error('❌ Error MercadoPago:', mpError);
            return res.status(500).json({ success: false, error: 'No se pudo generar el link de pago', details: mpError.message });
        }

        return res.json({
            success: true,
            message: '✅ Registro exitoso. Procede al pago.',
            init_point: initPoint,
            commerce: { id: data.id, business_name: data.business_name, email: data.email, phone: data.phone }
        });

    } catch (error: any) {
        console.error('❌ Error general:', error);
        return res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
});

// ===== WEBHOOK DE MERCADO PAGO =====
app.post('/api/payment/webhook', async (req: Request, res: Response): Promise<any> => {
    try {
        console.log('📡 Webhook recibido');
        const { type, data, action } = req.body;

        if (type === 'payment' || action === 'payment.updated') {
            const paymentId = data?.id || req.body.id;
            if (!paymentId || !mercadopagoClient) return res.status(200).json({ received: true });

            const payment = new Payment(mercadopagoClient);
            const paymentInfo = await payment.get({ id: paymentId });

            console.log(`💰 Pago ${paymentId}: ${paymentInfo.status}`);

            if (paymentInfo.status === 'approved' && supabase) {
                const commerceId = paymentInfo.external_reference;
                if (commerceId) {
                    await supabase
                        .from('commerce')
                        .update({ is_active: true, is_premium: true, updated_at: new Date().toISOString() })
                        .eq('id', commerceId);
                    console.log(`✅ Pago aprobado para comercio ${commerceId}`);
                }
            }
        }
        res.status(200).json({ received: true });
    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(200).json({ received: true });
    }
});

// ===== RUTA: OBTENER QR O PAIRING CODE PARA LA VISTA =====
app.get('/api/whatsapp/get-qr', async (req: Request, res: Response) => {
    try {
        const { id } = req.query;
        
        if (!id || typeof id !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'ID de comercio es requerido'
            });
        }

        const code = pairingCodes.get(id) || null;

        if (code) {
            return res.json({
                success: true,
                qr: code, // Cadena data:image/... lista para usar en src=""
                status: 'ready',
                isPairing: false
            });
        }

        const status = getSessionStatus(id);

        if (status.exists && !status.isPairing) {
            return res.json({
                success: true,
                status: 'connected',
                message: 'WhatsApp ya está conectado'
            });
        }

        if (status.isPairing) {
            return res.json({
                success: true,
                status: 'pairing',
                message: 'Generando código QR...'
            });
        }

        return res.json({
            success: true,
            status: 'waiting',
            message: 'Esperando generación del código...'
        });

    } catch (error) {
        console.error('❌ Error en GET /api/whatsapp/get-qr:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
});

// ===== PÁGINA DE PAGO EXITOSO (GENERA QR AUTOMÁTICAMENTE) =====
app.get('/payment/success', async (req, res) => {
    const commerceId = req.query.id as string;
    
    if (!commerceId) {
        return res.status(400).send('ID de comercio no proporcionado');
    }

    try {
        if (!supabase) await initSupabase();

        const { data: commerce, error } = await supabase
            .from('commerce')
            .select('*')
            .eq('id', commerceId)
            .single();

        if (error || !commerce) {
            return res.status(404).send('Comercio no encontrado');
        }
        if (!commerce.is_active) {
            return res.status(400).send('❌ Pago no confirmado. Por favor, completa el pago primero.');
        }

        // INICIAR WHATSAPP SOLO DESPUÉS DEL PAGO
        console.log(`📱 Iniciando WhatsApp para comercio ${commerceId} después del pago...`);
        startWhatsAppBotForCommerce(commerceId, commerce.phone, true)
            .catch((err) => {
                console.error(`❌ [${commerceId}] Error al iniciar WhatsApp:`, err);
            });

    } catch (e: any) {
        console.warn(`⚠️ Error al obtener datos del comercio:`, e);
    }

    // Página HTML con QR
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Vincular WhatsApp - Senda</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 20px; }
                .card { background: white; border-radius: 16px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08); max-width: 550px; width: 100%; padding: 32px 28px; }
                .card h1 { font-size: 24px; font-weight: 600; color: #1a1a2e; text-align: center; margin-bottom: 8px; }
                .card .subtitle { text-align: center; color: #6b7280; font-size: 14px; margin-bottom: 24px; }
                .qr-container { background: #f8fafc; border-radius: 12px; border: 2px dashed #d1d5db; padding: 20px 16px; min-height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 16px; }
                .btn { display: inline-block; padding: 12px 24px; border-radius: 10px; font-weight: 600; font-size: 14px; border: none; cursor: pointer; text-decoration: none; text-align: center; width: 100%; transition: background 0.2s; }
                .btn-primary { background: #25D366; color: white; }
                .btn-primary:hover { background: #1ebe5a; }
                .btn-secondary { background: #f1f5f9; color: #334155; }
                .btn-secondary:hover { background: #e2e8f0; }
                .btn-group { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
                .badge { display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 12px; font-weight: 500; margin-top: 8px; }
                .badge.loading { background: #dbeafe; color: #1d4ed8; }
                .badge.ready { background: #d1fae5; color: #065f46; }
                .spinner { display: inline-block; width: 32px; height: 32px; border: 3px solid #e2e8f0; border-radius: 50%; border-top-color: #3b82f6; animation: spin 0.8s linear infinite; margin-bottom: 12px; }
                @keyframes spin { to { transform: rotate(360deg); } }
                .payment-badge { background: #d1fae5; color: #065f46; padding: 8px 16px; border-radius: 8px; text-align: center; margin-bottom: 16px; font-weight: 500; }
            </style>
        </head>
        <body>
        <div class="card">
            <h1>📱 Vincula tu WhatsApp</h1>
            <p class="subtitle">Escanea el código QR con la app de WhatsApp de tu comercio</p>
            <div class="payment-badge">✅ Pago confirmado. ¡Ya puedes conectar WhatsApp!</div>
            <div class="qr-container loading" id="qrContainer">
                <div id="qrContent">
                    <div class="spinner"></div>
                    <p style="text-align: center; color: #94a3b8;">Generando código QR...</p>
                </div>
                <span class="badge loading" id="statusBadge">⏳ Conectando...</span>
            </div>
            <div class="btn-group">
                <button id="refreshBtn" class="btn btn-secondary">🔄 Reintentar</button>
                <a href="/register.html" class="btn btn-secondary">Ir al inicio</a>
            </div>
        </div>
        <script>
            const COMERCIO_ID = new URLSearchParams(window.location.search).get('id');
            const API_BASE = '/api/whatsapp';
            
            if (!COMERCIO_ID) {
                alert('ID de comercio no proporcionado');
            }

            async function checkQR() {
                try {
                    const res = await fetch(\`\${API_BASE}/get-qr?id=\${COMERCIO_ID}\`);
                    const data = await res.json();
                    
                    if (data.success && data.qr) {
                        const content = document.getElementById('qrContent');
                        const badge = document.getElementById('statusBadge');
                        
                        content.innerHTML = \`<img src="\${data.qr}" style="max-width:220px; border-radius: 8px;" alt="QR Code"/>\`;
                        badge.textContent = '✅ Escanea este QR';
                        badge.className = 'badge ready';
                    } else if (data.status === 'connected') {
                        const content = document.getElementById('qrContent');
                        const badge = document.getElementById('statusBadge');
                        content.innerHTML = \`<p style="color: #065f46; font-weight: bold; font-size: 16px;">¡WhatsApp vinculado con éxito!</p>\`;
                        badge.textContent = '✅ Conectado';
                        badge.className = 'badge ready';
                    } else if (data.status === 'waiting') {
                        // Esperar a que se genere el QR
                        const content = document.getElementById('qrContent');
                        content.innerHTML = \`
                            <div class="spinner"></div>
                            <p style="text-align: center; color: #94a3b8;">Generando código QR...</p>
                        \`;
                    }
                } catch (e) {
                    console.error('Error consultando QR:', e);
                }
            }

            setInterval(checkQR, 3000);
            document.getElementById('refreshBtn').addEventListener('click', () => window.location.reload());
        </script>
        </body>
        </html>
    `);
});

// ===== PUERTO Y LANZAMIENTO =====
const PORT = process.env.PORT || 8080;
const AUTO_START_BOT = process.env.AUTO_START_BOT === 'true' || false;
const TEST_COMMERCE_ID = process.env.TEST_COMMERCE_ID || "comercio_principal";
const TEST_PHONE_NUMBER = process.env.TEST_PHONE_NUMBER || "";

app.listen(Number(PORT), '0.0.0.0', async () => {
    console.log(`🚀 Senda API ejecutándose en el puerto ${PORT}`);
    console.log(`📱 Auto-start bot: ${AUTO_START_BOT ? 'Activado' : 'Desactivado'}`);

    // Iniciar bot solo si está configurado
    if (AUTO_START_BOT && TEST_PHONE_NUMBER) {
        try {
            console.log(`🤖 Iniciando automáticamente el bot de WhatsApp para ${TEST_PHONE_NUMBER}...`);
            await startWhatsAppBotForCommerce(TEST_COMMERCE_ID, TEST_PHONE_NUMBER, false);
        } catch (error) {
            console.error("❌ Error al iniciar el bot de WhatsApp al arrancar:", error);
        }
    }
});