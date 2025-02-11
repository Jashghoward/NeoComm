"use client";
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-hot-toast';
import ChatComponent from '@/components/ChatComponent';

export default function ChatPage() {
  const searchParams = useSearchParams();
  const spotifyStatus = searchParams.get('spotify');

  useEffect(() => {
    if (spotifyStatus === 'connected') {
      toast.success('Successfully connected to Spotify!');
    } else if (spotifyStatus === 'error') {
      toast.error('Failed to connect to Spotify');
    }
  }, [spotifyStatus]);

  return <ChatComponent />;
} 