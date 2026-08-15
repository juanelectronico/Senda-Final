<<<<<<< HEAD
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FiscalData } from '../types/index.js';

// Inicializa tu instancia de Google Gen AI con tu API key de entorno
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export class GeminiExtractor {
  
  async extractFiscalData(message: string): Promise<Partial<FiscalData & { monto: number | null }> | null> {
    try {
      // Usamos el modelo más reciente y estable disponible (agosto 2026)
      const model = genAI.getGenerativeModel({ model: "gemini-3.7-flash" });
          const prompt = `Extrae los siguientes datos fiscales y el monto del texto del usuario: RFC, Razón Social, Régimen Fiscal, Uso CFDI, Código Postal, Correo electrónico y Monto.
      Texto: "${message}"
      
      Reglas:
      1. Devuelve estrictamente un objeto JSON plano.
      2. Llaves exactas: "rfc", "razonSocial", "regimenFiscal", "usoCFDI", "codigoPostal", "email", "monto".
      3. Si falta algún dato, usa null.
      4. Si el monto existe, extrae solo el valor numérico.
      5. No incluyas explicaciones, bloques markdown ni formato de código; solo el JSON puro.`;
=======
// src/features/fiscal/services/geminiExtractor.ts

import { GoogleGenerativeAI } from '@google/generative-ai';
import { FiscalData } from '../types/index.js';

export class GeminiExtractor {
  private genAI: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY no está configurada');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async extractFiscalData(message: string): Promise<Partial<FiscalData> | null> {
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
>>>>>>> 9982343a0714c4a282235e500e86481e4627361f

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
<<<<<<< HEAD
      // Limpieza robusta por si acaso el modelo incluye formato markdown
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedData = JSON.parse(cleanJson);

      // Conversión y validación de tipo para el monto
      if (parsedData.monto !== null && parsedData.monto !== undefined) {
        parsedData.monto = parseFloat(parsedData.monto);
        if (isNaN(parsedData.monto)) parsedData.monto = null;
      }

      return parsedData;
      
    } catch (error) {
      console.error('❌ Error en GeminiExtractor:', error);
=======
      // Limpiar el texto (por si Gemini devuelve markdown)
      const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      return JSON.parse(cleanText);
    } catch (error) {
      console.error('Error extrayendo datos con Gemini:', error);
>>>>>>> 9982343a0714c4a282235e500e86481e4627361f
      return null;
    }
  }
}