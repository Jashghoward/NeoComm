"use client";
import { useState } from 'react';
import Image from 'next/image';

const ProfileComponent = ({ user, onUpdate, onClose }) => {
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState({
    username: user.username || '',
    status: user.status || '',
    profile_picture: user.profile_picture || ''
  });
  const [imageFile, setImageFile] = useState(null);
  const [error, setError] = useState('');

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

      setImageFile(file);
      // Create preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfile(prev => ({ ...prev, profile_picture: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      
      if (profile.username) {
        formData.append('username', profile.username);
      }
      if (profile.status) {
        formData.append('status', profile.status);
      }
      if (imageFile) {
        formData.append('profile_picture', imageFile);
      }

      console.log('Sending profile update:', {
        username: profile.username,
        status: profile.status,
        hasImage: !!imageFile
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

  return (
    <div className="relative bg-gray-900 p-6 rounded-lg shadow-lg max-w-md mx-auto">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-gray-400 hover:text-white"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="text-center mb-6">
        <div className="relative w-32 h-32 mx-auto mb-4">
          <img
            src={profile.profile_picture || '/default-avatar.png'}
            alt="Profile"
            className="rounded-full object-cover w-full h-full"
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-red-500 mb-4 text-sm">{error}</div>
          )}
          <div>
            <label className="block text-gray-400 mb-2">Profile Picture</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/jpg"
              onChange={handleImageChange}
              className="w-full text-gray-400"
            />
          </div>
          <div>
            <label className="block text-gray-400 mb-2">Username</label>
            <input
              type="text"
              value={profile.username}
              onChange={(e) => setProfile(prev => ({ ...prev, username: e.target.value }))}
              className="w-full p-2 bg-gray-800 text-white rounded"
            />
          </div>
          <div>
            <label className="block text-gray-400 mb-2">Status</label>
            <input
              type="text"
              value={profile.status}
              onChange={(e) => setProfile(prev => ({ ...prev, status: e.target.value }))}
              className="w-full p-2 bg-gray-800 text-white rounded"
              placeholder="Set your status..."
            />
          </div>
          <div className="flex space-x-4">
            <button
              type="submit"
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfileComponent; 