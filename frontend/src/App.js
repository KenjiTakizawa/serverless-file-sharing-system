import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, AuthProvider } from './contexts/AuthContext';
import LoginScreen from './components/LoginScreen';
import './lib/amplify-config'; // Amplify初期化を最初にインポート

// プライベートルート（認証済みユーザーのみアクセス可能）
const PrivateRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  
  if (loading) {
    return <div className="flex justify-center items-center h-screen">読み込み中...</div>;
  }
  
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// 公開ルート（未認証ユーザー向け、認証済みならリダイレクト）
const PublicRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  
  if (loading) {
    return <div className="flex justify-center items-center h-screen">読み込み中...</div>;
  }
  
  if (currentUser) {
    return <Navigate to="/" replace />;
  }
  
  return children;
};

// ダミーのホーム画面（認証後のリダイレクト先）
const Home = () => {
  const { logout } = useAuth();
  
  const handleLogout = async () => {
    await logout();
    // ログアウト後は自動的にリダイレクトされる
  };
  
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-800">ファイル共有システム - ダッシュボード</h1>
        <button
          onClick={handleLogout}
          className="bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded"
        >
          ログアウト
        </button>
      </div>
      
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">ファイルのアップロード</h2>
        <p className="text-gray-600 mb-4">
          ファイル共有機能は現在開発中です。認証基盤が正常に動作しています。
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-700">
          <div className="flex items-center">
            <span className="mr-2">💡</span>
            <span>完全な機能はまもなく実装される予定です。</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// メインアプリケーション
const App = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={
            <PublicRoute>
              <LoginScreen />
            </PublicRoute>
          } />
          <Route path="/" element={
            <PrivateRoute>
              <Home />
            </PrivateRoute>
          } />
          {/* 他のルートはここに追加 */}
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;
