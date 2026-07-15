'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Status = 'passed' | 'review' | 'flagged';

interface DocumentDetails {
  id: string;
  applicant: string;
  document: string;
  confidence: string;
  status: string;
  processed_at?: string;
  raw: {
    source_file: string;
    category: string;
    processed_at: string;
    status: string;
    score: number;
    data: Record<string, any>;
    violations: string[];
    model_used: string;
    ocr_text?: string;
  };
}

const statusStyles: Record<Status, { bg: string; text: string; label: string }> = {
  passed: { bg: 'var(--bg-success)', text: 'var(--text-success)', label: 'Passed' },
  review: { bg: 'var(--bg-warning)', text: 'var(--text-warning)', label: 'Needs review' },
  flagged: { bg: 'var(--bg-danger)', text: 'var(--text-danger)', label: 'Fraud risk' },
};

export default function ReviewPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const id = decodeURIComponent(params.id);
  
  const [doc, setDoc] = useState<DocumentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showOcr, setShowOcr] = useState(false);

  useEffect(() => {
    // Read the document details directly from sessionStorage (POC: Client-side session state)
    const cachedQueue = sessionStorage.getItem('bank_idp_queue');
    if (cachedQueue) {
      const queue: DocumentDetails[] = JSON.parse(cachedQueue);
      const found = queue.find(item => item.id === id);
      if (found) {
        setDoc(found);
      }
    }
    setLoading(false);
  }, [id]);

  const handleUpdateStatus = (newStatus: 'passed' | 'escalated', newViolations?: string[]) => {
    if (!doc) return;
    
    // Map internal pipeline status
    const statusMapValue = newStatus === 'passed' ? 'passed' : 'escalated';
    const mappedUiStatus = newStatus === 'passed' ? 'passed' : 'review';

    // 1. Build updated document object
    const updatedDoc: DocumentDetails = {
      ...doc,
      status: mappedUiStatus,
      raw: {
        ...doc.raw,
        status: statusMapValue,
        violations: newViolations || []
      }
    };

    // 2. Update state
    setDoc(updatedDoc);

    // 3. Update sessionStorage
    const cachedQueue = sessionStorage.getItem('bank_idp_queue');
    if (cachedQueue) {
      const queue: DocumentDetails[] = JSON.parse(cachedQueue);
      const updatedQueue = queue.map(item => item.id === id ? updatedDoc : item);
      sessionStorage.setItem('bank_idp_queue', JSON.stringify(updatedQueue));
    }

    setSuccessMessage(`Document status successfully updated to ${newStatus === 'passed' ? 'PASSED' : 'ESCALATED'}`);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleDownloadJson = () => {
    if (!doc || !doc.raw) return;
    
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(doc.raw, null, 2)
    )}`;
    
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `${doc.raw.source_file.replace(/\.[^.]+$/, '')}_result.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  if (loading) {
    return (
      <div className="page-shell">
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <div className="spinner" style={{ margin: '0 auto 1.5rem' }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading document details...</p>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="page-shell">
        <div className="page-inner" style={{ flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)', padding: '1.5rem', borderRadius: 'var(--radius)', width: '100%', maxWidth: '600px', textAlign: 'center' }}>
            <p style={{ fontWeight: 600, margin: '0 0 10px' }}>Document Not Found</p>
            <p style={{ fontSize: 14, margin: '0 0 1.5rem' }}>This document is not in the active session. Closing tabs or logging out clears the local cache.</p>
            <button onClick={() => router.push('/dashboard')} style={{ background: 'var(--text-danger)', color: 'white', padding: '8px 16px', fontSize: 14 }}>
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { raw } = doc;
  const uiStatus: Status = doc.status === 'passed' ? 'passed' : (doc.status === 'flagged' ? 'flagged' : 'review');
  const statusConfig = statusStyles[uiStatus];

  const renderValue = (val: any): React.ReactNode => {
    if (val === null || val === undefined) return <span style={{ color: 'var(--text-muted)' }}>N/A</span>;
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      return <span>{String(val)}</span>;
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return <span style={{ color: 'var(--text-muted)' }}>Empty list</span>;
      if (typeof val[0] === 'object') {
        const keys = Object.keys(val[0]);
        return (
          <div style={{ overflowX: 'auto', marginTop: 8, border: '0.5px solid var(--border)', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '0.5px solid var(--border)' }}>
                  {keys.map(k => (
                    <th key={k} style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)' }}>
                      {k.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {val.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: idx < val.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
                    {keys.map(k => (
                      <td key={k} style={{ padding: '6px 12px', color: 'var(--text-primary)' }}>
                        {typeof item[k] === 'object' ? JSON.stringify(item[k]) : String(item[k])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      return <span>{val.join(', ')}</span>;
    }
    if (typeof val === 'object') {
      return (
        <div style={{ padding: '8px 12px', background: 'var(--surface-2)', borderRadius: '8px', border: '0.5px solid var(--border)', display: 'grid', gap: 4, marginTop: 4 }}>
          {Object.entries(val).map(([k, v]) => (
            <div key={k} style={{ fontSize: 13, display: 'flex', gap: 6 }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{k}:</span>
              <span>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
            </div>
          ))}
        </div>
      );
    }
    return String(val);
  };

  return (
    <div className="page-shell">
      <div className="page-inner" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
        
        {/* Header navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              background: 'transparent',
              color: 'var(--text-secondary)',
              padding: 0,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: 'none',
            }}
          >
            <i className="ti ti-arrow-left" aria-hidden="true" />
            Back to queue
          </button>
          
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={handleDownloadJson}
              style={{
                height: 34,
                padding: '0 12px',
                fontSize: 13,
                fontWeight: 600,
                background: 'var(--surface-2)',
                color: 'var(--text-primary)',
                border: '0.5px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: 'none'
              }}
            >
              <i className="ti ti-download" style={{ fontSize: 14 }} />
              Download JSON
            </button>
          </div>
        </div>

        {/* Toast success message */}
        {successMessage && (
          <div style={{ background: 'var(--bg-success)', color: 'var(--text-success)', padding: '10px 16px', borderRadius: 'var(--radius)', fontSize: 14, fontWeight: 500, border: '0.5px solid var(--text-success)' }}>
            <i className="ti ti-circle-check" style={{ marginRight: 8, verticalAlign: -2 }} />
            {successMessage}
          </div>
        )}

        {/* Main Review Section */}
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '1.5rem' }}>
          
          {/* Left panel - Extracted Data */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div
              style={{
                background: 'var(--surface-1)',
                border: '0.5px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '1.5rem',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px' }}>Extracted Fields</h2>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                    Automatically parsed document content
                  </p>
                </div>
                <span
                  style={{
                    background: statusConfig.bg,
                    color: statusConfig.text,
                    fontSize: 12,
                    padding: '4px 12px',
                    borderRadius: 'var(--radius)',
                    fontWeight: 600,
                  }}
                >
                  {statusConfig.label}
                </span>
              </div>

              <div style={{ display: 'grid', gap: '1.25rem' }}>
                {Object.entries(raw.data || {}).map(([key, val]) => (
                  <div key={key} style={{ borderBottom: '0.5px solid #f0f4fc', paddingBottom: '0.75rem' }}>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'capitalize', display: 'block', marginBottom: 4 }}>
                      {key.replace(/_/g, ' ')}
                    </label>
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {renderValue(val)}
                    </div>
                  </div>
                ))}
                {(!raw.data || Object.keys(raw.data).length === 0) && (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No data was extracted from this document.
                  </div>
                )}
              </div>
            </div>

            {/* Collapsible raw OCR Text */}
            <div style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              <button 
                onClick={() => setShowOcr(!showOcr)} 
                style={{ 
                  width: '100%', 
                  background: 'none', 
                  boxShadow: 'none', 
                  color: 'var(--text-primary)', 
                  padding: '1rem 1.5rem', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  fontWeight: 600,
                  borderRadius: 0
                }}
              >
                <span>Raw OCR Text</span>
                <i className={`ti ti-chevron-${showOcr ? 'up' : 'down'}`} style={{ fontSize: 16 }} />
              </button>
              {showOcr && (
                <div style={{ padding: '0 1.5rem 1.5rem', borderTop: '0.5px solid var(--border)' }}>
                  <pre style={{ 
                    margin: '1rem 0 0', 
                    padding: '1rem', 
                    background: 'var(--surface-2)', 
                    color: 'var(--text-secondary)', 
                    borderRadius: '8px', 
                    fontSize: 12, 
                    whiteSpace: 'pre-wrap', 
                    maxHeight: '300px', 
                    overflowY: 'auto',
                    fontFamily: 'monospace'
                  }}>
                    {raw.ocr_text || 'No OCR text available for this document.'}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Right panel - Stats, Violations, Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Score & Confidence Card */}
            <div
              style={{
                background: 'var(--surface-1)',
                border: '0.5px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '1.5rem',
                textAlign: 'center',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
              }}
            >
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 1rem' }}>Overall Confidence Score</p>
              
              <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' }}>
                <svg width={120} height={120}>
                  <circle cx={60} cy={60} r={50} fill="transparent" stroke="var(--border)" strokeWidth={10} />
                  <circle 
                    cx={60} 
                    cy={60} 
                    r={50} 
                    fill="transparent" 
                    stroke={uiStatus === 'passed' ? 'var(--text-success)' : (uiStatus === 'flagged' ? 'var(--text-danger)' : 'var(--text-warning)')} 
                    strokeWidth={10} 
                    strokeDasharray={2 * Math.PI * 50}
                    strokeDashoffset={2 * Math.PI * 50 * (1 - (raw.score || 0))}
                    strokeLinecap="round"
                    transform="rotate(-90 60 60)"
                  />
                </svg>
                <div style={{ position: 'absolute', fontSize: 24, fontWeight: 700 }}>
                  {raw.score !== undefined ? `${Math.round(raw.score * 100)}%` : 'N/A'}
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Source Document: <strong style={{ color: 'var(--text-secondary)' }}>{raw.source_file}</strong>
              </div>
            </div>

            {/* Violations / Business Rules Card */}
            <div
              style={{
                background: 'var(--surface-1)',
                border: '0.5px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '1.5rem',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
              }}
            >
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>System Violations</h3>
              
              {raw.violations && raw.violations.length > 0 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {raw.violations.map((v, i) => (
                    <div 
                      key={i} 
                      style={{ 
                        padding: '10px 12px', 
                        background: 'var(--bg-danger)', 
                        color: 'var(--text-danger)', 
                        borderRadius: '8px', 
                        fontSize: 13, 
                        display: 'flex', 
                        gap: 8,
                        alignItems: 'flex-start'
                      }}
                    >
                      <i className="ti ti-alert-triangle" style={{ marginTop: 2, flexShrink: 0 }} />
                      <span>{v}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div 
                  style={{ 
                    padding: '10px 12px', 
                    background: 'var(--bg-success)', 
                    color: 'var(--text-success)', 
                    borderRadius: '8px', 
                    fontSize: 13, 
                    display: 'flex', 
                    gap: 8,
                    alignItems: 'center'
                  }}
                >
                  <i className="ti ti-circle-check" />
                  <span>Document satisfies all validation rules.</span>
                </div>
              )}
            </div>

            {/* Decisions and actions */}
            <div
              style={{
                background: 'var(--surface-1)',
                border: '0.5px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '1.5rem',
                display: 'grid',
                gap: 12,
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
              }}
            >
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>Compliance Actions</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                Verify and change the verification status of this customer onboarding file.
              </p>

              <button
                disabled={uiStatus === 'passed'}
                onClick={() => handleUpdateStatus('passed')}
                style={{
                  height: 40,
                  fontSize: 14,
                  fontWeight: 600,
                  background: 'var(--text-success)',
                  opacity: uiStatus === 'passed' ? 0.5 : 1,
                  cursor: uiStatus === 'passed' ? 'not-allowed' : 'pointer',
                  boxShadow: '0 10px 24px rgba(28, 122, 77, 0.15)',
                }}
              >
                <i className="ti ti-check" style={{ marginRight: 6, verticalAlign: -1 }} />
                Approve document
              </button>

              <button
                disabled={uiStatus === 'flagged'}
                onClick={() => handleUpdateStatus('escalated', ['Flagged manually as fraud/risky document by compliance reviewer'])}
                style={{
                  height: 40,
                  fontSize: 14,
                  fontWeight: 600,
                  background: 'var(--text-danger)',
                  opacity: uiStatus === 'flagged' ? 0.5 : 1,
                  cursor: uiStatus === 'flagged' ? 'not-allowed' : 'pointer',
                  boxShadow: '0 10px 24px rgba(179, 38, 30, 0.15)',
                }}
              >
                <i className="ti ti-flag" style={{ marginRight: 6, verticalAlign: -1 }} />
                Flag fraud risk
              </button>
            </div>

          </div>
        </div>

      </div>
      
      <style jsx global>{`
        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid var(--border);
          border-top: 4px solid var(--text-accent);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
