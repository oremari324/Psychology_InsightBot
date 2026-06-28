/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from 'react';

export default function App() {
  const [question, setQuestion] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAnalysis('');

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        setAnalysis(`⚠️ ببورە، خەلەتیەک پەیدا بوو:\n\n${data.error || 'ئاریشەکا نەدیار د شیکارکرنێ دا'}`);
      } else {
        setAnalysis(data.analysis);
      }
    } catch (error) {
      console.error(error);
      setAnalysis('⚠️ ببورە، خەلەتیەک د گەهاندنا سەرڤەری دا پەیدا بوو. هیڤیە هێلا ئینتەرنێتێ یان رێکخستنێن ئەپلیکەیشنێ پشتڕاست بکە.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] font-serif p-6">
      <header className="max-w-3xl mx-auto mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-[var(--accent)] mb-2 uppercase border-b border-[var(--accent)] pb-4">
          شرۆڤەکارێ ئەکادیمی
        </h1>
        <p className="text-[var(--text-secondary)]">
          شرۆڤەکرنا زانستی و ئەکادیمی بۆ پسیارێن قوتابیان ب بەهدینییا پەتی
        </p>
      </header>

      <main className="max-w-3xl mx-auto">
        <form onSubmit={handleSubmit} className="bg-[var(--surface)] p-6 rounded-md shadow-sm border border-[var(--border)] mb-8">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="پسیار یان بابەتا خۆ ل ڤێرێ بنڤیسە..."
            className="w-full h-32 p-4 bg-[var(--bg)] border border-[var(--border)] rounded-sm mb-1 focus:ring-1 focus:ring-[var(--accent)] focus:outline-none"
            required
          />
          <div className="text-right text-xs text-[var(--text-secondary)] mb-4">
            {question.length} / 1000 کارەکتەر
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--accent)] text-[var(--bg)] font-bold py-3 rounded-sm hover:opacity-90 transition disabled:opacity-50 uppercase tracking-wider"
          >
            {loading ? '⏳ یێ شرۆڤە دکەت...' : '🔍 شرۆڤە بکە'}
          </button>
        </form>

        {analysis && (
          <div className="bg-[var(--surface)] p-8 rounded-md shadow-sm border border-[var(--border)]">
            <h2 className="text-2xl font-bold text-[var(--accent)] mb-6 uppercase tracking-wider">ئەنجامێ شیکاریێ</h2>
            <div className="prose prose-invert max-w-none text-[var(--text-primary)] whitespace-pre-wrap leading-loose">
              {analysis}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
