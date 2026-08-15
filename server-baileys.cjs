const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { MercadoPagoConfig, Preference } = require('mercadopago');
require('dotenv').config();

// ===== LOGS DE DEPURACIÓN PARA ENCONTRAR EL ERROR =====
console.log('🚀 1. Iniciando servidor...');
console.log('📦 2. Variables cargadas:', {
  db: !!process.env.DATABASE_URL,
  mp: !!process.env.MP_ACCESS_TOKEN
});

const prisma = new PrismaClient();
console.log('✅ 3. Prisma conectado');

const app = express();
console.log('✅ 4. Express creado');

// 1. Configurar Mercado Pago (Nueva forma para v2+)
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN 
});
console.log('✅ 5. Mercado Pago configurado');

app.use(express.json());

// --- RUTA PARA REGISTRAR EL COMERCIO Y CREAR PAGO ---
app.post('/api/commerce/register', async (req, res) => {
    try {
        const { 
            rfc, business_name, tax_regime, zip_code, phone, email, 
            csd_cer_base64, csd_key_base64, csd_password 
        } = req.body;

        if (!rfc || !business_name || !phone || !email) {
            return res.status(400).json({ 
                success: false, 
                error: 'Faltan datos obligatorios (RFC, Razón Social, Teléfono o Correo)' 
            });
        }

        // 2. Crear el comercio en la base de datos
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
                is_active: false
            }
        });

        console.log('✅ Comercio registrado en BD:', newCommerce.id);

        // 3. Crear la preferencia de pago en Mercado Pago (Nueva forma)
        const preferenceData = {
            body: {
                items: [
                    {
                        title: `Activación Senda - ${business_name}`,
                        quantity: 1,
                        currency_id: 'MXN',
                        unit_price: 50.00 // El costo de activación
                    }
                ],
                payer: {
                    email: email
                },
                back_urls: {
                    success: 'http://localhost:3000/pago-exitoso',
                    failure: 'http://localhost:3000/pago-fallido',
                    pending: 'http://localhost:3000/pago-pendiente'
                },
                auto_return: 'approved',
                metadata: {
                    commerce_id: newCommerce.id
                }
            }
        };

        const preference = new Preference(client);
        const mpResponse = await preference.create(preferenceData);
        
        const init_point = mpResponse.init_point;
        const preferenceId = mpResponse.id;

        console.log(`🔗 Link de pago generado: ${init_point}`);

        // 4. Responder al frontend con el link de pago
        res.status(201).json({ 
            success: true, 
            message: 'Comercio registrado', 
            data: newCommerce,
            init_point: init_point,
            preference_id: preferenceId
        });

    } catch (error) {
        console.error('❌ Error al registrar comercio:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// --- INICIAR EL SERVIDOR ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor de Senda escuchando en el puerto ${PORT}`);
});