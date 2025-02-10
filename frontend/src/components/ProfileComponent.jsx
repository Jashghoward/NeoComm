"use client";
import { useState, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

const ProfileComponent = ({ user, onUpdate, onClose }) => {
  const [formData, setFormData] = useState({
    username: user.username || '',
    status: user.status || '',
    profile_picture: null
  });
  const [previewUrl, setPreviewUrl] = useState(user.profile_picture || null);
  const fileInputRef = useRef(null);
  const router = useRouter();

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      // Check file type
      if (!file.type.startsWith('image/')) {
        setError('Please upload an image file (PNG, JPG, JPEG)');
        return;
      }

      // Convert HEIC to JPEG if needed
      if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
        setError('HEIC format is not supported. Please upload a JPG or PNG file.');
        return;
      }

      setFormData(prev => ({ ...prev, profile_picture: file }));
      // Create preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      
      if (this.formData.username) {
        formData.append('username', this.formData.username);
      }
      if (this.formData.status) {
        formData.append('status', this.formData.status);
      }
      if (this.formData.profile_picture) {
        formData.append('profile_picture', this.formData.profile_picture);
      }

      console.log('Sending profile update:', {
        username: this.formData.username,
        status: this.formData.status,
        hasImage: !!this.formData.profile_picture
      });

      const response = await fetch('http://localhost:8001/profile/update', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData // Don't set Content-Type header when sending FormData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update profile');
      }

      const updatedProfile = await response.json();
      console.log('Profile updated successfully:', updatedProfile);
      onUpdate(updatedProfile);
      onClose();
    } catch (err) {
      console.error('Profile update error:', err);
      setError(err.message || 'Failed to update profile');
    }
  };

  const handleLogout = () => {
    // Clear all auth data
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Disconnect socket if needed
    if (window.socket) {
      window.socket.disconnect();
    }
    
    // Redirect to login
    router.push('/login');
  };

  return (
    <div className="p-6 bg-gray-800 rounded-lg max-w-md w-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">Profile Settings</h2>
        <button 
          onClick={onClose} 
          className="text-gray-400 hover:text-white"
          aria-label="Close"
        >
          <svg 
            className="w-6 h-6" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M6 18L18 6M6 6l12 12" 
            />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Profile Picture */}
        <div className="text-center">
          <div className="relative w-32 h-32 mx-auto mb-4">
            <img
              src={previewUrl || '/default-avatar.png'}
              alt="Profile"
              className="rounded-full w-full h-full object-cover"
            />
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageChange}
            accept="image/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-blue-500 hover:text-blue-400 text-sm"
          >
            Change Profile Picture
          </button>
        </div>

        {/* Username */}
        <div>
          <label className="block text-gray-300 mb-2">Username</label>
          <input
            type="text"
            value={formData.username}
            onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
            className="w-full p-2 bg-gray-700 rounded text-white"
          />
        </div>

        {/* Status */}
        <div>
          <label className="block text-gray-300 mb-2">Status</label>
          <input
            type="text"
            value={formData.status}
            onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
            className="w-full p-2 bg-gray-700 rounded text-white"
            placeholder="What's on your mind?"
          />
        </div>

        {/* Buttons */}
        <div className="flex justify-between pt-4">
          <button
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
          >
            Save Changes
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors"
          >
            Logout
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProfileComponent; 