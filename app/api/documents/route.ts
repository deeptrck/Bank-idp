import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

const getBackendRoot = () => {
  return path.join(process.cwd(), '..');
};

// GET: returns seed documents to initialize the frontend session storage
export async function GET() {
  try {
    const backendRoot = getBackendRoot();
    const files = ['sample_multipage_invoice_result.json', 'فاتورة_result.json'];
    
    const results = [];
    
    for (const file of files) {
      const filePath = path.join(backendRoot, file);
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

// POST: uploads a document, runs the pipeline, returns result, and CLEANS UP local files
export async function POST(request: NextRequest) {
  let filePath = '';
  let resultFilePath = '';
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const category = (formData.get('category') as string) || 'financial';
    
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const backendRoot = getBackendRoot();
    
    // Ensure uploads directory exists
    const uploadsDir = path.join(backendRoot, 'uploads');
    await fs.mkdir(uploadsDir, { recursive: true });
    
    // Generate a strictly ASCII-safe unique filename to prevent shell encoding bugs on Windows
    const fileExtension = path.extname(file.name);
    const uniqueFilename = `uploaded_${Date.now()}${fileExtension}`;
    filePath = path.join(uploadsDir, uniqueFilename);
    
    await fs.writeFile(filePath, buffer);
    
    // Path to python executable in .venv
    const pythonExec = path.join(backendRoot, '.venv', 'Scripts', 'python.exe');
    const mainScript = path.join(backendRoot, 'main.py');
    
    // Run main.py using .venv python
    const command = `"${pythonExec}" "${mainScript}" "${filePath}" "${category}"`;
    
    console.log(`Running pipeline command: ${command}`);
    
    let stderr = '';
    
    try {
      const result = await execPromise(command, { cwd: backendRoot });
      console.log('Pipeline stdout:', result.stdout);
    } catch (execError: any) {
      console.error('Pipeline command failed:', execError);
      stderr = execError.stderr || '';
    }
    
    // The pipeline saves output as <stem>_result.json next to the uploaded document
    const resultStem = path.basename(uniqueFilename, fileExtension);
    resultFilePath = path.join(uploadsDir, `${resultStem}_result.json`);
    
    let finalResultData: any = null;
    
    try {
      const resultContent = await fs.readFile(resultFilePath, 'utf-8');
      finalResultData = JSON.parse(resultContent);
      // Restore original file name for POC metadata display
      finalResultData.source_file = file.name;
    } catch (readError) {
      console.error('Could not read result JSON from pipeline:', readError);
      finalResultData = {
        source_file: file.name,
        category: category,
        processed_at: new Date().toISOString(),
        status: 'escalated',
        score: 0.0,
        data: {},
        violations: [`Pipeline execution failed. Stderr: ${stderr.slice(0, 200)}`],
        model_used: 'none'
      };
    }
    
    // Clean up backend storage immediately (POC requirement: no persistent backend files)
    try {
      await fs.unlink(filePath);
      if (await fileExists(resultFilePath)) {
        await fs.unlink(resultFilePath);
      }
      console.log('Cleaned up processed temp files successfully.');
    } catch (cleanupError) {
      console.error('Error during temp files cleanup:', cleanupError);
    }
    
    return NextResponse.json({
      id: `${resultStem}`,
      applicant: getApplicantFromData(finalResultData),
      document: getDocumentTypeFromData(finalResultData),
      confidence: finalResultData.score !== undefined ? `${Math.round(finalResultData.score * 100)}%` : 'N/A',
      status: mapStatus(finalResultData.status, finalResultData.violations),
      processed_at: finalResultData.processed_at || new Date().toISOString(),
      raw: finalResultData
    });
    
  } catch (error: any) {
    console.error('Error processing document:', error);
    
    // Try to clean up in case of top-level failures
    try {
      if (filePath && await fileExists(filePath)) await fs.unlink(filePath);
      if (resultFilePath && await fileExists(resultFilePath)) await fs.unlink(resultFilePath);
    } catch {}
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Helper to check if file exists
async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
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
  
  if (violations && violations.some(v => v.toLowerCase().includes('failed') || v.toLowerCase().includes('empty') || v.toLowerCase().includes('denied'))) {
    return 'flagged';
  }
  
  return 'review';
}
