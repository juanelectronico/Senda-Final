const express = require('express');
const bodyParser = require('body-parser');
const { MessagingResponse } = require('twilio').twiml;
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json()); // ¡Importante para leer el JSON del formulario!

const NUMERO_DUEÑO_COMERCIO = 'whatsapp:+5215670500038'; // Pon aquí tu número para las pruebas

// --- RUTA PARA REGISTRAR EL COMERCIO DESDE EL FORMULARIO WEB ---
app.post('/api/commerce/register', async (req, res) => {
    try {
        const { rfc, business_name, tax_regime, zip_code, phone, email, csd_cer_base64, csd_key_base64, csd_password } = req.body;

        // Validación básica de datos
        if (!rfc || !business_name || !phone || !email) {
            return res.status(400).json({ success: false, error: 'Faltan datos obligatorios (RFC, Razón Social, Teléfono o Correo)' });
        }

        // Crear el comercio en la base de datos de Supabase
        const newCommerce = await prisma.commerce.create({
            data: {
                rfc,
                business_name,
                tax_regime,
                zip_code,
                phone,
                email,
                csd_cer_base64,
                csd_key_base64,
                csd_password,
                is_active: false // Recién registrado, sin activar
            }
        });

        console.log('✅ Comercio registrado exitosamente en BD:', newCommerce.id);
        res.status(201).json({ success: true, message: 'Comercio registrado', data: newCommerce });

    } catch (error) {
        console.error('❌ Error al registrar comercio:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- RUTA DE WHATSAPP (WEBHOOK) ---
app.post('/webhook', async (req, res) => {
    const twiml = new MessagingResponse();
    const mensajeRecibido = req.body.Body.trim();
    const numeroQuienEscribe = req.body.From;
    const numeroDondeLlego = req.body.To;

    console.log(`\n📱 Mensaje de ${numeroQuienEscribe}: "${mensajeRecibido}"`);

    if (numeroQuienEscribe === NUMERO_DUEÑO_COMERCIO) {
        if (mensajeRecibido === '1') {
            twiml.message('✅ ¡Perfecto! Factura aprobada y timbrada con éxito. Enviando archivos al cliente...');
            console.log('📢 El comercio aprobó la factura.');
        } else if (mensajeRecibido === '2') {
            twiml.message('❌ Factura rechazada y cancelada.');
            console.log('📢 El comercio rechazó la factura.');
        } else {
            twiml.message('Senda Admin 🤖: Responde "1" para aprobar la factura pendiente o "2" para rechazarla.');
        }
    } else {
        twiml.message(`¡Hola! Recibimos tu solicitud para facturar en este comercio. 🧾\n\nPor favor, responde a este mensaje únicamente con tu **RFC** para comenzar.`);
        console.log(`📢 Cliente solicitando factura. Avisando al dueño...`);
    }

    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml.toString());
});

// --- INICIAR EL SERVIDOR ---
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor de Senda escuchando en el puerto ${PORT}`);
});