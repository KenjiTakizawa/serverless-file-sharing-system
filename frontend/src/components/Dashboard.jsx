// src/components/Dashboard.jsx
import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import FileUpload from './FileUpload';
import FileList from './FileList';

const Dashboard = () => {
  const { currentUser, logout } = useAuth();
  
  const handleLogout = async () => {
    await logout();
    // ログアウト後は自動的にリダイレクトされる
  };
  
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">ファイル共有システム</h1>
          <p className="text-gray-600 text-sm mt-1">
            {currentUser?.attributes?.email || currentUser?.username || '匿名ユーザー'}としてログイン中
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded shadow"
        >
          ログアウト
        </button>
      </header>
      
      <div className="mb-8">
        <FileUpload />
      </div>
      
      <div>
        <FileList />
      </div>
    </div>
  );
};

export default Dashboard;
