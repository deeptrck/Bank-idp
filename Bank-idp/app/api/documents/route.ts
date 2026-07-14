import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Helper to resolve seed files path
const getSeedsDir = () => {
  return path.join(process.cwd(), 'app', 'api', 'documents', 'seeds');
};

// GET: returns seed documents to initialize the frontend session storage
export async function GET() {
  try {
    const seedsDir = getSeedsDir();
    const files = ['sample_multipage_invoice_result.json', 'فاتورة_result.json'];
    
    const results = [];
    
    for (const file of files) {
      const filePath = path.join(seedsDir, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        
        results.push({
          id: file.replace('_result.json', ''),
          applicant: getApplicantFromData(data),
          document: getDocumentTypeFromData(data),
          confidence: data.score !== undefined ? `${Math.round(data.score * 100)}%` : 'N/A',
          status: mapStatus(data.status, data.violations),
          processed_at: data.processed_at || new Date().toISOString(),
          raw: data
        });
      } catch (e) {
        console.error(`Failed to read seed file ${file}:`, e);
      }
    }
    
    return NextResponse.json(results);
  } catch (error: any) {
    console.error('Error fetching seed documents:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: uploads a document, runs the extraction, calls Groq directly, and returns the result (100% in-memory, zero backend disk storage)
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const category = (formData.get('category') as string) || 'financial';
    
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileExtension = path.extname(file.name).toLowerCase();
    
    let fullText = '';
    
    // 1. Text extraction in pure JS/TS (compatible with Vercel)
    if (fileExtension === '.pdf') {
      try {
        const { extractText, getDocumentProxy } = require('unpdf');
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        const { text } = await extractText(pdf);
        fullText = Array.isArray(text) ? text.join('\n\n') : (text || '');
      } catch (pdfError: any) {
        console.error('PDF text extraction failed:', pdfError);
        throw new Error(`PDF text extraction failed: ${pdfError.message}`);
      }
    } else if (fileExtension === '.docx') {
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        fullText = result.value || '';
      } catch (docxError: any) {
        console.error('DOCX text extraction failed:', docxError);
        throw new Error(`DOCX text extraction failed: ${docxError.message}`);
      }
    } else {
      return NextResponse.json({ error: `Unsupported file extension: ${fileExtension}` }, { status: 400 });
    }
    
    // Check if empty
    if (!fullText.trim()) {
      const emptyResult = {
        source_file: file.name,
        category: category,
        processed_at: new Date().toISOString(),
        status: 'escalated',
        score: 0.0,
        data: {},
        violations: ['Document contains no readable digital text.'],
        model_used: 'none',
        ocr_text: ''
      };
      
      return NextResponse.json({
        id: `uploaded_${Date.now()}`,
        applicant: getApplicantFromData(emptyResult),
        document: getDocumentTypeFromData(emptyResult),
        confidence: '0%',
        status: 'review',
        processed_at: emptyResult.processed_at,
        raw: emptyResult
      });
    }
    
    // 2. Language Routing
    const sample = fullText.trim().slice(0, 800);
    let arabicCount = 0;
    for (let i = 0; i < sample.length; i++) {
      const c = sample.charCodeAt(i);
      if (c >= 0x0600 && c <= 0x06FF) {
        arabicCount++;
      }
    }
    const isArabic = (arabicCount / Math.max(sample.length, 1)) > 0.15;
    const modelUsed = isArabic ? 'openai/gpt-oss-120b' : 'llama-3.3-70b-versatile';
    
    // 3. Prompt Construction
    const requiredHints = `  - invoice_number: Unique invoice identifier / reference number
  - invoice_date: Date the invoice was issued — output as YYYY-MM-DD
  - bill_to: Name and/or address of the entity being billed
  - vendor: Name and/or address of the issuing vendor / seller
  - payment_terms: Payment terms (e.g. Net 30, Due on receipt, 14 days)
  - total_amount: Total amount due — numeric only, no currency symbol`;
  
    const systemPrompt = `You are a document extraction assistant.

Extract ALL information present in the OCR text of a ${category} document.

Priority fields (these will be validated — you MUST include them in "data" using exactly these key names if found in the document):
${requiredHints}

Extraction instructions
-----------------------
- Extract every piece of information in the document — do not skip anything.
- You decide how to name and organise the remaining fields. Use clear, descriptive key names that match the document's own language and structure.
- For tables, represent each row as an object in an array.
- For currency, include the ISO 4217 code or symbol alongside amounts.
- For free text (notes, disclaimers, instructions), include it under a descriptive key.
- Do NOT invent or compute values that are not present in the text.
- Do NOT omit content just because it doesn't match a known field name.

Response format (strict envelope — data content is your decision)
-----------------------------------------------------------------
Respond with ONLY a single JSON object — no markdown, no code fences, no commentary before or after.

{
  "data": {
    <all extracted fields — you decide the keys, types, and nesting>
  },
  "confidence": <float 0.0–1.0, your overall confidence in the extraction>,
  "field_confidence": {
    <one entry per priority field listed above, float 0.0–1.0>
  },
  "issues": [
    "<describe any missing required fields, ambiguous values, or OCR errors>"
  ]
}

OCR text to process:
---
${fullText}
---`;

    // 4. Call Groq API via Fetch
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      throw new Error('Missing GROQ_API_KEY environment variable');
    }
    
    console.log(`Sending extraction request to Groq API via model: ${modelUsed}`);
    const apiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelUsed,
        messages: [{ role: 'user', content: systemPrompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });
    
    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      throw new Error(`Groq API returned status ${apiResponse.status}: ${errorBody}`);
    }
    
    const apiResponseJson = await apiResponse.json();
    const rawContent = apiResponseJson.choices?.[0]?.message?.content || '';
    
    // 5. Parse LLM response
    let cleaned = rawContent.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }
    
    const parsed = JSON.parse(cleaned);
    
    // 6. Apply Validation Rules
    const data = parsed.data || {};
    const confidence = parsed.confidence !== undefined ? parsed.confidence : 1.0;
    const fieldConfidence = parsed.field_confidence || {};
    const violations: string[] = [];
    
    // Check overall confidence
    if (typeof confidence === 'number' && confidence < 0.75) {
      violations.push(`Overall confidence ${confidence.toFixed(2)} is below threshold 0.75`);
    }
    
    const status = violations.length === 0 ? 'passed' : 'escalated';
    
    const finalResultData = {
      source_file: file.name,
      category: category,
      processed_at: new Date().toISOString(),
      status,
      score: typeof confidence === 'number' ? confidence : 0.0,
      data,
      violations,
      model_used: modelUsed,
      ocr_text: fullText
    };
    
    const uniqueId = `uploaded_${Date.now()}`;
    
    return NextResponse.json({
      id: uniqueId,
      applicant: getApplicantFromData(finalResultData),
      document: getDocumentTypeFromData(finalResultData),
      confidence: finalResultData.score !== undefined ? `${Math.round(finalResultData.score * 100)}%` : 'N/A',
      status: mapStatus(finalResultData.status, finalResultData.violations),
      processed_at: finalResultData.processed_at,
      raw: finalResultData
    });
    
  } catch (error: any) {
    console.error('Error processing document in serverless route:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function getApplicantFromData(data: any): string {
  if (!data || !data.data) return 'Unknown Applicant';
  
  // Try to find a bill_to name or applicant name
  const billTo = data.data.bill_to;
  if (billTo) {
    if (typeof billTo === 'string') return billTo.split('\n')[0].split(',')[0].trim();
    if (typeof billTo === 'object' && billTo.name) return billTo.name;
  }
  
  const vendor = data.data.vendor;
  if (vendor) {
    if (typeof vendor === 'string') return vendor.split('\n')[0].trim();
    if (typeof vendor === 'object' && vendor.name) return vendor.name;
  }
  
  if (data.source_file) {
    return data.source_file
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();
  }
  
  return 'New Applicant';
}

function getDocumentTypeFromData(data: any): string {
  if (data && data.category) {
    if (data.category === 'financial') return 'Invoice';
    return data.category.charAt(0).toUpperCase() + data.category.slice(1);
  }
  return 'Uploaded Document';
}

function mapStatus(backendStatus: string, violations: string[]): string {
  if (backendStatus === 'passed') return 'passed';
  return 'review';
}
