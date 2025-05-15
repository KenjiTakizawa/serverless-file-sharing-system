// src/pages/FileGroupDetail.js
import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useFiles } from '../contexts/FileContext';
import ShareSettings from '../components/ShareSettings';

const FileGroupDetail = () => {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { 
    fetchGroupDetails, 
    currentGroup, 
    currentGroupFiles, 
    groupDetailsLoading, 
    deleteFileGroup,
    getDownloadUrl,
    canPreviewFile,
    copyShareUrl,
    getQRCodeUrl
  } = useFiles();
  
  const [activeTab, setActiveTab] = useState('files');
  const [showQRCode, setShowQRCode] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  
  useEffect(() => {
    // グループ詳細を取得
    fetchGroupDetails(groupId).catch(error => {
      console.error('Error fetching group details:', error);
      // エラーが発生した場合はダッシュボードにリダイレクト
      navigate('/');
    });
  }, [groupId, fetchGroupDetails, navigate]);
  
  const handleFilePreview = async (file) => {
    if (!canPreviewFile(file.type)) {
      alert('このファイル形式はプレビューできません');
      return;
    }
    
    try {
      const url = await getDownloadUrl(file.key);
      setSelectedFile(file);
      setPreviewUrl(url);
    } catch (error) {
      console.error('Error getting preview URL:', error);
      alert('プレビューURLの取得に失敗しました');
    }
  };
  
  const handleDownload = async (file) => {
    try {
      const url = await getDownloadUrl(file.key);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error getting download URL:', error);
      alert('ダウンロードURLの取得に失敗しました');
    }
  };
  
  const handleDeleteGroup = async () => {
    if (!window.confirm('このファイルグループを削除しますか？この操作は元に戻せません。')) {
      return;
    }
    
    try {
      await deleteFileGroup(groupId);
      navigate('/');
    } catch (error) {
      console.error('Error deleting group:', error);
      alert('ファイルグループの削除に失敗しました');
    }
  };
  
  const handleShareLinkCopy = () => {
    if (currentGroup?.shareUrl) {
      copyShareUrl(currentGroup.shareUrl);
      alert('共有リンクをコピーしました');
    }
  };
  
  // 日付のフォーマット
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  // ファイルサイズのフォーマット
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };
  
  // ファイルタイプに基づくアイコンを取得
  const getFileIcon = (fileType) => {
    if (fileType.startsWith('image/')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    } else if (fileType === 'application/pdf') {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    } else if (fileType.includes('word') || fileType.includes('document')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    } else {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }
  };
  
  // プレビューコンポーネント
  const FilePreview = ({ file, url }) => {
    if (!file || !url) return null;
    
    if (file.type.startsWith('image/')) {
      return (
        <div className="bg-gray-50 p-4 rounded-lg text-center">
          <img src={url} alt={file.name} className="max-w-full max-h-96 mx-auto" />
        </div>
      );
    } else if (file.type === 'application/pdf') {
      return (
        <div className="bg-gray-50 p-4 rounded-lg h-96">
          <iframe src={url} title={file.name} className="w-full h-full" />
        </div>
      );
    } else if (file.type === 'text/plain' || file.type === 'application/json' || file.type === 'text/html') {
      return (
        <div className="bg-gray-50 p-4 rounded-lg h-64 overflow-auto">
          <iframe src={url} title={file.name} className="w-full h-full" />
        </div>
      );
    } else {
      return (
        <div className="bg-gray-100 p-8 rounded-lg text-center">
          <p className="text-gray-500">プレビューできません。ダウンロードしてください。</p>
          <button
            onClick={() => window.open(url, '_blank')}
            className="mt-4 bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded"
          >
            ダウンロード
          </button>
        </div>
      );
    }
  };
  
  if (groupDetailsLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        <p className="ml-3 text-gray-600">読み込み中...</p>
      </div>
    );
  }
  
  if (!currentGroup) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <div className="bg-red-50 p-4 rounded-lg text-red-700">
          <p>ファイルグループが見つかりませんでした。</p>
          <Link to="/" className="text-blue-600 hover:underline mt-2 inline-block">
            ダッシュボードに戻る
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link to="/" className="text-blue-600 hover:underline flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            ダッシュボードに戻る
          </Link>
          <h1 className="text-2xl font-bold text-gray-800 mt-2">
            ファイルグループの詳細
          </h1>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={handleShareLinkCopy}
            className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded shadow flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            リンクをコピー
          </button>
          <button
            onClick={() => setShowQRCode(!showQRCode)}
            className="bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded shadow flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            QRコード
          </button>
          <button
            onClick={handleDeleteGroup}
            className="bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded shadow flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            削除
          </button>
        </div>
      </div>
      
      {showQRCode && (
        <div className="mb-6 bg-white p-4 rounded-lg shadow text-center">
          <h3 className="font-medium text-gray-700 mb-2">QRコード</h3>
          <img
            src={getQRCodeUrl(currentGroup.shareUrl)}
            alt="Share QR Code"
            className="max-w-xs mx-auto"
          />
          <p className="text-sm text-gray-500 mt-2">
            このQRコードをスキャンして、ファイルを共有できます
          </p>
        </div>
      )}
      
      <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-6">
        <div className="p-6 border-b">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="text-sm text-gray-500">アップロード日時</div>
              <div className="font-medium">{formatDate(currentGroup.createdAt)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">有効期限</div>
              <div className="font-medium">{formatDate(currentGroup.expirationDate)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">ファイル数</div>
              <div className="font-medium">{currentGroupFiles.length} ファイル</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">合計サイズ</div>
              <div className="font-medium">
                {formatFileSize(currentGroupFiles.reduce((total, file) => total + file.size, 0))}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">パスワード保護</div>
              <div className="font-medium">
                {currentGroup.isPasswordProtected ? (
                  <span className="text-green-600 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    有効
                  </span>
                ) : (
                  <span className="text-yellow-600">無効</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">共有URL</div>
              <div className="font-medium text-blue-600 truncate max-w-xs">
                {currentGroup.shareUrl}
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-50 border-b">
          <nav className="flex">
            <button
              className={`px-6 py-3 font-medium text-sm focus:outline-none ${
                activeTab === 'files'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('files')}
            >
              ファイル一覧
            </button>
            <button
              className={`px-6 py-3 font-medium text-sm focus:outline-none ${
                activeTab === 'settings'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('settings')}
            >
              共有設定
            </button>
          </nav>
        </div>
        
        <div className="p-6">
          {activeTab === 'files' ? (
            <>
              {selectedFile && previewUrl ? (
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-medium">
                      {selectedFile.name}
                    </h3>
                    <button
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl(null);
                      }}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <FilePreview file={selectedFile} url={previewUrl} />
                </div>
              ) : null}
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ファイル名
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        サイズ
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        タイプ
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        アクション
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {currentGroupFiles.map((file) => (
                      <tr key={file.fileId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center bg-blue-100 text-blue-500 rounded">
                              {getFileIcon(file.type)}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {file.name}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">{formatFileSize(file.size)}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">{file.type.split('/')[1]}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          {canPreviewFile(file.type) && (
                            <button
                              onClick={() => handleFilePreview(file)}
                              className="text-blue-600 hover:text-blue-900 mr-4"
                            >
                              プレビュー
                            </button>
                          )}
                          <button
                            onClick={() => handleDownload(file)}
                            className="text-green-600 hover:text-green-900"
                          >
                            ダウンロード
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <ShareSettings
              groupId={groupId}
              currentSettings={{
                isPasswordProtected: currentGroup.isPasswordProtected,
                expirationDate: currentGroup.expirationDate
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default FileGroupDetail;
