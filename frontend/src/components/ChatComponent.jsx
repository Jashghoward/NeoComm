"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import ProfileComponent from "./ProfileComponent";
import { toast } from "react-hot-toast";

const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23CBD5E0' d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/%3E%3C/svg%3E";

const ChatComponent = ({ user: initialUser }) => {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState(initialUser);
  const [friends, setFriends] = useState([]);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [newFriendEmail, setNewFriendEmail] = useState('');
  const [isSpotifyConnected, setIsSpotifyConnected] = useState(false);
  
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const retryTimeoutRef = useRef(null);

  // Helper function to truncate status
  const truncateStatus = useCallback((status, maxLength = 20) => {
    if (!status) return '';
    return status.length > maxLength ? status.substring(0, maxLength) + '...' : status;
  }, []);

  // Profile Image component with client-side rendering
  const ProfileImage = ({ src, size = "w-12 h-12" }) => {
    if (!mounted) return null;

    return (
      <div className={`relative ${size}`}>
        <img
          src={src || DEFAULT_AVATAR}
          alt="Profile"
          className="rounded-full object-cover w-full h-full"
          onError={(e) => {
            if (e.target.src !== DEFAULT_AVATAR) {
              e.target.src = DEFAULT_AVATAR;
            }
          }}
        />
      </div>
    );
  };

  // Memoize fetchFriendsWithRetry to prevent recreation on every render
  const fetchFriendsWithRetry = useCallback(async (retryCount = 0) => {
    if (!mounted || !user?.id) return;

    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`http://localhost:8001/friends/${user.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: 'Failed to parse error response' };
        }
        throw new Error(errorData.error || `Failed to fetch friends: ${response.status}`);
      }

      const data = await response.json();
      setFriends(data);
      setError('');

      if (selectedFriend) {
        const updatedSelectedFriend = data.find(f => f.id === selectedFriend.id);
        if (updatedSelectedFriend) {
          setSelectedFriend(updatedSelectedFriend);
        }
      }
    } catch (err) {
      console.error('Error fetching friends:', err);
      setError(err.message || 'Failed to load friends');
    } finally {
      setIsLoading(false);
    }
  }, [mounted, user?.id, selectedFriend?.id]); // Minimal dependencies

  // Mount effect
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []); // Empty dependency array as this should only run once

  // Socket connection effect with better message handling
  useEffect(() => {
    if (!mounted || !user?.id) return;

    const socket = io("http://localhost:8001", {
      transports: ["websocket"],
      auth: { token: localStorage.getItem('token') }
    });

    socket.on("receiveMessage", (message) => {
      setMessages(prevMessages => {
        // Prevent duplicate messages
        if (prevMessages.some(m => m.id === message.id)) {
          return prevMessages;
        }
        
        // Only add message if it's relevant to current chat
        if (selectedFriend && 
            ((message.sender_id === selectedFriend.id && message.receiver_id === user.id) || 
             (message.sender_id === user.id && message.receiver_id === selectedFriend.id))) {
          const newMessages = [...prevMessages, message];
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
          return newMessages;
        }
        return prevMessages;
      });
    });

    socketRef.current = socket;

    return () => {
      socket.off("receiveMessage");
      socket.disconnect();
    };
  }, [mounted, user?.id, selectedFriend?.id]);

  // Friends fetch effect with cleanup
  useEffect(() => {
    let isMounted = true;
    let intervalId;

    const fetchFriends = async () => {
      if (!isMounted || !user?.id || !mounted) return;
      await fetchFriendsWithRetry();
    };

    fetchFriends();
    intervalId = setInterval(fetchFriends, 30000); // 30 seconds interval

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      clearTimeout(retryTimeoutRef.current);
    };
  }, [user?.id, mounted]); // Remove fetchFriendsWithRetry from dependencies

  // Messages fetch effect
  useEffect(() => {
    let isMounted = true;

    const fetchMessages = async () => {
      if (!selectedFriend || !isMounted) return;

      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`http://localhost:8001/messages/${selectedFriend.id}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) throw new Error('Failed to fetch messages');
        const data = await response.json();
        if (isMounted) {
          setMessages(data);
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      } catch (err) {
        console.error('Error fetching messages:', err);
      }
    };

    fetchMessages();

    return () => {
      isMounted = false;
    };
  }, [selectedFriend?.id]); // Only depend on selectedFriend.id

  // Check for Spotify connection status in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const spotifyStatus = urlParams.get('spotify');
    
    if (spotifyStatus === 'connected') {
      // Show success message
      toast.success('Successfully connected to Spotify!');
      setIsSpotifyConnected(true);
    } else if (spotifyStatus === 'error') {
      // Show error message
      toast.error('Failed to connect to Spotify');
    }
    
    // Clean up URL
    if (spotifyStatus) {
      window.history.replaceState({}, document.title, '/chat');
    }
  }, []);

  // Render loading state
  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  // Show loading state
  if (isLoading && friends.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-white">Loading friends...</div>
      </div>
    );
  }

  // Add friend function with better error handling and logging
  const addFriend = async () => {
    if (!newFriendEmail.trim()) {
      setError('Please enter an email address');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      console.log('Adding friend with email:', newFriendEmail);
      console.log('Current user ID:', user.id);

      const response = await fetch('http://localhost:8001/friends/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: user.id,
          email: newFriendEmail
        })
      });

      console.log('Add friend response status:', response.status);
      const data = await response.json();
      console.log('Add friend response data:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add friend');
      }

      // Refresh friends list after adding
      const friendsResponse = await fetch(`http://localhost:8001/friends/${user.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!friendsResponse.ok) {
        throw new Error('Failed to refresh friends list');
      }

      const friendsData = await friendsResponse.json();
      console.log('Updated friends list:', friendsData);
      setFriends(friendsData);
      
      setNewFriendEmail('');
      setShowAddFriend(false);
      setError('');
    } catch (err) {
      console.error('Error adding friend:', err);
      setError(err.message || 'Failed to add friend');
    }
  };

  // Simplified send message function
  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedFriend) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8001/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          receiver_id: selectedFriend.id,
          content: newMessage
        })
      });

      if (!response.ok) throw new Error('Failed to send message');
      setNewMessage(''); // Clear input immediately after sending
      
      // Don't manually add the message - wait for socket event
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err.message || 'Failed to send message');
    }
  };

  // Handle profile update
  const handleProfileUpdate = (updatedProfile) => {
    console.log('Profile updated:', updatedProfile);
    setUser(prevUser => ({
      ...prevUser,
      ...updatedProfile
    }));
    setShowProfile(false);
  };

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Profile Modal */}
      {showProfile && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowProfile(false);
            }
          }}
        >
          <div className="bg-gray-900 p-6 rounded-lg max-w-md w-full">
            <ProfileComponent 
              user={user} 
              onUpdate={handleProfileUpdate}
              onClose={() => setShowProfile(false)}
            />
          </div>
        </div>
      )}

      {/* Friends List Sidebar */}
      <div className="w-1/4 border-r border-gray-800 p-4">
        {/* Profile Icon and User Info */}
        <div className="flex items-center p-4 border-t border-gray-700">
          <button
            className="flex items-center w-full hover:bg-gray-700 p-2 rounded-lg transition-colors"
            onClick={() => setShowProfile(true)}
          >
            <ProfileImage src={user?.profile_picture || DEFAULT_AVATAR} />
            <div className="ml-3">
              <div className="text-white font-semibold">{user?.username}</div>
              <div className="text-gray-400 text-sm">{truncateStatus(user?.status || '')}</div>
            </div>
          </button>
        </div>

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl text-white font-bold">Friends</h2>
          <button
            onClick={() => setShowAddFriend(!showAddFriend)}
            className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
          >
            Add Friend
          </button>
        </div>

        {error && (
          <div className="mb-4 p-2 bg-red-500/10 border border-red-500 rounded text-red-400">
            {error}
          </div>
        )}

        {showAddFriend && (
          <div className="mb-4">
            <input
              type="email"
              value={newFriendEmail}
              onChange={(e) => setNewFriendEmail(e.target.value)}
              placeholder="Friend's email"
              className="w-full p-2 rounded bg-gray-800 text-white mb-2"
            />
            <button
              onClick={addFriend}
              className="w-full bg-green-500 text-white p-2 rounded hover:bg-green-600"
            >
              Add
            </button>
          </div>
        )}

        <div className="space-y-2">
          {friends.map(friend => (
            <div
              key={friend.id}
              onClick={() => setSelectedFriend(friend)}
              className={`p-3 rounded cursor-pointer flex items-center ${
                selectedFriend?.id === friend.id ? 'bg-blue-600' : 'bg-gray-800'
              } hover:bg-blue-500 transition-colors duration-200`}
            >
              <ProfileImage src={friend.profile_picture} size="w-10 h-10" />
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-white font-medium truncate">
                  {friend.username || friend.email}
                </p>
                <p className="text-gray-400 text-sm truncate">
                  {truncateStatus(friend.status, 15)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedFriend ? (
          <>
            {/* Chat Header */}
            <div className="p-4 bg-gray-800 border-b border-gray-700 flex items-center">
              <ProfileImage src={selectedFriend.profile_picture} size="w-10 h-10" />
              <div className="ml-3">
                <h3 className="text-white font-semibold">
                  {selectedFriend.username || selectedFriend.email}
                </h3>
                <p className="text-gray-400 text-sm">
                  {truncateStatus(selectedFriend.status)}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 p-4 overflow-y-auto bg-gray-900">
              {messages.map((message, index) => (
                <div
                  key={`${message.id}-${index}`}
                  className={`mb-4 ${
                    message.sender_id === user.id ? 'text-right' : 'text-left'
                  }`}
                >
                  <div
                    className={`inline-block p-3 rounded-lg ${
                      message.sender_id === user.id
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-700 text-white'
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 bg-gray-800">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 p-2 rounded bg-gray-700 text-white"
                />
                <button
                  onClick={sendMessage}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            Select a friend to start chatting
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatComponent;
