// src/App.jsx
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
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
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">ファイル共有システム - ホーム</h1>
      <button
        onClick={handleLogout}
        className="bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded"
      >
        ログアウト
      </button>
    </div>
  );
};

// アプリケーションのメインコンポーネント
const AppContent = () => {
  return (
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
  );
};

// Amplify認証プロバイダーでラップされたアプリケーション
const App = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;