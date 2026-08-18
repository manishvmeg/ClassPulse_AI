"use client";
import { useState, useEffect, useRef } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

interface SharedFile {
  filename: string;
  url: string;
  size: number;
  uploader?: string;
  modified?: number;
}

interface FileSharingProps {
  roomId: string;
  isHost: boolean;
  ws?: WebSocket | null;
}

function formatSize(bytes: number) {
  if (!bytes) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (["pdf"].includes(ext!)) return "📄";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext!)) return "🖼️";
  if (["mp4", "webm", "mov"].includes(ext!)) return "🎬";
  if (["ppt", "pptx"].includes(ext!)) return "📊";
  if (["doc", "docx"].includes(ext!)) return "📝";
  if (["xls", "xlsx", "csv"].includes(ext!)) return "📈";
  if (["zip", "rar", "tar"].includes(ext!)) return "🗜️";
  return "📎";
}

export default function FileSharing({ roomId, isHost, ws }: FileSharingProps) {
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch shared files
  useEffect(() => {
    fetch(`${API_URL}/rooms/${roomId}/files`)
      .then((r) => r.json())
      .then((d) => setFiles(d.files ?? []))
      .catch(() => {});
  }, [roomId]);

  // Listen for file events broadcasted over WebSocket
  useEffect(() => {
    if (!ws) return;
    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "file_shared") {
          setFiles((prev) => [
            { filename: data.filename, url: data.url, size: data.size, uploader: data.uploader },
            ...prev.filter((f) => f.filename !== data.filename),
          ]);
        }
      } catch {
        // ignore
      }
    };
    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [ws]);

  const uploadFile = async (file: File) => {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/files`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (data.ok) {
        setFiles((prev) => [
          { filename: data.filename, url: data.url, size: file.size, uploader: isHost ? "Instructor" : "Student" },
          ...prev.filter((f) => f.filename !== data.filename),
        ]);
      }
    } catch {
      // silent
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 flex flex-col h-[580px]">
      <div className="flex items-center gap-2 mb-4 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
            />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Classroom Files & Slides</h3>
          <p className="text-[11px] text-slate-400">Share lecture notes, datasets, and assignments</p>
        </div>
        <span className="text-xs text-slate-500 ml-auto font-mono bg-slate-800 px-2 py-0.5 rounded-md">
          {files.length} file(s)
        </span>
      </div>

      {/* Upload Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current?.click()}
        className={`rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition mb-4 flex-shrink-0 ${
          dragOver
            ? "border-cyan-500 bg-cyan-500/10"
            : "border-slate-700 hover:border-slate-500 hover:bg-slate-800/40"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadFile(f);
          }}
          accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.mp4,.webm,.zip"
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-cyan-400 text-xs py-2">
            <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span>Uploading file to classroom...</span>
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold text-slate-300">
              Drag and drop lecture files or <span className="text-cyan-400 underline">browse</span>
            </p>
            <p className="text-[10px] text-slate-500 mt-1">PDF, Slides, Code, Datasets, Media (Max 50MB)</p>
          </>
        )}
      </div>

      {/* Files List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <span className="text-3xl mb-2">📁</span>
            <p className="text-xs text-slate-400 font-medium">No files shared yet in this room</p>
            <p className="text-[10px] text-slate-600 mt-0.5">Uploaded materials will be instantly available to all participants</p>
          </div>
        ) : (
          files.map((file) => (
            <div
              key={file.filename}
              className="flex items-center gap-3 rounded-xl bg-slate-800/70 border border-slate-700/50 px-3.5 py-2.5 hover:bg-slate-800 transition group"
            >
              <span className="text-2xl flex-shrink-0">{fileIcon(file.filename)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{file.filename}</p>
                <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                  <span>{formatSize(file.size)}</span>
                  {file.uploader && <span>· Shared by {file.uploader}</span>}
                </div>
              </div>
              <a
                href={`${API_URL}${file.url}`}
                download={file.filename}
                target="_blank"
                rel="noreferrer"
                className="flex-shrink-0 p-2 rounded-lg bg-slate-700 hover:bg-cyan-600 text-slate-300 hover:text-white transition shadow"
                title="Download file"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
