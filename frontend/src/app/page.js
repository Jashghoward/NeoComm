// pages/index.js
'use client';
import { useState, useEffect } from "react";
import { useRouter } from 'next/navigation';
import ChatComponent from "../components/ChatComponent";

export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    // Fetch user profile
    fetch('http://localhost:8001/profile', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(res => {
      if (!res.ok) throw new Error('Auth failed');
      return res.json();
    })
    .then(userData => {
      console.log('User data loaded:', userData);
      setUser(userData);
      setLoading(false);
    })
    .catch(err => {
      console.error('Error loading user:', err);
      localStorage.removeItem('token');
      router.push('/login');
    });
  }, []);

  if (loading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="h-screen bg-black">
      <ChatComponent user={user} />
    </div>
  );
}
