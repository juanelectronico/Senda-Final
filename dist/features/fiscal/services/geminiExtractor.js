<<<<<<< HEAD
mport { GoogleGenerativeAI } from '@google/generative-ai';
import { FiscalData } from '../types/index.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export class GeminiExtractor {
  
  async extractFiscalData(message: string, retries = 3): Promise<Partial<FiscalData & { monto: number | null }> | null> {
    const model = genAI.getGenerativeModel({ model: "gemini-3.7-flash" });
  
    const prompt = `Extrae los siguientes datos fiscales y el monto del texto del usuario: RFC, Razón Social, Régimen Fiscal, Uso CFDI, Código Postal, Correo electrónico y Monto.
    Texto: "${message}"
    
    Reglas:
    1. Devuelve estrictamente un objeto JSON plano.
    2. Llaves exactas: "rfc", "razonSocial", "regimenFiscal", "usoCFDI", "codigoPostal", "email", "monto".
    3. Si falta algún dato, usa null.
    4. Si el monto existe, extrae solo el valor numérico.
    5. No incluyas explicaciones ni bloques markdown de código; solo el JSON puro.`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedData = JSON.parse(cleanJson);

        if (parsedData.monto !== null && parsedData.monto !== undefined) {
          parsedData.monto = parseFloat(parsedData.monto);
          if (isNaN(parsedData.monto)) parsedData.monto = null;
        }

        return parsedData;
        
      } catch (error: any) {
        console.warn(`⚠️ [GeminiExtractor] Intento ${attempt}/${retries} fallido (Código ${error?.status || 'Desconocido'}):`, error.message);
        
        // Si es error 503 (alta demanda), esperamos un par de segundos antes de reintentar
        if (attempt < retries) {
          await new Promise(res => setTimeout(res, 2000 * attempt));
          continue;
        }
        
        console.error('❌ Error definitivo en GeminiExtractor:', error);
        return null;
      }
    }
    return null;
  }
}
=======
// src/features/fiscal/services/geminiExtractor.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
export class GeminiExtractor {
    genAI;
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY no está configurada');
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
    }
    async extractFiscalData(message) {
        try {
            const model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
            const prompt = `
      Extrae los datos fiscales del siguiente mensaje. 
      Busca: RFC, Razón Social, Régimen Fiscal, Uso CFDI, Código Postal, Correo electrónico.
      
      Mensaje: "${message}"
      
      Responde SOLO con un objeto JSON con estos campos:
      {
        "rfc": "string o null",
        "razonSocial": "string o null",
        "regimenFiscal": "string o null",
        "usoCFDI": "string o null",
        "codigoPostal": "string o null",
        "email": "string o null"
      }
      
      Si no encuentras un campo, ponlo como null.
      NO incluyas texto adicional, SOLO el JSON.
      `;
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            // Limpiar el texto (por si Gemini devuelve markdown)
            const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            return JSON.parse(cleanText);
        }
        catch (error) {
            console.error('Error extrayendo datos con Gemini:', error);
            return null;
        }
    }
}
>>>>>>> 9982343a0714c4a282235e500e86481e4627361f
