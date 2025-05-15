// src/components/ShareLinkGenerator.jsx
import React, { useState } from 'react';
import QRCodeGenerator from './QRCodeGenerator';
import EmailShare from './EmailShare';
import { API } from 'aws-amplify';

const ShareLinkGenerator = ({ fileGroupId, shareUrl, onShareStatusChange }) => {
  const [showQRCode, setShowQRCode] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [accessStats, setAccessStats] = useState(null);
  const [loading, setLoading] = useState(false);

  // 共有リンクをクリップボードにコピー
  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // 共有ステータスを取得
  const fetchShareStatus = async () => {
    try {
      setLoading(true);
      
      try {
        // 実際のAPI呼び出し
        const response = await API.get('api', `/files/${fileGroupId}/stats`);
        setAccessStats(response);
      } catch (apiError) {
        console.warn('API call failed, using mock data for development:', apiError);
        
        // 開発用ダミーデータ
        setAccessStats({
          accessCount: 5,
          lastAccessedAt: new Date().toISOString(),
          uniqueVisitors: 3
        });
      }
    } catch (err) {
      console.error('Error fetching share status:', err);
    } finally {
      setLoading(false);
    }
  };

  // アクセス統計の表示が要求された時に取得
  const handleShowStats = () => {
    if (!accessStats) {
      fetchShareStatus();
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">共有リンク</h2>
      
      {/* 共有リンク表示 */}
      <div className="flex items-center mb-4">
        <input
          type="text"
          value={shareUrl}
          readOnly
          className="flex-grow p-2 border border-gray-300 rounded-l-md text-sm bg-gray-50"
        />
        <button
          onClick={copyToClipboard}
          className={`px-4 py-2 rounded-r-md text-white text-sm ${
            copied ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {copied ? (
            <span className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              コピー済み
            </span>
          ) : (
            <span className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              コピー
            </span>
          )}
        </button>
      </div>
      
      {/* アクション ボタン */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setShowQRCode(!showQRCode)}
          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md text-sm flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          QRコード
        </button>
        
        <button
          onClick={() => setShowEmailForm(!showEmailForm)}
          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md text-sm flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          メールで共有
        </button>
        
        <button
          onClick={handleShowStats}
          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md text-sm flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          アクセス統計
        </button>
      </div>
      
      {/* QRコード表示エリア */}
      {showQRCode && (
        <div className="mb-4 p-4 border border-gray-200 rounded-md bg-gray-50">
          <QRCodeGenerator url={shareUrl} />
        </div>
      )}
      
      {/* メール共有フォーム */}
      {showEmailForm && (
        <div className="mb-4 p-4 border border-gray-200 rounded-md bg-gray-50">
          <EmailShare fileGroupId={fileGroupId} shareUrl={shareUrl} />
        </div>
      )}
      
      {/* アクセス統計 */}
      {accessStats && (
        <div className="mb-4 p-4 border border-gray-200 rounded-md bg-gray-50">
          <h3 className="font-medium mb-2 text-sm">アクセス統計</h3>
          {loading ? (
            <div className="flex justify-center py-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-white rounded shadow-sm">
                <p className="text-sm text-gray-500">アクセス数</p>
                <p className="font-bold text-lg">{accessStats.accessCount}</p>
              </div>
              <div className="p-2 bg-white rounded shadow-sm">
                <p className="text-sm text-gray-500">ユニーク訪問者数</p>
                <p className="font-bold text-lg">{accessStats.uniqueVisitors}</p>
              </div>
              <div className="p-2 bg-white rounded shadow-sm">
                <p className="text-sm text-gray-500">最終アクセス</p>
                <p className="font-bold text-sm">
                  {new Date(accessStats.lastAccessedAt).toLocaleDateString('ja-JP')}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ShareLinkGenerator;
