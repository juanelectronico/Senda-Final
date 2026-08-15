// src/features/fiscal/services/merchantNotifier.ts

<<<<<<< HEAD
export class MerchantNotifier {
  constructor(
    // Si tu repositorio de comercios o base de datos se inyecta por constructor, ponlo aquí:
    // private merchantRepository?: any 
  ) {}

  async notifyNewInvoice(sock: any, fiscalData: any, commerceId: string): Promise<string | null> {
    try {
      if (!sock) {
        console.warn('⚠️ No se pudo notificar al comercio: Falta el socket de WhatsApp.');
        return null;
      }

      // 1. OBTENER EL NÚMERO DEL COMERCIO DESDE LA BASE DE DATOS DE FORMA DINÁMICA
      // Reemplaza esta línea con la consulta real a tu BD o repositorio según tu arquitectura:
      // Ejemplo: const merchant = await this.merchantRepository.findById(commerceId);
      // const merchantNumber = merchant?.whatsappNumber;
      
      const merchantNumber = await this.getMerchantWhatsAppNumberFromDB(commerceId);

      if (!merchantNumber) {
        console.warn(`⚠️ El comercio con ID "${commerceId}" no tiene un número de WhatsApp registrado en la base de datos.`);
        return null;
      }

      // 2. Formatear correctamente el JID para Baileys / WhatsApp
      const merchantJid = merchantNumber.includes('@s.whatsapp.net') || merchantNumber.includes('@c.us') 
        ? merchantNumber 
        : `${merchantNumber}@s.whatsapp.net`;

      const messageText = `🔔 *NUEVA SOLICITUD DE FACTURA*\n\n` +
        `📌 *RFC:* ${fiscalData.rfc}\n` +
        `🏢 *Razón Social:* ${fiscalData.razonSocial}\n` +
        `⚖️ *Régimen Fiscal:* ${fiscalData.regimenFiscal}\n` +
        `📄 *Uso CFDI:* ${fiscalData.usoCFDI}\n` +
        `📮 *Código Postal:* ${fiscalData.codigoPostal}\n` +
        `📧 *Correo:* ${fiscalData.email}\n` +
        `💵 *Monto:* $${fiscalData.monto || 0}\n\n` +
        `Por favor, verifica y confirma la emisión de esta factura.`;

      // 3. Enviar el mensaje real al WhatsApp del comercio
      await sock.sendMessage(merchantJid, { text: messageText });
      console.log(`📨 Notificación enviada exitosamente al comercio ${commerceId} (${merchantJid})`);
      return merchantJid;

    } catch (error) {
      console.error('❌ Error notificando al comercio por WhatsApp:', error);
      return null;
    }
  }

  // Método auxiliar simulado para consultar la BD (conéctalo aquí con tu modelo o Prisma/TypeORM/Supabase)
  private async getMerchantWhatsAppNumberFromDB(commerceId: string): Promise<string | null> {
    // TODO: Implementa tu consulta real a base de datos.
    // Ejemplo con Prisma:
    // const record = await prisma.merchant.findUnique({ where: { id: commerceId } });
    // return record?.whatsappNumber || null;

    return null; 
  }

  async notifyMerchantConfirmation(invoiceId: string): Promise<void> {
    console.log(`✅ Factura ${invoiceId} confirmada por el comercio`);
=======
import { Invoice } from '../types/index.js';

export class MerchantNotifier {
  async notifyNewInvoice(invoice: Invoice): Promise<void> {
    try {
      // TODO: Aquí se implementará la notificación al comercio
      // Por ahora solo mostramos en consola
      console.log('📨 Notificando al comercio:', {
        invoiceId: invoice.id,
        cliente: invoice.fiscalData.razonSocial,
        rfc: invoice.fiscalData.rfc,
        monto: invoice.monto || 0,
        status: invoice.status
      });

      // Aquí irá la lógica para enviar mensaje por WhatsApp al comercio
      // Ejemplo:
      // await this.whatsappClient.sendMessage({
      //   to: process.env.MERCHANT_WHATSAPP_NUMBER,
      //   text: `Nueva factura pendiente: ${invoice.fiscalData.razonSocial}`
      // });
      
    } catch (error) {
      console.error('Error notificando al comercio:', error);
    }
  }

  async notifyMerchantConfirmation(invoiceId: string): Promise<void> {
    console.log(`✅ Factura ${invoiceId} confirmada por el comercio`);
    // Aquí irá la lógica de confirmación
>>>>>>> 9982343a0714c4a282235e500e86481e4627361f
  }

  async notifyMerchantRejection(invoiceId: string, reason: string): Promise<void> {
    console.log(`❌ Factura ${invoiceId} rechazada. Motivo: ${reason}`);
<<<<<<< HEAD
=======
    // Aquí irá la lógica de rechazo
>>>>>>> 9982343a0714c4a282235e500e86481e4627361f
  }
}