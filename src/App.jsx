import React, { useState, useEffect, useRef } from 'react';
import {
  BookMarked, Plus, Search, Trash2,
  Globe, Sparkles, X, Download, Upload
} from 'lucide-react';
import seedWords from './initialWords.js';

const POS_LIST = ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'idiom'];
const POS_RE = new RegExp('\\(\\s*(' + POS_LIST.join('|') + ')\\s*\\)', 'i');

const STORAGE_KEY = 'lexicon_dictionary_v2';

const splitIntoSegments = (raw) => {
  const text = (raw || '').trim();
  if (!text) return [];

  // If multiple headwords are present (each starting a new line with a
  // word followed by : - — or ( ), split the text at those boundaries so
  // multiline meanings stay attached to their word.
  const re = /^[A-Za-z][\w'’.-]{0,40}\s*[:\-–—(]/gm;
  const starts = [];
  let m;
  while ((m = re.exec(text)) !== null) starts.push(m.index);

  if (starts.length > 1) {
    const segments = [];
    for (let i = 0; i < starts.length; i++) {
      const end = i + 1 < starts.length ? starts[i + 1] : text.length;
      segments.push(text.slice(starts[i], end).trim());
    }
    return segments;
  }

  // Otherwise fall back to blank-line separated blocks.
  return text.split(/\n\s*\n+/).map(s => s.trim()).filter(Boolean);
};

const parseMultiple = (raw) => {
  return splitIntoSegments(raw)
    .map(parsePastedText)
    .filter(e => e && e.word && e.definition);
};

const parsePastedText = (raw) => {
  let text = (raw || '').trim();
  if (!text) return null;

  let partOfSpeech = 'noun';
  const posMatch = text.match(POS_RE);
  if (posMatch) {
    partOfSpeech = posMatch[1].toLowerCase();
    text = text.replace(posMatch[0], ' ').replace(/\s+/g, ' ').trim();
  }

  let word = '';
  let body = text;

  const delim = text.match(/^([^\n:–—-]{1,60}?)\s*[:–—-]\s*([\s\S]+)$/);
  if (delim && delim[1].trim().split(/\s+/).length <= 4) {
    word = delim[1].trim();
    body = delim[2].trim();
  } else {
    const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1 && lines[0].split(/\s+/).length <= 4) {
      word = lines[0];
      body = lines.slice(1).join(' ').trim();
    } else {
      const firstSent = text.split(/(?<=[.!?])\s+/)[0].replace(/[.!?]+$/, '');
      if (firstSent.split(/\s+/).length === 1 && firstSent.length > 0) {
        word = firstSent;
        body = text.slice(firstSent.length).replace(/^[.!?]+\s*/, '').trim();
      }
    }
  }

  const sentences = body.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  let definition = body;
  let example = '';
  if (sentences.length > 1) {
    definition = sentences[0];
    example = sentences.slice(1).join(' ');
  } else if (sentences.length === 1) {
    definition = sentences[0];
  }

  return {
    word: word.replace(/\s+/g, ' ').trim(),
    partOfSpeech,
    definition: definition.trim(),
    example: example.trim()
  };
};

const normalizeWord = (w) => {
  if (Array.isArray(w.definitions) && w.definitions.length > 0) return w;
  return {
    ...w,
    definitions: [{ definition: w.definition || '', example: w.example || '' }]
  };
};

const INITIAL_WORDS = seedWords;

