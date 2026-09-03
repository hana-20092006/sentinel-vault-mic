'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function SignUp() {
  const router = useRouter();
  const { signup } = useAuth();

  const [formData, setFormData] = useState({
    publicKey: '',
    email: '',
    password: '',
    passwordConfirm: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passwordMismatch, setPasswordMismatch] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Check password mismatch
    if (name === 'passwordConfirm' || name === 'password') {
      const pwd = name === 'password' ? value : formData.password;
      const pwdConfirm = name === 'passwordConfirm' ? value : formData.passwordConfirm;
      setPasswordMismatch(pwd !== pwdConfirm && pwd !== '' && pwdConfirm !== '');
    }

    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Validate inputs
    if (!formData.publicKey.trim()) {
      setError('Public key is required');
      setLoading(false);
      return;
    }

    if (!formData.email.trim()) {
      setError('Email is required');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    if (formData.password !== formData.passwordConfirm) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      await signup(
        formData.publicKey,
        formData.email,
        formData.password,
        formData.passwordConfirm
      );
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">🛡️ SentinelVault</h1>
          <p className="text-slate-400">Create Your Account</p>
        </div>

        {/* Signup Form */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 shadow-xl">
          <form onSubmit={handleSubmit}>
            {/* Public Key Input */}
            <div className="mb-4">
              <label htmlFor="publicKey" className="block text-sm font-medium text-slate-300 mb-2">
                Public Key / Wallet Address
              </label>
              <input
                id="publicKey"
                name="publicKey"
                type="text"
                placeholder="0x742d35Cc6634C0532925a3b844Bc99e4e2D95fC1"
                value={formData.publicKey}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
              <p className="text-xs text-slate-500 mt-1">Enter your blockchain wallet address</p>
            </div>

            {/* Email Input */}
            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
            </div>

            {/* Password Input */}
            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Enter password (min 6 characters)"
                value={formData.password}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
              <p className="text-xs text-slate-500 mt-1">Minimum 6 characters</p>
            </div>

            {/* Password Confirm Input */}
            <div className="mb-6">
              <label htmlFor="passwordConfirm" className="block text-sm font-medium text-slate-300 mb-2">
                Confirm Password
              </label>
              <input
                id="passwordConfirm"
                name="passwordConfirm"
                type="password"
                placeholder="Confirm password"
                value={formData.passwordConfirm}
                onChange={handleChange}
                className={`w-full px-4 py-2 bg-slate-700 border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:border-transparent ${
                  passwordMismatch ? 'border-red-500 focus:ring-red-500' : 'border-slate-600 focus:ring-blue-500'
                }`}
                disabled={loading}
              />
              {passwordMismatch && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-900 border border-red-700 rounded-lg text-red-200 text-sm">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || passwordMismatch}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          {/* Login Link */}
          <p className="text-center text-slate-400 text-sm mt-4">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-500 hover:text-blue-400 font-medium">
              Login here
            </Link>
          </p>
        </div>

        {/* Security Info */}
        <div className="mt-6 p-4 bg-slate-800 rounded-lg border border-slate-700">
          <p className="text-xs text-slate-400">
            🔒 Your data is encrypted and stored securely. We never store plain text passwords.
          </p>
        </div>
      </div>
    </div>
  );
}
