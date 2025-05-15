// src/components/UploadProgress.js
import React from 'react';
import PropTypes from 'prop-types';

const UploadProgress = ({ 
  files, 
  progress, 
  onCancelUpload,
  onRemoveFile,
  uploading = false
}) => {
  // ファイルサイズをフォーマット
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // アップロード中の総合進捗率を計算
  const calculateTotalProgress = () => {
    if (!files.length) return 0;
    
    const totalProgress = Object.values(progress).reduce((sum, value) => sum + value, 0);
    return Math.round(totalProgress / files.length);
  };

  // ファイルの種類によってアイコンを取得
  const getFileIcon = (fileType) => {
    if (fileType.startsWith('image/')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    } else if (fileType.startsWith('video/')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    } else if (fileType.startsWith('audio/')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      );
    } else if (fileType.includes('pdf')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    } else {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }
  };

  if (files.length === 0) {
    return null;
  }

  return (
    <div className="w-full">
      {/* 選択したファイル数とアップロード中なら総合進捗 */}
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-md font-medium">選択されたファイル ({files.length})</h3>
        
        {uploading && (
          <div className="flex items-center">
            <div className="w-32 h-2 bg-gray-200 rounded-full mr-2">
              <div 
                className="h-full bg-blue-500 rounded-full" 
                style={{ width: `${calculateTotalProgress()}%` }}
              ></div>
            </div>
            <span className="text-sm text-gray-600">{calculateTotalProgress()}%</span>
            <button
              onClick={onCancelUpload}
              className="ml-4 text-sm text-red-500 hover:text-red-700"
            >
              キャンセル
            </button>
          </div>
        )}
      </div>

      {/* ファイル一覧 */}
      <ul className="space-y-2 max-h-64 overflow-y-auto">
        {files.map((file, index) => (
          <li 
            key={index} 
            className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200"
          >
            <div className="flex items-center overflow-hidden">
              {/* ファイルタイプアイコン */}
              <div className="flex-shrink-0 mr-3">
                {getFileIcon(file.type)}
              </div>
              
              {/* ファイル名とサイズ */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
              </div>
            </div>
            
            {/* 進捗またはアクション */}
            <div className="ml-4 flex-shrink-0">
              {uploading ? (
                <div className="w-24">
                  <div className="h-2 bg-gray-200 rounded-full">
                    <div 
                      className="h-full bg-blue-500 rounded-full" 
                      style={{ width: `${progress[index] || 0}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-right mt-1">{progress[index] || 0}%</p>
                </div>
              ) : (
                <button
                  onClick={() => onRemoveFile(index)}
                  className="text-red-500 hover:text-red-700"
                  aria-label="ファイルを削除"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

UploadProgress.propTypes = {
  files: PropTypes.array.isRequired,
  progress: PropTypes.object.isRequired,
  onCancelUpload: PropTypes.func.isRequired,
  onRemoveFile: PropTypes.func.isRequired,
  uploading: PropTypes.bool
};

export default UploadProgress;
