// src/components/FileUploader.js
import React, { useState, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';

const FileUploader = ({ 
  onFilesSelected,
  maxFileSize = 2 * 1024 * 1024 * 1024, // 2GB
  allowedFileTypes = null,
  maxFiles = null,
  className = ''
}) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // エラー表示後に一定時間後に消す
  const showError = (message) => {
    setError(message);
    setTimeout(() => {
      setError(null);
    }, 5000);
  };

  // ファイルのバリデーション
  const validateFiles = (files) => {
    // ファイル数の検証
    if (maxFiles && files.length > maxFiles) {
      showError(`アップロードできるファイル数は最大${maxFiles}個です。`);
      return false;
    }

    let totalSize = 0;

    for (const file of files) {
      // ファイルサイズの検証
      totalSize += file.size;
      if (file.size > maxFileSize) {
        showError(`ファイル「${file.name}」のサイズが上限（${formatFileSize(maxFileSize)}）を超えています。`);
        return false;
      }

      // ファイルタイプの検証
      if (allowedFileTypes && !allowedFileTypes.includes(file.type) && !validateFileExtension(file.name, allowedFileTypes)) {
        showError(`ファイル「${file.name}」の形式はサポートされていません。`);
        return false;
      }
    }

    // 合計サイズの検証
    if (totalSize > maxFileSize) {
      showError(`ファイルの合計サイズが上限（${formatFileSize(maxFileSize)}）を超えています。`);
      return false;
    }

    return true;
  };

  // ファイル拡張子の検証（MIME typeだけでは不十分な場合）
  const validateFileExtension = (filename, allowedTypes) => {
    const extension = filename.split('.').pop().toLowerCase();
    const extensionMap = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'txt': 'text/plain',
      'zip': 'application/zip',
      'rar': 'application/x-rar-compressed',
      'mp4': 'video/mp4',
      'mp3': 'audio/mpeg',
    };

    return allowedTypes.includes(extensionMap[extension]);
  };

  // ファイルサイズをフォーマット
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // ドラッグオーバーのハンドラ
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  // ドラッグリーブのハンドラ
  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  // ドロップのハンドラ
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      
      if (validateFiles(droppedFiles)) {
        onFilesSelected(droppedFiles);
      }
    }
  }, [onFilesSelected]);

  // ファイル選択ダイアログのハンドラ
  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      
      if (validateFiles(selectedFiles)) {
        onFilesSelected(selectedFiles);
      }
    }
  };

  // ファイル選択ダイアログを開く
  const openFileSelector = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className={`w-full ${className}`}>
      {/* ドラッグ&ドロップエリア */}
      <div 
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragActive 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-blue-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFileSelector}
      >
        <div className="flex flex-col items-center justify-center">
          {/* アイコン */}
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-12 w-12 text-gray-400 mb-3" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
            />
          </svg>
          
          {/* テキストガイダンス */}
          <p className="mb-2 text-sm text-gray-500">
            <span className="font-semibold">クリックしてファイルを選択</span>
            <span> または </span>
            <span>ここにドラッグ&ドロップ</span>
          </p>
          
          {/* ファイルタイプ情報 */}
          <p className="text-xs text-gray-500">
            {allowedFileTypes 
              ? `サポートされているファイル形式: ${allowedFileTypes.join(', ')}`
              : 'すべてのファイル形式'
            } (最大サイズ: {formatFileSize(maxFileSize)})
          </p>
          
          {/* 非表示のファイル入力 */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
            accept={allowedFileTypes ? allowedFileTypes.join(',') : undefined}
          />
        </div>
      </div>
      
      {/* エラーメッセージ */}
      {error && (
        <div className="mt-2 text-sm text-red-600">
          <p>{error}</p>
        </div>
      )}
    </div>
  );
};

FileUploader.propTypes = {
  onFilesSelected: PropTypes.func.isRequired,
  maxFileSize: PropTypes.number,
  allowedFileTypes: PropTypes.array,
  maxFiles: PropTypes.number,
  className: PropTypes.string
};

export default FileUploader;
