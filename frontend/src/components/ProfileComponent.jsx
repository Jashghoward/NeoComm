"use client";
import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import CalendarIntegration from './CalendarIntegration';

const ProfileComponent = ({ user, onUpdate, onClose }) => {
  const [formData, setFormData] = useState({
    username: user.username || '',
    status: user.status || '',
    profile_picture: null
  });
  const [error, setError] = useState('');
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

  // Update the updateStatusWithTrack function
  const updateStatusWithTrack = async () => {
    if (currentTrack) {
      const trackStatus = `🎵 ${currentTrack.name} - ${currentTrack.artist}`;
      setFormData(prev => ({ ...prev, status: trackStatus }));
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:8001/profile/update', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status: trackStatus })
        });

        if (!response.ok) {
          throw new Error('Failed to update status');
        }

        const updatedProfile = await response.json();
        onUpdate(updatedProfile);
        toast.success('Status updated with current track!');
      } catch (err) {
        console.error('Error updating status:', err);
        toast.error('Failed to update status');
      }
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

  // Fix the handleSubmit function
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const formDataToSend = new FormData();
      
      if (formData.username) {
        formDataToSend.append('username', formData.username);
      }
      if (formData.status) {
        formDataToSend.append('status', formData.status);
      }
      if (formData.profile_picture) {
        formDataToSend.append('profile_picture', formData.profile_picture);
      }

      const response = await fetch('http://localhost:8001/profile/update', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formDataToSend
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update profile');
      }

      const updatedProfile = await response.json();
      onUpdate(updatedProfile);
      onClose();
      toast.success('Profile updated successfully!');
    } catch (err) {
      console.error('Profile update error:', err);
      toast.error(err.message || 'Failed to update profile');
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-lg w-full max-w-4xl my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">Profile Settings</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Profile Picture */}
              <div className="text-center">
                <div className="relative w-32 h-32 mx-auto mb-4">
                  <img
                    src={previewUrl || user.profile_picture || '/default-avatar.png'}
                    alt="Profile"
                    className="rounded-full w-full h-full object-cover border-4 border-gray-700"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 bg-blue-500 rounded-full p-2 hover:bg-blue-600 transition-colors"
                  >
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              {/* Profile Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-gray-300 mb-2">Username</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                    className="w-full p-3 bg-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 mb-2">Status</label>
                  <input
                    type="text"
                    value={formData.status}
                    onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full p-3 bg-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="What's on your mind?"
                  />
                </div>

                <div className="flex space-x-4">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex-1 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
                  >
                    Logout
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column - Integrations */}
            <div className="space-y-6">
              {/* Spotify Integration */}
              <div className="bg-gray-700 p-6 rounded-lg">
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

              {/* Calendar Integration */}
              <div className="bg-gray-700 p-6 rounded-lg">
                <h3 className="text-xl font-semibold text-white mb-4">Calendar Integration</h3>
                <CalendarIntegration user={user} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileComponent;