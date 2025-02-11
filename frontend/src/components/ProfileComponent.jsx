"use client";
import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

const ProfileComponent = ({ user, onUpdate, onClose }) => {
  const [formData, setFormData] = useState({
    username: user.username || '',
    status: user.status || '',
    profile_picture: null
  });
  const [spotifyStatus, setSpotifyStatus] = useState(null);
  const [isSpotifyConnected, setIsSpotifyConnected] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(user.profile_picture || null);
  const statusInterval = useRef(null);
  const fileInputRef = useRef(null);
  const router = useRouter();

  // Check Spotify connection and current track
  useEffect(() => {
    const checkSpotifyStatus = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:8001/spotify/current-track', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setIsSpotifyConnected(true);
          if (!data.error) {
            setCurrentTrack(data);
          }
        }
      } catch (err) {
        console.error('Error checking Spotify status:', err);
      }
    };

    checkSpotifyStatus();
    // Poll for track updates every 30 seconds
    const interval = setInterval(checkSpotifyStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Add function to update status with current track
  const updateStatusWithTrack = () => {
    if (currentTrack) {
      const trackStatus = `🎵 ${currentTrack.name} - ${currentTrack.artist}`;
      setFormData(prev => ({ ...prev, status: trackStatus }));
      handleSubmit();
    }
  };

  // Fetch current playing track
  const fetchCurrentTrack = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8001/spotify/current-track', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.item) {
          const trackInfo = `🎵 ${data.item.name} - ${data.item.artists[0].name}`;
          setSpotifyStatus(trackInfo);
          // Automatically update user's status with current track
          setFormData(prev => ({ ...prev, status: trackInfo }));
        }
      }
    } catch (err) {
      console.error('Error fetching Spotify status:', err);
    }
  };

  // Connect Spotify account
  const handleSpotifyConnect = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('Please log in first');
      return;
    }
    
    try {
      // Make a GET request to the Spotify auth endpoint with Authorization header
      const response = await fetch('http://localhost:8001/auth/spotify', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.text();
        window.location.href = data; // Redirect to Spotify auth URL
      } else {
        throw new Error('Failed to initialize Spotify authorization');
      }
    } catch (err) {
      console.error('Spotify connection error:', err);
      toast.error('Failed to connect to Spotify');
    }
  };

  // Start polling for track updates when component mounts
  useEffect(() => {
    if (isSpotifyConnected) {
      fetchCurrentTrack();
      statusInterval.current = setInterval(fetchCurrentTrack, 30000); // Update every 30 seconds
    }

    return () => {
      if (statusInterval.current) {
        clearInterval(statusInterval.current);
      }
    };
  }, [isSpotifyConnected]);

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

  const spotifyConfig = {
    clientId: process.env.e35444cbe2034a12a2c624ef0d92ec65,
    clientSecret: process.env.afd4baa7041f4f3e880bf55401b1e850,
    redirectUri: 'http://localhost:8001/auth/spotify/callback'
  };
  
  module.exports = spotifyConfig;

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

        {/* Spotify Integration */}
        <div className="mt-6 border-t border-gray-700 pt-6">
          <h3 className="text-xl font-semibold text-white mb-4">Spotify Integration</h3>
          
          {!isSpotifyConnected ? (
            <button
              onClick={handleSpotifyConnect}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors flex items-center"
            >
              <svg className="w-6 h-6 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
              Connect Spotify
            </button>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-green-400">✓ Spotify Connected</span>
              </div>
              {currentTrack && (
                <div className="bg-gray-700 p-3 rounded">
                  <p className="text-white mb-2">Currently Playing:</p>
                  <div className="flex items-center">
                    {currentTrack.albumArt && (
                      <img 
                        src={currentTrack.albumArt} 
                        alt="Album Art" 
                        className="w-12 h-12 rounded mr-3"
                      />
                    )}
                    <div>
                      <p className="text-white font-medium">{currentTrack.name}</p>
                      <p className="text-gray-400">{currentTrack.artist}</p>
                    </div>
                  </div>
                  <button
                    onClick={updateStatusWithTrack}
                    className="mt-3 bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600 transition-colors"
                  >
                    Set as Status
                  </button>
                </div>
              )}
            </div>
          )}
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