export default function App() {
  const fileInputRef = useRef(null);
  const [words, setWords] = useState(() => {
    localStorage.removeItem('lexicon_dictionary');
    const saved = localStorage.getItem(STORAGE_KEY);
    const base = saved ? JSON.parse(saved) : INITIAL_WORDS;
    return base.map(normalizeWord);
  });
  
  const [selectedId, setSelectedId] = useState(words[0]?.id || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [apiQuery, setApiQuery] = useState('');

  const entries = parseMultiple(pastedText);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  }, [words]);

  const filteredWords = words.filter(item => {
    const matchesSearch = item.word.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const activeWord = words.find(w => w.id === selectedId) || filteredWords[0];

  // Fetch meanings from Free Dictionary API and drop them into the paste box
  const fetchFromApi = async (query) => {
    if (!query.trim()) return;
    setApiLoading(true);
    setApiError('');
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Word not found in free dictionary service.');
      const data = await res.json();
      const entry = data[0];
      const meaning = entry.meanings[0];
      const word = entry.word;
      const definition = meaning.definitions[0]?.definition || '';
      const example = meaning.definitions[0]?.example || '';
      const pos = meaning.partOfSpeech || 'noun';
      setPastedText(`${word} (${pos}): ${definition}${example ? ' ' + example : ''}`);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setApiLoading(false);
    }
  };

  const handleAddParsed = () => {
    if (entries.length === 0) return;

    const updated = [...words];
    let firstNewId = null;

    for (const e of entries) {
      const def = e.definition.trim();
      const ex = e.example.trim();
      const existingIdx = updated.findIndex(
        w => w.word.toLowerCase() === e.word.toLowerCase()
      );

      if (existingIdx === -1) {
        const id = Date.now().toString() + Math.random().toString(36).slice(2, 7);
        if (!firstNewId) firstNewId = id;
        updated.unshift({
          id,
          word: e.word,
          partOfSpeech: e.partOfSpeech,
          definitions: [{ definition: def, example: ex }],
          favorite: false,
          createdAt: new Date().toISOString()
        });
      } else {
        const existing = updated[existingIdx];
        const isDuplicate = existing.definitions.some(d =>
          d.definition.trim().toLowerCase() === def.toLowerCase() &&
          (d.example || '').trim().toLowerCase() === ex.toLowerCase()
        );
        if (!isDuplicate) {
          updated[existingIdx] = {
            ...existing,
            definitions: [...existing.definitions, { definition: def, example: ex }]
          };
          if (!firstNewId) firstNewId = existing.id;
        }
      }
    }

    setWords(updated);
    setSelectedId(firstNewId || selectedId);
    setIsAdding(false);
    setPastedText('');
    setApiQuery('');
  };

  const handleDelete = (id) => {
    setWords(words.filter(w => w.id !== id));
    if (selectedId === id) setSelectedId(words.find(w => w.id !== id)?.id || null);
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(words, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lexicon-words.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (!Array.isArray(imported)) throw new Error('File is not a word list');
        setWords(prev => {
          const merged = [...prev];
          for (const raw of imported) {
            const w = normalizeWord(raw);
            if (!w.word) continue;
            const idx = merged.findIndex(x => x.word.toLowerCase() === w.word.toLowerCase());
            if (idx === -1) {
              merged.unshift(w);
            } else {
              const existing = merged[idx];
              const defs = [...existing.definitions];
              for (const d of w.definitions) {
                const isDup = defs.some(ex =>
                  ex.definition.trim().toLowerCase() === d.definition.trim().toLowerCase() &&
                  (ex.example || '').trim().toLowerCase() === (d.example || '').trim().toLowerCase()
                );
                if (!isDup) defs.push(d);
              }
              merged[idx] = { ...existing, definitions: defs };
            }
          }
          return merged;
        });
      } catch (err) {
        alert('Could not import: ' + err.message);
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex h-screen w-full flex-col bg-slate-950 text-slate-100 antialiased md:flex-row overflow-hidden">
      
      {/* SIDEBAR / MOBILE LIST VIEW */}
      <aside className={`flex flex-col w-full md:w-80 lg:w-96 border-r border-slate-800/80 bg-slate-900/50 backdrop-blur-xl ${selectedId && 'hidden md:flex'}`}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <BookMarked className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-bold text-slate-100 tracking-tight leading-none text-base">Lexicon</h1>
              <span className="text-xs text-slate-400 font-medium">
                Personal Dictionary · {words.length} {words.length === 1 ? 'word' : 'words'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 transition-colors"
              title="Export words"
            >
              <Download className="h-5 w-5" />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 transition-colors"
              title="Import words"
            >
              <Upload className="h-5 w-5" />
            </button>
            <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleImport} />
            <button 
              onClick={() => setIsAdding(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20 active:scale-95"
              title="Add New Word"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search words or definitions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl bg-slate-950/80 border border-slate-800 py-2 pl-9 pr-4 text-sm text-slate-200 placeholder-slate-500 focus:border-indigo-500/80 focus:outline-none focus:ring-1 focus:ring-indigo-500/80 transition-all"
            />
          </div>
        </div>

        {/* Word List */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {filteredWords.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">No words found.</div>
          ) : (
            filteredWords.map((item) => {
              const isSelected = item.id === activeWord?.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`group relative flex flex-col gap-1 p-3.5 rounded-xl cursor-pointer border transition-all ${
                    isSelected 
                      ? 'bg-slate-800/80 border-indigo-500/40 shadow-sm' 
                      : 'bg-transparent border-transparent hover:bg-slate-800/40 hover:border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-100 text-base">{item.word}</span>
                    <span className="text-[11px] font-mono italic text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-800/40">
                      {item.partOfSpeech}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {item.definitions[0]?.definition}
                    {item.definitions.length > 1 && (
                      <span className="text-indigo-400"> +{item.definitions.length - 1} more</span>
                    )}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* MAIN DETAIL VIEW */}
      <main className={`flex-1 flex-col bg-slate-950 h-full overflow-y-auto ${!selectedId && 'hidden md:flex'}`}>
        {activeWord ? (
          <div className="max-w-3xl w-full mx-auto p-6 md:p-10 space-y-8">
            
            {/* Mobile Back Button */}
            <button 
              onClick={() => setSelectedId(null)} 
              className="md:hidden flex items-center gap-2 text-xs font-medium text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg"
            >
              ← Back to list
            </button>

            {/* Word Header */}
            <div className="space-y-3 border-b border-slate-800/80 pb-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-100">
                    {activeWord.word}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleDelete(activeWord.id)}
                    className="p-3 rounded-2xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition-all"
                    title="Delete Entry"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Part of Speech Badge */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                  {activeWord.partOfSpeech}
                </span>
              </div>
            </div>

            {/* Definition Section */}
            <div className="space-y-6">
              {activeWord.definitions.map((d, i) => (
                <div key={i} className="space-y-3">
                  <h3 className="text-xs uppercase tracking-wider font-bold text-slate-500">
                    {activeWord.definitions.length > 1 ? `Definition ${i + 1}` : 'Definition'}
                  </h3>
                  <p className="text-lg md:text-xl text-slate-200 leading-relaxed font-normal">
                    {d.definition}
                  </p>
                  {d.example && (
                    <div className="space-y-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 relative overflow-hidden">
                      <div className="absolute top-0 left-0 bottom-0 w-1 bg-indigo-500" />
                      <h3 className="text-xs uppercase tracking-wider font-bold text-indigo-400">Example Usage</h3>
                      <p className="text-base text-slate-300 italic leading-relaxed">
                        {d.example}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-slate-500">
            <BookMarked className="h-12 w-12 text-slate-700 mb-3" />
            <p className="text-base font-medium">Select a word from the left sidebar or create a new entry.</p>
          </div>
        )}
      </main>

      {/* CREATE WORD MODAL */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-400" /> Add New Dictionary Entry
              </h3>
              <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Paste box */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-400">
                Paste word, meaning and sentence
              </label>
              <textarea
                autoFocus
                rows={4}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={"Ephemeral: lasting for a very short time. The snowfall produced an ephemeral beauty.\nor:\nResilience (noun)\nThe capacity to recover quickly. Her resilience helped the team."}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
              />
              <p className="text-[11px] text-slate-500">
                Use <span className="font-mono text-slate-400">Word: meaning. example.</span> — part of speech optional via <span className="font-mono text-slate-400">(noun)</span>.
              </p>
            </div>

            {/* Live parsed preview */}
            {entries.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                <p className="text-[11px] font-medium text-indigo-300">
                  {entries.length} word{entries.length > 1 ? 's' : ''} detected
                </p>
                {entries.map((e, i) => (
                  <div key={i} className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-slate-100">{e.word || '—'}</span>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                        {e.partOfSpeech}
                      </span>
                    </div>
                    <p className="text-sm text-slate-200">{e.definition}</p>
                    {e.example && (
                      <p className="text-xs italic text-slate-400">{e.example}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : pastedText.trim() && (
              <p className="text-xs text-amber-400">
                Couldn't detect words. Use <span className="font-mono">Word: meaning. example.</span> per line, or separate entries with a blank line.
              </p>
            )}

            {/* Optional API lookup */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Or auto-fill from dictionary search..."
                value={apiQuery}
                onChange={(e) => setApiQuery(e.target.value)}
                className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => fetchFromApi(apiQuery)}
                disabled={apiLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 border border-slate-700 transition-colors"
              >
                <Globe className="h-3.5 w-3.5" />
                {apiLoading ? 'Searching...' : 'Lookup'}
              </button>
            </div>
            {apiError && <p className="text-xs text-rose-400">{apiError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddParsed}
                disabled={entries.length === 0}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add {entries.length > 0 ? entries.length : ''} Word{entries.length > 1 ? 's' : ''} to Dictionary
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
