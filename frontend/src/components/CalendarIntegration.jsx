"use client";
import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

const CalendarIntegration = ({ user }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkCalendarConnection();
  }, []);

  const checkCalendarConnection = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8001/calendar/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setIsConnected(data.isConnected);
      if (data.isConnected) {
        fetchUpcomingEvents();
      }
    } catch (err) {
      console.error('Error checking calendar status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectCalendar = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8001/auth/google', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      window.location.href = data.url;
    } catch (err) {
      console.error('Error connecting to calendar:', err);
      toast.error('Failed to connect to Google Calendar');
    }
  };

  const fetchUpcomingEvents = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8001/calendar/events', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setUpcomingEvents(data.events);
    } catch (err) {
      console.error('Error fetching events:', err);
      toast.error('Failed to fetch calendar events');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-100"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!isConnected ? (
        <button
          onClick={handleConnectCalendar}
          className="bg-white text-gray-900 px-4 py-2 rounded hover:bg-gray-100 transition-colors flex items-center space-x-2"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM7 11h5v5H7z"/>
          </svg>
          <span>Connect Google Calendar</span>
        </button>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-green-400">✓ Calendar Connected</span>
              <a 
                href="/calendar"
                className="ml-4 text-blue-400 hover:text-blue-300 flex items-center space-x-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Open Calendar</span>
              </a>
            </div>
          </div>
          
          {upcomingEvents.length > 0 && (
            <div className="mt-4">
              <h4 className="text-white font-medium mb-2">Next Event</h4>
              <div className="bg-gray-600 p-3 rounded">
                <div className="text-white font-medium">{upcomingEvents[0].summary}</div>
                <div className="text-gray-300 text-sm">
                  {new Date(upcomingEvents[0].start.dateTime).toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CalendarIntegration; 