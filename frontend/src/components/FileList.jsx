// src/components/FileList.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFiles } from '../contexts/FileContext';
import ShareLinkGenerator from './ShareLinkGenerator';

const FileList = () => {
  const { 
    fileGroups, 
    loading, 
    error, 
    showExpired, 
    setShowExpired, 
    fetchFileGroups,
    deleteFileGroup
  } = useFiles();
  
  const navigate = useNavigate();
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showShareGenerator, setShowShareGenerator] = useState(false);
  
  // ファイルグループの取得
  useEffect(() => {
    fetchFileGroups();
  }, [fetchFileGroups, showExpired]);
  
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
  
  // 有効期限のステータス
  const getExpirationStatus = (expirationDate) => {
    const now = new Date();
    const expDate = new Date(expirationDate);
    
    if (expDate < now) {
      return { status: 'expired', text: '期限切れ', color: 'bg-red-100 text-red-800' };
    }
    
    const diffTime = Math.abs(expDate - now);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 1) {
      return { status: 'soon', text: '今日まで', color: 'bg-yellow-100 text-yellow-800' };
    } else if (diffDays <= 3) {
      return { status: 'warning', text: `あと${diffDays}日`, color: 'bg-yellow-100 text-yellow-800' };
    } else {
      return { status: 'active', text: `あと${diffDays}日`, color: 'bg-green-100 text-green-800' };
    }
  };
  
  // 共有リンクをコピー
  const copyShareLink = (url) => {
    navigator.clipboard.writeText(url);
    alert('共有リンクをコピーしました');
  };
  
  // 共有リンク生成画面を表示
  const handleShareGroup = (group) => {
    setSelectedGroup(group);
    setShowShareGenerator(true);
  };
  
  // 詳細ページへ移動
  const handleViewDetails = (groupId) => {
    navigate(`/files/${groupId}`);
  };
  
  // ファイルグループの削除
  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('このファイルグループを削除してもよろしいですか？この操作は元に戻せません。')) {
      return;
    }
    
    try {
      await deleteFileGroup(groupId);
    } catch (err) {
      console.error('Error deleting file group:', err);
      alert('ファイルグループの削除に失敗しました');
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">アップロード済みファイル</h2>
        <div className="flex items-center">
          <label className="inline-flex items-center">
            <input
              type="checkbox"
              checked={showExpired}
              onChange={(e) => setShowExpired(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="ml-2 text-sm text-gray-700">期限切れを表示</span>
          </label>
          <button
            onClick={() => window.location.reload()}
            className="ml-4 text-blue-600 hover:text-blue-800"
            title="更新"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>
      
      {loading ? (
        <div className="text-center py-8">
          <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-2 text-gray-600">読み込み中...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-700 p-4 rounded-md">
          <p>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 text-sm text-red-800 underline"
          >
            再読み込み
          </button>
        </div>
      ) : fileGroups.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          <p className="text-gray-600">ファイルがまだアップロードされていません</p>
          <p className="text-sm text-gray-500 mt-1">上部のファイルアップロード機能を使用して、ファイルを共有しましょう</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ファイル
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  アップロード日
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  有効期限
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  保護
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {fileGroups.map((group) => {
                const expStatus = getExpirationStatus(group.expirationDate);
                return (
                  <tr key={group.groupId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center bg-blue-100 text-blue-500 rounded">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {group.fileCount} ファイル
                          </div>
                          <div className="text-sm text-gray-500">
                            {formatFileSize(group.totalSize)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatDate(group.createdAt)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${expStatus.color}`}>
                        {expStatus.text}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {group.isPasswordProtected ? (
                        <span className="text-green-600 flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          保護あり
                        </span>
                      ) : (
                        <span className="text-yellow-600">なし</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleViewDetails(group.groupId)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        詳細
                      </button>
                      <button
                        onClick={() => handleShareGroup(group)}
                        className="text-green-600 hover:text-green-900 mr-3"
                      >
                        共有
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(group.groupId)}
                        className="text-red-600 hover:text-red-900"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      
      {/* 共有リンク生成画面 */}
      {showShareGenerator && selectedGroup && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-lg font-semibold">ファイル共有設定</h3>
              <button
                onClick={() => setShowShareGenerator(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6">
              <ShareLinkGenerator 
                fileGroupId={selectedGroup.groupId} 
                shareUrl={selectedGroup.shareUrl} 
                onShareStatusChange={() => fetchFileGroups()}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileList;
