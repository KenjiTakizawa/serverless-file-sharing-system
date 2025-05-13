// src/services/AuthService.js
import { Auth } from 'aws-amplify';

class AuthService {
  /**
   * 現在のログインユーザーを取得
   * @returns {Promise<Object>} - ユーザー情報
   */
  async getCurrentUser() {
    try {
      const user = await Auth.currentAuthenticatedUser();
      return {
        success: true,
        user,
      };
    } catch (error) {
      console.error('Get current user error:', error);
      return {
        success: false,
        message: 'ユーザー情報の取得に失敗しました。',
        error,
      };
    }
  }

  /**
   * パスワードの複雑性をチェック
   * @param {string} password - チェックするパスワード
   * @returns {boolean} - 有効なパスワードかどうか
   */
  validatePasswordComplexity(password) {
    if (password.length < 12) return false;
    
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    const validCategories = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChars]
      .filter(Boolean).length;
    
    return validCategories >= 4;
  }
}

// シングルトンインスタンス
const authService = new AuthService();
export default authService;
