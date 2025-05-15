// src/components/QRCodeGenerator.jsx
import React, { useState } from 'react';
import { QRCode } from 'react-qrcode-logo';

const QRCodeGenerator = ({ url }) => {
  const [size, setSize] = useState(150);
  const [bgColor, setBgColor] = useState('#FFFFFF');
  const [fgColor, setFgColor] = useState('#000000');
  const [logoImage, setLogoImage] = useState(null);
  const [showCustomization, setShowCustomization] = useState(false);

  // QRコードの画像をダウンロード
  const downloadQRCode = () => {
    const canvas = document.getElementById('qr-code').querySelector('canvas');
    if (canvas) {
      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = 'QRコード.png';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  };

  // ロゴ画像の読み込み処理
  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setLogoImage(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div>
      <div className="flex flex-col items-center mb-4">
        <div id="qr-code" className="bg-white p-2 rounded-lg shadow-sm mb-4">
          <QRCode
            value={url}
            size={size}
            bgColor={bgColor}
            fgColor={fgColor}
            logoImage={logoImage}
            logoWidth={logoImage ? size / 4 : 0}
            logoHeight={logoImage ? size / 4 : 0}
            qrStyle="dots"
            eyeRadius={5}
          />
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={downloadQRCode}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            ダウンロード
          </button>
          
          <button
            onClick={() => setShowCustomization(!showCustomization)}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md text-sm flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            カスタマイズ
          </button>
        </div>
      </div>
      
      {showCustomization && (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <h4 className="font-medium text-sm mb-3">カスタマイズ設定</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                サイズ ({size}px)
              </label>
              <input
                type="range"
                min="100"
                max="300"
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                className="w-full"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                背景色
              </label>
              <div className="flex items-center">
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-8 h-8 rounded border border-gray-300 mr-2"
                />
                <input
                  type="text"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="flex-grow p-1 text-xs border border-gray-300 rounded"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                前景色
              </label>
              <div className="flex items-center">
                <input
                  type="color"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  className="w-8 h-8 rounded border border-gray-300 mr-2"
                />
                <input
                  type="text"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  className="flex-grow p-1 text-xs border border-gray-300 rounded"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                中央ロゴ
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100"
              />
              {logoImage && (
                <button
                  onClick={() => setLogoImage(null)}
                  className="mt-1 text-xs text-red-600 hover:text-red-800"
                >
                  ロゴを削除
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QRCodeGenerator;
